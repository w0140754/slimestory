// Slime Story client combat foundation
// Extracted from game.js in v6-11-233 without behavior changes.
// Classic script on purpose: these functions share the same global lexical
// environment as game.js and resolve runtime state when invoked.

function spawnRemoteBasicProjectileImpact(
  ownerId,
  payload
) {
  const x = Number(payload.x) || 0;
  const y = Number(payload.y) || 0;

  const projectileType =
    payload.projectileType === "rainWand"
      ? "rainWand"
      : payload.projectileType === "shepherdStaff"
        ? "shepherdStaff"
        : payload.projectileType === "arrow"
          ? "arrow"
          : "wand";

  removeClosestRemoteProjectile(
    basicProjectiles,
    ownerId,
    x,
    y,
    projectile =>
      projectile.type === projectileType
  );
}

function castBasicProjectile(type, angle, options = {}) {
  const startDistance =
    Number.isFinite(Number(options.startDistance))
      ? Number(options.startDistance)
      : 11;

  const speed =
    Number.isFinite(Number(options.speed))
      ? Number(options.speed)
      : 154;

  const life =
    Number.isFinite(Number(options.life))
      ? Number(options.life)
      : 1.2;

  const projectile = {
    type,

    x:
      player.x +
      Math.cos(angle) * startDistance,

    y:
      (player.y - 8) +
      Math.sin(angle) * startDistance,

    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    angle,
    drawAmount: Math.max(
      0,
      Math.min(
        1,
        Number(options.drawAmount) || 0
      )
    ),
    damageMultiplier: Math.max(
      0,
      Math.min(
        1,
        Number(options.damageMultiplier) || 1
      )
    ),
    rangeMultiplier: Math.max(
      0,
      Math.min(
        1,
        Number(options.rangeMultiplier) || 1
      )
    ),
    camouflageOpening: Boolean(options.camouflageOpening),
    focusFire: Boolean(options.focusFire),
    focusFireShotSequence: Math.max(
      0,
      Math.floor(Number(options.focusFireShotSequence) || 0)
    )
  };

  basicProjectiles.push(projectile);

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "basicProjectile",
      {
        projectileType: type,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        life: projectile.life
      }
    );
  }
}

function bowChargeStage(drawAmount) {
  const chargedAmount = Math.max(
    0,
    Math.min(1, Number(drawAmount) || 0)
  );

  // One simple threshold: the bow becomes ready after the full one-second draw.
  return chargedAmount >= 0.999 ? 1 : 0;
}

function bowShotProfile(drawAmount) {
  const chargedAmount = Math.max(
    0,
    Math.min(1, Number(drawAmount) || 0)
  );

  // There is no partial-shot tier anymore. Releasing before the one-second
  // draw completes cancels; once ready, every arrow uses normal bow stats.
  if (chargedAmount < 0.999) {
    return null;
  }

  const projectileSpeed = 280;
  const projectileRange = 320;

  return {
    chargedAmount: 1,
    ramp: 1,
    damageMultiplier: 1,
    rangeMultiplier: 1,
    speedMultiplier: 1,
    projectileSpeed,
    projectileRange,
    projectileLife:
      projectileRange /
      projectileSpeed
  };
}

function spendArrowAmmo(showEmptyMessage = true) {
  if ((Number(player.arrows) || 0) <= 0) {
    if (showEmptyMessage) {
      spawnFloatingText(
        player.x,
        player.y - 27,
        "NO ARROWS",
        "#ffe38b",
        0.72
      );
    }
    return false;
  }

  player.arrows = Math.max(
    0,
    Math.floor(Number(player.arrows) || 0) - 1
  );
  updateInventoryUi();

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.requestArrowUse();
  }

  return true;
}

function fireBowArrow(drawAmount, angle, options = {}) {
  const shot = bowShotProfile(drawAmount);

  // Releasing before one full second cancels the draw. No projectile is
  // created, no cooldown is applied, and most importantly no arrow is spent.
  if (!shot) {
    return false;
  }

  if (!spendArrowAmmo(true)) {
    return false;
  }

  // A real arrow release reveals the hunter even if the shot later misses.
  // The projectile itself remembers whether it was the prepared ambush shot.
  const camouflageOpening =
    consumeCamouflageOpening();

  const attackingFromShadowHide =
    player.shadowHidden;

  breakShadowHide();

  player.shadowCritAttack =
    attackingFromShadowHide;

  castBasicProjectile(
    "arrow",
    angle,
    {
      startDistance: 12,
      speed: shot.projectileSpeed,
      life: shot.projectileLife,
      drawAmount: shot.chargedAmount,
      damageMultiplier: shot.damageMultiplier,
      rangeMultiplier: shot.rangeMultiplier,
      camouflageOpening,
      focusFire: Boolean(options.focusFire),
      focusFireShotSequence: Math.max(
        0,
        Math.floor(Number(options.focusFireShotSequence) || 0)
      )
    }
  );

  player.attackTime = 0.08;
  player.attackCooldown = 0.42;
  player.slashTime = 0;
  player.shadowCritAttack = false;

  return true;
}

