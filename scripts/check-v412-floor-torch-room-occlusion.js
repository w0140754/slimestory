"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));

const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert.strictEqual(pkg.version, "0.6.11.427");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-427";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-427";'));
assert(html.includes('/game.js?v=427'));

// Regression geometry from the reported case: an outside floor is one half
// tile south of the house's south wall. The flame is drawn nine world pixels
// above the floor anchor, which projects one pixel across the wall centerline.
// The physical anchor remains unambiguously outside.
const southWall = { kind: "woodWall", axis: "horizontal", x: 64, y: 72 };
const outsideFloorTorch = { kind: "torch", mountType: "floor", x: 64, y: 80 };
const projectedFlame = { x: outsideFloorTorch.x, y: outsideFloorTorch.y - 9 };
assert.strictEqual(geometry.sideOfBoundary(southWall, projectedFlame.x, projectedFlame.y), "north");
assert.strictEqual(geometry.sideOfBoundary(southWall, outsideFloorTorch.x, outsideFloorTorch.y), "south");

// A minimal enclosed floor directly north of that wall confirms why the flame
// projection was also being classified as an interior roof source.
const room = [
  { kind: "woodFloor", x: 64, y: 64 },
  { kind: "woodWall", axis: "horizontal", x: 64, y: 56 },
  southWall,
  { kind: "woodWall", axis: "vertical", x: 56, y: 64 },
  { kind: "woodWall", axis: "vertical", x: 72, y: 64 }
];
const regions = topology.automaticRoofRegions(room, 16);
assert.strictEqual(regions.length, 1);
assert(regions[0].floorKeys.has("64,64"));

// v412 keeps the rendered gradient on the flame but explicitly uses the
// placement anchor for non-wall Torch visibility/room classification.
assert(game.includes('if (structure?.mountType !== "wall") {'));
assert(game.includes('const anchorX = Number(structure?.x);'));
assert(game.includes('const anchorY = Number(structure?.y);'));
assert(game.includes('return { x: anchorX, y: anchorY };'));
assert(game.includes('const originOffset = Math.hypot(worldX - visibilityOriginX, worldY - visibilityOriginY);'));
assert(game.includes('const visibilityRadius = radius + originOffset + 6;'));

// Wall-mounted Torches retain v408's explicit mount-side origin and v409's
// wall-face receiver rules; this fix must not undo the completed wall lighting.
assert(game.includes('STRUCTURE_GEOMETRY.offsetPointToSide('));
assert(game.includes('structure.mountSide,'));
assert(game.includes('carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide);'));
assert(game.includes('if (torchSourceInsideAnyRoofRegion(source, allRoofRegions)) return;'));

console.log("v412 floor-torch room occlusion check passed: freestanding Torch topology comes from its floor/ground anchor, so a visually raised flame cannot leak exterior light into an enclosed room.");
