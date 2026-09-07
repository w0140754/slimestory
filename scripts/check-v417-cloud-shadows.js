"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const world = fs.readFileSync(path.join(root, "public", "client-world.js"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "client-app.js"), "utf8");
const clientConfig = fs.readFileSync(path.join(root, "public", "client-config.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

function assert(ok, message) {
  if (!ok) throw new Error(`v417/v418 regression: ${message}`);
}

assert(clientConfig.includes('CLIENT_BUILD_VERSION = "6-11-424"'), "client build version not bumped");
assert(server.includes('BUILD_VERSION = "6-11-424"'), "server build version not bumped");
assert(game.includes("function worldClockSunShadowFactor"), "day/night sunlight shadow factor missing");
assert(game.includes("function drawCloudShadows"), "cloud-shadow renderer missing");
assert(game.includes("function traceIrregularCloudBank"), "irregular cloud-bank renderer missing");
assert(game.includes("banks,"), "multi-bank cloud pass missing");
assert(game.includes("wisps"), "cloud wisps missing");
assert(game.includes("CLOUD_SHADOW_MIN_GAP_SECONDS = 30"), "cloud shadows should remain occasional rather than continuous");
assert(game.includes("cloudShadowDaylightFactor"), "cloud shadows are not tied to daylight");
assert(game.includes('ctx.clip("evenodd")'), "revealed building interiors are not cut out of cloud-shadow pass");
assert(game.includes("activeInteriorRoofRegion"), "cloud shadow interior clipping is not using roof topology");
assert(!game.match(/cloudShadow[\s\S]{0,160}onlineClient/), "cloud-shadow atmosphere should not depend on multiplayer traffic");
assert(world.includes("0.16 * daylightShadowFactor"), "perimeter tree shadow does not fade out at night");
assert(world.includes("shadowAlpha *= daylightShadowFactor"), "ordinary tree shadow does not fade out at night");
const renderCalls = app.match(/drawCloudShadows\(renderCamera\.x, renderCamera\.y\);/g) || [];
assert(renderCalls.length === 2, "cloud shadows must render in both terrain and normal-map branches");
assert(
  app.indexOf("drawAutomaticStructureRoofs(renderCamera.x, renderCamera.y);\n      drawCloudShadows") >= 0,
  "cloud shadows should draw after roofs/world objects"
);
assert(
  app.indexOf("drawCloudShadows(renderCamera.x, renderCamera.y);\n      drawForegroundLayer") >= 0,
  "cloud shadows should draw before foreground text/effects"
);

console.log("v417/v418 passing cloud shadows + night tree-shadow regression checks passed, including irregular cloud banks.");
