// Slime Story client Ranger/Bruiser/Rogue active ability implementations.
// Extracted from game.js in v6-11-237 with function bodies preserved verbatim.
// Classic-script semantics are intentional: these functions resolve shared runtime
// bindings from game.js and earlier client scripts at invocation time.

function focusFireIsCasting() {
  return Boolean(
    player.focusFireCharging ||
    player.focusFireOpening ||
    player.focusFireActive
  );
}

function focusFirePulseProgress() {
  const time = Math.max(
    0,
    Number(player.focusFireChargeTime) || 0
  );

  return (
    (time % FOCUS_FIRE_PULSE_DURATION) /
    FOCUS_FIRE_PULSE_DURATION
  );
}

function focusFirePulseRadius() {
  const progress = focusFirePulseProgress();
  return (
    FOCUS_FIRE_MIN_RADIUS +
    (FOCUS_FIRE_MAX_RADIUS - FOCUS_FIRE_MIN_RADIUS) * progress
  );
}

function clearFocusFireState(removeLocalOpener = true) {
  player.focusFireCharging = false;
  player.focusFireOpening = false;
  player.focusFireActive = false;
  player.focusFireChargeTime = 0;
  player.focusFireBoundKey = null;
  player.focusFireMapId = null;
  player.focusFireTarget = null;
  player.focusFireTargetType = null;
  player.focusFireTargetId = null;
  player.focusFireTime = 0;
  player.focusFireShotTimer = 0;
  player.focusFireShotSequence = 0;

  if (removeLocalOpener) {
    for (let i = focusFireOpeners.length - 1; i >= 0; i--) {
      if (!focusFireOpeners[i].visualOnly) {
        focusFireOpeners.splice(i, 1);
      }
    }
  }
}