function isWandTypeWeapon(weapon = equippedWeapon()) {
  return WAND_WEAPON_TYPES.includes(weapon);
}

function showWandRequiredMessage() {
  spawnFloatingText(
    player.x,
    player.y - 31,
    "WAND REQUIRED",
    "#d9c6ff",
    0.72
  );
}

function updateBasicProjectiles(dt) {
  for (let i = basicProjectiles.length - 1; i >= 0; i--) {
    const projectile = basicProjectiles[i];

    projectile.life -= dt;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectile.visualOnly) {
      const outOfWorld =
        projectile.x < 0 ||
        projectile.y < 0 ||
        projectile.x > world.width ||
        projectile.y > world.height;

      if (
        outOfWorld ||
        projectile.life <= 0
      ) {
        basicProjectiles.splice(i, 1);
      }

      continue;
    }

    let impact = false;

    for (
      const { enemy, profile }
      of activeEnemyRecords({ aliveOnly: true })
    ) {
      const body = enemyBodyPoint(enemy);
      const dx = projectile.x - body.x;
      const dy = projectile.y - body.y;
      const hitRadius =
        profile.projectileHitRadius ?? 8;

      if (
        dx * dx + dy * dy <=
        hitRadius * hitRadius
      ) {
        damageEnemyWithProjectile(
          enemy,
          projectile,
          projectile.type === "arrow"
            ? "arrow"
            : "basic"
        );

        impact = true;
        break;
      }
    }

    if (
      !impact &&
      projectile.type === "arrow" &&
      player.pvpEnabled &&
      typeof onlineClient !== "undefined"
    ) {
      for (const remote of onlineClient.playersOnCurrentMap()) {
        if (!canAttackRemotePlayerWithPvp(remote)) continue;

        const dx = projectile.x - remote.x;
        const dy = projectile.y - (remote.y - 8);

        if (dx * dx + dy * dy <= 8 * 8) {
          onlineClient.sendPvpAttack(
            remote.id,
            "arrow",
            {
              critical: Boolean(projectile.critical),
              aimAngle: Math.atan2(
                projectile.vy,
                projectile.vx
              ),
              drawAmount: projectile.drawAmount,
              damageMultiplier: projectile.damageMultiplier,
              rangeMultiplier: projectile.rangeMultiplier,
              projectileX: projectile.x,
              projectileY: projectile.y,
              camouflageOpening: Boolean(projectile.camouflageOpening),
              focusFire: Boolean(projectile.focusFire),
              focusFireShotSequence: Math.max(
                0,
                Math.floor(Number(projectile.focusFireShotSequence) || 0)
              )
            }
          );

          impact = true;
          break;
        }
      }
    }

    const outOfWorld =
      projectile.x < 0 ||
      projectile.y < 0 ||
      projectile.x > world.width ||
      projectile.y > world.height;

    if (impact || outOfWorld || projectile.life <= 0) {
      if (
        impact &&
        typeof onlineClient !== "undefined"
      ) {
        onlineClient.sendVisualEffect(
          "basicProjectileImpact",
          {
            projectileType: projectile.type,
            x: projectile.x,
            y: projectile.y
          }
        );
      }

      basicProjectiles.splice(i, 1);
    }
  }
}

