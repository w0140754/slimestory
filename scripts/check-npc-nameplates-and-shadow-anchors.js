"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const server = read("server.js");
const html = read("public", "index.html");
const game = read("public", "game.js");
const maps = JSON.parse(read("content", "adopted-map-overrides.json"));

assert(server.includes('const BUILD_VERSION = "6-11-373";'));
assert.ok(maps.version >= 68, "live authored map revision must remain intact");

assert(html.includes("background: rgba(18, 18, 18, .34);"));
assert(html.includes("padding: 1px 3px 2px;"));
assert(html.includes("border-radius: 1px;"));
assert(!/\.npc-name-label\s*\{[^}]*border:\s*1px/.test(html));

assert(game.includes('["beachGirl", "greenWitch", "camoGuy"].includes(type)'));
assert(game.includes('type === "greenWitch"\n    ? 14'));
assert(game.includes('type === "camoGuy"\n      ? 8'));
assert(game.includes("ctx.fillRect(screenX - Math.floor(shadowWidth / 2), shadowY, shadowWidth, 2)"));

console.log("Subtle NPC nameplates and per-sprite shadow anchors OK.");