function cancelFocusFire(reason = "") {
  if (!focusFireIsCasting()) return false;

  clearFocusFireState(true);

  if (reason === "hit") {
    spawnFloatingText(
      player.x,
      player.y - 31,
      "INTERRUPTED",
      "#ffc6b0",
      0.65
    );
  }

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function beginFocusFireCharge(boundKey = null) {
  if (!isAbilityUnlocked("focusFire")) return false;

  if (equippedWeapon() !== "bow") {
    spawnFloatingText(
      player.x,
      player.y - 31,
      "NEED BOW",
      "#ffe38b",
      0.72
    );
    return true;
  }

  if ((Number(player.arrows) || 0) <= 0) {
    spawnFloatingText(
      player.x,
      player.y - 31,
      "NO ARROWS",
      "#ffe38b",
      0.72
    );
    return true;
  }

  if (focusFireIsCasting() || fireballIsAiming()) {
    return true;
  }

  breakShadowHide();

  player.bowDrawing = false;
  player.bowDrawAmount = 0;
  player.bowReleaseTime = 0;

  player.focusFireCharging = true;
  player.focusFireOpening = false;
  player.focusFireActive = false;
  player.focusFireChargeTime = 0;
  player.focusFireBoundKey = boundKey;
  player.focusFireMapId = currentMapId;

  const target = getCurrentWorldMouseTarget();
  aimPlayerTowardPoint(target.x, target.y);

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function focusFireLandingPoint(pointTarget = null) {
  if (
    Number.isFinite(Number(pointTarget?.x)) &&
    Number.isFinite(Number(pointTarget?.y))
  ) {
    return resolvePlayerPointTarget(
      Number(pointTarget.x),
      Number(pointTarget.y),
      {
        minRange: FOCUS_FIRE_MIN_RADIUS,
        maxRange: FOCUS_FIRE_MAX_RADIUS,
        insetX: 4,
        insetTop: 4,
        insetBottom: 4
      }
    );
  }

  const target = getCurrentWorldMouseTarget();
  let dx = target.x - player.x;
  let dy = target.y - (player.y - 8);
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;

  const radius = focusFirePulseRadius();

  return {
    x: clampToWorld(
      player.x + dx * radius,
      4,
      world.width - 4
    ),
    y: clampToWorld(
      (player.y - 8) + dy * radius,
      4,
      world.height - 4
    ),
    angle: Math.atan2(dy, dx),
    radius
  };
}

function releaseFocusFireCharge(pointTarget = null) {
  if (!player.focusFireCharging) return false;

  if (
    equippedWeapon() !== "bow" ||
    currentMapId !== player.focusFireMapId
  ) {
    cancelFocusFire();
    return true;
  }

  const landing = focusFireLandingPoint(pointTarget);

  player.focusFireCharging = false;
  player.focusFireOpening = true;
  player.focusFireChargeTime = 0;
  player.focusFireBoundKey = null;
  player.attackAimAngle = landing.angle;
  player.attackHand = Math.cos(landing.angle) >= 0 ? "right" : "left";

  if (!spendArrowAmmo(true)) {
    clearFocusFireState(true);
    return true;
  }

  // Focus Fire's arcing opener is still an arrow: committing it reveals
  // Camouflage immediately even if the landing shot misses.
  const camouflageOpening =
    consumeCamouflageOpening();

  const startX = player.x + Math.cos(landing.angle) * 12;
  const startY = (player.y - 8) + Math.sin(landing.angle) * 12;
  const distance = Math.hypot(landing.x - startX, landing.y - startY);
  const duration = Math.max(
    0.28,
    Math.min(0.72, distance / 220)
  );

  focusFireOpeners.push({
    startX,
    startY,
    targetX: landing.x,
    targetY: landing.y,
    x: startX,
    y: startY,
    elapsed: 0,
    duration,
    arcHeight: Math.min(42, 13 + distance * 0.18),
    angle: landing.angle,
    camouflageOpening,
    visualOnly: false,
    ownerId: null
  });

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.sendVisualEffect(
      "focusFireArc",
      {
        startX,
        startY,
        targetX: landing.x,
        targetY: landing.y,
        duration
      }
    );
  }

  player.attackTime = 0.08;
  player.attackCooldown = Math.max(player.attackCooldown, 0.18);

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function focusFireRemotePlayerIsTargetable(remote) {
  return Boolean(
    canAttackRemotePlayerWithPvp(remote) &&
    !remote.camouflaged
  );
}

function focusFireTargetIsAlive(target, type) {
  if (!target) return false;
  if (type === "player") {
    return Boolean(
      focusFireRemotePlayerIsTargetable(target) &&
      (Number(target.hp) || 0) > 0
    );
  }
  return Boolean(target.alive);
}

function findFocusFireLandingTarget(x, y) {
  let best = null;
  let bestDistanceSq =
    FOCUS_FIRE_LANDING_RADIUS *
    FOCUS_FIRE_LANDING_RADIUS;

  for (
    const { enemy, type, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if (
      profile.canFocusFire &&
      !profile.canFocusFire(enemy)
    ) {
      continue;
    }

    const body = enemyBodyPoint(enemy);
    const dx = body.x - x;
    const dy = body.y - y;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = { enemy, type };
    }
  }

  if (
    player.pvpEnabled &&
    typeof onlineClient !== "undefined"
  ) {
    for (const remote of onlineClient.playersOnCurrentMap()) {
      if (!focusFireRemotePlayerIsTargetable(remote)) continue;

      const dx = remote.x - x;
      const dy = (remote.y - 8) - y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = { enemy: remote, type: "player" };
      }
    }
  }

  return best;
}

function focusFireAimPoint(enemy, type) {
  if (type === "player") {
    return {
      x: Number(enemy.x) || 0,
      y: (Number(enemy.y) || 0) - 8
    };
  }
  return enemyBodyPoint(enemy);
}

function damageFocusFireTarget(enemy, type, projectile) {
  if (type === "player") {
    if (
      typeof onlineClient === "undefined" ||
      !focusFireRemotePlayerIsTargetable(enemy)
    ) {
      return;
    }

    onlineClient.sendPvpAttack(
      enemy.id,
      "arrow",
      {
        critical: false,
        aimAngle: Math.atan2(
          Number(projectile.vy) || 0,
          Number(projectile.vx) || 1
        ),
        drawAmount: 1,
        damageMultiplier: 1,
        rangeMultiplier: 1,
        projectileX: projectile.x,
        projectileY: projectile.y,
        camouflageOpening: Boolean(projectile.camouflageOpening),
        focusFire: true,
        focusFireShotSequence: Math.max(
          1,
          Math.floor(Number(projectile.focusFireShotSequence) || 1)
        )
      }
    );
    return;
  }

  damageEnemyWithProjectile(
    enemy,
    projectile,
    "arrow"
  );
}

function lockFocusFireTarget(enemy, type) {
  if (!focusFireTargetIsAlive(enemy, type)) {
    clearFocusFireState(false);
    return;
  }

  player.focusFireOpening = false;
  player.focusFireActive = true;
  player.focusFireTarget = enemy;
  player.focusFireTargetType = type;
  player.focusFireTargetId =
    type === "player"
      ? enemy.id
      : (enemy.entityId || null);
  player.focusFireTime = FOCUS_FIRE_BARRAGE_DURATION;
  // Start the barrage a fraction of a second after the marker arrow lands,
  // then fire every 0.5s. The small lead-in keeps the opener and first follow-up
  // outside the server's normal arrow hit-rate guard while still yielding ten
  // follow-up arrows inside the five-second channel.
  player.focusFireShotTimer = 0.25;
}

function resolveFocusFireOpenerLanding(opener) {
  if (
    !player.focusFireOpening ||
    opener.visualOnly ||
    currentMapId !== player.focusFireMapId
  ) {
    return;
  }

  const hit = findFocusFireLandingTarget(
    opener.targetX,
    opener.targetY
  );

  if (!hit) {
    spawnFloatingText(
      opener.targetX,
      opener.targetY - 7,
      "MISS",
      "#d8d2be",
      0.55
    );
    clearFocusFireState(false);
    return;
  }

  player.focusFireShotSequence = 1;

  const pseudoProjectile = {
    x: opener.targetX,
    y: opener.targetY,
    vx: Math.cos(opener.angle) * 280,
    vy: Math.sin(opener.angle) * 280,
    drawAmount: 1,
    damageMultiplier: 1,
    rangeMultiplier: 1,
    critical: false,
    camouflageOpening: Boolean(opener.camouflageOpening),
    focusFire: true,
    focusFireShotSequence: player.focusFireShotSequence
  };

  damageFocusFireTarget(
    hit.enemy,
    hit.type,
    pseudoProjectile
  );

  if (!focusFireTargetIsAlive(hit.enemy, hit.type)) {
    clearFocusFireState(false);
    return;
  }

  lockFocusFireTarget(
    hit.enemy,
    hit.type
  );
}

function focusFireCurrentTarget() {
  const target = player.focusFireTarget;
  if (!target) return null;

  if (player.focusFireTargetType === "player") {
    if (
      typeof onlineClient === "undefined" ||
      !player.focusFireTargetId
    ) {
      return null;
    }

    const remote =
      onlineClient.remotePlayers?.get(player.focusFireTargetId) || null;

    if (
      !remote ||
      remote.mapId !== player.focusFireMapId ||
      !focusFireRemotePlayerIsTargetable(remote)
    ) {
      return null;
    }

    return remote;
  }

  if (
    player.focusFireTargetId &&
    player.focusFireTargetType
  ) {
    const found = findClientWorldEnemy(
      player.focusFireTargetId,
      player.focusFireTargetType,
      player.focusFireMapId
    );
    return found || target;
  }

  return target;
}

function fireFocusFireBarrageArrow() {
  const target = focusFireCurrentTarget();
  const type = player.focusFireTargetType;

  if (!focusFireTargetIsAlive(target, type)) {
    clearFocusFireState(true);
    return false;
  }

  const targetProfile =
    type === "player"
      ? null
      : enemyProfile(target);

  if (
    targetProfile?.canFocusFire &&
    !targetProfile.canFocusFire(target)
  ) {
    clearFocusFireState(true);
    return false;
  }

  if ((Number(player.arrows) || 0) <= 0) {
    spawnFloatingText(
      player.x,
      player.y - 29,
      "NO ARROWS",
      "#ffe38b",
      0.65
    );
    clearFocusFireState(true);
    return false;
  }

  const aim = focusFireAimPoint(target, type);
  aimPlayerTowardPoint(aim.x, aim.y);
  player.attackHand = Math.cos(player.attackAimAngle) >= 0 ? "right" : "left";

  player.focusFireShotSequence += 1;

  return fireBowArrow(
    1,
    player.attackAimAngle,
    {
      focusFire: true,
      focusFireShotSequence: player.focusFireShotSequence
    }
  );
}

function updateFocusFire(dt) {
  if (player.focusFireCharging) {
    if (
      equippedWeapon() !== "bow" ||
      currentMapId !== player.focusFireMapId
    ) {
      cancelFocusFire();
    } else {
      player.focusFireChargeTime += dt;
      updateAttackAimFromPointer(
        mouseCanvasX,
        mouseCanvasY
      );
    }
  }

  for (let i = focusFireOpeners.length - 1; i >= 0; i--) {
    const opener = focusFireOpeners[i];
    opener.elapsed += dt;
    const progress = Math.max(
      0,
      Math.min(1, opener.elapsed / Math.max(0.01, opener.duration))
    );

    opener.x = opener.startX + (opener.targetX - opener.startX) * progress;
    opener.y = opener.startY + (opener.targetY - opener.startY) * progress;

    if (progress >= 1) {
      if (!opener.visualOnly) {
        resolveFocusFireOpenerLanding(opener);
      }
      focusFireOpeners.splice(i, 1);
    }
  }

  if (!player.focusFireActive) return;

  if (
    equippedWeapon() !== "bow" ||
    currentMapId !== player.focusFireMapId
  ) {
    cancelFocusFire();
    return;
  }

  const target = focusFireCurrentTarget();
  if (!focusFireTargetIsAlive(target, player.focusFireTargetType)) {
    // Entering Camouflage immediately breaks an enemy Ranger's assisted lock.
    // Already-fired arrows remain ordinary committed projectiles.
    clearFocusFireState(true);
    return;
  }

  player.focusFireTime = Math.max(0, player.focusFireTime - dt);
  player.focusFireShotTimer -= dt;

  while (
    player.focusFireActive &&
    player.focusFireTime > 0 &&
    player.focusFireShotTimer <= 0
  ) {
    if (!fireFocusFireBarrageArrow()) {
      break;
    }
    player.focusFireShotTimer += FOCUS_FIRE_SHOT_INTERVAL;
  }

  if (player.focusFireTime <= 0) {
    clearFocusFireState(true);
  }
}

function drawFocusFireOpener(opener, camX, camY) {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (Number(opener.elapsed) || 0) /
      Math.max(0.01, Number(opener.duration) || 0.4)
    )
  );

  const arcLift =
    4 * progress * (1 - progress) *
    Math.max(8, Number(opener.arcHeight) || 24);

  const groundX = Math.round(opener.x - camX);
  const groundY = Math.round(opener.y - camY);
  const arrowY = Math.round(groundY - arcLift);
  const angle = Number(opener.angle) || 0;

  // A tiny ground shadow makes the opener read as travelling OVER enemies
  // instead of colliding with anything it visually crosses.
  ctx.save();
  ctx.globalAlpha *= 0.20 + 0.18 * (1 - progress);
  ctx.fillStyle = "#26382b";
  ctx.fillRect(groundX - 2, groundY, 4, 1);
  ctx.restore();

  ctx.save();
  ctx.translate(groundX, arrowY);
  ctx.rotate(angle);

  ctx.fillStyle = "#5f4227";
  ctx.fillRect(-4, -1, 6, 2);

  ctx.fillStyle = "#f1dfad";
  ctx.fillRect(2, -1, 2, 2);

  ctx.fillStyle = "#82d7dc";
  ctx.fillRect(-5, -2, 1, 1);
  ctx.fillRect(-5, 1, 1, 1);

  ctx.restore();
}

