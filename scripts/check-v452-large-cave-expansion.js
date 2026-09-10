"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
assert.strictEqual(pkg.version, "0.6.11.468");

const worldContentSource = read("public", "shared", "world-content.js");
assert(!worldContentSource.includes('largeLayout: true'), "the large authored Spawn test maze must be retired");
assert(!worldContentSource.includes('const chestPlacements = ['), "the fixed Spawn treasure-maze placements must be retired");
assert(worldContentSource.includes('const templates = ['), "v455 should retain cave-shape variety as compact generation templates");
assert(worldContentSource.includes('templateIndex = worldGridHash'));
assert(worldContentSource.includes('rotation = worldGridHash'));

const previousSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
if (previousSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = previousSeed;

const spawn = world.maps[world.worldGrid.startMapId];
assert.strictEqual((spawn.features || []).filter(f => f.type === "cave").length, 0);
let generatedCaveCount = 0;
const templateNames = new Set();
for (const [mapId, map] of Object.entries(world.maps)) {
  if (mapId === world.worldGrid.startMapId) continue;
  const feature = (map.features || []).find(f => f.type === "cave" && f.simple === true);
  if (!feature) continue;
  generatedCaveCount += 1;
  templateNames.add(feature.template);
  const cave = (map.structures || []).filter(s => s.featureType === "cave");
  const floors = cave.filter(s => s.kind === "caveFloor");
  const regions = topology.automaticRoofRegions(cave, 16);
  assert(floors.length <= 10, "v455 generated caves should be simple rather than full-map mazes");
  assert(regions.length === feature.roomCount);
}
assert(generatedCaveCount >= 2);
assert(templateNames.size >= 2, "seed-0 generated caves should exercise more than one compact template");
console.log("v452 supersession check passed: the large Spawn maze is retired in favor of small varied/rotated world-generated cave templates.");
