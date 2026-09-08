// Slime Story shared fire/environment runtime.
// Extracted from game.js in v6-11-239 with function bodies preserved verbatim.
// Classic-script semantics are intentional: these declarations resolve the existing
// world, combat, status, action, and networking bindings at invocation time.

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

  const burnDuration = isTemporaryRainGrass(clump)
    ? TEMP_RAIN_GRASS_BURN_DURATION
    : Math.max(0.1, Number(clump.burnDuration) || 1.05);

  clump.burnDuration = burnDuration;
  clump.burnTime = burnDuration;
  if (isTemporaryRainGrass(clump)) {
    clump.burnExpiresAtMs = Date.now() + burnDuration * 1000;
  }

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
  radius = 12,
  options = {}
) {
  const temporaryGrassChance = Math.max(
    0,
    Math.min(1, Number(options.temporaryGrassChance) || 1)
  );
  const temporaryGrassMaxIgnitions = Number.isFinite(options.temporaryGrassMaxIgnitions)
    ? Math.max(1, Math.floor(options.temporaryGrassMaxIgnitions))
    : Infinity;
  let temporaryGrassIgnitions = 0;
  const serverOwnsEnvironment =
    typeof onlineClient !== "undefined" && Boolean(onlineClient?.connected);

  // In v260 the server owns deterministic Rain Field cells. Online clients
  // request one ignition near the impact and wait for a compact field delta.
  // Offline mode still runs the complete local fallback.
  if (!serverOwnsEnvironment) {
    for (const clump of tallGrass) {
      if (!isTemporaryRainGrass(clump) || !temporaryRainGrassCellIsAlive(clump)) continue;

      const dx = clump.x - x;
      const dy = (clump.y - 5) - y;

      if (
        dx * dx + dy * dy <= radius * radius &&
        Math.random() <= temporaryGrassChance
      ) {
        igniteGrass(clump);
        temporaryGrassIgnitions += 1;
        if (temporaryGrassIgnitions >= temporaryGrassMaxIgnitions) break;
      }
    }
  }

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
    if (clump.cut || isTemporaryRainGrass(clump)) continue;

    const dx = clump.x - x;
    const dy = (clump.y - 5) - y;

    if (
      dx * dx + dy * dy <=
      radius * radius
    ) {
      igniteGrass(clump);
    }
  }

  for (const flower of harvestFlowers) {
    if (flower.cut || flower.burnt) continue;

    const dx = flower.x - x;
    const dy = (flower.y - 8) - y;

    if (
      dx * dx + dy * dy <=
      radius * radius
    ) {
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


function isNearBurningTemporaryRainGrass(x, y, radius = 13) {
  for (const clump of tallGrass) {
    if (
      !isTemporaryRainGrass(clump) ||
      !temporaryRainGrassCellIsAlive(clump) ||
      (Number(clump.burnTime) || 0) <= 0
    ) {
      continue;
    }

    const dx = x - clump.x;
    const dy = y - (clump.y - 5);

    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
  }

  return false;
}

function spreadTemporaryRainGrassFireToLiving() {
  const burningTemporaryGrass = tallGrass.filter(clump =>
    isTemporaryRainGrass(clump) &&
    !clump.cut &&
    (Number(clump.burnTime) || 0) > 0
  );

  if (burningTemporaryGrass.length === 0) {
    return;
  }

  // Directly standing in burning grass is deterministic. Randomness still
  // governs fire jumping between nearby sources, but contact itself should
  // never feel unreliable.
  for (
    const { enemy }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if ((Number(enemy.burnTime) || 0) > 0) continue;

    const body = enemyBodyPoint(enemy);

    for (const clump of burningTemporaryGrass) {
      const dx = body.x - clump.x;
      const dy = body.y - (clump.y - 5);
      const radius = 14;

      if (dx * dx + dy * dy <= radius * radius) {
        igniteEnemyFromSpread(enemy);

        break;
      }
    }
  }

}

function spreadFireFromBurningSources() {
  // Snapshot the currently burning sources first. Anything ignited by this
  // pulse has to wait until a later pulse before it can spread again, which
  // keeps chain reactions readable instead of instantaneous.
  const sources = [];

  for (const clump of tallGrass) {
    if (clump.burnTime > 0 && !clump.cut) {
      const magicGrassSource = isTemporaryRainGrass(clump);
      sources.push({
        x: clump.x,
        y: clump.y - 5,
        radius: magicGrassSource ? TEMP_RAIN_GRASS_CHAIN_RADIUS : 17,
        chance: magicGrassSource ? TEMP_RAIN_GRASS_CHAIN_SOURCE_CHANCE : 0.58,
        magicGrassSource
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
        source.radius,
        source.magicGrassSource
          ? {
              temporaryGrassChance: TEMP_RAIN_GRASS_CHAIN_TARGET_CHANCE,
              temporaryGrassMaxIgnitions: TEMP_RAIN_GRASS_CHAIN_MAX_IGNITIONS
            }
          : {}
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
      spreadTemporaryRainGrassFireToLiving();
      spreadFireFromBurningSources();
    }
    // Online mode has no client spread pass in v253. Persistent vegetation,
    // magic grass, mobs and players are all evaluated by the server at 2 Hz.
  }

  // Temporary rain-cloud grass lingers long enough to set up fire combos,
  // then quietly disappears. It never permanently regrows into the map.
  for (let i = tallGrass.length - 1; i >= 0; i--) {
    const clump = tallGrass[i];

    if (!isTemporaryRainGrass(clump)) continue;

    if (Number.isFinite(Number(clump.tempExpiresAtMs))) {
      clump.tempLife = Math.max(
        0,
        (Number(clump.tempExpiresAtMs) - Date.now()) / 1000
      );
    } else {
      clump.tempLife = Math.max(0, Number(clump.tempLife) - dt);
    }

    if (clump.tempLife <= 0) {
      tallGrass.splice(i, 1);
    }
  }

  const nowMs = Date.now();
  if (typeof temporaryRainGrassFields !== "undefined") {
    for (const [key, field] of temporaryRainGrassFields) {
      if (Number(field?.expiresAtMs) > 0 && nowMs >= Number(field.expiresAtMs)) {
        temporaryRainGrassFields.delete(key);
      }
    }
  }

  // Burn grass down into dark stubble.
  for (const clump of tallGrass) {
    if (clump.burnTime > 0) {
      if (
        isTemporaryRainGrass(clump) &&
        Number.isFinite(Number(clump.burnExpiresAtMs)) &&
        Number(clump.burnExpiresAtMs) > 0
      ) {
        clump.burnTime = Math.max(
          0,
          (Number(clump.burnExpiresAtMs) - Date.now()) / 1000
        );
      } else {
        clump.burnTime -= dt;
      }

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

        if (isTemporaryRainGrass(clump) && clump.serverBurnWillConsume) {
          clump.cut = true;
          clump.burnt = true;
          clump.serverBurnWillConsume = false;
          clump.burnExpiresAtMs = 0;

          if (clump.fieldControlled && typeof temporaryRainGrassFields !== "undefined") {
            const field = temporaryRainGrassFields.get(
              temporaryRainGrassFieldKey(temporaryRainGrassOwnerId(clump), clump.grassPatchId)
            );
            if (field) {
              const bit = RAIN_FIELD.cellBit(Math.max(0, Number(clump.fieldCellIndex) || 0));
              field.burningMask = ((Number(field.burningMask) >>> 0) & ~bit) >>> 0;
              field.burntMask = ((Number(field.burntMask) >>> 0) | bit) >>> 0;
            }
          }
        } else if (!clump.serverControlled) {
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

  // Update projectiles.
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fireball = fireballs[i];

    fireball.life -= dt;
    fireball.trailTimer -= dt;

    if (fireball.airborne) {
      fireball.elapsed = Math.min(
        Number(fireball.duration) || 0.4,
        (Number(fireball.elapsed) || 0) + dt
      );

      const duration = Math.max(0.001, Number(fireball.duration) || 0.4);
      let progress = Math.max(0, Math.min(1, fireball.elapsed / duration));
      const previousX = fireball.x;
      const previousY = fireball.y;
      fireball.x = fireball.startX + (fireball.targetX - fireball.startX) * progress;
      fireball.y = fireball.startY + (fireball.targetY - fireball.startY) * progress;

      const wallImpact = typeof structureWallImpactPoint === "function"
        ? structureWallImpactPoint(previousX, previousY, fireball.x, fireball.y, 1)
        : null;
      if (wallImpact) {
        fireball.x = wallImpact.x;
        fireball.y = wallImpact.y;
        fireball.targetX = wallImpact.x;
        fireball.targetY = wallImpact.y;
        fireball.elapsed = duration;
        progress = 1;
      }

      if (fireball.trailTimer <= 0) {
        fireball.trailTimer = 0.035;
        const visualY = fireballVisualY(fireball);
        spawnFireParticle(
          fireball.x + (Math.random() - 0.5) * 2,
          visualY + (Math.random() - 0.5) * 2,
          -Math.cos(fireball.angle || 0) * 5 + (Math.random() - 0.5) * 4,
          -4 - Math.random() * 5,
          0.18 + Math.random() * 0.10
        );
      }

      if (fireball.visualOnly) {
        if (progress >= 1 || fireball.life <= 0) {
          fireballs.splice(i, 1);
        }
        continue;
      }

      if (progress < 1 && fireball.life > 0) {
        continue;
      }

      // v396: aimed Fireballs still resolve at a landing point, but a solid
      // player-built wall can shorten that flight and become the landing point.
      igniteVegetationNear(fireball.targetX, fireball.targetY, 12);

      let nearestEnemy = null;
      let nearestDistanceSq = Infinity;

      for (
        const { enemy, profile }
        of activeEnemyRecords({ aliveOnly: true })
      ) {
        const body = enemyBodyPoint(enemy);
        const dx = fireball.targetX - body.x;
        const dy = fireball.targetY - body.y;
        const bodyPadding = Math.max(0, (profile.projectileHitRadius ?? 8) - 5);
        const hitRadius = FIREBALL_LANDING_RADIUS + bodyPadding;
        const distanceSq = dx * dx + dy * dy;

        if (
          distanceSq <= hitRadius * hitRadius &&
          distanceSq < nearestDistanceSq &&
          (typeof structureLineOfEffectClear !== "function" ||
            structureLineOfEffectClear(
              fireball.targetX + (body.x - fireball.targetX) * 0.08,
              fireball.targetY + (body.y - fireball.targetY) * 0.08,
              body.x,
              body.y,
              0.5
            ))
        ) {
          nearestEnemy = enemy;
          nearestDistanceSq = distanceSq;
        }
      }


      if (nearestEnemy) {
        damageEnemyWithProjectile(
          nearestEnemy,
          fireball,
          "fireball"
        );
      }

      spawnFireballImpactBurst(fireball.targetX, fireball.targetY);

      if (typeof onlineClient !== "undefined") {
        onlineClient.sendVisualEffect(
          "fireballImpact",
          {
            x: fireball.targetX,
            y: fireball.targetY,
            primaryEnemyId: nearestEnemy?.entityId || null
          }
        );
      }

      fireballs.splice(i, 1);
      continue;
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
  // Fireballs: bright, compact moving lights.
  for (let i = 0; i < fireballs.length; i++) {
    const fireball = fireballs[i];
    drawPixelGlow(
      fireball.x - camX,
      fireballVisualY(fireball) - camY,
      11,
      0.20,
      i * 1.8
    );
  }

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
