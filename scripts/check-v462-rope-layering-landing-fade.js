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

// Installed Rope art is a second pass, so a southern pit tile cannot paint over
// the visual extension that hangs into the black excavation.
assert(game.includes('function drawOpeningRopes(camX, camY) {'));
const floorsStart = game.indexOf('function drawPlayerStructureFloors(camX, camY) {');
const floorsEnd = game.indexOf('\nfunction structureCellKey(', floorsStart);
const floors = game.slice(floorsStart, floorsEnd);
assert(floors.includes('drawDugPit(structure, camX, camY);'));
assert(floors.includes('drawOpeningRopes(camX, camY);'));
assert(floors.indexOf('drawOpeningRopes(camX, camY);') > floors.indexOf('drawDugPit(structure, camX, camY);'));
const pitStart = game.indexOf('function drawDugPit(structure, camX, camY, alpha = 1) {');
const pitEnd = game.indexOf('\nfunction drawShaftOpening(', pitStart);
assert(!game.slice(pitStart, pitEnd).includes('drawRopeAtOpening('), 'pit cells must not draw installed Rope before neighboring cells');

// Rope transitions use a fade, while ordinary world-map transitions retain the
// existing slide as the default style.
assert(game.includes('const MAP_TRANSITION_FADE_DURATION = 0.24;'));
assert(game.includes('let mapTransitionStyle = "slide";'));
assert(game.includes('mapTransitionStyle = options?.transitionStyle === "fade" ? "fade" : "slide";'));
assert(game.includes('mapTransitionPhase = mapTransitionStyle === "fade" ? "fading" : "sliding";'));
assert(game.includes('if (mapTransitionPhase === "fading") {'));
assert(game.includes('ctx.fillStyle = "#000";'));

const travelStart = game.indexOf('function updateRopeShaftTraversal(movement = null) {');
const travelEnd = game.indexOf('\nfunction drawInteractionPrompt(', travelStart);
const travel = game.slice(travelStart, travelEnd);
assert(travel.includes('transitionStyle: "fade"'));
assert(game.includes('const ROPE_TRAVEL_UNDERGROUND_BASE_OFFSET_Y = 16;'));
assert(game.includes('safeUndergroundRopeLanding(structure.targetMapId, structure.x, structure.y)'));
assert(travel.includes('Number(structure.y) + ROPE_TRAVEL_TOP_OFFSET_Y'));

console.log('v462 Rope layering/landing/fade check passed: installed Rope renders after pit cells, descent lands at underground Rope base, ascent lands at surface Rope top, and Rope travel uses a quick black fade.');
