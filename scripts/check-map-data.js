"use strict";

const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");

function fail(message) {
  throw new Error(`Map data validation failed: ${message}`);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function positiveRect(rect, label) {
  if (
    !finite(rect?.x) ||
    !finite(rect?.y) ||
    !finite(rect?.width) ||
    !finite(rect?.height) ||
    Number(rect.width) <= 0 ||
    Number(rect.height) <= 0
  ) {
    fail(`${label} must be a finite positive rectangle`);
  }
}

function validatePoint(item, label) {
  if (!finite(item?.x) || !finite(item?.y)) {
    fail(`${label} must have finite x/y coordinates`);
  }
}

function validateUniqueIds(mapId, groups) {
  const ids = new Set();
  for (const [groupName, items] of groups) {
    for (const item of items || []) {
      if (typeof item?.id !== "string" || item.id.length === 0) {
        fail(`${mapId}.${groupName} contains an item without an id`);
      }
      if (ids.has(item.id)) {
        fail(`${mapId} contains duplicate id "${item.id}"`);
      }
      ids.add(item.id);
    }
  }
}

for (const [mapId, map] of Object.entries(WORLD_CONTENT.maps || {})) {
  if (map.dimensions) {
    if (
      !finite(map.dimensions.width) ||
      !finite(map.dimensions.height) ||
      Number(map.dimensions.width) <= 0 ||
      Number(map.dimensions.height) <= 0
    ) {
      fail(`${mapId}.dimensions must be positive`);
    }
  }

  const environment = map.environment || {};
  const idGroups = [
    ["playerSpawns", map.playerSpawns],
    ["portals", map.portals],
    ["enemySpawns", map.enemySpawns],
    ["trees", environment.trees],
    ["tallGrass", environment.tallGrass],
    ["rocks", environment.rocks],
    ["sceneryRocks", environment.sceneryRocks],
    ["harvestFlowers", environment.harvestFlowers],
    ["houses", environment.houses]
  ];
  validateUniqueIds(mapId, idGroups);

  for (const [groupName, items] of idGroups) {
    for (const item of items || []) {
      validatePoint(item, `${mapId}.${groupName}.${item.id}`);
    }
  }

  if (map.terrain) {
    const size = Number(map.terrain.cellSize);
    if (!Number.isFinite(size) || size < 2) {
      fail(`${mapId}.terrain.cellSize must be >= 2`);
    }

    if (!TERRAIN_RULES.TYPES[map.terrain.defaultType]) {
      fail(`${mapId}.terrain.defaultType is unknown`);
    }

    for (const [index, region] of (map.terrain.regions || []).entries()) {
      if (!TERRAIN_RULES.TYPES[region.type]) {
        fail(`${mapId}.terrain.regions[${index}] has unknown type`);
      }
      positiveRect(region.rect || region, `${mapId}.terrain.regions[${index}]`);
    }
  }

  for (const portal of map.portals || []) {
    positiveRect(portal, `${mapId}.portals.${portal.id}`);
    const target = WORLD_CONTENT.maps?.[portal.targetMapId];
    if (!target) {
      fail(`${portal.id} targets missing map "${portal.targetMapId}"`);
    }
    if (!(target.playerSpawns || []).some(spawn => spawn.id === portal.targetSpawnId)) {
      fail(`${portal.id} targets missing spawn "${portal.targetSpawnId}" on ${portal.targetMapId}`);
    }
  }
}

console.log(
  `Map data OK: ${Object.keys(WORLD_CONTENT.maps || {}).length} maps, schema ${WORLD_CONTENT.schemaVersion || 0}`
);
