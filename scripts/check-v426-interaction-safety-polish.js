"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const enemies = read("public", "client-enemies.js");
const worldContent = read("public", "shared", "world-content.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('?v=431'));

// Drop quantity selection + compact crisp world count.
assert(html.includes('id="dropQuantityOverlay"'));
assert(html.includes('id="dropQuantityInput"'));
assert(html.includes('id="dropQuantityMax"'));
assert(game.includes("function openInventoryDropQuantityPicker(token, maxCount, worldX, worldY, clientX, clientY)"));
assert(game.includes('input.value = "1"'));
assert(game.includes("requestInventoryDrop(token, amount, worldX, worldY)"));
assert(enemies.includes("const DROP_DIGIT_PIXELS"));
assert(enemies.includes("function drawDroppedItemPixelCount"));
assert(!enemies.includes('ctx.font = "bold 7px monospace"'), "large blurry canvas count renderer should be retired");

// Any chest with contents, including a player-built chest, is protected from reclaim.
assert(server.includes('else if (structure.kind === "chest" && chestHasLoot(structure)) reason = "lootFirst";'));
assert(!server.includes('structure.kind === "chest" && structure.treasure && chestHasLoot(structure)'), "loot protection must not be treasure-only");

// Spawn/entry discontinuities shift away from solid structure occupancy.
assert(server.includes("function resolveSafePlayerSpawn(mapId, x, y)"));
assert(server.includes("function playerSpawnPointBlocked(mapId, x, y, radius = 4)"));
assert(server.includes("const safe = resolveSafePlayerSpawn(target.mapId, rawX, rawY);"));
assert(server.includes("const safe = resolveSafePlayerSpawn(mapId, sanitizedX, sanitizedY);"));

// Wet remains a debuff but is less severe than v425's 25% movement loss.
assert(config.includes("wetSpeedMultiplier: 0.85"));

// Generated meadow features are square/tile-like instead of radial/elliptical.
assert(worldContent.includes("const cells = [-24, -8, 8, 24];"));
assert(worldContent.includes("const centerX = Math.round(reservation.x / 16) * 16;"));
assert(!worldContent.includes("const grassSpokes = 15;"));

// Armor gets quick equip, while the actual HUD hotbar becomes draggable only with Menu open.
assert(game.includes('inventoryPageElement?.addEventListener("contextmenu"'));
assert(game.includes('inventoryPageElement?.addEventListener("dblclick"'));
assert(game.includes("quickEquipArmorFromInventoryCell"));
assert(game.includes("slot.draggable = Boolean(inventoryOpen && assigned && available);"));
assert(game.includes('topHotbar?.addEventListener("dragstart"'));
assert(game.includes('event.dataTransfer.setData("application/x-slime-hotbar-source", String(slotIndex));'));
assert(game.includes("Moving an already-assigned item onto an occupied slot swaps the two."));

// Repeatable Crafting Tables remain explicitly repeatable on both sides.
assert(game.includes('craftingTable: Object.freeze({'));
assert(game.includes('resourceKey: "craftingTables"'));
assert(server.includes('craftingTable: Object.freeze({ resourceKey: "craftingTables"'));

console.log("v426 interaction/safety static check passed: quantity picker, crisp counts, safe spawn, universal chest protection, gentler Wet, square meadows, quick armor equip, and live HUD hotbar swapping.");