function drawFocusFireTargeting(camX, camY) {
  if (!player.focusFireCharging) return;

  const radius = focusFirePulseRadius();
  const progress = focusFirePulseProgress();
  const centerX = Math.round(player.x - camX);
  const centerY = Math.round(player.y - 8 - camY);
  const pointCount = Math.max(20, Math.round(radius / 4.5));

  ctx.save();
  ctx.globalAlpha *= 0.34 + Math.sin(progress * Math.PI) * 0.14;
  ctx.fillStyle = "#e5d99c";

  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const x = Math.round(centerX + Math.cos(angle) * radius);
    const y = Math.round(centerY + Math.sin(angle) * radius);
    ctx.fillRect(x, y, 1, 1);
  }

  const landing = focusFireLandingPoint();
  const landingX = Math.round(landing.x - camX);
  const landingY = Math.round(landing.y - camY);

  // The landing reticle is the actual skill check. The opener lands exactly
  // here when the bound skill key is released.
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = "#fff0af";
  ctx.fillRect(landingX - 2, landingY, 2, 1);
  ctx.fillRect(landingX + 1, landingY, 2, 1);
  ctx.fillRect(landingX, landingY - 2, 1, 2);
  ctx.fillRect(landingX, landingY + 1, 1, 2);

  ctx.restore();
}

