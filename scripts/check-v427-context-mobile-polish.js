"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('?v=431'));

// Chest interaction polish: explicit Loot All, double-click take, mobile tap take.
assert(html.includes('id="chestLootAll"'));
assert(game.includes('chestGridElement?.addEventListener("dblclick"'));
assert(game.includes('document.getElementById("chestLootAll")?.addEventListener("click", requestChestTakeAll)'));
assert(network.includes('type: "chestTakeAll"'));
assert(network.includes('message.type === "chestTakeAllResult"'));
assert(server.includes('function handleChestTakeAll(playerId, socket, message)'));
assert(server.includes('case "chestTakeAll":'));
assert(server.includes('inventory.splice(0, inventory.length);'));

// Right-click belongs to the game, never to the browser canvas context menu.
assert(game.includes('canvas?.addEventListener("contextmenu", event => event.preventDefault());'));
assert(html.includes('-webkit-user-select: none;'));

// Crafting result feedback is deliberately quiet now.
assert(network.includes('v427: crafting is deliberately quiet'));
assert(!network.includes('`${recipe.name.toUpperCase()} CRAFTED!`'));
assert(!network.includes('"MISSING INGREDIENTS",\n        "#ffe38b"'));

// Crafting Table preview must use the workstation sprite rather than generic floor art.
const previewStart = game.indexOf('function drawBuildPlacementPreview');
const previewEnd = game.indexOf('// -----------------------------------------------------------------------------\n// RUNTIME HELPERS', previewStart);
const preview = game.slice(previewStart, previewEnd);
assert(preview.includes('selectedBuildPiece === "craftingTable"'));
assert(preview.includes('drawCraftingTableStructure('));
assert(preview.indexOf('selectedBuildPiece === "craftingTable"') < preview.indexOf('drawStructureFloor('));

// Mobile gets an intentionally separate, touch-usable layout plus tap assignment/storage fallbacks.
assert(html.includes('v427 — mobile inventory/context repair'));
assert(html.includes('body:has(#craftOverlay.open) #inventoryOverlay'));
assert(html.includes('grid-template-columns: repeat(auto-fill, minmax(54px, 1fr)) !important;'));
assert(html.includes('id="chestStoreSelected"'));
assert(game.includes('requestStoreSelectedInventoryStackInChest'));
assert(game.includes('if (inventoryOpen && selectedHotbarInventoryItemId && hotbarItemCanBeAssigned(selectedHotbarInventoryItemId))'));

console.log("v427 context/mobile static check passed: Loot All, double-click/tap chest take, canvas context suppression, silent crafting, correct table preview, and mobile inventory fallbacks.");