function drawBasicProjectile(projectile, camX, camY) {
  const x = Math.round(projectile.x - camX);
  const y = Math.round(projectile.y - camY);

  if (projectile.type === "arrow") {
    const angle = Math.atan2(
      Number(projectile.vy) || 0,
      Number(projectile.vx) || 0
    );

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = "#5f4227";
    ctx.fillRect(-4, -1, 6, 2);

    ctx.fillStyle = "#d2c4a5";
    ctx.fillRect(2, -1, 2, 2);

    ctx.fillStyle = "#7dc7d8";
    ctx.fillRect(-5, -2, 1, 1);
    ctx.fillRect(-5, 1, 1, 1);

    ctx.restore();
    return;
  }

  if (projectile.type === "rainWand") {
    ctx.fillStyle = "#28597a";
    ctx.fillRect(x - 2, y - 1, 4, 3);

    ctx.fillStyle = "#71c3f0";
    ctx.fillRect(x - 1, y - 1, 3, 2);

    ctx.fillStyle = "#d9f7ff";
    ctx.fillRect(x + 1, y, 1, 1);
  } else if (projectile.type === "shepherdStaff") {
    ctx.fillStyle = "#5b4928";
    ctx.fillRect(x - 2, y - 1, 4, 3);

    ctx.fillStyle = "#a6c45b";
    ctx.fillRect(x - 1, y - 1, 3, 2);

    ctx.fillStyle = "#edf5a0";
    ctx.fillRect(x + 1, y, 1, 1);
  } else {
    ctx.fillStyle = "#7e2f1d";
    ctx.fillRect(x - 2, y - 1, 4, 3);

    ctx.fillStyle = "#ef7d2b";
    ctx.fillRect(x - 1, y - 1, 3, 2);

    ctx.fillStyle = "#ffe47a";
    ctx.fillRect(x + 1, y, 1, 1);
  }
}

function spawnWandMasteryHitParticles(x, y, angle, startDelay = 0, reverseTravel = false) {
  // Three parallel rake marks that follow the wand's sweep path. They are
  // revealed progressively so the slash feels drawn across the enemy.
  const sweepAngle = angle + Math.PI / 2 - 0.12;
  const normalX = -Math.sin(sweepAngle);
  const normalY = Math.cos(sweepAngle);

  const clawColors = ["#ffffff", "#ffffff", "#ffffff"];

  for (let claw = -1; claw <= 1; claw++) {
    const offset = claw * 2.35;
    const markAngle = sweepAngle + claw * 0.05;
    const dirX = Math.cos(markAngle);
    const dirY = Math.sin(markAngle);
    const life = 0.31;
    const colorIndex = claw + 1;

    // Keep the existing three-rake shape and timing, but let the sweep travel
    // farther across the target: it begins clearly before contact and finishes
    // just beyond the old endpoint. The center shift preserves that asymmetric
    // lead/trail extension for both normal and reversed claw travel.
    const slashStartExtension = 8;
    const slashEndExtension = 2;
    const slashLength = 10 + slashStartExtension + slashEndExtension;
    const slashCenterShift =
      (reverseTravel ? -1 : 1) *
      (slashEndExtension - slashStartExtension) / 2;

    wandSweepParticles.push({
      x: x + normalX * offset + dirX * slashCenterShift,
      y: y + normalY * offset + dirY * slashCenterShift,
      vx: dirX * 1.1 + normalX * claw * 0.18,
      vy: dirY * 1.1 + normalY * claw * 0.18,
      life,
      maxLife: life,
      delay: Math.max(0, Number(startDelay) || 0),
      color: clawColors[colorIndex],
      kind: "hit",
      rotation: markAngle,
      slashLength,
      slashWidth: 1.15,
      slashCurve: 1.2,
      reverseTravel: Boolean(reverseTravel)
    });
  }
}

function updateWandSweepParticles(dt) {
  for (let i = wandSweepParticles.length - 1; i >= 0; i--) {
    const particle = wandSweepParticles[i];

    if ((Number(particle.delay) || 0) > 0) {
      particle.delay = Math.max(0, particle.delay - dt);
      continue;
    }

    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.94;
    particle.vy *= 0.94;

    if (particle.life <= 0) {
      wandSweepParticles.splice(i, 1);
    }
  }
}

