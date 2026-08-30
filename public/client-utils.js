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

function pointInRect(x, y, rect) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function subtractInterval(baseInterval, cutInterval) {
  const [start, end] = baseInterval;
  const [cutStart, cutEnd] = cutInterval;

  if (cutEnd <= start || cutStart >= end) {
    return [baseInterval];
  }

  const pieces = [];

  if (cutStart > start) {
    pieces.push([start, Math.min(cutStart, end)]);
  }

  if (cutEnd < end) {
    pieces.push([Math.max(cutEnd, start), end]);
  }

  return pieces.filter(([a, b]) => b - a > 0.5);
}
