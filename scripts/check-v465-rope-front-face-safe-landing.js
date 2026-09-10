"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.strictEqual(pkg.version, "0.6.11.468");
assert(game.includes("dugPitNeighborAt(Number(structure.x), Number(structure.y) - BUILD_GRID_SIZE)"));
assert(server.includes("const northPit = pit && structuresOnMap(playerState.mapId).some"));
assert(server.includes("if (!pit || northPit || Math.hypot"));
assert(game.includes("function safeUndergroundRopeLanding(mapId, ropeX, ropeY) {"));
assert(game.includes("function ropeLandingBlockedOnMap(mapId, x, y, playerRadius = 4) {"));
assert(game.includes("safeUndergroundRopeLanding(structure.targetMapId, structure.x, structure.y)"));
assert(server.includes("TERRAIN_RULES.circleCanOccupy(definition, x, y, radius, { allowWater: true }) === false"));

console.log("v465 front-face Rope placement + safe landing check passed.");