function drawWandSweepParticles(camX, camY) {
  for (const particle of wandSweepParticles) {
    if ((Number(particle.delay) || 0) > 0) continue;

    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    const x = Math.round(particle.x - camX);
    const y = Math.round(particle.y - camY);

    ctx.save();
    ctx.globalAlpha = alpha * (particle.kind === "hit" ? 0.72 : 0.90);
    ctx.fillStyle = particle.color;

    if (particle.kind === "glitter") {
      // Alternate between a single bright pixel and a tiny four-point sparkle.
      const sparkle = Math.sin(worldTime * 28 + (particle.twinkle || 0)) > -0.15;
      ctx.fillRect(x, y, 1, 1);

      if (sparkle && alpha > 0.38) {
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
    } else {
      // Let the rake travel across the target: it draws on from one end, and
      // once long enough the opposite end starts disappearing.
      const rotation = Number(particle.rotation) || 0;
      const length = Math.max(4, Number(particle.slashLength) || 8);
      const width = Math.max(1, Number(particle.slashWidth) || 1.5);
      const curve = Number(particle.slashCurve) || 0;
      const age = 1 - alpha;
      const headProgress = Math.max(0, Math.min(1, age * 2.2));
      const tailProgress = Math.max(0, Math.min(1, (headProgress - 0.42) / 0.58));
      const steps = Math.max(8, Math.round(length * 1.8));
      const startStep = Math.min(steps - 1, Math.floor((steps - 1) * tailProgress));
      const endStep = Math.max(startStep, Math.ceil((steps - 1) * headProgress));
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const halfWidth = Math.max(0, Math.round((width - 1) / 2));

      for (let i = startStep; i <= endStep; i++) {
        const tRaw = i / (steps - 1);
        const t = particle.reverseTravel ? 1 - tRaw : tRaw;
        const localX = -length / 2 + t * length;
        const arch = (1 - Math.pow((t - 0.5) / 0.5, 2));
        const localY = -curve * arch;
        const worldX = x + localX * cosR - localY * sinR;
        const worldY = y + localX * sinR + localY * cosR;
        const px = Math.round(worldX);
        const py = Math.round(worldY);

        for (let w = -halfWidth; w <= halfWidth; w++) {
          ctx.fillRect(px, py + w, 1, 1);
        }

        if (i === endStep && headProgress < 1) {
          const tipX = Math.round(worldX + cosR);
          const tipY = Math.round(worldY + sinR);
          ctx.fillRect(tipX, tipY, 1, 1);
        }
      }
    }

    ctx.restore();
  }
}

function wandMasteryMaxTargets(level = abilityLevel("wandMastery")) {
  const cleanLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (cleanLevel >= 20) return 3;
  if (cleanLevel >= 10) return 2;
  return 1;
}

function wandMasteryMeleeActive() {
  return Boolean(
    isWandTypeWeapon(equippedWeapon()) &&
    isAbilityUnlocked("wandMastery")
  );
}

function currentMeleeReach() {
  if (wandMasteryMeleeActive()) return WAND_MASTERY_REACH;
  return equippedWeapon() === "katana" ? 31 : SWORD_REACH;
}

function damageEnemyWithProjectile(
  enemy,
  projectile,
  attackType
) {
  const type = enemyTypeOf(enemy);
  if (!type) return;

  const payload = {
    source: attackType,
    projectileX: projectile.x,
    projectileY: projectile.y
  };

  if (attackType === "arrow") {
    payload.aimAngle =
      Math.atan2(
        projectile.vy,
        projectile.vx
      );
    payload.drawAmount =
      projectile.drawAmount;
    payload.damageMultiplier =
      projectile.damageMultiplier;
    payload.rangeMultiplier =
      projectile.rangeMultiplier;
    payload.camouflageOpening =
      Boolean(
        projectile.camouflageOpening
      );
    payload.focusFire = Boolean(projectile.focusFire);
    payload.focusFireShotSequence = Math.max(
      0,
      Math.floor(Number(projectile.focusFireShotSequence) || 0)
    );
  }

  sendEnemyAction(
    enemy,
    "damage",
    payload
  );
}

function damageEnemyWithMelee(
  enemy,
  source,
  options = {}
) {
  const type = enemyTypeOf(enemy);
  const profile = enemyProfile(enemy);

  if (!type || !profile) return;

  sendEnemyAction(
    enemy,
    "damage",
    {
      source,
      critical:
        player.shadowCritAttack,
      aimAngle:
        player.attackAimAngle,
      impactDelayMs:
        Math.max(0, Math.round(Number(options.impactDelayMs) || 0)),
      targetCount:
        Math.max(1, Math.round(Number(options.targetCount) || 1))
    }
  );
}

function canAttackRemotePlayerWithPvp(remote) {
  return Boolean(
    remote &&
    player.pvpEnabled &&
    remote.pvpEnabled &&
    remote.mapId === currentMapId &&
    (Number(remote.hp) || 0) > 0 &&
    !remote.shadowHidden
  );
}

function tryHitPvpPlayers(source = "melee", maxTargets = Infinity) {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient?.connected ||
    !player.pvpEnabled
  ) {
    return;
  }

  const originX = player.x;
  const originY = player.y - 8;

  const horizontalSwing =
    player.attackDirection === "left" ||
    player.attackDirection === "right";

  const hitHalfArc =
    source === "bowMelee"
      ? BOW_MELEE_HALF_ARC
      : source === "wandMasteryMelee"
        ? WAND_MASTERY_HALF_ARC
        : horizontalSwing
          ? 0.88
          : 0.74;

  const reach =
    source === "bowMelee"
      ? BOW_MELEE_TRIGGER_RANGE
      : source === "wandMasteryMelee"
        ? WAND_MASTERY_REACH
        : currentMeleeReach();

  const candidates = [];

  for (const remote of onlineClient.playersOnCurrentMap()) {
    if (!canAttackRemotePlayerWithPvp(remote)) continue;

    const dx = remote.x - originX;
    const dy = (remote.y - 8) - originY;
    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle)) <= hitHalfArc;
    const insideRange = distance <= reach + 8;

    if (insideAngle && insideRange) {
      const relativeAngle = angleDifference(targetAngle, player.attackAimAngle);
      const sweepProgress = Math.max(
        0,
        Math.min(1, (relativeAngle + hitHalfArc) / (hitHalfArc * 2))
      );
      candidates.push({ remote, distance, sweepProgress });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);

  const selectedTargets =
    candidates.slice(0, Math.max(0, maxTargets));
  const wandMasteryTargetCount =
    source === "wandMasteryMelee"
      ? selectedTargets.length
      : 1;

  for (const { remote, sweepProgress } of selectedTargets) {
    const hitDelay =
      source === "wandMasteryMelee"
        ? Math.max(
            0,
            Math.min(player.slashDuration * 0.92, sweepProgress * player.slashDuration * 0.92)
          )
        : 0;

    onlineClient.sendPvpAttack(
      remote.id,
      source,
      {
        critical: player.shadowCritAttack,
        aimAngle: player.attackAimAngle,
        impactDelayMs: Math.round(hitDelay * 1000),
        targetCount: wandMasteryTargetCount
      }
    );

    if (source === "wandMasteryMelee") {
      const hitX = Number(remote.x) || 0;
      const hitY = (Number(remote.y) || 0) - 8;
      spawnWandMasteryHitParticles(
        hitX,
        hitY,
        player.attackAimAngle,
        hitDelay,
        player.attackDirection === "left"
      );
      onlineClient.sendVisualEffect(
        "wandMasteryHit",
        {
          x: hitX,
          y: hitY,
          angle: player.attackAimAngle,
          delay: hitDelay,
          reverseTravel: player.attackDirection === "left"
        }
      );
    }
  }
}

