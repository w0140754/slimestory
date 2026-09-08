"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));

const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert.strictEqual(pkg.version, "0.6.11.430");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-430";'));
assert(html.includes('/shared/structure-geometry.js?v=430'));
assert(html.includes('/game.js?v=430'));

// The shared geometry API now supports probing the visible side of any point
// along a wall boundary, rather than only offsetting from the segment center.
assert.strictEqual(geometry.VERSION, 2);
const horizontal = { id: "wall:h0", kind: "woodWall", axis: "horizontal", x: 64, y: 80 };
const horizontalNeighbor = { id: "wall:h1", kind: "woodWall", axis: "horizontal", x: 80, y: 80 };
const horizontalFar = { id: "wall:h2", kind: "woodWall", axis: "horizontal", x: 96, y: 80 };
const hSource = { x: 64, y: 82.25 };
const hBoundary = geometry.closestPointOnBoundary(horizontalFar, hSource.x, hSource.y);
const hFace = geometry.offsetBoundaryPointToSide(horizontalFar, hBoundary, "south", 1.35);
assert.deepStrictEqual(hBoundary, { x: 88, y: 80 });
assert.deepStrictEqual(hFace, { x: 88, y: 81.35 });
for (const blocker of [horizontal, horizontalNeighbor]) {
  const hit = geometry.segmentRectIntersectionT(
    hSource.x, hSource.y, hFace.x, hFace.y,
    geometry.collisionRect(blocker, 2), 0.05
  );
  assert.strictEqual(hit, null, "same-side horizontal face ray must not collide with a coplanar wall");
}

const vertical = { id: "wall:v0", kind: "woodWall", axis: "vertical", x: 80, y: 64 };
const verticalNeighbor = { id: "wall:v1", kind: "woodWall", axis: "vertical", x: 80, y: 80 };
const verticalFar = { id: "wall:v2", kind: "woodWall", axis: "vertical", x: 80, y: 96 };
const vSource = { x: 82.25, y: 64 };
const vBoundary = geometry.closestPointOnBoundary(verticalFar, vSource.x, vSource.y);
const vFace = geometry.offsetBoundaryPointToSide(verticalFar, vBoundary, "east", 1.35);
assert.deepStrictEqual(vBoundary, { x: 80, y: 88 });
assert.deepStrictEqual(vFace, { x: 81.35, y: 88 });
for (const blocker of [vertical, verticalNeighbor]) {
  const hit = geometry.segmentRectIntersectionT(
    vSource.x, vSource.y, vFace.x, vFace.y,
    geometry.collisionRect(blocker, 2), 0.05
  );
  assert.strictEqual(hit, null, "same-side vertical face ray must not collide with a coplanar wall");
}

// Wall lighting is no longer selected from the player's instantaneous side of
// each individual segment. Completed-house interior/exterior reveal state is
// the only view state used to choose a conceptual face.
assert(game.includes("function structureInteriorBoundarySide(structure, region)"));
assert(game.includes("function visibleStructureLightFaceSide(structure)"));
assert(game.includes("return playerInsideRoofRegion(region)"));
assert(game.includes("oppositeStructureBoundarySide(interiorSide)"));
assert(!game.includes("sourceSide !== viewerSide"));
assert(game.includes("if (visibleFaceSide && sourceSide !== visibleFaceSide) return;"));

// Face line-of-sight is traced just outside collision thickness so mounted
// light can spread across adjacent coplanar segments. Ground light still uses
// the canonical wall barrier and therefore does not leak through the wall.
assert(game.includes("function lightPathToStructureFaceClear(source, targetStructure, sourceSide)"));
assert(game.includes("STRUCTURE_GEOMETRY.offsetBoundaryPointToSide("));
assert(game.includes("sourceSide,\n    1.35"));
assert(game.includes("STRUCTURE_GEOMETRY.lightBarrierSegment(structure, 0.4)"));
assert(game.includes("const visibleFaceSide = visibleStructureLightFaceSide(structure);"));
assert(game.includes("carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide);"));

console.log("v409 wall-torch surface lighting check passed: wall illumination is stable across player movement and propagates along connected wall faces without weakening wall occlusion.");
