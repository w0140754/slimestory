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
const network = read("public", "client-network.js");
const enemyRendering = read("public", "client-enemy-rendering.js");
const combat = read("public", "client-combat.js");

assert.strictEqual(pkg.version, "0.6.11.413");
assert.strictEqual(world.version, 413);
assert(server.includes('const BUILD_VERSION = "6-11-413";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-413";'));
assert(html.includes('/game.js?v=413'));

// The experimental house-only darkness and v405 wall-face carve are gone.
assert(!game.includes("function enclosedInteriorDarknessAlpha("));
assert(!game.includes("function drawEnclosedInteriorDarkness("));
assert(!game.includes("function carveInteriorFacingWallLight("));
assert(game.includes("function drawWorldLightingOverlay()"));

// All local held layers share one player-centered wall visibility mask instead
// of separate pose probes. This includes arms, ordinary weapons, bow/string,
// and the carried torch.
assert(game.includes("function applyHeldItemStructureVisibilityClip(camX, camY)"));
assert(game.includes('torchLightVisibilityPolygon(sourceX, sourceY, 42, "held-item")'));
assert(!game.includes("function heldStructureClipProbe("));
assert(!game.includes("function applyHeldWeaponStructureClip("));
assert((game.match(/applyHeldItemStructureVisibilityClip\(camX, camY\)/g) || []).length >= 6);
assert(game.includes("drawClippedBowStringSegment(tipA, nock);"));
assert(game.includes("drawClippedBowStringSegment(nock, tipB);"));

// Held torch keeps its visual light center but can use a safe visibility origin
// on the player's interior side of a boundary.
assert(game.includes("visibilityOriginX = worldX"));
assert(game.includes("visibilityOriginY = worldY"));
assert(game.includes("visibilityX: Number(player.x)"));
assert(game.includes("visibilityY: Number(player.y)"));

// Torch attachment pipeline: floor/wall support targeting on client, supportId
// on the wire/server, mount metadata in snapshots, and attachment-first reclaim.
assert(game.includes("function torchPlacementCandidate(worldX, worldY)"));
assert(game.includes('mountType: "floor"'));
assert(game.includes('mountType: "wall"'));
assert(network.includes('payload.supportId = supportId'));
assert(server.includes("function torchSupportById(mapId, supportId)"));
assert(server.includes("function attachedTorchForSupport(mapId, supportId)"));
assert(server.includes('supportId: torchSupport.id'));
assert(server.includes('mountType: torchSupport.kind === "woodWall" ? "wall" : "floor"'));
assert(server.includes('reason: "supportPickaxeFirst"') || server.includes('"supportPickaxeFirst"'));
assert(server.includes("attachmentRemoved: true"));
assert(server.includes("supportId: structure.id"));
assert(game.includes("function torchVisibilityWorldPosition(structure)"));

// v405 successes stay retained.
assert(enemyRendering.includes("function slimePresentationHopPhase(slime)"));
assert(combat.includes('tryHitEnemies("melee", 1);'));
assert(combat.includes('tryHitEnemies("bowMelee", 1);'));

console.log("v406 static check passed: house-darkness rollback, unified held-item wall occlusion, safe held-light visibility, mounted torches, and attachment-first reclaim are wired.");
