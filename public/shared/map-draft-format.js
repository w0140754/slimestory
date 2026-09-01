(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MAP_DRAFT_FORMAT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function finite(value) { return Number.isFinite(Number(value)); }
  function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

  function validate(payload, worldContent, terrainRules) {
    const errors = [];
    const warnings = [];
    const fail = message => errors.push(message);
    const warn = message => warnings.push(message);

    if (!plainObject(payload)) return { ok: false, errors: ["Draft root must be a JSON object."], warnings };
    const mapId = typeof payload.mapId === "string" ? payload.mapId.trim() : "";
    if (!mapId) fail("Draft is missing mapId.");

    const sourceMap = mapId ? worldContent?.maps?.[mapId] : null;
    if (mapId && !sourceMap) fail(`Map \"${mapId}\" is not available in this build.`);

    if (Number(payload.schemaVersion) !== Number(worldContent?.schemaVersion)) {
      fail(`Schema ${payload.schemaVersion ?? "?"} is incompatible with this editor (schema ${worldContent?.schemaVersion ?? "?"}).`);
    }
    if (payload.worldContentVersion != null && Number(payload.worldContentVersion) !== Number(worldContent?.version)) {
      warn(`Draft world content is v${payload.worldContentVersion}; this build uses v${worldContent?.version}.`);
    }

    const map = payload.map;
    if (!plainObject(map)) fail("Draft is missing its map object.");
    if (!map || !plainObject(map.dimensions) || !finite(map.dimensions.width) || !finite(map.dimensions.height) || Number(map.dimensions.width) <= 0 || Number(map.dimensions.height) <= 0) {
      fail("Map dimensions must contain positive finite width/height values.");
    } else if (sourceMap?.dimensions && (Number(map.dimensions.width) !== Number(sourceMap.dimensions.width) || Number(map.dimensions.height) !== Number(sourceMap.dimensions.height))) {
      fail(`Draft dimensions ${map.dimensions.width}×${map.dimensions.height} do not match ${mapId} (${sourceMap.dimensions.width}×${sourceMap.dimensions.height}).`);
    }

    const terrain = map?.terrain;
    if (!plainObject(terrain)) {
      fail("Draft map is missing terrain data.");
    } else {
      if (!finite(terrain.cellSize) || Number(terrain.cellSize) < 2) fail("terrain.cellSize must be at least 2.");
      if (!terrainRules?.TYPES?.[terrain.defaultType]) fail(`Unknown terrain.defaultType \"${terrain.defaultType}\".`);
      if (!Array.isArray(terrain.regions)) fail("terrain.regions must be an array.");
      for (const [index, region] of (Array.isArray(terrain.regions) ? terrain.regions : []).entries()) {
        if (!terrainRules?.TYPES?.[region?.type]) fail(`terrain.regions[${index}] has unknown type \"${region?.type}\".`);
        const rect = region?.rect && plainObject(region.rect) ? region.rect : region;
        if (!finite(rect?.x) || !finite(rect?.y) || !finite(rect?.width) || !finite(rect?.height) || Number(rect.width) <= 0 || Number(rect.height) <= 0) {
          fail(`terrain.regions[${index}] must be a finite positive rectangle.`);
        }
      }
    }

    const env = plainObject(map?.environment) ? map.environment : {};
    const groups = [
      ["playerSpawns", map?.playerSpawns], ["portals", map?.portals], ["enemySpawns", map?.enemySpawns], ["npcs", map?.npcs],
      ["trees", env.trees], ["tallGrass", env.tallGrass], ["rocks", env.rocks], ["sceneryRocks", env.sceneryRocks],
      ["harvestFlowers", env.harvestFlowers], ["houses", env.houses]
    ];
    const ids = new Set();
    for (const [name, items] of groups) {
      if (items != null && !Array.isArray(items)) { fail(`${name} must be an array.`); continue; }
      for (const [index, item] of (items || []).entries()) {
        if (!plainObject(item)) { fail(`${name}[${index}] must be an object.`); continue; }
        if (typeof item.id !== "string" || !item.id) fail(`${name}[${index}] is missing an id.`);
        else if (ids.has(item.id)) fail(`Duplicate object id \"${item.id}\".`);
        else ids.add(item.id);
        if (!finite(item.x) || !finite(item.y)) fail(`${name}[${index}] must have finite x/y coordinates.`);
      }
    }

    if (map?.defaultPlayerSpawnId != null) {
      if (typeof map.defaultPlayerSpawnId !== "string" || !map.defaultPlayerSpawnId) {
        fail("defaultPlayerSpawnId must be a non-empty string when provided.");
      } else if (!(Array.isArray(map?.playerSpawns) ? map.playerSpawns : []).some(spawn => spawn?.id === map.defaultPlayerSpawnId)) {
        fail(`defaultPlayerSpawnId "${map.defaultPlayerSpawnId}" does not match a player spawn on this map.`);
      }
    }

    for (const [index, enemy] of (Array.isArray(map?.enemySpawns) ? map.enemySpawns : []).entries()) {
      if (!["slime", "mushroom", "goblin", "ghost", "bigGoldSlime"].includes(enemy?.type)) {
        fail(`enemySpawns[${index}] has unsupported type "${enemy?.type}".`);
      }
      if (enemy?.level != null && (!finite(enemy.level) || Number(enemy.level) < 1)) {
        fail(`enemySpawns[${index}].level must be at least 1 when provided.`);
      }
    }

    for (const [index, npc] of (Array.isArray(map?.npcs) ? map.npcs : []).entries()) {
      if (!["shopkeeper", "hunter", "jester", "craftingTable", "classResetCrystal"].includes(npc?.type)) {
        fail(`npcs[${index}] has unsupported type "${npc?.type}".`);
      }
      if (npc?.interactionRadius != null && (!finite(npc.interactionRadius) || Number(npc.interactionRadius) < 8)) {
        fail(`npcs[${index}].interactionRadius must be at least 8 when provided.`);
      }
    }

    for (const [index, flower] of (Array.isArray(env.harvestFlowers) ? env.harvestFlowers : []).entries()) {
      if (!["white", "blue"].includes(flower?.type)) {
        fail(`harvestFlowers[${index}] has unsupported type "${flower?.type}".`);
      }
      if (flower?.phase != null && !finite(flower.phase)) {
        fail(`harvestFlowers[${index}].phase must be finite when provided.`);
      }
    }

    for (const [index, house] of (Array.isArray(env.houses) ? env.houses : []).entries()) {
      if (house?.variant != null && !["default", "red"].includes(house.variant)) {
        fail(`houses[${index}] has unsupported variant "${house.variant}".`);
      }
      if (house?.collision != null) {
        if (!plainObject(house.collision) || !finite(house.collision.width) || !finite(house.collision.height) || Number(house.collision.width) <= 0 || Number(house.collision.height) <= 0) {
          fail(`houses[${index}].collision must contain positive finite width/height values.`);
        }
      }
    }

    for (const [index, portal] of (Array.isArray(map?.portals) ? map.portals : []).entries()) {
      if (![portal?.x, portal?.y, portal?.width, portal?.height].every(finite) || Number(portal.width) <= 0 || Number(portal.height) <= 0) {
        fail(`portals[${index}] must be a finite positive rectangle.`);
        continue;
      }
      const targetMap = portal.targetMapId === mapId ? map : worldContent?.maps?.[portal.targetMapId];
      if (!targetMap) warn(`Portal \"${portal.id || index}\" targets missing map \"${portal.targetMapId}\"; reopen it and choose a valid target.`);
      else if (!(targetMap.playerSpawns || []).some(spawn => spawn.id === portal.targetSpawnId)) {
        warn(`Portal \"${portal.id || index}\" targets missing spawn \"${portal.targetSpawnId}\" on ${portal.targetMapId}; reopen it and choose a valid target.`);
      }
    }

    return { ok: errors.length === 0, errors, warnings, mapId, map, editorBuild: payload.editorBuild ?? null };
  }

  return Object.freeze({ validate });
});

