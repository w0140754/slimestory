"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public", "index.html");
const game = read("public", "game.js");
const server = read("server.js");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.424");
assert(server.includes('const BUILD_VERSION = "6-11-424";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-424";'));

assert(!html.includes("body.crafting-overlay-open #inventoryOverlay.open"), "Craft state must never shift the Menu overlay");
assert(!game.includes('document.body.classList.toggle("crafting-overlay-open", craftingOpen);'), "Craft state must not mutate Menu layout state");

assert(!html.includes('id="inventoryTop"'), "redundant Inventory title bar should be removed");
assert(!html.includes('id="inventoryTitleBlock"'), "Inventory title block should be removed");
assert(!html.includes('id="inventoryTopHint"'), "header hint strip should be removed with the title bar");
assert(html.includes('<button id="inventoryClose" aria-label="Close inventory">×</button>'), "compact close button should remain");

assert(html.includes('grid-template-columns: minmax(118px, 150px) minmax(520px, 680px) minmax(96px, 118px);'), "desktop workspace should reserve a wide horizontal inventory column");
assert(html.includes('grid-template-columns: repeat(9, minmax(58px, 1fr));'), "desktop inventory should use a wider nine-column grid");
assert(html.includes('grid-auto-rows: 66px;'), "desktop inventory cards should be larger");
assert(html.includes('height: 66px;'), "desktop item cells should be larger");
assert(html.includes('width: 46px;') && html.includes('height: 46px;'), "desktop item icons should be larger");
assert(html.includes('?v=424'));

console.log("v423 inventory layout polish static check passed: fixed Menu position, no title strip, wider inventory grid, and larger cards.");