function drawFocusFireTargetMarker(camX, camY) {
  if (!player.focusFireActive) return;

  const target = focusFireCurrentTarget();
  const type = player.focusFireTargetType;
  if (!focusFireTargetIsAlive(target, type)) return;

  const profile =
    type === "player"
      ? null
      : enemyProfile(target);

  const center =
    type === "player"
      ? {
          x: Number(target.x) || 0,
          y: (Number(target.y) || 0) - 8
        }
      : enemyBodyPoint(target);

  const x = Math.round(center.x - camX);
  const y = Math.round(center.y - camY);
  const rx = type === "player" ? 8 : (profile?.lockRadiusX ?? 9);
  const ry = type === "player" ? 10 : (profile?.lockRadiusY ?? 10);
  const pulse = 0.72 + 0.20 * (0.5 + 0.5 * Math.sin(worldTime * 8));

  ctx.save();
  ctx.globalAlpha *= pulse;
  ctx.fillStyle = "#f2e4a4";

  // Four tiny corner brackets: readable lock feedback without a billboard.
  ctx.fillRect(x - rx, y - ry, 3, 1);
  ctx.fillRect(x - rx, y - ry, 1, 3);
  ctx.fillRect(x + rx - 2, y - ry, 3, 1);
  ctx.fillRect(x + rx, y - ry, 1, 3);
  ctx.fillRect(x - rx, y + ry, 3, 1);
  ctx.fillRect(x - rx, y + ry - 2, 1, 3);
  ctx.fillRect(x + rx - 2, y + ry, 3, 1);
  ctx.fillRect(x + rx, y + ry - 2, 1, 3);

  ctx.restore();
}

