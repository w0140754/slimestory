"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const html = read("public", "index.html");
const enemyRuntime = read("public", "client-enemy-runtime.js");
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert.strictEqual(pkg.version, "0.6.11.431");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-431";'));

// Door placement accepts a 90-degree wall at either endpoint, client + server.
assert(game.includes("function doorCandidateHasFlankingWalls(candidate)"));
assert(game.includes("A rotated wall that terminates at the door endpoint counts as the"));
assert(game.includes("Math.abs(Math.abs(Number(structure.y) - endpoint.y) - 8) < 1"));
assert(server.includes("function doorHasFlankingWalls(mapId, wall)"));
assert(server.includes("a perpendicular wall meeting the same endpoint is also valid"));

// Closed doors are real barriers; pathfinding can plan toward the doorway but
// movement/combat only pass it during the brief player-open passage window.
assert(server.includes("function serverDoorCurrentlyOpen(structure"));
assert(server.includes('structure?.kind === "woodDoor" && !ignoreDoors && !serverDoorCurrentlyOpen(structure)'));
assert(server.includes("navigationPlanning = false"));
assert(server.includes("ignoreStructureDoors: Boolean(navigationPlanning)"));
assert(server.includes("{ ignoreDoors: true }"));
assert(game.includes('structure?.kind === "woodDoor" && !doorVisuallyOpen(structure)'));

// Visibility/presentation polish.
assert(game.includes("const HOUSE_FOREGROUND_DOOR_ALPHA = 0.52;"));
assert(game.includes("const STRUCTURE_COVER_DOOR_ALPHA = 0.72;"));
assert(game.includes("drawHeldArmWithStructureClip"), "weapon hand/arm should share the wall clip");
assert(game.includes('"build-hotbar-upright"'));
assert(html.includes(".hotbar-slot img.build-hotbar-upright"));
assert(html.includes("rotate(0deg)"), "build icons should be rotated 90 degrees clockwise from the old -90deg hotbar pose");

// Night slimes remain server-runtime entities rather than fixed world-content spawns.
for (const map of Object.values(world.maps)) {
  assert(!Object.prototype.hasOwnProperty.call(map, "enemySpawns"), "coordinate maps must not store fixed enemy spawn coordinates");
}
assert(server.includes("const NIGHT_SLIME_CAP = 8;"));
assert(server.includes("const NIGHT_SLIME_MAP_ID"));
assert(server.includes("const GENERATED_NIGHT_SLIME_SPAWNS = nightSlimeSpawnDefinitions();"));
assert(server.includes("nightOnly: true"));
assert(server.includes("const startsDormant = Boolean(nightOnly);"));
assert(server.includes("function serverWorldIsNight("));
assert(server.includes("function activateNightSlime("));
assert(server.includes("function tickNightSlimeLifecycle(dt)"));
assert(server.includes("outsideX = -10") && server.includes("dimensions.width + 10"), "night slimes should enter from just outside a map edge");
assert(server.includes("Sunrise starts at 05:00"));
assert(server.includes("function despawnNightSlime("));
assert(server.includes("despawn: true"));
assert(enemyRuntime.includes("const sunriseDespawn = Boolean(message.despawn);"));
assert(enemyRuntime.includes("enemy.alive && !sunriseDespawn"), "sunrise despawn must not play a death burst");

console.log("v397 door/night refinement retained: corner doors, closed-door blocking, clearer doors/hand clipping, upright build hotbar icons, and runtime night-slime lifecycle.");
