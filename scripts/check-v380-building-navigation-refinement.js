"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const combat = read("public", "client-combat.js");
const clientWorld = read("public", "client-world.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.380", "package version must be v380");
assert(server.includes('const BUILD_VERSION = "6-11-380";'), "server build marker must be v380");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-380";'), "client build marker must be v380");

assert.strictEqual(world.worldGrid.mapWidth, 400, "grid maps must be 400px wide");
assert.strictEqual(world.worldGrid.mapHeight, 400, "grid maps must be 400px high");
for (const [mapId, map] of Object.entries(world.maps).filter(([, value]) => value?.grid)) {
  assert.strictEqual(map.grid.distance, Math.abs(map.grid.x) + Math.abs(map.grid.y), `${mapId} must use Manhattan distance`);
  assert.deepStrictEqual(map.dimensions, { width: 400, height: 400 }, `${mapId} must remain 400x400`);
}

assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "woodWall"]);'), "Wood Floor + Wood Wall must be assignable to the 1-9 belt");
assert(html.includes('data-build-item="woodFloor" data-hotbar-assignable="true"'), "Wood Floor inventory item must be hotbar assignable");
assert(html.includes('data-build-item="woodWall" data-hotbar-assignable="true"'), "Wood Wall inventory item must be hotbar assignable");
assert(app.includes("drawPlayerStructureFloors(camX, camY);"), "Wood Floors must be drawn during normal world rendering");
assert(game.includes('ctx.fillStyle = "#8f6338"; ctx.fillRect(x, y, 16, 16);'), "Wood Floor needs an opaque visible base fill");

assert(server.includes("else if (playerState.weaponIndex !== 11) reason = \"needPickaxe\";"), "only Pickaxe may reclaim structures");
assert(server.includes("spawnSharedResource(\n    removed.mapId,\n    removed.kind,"), "destroyed structures must drop the exact placed piece");
assert(server.includes('["wood", "stone", "flower", "goldSlimeBubble", "icedCoffee", "woodFloor", "woodWall"]'), "shared loot must accept both building piece types");
assert(server.includes('} else if (resource.kind === "woodFloor") {') && server.includes('} else if (resource.kind === "woodWall") {'), "building loot pickup must restore exact inventory counts");
assert(combat.includes("if (!tryHitPlayerStructure())"), "Pickaxe combat path must attempt structure hits");

assert(game.includes("let forceSuppressLocalPlayerRendering = false;"), "transition duplicate-player suppression flag missing");
assert(game.includes("return forceSuppressLocalPlayerRendering || mapTransitionPhase !== \"idle\";"), "local player must stay suppressed through transition frames");
assert(game.includes("sourceX: player.x") && game.includes("sourceY: player.y"), "transition must capture outgoing perpendicular coordinates");
assert(game.includes("function activateMap(mapId, entrySide, transitionContext = null)"), "map activation must accept transition context");
assert(game.includes("player.y = clampToWorld(Number(transitionContext.sourceY)"), "east/west crossings must preserve Y");
assert(game.includes("player.x = clampToWorld(Number(transitionContext.sourceX)"), "north/south crossings must preserve X");

assert(clientWorld.includes('treeTrunkImage.src = "assets/interactive_tree_trunk_damaged_v376.png?v=380";'), "fresh tree must use the clean swapped trunk state");
assert(clientWorld.includes('treeDamagedTrunkImage.src = "assets/interactive_tree_trunk_v376.png?v=380";'), "first-hit tree must use the cut swapped trunk state");

console.log("v380 building/navigation refinement OK: visible floors, 1-9 assignment, Pickaxe reclaim, seam continuity, single-player transition render, and corrected tree states.");