function spawnShadowSmokePuff(x, y, count = 18, scale = 1) {
  const colors = ["#161616", "#2a2a2a", "#3a3a3a", "#565656", "#737373"];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (8 + Math.random() * 16) * scale;
    const life = (0.32 + Math.random() * 0.32) * (0.92 + scale * 0.08);

    shadowSmokeParticles.push({
      x: x + (Math.random() * 8 - 4) * scale,
      y: y - 9 + (Math.random() * 6 - 3) * scale,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 8 * scale,
      life,
      maxLife: life,
      color: colors[(Math.random() * colors.length) | 0],
      size: Math.random() < Math.min(0.70, 0.35 + (scale - 1) * 0.35) ? 2 : 1
    });
  }
}

function updateShadowSmoke(dt) {
  for (let i = shadowSmokeParticles.length - 1; i >= 0; i--) {
    const p = shadowSmokeParticles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.vy -= 2 * dt;

    if (p.life <= 0) {
      shadowSmokeParticles.splice(i, 1);
    }
  }
}

function drawShadowSmoke(camX, camY) {
  for (const p of shadowSmokeParticles) {
    const pct = Math.max(0, Math.min(1, p.life / p.maxLife));
    const x = Math.round(p.x - camX);
    const y = Math.round(p.y - camY);

    ctx.save();
    ctx.globalAlpha = pct * 0.9;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, p.size, p.size);
    ctx.restore();
  }
}

function getCarriedEnemyForPlayerId(playerId) {
  if (!playerId) return null;

  for (const { enemy } of activeEnemyRecords({ aliveOnly: true })) {
    if (enemy.carriedBy === playerId) {
      return enemy;
    }
  }

  return null;
}

function getCarriedRockForPlayerId(playerId) {
  if (!playerId) return null;

  return (
    rocks.find(rock => rock.carriedBy === playerId) ||
    null
  );
}