function tryHitEnemies(source = "melee", maxTargets = Infinity) {
  const originX = player.x;
  const originY = player.y - 8;

  const horizontalSwing =
    player.attackDirection === "left" ||
    player.attackDirection === "right";

  const hitHalfArc =
    source === "bowMelee"
      ? BOW_MELEE_HALF_ARC
      : source === "wandMasteryMelee"
        ? WAND_MASTERY_HALF_ARC
        : horizontalSwing
          ? 0.80
          : SWORD_HALF_ARC;

  const reach =
    source === "wandMasteryMelee"
      ? WAND_MASTERY_REACH
      : currentMeleeReach();

  const candidates = [];

  for (
    const { enemy, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    const target = enemyBodyPoint(enemy);
    const dx = target.x - originX;
    const dy = target.y - originY;
    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle)) <= hitHalfArc;

    const bodyRadius = horizontalSwing
      ? profile.horizontalMeleeBodyRadius ?? 6
      : profile.meleeBodyRadius ?? 5;

    const insideRange = distance <= reach + bodyRadius;

    if (insideAngle && insideRange) {
      const relativeAngle = angleDifference(targetAngle, player.attackAimAngle);
      const sweepProgress = Math.max(
        0,
        Math.min(1, (relativeAngle + hitHalfArc) / (hitHalfArc * 2))
      );
      candidates.push({ enemy, distance, sweepProgress });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);

  const selectedTargets =
    candidates.slice(0, Math.max(0, maxTargets));
  const wandMasteryTargetCount =
    source === "wandMasteryMelee"
      ? selectedTargets.length
      : 1;

  for (const { enemy, sweepProgress } of selectedTargets) {
    if (source === "wandMasteryMelee") {
      const target = enemyBodyPoint(enemy);
      const hitDelay = Math.max(
        0,
        Math.min(player.slashDuration * 0.92, sweepProgress * player.slashDuration * 0.92)
      );

      damageEnemyWithMelee(
        enemy,
        source,
        {
          impactDelayMs: hitDelay * 1000,
          targetCount: wandMasteryTargetCount
        }
      );

      // The claw mark is spawned from the authoritative enemyDamage response.
      // Do not predict it here: passive enemy interpolation can differ by a few
      // pixels from the server and previously produced visual "hits" with no
      // registered damage.
    } else {
      damageEnemyWithMelee(enemy, source);
    }
  }
}

