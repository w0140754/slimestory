// Slime Story client item-action foundation.
// Fire Wand, Rain Wand, and Tiger Paw actions are driven directly by equipped items.

function getCurrentWorldMouseTarget() {
  return {
    x: Math.max(0, Math.min(world.width, currentCamX + mouseCanvasX)),
    y: Math.max(0, Math.min(world.height, currentCamY + mouseCanvasY))
  };
}

function aimPlayerTowardPoint(targetX, targetY) {
  const dx = targetX - player.x;
  const dy = targetY - (player.y - 8);
  player.attackAimAngle = Math.atan2(dy, dx);
}

function resolvePlayerPointTarget(
  targetX,
  targetY,
  {
    minRange = 0,
    maxRange = Infinity,
    insetX = 5,
    insetTop = 5,
    insetBottom = 5
  } = {}
) {
  const originX = player.x;
  const originY = player.y - 8;
  let dx = Number(targetX) - originX;
  let dy = Number(targetY) - originY;
  let distance = Math.hypot(dx, dy);

  if (!Number.isFinite(distance) || distance <= 0.001) {
    dx = Math.cos(player.attackAimAngle || 0);
    dy = Math.sin(player.attackAimAngle || 0);
    distance = 1;
  }

  const clampedDistance = Math.max(
    Math.max(0, Number(minRange) || 0),
    Math.min(
      Number.isFinite(Number(maxRange)) ? Number(maxRange) : distance,
      distance
    )
  );
  const scale = clampedDistance / distance;
  const resolvedX = clampToWorld(
    originX + dx * scale,
    insetX,
    world.width - insetX
  );
  const resolvedY = clampToWorld(
    originY + dy * scale,
    insetTop,
    world.height - insetBottom
  );

  return {
    x: resolvedX,
    y: resolvedY,
    angle: Math.atan2(resolvedY - originY, resolvedX - originX),
    radius: Math.hypot(resolvedX - originX, resolvedY - originY)
  };
}

function updateCanvasCursor() {
  canvas.style.cursor = "default";
}

function actionCooldownRemaining(actionId) {
  const nowMs = Date.now();
  const endAtMs = Number(player.actionCooldownEndTimes?.[actionId]) || 0;
  if (endAtMs > 0) {
    return Math.max(0, (endAtMs - nowMs) / 1000);
  }
  return Math.max(0, Number(player.actionCooldowns?.[actionId]) || 0);
}

function actionCooldownDuration(actionId) {
  if (actionId === "fireball") return fireballCooldown();
  if (actionId === "rainCloud") return rainCloudCooldown();
  return 0;
}

function actionIsOnCooldown(actionId) {
  return actionCooldownRemaining(actionId) > 0;
}

function startActionCooldown(actionId, duration = null, startedAtMs = Date.now()) {
  if (!player.actionCooldowns) player.actionCooldowns = {};
  if (!player.actionCooldownEndTimes) player.actionCooldownEndTimes = {};

  const resolvedDuration = Number.isFinite(duration)
    ? Math.max(0, duration)
    : actionCooldownDuration(actionId);
  const startMs = Number.isFinite(Number(startedAtMs))
    ? Number(startedAtMs)
    : Date.now();
  const proposedEndAtMs = startMs + resolvedDuration * 1000;
  const existingEndAtMs = Number(player.actionCooldownEndTimes[actionId]) || 0;

  player.actionCooldownEndTimes[actionId] = Math.max(existingEndAtMs, proposedEndAtMs);
  player.actionCooldowns[actionId] = actionCooldownRemaining(actionId);
}

function showActionCooldownMessage(actionId) {
  const remaining = actionCooldownRemaining(actionId);
  if (remaining <= 0) return;

  spawnFloatingText(
    player.x,
    player.y - 31,
    `${remaining.toFixed(1)}S`,
    "#bbb7c8",
    0.48
  );
}
