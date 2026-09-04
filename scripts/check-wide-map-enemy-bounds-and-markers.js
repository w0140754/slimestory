"use strict";

const fs = require("fs");
const path = require("path");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");

const protoWest = WORLD_CONTENT.maps.prototypeIslandWest;
if (!protoWest || Number(protoWest.dimensions?.width) <= 640) {
  throw new Error("ProtoWest must remain a >640px-wide regression fixture");
}
// The live editor-authored ProtoWest population is allowed to move as map work
// evolves. Keeping a specific enemy beyond x=628 as a permanent fixture made
// this regression overwrite-sensitive. The code checks below verify that enemy
// bounds derive from the map dimensions rather than the old 640px constants.

const checks = [
  [server.includes("const dimensions = mapWorldDimensions(slime.mapId);") && server.includes("dimensions.width - 12") && server.includes("dimensions.height - 8"), "slime wander uses map dimensions"],
  [server.includes("const dimensions = mapWorldDimensions(goblin.mapId);") && server.includes("dimensions.width - 12") && server.includes("dimensions.height - 8"), "goblin wander uses map dimensions"],
  [server.includes("const dimensions = mapWorldDimensions(ghost.mapId);") && server.includes("dimensions.width - 10") && server.includes("dimensions.height - 5"), "ghost wander uses map dimensions"],
  [server.includes("const ghostDimensions = mapWorldDimensions(ghost.mapId);") && server.includes("ghostDimensions.width - 8") && server.includes("ghostDimensions.height - 5"), "ghost movement clamp uses map dimensions"],
  [!server.includes("Math.min(628, slime.homeX") && !server.includes("Math.min(628,\n        goblin.homeX") && !server.includes("Math.min(630, ghost.homeX") && !server.includes("Math.min(632, ghost.x"), "legacy 640x400 enemy clamps removed"],
  [game.includes("const bubbleWidth = 18;") && game.includes("const bubbleHeight = 18;") && game.includes("const bubbleY = screenY - 42;") && game.includes("rgba(248, 244, 221, 0.78)"), "role bubbles compact, raised, and translucent"],
  [game.includes("ctx.drawImage(coinImage, left, top);") && game.includes("ctx.drawImage(craftRoleAxeImage, left, top);"), "shop/craft icons draw at native size"],
  [!game.includes("ctx.drawImage(coinImage, left - 1, top - 2, 12, 12)") && !game.includes("ctx.drawImage(craftRoleAxeImage, left, top - 1, 10, 10)"), "scaled marker icons removed"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Wide-map/marker regression: ${label}`);
}

console.log("Wide-map enemy bounds and native NPC marker checks passed.");