function attackCooldownForWeapon(weapon) {
  // Bows never reach the universal primary-attack path; their charge/release
  // cadence remains independent. Every other equipped weapon/tool now reads
  // the shared Slow / Normal / Quick tier from combat-balance.
  if (typeof COMBAT_BALANCE?.weaponAttackCooldown === "function") {
    return COMBAT_BALANCE.weaponAttackCooldown(player.weaponIndex);
  }

  // Compatibility fallback if an older cached combat-balance file is present.
  if (isWandTypeWeapon(weapon)) {
    return typeof COMBAT_BALANCE?.wandAttackCooldown === "function"
      ? COMBAT_BALANCE.wandAttackCooldown(player.weaponIndex)
      : WAND_BASIC_ATTACK_FALLBACK_COOLDOWN;
  }
  return player.attackCooldownDuration;
}

function attackDurationForWeapon(weapon) {
  return isWandTypeWeapon(weapon)
    ? WAND_BASIC_ATTACK_DURATION
    : DEFAULT_BASIC_ATTACK_DURATION;
}

function attackImpactDelayForWeapon(weapon) {
  if (isWandTypeWeapon(weapon)) {
    return WAND_BASIC_ATTACK_IMPACT_DELAY;
  }

  // Non-wand attack frame 1 begins at 34% of the existing 3-pose swing.
  // Landing the hit at that exact visual transition gives swords/tools the
  // same readable anticipation that wands already had without changing their
  // existing total animation duration or repeat cooldown.
  return Math.max(
    0.01,
    attackDurationForWeapon(weapon) * MELEE_BASIC_ATTACK_IMPACT_PHASE
  );
}

function queueBasicAttackImpact(weapon, shadowCritAttack) {
  pendingBasicAttack = {
    weapon,
    mapId: currentMapId,
    time: attackImpactDelayForWeapon(weapon),
    shadowCritAttack: Boolean(shadowCritAttack)
  };
}

function updatePendingBasicAttack(dt) {
  if (!pendingBasicAttack) return;

  pendingBasicAttack.time -= dt;
  if (pendingBasicAttack.time > 0) return;

  const pending = pendingBasicAttack;
  pendingBasicAttack = null;

  // A death, map transition, or weapon swap during the tiny wind-up cancels
  // the queued impact rather than allowing a stale hit on the old map.
  if (
    player.isDead ||
    player.hp <= 0 ||
    currentMapId !== pending.mapId ||
    equippedWeapon() !== pending.weapon ||
    player.attackTime <= 0
  ) {
    return;
  }

  player.shadowCritAttack =
    pending.shadowCritAttack;

  // The slash/claw sweep begins on the active visual frame, not on mouse-down.
  player.slashTime =
    player.slashDuration;

  executeWeaponAttack(
    pending.weapon
  );

  player.shadowCritAttack = false;
}

function updateAttackAimFromPointer(pointerX, pointerY) {
  const playerScreenX = player.x - currentCamX;
  const playerScreenY = player.y - currentCamY - 8;
  const dx = pointerX - playerScreenX;
  const dy = pointerY - playerScreenY;

  mouseCanvasX = pointerX;
  mouseCanvasY = pointerY;
  player.attackAimAngle = Math.atan2(dy, dx);
  player.attackHand = dx >= 0 ? "right" : "left";

  if (Math.abs(dx) >= Math.abs(dy)) {
    player.attackDirection = dx >= 0 ? "right" : "left";
  } else {
    player.attackDirection = dy >= 0 ? "down" : "up";
  }

  return {
    dx,
    dy,
    worldTargetX: clampToWorld(currentCamX + pointerX, 0, world.width),
    worldTargetY: clampToWorld(currentCamY + pointerY, 0, world.height)
  };
}

function executeWeaponAttack(weapon) {
  if (
    weapon === "sword" ||
    weapon === "oldSword" ||
    weapon === "katana"
  ) {
    tryHitEnemies();
    tryHitPvpPlayers();
    tryCutHarvestFlowers();
    tryCutGrass();
    return;
  }

  if (weapon === "axe") {
    tryHitEnemies();
    tryHitPvpPlayers();
    tryHitTree();
    return;
  }

  if (weapon === "pickaxe") {
    tryHitEnemies();
    tryHitPvpPlayers();
    tryHitRock();
    return;
  }

  if (isWandTypeWeapon(weapon)) {
    if (isAbilityUnlocked("wandMastery")) {
      const masteryTargets = wandMasteryMaxTargets();
      tryHitEnemies(
        "wandMasteryMelee",
        masteryTargets
      );
      tryHitPvpPlayers(
        "wandMasteryMelee",
        masteryTargets
      );

    } else {
      tryHitEnemies("melee");
      tryHitPvpPlayers("melee");
    }
    return;
  }
}

