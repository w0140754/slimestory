"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const network = read("public", "client-network.js");
const app = read("public", "client-app.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.431");
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-431";'));
assert(html.includes('/game.js?v=431'));

// Unified assignment belt is now the complete number row 1-0.
assert(game.includes("const HOTBAR_SLOT_COUNT = 10;"));
assert(game.includes('return slotIndex === 9 ? "0" : String(slotIndex + 1);'));
assert(input.includes('"9": 8'));
assert(input.includes('"0": 9'));
assert(html.includes('id="slot10"'));
assert(html.includes('<div class="hotbar-label">0</div>'));
assert.strictEqual((html.match(/class="utility-count hotbar-count"/g) || []).length, 10,
  "all ten HUD slots must expose tiny live inventory-count badges");
assert(game.includes("function updateHotbarInventoryCountBadges()"));
assert(game.includes("String(hotbarItemInventoryCount(itemId))"));
assert(game.includes("updateHotbarInventoryCountBadges();"));

// Menu is fixed at the upper-left; Craft moves underneath it, with Chest as a
// context sibling instead of shifting the inventory/menu overlay around.
assert(html.includes('#menuHudButton { left: 10px; top: 10px; }'));
assert(html.includes('#craftHudButton { left: 10px; top: 48px; }'));
assert(html.includes('#chestHudButton { left: 76px; top: 48px; }'));
assert(html.includes('id="chestHudButton"'));
assert(html.includes('id="chestPanel" hidden'));
assert(html.includes('id="chestGrid"'));
assert(html.includes("Drag stacks both ways."));

// Chests are no longer part of the F-key interaction list. Proximity drives a
// short-range context transition and Chest/Craft share one panel position.
const spawnStart = game.indexOf("function nearbySpawnInteraction(");
const spawnEnd = game.indexOf("function interactWithNearbyObject(", spawnStart);
assert(spawnStart >= 0 && spawnEnd > spawnStart);
const spawnInteraction = game.slice(spawnStart, spawnEnd);
assert(!spawnInteraction.includes('kind === "chest"'), "F interaction must not target structure chests");
assert(!game.includes("F OPEN"));
assert(!game.includes("F CLOSE"));
assert(game.includes("function nearbyChestContextTarget()"));
assert(game.includes("if (distance <= 22 && distance < nearestDistance)"));
assert(game.includes("function updateNearbyChestContext()"));
assert(app.includes('if (typeof updateNearbyChestContext === "function")'));
assert(game.includes("syncContextOverlayVisibility()"));
assert(game.includes("for (const panel of [craftPanel, chestPanel])"));
assert(game.includes("panel.style.left = `${left}px`;"));
assert(game.includes("panel.style.top = `${top}px`;"));
assert(game.includes("if (nextOpen && chestContextOpen) closeChestContext(true, \"craft\");"));
assert(game.includes("setInventoryOpen(true);"), "successful chest open should expose inventory as the drag destination");

// Dragging a chest stack into Inventory requests an authoritative whole-stack
// transfer rather than mutating client inventory directly.
assert(game.includes('event.dataTransfer.setData("application/x-slime-chest-item",token)'));
assert(game.includes('event.dataTransfer.getData("application/x-slime-chest-item")'));
assert(game.includes("function requestChestTakeToken(token)"));
assert(game.includes("onlineClient?.requestChestTakeItem(activeChestContextId, token)"));
assert(network.includes("requestChestContextOpen(chestId)"));
assert(network.includes('type: "chestContextOpen"'));
assert(network.includes("requestChestContextClose(chestId)"));
assert(network.includes('type: "chestContextClose"'));
assert(network.includes("requestChestTakeItem(chestId, token)"));
assert(network.includes('type: "chestTakeItem"'));
assert(network.includes('message.type === "chestContextResult"'));
assert(network.includes('message.type === "chestContextClosed"'));
assert(network.includes('message.type === "chestTakeResult"'));

// Server authority: one 22px-range owner per chest, open sprite tied to that
// lock, exact old deterministic treasure formula retained as visible stacks.
assert(server.includes("const CHEST_CONTEXT_RANGE = 22;"));
assert(server.includes("const chestContextLocks = new Map();"));
assert(server.includes("const chestContextByPlayer = new Map();"));
assert(server.includes("const chestInventoryById = new Map();"));
assert(server.includes("function playerNearChest(playerState, chest)"));
assert(server.includes("function handleChestContextOpen(playerId, socket, message)"));
assert(server.includes('reason: "busy"'));
assert(server.includes("chestContextLocks.set(chestId, { playerId, mapId: chest.mapId });"));
assert(server.includes("updateChestStructureState(chest, { opened: true });"));
assert(server.includes("updateChestStructureState(chest, { opened: false });"));
assert(server.includes("function handleChestTakeItem(playerId, socket, message)"));
assert(server.includes('reason: "notOwner"'));
assert(server.includes("inventory.splice(index, 1);"));
assert(server.includes('token: "resource:coins", count: 12 + (hash % 14)'));
assert(server.includes('token: "resource:stone", count: 1 + ((hash >>> 8) % 3)'));
assert(server.includes("const wood = ((hash >>> 16) % 100) < 45 ? 1 + ((hash >>> 24) % 2) : 0;"));
assert(server.includes('structure.kind === "chest" && chestLockOwner(structure.id)'));
assert(server.includes('reason = "inUse"'));
assert(server.includes('reason = "lootFirst"'));
assert(server.includes('case "chestContextOpen":'));
assert(server.includes('case "chestContextClose":'));
assert(server.includes('case "chestTakeItem":'));
assert(server.includes('releaseChestContextForPlayer(target.id, "death", true)'));
assert(server.includes('releaseChestContextForPlayer(id, "disconnect", false)'));

console.log("v424 chest context + 1-0 hotbar regression passed: live counts, fixed context HUD, proximity chest UI, drag loot, exclusive server locks, and open-sprite lifecycle are wired.");
