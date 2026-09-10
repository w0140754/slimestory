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
    payload.projectileType === "shepherdStaff"
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

  castBasicProjectile(
    "arrow",
    angle,
    {
      startDistance: 12,
      speed: shot.projectileSpeed,
      life: shot.projectileLife,
      drawAmount: shot.chargedAmount,
      damageMultiplier: shot.damageMultiplier,
      rangeMultiplier: shot.rangeMultiplier
    }
  );

  player.attackTime = 0.08;
  player.attackCooldown = 0.42;
  player.slashTime = 0;

  return true;
}

function isWandTypeWeapon(weapon = equippedWeapon()) {
  return WAND_WEAPON_TYPES.includes(weapon);
}


function updateBasicProjectiles(dt) {
  for (let i = basicProjectiles.length - 1; i >= 0; i--) {
    const projectile = basicProjectiles[i];

    projectile.life -= dt;
    const previousX = projectile.x;
    const previousY = projectile.y;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    const wallImpact =
      typeof structureWallImpactPoint === "function"
        ? structureWallImpactPoint(
            previousX,
            previousY,
            projectile.x,
            projectile.y,
            projectile.type === "arrow" ? 0.4 : 1
          )
        : null;

    if (wallImpact) {
      projectile.x = wallImpact.x;
      projectile.y = wallImpact.y;

      if (
        !projectile.visualOnly &&
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
      continue;
    }

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
        // Server repeats this check authoritatively; doing it here prevents
        // false local impact feedback against a target visible through a wall.
        if (
          typeof structureLineOfEffectClear === "function" &&
          !structureLineOfEffectClear(
            player.x,
            player.y - 8,
            body.x,
            body.y,
            projectile.type === "arrow" ? 0.4 : 1
          )
        ) {
          continue;
        }

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

  if (projectile.type === "shepherdStaff") {
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

function currentMeleeReach() {
  return SWORD_REACH;
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
      aimAngle: player.attackAimAngle
    }
  );
}

function tryHitEnemies(source = "melee", maxTargets = Infinity) {
  const originX = player.x;
  const originY = player.y - 8;

  const horizontalSwing =
    player.attackDirection === "left" ||
    player.attackDirection === "right";

  const hitHalfArc = horizontalSwing ? 0.80 : SWORD_HALF_ARC;

  const reach = currentMeleeReach();

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
    const clearLine =
      typeof structureLineOfEffectClear !== "function" ||
      structureLineOfEffectClear(originX, originY, target.x, target.y, 0.5);

    if (insideAngle && insideRange && clearLine) {
      const relativeAngle = angleDifference(targetAngle, player.attackAimAngle);
      const sweepProgress = Math.max(
        0,
        Math.min(1, (relativeAngle + hitHalfArc) / (hitHalfArc * 2))
      );
      candidates.push({ enemy, distance, sweepProgress });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);

  const selectedTargets = candidates.slice(0, Math.max(0, maxTargets));
  for (const { enemy } of selectedTargets) {
    damageEnemyWithMelee(enemy, source);
  }
  return selectedTargets.length;
}

function attackCooldownForWeapon(_weapon) {
  // Bows never reach the universal primary-attack path; their charge/release
  // cadence remains independent. Every other equipped weapon/tool uses the
  // shared Slow / Normal / Quick tier.
  return COMBAT_BALANCE.weaponAttackCooldown(player.weaponIndex);
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

function queueBasicAttackImpact(weapon) {
  const lockedStructure = weapon === "pickaxe" ? playerStructurePickaxeTarget() : null;
  const pointerWorldX = currentCamX + mouseCanvasX;
  const pointerWorldY = currentCamY + mouseCanvasY;
  pendingBasicAttack = {
    weapon,
    mapId: currentMapId,
    time: attackImpactDelayForWeapon(weapon),
    // Lock the cursor-selected structure at mouse/touch-down so the delayed
    // Pickaxe impact cannot switch targets if the pointer moves during swing.
    structureTargetId: lockedStructure?.id || null,
    groundDigTarget: weapon === "pickaxe" && !lockedStructure
      ? { x: pointerWorldX, y: pointerWorldY }
      : null
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

  // The slash/claw sweep begins on the active visual frame, not on mouse-down.
  player.slashTime =
    player.slashDuration;

  executeWeaponAttack(
    pending.weapon,
    pending.structureTargetId,
    pending.groundDigTarget
  );

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

function executeWeaponAttack(weapon, lockedStructureId = undefined, lockedGroundDigTarget = null) {
  if (weapon === "sword") {
    tryHitEnemies("melee", 1);
    tryCutHarvestFlowers();
    tryCutGrass();
    return;
  }

  if (weapon === "axe") {
    tryHitEnemies("melee", 1);
    tryHitTree();
    return;
  }

  if (weapon === "pickaxe") {
    const enemyHits = tryHitEnemies("melee", 1);
    if (enemyHits <= 0 && !tryHitPlayerStructure(lockedStructureId) && !tryHitRock()) {
      tryDigSurfaceGround(lockedGroundDigTarget);
    }
    return;
  }

  if (isWandTypeWeapon(weapon)) {
    tryHitEnemies("melee", 1);
    return;
  }
}

function executePrimaryAttackCommand(payload) {
  // Bow input normally has its own press/hold/release path. A carried Hurl
  // slime is the exception: primary click must be allowed through so the
  // throw takes priority regardless of which weapon is equipped.
  if (
    equippedWeapon() === "bow" &&
    !getLocalCarriedHurlObject()
  ) {
    return;
  }

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

      return;
  }

  if (player.attackCooldown > 0) {
      return;
  }

  const currentWeapon = equippedWeapon();

  if (!currentWeapon) {
      return;
  }

  if (currentWeapon === "tigerPaw") {
    updateAttackAimFromPointer(payload.pointerX, payload.pointerY);
    tryCastHurl();
    player.attackTime = 0.12;
    player.attackCooldown = 0.25;
    player.slashTime = 0;
      return;
  }

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

  // Basic weapon and tool attacks no longer plant the player on either input
  // scheme. Damage and gathering still land on the normal active frame.
  player.basicAttackMovementLockTime = 0;

  player.slashTime = 0;
  queueBasicAttackImpact(currentWeapon);

}

function handlePrimaryAttack(event) {
  if (typeof tryPlaceSelectedBuildPiece === "function" && tryPlaceSelectedBuildPiece(event)) return;
  if (player.isDead) return;
  if (shopOpen || beachQuestOpen || event.button !== 0) return;

  const pointer = getCanvasPointerPosition(event);
  mouseCanvasX = pointer.x;
  mouseCanvasY = pointer.y;
  updateCanvasCursor();

  if (equippedWeapon() === "bow" && !getLocalCarriedHurlObject()) {
    if (player.attackCooldown > 0) return;

    updateAttackAimFromPointer(pointer.x, pointer.y);
    if ((Number(player.arrows) || 0) <= 0) {
      spawnFloatingText(player.x, player.y - 27, "NO ARROWS", "#ffe38b", 0.72);
      return;
    }

    player.bowDrawAmount = 0;
    player.bowDrawing = true;
    player.bowReleaseTime = 0;
    if (typeof onlineClient !== "undefined") onlineClient.sendLocalState(true);
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
  if (shopOpen || beachQuestOpen) return;
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
    !player.bowDrawing
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
