"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.380", "package must remain on current v380 build");
assert(server.includes('const BUILD_VERSION = "6-11-380";'), "server build marker must be v380");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-380";'), "client build marker must be v380");

assert(server.includes("const sharedStructures = new Map();"), "server-authoritative structure registry missing");
assert(server.includes("const sharedStructuresByMap = new Map();"), "map-indexed structure registry missing");
assert(server.includes("const MAX_STRUCTURES_PER_MAP = 96;"), "structure map cap missing");
assert(server.includes("const BUILD_GRID_SIZE = 16;"), "16px server build grid missing");
assert(server.includes("function handleStructurePlaceRequest"), "server placement handler missing");
assert(server.includes('broadcastToMap(structure.mapId, { type: "structurePlaced", structure });'), "change-only structure placement broadcast missing");
assert(server.includes('type: "structureSnapshot"'), "map-entry structure snapshot missing");
assert(server.includes('woodFloor: Object.freeze({ repeatable: true, resourceKey: "woodFloors", outputCount: 4'), "Wood Floor recipe missing");
assert(server.includes('woodWall: Object.freeze({ repeatable: true, resourceKey: "woodWalls", outputCount: 2'), "Wood Wall recipe missing");

assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "woodWall"]);'), "building pieces must be hotbar-assignable");
assert(game.includes("const placedStructuresByMap = new Map();"), "client structure state missing");
assert(game.includes("function beginBuildPlacement(kind)"), "client build placement mode missing");
assert(game.includes("function drawWoodFloor("), "Wood Floor renderer missing");
assert(game.includes("function drawWoodWall("), "Wood Wall renderer missing");
assert(game.includes("function hitsPlayerStructureObstacle("), "Wood Wall collision missing");
assert(network.includes("requestStructurePlacement(kind, x, y)"), "network placement request missing");
assert(network.includes('this.socket.send(JSON.stringify({ type: "structureDestroy", structureId }));'), "network destroy request missing");
assert(html.includes('data-build-item="woodFloor"') && html.includes('data-hotbar-assignable="true"'), "Wood Floor inventory assignment UI missing");
assert(html.includes('data-build-item="woodWall"'), "Wood Wall inventory UI missing");

console.log("v379 persistent world building OK: authoritative, change-only structures with crafting, collision, rendering, and hotbar assignment.");