function getCarriedHurlObjectForPlayerId(playerId) {
  return (
    getCarriedEnemyForPlayerId(playerId) ||
    getCarriedRockForPlayerId(playerId)
  );
}

function getLocalCarriedEnemy() {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient.localPlayerId
  ) {
    return null;
  }

  return getCarriedEnemyForPlayerId(
    onlineClient.localPlayerId
  );
}

function getLocalCarriedRock() {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient.localPlayerId
  ) {
    return null;
  }

  return getCarriedRockForPlayerId(
    onlineClient.localPlayerId
  );
}

function getLocalCarriedHurlObject() {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient.localPlayerId
  ) {
    return null;
  }

  return getCarriedHurlObjectForPlayerId(
    onlineClient.localPlayerId
  );
}

function findNearestHurlableEnemy(
  maxDistance = HURL_GRAB_RANGE
) {
  let best = null;
  let bestDistance = maxDistance;

  for (
    const { enemy }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    if (
      !enemyIsHurlable(enemy) ||
      enemy.carriedBy ||
      enemy.hurlTime > 0
    ) {
      continue;
    }

    const distance = Math.hypot(
      enemy.x - player.x,
      enemy.y - player.y
    );

    if (distance <= bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }

  return best
    ? { kind: "enemy", entity: best, distance: bestDistance }
    : null;
}

function findNearestHurlableRock(
  maxDistance = HURL_GRAB_RANGE
) {
  let best = null;
  let bestDistance = maxDistance;

  for (const rock of rocks) {
    if (
      rock.depleted ||
      rock.carriedBy ||
      (Number(rock.hurlTime) || 0) > 0 ||
      (Number(rock.rollTime) || 0) > 0
    ) {
      continue;
    }

    const distance = Math.hypot(
      rock.x - player.x,
      rock.y - player.y
    );

    if (distance <= bestDistance) {
      best = rock;
      bestDistance = distance;
    }
  }

  return best
    ? { kind: "rock", entity: best, distance: bestDistance }
    : null;
}

function findNearestHurlableTarget(
  maxDistance = HURL_GRAB_RANGE
) {
  const enemyTarget =
    findNearestHurlableEnemy(maxDistance);
  const rockTarget =
    findNearestHurlableRock(maxDistance);

  if (!enemyTarget) return rockTarget;
  if (!rockTarget) return enemyTarget;

  return rockTarget.distance < enemyTarget.distance
    ? rockTarget
    : enemyTarget;
}

function sendHurlEnemyAction(enemy, action, payload = {}) {
  if (
    !enemy ||
    typeof onlineClient === "undefined"
  ) {
    return false;
  }

  const enemyType = enemyTypeOf(enemy);
  if (!enemyType) return false;

  return onlineClient.sendSharedEnemyAction(
    enemyType,
    action,
    enemy,
    payload
  );
}

function sendHurlRockAction(rock, action, payload = {}) {
  if (
    !rock ||
    typeof onlineClient === "undefined"
  ) {
    return false;
  }

  return onlineClient.sendEnvironmentAction(
    action,
    rock,
    payload
  );
}

function tryCastHurl() {
  // Hurl takes priority over bow draw state.
  if (player.bowDrawing) {
    player.bowDrawing = false;
    player.bowDrawAmount = 0;
    player.bowReleaseTime = 0;

    if (
      typeof onlineClient !== "undefined" &&
      onlineClient?.connected
    ) {
      onlineClient.sendLocalState(true);
    }
  }

  if (
    typeof onlineClient === "undefined" ||
    !onlineClient.connected
  ) {
    spawnFloatingText(
      player.x,
      player.y - 27,
      "Online only",
      "#ffe38b",
      0.75
    );
    return true;
  }

  const carried = getLocalCarriedHurlObject();

  if (carried) {
    return true;
  }

  const target = findNearestHurlableTarget();

  if (!target) {
    const pointerTarget = getCurrentWorldMouseTarget();
    aimPlayerTowardPoint(pointerTarget.x, pointerTarget.y);
    startHurlReachAnimation(pointerTarget.x, pointerTarget.y);
    return true;
  }

  if (target.kind === "rock") {
    sendHurlRockAction(
      target.entity,
      "hurlGrab"
    );
  } else {
    sendHurlEnemyAction(
      target.entity,
      "hurlGrab"
    );
  }

  return true;
}

function tryThrowCarriedHurlObject(aimAngle) {
  const rock = getLocalCarriedRock();
  if (rock) {
    return sendHurlRockAction(
      rock,
      "hurlThrow",
      { aimAngle }
    );
  }

  const enemy = getLocalCarriedEnemy();
  if (!enemy) return false;

  return sendHurlEnemyAction(
    enemy,
    "hurlThrow",
    { aimAngle }
  );
}

function startHurlReachAnimation(
  targetX,
  targetY
) {
  let dx = targetX - player.x;
  let dy = targetY - player.y;

  const len = Math.hypot(dx, dy);

  if (len > 0.001) {
    dx /= len;
    dy /= len;
  } else {
    dx = Math.cos(player.attackAimAngle || 0);
    dy = Math.sin(player.attackAimAngle || 0);

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      dx = -1;
      dy = 0;
    }
  }

  player.hurlReachTime =
    player.hurlReachDuration;

  player.hurlReachDirX = dx;
  player.hurlReachDirY = dy;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient &&
    typeof onlineClient.sendLocalState === "function"
  ) {
    onlineClient.sendLocalState(true);
  }
}

