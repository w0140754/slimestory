"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const building = path.join(root, "public", "assets", "building", "stone_cave_door_v451.png");
const data = fs.readFileSync(building);
assert.strictEqual(data.subarray(1, 4).toString("ascii"), "PNG");
assert.strictEqual(data.readUInt32BE(16), 16, "stone cave door must remain 16px wide");
assert.strictEqual(data.readUInt32BE(20), 32, "stone cave door must remain 32px tall");

const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = oldSeed;

const spawn = world.maps[world.worldGrid.startMapId];
assert.strictEqual((spawn.structures || []).filter(s => s.featureType === "cave").length, 0, "v455 removes the test maze from Spawn");
const caveFeatures = Object.values(world.maps).flatMap(map => (map.features || []).filter(feature => feature.type === "cave" && feature.simple === true));
assert(caveFeatures.length >= 2, "simple Stone Arch cave layouts should now come from ordinary world generation");
assert(caveFeatures.every(feature => feature.roomCount >= 2 && feature.roomCount <= 3));

for (const map of Object.values(world.maps)) {
  const simpleFeature = (map.features || []).find(feature => feature.type === "cave" && feature.simple === true);
  if (!simpleFeature) continue;
  const cave = (map.structures || []).filter(s => s.featureType === "cave");
  const arches = cave.filter(s => s.kind === "caveDoor");
  const regions = topology.automaticRoofRegions(cave, 16);
  assert(arches.length >= 2, "each simple generated cave needs an outside arch plus room connectors");
  assert(regions.length >= 2 && regions.length <= 3, "simple generated cave rooms must remain independently roofed");
}
console.log("v451 Stone Arch layout check passed: the user-drawn 16x32 arch remains wired and now connects compact generated cave rooms outside Spawn.");
