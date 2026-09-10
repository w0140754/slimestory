"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const game = read("public", "game.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

assert(game.includes('function roofRegionForStructureFacade(structure) {'));
assert(game.includes('function roofRegionContainingWorldPoint(worldX, worldY) {'));
assert(game.includes('function hiddenRoofFacadeHighlightFactor(structure) {'));
assert(game.includes('return playerInsideRoofRegion(region) ? 1 : 0.12;'));
assert(game.includes('function sourceMayLightStructureFacade(source, structure, targetRegion = roofRegionForStructureFacade(structure)) {'));
assert(game.includes('if (!playerInsideRoofRegion(sourceRegion)) return false;'));
assert(game.includes('return targetRegion === sourceRegion;'));

const carveStart = game.indexOf('function carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide = null) {');
const carveEnd = game.indexOf('\nfunction drawWorldLightingOverlay()', carveStart);
assert(carveStart >= 0 && carveEnd > carveStart, 'carveTorchStructureFaceLight function missing');
const carveBody = game.slice(carveStart, carveEnd);
assert(carveBody.includes('const targetRegion = roofRegionForStructureFacade(structure);'));
assert(carveBody.includes('if (!sourceMayLightStructureFacade(source, structure, targetRegion)) return;'));

const woodStart = game.indexOf('function drawWoodWall(structure, camX, camY, alpha = 1) {');
const woodEnd = game.indexOf('\nfunction stoneWallVariantIndex', woodStart);
const woodBody = game.slice(woodStart, woodEnd);
assert(woodBody.includes('ctx.globalAlpha *= 0.42 * hiddenRoofFacadeHighlightFactor(structure);'));

const stoneStart = game.indexOf('function drawStoneWall(structure, camX, camY, alpha = 1) {');
const stoneEnd = game.indexOf('\nfunction drawWoodDoor', stoneStart);
const stoneBody = game.slice(stoneStart, stoneEnd);
assert(stoneBody.includes('ctx.globalAlpha *= 0.34 * hiddenRoofFacadeHighlightFactor(structure);'));

const helperStart = game.indexOf('function sourceMayLightStructureFacade(source, structure, targetRegion = roofRegionForStructureFacade(structure)) {');
const helperEnd = game.indexOf('\nfunction visibleStructureLightFaceSide', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart);
const helper = game.slice(helperStart, helperEnd);
assert(!/naturalCave|caveDoor|woodHouse|spawn/i.test(helper), 'roofed-surface light helper must remain universal');

console.log('v454 roofed surface-light occlusion check passed: concealed roofed facades suppress bright seam highlights and roofed light sources only light same-room revealed facade surfaces.');
