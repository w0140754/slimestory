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
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

// Rope is a permanent hand-craftable free resource on both client and server.
assert(server.includes('rope: Object.freeze({ resourceKey: "ropes", outputCount: 1, station: "hand", ingredients: Object.freeze({}) })'));
const clientRecipeStart = game.indexOf('  rope: Object.freeze({\n    name: "Rope"');
assert(clientRecipeStart >= 0, 'client Rope recipe missing');
const clientRecipeEnd = game.indexOf('\n  }),', clientRecipeStart);
const clientRecipe = game.slice(clientRecipeStart, clientRecipeEnd + 5);
assert(clientRecipe.includes('resourceKey: "ropes"'));
assert(clientRecipe.includes('station: "hand"'));
assert(clientRecipe.includes('ingredients: Object.freeze({})'));
assert(html.includes('data-craft-recipe="rope"'), 'Rope craft card missing');
assert(html.includes('FREE · NO TABLE'), 'Rope craft card must clearly show free/no-table behavior');
assert(game.includes('recipe.resourceKey === "ropes"'), 'Rope recipe must resolve the Rope inventory art');

// The occupied dig tile is rejected on both client and authoritative server.
const clientDigStart = game.indexOf('function tryDigSurfaceGround(target = null) {');
const clientDigEnd = game.indexOf('\n\n// -----------------------------------------------------------------------------\n// PLAYER', clientDigStart);
const clientDig = game.slice(clientDigStart, clientDigEnd);
assert(clientDig.includes('circleRectCollision(player.x, player.y, 4, x - 8, y - 8, 16, 16)'), 'client must refuse digging the tile currently occupied by the player');

const serverDigStart = server.indexOf('function handleGroundDigAction(playerId, playerState, payload) {');
const serverDigEnd = server.indexOf('\n// -----------------------------------------------------------------------------\n// SHARED ENVIRONMENT', serverDigStart);
const serverDig = server.slice(serverDigStart, serverDigEnd);
assert(serverDig.includes('circleRectHit(playerState.x, playerState.y, 4.5, { x: x - 8, y: y - 8, width: 16, height: 16 })'), 'server must authoritatively reject occupied-tile digging');
assert(serverDig.indexOf('circleRectHit(playerState.x') < serverDig.indexOf('addRuntimeWorldStructure(pit)'), 'occupied-cell rejection must occur before the dig mutation is created');

console.log('v460 free Rope + safe ground-dig check passed: Rope is free hand crafting and occupied player tiles cannot be excavated client/server.');
