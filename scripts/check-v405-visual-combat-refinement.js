"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");
const enemyRendering = read("public", "client-enemy-rendering.js");
const combat = read("public", "client-combat.js");

assert.strictEqual(pkg.version, "0.6.11.413");
assert.strictEqual(world.version, 413);
assert(server.includes('const BUILD_VERSION = "6-11-413";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-413";'));
assert(html.includes('/game.js?v=413'));
assert(html.includes('/client-enemy-rendering.js?v=413'));
assert(html.includes('/client-combat.js?v=413'));

// v405's live-tested house darkness and wall-face lighting experiments were
// deliberately rolled back in v406; keep a regression assertion that they do
// not silently return.
assert(!game.includes("function drawEnclosedInteriorDarkness("));
assert(!game.includes("function carveInteriorFacingWallLight("));

// Held-item wall rendering is still present, now through one shared visibility
// mask rather than v405's pose-specific boundary probes.
assert(game.includes("function applyHeldItemStructureVisibilityClip(camX, camY)"));
assert(game.includes("drawClippedBowStringSegment(tipA, nock);"));
assert(game.includes("drawClippedBowStringSegment(nock, tipB);"));

// Slime hop staggering is deterministic and client-only: no server/network
// field is introduced for the phase.
assert(enemyRendering.includes("function slimePresentationHopPhase(slime)"));
assert(enemyRendering.includes("worldTime * 6.2 + slimePresentationHopPhase(slime)"));
assert(!server.includes("presentationHopPhase"));

// Ordinary weapon/tool attacks remain single-target. Deliberate Wand Mastery
// remains the existing multi-target exception.
for (const needle of [
  'tryHitEnemies("melee", 1);',
  'tryHitEnemies("bowMelee", 1);'
]) assert(combat.includes(needle), `missing single-target basic attack rule: ${needle}`);
assert(combat.includes('tryHitEnemies(\n        "wandMasteryMelee",\n        masteryTargets'));

console.log("v405 retained check passed: staggered slime hops and single-target basics remain, while v406 intentionally replaces the rejected darkness/occlusion experiments.");
