"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const input = read("public", "client-input.js");
const game = read("public", "game.js");
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert.strictEqual(pkg.version, "0.6.11.410");
assert(server.includes('const BUILD_VERSION = "6-11-410";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-410";'));
assert.strictEqual(world.version, 410);

assert(html.includes('id="mobileBuildNudgePad"'));
assert(html.includes('data-build-nudge="up"'));
assert(html.includes('data-build-nudge="left"'));
assert(html.includes('data-build-nudge="right"'));
assert(html.includes('data-build-nudge="down"'));
assert(input.includes("let mobileBuildCursorWorldX = null;"));
assert(input.includes("function mobileBuildCursorWorldPoint()"));
assert(input.includes("mobileBuildCursorSuppressMouseUntil"));
assert(input.includes('button.textContent = buildMode ? "PLACE" : "ATK";'));
assert(game.includes('typeof mobileBuildCursorWorldPoint === "function"'));
assert(html.includes('/client-input.js?v=410') && html.includes('/game.js?v=410'));

console.log("v394 mobile build cursor mode retained on v396");
