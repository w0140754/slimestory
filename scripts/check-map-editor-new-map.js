"use strict";

const fs = require("fs");
const path = require("path");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");

function assert(condition, message) {
  if (!condition) throw new Error(`Map editor new-map regression: ${message}`);
}

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "map-editor.html"), "utf8");
const js = fs.readFileSync(path.join(root, "public", "map-editor.js"), "utf8");

for (const marker of [
  'id="newMapButton"',
  'id="newMapPanel"',
  'id="newMapName"',
  'id="newMapId"',
  'id="newMapWidth"',
  'id="newMapHeight"',
  'id="newMapTerrain"',
  'id="createMapButton"',
  'data-place="npc"',
  'id="npcTypeSelect"'
]) assert(html.includes(marker), `missing editor control ${marker}`);

for (const marker of [
  'function blankMapDefinition(',
  'function createNewMapFromForm()',
  'createdMapSources.set(id, clone(definition))',
  'editableMapIds.push(id)',
  'createNewMap: Boolean(draft.isNew || !WORLD_CONTENT.maps[mapId])',
  '{ value: "purple", label: "Purple slime" }',
  'spawn.variant === "purple" ? "#a77bd6"',
  'NPC_CHARACTER_TYPES.includes(npcTypeSelect.value)'
]) assert(js.includes(marker), `missing editor behavior ${marker}`);

const payload = {
  editorBuild: "372-test",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  createNewMap: true,
  mapId: "brandNewEditorMap",
  map: {
    name: "Brand New Editor Map",
    dimensions: { width: 640, height: 480 },
    playerSpawns: [{ id: "center", x: 320, y: 240 }],
    portals: [],
    environment: { trees: [], tallGrass: [], rocks: [], sceneryRocks: [], harvestFlowers: [], houses: [] },
    npcs: [{ id: "brandNewEditorMap:npc:1", type: "shopkeeper", x: 300, y: 220, interactionRadius: 24 }],
    enemySpawns: [{ id: "brandNewEditorMap:slime:1", type: "slime", variant: "purple", level: 4, x: 350, y: 220 }],
    terrain: { cellSize: 8, defaultType: "grass", regions: [] },
    collision: { waterRects: [] }
  }
};
const result = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
assert(result.ok, result.errors.join(" | "));
assert(result.createNewMap === true, "validator lost createNewMap intent");

console.log("Map editor new-map regression OK: new map flow, combined NPC selector, and Purple Slime authoring are wired.");
