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

assert.strictEqual(pkg.version, "0.6.11.413");
assert.strictEqual(world.version, 413);
assert(server.includes('const BUILD_VERSION = "6-11-413";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-413";'));
assert(html.includes('/game.js?v=413'));

// Gameplay wall collision remains unchanged, while held-item visual occlusion
// now follows the same Y-sort that decides whether the wall is actually in
// front of or behind the player.
assert(game.includes("function heldItemOcclusionAllowsStructure(structure, sourceY)"));
assert(game.includes("return wallDrawSortY(structure) > Number(sourceY) + 0.01;"));
assert(game.includes('if (cacheKey === "held-item")'));
assert(game.includes('applyHeldItemStructureVisibilityClip(camX, camY)'));

// A wall-mounted torch may brighten painted wall faces while normal visibility
// rays still stop at the geometric wall boundary. v409 replaces the rejected
// per-wall viewer-side toggle with stable facade-state selection.
assert(game.includes("function restoreStructureFacadeAmbient(bufferCtx, alpha)"));
assert(game.includes("function carveTorchStructureFaceLight(bufferCtx, source, structure"));
assert(game.includes("visibleFaceSide && sourceSide !== visibleFaceSide"));
assert(!game.includes("sourceSide !== viewerSide"));
assert(game.includes('bufferCtx.globalCompositeOperation = "destination-out";'));

// Night is deliberately darker than v406.
assert(game.includes("const duskNightAlpha = 0.60;"));
assert(game.includes("const midnightAlpha = 0.92;"));
assert(game.includes("const preDawnAlpha = 0.62;"));

// Ordinary mobs become hostile only inside a bounded night detection radius;
// Spawn's special night-only slimes retain their existing relentless range.
assert(server.includes("const NIGHT_HOSTILE_DETECTION_RADIUS = 208;"));
assert(server.includes("const NIGHT_HOSTILE_DISENGAGE_RADIUS = 248;"));
assert(server.includes("const ordinaryNightHostile = Boolean("));
assert(server.includes("enemyUsesProximityAggro(enemy) || relentlessNightAggro || ordinaryNightHostile"));
assert(server.includes("? NIGHT_HOSTILE_DETECTION_RADIUS"));
assert(server.includes("? Infinity"));

console.log("v407 static check passed: draw-order held-item occlusion, wall-face torch wash, darker night, and bounded all-map night hostility are wired.");
