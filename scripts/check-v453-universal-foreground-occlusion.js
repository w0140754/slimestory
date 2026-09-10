"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const game = read("public", "game.js");
const world = read("public", "client-world.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

assert(game.includes('const LOCAL_FOREGROUND_OCCLUDER_ALPHA = 0.24;'));
assert(game.includes('function localPlayerOcclusionWorldRect() {'));
assert(game.includes('function worldRectsOverlap(a, b, padding = 0) {'));
assert(game.includes('function localForegroundOcclusionAlpha(worldRect, drawSortY, alpha = 1) {'));
assert(game.includes('sortY <= playerSortY + 0.01'), "occluders behind/in-line with the player must stay opaque");
assert(game.includes('worldRectsOverlap(worldRect, playerRect, 2)'), "universal fade must be driven by actual visible overlap");

// The helper itself must stay generic: no cave-specific branching.
const helperStart = game.indexOf('function localForegroundOcclusionAlpha(worldRect, drawSortY, alpha = 1) {');
const helperEnd = game.indexOf('\nfunction structureVisualWorldRect', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart);
const helper = game.slice(helperStart, helperEnd);
assert(!/cave|stoneWall|woodWall|tree|stoneCube/i.test(helper), "universal occlusion helper must not special-case content types");

// Current tall/foreground world content opts into the same helper.
assert(game.includes('let resolvedAlpha = localForegroundOcclusionAlpha(visualRect, wallDrawSortY(structure), alpha);'), "walls/doors must use universal overlap fade");
const cubeStart = game.indexOf('function drawStoneCube(structure, camX, camY, alpha = 1) {');
const cubeEnd = game.indexOf('\nfunction roofRegionIsNaturalCave', cubeStart);
assert(game.slice(cubeStart, cubeEnd).includes('localForegroundOcclusionAlpha('), "Stone Cube must use universal overlap fade");
assert(game.includes('function drawChestStructure(structure, camX, camY, alpha = 1) {'));
assert(game.includes('{ x: Number(structure?.x) - 8, y: Number(structure?.y) - 16, width: 16, height: 16 }'), "chests must use visible sprite bounds for universal occlusion");
assert(game.includes('const houseAlpha = localForegroundOcclusionAlpha('), "legacy/world houses must use universal overlap fade");
assert(world.includes('function treeOcclusionAlpha(tree, alpha = 1) {'));
assert(world.includes('localForegroundOcclusionAlpha('), "trees/rocks must use universal overlap fade");

// Wall attachments render only on the face currently visible to the viewer.
assert(game.includes('function visibleWallAttachmentFaceSide(support) {'));
assert(game.includes('function placedTorchVisibilityAlpha(structure, alpha = 1) {'));
assert(game.includes('const activeRegion = regions.find(region => playerInsideRoofRegion(region));'));
assert(game.includes('if (activeRegion) return structureInteriorBoundarySide(support, activeRegion);'));
assert(game.includes('return interiorSide ? oppositeStructureBoundarySide(interiorSide) : null;'));
assert(game.includes('if (visibleSide && structure.mountSide && structure.mountSide !== visibleSide) return 0;'), "Torch on hidden wall face must not remain visible through the wall");
assert(game.includes('const sortY = placedTorchDrawSortY(structure);'));

console.log("v453 universal foreground-occlusion check passed: visible overlap/depth drives one generic fade rule and wall-mounted Torches only render on the currently visible wall face.");
