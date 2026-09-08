// Slime Story generic client helpers.
// These helpers are intentionally gameplay-domain agnostic.

function tickTimer(object, key, dt) {
  if (object[key] <= 0) return false;
  object[key] -= dt;
  if (object[key] < 0) object[key] = 0;
  return object[key] > 0;
}

function clampToWorld(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));

  const dx = cx - nearestX;
  const dy = cy - nearestY;

  return dx * dx + dy * dy < radius * radius;
}

