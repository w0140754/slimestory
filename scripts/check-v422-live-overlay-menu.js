"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public", "index.html");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const combat = read("public", "client-combat.js");
const network = read("public", "client-network.js");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(html.includes('id="menuHudButton"') && html.includes('id="craftHudButton"'));
assert(html.includes('id="inventoryDetailPanel"'));
assert(html.includes('data-equipment-slot="head"') && html.includes('data-equipment-slot="charm"'));
assert(game.includes('function syncInventoryOverlayToViewport()'));
assert(!game.includes('document.body.classList.toggle("crafting-overlay-open", craftingOpen);'), "Craft must not reposition Inventory");
assert(!/if \(open && inventoryOpen\) \{\s*setInventoryOpen\(false\)/.test(game), "Craft must not close Inventory");
assert(!/if \(open && craftingOpen\) \{\s*setCraftingOpen\(false\)/.test(game), "Inventory must not close Craft");
assert(input.includes('setInventoryOpen(!inventoryOpen);'));
assert(!input.includes('if (craftingOpen) {\n    setCraftingOpen(false);'), "Escape must not commandeer the Craft panel");
assert(app.includes('const modalInputBlocked = shopOpen || beachQuestOpen;'));
assert(!combat.includes('inventoryOpen || shopOpen || craftingOpen'), "primary combat must stay live under Inventory/Craft");
assert(game.includes('topHotbar?.addEventListener("drop"'));
assert(game.includes('function equipInventoryArmorItemToSlot(itemId, slot)'));
assert(game.includes('event.dataTransfer.setData("application/x-slime-inventory-token", token);'), "all draggable inventory cells need a generic future drop payload");
assert(game.includes('element.draggable = element.style.display !== "none" && inventoryOverlayCellCount(element) > 0;'), "all owned inventory cells should be draggable, not only hotbar items");
assert(!network.includes('"ALREADY CRAFTED"'), "legacy already-crafted popup should be removed");
assert(html.includes('?v=431'));

console.log("v422 live overlay menu static check passed: independent Menu/Craft, live gameplay, flat inventory, actual-hotbar drag, equipment drag, and future generic item drag payload are wired.");
