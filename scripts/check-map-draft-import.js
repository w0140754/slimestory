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

const externalPath = process.env.SLIME_STORY_DRAFT_TEST;
if (externalPath && fs.existsSync(externalPath)) {
  const external = JSON.parse(fs.readFileSync(externalPath, "utf8"));
  result = MAP_DRAFT_FORMAT.validate(external, WORLD_CONTENT, TERRAIN_RULES);
  assert(result.ok, `external draft invalid: ${result.errors.join("; ")}`);
}
console.log("Map draft import validation OK");
