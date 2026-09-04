"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const adopted = require("../content/adopted-map-overrides.json");

const grove = WORLD_CONTENT.maps.waterfallGrove;
const west = WORLD_CONTENT.maps.prototypeIslandWest;
const grovePortal = grove?.portals?.find(portal => portal.targetMapId === "prototypeIslandWest");
const westPortal = west?.portals?.find(portal => portal.targetMapId === "waterfallGrove");

assert(grove, "Waterfall Grove map is missing");
assert.deepStrictEqual(grove.dimensions, { width: 640, height: 520 });
assert.strictEqual(grove.name, "Waterfall Grove");
assert.strictEqual(grove.enemySpawns.length, 0, "Waterfall Grove must remain a peaceful map");
assert(grove.environment.trees.length >= 100, "Waterfall Grove needs its dense forest canopy");
assert(
  grove.environment.tallGrass.filter(grass => grass.flowerType).length >= 20,
  "Waterfall Grove needs abundant flowering grass"
);
assert(grove.environment.harvestFlowers.length >= 16, "Waterfall Grove needs harvestable wildflowers");
assert(grove.landmarks?.waterfall && grove.landmarks.lightBeams?.length >= 3, "waterfall/light landmark data missing");
assert(grove.terrain.regions.some(region => region.type === "water"), "waterfall pool terrain missing");
assert(grove.terrain.regions.some(region => region.type === "dirt"), "simple approach path missing");

assert(grovePortal, "Waterfall Grove return portal missing");
assert(westPortal, "Prototype Island West entrance portal missing");
assert(
  grove.playerSpawns.some(spawn => spawn.id === westPortal.targetSpawnId),
  "west entrance does not target the Waterfall Grove spawn"
);
assert(
  west.playerSpawns.some(spawn => spawn.id === grovePortal.targetSpawnId),
  "grove return portal does not target the west trail spawn"
);
// The live editor may repaint or remove the original named dirt strip. The
// durable contract is the reciprocal portal and its valid authored spawn,
// both checked above, rather than one historical terrain-region id.

assert(adopted.version >= 53, "Waterfall Grove must preserve its adopted map revisions");
assert(adopted.maps.waterfallGrove, "Waterfall Grove is not present in adopted map data");
assert.deepStrictEqual(adopted.defaultPlayerLoad, { mapId: "prototypeIsland", spawnId: "center" });

const maps = read("public", "client-maps.js");
const terrain = read("public", "client-terrain.js");
const app = read("public", "client-app.js");
const editor = read("public", "map-editor.js");
const html = read("public", "index.html");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));

assert(maps.includes('buildSharedEnvironmentMapState("waterfallGrove")'), "client map state missing");
assert(maps.includes("waterfallGrove: waterfallGroveMap"), "client map registry missing grove");
assert(terrain.includes("function drawWaterfallGroveLandmark"), "waterfall renderer missing");
assert(terrain.includes("function drawWaterfallGroveAtmosphere"), "light/mist renderer missing");
assert(app.includes("drawWaterfallGroveLandmark(currentMapId, camX, camY)"), "ground landmark hook missing");
assert(app.includes("drawWaterfallGroveAtmosphere(currentMapId, camX, camY)"), "atmosphere hook missing");
assert(editor.includes("function drawMapLandmarks"), "map editor landmark preview missing");
assert.strictEqual(pkg.version, "0.6.11.368");
assert(server.includes('const BUILD_VERSION = "6-11-368";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-368";'));
assert(html.includes('/client-terrain.js?v=368') && html.includes('/client-app.js?v=368'));

console.log(
  `Waterfall Grove OK: ${grove.environment.trees.length} trees, ` +
  `${grove.environment.tallGrass.filter(grass => grass.flowerType).length} flower patches, ` +
  `${grove.environment.harvestFlowers.length} harvest flowers, world content v${WORLD_CONTENT.version}`
);
