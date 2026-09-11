"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

// v438 deleted client-wand-actions.js. Map changes must not call functions that
// died with that module; this was the startup/map-transition crash reported in
// the field immediately after the v438 purge.
assert(!game.includes("cancelRainCloudCast("), "dangling cancelRainCloudCast call survived");
assert(!game.includes("endLocalRainCloud("), "dangling endLocalRainCloud call survived");

// The surviving map-transition cleanup still clears current transient systems.
const start = game.indexOf("function clearTransientWorldEffects() {");
assert(start >= 0, "clearTransientWorldEffects missing");
const end = game.indexOf("\n}\n", start);
assert(end > start, "clearTransientWorldEffects body could not be isolated");
const body = game.slice(start, end);
for (const token of [
  "fireParticles.length = 0",
  "basicProjectiles.length = 0",
  "coins.length = 0",
  "damageNumbers.length = 0"
]) {
  assert(body.includes(token), `current transient cleanup missing: ${token}`);
}

assert(!body.includes("clearTemporaryRainGrass"), "later-retired Rain Field cleanup must stay absent");

console.log("v439 map-transition cleanup OK: no calls remain into the deleted Wand action module, and current transient cleanup is preserved after the later Rain Field retirement.");
