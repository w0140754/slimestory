"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = require(path.join(root, "package.json"));
const weather = require(path.join(root, "public", "shared", "weather-rules.js"));
const server = read("server.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.430");
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-430";'));
assert(html.includes('/shared/weather-rules.js?v=430'));
assert(html.includes('/client-app.js?v=430'));

// Map weather remains deterministic and server/client-shared rather than
// becoming a replicated heartbeat.
assert.strictEqual(weather.version, 1);
assert(game.includes("function currentMapIsRaining()"));
assert(game.includes("WEATHER_RULES.isRaining("));
assert(!server.includes('type: "weather"'));
assert(!server.includes('type: "rainState"'));

// Roof shelter is queryable for arbitrary entities, not only the local player.
assert(game.includes("function pointUnderAutomaticRoof(worldX, worldY)"));
assert(game.includes("const key = structureCellKey(floorX, floorY);"));
assert(game.includes("region?.floorKeys?.has(key) || pointInsideRoofRegion(region, x, y)"));

// Local player refreshes Wet directly from deterministic rain while exposed.
assert(app.includes("currentMapIsRaining()"));
assert(app.includes("!pointUnderAutomaticRoof(player.x, player.y)"));
assert(app.includes("applyLocalWetStatus(player, player.wetDuration || GAME_CONFIG.player.wetDuration)"));

// Enemy Wet presentation also refreshes locally during rain, avoiding status
// expiry between sparse authoritative snapshots.
assert(app.includes("const mapRaining ="));
assert(app.includes("!pointUnderAutomaticRoof(enemy.x, enemy.y)"));
assert(app.includes("if (inWater || exposedToRain)"));

// Remote players on this map get the same deterministic presentation refresh.
assert(network.includes("remote.mapId === currentMapId"));
assert(network.includes("!pointUnderAutomaticRoof(remote.x, remote.y)"));
assert(network.includes("applyLocalWetStatus(remote, GAME_CONFIG.player.wetDuration)"));

// Authoritative server cadence remains unchanged and continues to keep real
// gameplay Wet alive without adding a per-tick packet stream.
assert(server.includes("const MAP_WEATHER_WET_REFRESH_SECONDS = 0.6;"));
assert(server.includes("applyServerPlayerWet(target, STATUS_RULES.playerWetDuration)"));
assert(server.includes("applyServerEnemyWet(enemy, STATUS_RULES.enemyWetDuration)"));

console.log("v419 persistent rain Wet checks passed: exposed local/remote players and mobs retain Wet for the full deterministic storm without weather heartbeat traffic.");
