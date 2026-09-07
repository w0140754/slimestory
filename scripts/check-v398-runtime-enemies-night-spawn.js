"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.406");
assert.strictEqual(world.version, 406);
assert(server.includes('const BUILD_VERSION = "6-11-406";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-406";'));
assert(html.includes('/game.js?v=406') && html.includes('/client-input.js?v=406'));

// Coordinate-world definitions now contain population rules, never fixed mobs.
for (const [mapId, map] of Object.entries(world.maps)) {
  assert(!Object.prototype.hasOwnProperty.call(map, "enemySpawns"), `${mapId} still stores fixed enemy positions`);
  assert(map.enemyGeneration, `${mapId} missing runtime enemyGeneration rules`);
}
const spawnMapId = world.worldGrid.startMapId;
const spawnRules = world.maps[spawnMapId].enemyGeneration;
assert.strictEqual(spawnRules.slimeCount, 0, "Spawn must have no normal daytime slimes");
assert.strictEqual(spawnRules.mushroomCount, 0, "Spawn must have no normal daytime mushrooms");
assert(server.includes("function generateRuntimeEnemyDefinitions()"));
assert(server.includes("const GENERATED_NORMAL_ENEMY_SPAWNS = generateRuntimeEnemyDefinitions();"));
assert(server.includes("Math.random() * Math.max(1, dimensions.width - minEdge * 2)"));
assert(game.includes("coordinate-world mobs are server-generated at runtime"));
assert(app.includes("WORLD_CONTENT coordinate registry:"));

// Escape must remain the menu key and must not cancel build placement.
const menuHandler = input.slice(input.indexOf("function handleMenuKeyDown"), input.indexOf("function handleWeaponHotkey"));
assert(!menuHandler.includes("cancelBuildPlacement"), "Escape must not cancel an active build item");
assert(menuHandler.includes("setInventoryOpen(!inventoryOpen)"), "Escape should still toggle the inventory/menu");

// Doors stay open until the doorway is physically clear.
assert(server.includes("function serverDoorOccupied(structure)"));
assert(server.includes("if (serverDoorOccupied(structure))"));
assert(server.includes("passage.expiresAt = now + DOOR_PASSAGE_MS"));
assert(game.includes("keep a door visually/collision-open while the local player is"));

// Night event is Spawn-only, relentless on entry, progressive, and capped.
assert(server.includes("const NIGHT_SLIME_MAP_ID"));
assert(server.includes("const NIGHT_SLIME_CAP = 8;"));
assert(server.includes("const NIGHT_SLIME_INITIAL_COUNT = 2;"));
assert(server.includes("const NIGHT_SLIME_SPAWN_INTERVAL_SECONDS = 10;"));
assert(server.includes("mapId: NIGHT_SLIME_MAP_ID"));
assert(server.includes("function activateNextNightSlime()"));
assert(server.includes("nightSlimeWaveSpawnTimer"));
assert(server.includes("relentlessNightAggro"));
assert(server.includes("relentlessNightAggro\n        ? Infinity"));
assert(server.includes("forceNightSlimeAggro(slime)"));

console.log("v398 runtime-enemy/night-spawn checks passed: no fixed mob coordinates, Escape preserves build mode, occupancy-safe doors, and Spawn-only progressive relentless night slimes.");
