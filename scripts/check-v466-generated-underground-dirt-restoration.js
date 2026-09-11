"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const server = read("server.js");
const worldSource = read("public", "shared", "world-content.js");
const html = read("public", "index.html");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(game.includes("ctx.filter = `brightness(${Math.max(0.10, 1 - transitionDarkness).toFixed(3)})`"));
assert(worldSource.includes("function buildGeneratedUndergroundMap(x, y) {"));
assert(worldSource.includes("function undergroundEdgePlan(x, y, side) {"));
assert(!worldSource.includes("addMegaCaveTestMap();"));

const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = oldSeed;
const surfaces = Object.values(world.maps).filter(map => !map.subterranean);
const underground = Object.values(world.maps).filter(map => map.subterranean);
assert.strictEqual(surfaces.length, 9);
assert.strictEqual(underground.length, 9);
assert(surfaces.every(map => world.maps[map.undergroundMapId]?.subterranean));
assert(underground.every(map => map.features.length >= 3 && map.features.length <= 5));
assert.notStrictEqual(world.maps.world_p1_p1.name, "Great Cavern");
assert(underground.some(map => Object.keys(map.undergroundConnections || {}).length > 0));

assert(html.includes('data-resource-key="dirt" data-build-item="dirt"'));
assert(game.includes('function dirtFillCandidate(worldX, worldY) {'));
assert(server.includes('if (message?.kind === "dirt") {'));
assert(server.includes('if (structure.kind === "dugDirt") {'));
assert(server.includes('if (structure.kind === "dugPit") {'));
assert(server.includes('kind: "rope", attachmentRemoved: true'));
assert(server.includes('itemToken: "resource:dirt"'));
assert(read("public", "client-network.js").includes('player[parts.id] = Math.max(0, Math.floor(Number(message.playerCount)))'));

console.log("v466 generated underground + Dirt restoration check passed.");
