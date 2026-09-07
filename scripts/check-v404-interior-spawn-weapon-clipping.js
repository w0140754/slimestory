"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const runtime = read("public", "client-enemy-runtime.js");
const html = read("public", "index.html");
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert(server.includes('const BUILD_VERSION = "6-11-410";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-410";'));
assert.strictEqual(world.version, 410);
assert(html.includes('/game.js?v=410'));
assert(html.includes('/client-enemy-runtime.js?v=410'));

// v404's important spawn-initialization fix remains retained.
assert(runtime.includes("if (!syncingMapEntry && !firstSnapshot && wasAlive && !nextAlive)"));
assert(runtime.includes("the first authoritative snapshot is initialization, not a kill"));

// The two v404 visual experiments were intentionally superseded after live
// testing: house-only darkness was removed and held-item clipping now uses the
// unified player-centered visibility mask introduced in v406.
assert(!game.includes("function enclosedInteriorDarknessAlpha"));
assert(!game.includes("function drawEnclosedInteriorDarkness"));
assert(game.includes("function applyHeldItemStructureVisibilityClip(camX, camY)"));
assert(!game.includes("function heldStructureClipProbe("));
assert(!game.includes("function applyHeldWeaponStructureClip("));

console.log("v404 retained check passed: first-snapshot fake-death prevention remains, while superseded interior-darkness/pose-probe clipping is cleanly replaced by v406 behavior.");
