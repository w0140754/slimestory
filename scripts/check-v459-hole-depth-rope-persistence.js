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

// Refresh/re-entry persistence: dynamic shaft snapshots must carry the installed-rope state.
const snapshotStart = server.indexOf('function structureSnapshot(mapId) {');
const snapshotEnd = server.indexOf('\nfunction structureRect', snapshotStart);
assert(snapshotStart >= 0 && snapshotEnd > snapshotStart, 'structureSnapshot missing');
const snapshot = server.slice(snapshotStart, snapshotEnd);
assert(snapshot.includes('ropePlaced: Boolean(structure.ropePlaced)'), 'ropePlaced must cross map-scene/reconnect snapshots');
assert(snapshot.includes('targetMapId: typeof structure.targetMapId === "string"'), 'vertical link target must remain serialized');

// Server still mutates both aligned openings authoritatively when Rope is installed.
assert(server.includes('pit.ropePlaced = true;'));
assert(server.includes('matchingShaft.ropePlaced = true;'));
assert(server.includes('broadcastStructureState(matchingShaft, { ropePlaced: true });'));

// Surface excavation depth: merged holes use a full cut-earth face on a north edge
// when the excavation continues south, without reviving the deprecated underground lip.
const pitStart = game.indexOf('function drawDugPit(structure, camX, camY, alpha = 1) {');
const pitEnd = game.indexOf('\nfunction drawShaftOpening', pitStart);
assert(pitStart >= 0 && pitEnd > pitStart, 'drawDugPit missing');
const pit = game.slice(pitStart, pitEnd);
assert(pit.includes('const faceDepth = south ? 16 : 10;'), 'north cut face should become a full tile for multi-row holes');
assert(pit.includes('if (!north) {'), '3D face must be derived from autotiled north exposure');
assert(pit.includes('if (!west) ctx.fillRect(x, y, 1, 16);'));
assert(pit.includes('if (!east) ctx.fillRect(x + 15, y, 1, 16);'));
assert(pit.includes('if (!south) ctx.fillRect(x, y + 15, 16, 1);'));
assert(!pit.includes('drawTerrainSouthVoidFaces'), 'hole depth effect must stay local to dug holes');

const shaftStart = game.indexOf('function drawShaftOpening(');
const shaftEnd = game.indexOf('\nfunction torchDisplayWorldPosition', shaftStart);
const shaft = game.slice(shaftStart, shaftEnd);
assert(shaft.includes('drawRopeAtOpening'), 'underground side must render installed Rope');
assert(!shaft.includes('worldClockSunShadowFactor'), 'deprecated climb tile must remain retired');
assert(game.includes('function updateRopeShaftTraversal('));
assert(game.includes('structure?.kind === "shaftOpening" && structure?.ropePlaced && structure?.targetMapId'));

console.log('v459 hole-depth + rope-persistence check passed: merged holes get north cut-earth faces and ropePlaced survives scene snapshots so underground return ropes render/traverse after map entry or refresh.');
