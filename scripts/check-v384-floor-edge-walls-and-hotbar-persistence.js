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
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));

// Build hotbar persistence.
assert(game.includes('return itemId && hotbarAssignmentCanPersist(itemId)'), "saved hotbar restore must accept persistent build items");
assert(game.includes('saveLocalCharacterState(true);\n  return true;\n}\n\nfunction clearItemFromHotbar'), "hotbar assignment should immediately save");
assert(game.includes('saveLocalCharacterState(true);\n  }\n\n  return changed;'), "hotbar clearing should immediately save");

// Edge placement replaces free rotation/autotiling.
assert(game.includes('function wallPlacementCandidate(worldX, worldY, kind'), "nearest floor-edge selector missing");
for (const edge of ["north", "east", "south", "west"]) assert(game.includes(`edge: "${edge}"`), `${edge} placement edge missing`);
assert(game.includes('function drawWallEdgeHighlight(candidate, camX, camY, valid = true)') && game.includes('drawWallEdgeHighlight(candidate, camX, camY, inRange)'), "floor-edge highlight/invalid-state rendering missing");
assert(network.includes('requestStructurePlacement(kind, x, y, edge = null, supportId = null)'), "edge-aware network request missing");
assert(network.includes('payload.edge = edge'), "wall edge must be transmitted");
assert(!game.includes('woodWallConnections'), "autotiling must remain removed");
assert(!input.includes('rotateSelectedBuildPiece'), "old rotation key must remain removed");

// Tall visuals + thin authoritative collision.
assert(game.includes('ctx.drawImage(woodWallStructureImage, left, top, 16, 32);'), "horizontal wall must render the authored 16x32 sprite at the existing projected height");
assert(game.includes('const height = 32 + cornerExtension;') && game.includes('ctx.drawImage(woodWallStructureImage, left, top, 4, 32);'), "vertical side wall must retain narrow projected sprite art with v385 corner extension support");
assert(game.includes('STRUCTURE_GEOMETRY.collisionRect(structure, 2)'), "client wall collision must use canonical thin edge geometry");
assert(server.includes('STRUCTURE_GEOMETRY.collisionRect(structure, 2)'), "server wall collision must use the same canonical edge geometry");
assert.deepStrictEqual(geometry.collisionRect({ kind: "woodWall", axis: "vertical", x: 8, y: 8 }, 2), { x: 7, y: 0, width: 2, height: 16 });
assert.deepStrictEqual(geometry.collisionRect({ kind: "woodWall", axis: "horizontal", x: 8, y: 8 }, 2), { x: 0, y: 7, width: 16, height: 2 });
assert(server.includes('function normalizedWallFromFloorEdge'), "server normalized edge model missing");
assert(server.includes('structure.axis === wall.axis'), "shared edge identity must include axis");
assert(server.includes('reason = "needsFloor"'), "wall must require an existing floor");
assert(server.includes('reason = "wallAttached"'), "floor removal must be blocked while walls are attached");
assert(network.includes('"REMOVE WALL FIRST"'), "client feedback for supported-floor removal missing");
assert(server.includes('serverPointHitsStructureWall(') && server.includes('{ includeDoors: !ignoreStructureDoors }'), "common occupancy helper must use edge wall collision while allowing enemy door navigation");

console.log("v384 compatibility checks passed: persistent build hotbar + normalized floor-edge walls remain intact under v385 corner rendering.");
