"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const WORLD_CONTENT = require("../public/shared/world-content.js");

assert.strictEqual(pkg.version, "0.6.11.413");
assert.strictEqual(WORLD_CONTENT.version, 413);
assert(server.includes('const BUILD_VERSION = "6-11-413";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-413";'));
assert(html.includes('/game.js?v=413'));

// Dynamic torch visibility: walls and closed doors become ray blockers and the
// darkness cutout is clipped to the resulting visibility polygon.
assert(game.includes("function torchLightBlockingSegments(sourceX, sourceY, radius)"));
assert(game.includes('structure?.kind === "woodDoor" && !doorVisuallyOpen(structure)'));
assert(game.includes("function raySegmentIntersectionDistance(originX, originY, rayX, rayY, segment)"));
assert(game.includes("function torchLightVisibilityPolygon(sourceX, sourceY, radius, cacheKey = null)"));
assert(game.includes("bufferCtx.clip();"));
assert(game.includes("const torchLightVisibilityCache = new Map();"));

// Building dependency refinement.
assert(server.includes("function floorsSupportingBoundary(mapId, structure)"));
assert(server.includes("function floorRemovalWouldOrphanBoundary(mapId, floor)"));
assert(server.includes("function wallSupportsDoor(door, wall)"));
assert(server.includes("function removeDoorsOrphanedByWall(removedWall)"));
assert(server.includes('broadcastRemovedStructureAsLoot(removedDoor, "supportRemoved")'));

// Organic structure approach decisions are held server-side for several
// seconds and reuse the existing movement replication rather than adding a new
// network message or heartbeat.
assert(server.includes("function enemyOrganicStructureApproachTarget(enemy, targetX, targetY, padding)"));
assert(server.includes("mode: \"flank\""));
assert(server.includes("2600 + Math.random() * 3000"));
assert(server.includes("{ ignoreDoors: ignoreDoorsForPlan }"));
assert(!server.includes('type: "enemyStructureApproach"'));

console.log("v402 static check passed: wall-occluded torch visibility, dependency-aware building removal, and low-frequency organic structure approach AI are wired.");
