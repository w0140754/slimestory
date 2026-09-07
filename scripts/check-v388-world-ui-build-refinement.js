"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const input = read("public", "client-input.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");
const server = read("server.js");
const topology = read("public", "shared", "structure-topology.js");

assert.strictEqual(pkg.version, "0.6.11.428");
assert(server.includes('const BUILD_VERSION = "6-11-428";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-428";'));
assert.strictEqual(world.version, 414);
assert.strictEqual(world.worldGrid.radius, 1);
assert.strictEqual(Object.keys(world.maps).length, 9, "v388 must not alter the active coordinate world");

assert(!html.includes('id="worldGridStatus"'), "Spawn/Distance/Radius banner must be removed");
assert(html.includes('id="worldMiniMap"'), "minimap must remain");
assert(html.includes("--mini-cell: 26px"), "desktop minimap must be enlarged");
assert(html.includes("top: 0;") && html.includes("right: 0;"), "mobile minimap must be flush top-right");
assert(html.includes("transition: transform 340ms"), "minimap marker glide missing");
assert(game.includes("function ensureWorldMiniMapCells("), "fixed-world minimap cell builder missing");
assert(game.includes("playerMarker.style.transform = `translate(${x}px, ${y}px)`"), "minimap player-marker glide target missing");

assert(game.includes("function drawMapTransitionPlayerAtScreen("), "mobile-safe transition player renderer missing");
assert(game.includes("ctx.setTransform(GAME_RENDER_SCALE, 0, 0, GAME_RENDER_SCALE, 0, 0);"), "transition player must restore logical render scale");

assert(html.includes("#menuItemHotkeyRail {\n    width: 208px;"), "desktop assignment rail must be large enough for readable icons");
assert(html.includes("min-height: 62px;"), "desktop assignment boxes must be enlarged");
assert(html.includes("width: 34px;\n    height: 34px;"), "desktop assignment icons must be readable");

for (const retired of ["grantBowVisualTest", "grantDebugProgressionPoints", "requestDebugCoins", "requestDebugArrows", "debugGrantCoins", "debugGrantArrows"]) {
  assert(!input.includes(retired) && !network.includes(retired) && !server.includes(retired), `retired F8/F9 debug path remains: ${retired}`);
}
assert(!input.includes('key === "f8"') && !input.includes('key === "f9"'), "F8/F9 debug hotkeys must stay removed");

assert(game.includes("let bestPriority = Infinity;"), "Pickaxe structure priority missing");
assert(game.includes('structure.kind === "torch"') && game.includes("BUILD_EDGE_STRUCTURE_KINDS.includes(structure.kind)") && game.includes(": 2;"), "Pickaxe priority must keep mounted torches first, walls/doors over floors");

assert(!game.includes("AUTO_DOOR_OPEN_RADIUS") && !server.includes("AUTO_DOOR_OPEN_RADIUS"), "proximity-only doors must stay retired");
assert(game.includes("function doorAllowsLocalPlayerStep("), "client directional door rule missing");
assert(game.includes("travelling through the door channel refreshes the open/passage state") && game.includes("localDoorPassageUntil = performance.now() + DOOR_PASSAGE_MS;"), "client doorway anti-stuck traversal rule missing");
assert(server.includes("function serverDoorAllowsPlayerStep("), "server directional door rule missing");
assert(server.includes("const playerDoorPassages = new Map();"), "server passage window state missing");
assert(server.includes("serverPlayerStepHitsStructureWall(id, mapId"), "authoritative movement is not using directional door collision");

assert(game.includes("testWoodSupply: Object.freeze({"), "client Test Wood source missing");
assert(server.includes('testWoodSupply: Object.freeze({ repeatable: true, resourceKey: "wood", outputCount: 100'), "server Test Wood source missing");
assert(html.includes('data-craft-recipe="testWoodSupply"'), "Test Wood crafting-table button missing");
assert(network.includes('wood: "totalWood"'), "Test Wood craft result must use server-authoritative total without double-granting");

assert(game.includes("function automaticRoofRegions()"), "automatic enclosure roof detection missing");
assert(topology.includes("if (!boundaries.has(edge.key))"), "roof must require every exposed surface edge to be closed by a wall/door boundary");
assert(game.includes("function drawAutomaticStructureRoofs("), "automatic roof renderer missing");
assert(game.includes("if (inside) continue;"), "completed-house roof must disappear while the player is inside");
assert(app.includes("drawAutomaticStructureRoofs(renderCamera.x, renderCamera.y);"), "roof renderer must be wired over the sorted world layer");
assert(!server.includes("roofSnapshot") && !server.includes("roofPlaced"), "automatic roofs must not add network state/heartbeat traffic");

console.log("v388 retained world/UI/build checks passed: HUD cleanup, gliding minimap, Pickaxe priority, anti-stuck automatic doors, Test Wood, and zero-network automatic roofs.");
