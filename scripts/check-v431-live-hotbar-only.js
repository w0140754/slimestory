"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert(!html.includes('id="menuItemHotkeyRail"'), "retired Weapons & Tools inventory rail returned");
assert(!html.includes('data-menu-hotbar-slot='), "retired duplicate menu hotbar slots returned");
assert(!game.includes("updateMenuItemHotkeyRail"), "retired duplicate rail renderer returned");
assert(!game.includes("menuItemHotkeyRail"), "retired duplicate rail listeners returned");
assert(html.includes('id="hotbar"') && html.includes('id="slot10"'), "live 1-0 HUD missing");
assert(game.includes('if (inventoryOpen && selectedHotbarInventoryItemId && hotbarItemCanBeAssigned(selectedHotbarInventoryItemId))'), "inventory-to-live-HUD tap assignment path missing");
assert(game.includes('topHotbar?.addEventListener("drop"'), "inventory-to-live-HUD drag/drop assignment path missing");
assert(html.includes('/game.js?v=431e'), "431e cache bust missing");
console.log("v431 live-hotbar-only regression check passed");
