// Slime Story Tiger Paw item action.
// Grab/carry/throw behavior for the equipped Tiger Paw.

function getCarriedEnemyForPlayerId(playerId) {
  if (!playerId) return null;

  for (const { enemy } of activeEnemyRecords({ aliveOnly: true })) {
    if (enemy.carriedBy === playerId) {
      return enemy;
    }
  }

  return null;
}

function getCarriedHurlObjectForPlayerId(playerId) {
  return getCarriedEnemyForPlayerId(playerId);
}

function getLocalCarriedEnemy() {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient?.localPlayerId
  ) {
    return null;
  }

  return getCarriedEnemyForPlayerId(
    onlineClient.localPlayerId
  );
}

function getLocalCarriedHurlObject() {
  if (
    typeof onlineClient === "undefined" ||
    !onlineClient?.localPlayerId
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

function findNearestHurlableTarget(
  maxDistance = HURL_GRAB_RANGE
) {
  // v415 Tiger Paw targets mobs only. Loose rocks are deliberately excluded.
  return findNearestHurlableEnemy(maxDistance);
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

function tryCastHurl() {
  // Tiger Paw owns the grab/throw action directly.
  if (equippedWeapon() !== "tigerPaw") return false;

  // Tiger Paw takes priority over bow draw state.
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
    !onlineClient?.connected
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

  sendHurlEnemyAction(
    target.entity,
    "hurlGrab"
  );

  return true;
}

function tryThrowCarriedHurlObject(aimAngle) {
  // v415 Tiger Paw throws carried mobs only.
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
