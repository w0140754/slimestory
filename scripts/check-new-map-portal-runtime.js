const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, "..");
const world = require(path.join(root, "public/shared/world-content.js"));
const clientMaps = fs.readFileSync(path.join(root, "public/client-maps.js"), "utf8");
const game = fs.readFileSync(path.join(root, "public/game.js"), "utf8");

assert(world.maps && typeof world.maps === "object", "WORLD_CONTENT maps missing");
assert(world.maps.forestPathWest, "current editor-created forestPathWest map missing from WORLD_CONTENT");
assert(
  clientMaps.includes("for (const mapId of Object.keys(WORLD_CONTENT?.maps || {}))") &&
  clientMaps.includes("mapStates[mapId] = buildSharedEnvironmentMapState(mapId);"),
  "client map registry must dynamically create runtime states for editor-authored maps"
);
assert(
  game.includes("if (!mapStates[mapId]) return false;") &&
  game.includes("portal.targetMapId") &&
  game.includes("portal.targetSpawnId"),
  "portal runtime guard/target wiring changed unexpectedly"
);

for (const [mapId, map] of Object.entries(world.maps)) {
  const portals = Array.isArray(map.portals) ? map.portals : [];
  for (const portal of portals) {
    const targetMap = world.maps[portal.targetMapId];
    assert(targetMap, `${mapId}:${portal.id} targets missing map ${portal.targetMapId}`);
    const targetSpawns = Array.isArray(targetMap.playerSpawns) ? targetMap.playerSpawns : [];
    assert(
      targetSpawns.some(spawn => spawn && spawn.id === portal.targetSpawnId),
      `${mapId}:${portal.id} targets missing spawn ${portal.targetSpawnId} on ${portal.targetMapId}`
    );
  }
}

const westPortal = (world.maps.prototypeIslandWest.portals || []).find(
  portal => portal.targetMapId === "forestPathWest"
);
assert(westPortal, "Prototype Island West portal to forestPathWest missing");
assert(westPortal.targetSpawnId === "center", "forestPathWest entry should target center spawn");

const returnPortal = (world.maps.forestPathWest.portals || []).find(
  portal => portal.targetMapId === "prototypeIslandWest"
);
assert(returnPortal, "forestPathWest return portal missing");
assert(
  (world.maps.prototypeIslandWest.playerSpawns || []).some(spawn => spawn.id === returnPortal.targetSpawnId),
  "forestPathWest return portal targets a missing Prototype Island West spawn"
);

console.log("New-map portal runtime regression check passed.");
