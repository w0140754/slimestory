"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const game = read("public", "game.js");
const server = read("server.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.subarray(1, 4).toString("ascii"), "PNG");
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
const building = path.join(root, "public", "assets", "building");
const ui = path.join(root, "public", "assets", "ui");
for (const file of ["stone_cube_v448.png", "stone_cube_variant_2_v448.png", "stone_cube_variant_3_v448.png"]) {
  assert.deepStrictEqual(pngDimensions(path.join(building, file)), [16, 16], `${file} must be 16x16`);
}
assert.deepStrictEqual(pngDimensions(path.join(ui, "stone_cube.png")), [16, 16]);

assert.strictEqual(geometry.isBoundaryStructure({ kind: "stoneCube", x: 32, y: 32 }), false);
assert.strictEqual(topology.layerOf({ kind: "stoneCube", x: 32, y: 32 }), topology.LAYERS.OBJECT);
assert.strictEqual(topology.layerOf({ kind: "stoneWall", axis: "horizontal", x: 32, y: 24 }), topology.LAYERS.BOUNDARY);
assert(game.includes('const BUILD_WALL_STRUCTURE_KINDS = Object.freeze(["woodWall", "stoneWall"]);'));
assert(server.includes('const BUILD_WALL_KINDS = Object.freeze(new Set(["woodWall", "stoneWall"]));'));
assert(network.includes('["woodWall", "stoneWall", "woodDoor", "caveDoor"].includes(kind)'));
assert(!network.includes('["woodWall", "stoneWall", "stoneCube", "woodDoor"].includes(kind)'));
assert(game.includes('function drawStoneCube(structure, camX, camY, alpha = 1) {'));
assert(game.includes('function stoneCubePlacementCandidate(worldX, worldY) {'));
assert(server.includes('if (structure?.kind === "stoneCube") {\n    return STRUCTURE_GEOMETRY.stoneCubeFootprintRect(structure);'));
assert(server.includes('structure?.kind === "stoneCube" ||'), "Stone Cube must block combat line-of-effect without joining wall topology");
assert(game.includes('const isStoneCube = structure?.kind === "stoneCube";'));
assert(game.includes('structure?.kind === "stoneCube" ||') === false, "client cube line-of-effect should use its dedicated isStoneCube branch");

assert(server.includes('stoneCube: Object.freeze({ resourceKey: "stoneCubes", outputCount: 1, ingredients: Object.freeze({ stone: 1 }) })'));
assert(html.includes('data-resource-key="stoneCubes" data-build-item="stoneCube"'));
assert(html.includes('data-craft-recipe="stoneCube"'));
assert(network.includes('if (Number.isFinite(message.totalStoneCubes)) player.stoneCubes'));
assert(game.includes('save.resources?.stoneCubes ?? save.resources?.stoneShortWalls'));
assert(game.includes('savedItemId === "stoneShortWall" ? "stoneCube" : savedItemId'));
assert(server.includes('resources.stoneCubes ?? resources.stoneShortWalls'));

const previousSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
if (previousSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = previousSeed;
const generatedCaveMap = Object.entries(world.maps).find(([mapId, map]) => mapId !== world.worldGrid.startMapId && (map.features || []).some(f => f.type === "cave"));
assert(generatedCaveMap, "seed-0 should expose a generated cave for Stone Cube regression coverage");
const cave = generatedCaveMap[1].structures.filter(s => s?.featureType === "cave");
const floors = cave.filter(s => s.kind === "caveFloor");
const walls = cave.filter(s => s.kind === "stoneWall");
const cubes = cave.filter(s => s.kind === "stoneCube");
const caveDoors = cave.filter(s => s.kind === "caveDoor");
assert(floors.length >= 8 && floors.length <= 10);
assert(cubes.length >= 3 && cubes.every(c => c.foregroundDetail === true));
assert(caveDoors.length >= 2);
assert(walls.length > 12);
const regions = topology.automaticRoofRegions(cave, 16);
assert(regions.length >= 2 && regions.length <= 3);

console.log("v448 Stone Cube cave model check passed: Stone Cubes remain object-layer detail while simple generated caves use tall Stone Walls and Stone Arch-separated roof rooms outside Spawn.");