function executePrimaryAttackCommand(payload) {
  if (player.hunterSnareSetting) {
    cancelHunterSnarePlacement(true);
  }

  // Bow input normally has its own press/hold/release path. A carried Hurl
  // slime is the exception: primary click must be allowed through so the
  // throw takes priority regardless of which weapon is equipped.
  if (
    equippedWeapon() === "bow" &&
    !getLocalCarriedHurlObject()
  ) {
    return;
  }

  const attackingFromShadowHide =
    player.shadowHidden;

  breakShadowHide();

  player.shadowCritAttack =
    attackingFromShadowHide;

  // Hurl occupies both hands. A primary click becomes the throw.
  if (getLocalCarriedHurlObject()) {
    updateAttackAimFromPointer(
      payload.pointerX,
      payload.pointerY
    );

    if (
      tryThrowCarriedHurlObject(
        player.attackAimAngle
      )
    ) {
      player.attackTime = 0.12;
      player.attackCooldown = 0.25;
      player.slashTime = 0;
    }

    player.shadowCritAttack = false;
    return;
  }

  if (player.attackCooldown > 0) {
    player.shadowCritAttack = false;
    return;
  }

  const currentWeapon = equippedWeapon();

  if (!currentWeapon) {
    player.shadowCritAttack = false;
    return;
  }

  // A committed primary attack breaks Camouflage immediately even on a whiff.
  // The authoritative server grants the short ambush token on this transition.
  consumeCamouflageOpening();

  updateAttackAimFromPointer(
    payload.pointerX,
    payload.pointerY
  );

  player.attackDuration =
    attackDurationForWeapon(currentWeapon);

  player.attackTime =
    player.attackDuration;

  player.attackCooldown =
    attackCooldownForWeapon(currentWeapon);

  // Publish the semantic attack start (including quantized aim) before any
  // environment/combat request spawned by executeWeaponAttack. WebSocket order
  // then guarantees the server validates the action against the same aim the
  // remote clients render, without a generic player-state heartbeat.
  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.syncLocalTransientReplication(true);
  }

  // Every non-bow basic attack now uses the same committed gesture that was
  // previously wand-only: voluntary movement is planted for the visible
  // attack, and damage/tool interaction lands on the active animation frame
  // rather than invisibly at mouse-down. Held movement input is not consumed,
  // so it resumes automatically as soon as the gesture ends.
  player.basicAttackMovementLockTime =
    player.attackDuration;

  player.slashTime = 0;
  queueBasicAttackImpact(
    currentWeapon,
    player.shadowCritAttack
  );

  player.shadowCritAttack = false;
}

function bowHasCloseMonsterInAim() {
  const originX = player.x;
  const originY = player.y - 8;
  const aim = Number(player.attackAimAngle) || 0;

  const candidates = [];

  for (
    const { enemy, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if (
      profile.canFocusFire &&
      !profile.canFocusFire(enemy)
    ) {
      continue;
    }

    candidates.push(
      enemyBodyPoint(enemy)
    );
  }

  if (
    player.pvpEnabled &&
    typeof onlineClient !== "undefined"
  ) {
    for (const remote of onlineClient.playersOnCurrentMap()) {
      if (!canAttackRemotePlayerWithPvp(remote)) continue;

      candidates.push({
        x: remote.x,
        y: remote.y - 8
      });
    }
  }

  return candidates.some(target => {
    const dx = target.x - originX;
    const dy = target.y - originY;
    const distance = Math.hypot(dx, dy);

    if (distance > BOW_MELEE_TRIGGER_RANGE) {
      return false;
    }

    const targetAngle = Math.atan2(dy, dx);

    return (
      Math.abs(
        angleDifference(
          targetAngle,
          aim
        )
      ) <= BOW_MELEE_HALF_ARC
    );
  });
}

function executeBowMeleeAttack() {
  const attackingFromShadowHide =
    player.shadowHidden;

  consumeCamouflageOpening();
  breakShadowHide();

  player.shadowCritAttack =
    attackingFromShadowHide;

  player.bowDrawing = false;
  player.bowDrawAmount = 0;
  player.bowReleaseTime = 0;

  player.attackDuration =
    attackDurationForWeapon("bow");
  player.attackTime =
    player.attackDuration;
  player.attackCooldown = 0.46;
  player.slashTime =
    player.slashDuration;

  tryHitEnemies("bowMelee");
  tryHitPvpPlayers("bowMelee");

  player.shadowCritAttack = false;

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }
}

