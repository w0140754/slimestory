const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("public", "index.html");
const game = read("public", "game.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));

assert(server.includes('const BUILD_VERSION = "6-11-375";'), "server build must be v353");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-375";'), "client build must be v353");
assert.strictEqual(pkg.version, "0.6.11.375", "package version must be v353");
assert(html.includes('/game.js?v=375') && html.includes('/client-input.js?v=375'), "v353 cache keys missing");

assert(html.includes('translateX(-50%) scale(.84)'), "mobile top item/equipment hotbar was not enlarged");
assert(html.includes('height: min(300px, 82dvh)') && html.includes('#craftGrid {\n      flex: 1 1 auto;'), "compact mobile crafting panel missing");
assert(html.includes('#inventoryOverlay .menu-hotkey-rail:not(.context-hidden)'), "mobile assignment docks must remain visible");
assert(html.includes('#menuSkillHotkeyRail {\n      grid-column: 1 / 9 !important;'), "mobile skill dock layout missing");

assert(game.includes('element.classList.toggle("hotbar-selected", itemId === selectedHotbarInventoryItemId);'), "selected utility item feedback missing");
assert(game.includes('menuUtilityHotkeyRail?.addEventListener("click"'), "tap-to-assign item hotkeys missing");
assert(game.includes('selectedHotbarInventoryItemId = utilityItemId;'), "tap-to-select utility item missing");
assert(game.includes('event.target === event.currentTarget) setCraftingOpen(false);'), "craft backdrop dismissal missing");

console.log("mobile toolbar, crafting, and tap assignment checks passed");
