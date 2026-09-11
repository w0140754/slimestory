"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

const ropeStart = game.indexOf('function drawRopeAtOpening(worldX, worldY, camX, camY, underground = false, alpha = 1) {');
const ropeEnd = game.indexOf('\nfunction drawDugPit(', ropeStart);
assert(ropeStart >= 0 && ropeEnd > ropeStart, 'Rope renderer missing');
const rope = game.slice(ropeStart, ropeEnd);
assert(rope.includes('const top = sy - 8;'), 'Rope must anchor at the top of the 16px opening cell');
assert(rope.includes('const primaryHeight = underground ? 24 : 16;'), 'surface Rope must fill one tile and underground Rope must be twice the former 12px height');
assert(rope.includes('dugPitNeighborAt(Number(worldX), Number(worldY) + BUILD_GRID_SIZE)'), 'surface Rope must detect a connected hole directly below');
assert(rope.includes('const extensionHeight = 14;'), 'surface Rope extension must remain capped below one additional tile');
assert(rope.includes('ctx.globalAlpha = alpha * 0.58;'), 'second surface Rope tile must fade into depth');

const travelStart = game.indexOf('function updateRopeShaftTraversal(movement = null) {');
const travelEnd = game.indexOf('\nfunction drawInteractionPrompt(', travelStart);
assert(travelStart >= 0 && travelEnd > travelStart, 'directional Rope traversal missing');
const travel = game.slice(travelStart, travelEnd);
assert(travel.includes('if (surface && Number(intent.dy) <= 0.35) continue;'), 'surface descent must require downward movement');
assert(travel.includes('if (underground && Number(intent.dy) >= -0.35) continue;'), 'underground climb must require upward movement');
assert(travel.includes('if (dx > 5.5 || dy < -10 || dy > ropeBottom) continue;'), 'Rope travel must require actual Rope alignment');
assert(game.includes('const ROPE_TRAVEL_TOP_OFFSET_Y = -7;'));
assert(game.includes('const ROPE_TRAVEL_UNDERGROUND_BASE_OFFSET_Y = 16;'), 'v462 supersedes the old shared Rope-top landing with directional top/base destinations');
assert(game.includes('safeUndergroundRopeLanding(structure.targetMapId, structure.x, structure.y)') && travel.includes('Number(structure.y) + ROPE_TRAVEL_TOP_OFFSET_Y'), 'surface descent must choose a safe underground Rope-base landing while ascent returns to the surface Rope top');
assert(app.includes('updateRopeShaftTraversal(movement);'), 'movement intent must be supplied to Rope traversal');
assert(!travel.includes('Math.hypot(Number(structure.x) - player.x, Number(structure.y) - player.y) > 4.5'), 'old contact-only instant traversal must remain retired');

console.log('v461 Rope presentation/traversal compatibility check passed: full-tile surface Rope, one faded extension, taller underground Rope, and directional climb/descent remain wired after v462 landing refinement.');
