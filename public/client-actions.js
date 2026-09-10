// Slime Story shared client targeting helpers.
// Retained for current weapon/tool input paths after the retired Wand action layer was removed.

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

function updateCanvasCursor() {
  canvas.style.cursor = "default";
}
