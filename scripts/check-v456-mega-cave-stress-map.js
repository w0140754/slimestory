"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const source = read("public", "shared", "world-content.js");
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));
assert(!source.includes('const MEGA_CAVE_TEST_MAP_ID = worldGridMapId(1, 1);'));
assert(!source.includes('function addMegaCaveTestMap() {'));
assert(source.includes('function buildGeneratedUndergroundMap(x, y) {'));

const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED;
else process.env.SLIME_STORY_WORLD_SEED = oldSeed;

const spawn = world.maps[world.worldGrid.startMapId];
assert.strictEqual((spawn.features || []).filter(f => f.type === "cave").length, 0, "Spawn must remain cave-free");

const map = world.maps.world_p1_p1;
assert(map, "southeast stress-test map must exist");
assert.notStrictEqual(map.name, "Great Cavern");
const feature = (map.features || []).find(f => f.type === "cave" && f.mega === true);
assert.strictEqual(feature, undefined, "retired Great Cavern must not be instantiated");

const cave = (map.structures || []).filter(s => s.featureType === "cave");
const floors = cave.filter(s => s.kind === "caveFloor");
const walls = cave.filter(s => s.kind === "stoneWall");
const arches = cave.filter(s => s.kind === "caveDoor");
const cubes = cave.filter(s => s.kind === "stoneCube");
const chests = cave.filter(s => s.kind === "chest" && s.treasure);
assert(floors.length < 100, "southeast map must no longer contain the near-map-scale stress cave");

function hasArch(axis, x, y) {
  return arches.some(arch => arch.axis === axis && arch.x === x && arch.y === y);
}
assert(!hasArch("horizontal", 200, 48));
assert(!hasArch("horizontal", 200, 352));

const regions = topology.automaticRoofRegions(cave, 16);
assert(regions.length < 10, "retired stress cave must not leave its 41-region roof topology behind");
const oneCellRegionKeys = new Set(
  regions.filter(region => region.floors.length === 1)
    .map(region => `${region.floors[0].x},${region.floors[0].y}`)
);
const columnGridCells = [
  [-2, -1], [2, -1], [-2, 1], [2, 1],
  [-2, -6], [2, -6], [-2, 6], [2, 6],
  [-7, -1], [-7, 1], [7, -1], [7, 1]
];
for (const [gx, gy] of columnGridCells) assert(!oneCellRegionKeys.has(`${200 + gx * 16},${200 + gy * 16}`));

assert(map.environment.trees.length > 0);
assert(map.environment.tallGrass.length > 0);
assert(map.environment.rocks.length > 0);
assert(map.environment.harvestFlowers.length > 0);
assert(map.enemyGeneration && map.enemyGeneration.slimeCount > 0, "runtime enemy population rules must remain active on the cave map");

const compactFeatures = Object.values(world.maps)
  .flatMap(entry => entry.features || [])
  .filter(entry => entry.type === "cave" && entry.simple === true);
assert(compactFeatures.length >= 3, "ordinary compact surface-cave generation should remain intact");

console.log("v456 retirement compatibility passed: the Great Cavern stress reservation is gone and southeast normal generation is restored.");
