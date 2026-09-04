"use strict";
const fs = require("fs");
const path = require("path");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");

function assert(condition, message) { if (!condition) throw new Error(`Map draft import check failed: ${message}`); }
const mapId = "prototypeIsland";
const payload = {
  editorBuild: "284",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  mapId,
  map: JSON.parse(JSON.stringify(WORLD_CONTENT.maps[mapId]))
};
let result = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
assert(result.ok, result.errors.join("; "));
const badSchema = { ...payload, schemaVersion: 999 };
assert(!MAP_DRAFT_FORMAT.validate(badSchema, WORLD_CONTENT, TERRAIN_RULES).ok, "bad schema should be rejected");
const badDimensions = JSON.parse(JSON.stringify(payload));
badDimensions.map.dimensions.width += 8;
assert(!MAP_DRAFT_FORMAT.validate(badDimensions, WORLD_CONTENT, TERRAIN_RULES).ok, "dimension mismatch should be rejected");


const newMapPayload = {
  editorBuild: "372-test",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  createNewMap: true,
  mapId: "editorNewMapTest",
  map: {
    name: "Editor New Map Test",
    dimensions: { width: 320, height: 240 },
    playerSpawns: [{ id: "center", x: 160, y: 120 }],
    portals: [],
    environment: { trees: [], tallGrass: [], rocks: [], sceneryRocks: [], harvestFlowers: [], houses: [] },
    npcs: [],
    enemySpawns: [{ id: "editorNewMapTest:slime:1", type: "slime", variant: "purple", level: 4, x: 180, y: 120 }],
    terrain: { cellSize: 8, defaultType: "grass", regions: [] },
    collision: { waterRects: [] }
  }
};
const newMapResult = MAP_DRAFT_FORMAT.validate(newMapPayload, WORLD_CONTENT, TERRAIN_RULES);
assert(newMapResult.ok, `new map draft rejected: ${newMapResult.errors.join("; ")}`);
assert(newMapResult.createNewMap === true, "new map intent should survive validation");
const unmarkedNewMap = { ...newMapPayload, createNewMap: false };
assert(!MAP_DRAFT_FORMAT.validate(unmarkedNewMap, WORLD_CONTENT, TERRAIN_RULES).ok, "unknown map without createNewMap should be rejected");
const badNewMapId = { ...newMapPayload, mapId: "../bad-map" };
assert(!MAP_DRAFT_FORMAT.validate(badNewMapId, WORLD_CONTENT, TERRAIN_RULES).ok, "unsafe new map id should be rejected");
const badPurpleVariant = JSON.parse(JSON.stringify(newMapPayload));
badPurpleVariant.map.enemySpawns[0].variant = "ultraviolet";
assert(!MAP_DRAFT_FORMAT.validate(badPurpleVariant, WORLD_CONTENT, TERRAIN_RULES).ok, "unsupported slime variant should be rejected");

const externalPath = process.env.SLIME_STORY_DRAFT_TEST;
if (externalPath && fs.existsSync(externalPath)) {
  const external = JSON.parse(fs.readFileSync(externalPath, "utf8"));
  result = MAP_DRAFT_FORMAT.validate(external, WORLD_CONTENT, TERRAIN_RULES);
  assert(result.ok, `external draft invalid: ${result.errors.join("; ")}`);
}
console.log("Map draft import validation OK, including new-map creation and Purple Slime authoring");
