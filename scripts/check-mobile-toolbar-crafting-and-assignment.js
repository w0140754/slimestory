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

assert(server.includes('const BUILD_VERSION = "6-11-430";'), "server build must be v377");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-430";'), "client build must be v377");
assert.strictEqual(pkg.version, "0.6.11.430", "package version must be v377");
assert(html.includes('/game.js?v=430') && html.includes('/client-input.js?v=430'), "v377 cache keys missing");

assert(html.includes('translateX(-50%) scale(.84)'), "mobile top weapon/tool hotbar was not enlarged");
assert(html.includes('width: min(188px, 43vw)') && html.includes('#craftGrid {\n      flex: 1 1 auto;'), "compact mobile crafting rail missing");
assert(html.includes('id="menuItemHotkeyRail"') && html.includes('Weapons &amp; Tools'), "unified weapon/tool assignment rail missing");
assert(html.includes('data-menu-hotbar-slot="8"'), "ninth weapon/tool assignment slot missing");
assert(html.includes('id="menuUtilityHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"'), "retired consumable hotkey rail must stay hidden");
assert(/#statsPage,[\s\S]*?#pvpPage,[\s\S]*?#skillsPage,[\s\S]*?#talentsPage,[\s\S]*?display:\s*none !important;/.test(html), "retired stats/pvp/class/talent pages must remain hidden from the rebuilt menu");

assert(game.includes('function assignItemToHotbar(itemId, slotIndex)'), "weapon/tool hotbar assignment function missing");
assert(game.includes('player.hotbarAssignments[slotIndex] =\n    itemId;'), "weapon/tool assignment mutation missing");
assert(game.includes('function clearItemFromHotbar(itemId)'), "weapon/tool hotbar clear function missing");
assert(game.includes('const HOTBAR_SLOT_COUNT = 10') || game.includes('HOTBAR_SLOT_COUNT = 10'), "unified hotbar must have ten slots");
assert(html.includes('id="craftHudButton"') && game.includes('setCraftingOpen(!craftingOpen)'), "top-level Craft toggle missing");

console.log("mobile toolbar, crafting, and unified 1-0 weapon/tool assignment checks passed");