function setHunterSnareSetupPresentation(
  target,
  active,
  duration = 1.25,
  elapsed = 0
) {
  if (!target) return;

  target.hunterSnareSetting = Boolean(active);
  target.hunterSnareSetDuration = Math.max(
    0.1,
    Number(duration) || 1.25
  );
  target.hunterSnareSetTime = target.hunterSnareSetting
    ? Math.max(
        0,
        Math.min(
          target.hunterSnareSetDuration,
          Number(elapsed) || 0
        )
      )
    : 0;
}

function cancelHunterSnarePlacement(
  showMessage = false,
  notifyServer = true
) {
  if (!player.hunterSnareSetting) return false;

  setHunterSnareSetupPresentation(
    player,
    false,
    player.hunterSnareSetDuration
  );

  if (
    notifyServer &&
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.requestHunterSnareCancel();
  }

  return true;
}

function updateHunterSnarePlacement(dt) {
  if (!player.hunterSnareSetting) return;

  // The server owns completion. The client advances only the presentation
  // timer so the kneel/work animation remains perfectly smooth without
  // uploading a countdown through playerStatePatch.
  player.hunterSnareSetTime = Math.min(
    player.hunterSnareSetDuration,
    player.hunterSnareSetTime + dt
  );
}

function tryCastHuntersSnare() {
  if (!isAbilityUnlocked("huntersSnare")) return false;

  if (player.hunterSnareSetting) {
    return true;
  }

  if ((player.hunterSnareCharges || 0) <= 0) {
    spawnFloatingText(
      player.x,
      player.y - 28,
      "NO CHARGES",
      "#d7d0bd",
      0.7
    );
    return false;
  }

  if (
    typeof onlineClient === "undefined" ||
    !onlineClient?.connected
  ) {
    spawnFloatingText(
      player.x,
      player.y - 28,
      "NO CONNECTION",
      "#d7d0bd",
      0.7
    );
    return false;
  }

  // Start presentation immediately so the skill feels responsive. Movement is
  // suppressed while this flag is active. A movement key that was already held
  // remains held underneath and will naturally resume after completion.
  setHunterSnareSetupPresentation(
    player,
    true,
    1.25,
    0
  );
  player.hunterSnareSetStartX = player.x;
  player.hunterSnareSetStartY = player.y;

  // Flush the exact point where movement was stopped before the begin command.
  // WebSocket ordering guarantees the server sees this position first.
  onlineClient.sendLocalState(true);

  if (!onlineClient.requestHunterSnareBegin()) {
    setHunterSnareSetupPresentation(player, false, 1.25);
    return false;
  }

  return true;
}

