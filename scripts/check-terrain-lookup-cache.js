"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

function normalizeType(type, fallback = "void") {
  const normalized = String(type || "").trim();
  return TERRAIN_RULES.TYPES[normalized] ? normalized : fallback;
}

function regionRect(region) {
  const source = region?.rect && typeof region.rect === "object" ? region.rect : region;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const width = Number(source?.width);
  const height = Number(source?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function slowTerrainTypeAt(mapDefinition, x, y) {
  const terrain = mapDefinition?.terrain;
  if (!terrain) return null;
  let type = normalizeType(terrain.defaultType, "void");
  for (const region of Array.isArray(terrain.regions) ? terrain.regions : []) {
    const rect = regionRect(region);
    if (!rect || x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) continue;
    type = normalizeType(region.type, type);
  }
  return type;
}

const west = WORLD_CONTENT.maps.prototypeIslandWest;
assert(west?.terrain, "Prototype Island West terrain missing");
assert.ok(WORLD_CONTENT.version >= 48, "terrain lookup cache must preserve v345-or-newer authored world data");

// Compare the cache path against the original full-scan semantics at every
// terrain-cell center plus edge/offset samples that exercise non-aligned rects.
const size = TERRAIN_RULES.cellSize(west);
const width = Number(west.dimensions.width);
const height = Number(west.dimensions.height);
for (let y = -4; y <= height + 4; y += size / 2) {
  for (let x = -4; x <= width + 4; x += size / 2) {
    assert.strictEqual(
      TERRAIN_RULES.terrainTypeAt(west, x, y),
      slowTerrainTypeAt(west, x, y),
      `cached terrain mismatch at ${x},${y}`
    );
  }
}

const stats = TERRAIN_RULES.terrainLookupStats(west);
assert(stats, "terrain lookup stats missing");
assert(stats.regionCount >= 50, "current Prototype Island West should exercise a region-heavy terrain map");
assert(stats.bucketCount > 0, "terrain spatial buckets were not built");
assert(stats.maxBucketSize < stats.regionCount, "terrain buckets are not reducing candidate scans");

// Explicit invalidation is available for any future code that mutates a map
// definition in-place instead of replacing world content wholesale.
TERRAIN_RULES.invalidateTerrainLookup(west);
assert.strictEqual(TERRAIN_RULES.terrainTypeAt(west, 500, 280), slowTerrainTypeAt(west, 500, 280));

const server = read("server.js");
const config = read("public", "client-config.js");
const index = read("public", "index.html");
const readme = read("README.md");
assert(server.includes('const BUILD_VERSION = "6-11-370";'), "server build must be v347");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-370";'), "client build must be v347");
assert(index.includes('/shared/terrain-rules.js?v=370'), "v347 terrain-rules cache key missing");
assert(readme.includes('## v6-11-345 — Terrain lookup cache'), "README v345 terrain-cache changelog missing");

// Keep this timing informational rather than brittle: correctness + spatial
// candidate reduction are the regression contract, while timings vary by host.
const points = [];
for (let i = 0; i < 25000; i += 1) {
  points.push([(i * 37) % width, (i * 53) % height]);
}
let started = performance.now();
for (const [x, y] of points) slowTerrainTypeAt(west, x, y);
const slowMs = performance.now() - started;
started = performance.now();
for (const [x, y] of points) TERRAIN_RULES.terrainTypeAt(west, x, y);
const cachedMs = performance.now() - started;

console.log(`Terrain lookup cache checks passed: ${stats.regionCount} regions, ${stats.bucketCount} buckets, max ${stats.maxBucketSize} candidates/bucket; sample ${slowMs.toFixed(2)}ms -> ${cachedMs.toFixed(2)}ms.`);
