const fs = require("fs");
const path = require("path");
const vm = require("vm");
function read(...parts) { return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8"); }
function assert(value, message) { if (!value) throw new Error(message); }

const terrainSource = read("public", "shared", "terrain-rules.js");
const server = read("server.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const terrainClient = read("public", "client-terrain.js");
const index = read("public", "index.html");
const config = read("public", "client-config.js");
const readme = read("README.md");

const sandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
vm.runInNewContext(terrainSource, sandbox, { filename: "terrain-rules.js" });
const rules = sandbox.module.exports;
const testMap = {
  terrain: {
    cellSize: 8,
    defaultType: "void",
    regions: [
      { type: "sand", x: 0, y: 0, width: 32, height: 32 },
      { type: "water", x: 8, y: 8, width: 16, height: 16 }
    ]
  }
};
assert(rules.circleCanOccupy(testMap, 12, 12, 2) === false, "water must remain blocked by default terrain occupancy");
assert(rules.circleCanOccupy(testMap, 12, 12, 2, { allowWater: true }) === true, "entity water traversal option must allow water");
assert(rules.circleCanOccupy(testMap, 40, 40, 2, { allowWater: true }) === false, "water traversal must not allow void");

assert(server.includes('wetSpeedMultiplier: 1.25'), "Crab server Wet speed bonus missing");
assert(server.includes('profile?.canEnterWater !== false'), "enemy water traversal must default open with explicit opt-out");
assert(server.includes('{ allowWater: serverEnemyCanEnterWater(enemy) }'), "enemy movement must use water capability");
assert(server.includes('function refreshServerWaterWetness()'), "server water Wet refresh missing");
assert(server.includes('refreshServerWaterWetness();'), "water Wet refresh not wired into authoritative tick");
assert(server.includes('serverPointTouchesWater(target.mapId, target.x, target.y, 4)'), "player water Wet sampling missing");
assert(server.includes('applyServerEnemyWet(enemy, STATUS_RULES.enemyWetDuration)'), "enemy water Wet application missing");
assert(game.includes('wetSpeedMultiplier: 1.25'), "Crab client profile Wet affinity missing");
assert(game.includes('{ allowWater: true }'), "player authored-terrain collision must allow water");
assert(game.includes('return !hitsSolidObstacle(x, y);'), "player movement must no longer reject water");
assert(app.includes('terrainEntityTouchesWater(player.x, player.y, currentMapId, 4)'), "local player Wet-from-water refresh missing");
assert(app.includes('drawTerrainWadingOverlay('), "wading overlays not wired into sorted entity rendering");
assert(terrainClient.includes('function drawTerrainWadingOverlay('), "wading renderer helper missing");
assert(terrainClient.includes('function terrainEntityTouchesWater('), "water contact helper missing");
assert(server.includes('const BUILD_VERSION = "6-11-367";'), "server build must be v347");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-367";'), "client build must be v347");
assert(index.includes('/client-terrain.js?v=367') && index.includes('/client-app.js?v=367') && index.includes('/game.js?v=367'), "v347 client cache keys missing");
assert(readme.includes('## v6-11-347 — Water traversal + Crab Wet affinity'), "README v347 changelog missing");

console.log("Water traversal + Crab Wet affinity regression checks passed.");