function handlePrimaryAttack(event) {
  if (player.isDead) return;
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || event.button !== 0) return;
  if (player.rainCloudCasting) return;

  if (player.hunterSnareSetting) {
    cancelHunterSnarePlacement(true);
  }
  if (focusFireIsCasting() || fireballIsAiming()) return;

  const pointer = getCanvasPointerPosition(event);
  mouseCanvasX = pointer.x;
  mouseCanvasY = pointer.y;
  updateCanvasCursor();

  if (
    equippedWeapon() === "bow" &&
    !getLocalCarriedHurlObject()
  ) {
    if (player.attackCooldown > 0) {
      return;
    }

    updateAttackAimFromPointer(
      pointer.x,
      pointer.y
    );

    if (bowHasCloseMonsterInAim()) {
      executeBowMeleeAttack();
      return;
    }

    if ((Number(player.arrows) || 0) <= 0) {
      spawnFloatingText(
        player.x,
        player.y - 27,
        "NO ARROWS",
        "#ffe38b",
        0.72
      );
      return;
    }

    // Every click starts a fresh one-second draw. Do not inherit residual
    // bowDrawAmount from the previous release animation.
    player.bowDrawAmount = 0;
    player.bowDrawing = true;
    player.bowReleaseTime = 0;

    if (
      typeof onlineClient !== "undefined"
    ) {
      onlineClient.sendLocalState(true);
    }

    return;
  }

  primaryAttackHeld = !getLocalCarriedHurlObject();

  inputController.queueCommand("primaryAttack", {
    pointerX: pointer.x,
    pointerY: pointer.y
  });
}

function repeatHeldPrimaryAttackIfReady() {
  if (!primaryAttackHeld) return;
  if (player.isDead || player.hp <= 0) return;
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen) return;
  if (player.rainCloudCasting || focusFireIsCasting() || fireballIsAiming()) return;
  if (player.attackCooldown > 0) return;

  const weapon = equippedWeapon();

  // Bow keeps its existing press/hold/release draw controls, and Hurl remains
  // a deliberate one-click throw. Held primary fire is only for basic attacks.
  if (!weapon || weapon === "bow" || getLocalCarriedHurlObject()) return;

  executePrimaryAttackCommand({
    pointerX: mouseCanvasX,
    pointerY: mouseCanvasY
  });
}

function handleBowVisualMouseUp(event) {
  if (event.button === 0) {
    primaryAttackHeld = false;
    if (typeof clearMobileAutoBowTarget === "function") {
      clearMobileAutoBowTarget();
    }
  }
  if (
    player.isDead ||
    event.button !== 0 ||
    !player.bowDrawing ||
    player.rainCloudCasting
  ) {
    return;
  }

  const drawAmount = Math.max(
    0,
    Math.min(
      1,
      Number(player.bowDrawAmount) || 0
    )
  );

  if (
    equippedWeapon() === "bow"
  ) {
    const pointer =
      getCanvasPointerPosition(event);

    updateAttackAimFromPointer(
      pointer.x,
      pointer.y
    );
  }

  player.bowDrawing = false;
  player.bowReleaseTime =
    player.bowReleaseDuration;

  if (
    equippedWeapon() === "bow" &&
    !getLocalCarriedHurlObject() &&
    player.attackCooldown <= 0
  ) {
    fireBowArrow(
      drawAmount,
      player.attackAimAngle
    );
  }

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }
}

function updateBowVisualState(dt) {
  const bowEquipped =
    equippedWeapon() === "bow";

  if (!bowEquipped) {
    player.bowDrawing = false;
    player.bowDrawAmount = 0;
    player.bowReleaseTime = 0;
    if (typeof clearMobileAutoBowTarget === "function") {
      clearMobileAutoBowTarget();
    }
    return;
  }

  if (player.bowDrawing) {
    player.bowDrawAmount =
      Math.min(
        1,
        player.bowDrawAmount +
          dt /
          Math.max(
            0.05,
            player.bowDrawDuration
          )
      );

    player.bowReleaseTime = 0;
    if (
      typeof updateMobilePointBowShot === "function" &&
      updateMobilePointBowShot()
    ) {
      return;
    }
    return;
  }

  if (player.bowReleaseTime > 0) {
    player.bowReleaseTime =
      Math.max(
        0,
        player.bowReleaseTime - dt
      );

    // Fast snap-back on release. There is deliberately no arrow yet.
    player.bowDrawAmount =
      Math.max(
        0,
        player.bowDrawAmount -
          dt / 0.09
      );

    return;
  }

  player.bowDrawAmount =
    Math.max(
      0,
      player.bowDrawAmount -
        dt / 0.16
    );
}