function updateHunterSnareChargeUi() {
  const charges = Math.max(
    0,
    Math.min(
      player.hunterSnareMaxCharges || 3,
      Math.floor(Number(player.hunterSnareCharges) || 0)
    )
  );

  const chargeText = document.getElementById("hunterSnareChargeText");
  if (chargeText) {
    chargeText.textContent = `${charges} / ${player.hunterSnareMaxCharges || 3} charges`;
  }

  document.querySelectorAll(".ability-slot").forEach(slot => {
    const badge = slot.querySelector(".ability-charge");
    if (!badge) return;

    const img = slot.querySelector(".ability-slot-img");
    const isSnare = Boolean(
      img &&
      img.alt === skillDisplayName("huntersSnare") &&
      img.style.visibility !== "hidden"
    );

    badge.style.display = isSnare ? "flex" : "none";
    if (isSnare) badge.textContent = String(charges);
  });
}

function setHunterSnareVisual(snare) {
  if (!snare?.id || !snare?.ownerId) return;

  hunterSnareVisuals.set(snare.id, {
    id: snare.id,
    ownerId: snare.ownerId,
    mapId: snare.mapId,
    x: Number(snare.x) || 0,
    y: Number(snare.y) || 0
  });
}

function removeHunterSnareVisual(snareId) {
  if (!snareId) return;
  hunterSnareVisuals.delete(snareId);
}

function removeHunterSnareVisualsForOwner(ownerId) {
  if (!ownerId) return;

  for (const [snareId, snare] of hunterSnareVisuals.entries()) {
    if (snare.ownerId === ownerId) {
      hunterSnareVisuals.delete(snareId);
    }
  }
}

function drawHunterSnarePlacementIndicator(camX, camY) {
  if (!player.hunterSnareSetting) return;

  const screenX = Math.round(player.x - camX);
  const screenY = Math.round(player.y - camY - 32);
  const progress = Math.max(
    0,
    Math.min(
      1,
      player.hunterSnareSetTime /
        player.hunterSnareSetDuration
    )
  );

  ctx.fillStyle = "rgba(28, 32, 29, .82)";
  ctx.fillRect(screenX - 9, screenY, 18, 4);
  ctx.fillStyle = "#b9bcae";
  ctx.fillRect(
    screenX - 8,
    screenY + 1,
    Math.round(16 * progress),
    2
  );
}

function drawHunterSnare(snare, camX, camY) {
  if (!snare || snare.mapId !== currentMapId) return;

  const x = Math.round(snare.x - camX);
  const y = Math.round(snare.y - camY);

  ctx.fillStyle = "rgba(32, 38, 31, .30)";
  ctx.fillRect(x - 6, y, 12, 2);

  // Tiny open-jaw ground trap. Keep it simple enough to read beside the
  // 16x16 character art instead of shrinking the menu icon into the world.
  ctx.fillStyle = "#4f5555";
  ctx.fillRect(x - 5, y - 4, 2, 3);
  ctx.fillRect(x + 4, y - 4, 2, 3);
  ctx.fillRect(x - 4, y - 5, 2, 2);
  ctx.fillRect(x + 3, y - 5, 2, 2);
  ctx.fillRect(x - 3, y - 2, 7, 2);

  ctx.fillStyle = "#a6aaa4";
  ctx.fillRect(x - 4, y - 5, 1, 2);
  ctx.fillRect(x + 4, y - 5, 1, 2);
  ctx.fillRect(x - 1, y - 3, 3, 2);

  ctx.fillStyle = "#292d2c";
  ctx.fillRect(x, y - 2, 1, 1);
}

function breakShadowHide() {
  if (!player.shadowHidden) return;

  player.shadowHidden = false;
  player.shadowHideRevealTime = 0;

  spawnShadowSmokePuff(
    player.x,
    player.y,
    22
  );

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "shadowSmoke",
      {
        x: player.x,
        y: player.y,
        count: 22,
        scale: 1
      }
    );
  }
}

function tryEnterShadowHide() {
  if (player.shadowHidden) return true;

  // Large entry puff, then a tiny delay before the player visually fades.
  spawnShadowSmokePuff(
    player.x,
    player.y,
    50,
    1.5
  );

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "shadowSmoke",
      {
        x: player.x,
        y: player.y,
        count: 50,
        scale: 1.5
      }
    );
  }

  player.shadowHidden = true;
  player.shadowHideRevealTime = player.shadowHideRevealDuration;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = Math.max(player.contactCooldown, 0.15);
  return true;
}
