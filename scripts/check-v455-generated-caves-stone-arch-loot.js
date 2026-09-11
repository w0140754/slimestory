"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const game = read("public", "game.js");
const server = read("server.js");
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

// Spawn no longer owns an authored cave; cave content belongs to normal generation.
const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
delete require.cache[require.resolve(path.join(root, "public", "shared", "world-content.js"))];
const world = require(path.join(root, "public", "shared", "world-content.js"));
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = oldSeed;
const spawn = world.maps[world.worldGrid.startMapId];
assert.strictEqual((spawn.structures || []).filter(s => s.featureType === "cave").length, 0);
assert.strictEqual((spawn.features || []).filter(f => f.type === "cave").length, 0);
const generatedCaveEntries = Object.entries(world.maps).filter(([mapId, map]) =>
  mapId !== world.worldGrid.startMapId && (map.features || []).some(f => f.type === "cave" && f.simple === true)
);
assert.strictEqual(generatedCaveEntries.length, 3, "seed-0 fixture should still generate three compact caves outside Spawn");
for (const [, map] of generatedCaveEntries) {
  const cave = (map.structures || []).filter(s => s.featureType === "cave");
  const feature = (map.features || []).find(f => f.type === "cave" && f.simple === true);
  const regions = topology.automaticRoofRegions(cave, 16);
  assert.strictEqual(regions.length, feature.roomCount);
  assert(feature.roomCount >= 2 && feature.roomCount <= 3);
  assert(cave.some(s => s.kind === "stoneWall"));
  assert(cave.some(s => s.kind === "stoneCube"));
  assert(cave.filter(s => s.kind === "caveDoor").length >= 2);
}

// Stone Arch is a true boundary for roof topology but never a physical/light blocker.
assert.strictEqual(topology.layerOf({ kind: "caveDoor", axis: "horizontal" }), topology.LAYERS.BOUNDARY);
assert.strictEqual(geometry.isBoundaryStructure({ kind: "caveDoor", axis: "horizontal", x: 16, y: 16 }), true);
assert(game.includes('if (structure.kind === "caveDoor" || structure.kind === "caveMouth") continue;'));
assert(!game.includes('(structure?.kind === "caveDoor" && !doorVisuallyOpen(structure))'));
assert(!server.includes('["woodWall", "stoneWall", "stoneCube", "caveDoor", "woodDoor", "chest", "craftingTable"].includes(structure.kind)'));

// Salvage/pickup/inventory/hotbar/place lifecycle.
assert(html.includes('data-resource-key="stoneArches" data-build-item="caveDoor" data-hotbar-assignable="true"'));
assert(html.includes('id="inventoryStoneArchImg" src="assets/building/stone_cave_door_v451.png?v=451"'));
assert(!html.includes('data-craft-recipe="caveDoor"'), "Stone Arch is salvage-only for now, not craftable");
assert(game.includes('stoneArches: 0'));
assert(game.includes('stoneArches: "caveDoor"'));
assert(game.includes('if (itemId === "caveDoor") return "Stone Arch";'));
assert(game.includes('player.stoneArches = clampLocalSaveInteger(save.resources?.stoneArches'));
assert(game.includes('stoneArches: Math.max(0, Math.floor(Number(player.stoneArches) || 0))'));
assert(game.includes('["woodDoor", "caveDoor"].includes(kind) && !doorCandidateHasFlankingWalls(candidate)'));
assert(game.includes('else if (selectedBuildPiece === "caveDoor") drawNaturalCaveDoor(preview'));

assert(server.includes('message?.kind === "caveDoor" ? "caveDoor"'));
assert(server.includes('kind === "caveDoor" ? "stoneArches"'));
assert(server.includes('"stoneCubes", "stoneArches", "ropes", "woodDoors"'));
assert(server.includes('"stoneCube", "caveDoor", "woodDoor", "torch"'));
assert(server.includes('} else if (resource.kind === "caveDoor") {\n    playerState.stoneArches += 1;'));
assert(server.includes('totalStoneArches: playerState.stoneArches'));
assert(server.includes('stoneArches: previous && Number.isFinite(previous.stoneArches)'));
assert(server.includes('playerState.stoneArches = clampInteger(resources.stoneArches'));
assert(server.includes('["woodDoor", "caveDoor"].includes(structure.kind)) ? { axis: structure.axis }'));
assert(network.includes('["woodWall", "stoneWall", "woodDoor", "caveDoor"].includes(kind)'));
assert(network.includes('if (Number.isFinite(message.totalStoneArches)) player.stoneArches'));
assert(network.includes('if (Number.isFinite(message.stoneArches)) player.stoneArches'));
assert(enemies.includes('caveDoor: Object.freeze({'));
assert(enemies.includes('image: stoneArchLootImage'));

// Generic structure destroy path now succeeds for caveDoor because its kind is
// accepted by shared-resource spawning; no cave-only destroy implementation.
assert(server.includes('spawnSharedResource(\n    removed.mapId,\n    removed.kind,'));
assert(server.includes('"stoneCube", "caveDoor", "woodDoor", "torch", "chest"'));

console.log("v455 generated-cave/Stone Arch check passed: Spawn is clear, compact caves generate elsewhere, and Stone Arches salvage -> loot -> inventory -> hotbar -> placement through the generic structure pipeline.");
