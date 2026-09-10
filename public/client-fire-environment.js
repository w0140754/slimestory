// Slime Story shared fire/environment runtime.
// Extracted from game.js in v6-11-239 with function bodies preserved verbatim.
// Classic-script semantics are intentional: these declarations resolve the existing
// world, combat, status, and networking bindings at invocation time.

function spawnFireParticle(x, y, vx = 0, vy = -8, life = 0.28) {
  fireParticles.push({
    x,
    y,
    vx,
    vy,
    life,
    maxLife: life
  });
}

function igniteGrass(clump) {
  if (clump.cut || clump.burnTime > 0) return;

  const burnDuration = Math.max(0.1, Number(clump.burnDuration) || 1.05);
  clump.burnDuration = burnDuration;
  clump.burnTime = burnDuration;
}

function igniteHarvestFlower(flower) {
  if (flower.cut || flower.burnt || flower.burnTime > 0) return;

  flower.burnTime = flower.burnDuration;
  // If fire destroys it, it should not produce a loot drop.
  flower.looted = true;
}

function igniteTreeCanopy(tree) {
  if (
    tree.fireImmune ||
    tree.isStump ||
    tree.falling ||
    tree.canopyBurned ||
    tree.canopyBurnTime > 0
  ) return;

  tree.canopyBurnTime = tree.canopyBurnDuration;
}

function igniteVegetationNear(
  x,
  y,
  radius = 12
) {
  if (
    typeof onlineClient !== "undefined" &&
    onlineClient.sendEnvironmentAction(
      "igniteNear",
      null,
      { x, y, radius }
    )
  ) {
    return;
  }

  // Offline fallback.
  for (const clump of tallGrass) {
    if (clump.cut) continue;

    const dx = clump.x - x;
    const dy = (clump.y - 5) - y;

    if (dx * dx + dy * dy <= radius * radius) {
      igniteGrass(clump);
    }
  }

  for (const flower of harvestFlowers) {
    if (flower.cut || flower.burnt) continue;

    const dx = flower.x - x;
    const dy = (flower.y - 8) - y;

    if (dx * dx + dy * dy <= radius * radius) {
      igniteHarvestFlower(flower);
    }
  }

  for (const tree of trees) {
    if (
      tree.isStump ||
      tree.falling ||
      tree.canopyBurned
    ) {
      continue;
    }

    const dx = tree.x - x;
    const dy = (tree.y - 28) - y;

    if (
      dx * dx + dy * dy <=
      (radius + 13) * (radius + 13)
    ) {
      igniteTreeCanopy(tree);
    }
  }
}

function ignitePlayerFromSpread() {
  // Player status is authoritative online state. Keep disconnected fire as a
  // harmless local world visual, but never invent a Burned status locally.
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient?.connected ||
    player.burnTime > 0
  ) {
    return;
  }

  applyLocalBurnStatus(player, player.burnDuration);
}

function igniteLivingNear(x, y, radius = 14) {
  for (
    const { enemy }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    const body = enemyBodyPoint(enemy);
    const dx = body.x - x;
    const dy = body.y - y;

    if (
      dx * dx + dy * dy <=
      radius * radius
    ) {
      igniteEnemyFromSpread(enemy);
    }
  }

  const pdx = player.x - x;
  const pdy = (player.y - 8) - y;

  if (pdx * pdx + pdy * pdy <= radius * radius) {
    ignitePlayerFromSpread();
  }
}


