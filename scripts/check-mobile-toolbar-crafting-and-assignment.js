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

assert(server.includes('const BUILD_VERSION = "6-11-468";'), "server build must be v377");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'), "client build must be v377");
assert.strictEqual(pkg.version, "0.6.11.468", "package version must be v377");
assert(html.includes('/game.js?v=431e') && html.includes('/client-input.js?v=431e'), "v431e cache keys missing");

assert(html.includes('translateX(-50%) scale(.84)'), "mobile top weapon/tool hotbar was not enlarged");
assert(html.includes('width: min(188px, 43vw)') && html.includes('#craftGrid {\n      flex: 1 1 auto;'), "compact mobile crafting rail missing");
assert(!html.includes('id="menuItemHotkeyRail"') && !html.includes('data-menu-hotbar-slot='), "retired duplicate inventory weapon/tool rail must be removed");
assert(!html.includes('id="menuUtilityHotkeyRail"') && !html.includes('id="menuSkillHotkeyRail"'), "retired auxiliary hotkey rails must be removed");
assert(html.includes('id="slot9"') && html.includes('id="slot10"'), "live 1–0 HUD assignment targets missing");
assert(!html.includes('id="statsPage"') && !html.includes('id="pvpPage"') && !html.includes('id="skillsPage"') && !html.includes('id="talentsPage"'), "retired stats/pvp/class/talent pages must be removed");

assert(game.includes('function assignItemToHotbar(itemId, slotIndex)'), "weapon/tool hotbar assignment function missing");
assert(game.includes('player.hotbarAssignments[slotIndex] =\n    itemId;'), "weapon/tool assignment mutation missing");
assert(game.includes('function clearItemFromHotbar(itemId)'), "weapon/tool hotbar clear function missing");
assert(game.includes('const HOTBAR_SLOT_COUNT = 10') || game.includes('HOTBAR_SLOT_COUNT = 10'), "unified hotbar must have ten slots");
assert(html.includes('id="craftHudButton"') && game.includes('setCraftingOpen(!craftingOpen)'), "top-level Craft toggle missing");

console.log("mobile toolbar, crafting, and unified 1-0 weapon/tool assignment checks passed");
