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

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

// Underground Rope must participate in the normal Y-sorted drawable layer,
// using its hanging base as the depth key so players behind it draw underneath.
assert(game.includes('function undergroundRopeDrawSortY(structure) {'));
assert(game.includes('return Number(structure?.y) + 16;'));
const drawablesStart = game.indexOf('function addPlayerStructureDrawables(drawables, camX, camY) {');
const drawablesEnd = game.indexOf('\nfunction hitsPlayerStructureObstacle', drawablesStart);
const drawables = game.slice(drawablesStart, drawablesEnd);
assert(drawables.includes('structure.kind === "shaftOpening" && structure.ropePlaced'));
assert(drawables.includes('undergroundRopeDrawSortY(structure)'));
assert(drawables.includes('drawRopeAtOpening(structure.x, structure.y, camX, camY, true, 1)'));

// Floor-pass Rope rendering remains surface-only, preserving the v462 pit
// layering fix while avoiding a second underground Rope draw behind the player.
const ropePassStart = game.indexOf('function drawOpeningRopes(camX, camY) {');
const ropePassEnd = game.indexOf('\nfunction undergroundRopeDrawSortY', ropePassStart);
const ropePass = game.slice(ropePassStart, ropePassEnd);
assert(ropePass.includes('structure.kind === "dugPit" && structure.breakthrough'));
assert(!ropePass.includes('structure.kind === "shaftOpening"'));

// Surface Rope entry is a mirrored client/server one-way gate: north + moving
// down + aligned. Once already inside the Rope opening, movement can continue.
assert(game.includes('function surfaceRopeAllowsPlayerStep(structure, fromX, fromY, toX, toY, playerRadius = 4) {'));
assert(game.includes('const enteringFromNorth = Number(fromY) <= top - playerRadius + 1;'));
assert(game.includes('const movingDown = Number(toY) > Number(fromY) + 0.01;'));
assert(game.includes('const alignedToRope = Math.abs(Number(toX) - Number(structure.x)) <= 5.5;'));
assert(game.includes('if (wasInside) return true;'));
assert(game.includes('surfaceRopeAllowsPlayerStep(structure, options.fromX, options.fromY, x, y, playerRadius)'));

assert(server.includes('function serverSurfaceRopeAllowsPlayerStep(structure, fromX, fromY, toX, toY, radius = 4) {'));
assert(server.includes('const enteringFromNorth = Number(fromY) <= Number(rect.y) - radius + 1;'));
assert(server.includes('const movingDown = Number(toY) > Number(fromY) + 0.01;'));
assert(server.includes('const alignedToRope = Math.abs(Number(toX) - Number(structure.x)) <= 5.5;'));
assert(server.includes('serverSurfaceRopeAllowsPlayerStep(structure, fromX, fromY, toX, toY, radius)'));

console.log('v463 Rope depth/entry-gate check passed: underground Rope is depth sorted at its base and surface Rope entry is restricted to the north/top approach on both client and server.');
