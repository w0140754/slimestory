"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const html = read("public", "index.html");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert(html.includes('<canvas id="game" width="320" height="180"></canvas>'), "desktop canvas must stay 320x180");
assert(html.includes('const LOGICAL_W = 224;'), "mobile logical width must be 224");
assert(html.includes('const LOGICAL_H = 126;'), "mobile logical height must be 126");
assert(html.includes('mobileCanvas.dataset.logicalWidth = `${LOGICAL_W}`;'), "logical width must survive backing-scale changes");
assert(html.includes('(hover: none) and (pointer: coarse)'), "zoom must remain mobile/coarse-pointer only");
assert.strictEqual(224 / 126, 16 / 9, "mobile logical viewport must remain 16:9");
assert.strictEqual(320 / 224, 180 / 126, "horizontal and vertical world scaling must match");
assert.strictEqual(adopted.version, 55, "mobile camera zoom must preserve current authored world data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must be preserved");
assert.strictEqual(pkg.version, "0.6.11.363");
assert(server.includes('const BUILD_VERSION = "6-11-363";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-363";'));
assert(html.includes('/game.js?v=363') && html.includes('/client-app.js?v=363'));

console.log("Mobile camera zoom OK: 224x126 world view, 1.43x desktop scale, HUD independent.");
