"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));

const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert.strictEqual(pkg.version, "0.6.11.430");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-430";'));
assert(html.includes('/game.js?v=430'));

// Roof pixels are now treated as a projected receiver surface rather than
// inheriting the ground/wall lighting underneath them.
assert(game.includes("function appendRoofRegionSurfacePath(pathCtx, region, camX, camY)"));
assert(game.includes("function visibleRoofLightingRegions()"));
assert(game.includes("function restoreVisibleRoofSurfaceAmbient(bufferCtx, alpha"));
assert(game.includes("bufferCtx.clearRect(0, 0, VIEW_W, VIEW_H);"));
assert(game.includes("appendRoofRegionSurfacePath("));
assert(game.includes("ROOF_OVERHANG"));

// A Torch whose visibility origin is inside any enclosed room is not permitted
// to re-light the exterior roof plane. Exterior Torches retain a roof receiver.
assert(game.includes("function torchSourceInsideAnyRoofRegion(source, roofRegions)"));
assert(game.includes("pointInsideRoofRegion(region, worldX, worldY)"));
assert(game.includes("if (torchSourceInsideAnyRoofRegion(source, allRoofRegions)) return;"));
assert(game.includes("function carveTorchRoofSurfaceLight(bufferCtx, source, regions)"));
assert(game.includes("carveTorchRoofSurfaceLight(bufferCtx, source, visibleRoofRegions);"));

// Visual-layer order matters: wall facade lighting is resolved first, then the
// visible roof is reset/re-lit on top. This masks the exact v409 leak where an
// illuminated hidden wall rectangle appeared as a bright band on the roof.
const facadeCarveIndex = game.indexOf("carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide);");
const roofRestoreIndex = game.indexOf("restoreVisibleRoofSurfaceAmbient(bufferCtx, alpha, visibleRoofRegions);");
const roofCarveIndex = game.indexOf("carveTorchRoofSurfaceLight(bufferCtx, source, visibleRoofRegions);");
assert(facadeCarveIndex >= 0 && roofRestoreIndex > facadeCarveIndex);
assert(roofCarveIndex > roofRestoreIndex);

console.log("v410 roof surface lighting occlusion check passed: visible roofs mask interior ground/facade light and only exterior Torch sources can re-light the roof plane.");
