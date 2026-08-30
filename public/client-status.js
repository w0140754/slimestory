// Slime Story shared client Burn/Wet status foundation.
// Extracted from game.js in v6-11-238 with function bodies preserved verbatim.
// Environment mutation, temporary rain grass, fire spread, and Fireball simulation
// deliberately remain in game.js for the next checkpoint.
// Classic-script late binding is intentional.

function ensureLocalStatusState(entity, wetDuration = GAME_CONFIG.status.enemyWetDuration) {
  if (!entity) return entity;

  entity.burnTime = Math.max(0, Number(entity.burnTime) || 0);
  entity.burnTickTimer = Math.max(0, Number(entity.burnTickTimer) || 0);
  entity.burnTickInterval = Math.max(0.05, Number(entity.burnTickInterval) || 0.5);
  entity.wetTime = Math.max(0, Number(entity.wetTime) || 0);
  entity.wetDuration = Math.max(0.1, Number(entity.wetDuration) || wetDuration);
  return entity;
}

function entityIsWet(entity) {
  ensureLocalStatusState(entity);
  return Boolean(entity && entity.wetTime > 0);
}

function clearLocalBurnStatus(entity) {
  if (!entity) return false;
  ensureLocalStatusState(entity);
  const changed = entity.burnTime > 0 || entity.burnTickTimer > 0;
  entity.burnTime = 0;
  entity.burnTickTimer = 0;
  return changed;
}

function applyLocalWetStatus(
  entity,
  duration = GAME_CONFIG.status.enemyWetDuration
) {
  if (!entity) return false;
  ensureLocalStatusState(entity, duration);

  clearLocalBurnStatus(entity);
  entity.wetTime = Math.max(
    entity.wetTime,
    Math.max(0.1, Number(duration) || GAME_CONFIG.status.enemyWetDuration)
  );
  return true;
}

function applyLocalBurnStatus(
  entity,
  duration,
  { forceThroughWet = false } = {}
) {
  if (!entity) return false;
  ensureLocalStatusState(entity);

  if (entityIsWet(entity) && !forceThroughWet) {
    return false;
  }

  if (forceThroughWet) {
    entity.wetTime = 0;
  }

  const burnDuration = Math.max(
    0.1,
    Number(duration) || Number(entity.burnDuration) || 3.0
  );
  entity.burnTime = Math.max(entity.burnTime, burnDuration);
  entity.burnTickTimer = entity.burnTickInterval;
  return true;
}

function extinguishPlayer() {
  clearLocalBurnStatus(player);
}

function playerIsWet() {
  return entityIsWet(player);
}

function applyWetStatus() {
  applyLocalWetStatus(player, player.wetDuration);
}

function igniteEnemyFromSpread(
  enemy,
  { forceThroughWet = false } = {}
) {
  if (!enemy?.alive || enemy.burnTime > 0) return;

  const ignited = applyLocalBurnStatus(
    enemy,
    Number(enemy.burnDuration) || 3.0,
    { forceThroughWet }
  );

  if (!ignited) return;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    sendEnemyAction(
      enemy,
      "ignite"
    );
  }
}

function extinguishEnemy(enemy) {
  if (!enemy) return;
  clearLocalBurnStatus(enemy);

  sendEnemyAction(
    enemy,
    "extinguish"
  );
}

function updatePlayerBurnStatus(dt) {
  if (player.isDead) {
    player.burnTime = 0;
    player.burnTickTimer = 0;
    return;
  }

  if (player.burnTime <= 0) return;

  player.burnTime -= dt;
  player.burnTickTimer -= dt;

  if (Math.random() < dt * 10) {
    spawnFireParticle(
      player.x + (Math.random() - 0.5) * 8,
      player.y - 15 + (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 5,
      -7 - Math.random() * 5,
      0.20 + Math.random() * 0.14
    );
  }

  while (
    player.burnTickTimer <= 0 &&
    player.burnTime > 0
  ) {
    // v253: Burn damage is fully server-clocked. The client keeps only this
    // presentation timer; there is deliberately no 2 Hz playerDamageRequest.
    player.burnTickTimer +=
      player.burnTickInterval;
  }

  if (player.burnTime <= 0) {
    player.burnTime = 0;
    player.burnTickTimer = 0;
  }
}

function drawWetStatus(
  screenX,
  screenY,
  wetTime = player.wetTime,
  wetDuration = player.wetDuration
) {
  const safeWetDuration = Math.max(0.001, Number(wetDuration) || 3);
  const safeWetTime = Math.max(0, Number(wetTime) || 0);
  const fadeAlpha =
    safeWetTime >= safeWetDuration * 0.6
      ? 1
      : 0.45 + 0.55 * (safeWetTime / Math.max(0.001, safeWetDuration * 0.6));

  ctx.save();
  ctx.globalAlpha *= fadeAlpha;

  const dripSpeed = 20;
  const emissionInterval = 0.34;
  const travelTime = 8 / dripSpeed;
  const dropsNeeded = Math.ceil(travelTime / emissionInterval) + 2;
  const laneXs = [-4, -1, 2, 5];

  for (let lane = 0; lane < laneXs.length; lane++) {
    const laneDelay = lane * 0.06;
    const latestEmission = Math.floor((worldTime - laneDelay) / emissionInterval);

    for (let back = 0; back < dropsNeeded; back++) {
      const emissionIndex = latestEmission - back;
      if (emissionIndex < 0) continue;

      const spawnTime = laneDelay + emissionIndex * emissionInterval;
      const dropAge = worldTime - spawnTime;

      if (dropAge < 0 || dropAge > travelTime) continue;

      const dropX = screenX + laneXs[lane] + (((lane + emissionIndex) % 3 === 0) ? 1 : 0);
      const dropY = Math.round(screenY - 12 + dropAge * dripSpeed);

      ctx.fillStyle = "#78bee1";
      ctx.fillRect(dropX, dropY, 1, 2);

      ctx.fillStyle = "#d1f2ff";
      ctx.fillRect(dropX, dropY, 1, 1);
    }
  }

  if (Math.sin(worldTime * 8.5) > 0.35) {
    ctx.fillStyle = "#9fd8ef";
    ctx.fillRect(screenX - 1, screenY - 2, 1, 1);
    ctx.fillRect(screenX + 3, screenY - 1, 1, 1);
  }

  ctx.restore();
}