function spreadFireFromBurningSources() {
  // Snapshot the currently burning sources first. Anything ignited by this
  // pulse has to wait until a later pulse before it can spread again, which
  // keeps chain reactions readable instead of instantaneous.
  const sources = [];

  for (const clump of tallGrass) {
    if (clump.burnTime > 0 && !clump.cut) {
      sources.push({
        x: clump.x,
        y: clump.y - 5,
        radius: 17,
        chance: 0.58
      });
    }
  }

  for (const flower of harvestFlowers) {
    if (flower.burnTime > 0 && !flower.cut) {
      sources.push({ x: flower.x, y: flower.y - 8, radius: 16, chance: 0.60 });
    }
  }

  for (const tree of trees) {
    if (tree.canopyBurnTime > 0 && !tree.canopyBurned) {
      // Use the lower half of the canopy as the spread origin so nearby ground
      // vegetation can actually catch from a burning tree.
      sources.push({ x: tree.x, y: tree.y - 18, radius: 20, chance: 0.48 });
    }
  }

  // Burning monsters can carry fire into vegetation as they move through it.
  for (
    const { enemy, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if (enemy.burnTime <= 0) continue;

    const body = enemyBodyPoint(enemy);

    sources.push({
      x: body.x,
      y: body.y,
      radius: 13,
      chance: profile.burnSpreadChance ?? 0.42
    });
  }

  if (player.burnTime > 0) {
    sources.push({ x: player.x, y: player.y - 8, radius: 13, chance: 0.42 });
  }

  for (const source of sources) {
    if (Math.random() <= source.chance) {
      igniteVegetationNear(
        source.x,
        source.y,
        source.radius
      );
      igniteLivingNear(source.x, source.y, Math.max(11, source.radius - 1));
    }
  }
}

function sootheHarvestFlower(flower) {
  flower.burnTime = 0;
}

function updateFire(dt) {
  fireSpreadTimer += dt;

  if (fireSpreadTimer >= FIRE_SPREAD_INTERVAL) {
    fireSpreadTimer = 0;

    if (
      !onlineClient ||
      !onlineClient.connected
    ) {
      // Offline mode still owns the complete local fire simulation.
      spreadFireFromBurningSources();
    }
    // Online mode has no client spread pass. Persistent vegetation, mobs and
    // players are evaluated by the server at 2 Hz.
  }

  // Burn grass down into dark stubble.
  for (const clump of tallGrass) {
    if (clump.burnTime > 0) {
      clump.burnTime -= dt;

      if (Math.random() < dt * 8) {
        spawnFireParticle(
          clump.x + (Math.random() - 0.5) * 7,
          clump.y - 7,
          (Math.random() - 0.5) * 5,
          -7 - Math.random() * 7,
          0.24 + Math.random() * 0.18
        );
      }

      if (clump.burnTime <= 0) {
        clump.burnTime = 0;

        if (!clump.serverControlled) {
          clump.cut = true;
          clump.burnt = true;
          clump.regrowAt = 0;
        }
      }
    }
  }

  // Burn larger harvestable flowers down into charred stubble.
  for (const flower of harvestFlowers) {
    if (flower.burnTime > 0) {
      flower.burnTime -= dt;

      if (Math.random() < dt * 9) {
        spawnFireParticle(
          flower.x + (Math.random() - 0.5) * 6,
          flower.y - 10 + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
          -6 - Math.random() * 6,
          0.22 + Math.random() * 0.16
        );
      }

      if (flower.burnTime <= 0) {
        flower.burnTime = 0;

        if (!flower.serverControlled) {
          flower.cut = true;
          flower.burnt = true;
          flower.looted = true;
        }
      }
    }
  }

  // Burn only the canopy off a tree. The trunk survives for chopping.
  for (const tree of trees) {
    if (tree.canopyBurnTime > 0) {
      tree.canopyBurnTime -= dt;

      if (Math.random() < dt * 11) {
        spawnFireParticle(
          tree.x + (Math.random() - 0.5) * 22,
          tree.y - 30 + (Math.random() - 0.5) * 13,
          (Math.random() - 0.5) * 6,
          -7 - Math.random() * 8,
          0.26 + Math.random() * 0.22
        );
      }

      if (tree.canopyBurnTime <= 0) {
        tree.canopyBurnTime = 0;

        if (!tree.serverControlled) {
          tree.canopyBurned = true;
          scheduleLocalTreeRegrow(tree);
        }

        // Little final ember scatter.
        for (let i = 0; i < 8; i++) {
          spawnFireParticle(
            tree.x + (Math.random() - 0.5) * 20,
            tree.y - 28 + (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 13,
            -5 - Math.random() * 12,
            0.35 + Math.random() * 0.25
          );
        }
      }
    }
  }

  // Tiny trail / ember particles.
  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 5 * dt;

    if (p.life <= 0) {
      fireParticles.splice(i, 1);
    }
  }
}

function drawFireParticles(camX, camY) {
  for (const p of fireParticles) {
    const x = Math.round(p.x - camX);
    const y = Math.round(p.y - camY);
    const pct = p.life / p.maxLife;

    ctx.fillStyle =
      pct > 0.66 ? "#ffcc49" :
      pct > 0.32 ? "#e9602a" :
                   "#8f3928";

    ctx.fillRect(x, y, pct > 0.7 ? 2 : 1, pct > 0.7 ? 2 : 1);
  }
}

function drawFireLighting(camX, camY) {
  // Burning grass: small pool of light near the ground.
  for (const clump of tallGrass) {
    if (clump.burnTime <= 0 || clump.cut) continue;

    drawPixelGlow(
      clump.x - camX,
      clump.y - camY - 4,
      8,
      0.11,
      clump.phase
    );
  }

  // Burning harvestable flowers: slightly taller, tighter glow.
  for (const flower of harvestFlowers) {
    if (flower.burnTime <= 0 || flower.cut) continue;

    drawPixelGlow(
      flower.x - camX,
      flower.y - camY - 8,
      8,
      0.10,
      flower.phase
    );
  }

  // Burning canopies: wider, softer light.
  for (const tree of trees) {
    if (tree.canopyBurnTime <= 0 || tree.canopyBurned) continue;

    drawPixelGlow(
      tree.x - camX,
      tree.y - camY - 28,
      17,
      0.12,
      tree.phase
    );

    // Very faint light on the ground beneath the canopy.
    drawPixelGlow(
      tree.x - camX + 2,
      tree.y - camY - 3,
      10,
      0.055,
      tree.phase + 2.1
    );
  }

  // Burning monsters carry their light around.
  for (
    const { enemy, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if (enemy.burnTime <= 0) continue;

    drawPixelGlow(
      enemy.x - camX,
      enemy.y - camY +
        (profile.burnGlowOffsetY || 0),
      profile.burnGlowRadius || 10,
      profile.burnGlowAlpha || 0.12,
      enemy.phase || 0
    );
  }

  if (player.burnTime > 0) {
    drawPixelGlow(
      player.x - camX,
      player.y - camY - 10,
      10,
      0.12,
      worldTime * 1.4
    );
  }
}
