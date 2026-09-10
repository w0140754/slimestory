"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const world = read("public", "client-world.js");
const fire = read("public", "client-fire-environment.js");
const network = read("public", "client-network.js");
const terrain = read("public", "client-terrain.js");
const terrainRules = read("public", "shared", "terrain-rules.js");
const balance = read("public", "shared", "combat-balance.js");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

// The compact Rain Cloud / magic-grass field backend had no creation path after
// v438. v442 removes the dead server tick/registry/protocol and client mirror.
assert(!fs.existsSync(path.join(root, "public", "shared", "rain-field.js")));
assert(!html.includes("shared/rain-field.js"));
const retiredRuntime = [server, game, app, world, fire, network, terrain, terrainRules, balance].join("\n");
for (const token of [
  "RAIN_FIELD",
  "temporaryRainGrass",
  "temporaryRainGrassFields",
  "TEMP_RAIN_GRASS",
  "rainFieldDelta",
  "transientActionSnapshot",
  "startServerRainCloud",
  "activeServerRainClouds",
  "activeServerRainFields",
  "tickServerRainClouds",
  "tickServerRainGrassMembership",
  "spreadServerRainGrassFire",
  "serverRainGrassSlowMultiplierAtPoint",
  "rainEffect",
  "rainRadiusInset",
  "canGrowMagicGrassAt",
  "terrainAllowsMagicGrass"
]) {
  assert(!retiredRuntime.includes(token), `retired Rain Cloud/field token survived: ${token}`);
}
assert(!balance.includes('name: "Rain Cloud"'), "retired Rain Cloud action profile survived");

// The snapshot disappeared completely instead of sending an empty packet on map
// entry, which also removes that small recurring/transition network cost.
assert(!server.includes('type: "transientActionSnapshot"'));
assert(!network.includes('message.type === "transientActionSnapshot"'));

// Live weather/water Wet behavior is independent and must remain.
assert(server.includes("function serverMapRainIntensity("));
assert(server.includes("function refreshServerMapWeatherWetness("));
assert(server.includes("function applyServerPlayerWet("));
assert(server.includes("function tickServerPlayerWetTimers("));
assert(app.includes("playerIsWet()"));
assert(html.includes("/shared/weather-rules.js?v=431e-468"));

// Environmental fire and normal permanent grass remain live.
assert(fire.includes("function igniteGrass("));
assert(fire.includes("function spreadFireFromBurningSources("));
assert(server.includes("function spreadSharedEnvironmentFire("));
assert(server.includes("function igniteEnvironmentNear("));
assert(world.includes("function drawTallGrass("));
assert(world.includes("if (clump.cut) return;"));

// Current basic Wand family remains unrelated to the retired Rain Cloud ability.
assert(game.includes('const WAND_WEAPON_TYPES = Object.freeze(["shepherdStaff", "lostKeyWand", "sunflowerWand", "sapgemWand"]);'));

console.log("v442 retired Rain Cloud/magic-grass backend purge checks passed");
