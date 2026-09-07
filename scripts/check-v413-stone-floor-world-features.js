"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));

const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const input = read("public", "client-input.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.413");
assert.strictEqual(world.version, 413);
assert(server.includes('const BUILD_VERSION = "6-11-413";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-413";'));
assert(html.includes('/game.js?v=413'));

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  assert(data.subarray(1, 4).toString("ascii") === "PNG", `${file} must be PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
assert.deepStrictEqual(pngDimensions(path.join(root, "public", "assets", "building", "stone_floor_v413.png")), [16, 16]);
assert.deepStrictEqual(pngDimensions(path.join(root, "public", "assets", "ui", "stone_floor.png")), [16, 16]);

assert.strictEqual(topology.VERSION, 2);
assert.strictEqual(topology.layerOf({ kind: "woodFloor" }), topology.LAYERS.SURFACE);
assert.strictEqual(topology.layerOf({ kind: "stoneFloor" }), topology.LAYERS.SURFACE);
assert(topology.SURFACE_KINDS.has("woodFloor") && topology.SURFACE_KINDS.has("stoneFloor"));

assert(game.includes('const BUILD_FLOOR_STRUCTURE_KINDS = Object.freeze(["woodFloor", "stoneFloor"]);'));
assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch"]);'));
assert(game.includes('stoneFloor: Object.freeze({'));
assert(game.includes('resourceKey: "stoneFloors"'));
assert(game.includes('structure?.kind === "stoneFloor" ? stoneFloorStructureImage : woodFloorStructureImage'));
assert(html.includes('data-build-item="stoneFloor"'));
assert(html.includes('id="inventoryStoneFloorCount"'));
assert(input.includes('["woodFloor", "stoneFloor"].includes(selectedBuildPiece)'));
assert(server.includes('const BUILD_FLOOR_KINDS = Object.freeze(new Set(["woodFloor", "stoneFloor"]));'));
assert(server.includes('stoneFloor: Object.freeze({ repeatable: true, resourceKey: "stoneFloors", outputCount: 4'));
assert(server.includes('"woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch"'));

const featureTypes = new Set();
let generatedBuildingCount = 0;
let generatedTreasureCount = 0;
let pondCount = 0;
let completeHouseCount = 0;
for (const [mapId, map] of Object.entries(world.maps)) {
  const features = Array.isArray(map.features) ? map.features : [];
  const structures = Array.isArray(map.structures) ? map.structures : [];
  for (const feature of features) {
    featureTypes.add(feature.type);
    if (["house", "ruin"].includes(feature.type)) {
      generatedBuildingCount += 1;
      assert(Math.abs(map.grid.x) === world.worldGrid.radius && Math.abs(map.grid.y) === world.worldGrid.radius,
        `${mapId} generated building must be corner-only`);
      const local = structures.filter(item => item.featureType === feature.type);
      assert(local.length > 0, `${mapId} ${feature.type} must be backed by static structures`);
      assert(local.every(item => item.worldGenerated === true && item.mapId === mapId));
      if (feature.type === "house") {
        completeHouseCount += 1;
        assert(topology.automaticRoofRegions(structures, 16).length >= 1,
          `${mapId} complete generated house must qualify for automatic roof topology`);
      }
    }
  }
  for (const npc of map.npcs || []) {
    if (npc.type !== "treasureChest") continue;
    generatedTreasureCount += 1;
    assert(typeof npc.id === "string" && npc.id.includes(":treasure:"));
    const houseFeature = features.find(feature => feature.id === npc.featureId);
    assert(houseFeature && ["house", "ruin"].includes(houseFeature.type), "treasure must belong to a generated building");
    assert(Math.hypot(npc.x - houseFeature.x, npc.y - houseFeature.y) <= 24, "treasure must be inside the generated building footprint");
  }
  for (const region of map.terrain?.regions || []) {
    if (region.type === "water") pondCount += 1;
  }
  for (const structure of structures.filter(item => item.featureType === "stonePatch")) {
    assert.strictEqual(structure.kind, "stoneFloor", "stone patches must reuse the real buildable Stone Floor surface");
  }
}

assert(generatedBuildingCount >= 0 && generatedBuildingCount <= 2, "world generation must contain at most two rare houses/ruins total");
assert(completeHouseCount >= 1, "current deterministic world should expose a complete house for regression coverage");
assert(generatedTreasureCount >= 1, "current deterministic world should expose at least one treasure house for regression coverage");
for (const type of ["pond", "meadow", "treeRing", "stonePatch"]) {
  assert(featureTypes.has(type), `current coordinate world must exercise ${type}`);
}
assert(pondCount >= 3, "pond features must compile to existing water terrain regions");

// Map variety is immutable world content. It must be available to both sides
// without adding the generated structures to map-entry or idle websocket data.
assert(server.includes("function worldGeneratedStructuresOnMap(mapId)"));
assert(server.includes("function dynamicStructuresOnMap(mapId)"));
assert(server.includes("return dynamicStructuresOnMap(mapId).map(structure => ({"));
assert(server.includes("keeps map variety effectively zero-idle-traffic"));
assert(game.includes("function worldGeneratedStructuresForMap(mapId = currentMapId)"));
assert(game.includes("worldStructures.concat(placedStructures)"));
assert(server.includes("TERRAIN_RULES.circleCanOccupy(definition, x, y, 5, { allowWater: false })"),
  "runtime enemy generation must reject new pond water without authored spawn positions");

// Treasure is event-driven: one interaction request + one private response,
// with opened IDs carried only by local/persistent progression state.
assert(network.includes("requestTreasureOpen(chestId)"));
assert(network.includes('type: "treasureOpen"'));
assert(server.includes("function handleTreasureOpen(playerId, socket, message)"));
assert(server.includes('type: "treasureResult"'));
assert(server.includes("Static chests never poll, broadcast, or"));
assert(!server.includes("treasureSnapshot"));
assert(!server.includes("treasureHeartbeat"));

console.log(`v413 Stone Floor + world features check passed: ${generatedBuildingCount} generated building(s), ${generatedTreasureCount} treasure chest(s), ponds/meadows/tree rings/stone patches, and static zero-idle-traffic map variety.`);
