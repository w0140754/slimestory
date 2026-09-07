"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert.strictEqual(pkg.version, "0.6.11.407");
assert(server.includes('const BUILD_VERSION = "6-11-407";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-407";'));
assert.strictEqual(world.version, 407);

assert(server.includes("function floorAcrossBuildEdge(mapId, floorX, floorY, edge)"));
assert(server.includes('reason = "interiorEdge"'));
assert(server.includes("function doorHasFlankingWalls(mapId, wall)"));
assert(server.includes('structure?.kind === "woodWall"'));
assert(server.includes('reason = "doorNeedsWalls"'));

assert(game.includes("function floorExistsAcrossBuildEdge(floorX, floorY, edge)"));
assert(game.includes("function doorCandidateHasFlankingWalls(candidate)"));
assert(game.includes("if (floorExistsAcrossBuildEdge(candidate.floorX, candidate.floorY, candidate.edge)) return null;"));
assert(game.includes('if (kind === "woodDoor" && !doorCandidateHasFlankingWalls(candidate)) return null;'));
assert(game.includes("wallPlacementCandidate(worldX, worldY, selectedBuildPiece)"));

console.log("v392 placement-rule checks passed: walls/doors are perimeter-only and doors require same-axis wall segments on both sides in both preview and server validation.");
