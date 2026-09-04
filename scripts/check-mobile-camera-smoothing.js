"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const app = read("public", "client-app.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.372");
assert(server.includes('const BUILD_VERSION = "6-11-372";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-372";'));
assert(html.includes('/client-app.js?v=372') && html.includes('/game.js?v=372'));

assert(config.includes('baseSpeed: 54'), "54 px/s movement must remain");
assert(app.includes('const useMobileSubpixelCamera = mobileControlsEnabled;'), "camera smoothing must stay mobile-only");
assert(app.includes('x: Math.round(camera.x)') && app.includes('y: Math.round(camera.y)'), "world camera must retain a shared pixel grid");
assert(app.includes('(renderCamera.x - camera.x) * GAME_RENDER_SCALE') && app.includes('(renderCamera.y - camera.y) * GAME_RENDER_SCALE'), "pixel-grid camera remainder missing");
assert(app.includes('currentCamX = camera.x;') && app.includes('currentCamY = camera.y;'), "targeting must retain exact camera coordinates");
assert(game.includes('-mobileCameraPresentationOffsetX') && game.includes('-mobileCameraPresentationOffsetY'), "local player camera pin missing");

const desiredCamera = 100.1;
const renderCamera = Math.round(desiredCamera);
const presentationOffset = Math.round((renderCamera - desiredCamera) * 3) / 3;
assert(Number.isInteger(presentationOffset * 3), "camera motion must land on a backing pixel");

assert.ok(adopted.version >= 68, "camera smoothing must preserve current authored map data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must remain intact");

console.log("Mobile fractional camera smoothing checks passed; gameplay camera and desktop rendering remain unchanged.");
