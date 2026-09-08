"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));

assert.strictEqual(pkg.version, "0.6.11.432");
assert(read("server.js").includes('const BUILD_VERSION = "6-11-432";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-432";'));
assert(read("public", "index.html").includes('/shared/structure-geometry.js?v=431'));

const horizontal = { kind: "woodWall", axis: "horizontal", x: 64, y: 80 };
const vertical = { kind: "woodWall", axis: "vertical", x: 64, y: 80 };
assert.deepStrictEqual(geometry.boundarySegment(horizontal), { x1: 56, y1: 80, x2: 72, y2: 80 });
assert.deepStrictEqual(geometry.boundarySegment(vertical), { x1: 64, y1: 72, x2: 64, y2: 88 });
assert.deepStrictEqual(geometry.collisionRect(horizontal, 2), { x: 56, y: 79, width: 16, height: 2 });
assert.deepStrictEqual(geometry.collisionRect(vertical, 2), { x: 63, y: 72, width: 2, height: 16 });
assert.strictEqual(geometry.sideOfBoundary(horizontal, 64, 70), "north");
assert.strictEqual(geometry.sideOfBoundary(horizontal, 64, 90), "south");
assert.strictEqual(geometry.sideOfBoundary(vertical, 50, 80), "west");
assert.strictEqual(geometry.sideOfBoundary(vertical, 70, 80), "east");

const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
assert(server.includes('const STRUCTURE_GEOMETRY = require("./public/shared/structure-geometry.js");'));
assert(server.includes('return STRUCTURE_GEOMETRY.collisionRect(structure, 2);'));
assert(server.includes('mountSide: STRUCTURE_GEOMETRY.sideOfBoundary('));
assert(game.includes('return STRUCTURE_GEOMETRY.collisionRect(structure, 2);'));
assert(game.includes('STRUCTURE_GEOMETRY.lightBarrierSegment(structure, 0.4)'));
assert(game.includes('return STRUCTURE_GEOMETRY.drawSortY(structure);'));
assert(game.includes('restoreStructureFacadeAmbient(bufferCtx, alpha, interiorRegion, interiorAlpha);'));
assert(game.includes('visibleFaceSide && sourceSide !== visibleFaceSide'));
assert(game.includes('STRUCTURE_GEOMETRY.offsetBoundaryPointToSide('));
assert(!game.includes('sourceSide !== viewerSide'));
assert(game.includes('function collectTorchLightSources()'));
assert(game.includes('remote?.heldBuildPiece !== "torch"'));
assert(game.includes('heldBuildPieceForCurrentDraw()'));
assert(network.includes('heldBuildPiece: typeof selectedBuildPiece === "string" ? selectedBuildPiece : null'));
assert(server.includes('heldBuildPiece: playerState.heldBuildPiece || null'));

console.log("v408 structure-geometry refactor check passed: canonical wall geometry, separated light surfaces, and held-torch replication hooks are present.");
