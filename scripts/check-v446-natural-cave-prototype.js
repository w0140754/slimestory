"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const game = read("public", "game.js");
const server = read("server.js");
assert.strictEqual(pkg.version, "0.6.11.471");
const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = oldSeed;

const spawn = world.maps[world.worldGrid.startMapId];
assert.strictEqual((spawn.structures || []).filter(s => s?.featureType === "cave").length, 0, "v455 must remove the authored cave from Spawn");
assert.strictEqual((spawn.features || []).filter(f => f?.type === "cave").length, 0, "Spawn must no longer reserve a cave feature");

const generated = Object.entries(world.maps)
  .filter(([mapId]) => mapId !== world.worldGrid.startMapId)
  .filter(([, map]) => (map.features || []).some(feature => feature.type === "cave" && feature.simple === true))
  .map(([mapId, map]) => ({ mapId, map, cave: (map.structures || []).filter(s => s?.featureType === "cave") }));
assert(generated.length >= 2, "seed-0 world should expose multiple simple generated caves outside Spawn");
for (const entry of generated) {
  const floors = entry.cave.filter(s => s.kind === "caveFloor");
  const walls = entry.cave.filter(s => s.kind === "stoneWall");
  const cubes = entry.cave.filter(s => s.kind === "stoneCube");
  const arches = entry.cave.filter(s => s.kind === "caveDoor");
  assert(floors.length >= 8 && floors.length <= 10, `${entry.mapId} cave should stay compact`);
  assert(walls.length > 0 && cubes.length > 0 && arches.length >= 2);
  const regions = topology.automaticRoofRegions(entry.cave, 16);
  assert(regions.length >= 2 && regions.length <= 3, `${entry.mapId} cave should be a small multi-room structure`);
  assert(regions.every(region => region.floors.length >= 2));
}
assert.strictEqual(topology.layerOf({ kind: "stoneCube" }), topology.LAYERS.OBJECT);
assert.strictEqual(topology.layerOf({ kind: "caveDoor", axis: "horizontal" }), topology.LAYERS.BOUNDARY);
assert.strictEqual(geometry.isBoundaryStructure({ kind: "caveDoor", axis: "horizontal", x: 0, y: 0 }), true);
assert(game.includes('function drawNaturalCaveDoor(structure, camX, camY, alpha = 1) {'));
assert(game.includes('if (structure.kind === "caveDoor" || structure.kind === "caveMouth") continue;'), "Stone Arch must remain walk-through on the client");
assert(!server.includes('["woodWall", "stoneWall", "stoneCube", "caveDoor", "woodDoor", "chest", "craftingTable"].includes(structure.kind)'), "Stone Arch must remain non-blocking in server player movement");
console.log("v446 cave compatibility check passed: Spawn is cave-free and compact generated caves retain multi-room roof topology, Stone Cubes, Stone Walls, and walk-through Stone Arches.");
