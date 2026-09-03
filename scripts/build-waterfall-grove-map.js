"use strict";

const WORLD_CONTENT = require("../public/shared/world-content.js");
const {
  adoptDraftPayload,
  loadStore
} = require("../tools/map-draft-adoption.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function payloadFor(mapId, map) {
  return {
    mapId,
    schemaVersion: WORLD_CONTENT.schemaVersion,
    worldContentVersion: loadStore().version,
    editorBuild: "356",
    map
  };
}

const west = clone(WORLD_CONTENT.maps.prototypeIslandWest);
west.playerSpawns = Array.isArray(west.playerSpawns) ? west.playerSpawns : [];
west.portals = Array.isArray(west.portals) ? west.portals : [];
west.environment = west.environment || {};
west.environment.trees = Array.isArray(west.environment.trees)
  ? west.environment.trees
  : [];

if (!west.playerSpawns.some(spawn => spawn.id === "waterfallTrail")) {
  west.playerSpawns.push({ id: "waterfallTrail", x: 480, y: 196 });
}

if (!west.portals.some(portal => portal.id === "prototypeIslandWest:portal:waterfallGrove")) {
  west.portals.push({
    id: "prototypeIslandWest:portal:waterfallGrove",
    x: 464,
    y: 124,
    width: 32,
    height: 16,
    targetMapId: "waterfallGrove",
    targetSpawnId: "southEntrance"
  });
}

// Open exactly one tree-width gap beside the north-running water and paint a
// short trail into it. Everything else in the editor-authored west map stays
// byte-for-byte represented in the adopted map object.
west.environment.trees = west.environment.trees.filter(
  tree => tree.id !== "prototypeIslandWest:tree:55"
);
west.terrain.regions = Array.isArray(west.terrain?.regions)
  ? west.terrain.regions
  : [];
if (!west.terrain.regions.some(region => region.id === "waterfall-grove-trail")) {
  west.terrain.regions.push({
    id: "waterfall-grove-trail",
    type: "dirt",
    x: 464,
    y: 128,
    width: 32,
    height: 96
  });
}

const westResult = adoptDraftPayload(payloadFor("prototypeIslandWest", west));
const grove = clone(WORLD_CONTENT.maps.waterfallGrove);
grove.terrain.regions = [
  { type: "grass", x: 64, y: 64, width: 512, height: 400 },
  { type: "dirt", x: 304, y: 272, width: 32, height: 192 },
  { type: "dirt", x: 288, y: 272, width: 64, height: 40 },
  { type: "water", x: 248, y: 192, width: 144, height: 8 },
  { type: "water", x: 232, y: 200, width: 176, height: 16 },
  { type: "water", x: 224, y: 216, width: 192, height: 56 },
  { type: "water", x: 232, y: 272, width: 176, height: 16 },
  { type: "water", x: 248, y: 288, width: 144, height: 16 },
  { type: "water", x: 272, y: 80, width: 96, height: 152 },
  { type: "void", x: 160, y: 64, width: 112, height: 136 },
  { type: "void", x: 368, y: 64, width: 112, height: 136 }
];
const groveResult = adoptDraftPayload(payloadFor("waterfallGrove", grove));

console.log(
  `Waterfall Grove map ready: west ${westResult.changed ? "updated" : "unchanged"}, ` +
  `grove ${groveResult.changed ? "updated" : "unchanged"}, world content v${groveResult.version}.`
);
