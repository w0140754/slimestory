"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const html = read("public", "index.html");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.368");
assert(server.includes('const BUILD_VERSION = "6-11-368";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-368";'));
assert(html.includes('/game.js?v=368') && html.includes('/client-app.js?v=368'));

assert(config.includes('baseSpeed: 54'), "shared speed must be 54 px/s");
assert(html.includes('left: 2px;'), "MENU must hug the upper-left game edge");
assert(html.includes('right: 3px !important;'), "skills must hug the upper-right game edge with breathing room");
assert(html.includes('top: 4px !important;'), "skills must be upper aligned");
assert(html.includes('#bottomUi .hotbar-label,\n    #abilityBar .hotbar-label'), "mobile hotbar key labels must be hidden");
assert(html.includes('body:has(#inventoryOverlay.open) #onlineStatus'), "status must return while menus are open");
assert(/#onlineStatus\s*\{[\s\S]*?display:\s*none;[\s\S]*?bottom:\s*max\(3px, env\(safe-area-inset-bottom\)\)/.test(html), "mobile gameplay status must be hidden and menu status bottom-left");

assert(game.includes('name: "50 Arrows"') && game.includes('outputCount: 50'), "client arrow output must be 50");
assert(server.includes('resourceKey: "arrows",\n    outputCount: 50'), "server arrow output must be 50");
assert(html.includes('<span class="craft-recipe-name">Arrows ×50</span>'), "arrow recipe label must show 50");
assert.strictEqual(adopted.version, 68, "HUD cleanup must preserve current authored map data");

console.log("Mobile HUD cleanup, 25% speed reduction, and 50-arrow crafting checks passed.");
