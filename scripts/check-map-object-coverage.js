"use strict";

const fs = require("fs");
const path = require("path");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const editorJs = fs.readFileSync(path.join(root, "public", "map-editor.js"), "utf8");
const editorHtml = fs.readFileSync(path.join(root, "public", "map-editor.html"), "utf8");
const clientMaps = fs.readFileSync(path.join(root, "public", "client-maps.js"), "utf8");

for (const marker of [
  'data-place="harvestFlower"',
  'data-place="house"'
]) {
  if (!editorHtml.includes(marker)) throw new Error(`Editor palette missing ${marker}`);
}

for (const marker of [
  'harvestFlower: { layer: "objects"',
  'house: { layer: "objects"',
  'draft.map.environment.harvestFlowers.push(item)',
  'draft.map.environment.houses.push(item)',
  'descriptor.kind === "harvestFlower"',
  'descriptor.kind === "house"'
]) {
  if (!editorJs.includes(marker)) throw new Error(`Editor object coverage missing ${marker}`);
}

for (const marker of [
  'runtimeHarvestFlowerFromSharedDefinition',
  'runtimeHouseFromSharedDefinition',
  'harvestFlowers: (environment.harvestFlowers || []).map(runtimeHarvestFlowerFromSharedDefinition)',
  'houses: (environment.houses || []).map(runtimeHouseFromSharedDefinition)'
]) {
  if (!clientMaps.includes(marker)) throw new Error(`Client runtime object coverage missing ${marker}`);
}

const source = WORLD_CONTENT.maps.prototypeIsland;
const draft = JSON.parse(JSON.stringify(source));
draft.environment.harvestFlowers = [{
  id: "prototypeIsland:flower:1",
  x: 320,
  y: 250,
  phase: 0.4,
  type: "blue"
}];
draft.environment.houses = [{
  id: "prototypeIsland:house:1",
  x: 390,
  y: 310,
  variant: "red",
  collision: { width: 48, height: 30 }
}];

const payload = {
  editorBuild: "293",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  mapId: "prototypeIsland",
  map: draft
};

const result = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
if (!result.ok) throw new Error(`Valid flower/house draft rejected: ${result.errors.join(" | ")}`);

const bad = JSON.parse(JSON.stringify(payload));
bad.map.environment.harvestFlowers[0].type = "pink";
bad.map.environment.houses[0].variant = "castle";
const badResult = MAP_DRAFT_FORMAT.validate(bad, WORLD_CONTENT, TERRAIN_RULES);
if (badResult.ok || badResult.errors.length < 2) {
  throw new Error("Unsupported flower/house variants should fail validation");
}

console.log("Map object coverage OK: harvest flowers + houses are editable, validated, and runtime-backed");
