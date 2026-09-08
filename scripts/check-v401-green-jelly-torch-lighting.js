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
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const input = read("public", "client-input.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.431");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(html.includes('/game.js?v=431'));

// Green Jelly Cube loot + crafting.
assert(fs.existsSync(path.join(root, "public", "assets", "green_jelly_cube.png")));
assert(server.includes('(enemy.variant || "green") === "green"'));
assert(server.includes('Math.random() < 0.30'));
assert(server.includes('resourceKind: "greenJellyCube"'));
assert(server.includes('torch: Object.freeze({ repeatable: true, resourceKey: "torches", outputCount: 1, ingredients: Object.freeze({ wood: 1, greenJellyCubes: 1 }) })'));
assert(game.includes('ingredients: Object.freeze({ wood: 1, greenJellyCubes: 1 })'));
assert(html.includes('data-craft-recipe="torch"'));
assert(html.includes('id="inventoryGreenJellyCubeCount"'));
assert(network.includes('message.totalGreenJellyCubes'));
assert(enemies.includes('greenJellyCube: Object.freeze({'));

// Torch hold/place/reclaim lifecycle.
assert(fs.existsSync(path.join(root, "public", "assets", "torch_v1.png")));
assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"])'));
assert(game.includes('selectedBuildPiece === "torch"'));
assert(game.includes('function drawPlacedTorch(structure, camX, camY, alpha = 1)'));
assert(server.includes('message?.kind === "torch" ? "torch" : message?.kind === "chest" ? "chest" : message?.kind === "craftingTable" ? "craftingTable" : null'));
assert(server.includes('kind === "woodDoor" ? "woodDoors" : kind === "chest" ? "chests" : kind === "craftingTable" ? "craftingTables" : "torches"'));
assert(server.includes('spawnSharedResource(\n    removed.mapId,\n    removed.kind,'));
assert(server.includes('"greenJellyCube", "icedCoffee", "woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"'));
assert(input.includes('selectedBuildPiece === "torch"'));

// Lighting: dark midnight, softer edges, held + placed lights.
assert(game.includes('const midnightAlpha = 0.992;'), 'night must remain at least as dark as the original v401 torch pass');
assert(game.includes('function carveTorchLight('));
assert(game.includes('bufferCtx.globalCompositeOperation = "destination-out"'));
assert(game.includes('structure?.kind !== "torch"'));
assert(game.includes('buildPieceCount("torch") > 0'));

// Clock is now physically grouped beneath the minimap in the upper-right stack.
assert(html.includes('id="worldMiniMapStack"'));
assert(html.indexOf('id="worldMiniMap"') < html.indexOf('id="worldClockHud"'));
assert(html.includes('#worldMiniMapStack'));

console.log("v401 Green Jelly Cube / torch lighting checks passed.");
