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
const input = read("public", "client-input.js");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.394");
assert(server.includes('const BUILD_VERSION = "6-11-394";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-394";'));

// Build hotbar persistence.
assert(game.includes('return itemId && hotbarAssignmentCanPersist(itemId)'), "saved hotbar restore must accept persistent build items");
assert(game.includes('saveLocalCharacterState(true);\n  return true;\n}\n\nfunction clearItemFromHotbar'), "hotbar assignment should immediately save");
assert(game.includes('saveLocalCharacterState(true);\n  }\n\n  return changed;'), "hotbar clearing should immediately save");

// Edge placement replaces free rotation/autotiling.
assert(game.includes('function wallPlacementCandidate(worldX, worldY, kind'), "nearest floor-edge selector missing");
for (const edge of ["north", "east", "south", "west"]) assert(game.includes(`edge: "${edge}"`), `${edge} placement edge missing`);
assert(game.includes('drawWallEdgeHighlight(candidate, camX, camY, inRange)'), "floor-edge highlight missing");
assert(network.includes('requestStructurePlacement(kind, x, y, edge = null)'), "edge-aware network request missing");
assert(network.includes('payload.edge = edge'), "wall edge must be transmitted");
assert(!game.includes('woodWallConnections'), "autotiling must remain removed");
assert(!input.includes('rotateSelectedBuildPiece'), "old rotation key must remain removed");

// Tall visuals + thin authoritative collision.
assert(game.includes('ctx.fillRect(left, top, 16, 32);'), "horizontal wall must render roughly two floor tiles tall");
assert(game.includes('ctx.fillRect(left, top, 4, height);') && game.includes('const height = 32 + cornerExtension;'), "vertical side wall must retain its tall projected art with v385 corner extension support");
assert(game.includes('width: 2, height: 16') && game.includes('width: 16, height: 2'), "client wall collision must be thin edge geometry");
assert(server.includes('width: 2, height: 16') && server.includes('width: 16, height: 2'), "server wall collision must match client edge geometry");
assert(server.includes('function normalizedWallFromFloorEdge'), "server normalized edge model missing");
assert(server.includes('structure.axis === wall.axis'), "shared edge identity must include axis");
assert(server.includes('reason = "needsFloor"'), "wall must require an existing floor");
assert(server.includes('reason = "wallAttached"'), "floor removal must be blocked while walls are attached");
assert(network.includes('"REMOVE WALL FIRST"'), "client feedback for supported-floor removal missing");
assert(server.includes('if (serverPointHitsStructureWall(mapId, x, y, Math.max(4, padding))) return false;'), "common occupancy helper must use edge wall collision");

console.log("v384 compatibility checks passed: persistent build hotbar + normalized floor-edge walls remain intact under v385 corner rendering.");
