"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.428");
assert(server.includes('const BUILD_VERSION = "6-11-428";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-428";'));
assert(html.includes('?v=428'));

const start = html.indexOf('/* v428 — mobile inventory layout rebuild.');
assert(start >= 0, "v428 mobile layout block missing");
const css = html.slice(start, html.indexOf('</style>', start));

// iOS must not render the retired assignment rail or duplicate desktop MENU button.
assert(css.includes('#menuHudButton { display: none !important; }'));
assert(css.includes('#inventoryOverlay > #menuItemHotkeyRail'));
assert(css.includes('visibility: hidden !important;'));

// Mobile must use a concrete panel container rather than Safari-sensitive display:contents.
assert(css.includes('#inventoryPanel {'));
assert(css.includes('display: grid !important;'));
assert(css.includes('grid-template-rows: 54px minmax(0, 1fr) !important;'));
assert(css.includes('left: max(138px, calc(env(safe-area-inset-left) + 138px)) !important;'));
assert(css.includes('right: max(74px, calc(env(safe-area-inset-right) + 74px)) !important;'));
assert(css.includes('bottom: max(40px, calc(env(safe-area-inset-bottom) + 40px)) !important;'));
assert(css.includes('body:has(#craftOverlay.open) #inventoryPanel'));
assert(css.includes('left: max(198px, calc(env(safe-area-inset-left) + 198px)) !important;'));

// Equipment is a compact horizontal strip above the scrollable inventory grid.
assert(css.includes('#equipmentPage .equipped-column {'));
assert(css.includes('grid-template-columns: repeat(4, minmax(56px, 72px)) !important;'));
assert(css.includes('#inventoryPage {'));
assert(css.includes('grid-row: 2 !important;'));
assert(css.includes('grid-template-columns: repeat(auto-fill, minmax(54px, 1fr)) !important;'));
assert(css.includes('overflow-y: auto !important;'));

// Ten-slot live HUD is compact enough to remain a usable mobile assignment target.
assert(css.includes('transform: translateX(-50%) scale(.66) !important;'));
assert(css.includes('#hotbar { gap: 5px !important; }'));

console.log("v428 mobile inventory layout static check passed: no duplicate/legacy rails, concrete Safari-safe panel, horizontal equipment, scrollable inventory, stable Craft shift, compact 1–0 HUD.");
