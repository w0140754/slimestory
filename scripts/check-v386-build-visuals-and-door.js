"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));
const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.427");
assert(server.includes('const BUILD_VERSION = "6-11-427";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-427";'));

assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"]);'), "Wood Door must join the unified build hotbar list");
assert(game.includes("if (heldBuildPieceForCurrentDraw()) return null;"), "build selection must render local and replicated remote build holders empty-handed");
assert(game.includes("function structureFadeAlpha(structure, alpha = 1)"), "wall visibility fade helper missing");
assert(game.includes(": 0.58);"), "ordinary wall fade should retain canopy-style partial transparency");
assert(!game.includes("AUTO_DOOR_OPEN_RADIUS"), "v388 must not restore proximity-only auto doors");
assert(game.includes("const DOOR_ADJACENT_DISTANCE = 10;"), "directional door adjacency threshold missing");
assert(game.includes("function drawWoodDoor("), "Wood Door renderer missing");
assert(game.includes("function doorAllowsLocalPlayerStep("), "movement-triggered client door passage rule missing");
assert(game.includes("doorAllowsLocalPlayerStep(structure, options.fromX, options.fromY, x, y, playerRadius)"), "local player collision must use directional door passage");
assert(game.includes('if (kind === "woodDoor") return Math.max(0, Number(player.woodDoors) || 0);'), "door inventory count missing");
assert(game.includes("woodDoors: Math.max(0, Math.floor(Number(player.woodDoors) || 0))"), "door local-save resource missing");
assert(game.includes("player.woodDoors = clampLocalSaveInteger(save.resources?.woodDoors"), "door local-save restore missing");

assert(html.includes('data-build-item="woodDoor"'), "Wood Door inventory item missing");
assert(html.includes('data-craft-recipe="woodDoor"'), "Wood Door crafting button missing");
assert(html.includes("Wood Door</span>"), "Wood Door craft label missing");
assert(exists("public", "assets", "ui", "wood_floor.png"), "full snapshot must include Wood Floor icon");
assert(exists("public", "assets", "ui", "wood_wall.png"), "full snapshot must include Wood Wall icon");
assert(exists("public", "assets", "ui", "wood_door.png"), "Wood Door icon missing");
assert(enemies.includes('woodDoor: Object.freeze({'), "Wood Door ground-loot profile missing");

assert(server.includes('woodDoor: Object.freeze({ repeatable: true, resourceKey: "woodDoors", outputCount: 1, ingredients: Object.freeze({ wood: 4 }) })'), "server Wood Door recipe missing");
assert(!server.includes("AUTO_DOOR_OPEN_RADIUS"), "server must not restore proximity-only auto doors");
assert(server.includes("const DOOR_ADJACENT_DISTANCE = 10;"), "server directional door threshold missing");
assert(server.includes('["woodWall", "woodDoor"].includes(structure.kind)'), "door must share wall-edge collision/boundary rules");
assert(server.includes("function serverDoorAllowsPlayerStep("), "server directional door passage helper missing");
assert(server.includes("serverPlayerStepHitsStructureWall(id, mapId"), "authoritative movement must use directional door passage collision");
assert(server.includes("function enemyMapPointAllowed(enemy, x, y, padding = 0,"), "enemy occupancy path missing");
assert(server.includes("navigationPlanning = false") && server.includes("ignoreStructureDoors: Boolean(navigationPlanning)") && server.includes("{ includeDoors: !ignoreStructureDoors }"), "enemy navigation may plan through doors while actual movement retains door collision");
assert(server.includes('if (!["wood", "stone", "flower", "goldSlimeBubble", "greenJellyCube", "icedCoffee", "woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable", "inventoryItem"].includes(kind))'), "Wood Door must be valid shared reclaim loot");
assert(server.includes('} else if (resource.kind === "woodDoor") {'), "Wood Door pickup restoration missing");
assert(network.includes('["woodWall", "woodDoor"].includes(kind)'), "network edge payload must support doors");
assert(network.includes("totalWoodDoors"), "network door resource sync missing");

console.log("v386 compatibility checks passed: empty-hand building, wall fade, Wood Door persistence/crafting/reclaim, and v388 directional passage behavior.");
