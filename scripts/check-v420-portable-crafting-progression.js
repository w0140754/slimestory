"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const app = read("public", "client-app.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.427");
assert(server.includes('const BUILD_VERSION = "6-11-427";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-427";'));

const spawn = world.maps?.world_p0_p0;
assert(spawn, "coordinate spawn missing");
assert(!(spawn.npcs || []).some(npc => npc?.type === "shopkeeper"), "starter Marnie NPC must be removed");
assert(!(spawn.npcs || []).some(npc => npc?.type === "craftingTable"), "static spawn crafting table must be removed");

assert(game.includes('weapon_sword: 1') && game.includes('weapon_pickaxe: 1') && game.includes('weapon_axe: 1'), "starter Sword/Pickaxe/Axe quantities missing");
assert(game.includes('"weapon_sword", "weapon_pickaxe", "weapon_axe", null'), "starter hotbar slots 1-3 must be Sword/Pickaxe/Axe");
assert(game.includes('weaponIndex: 0'), "new player should begin with Wood Sword selected");

assert(html.includes('id="craftOverlay"') && html.includes('data-craft-recipe="craftingTable"'), "portable Craft menu/table recipe UI missing");
assert(html.includes('data-craft-recipe="craftingTable"'), "Wood Crafting Table recipe UI missing");
assert(html.includes('data-resource-key="craftingTables"') && html.includes('data-build-item="craftingTable"'), "portable Crafting Table inventory/build item missing");

assert(game.includes('craftingTable: Object.freeze({') && game.includes('station: "hand"') && game.includes('ingredients: Object.freeze({ wood: 10 })'), "client hand-crafted 10 Wood table recipe missing");
assert(server.includes('craftingTable: Object.freeze({ repeatable: true, resourceKey: "craftingTables", outputCount: 1, station: "hand", ingredients: Object.freeze({ wood: 10 }) })'), "server hand-crafted 10 Wood table recipe missing");
assert(server.includes('const validBench = recipe.station === "hand" || playerNearAuthorizedCraftingTable(playerState);'), "server must gate advanced recipes by portable table proximity");
assert(server.includes('structure?.kind === "craftingTable"') && server.includes('<= 40'), "server portable table range check missing");
assert(game.includes('function playerNearCraftingTable(range = 40)') && game.includes('function craftRecipeCurrentlyAvailable(recipe)'), "client recipe proximity/material filtering missing");
assert(game.includes('button.hidden = !visible;') && game.includes('button.style.display = visible ? "" : "none";'), "unavailable recipes must disappear from crafting list");
assert(game.includes('!recipe.testSupply') && game.includes('craftRecipeHasIngredients(recipe)'), "craft list must hide test supply and require carried ingredients");
assert(app.includes('craftingOpen && typeof updateCraftingUi === "function"') && app.includes('updateCraftingUi();'), "open craft list must refresh as the player enters/leaves table range");

assert(game.includes('function drawCraftingTableStructure('), "portable table renderer missing");
assert(game.includes('selectedBuildPiece === "craftingTable"'), "portable table placement path missing");
assert(game.includes('["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"]'), "portable table must join build/reclaim inventory kinds");
assert(server.includes('message?.kind === "craftingTable" ? "craftingTable" : null'), "server table placement kind missing");
assert(server.includes('} else if (resource.kind === "craftingTable") {') && server.includes('playerState.craftingTables += 1;'), "table reclaim pickup restoration missing");
assert(enemies.includes('craftingTable: Object.freeze({') && enemies.includes('craftingTableLootImage'), "table ground-loot visual missing");
assert(network.includes('message.totalCraftingTables') && network.includes('player.craftingTables'), "authoritative table count sync missing");

assert(!server.includes('MAX_STRUCTURES_PER_MAP'), "removed object cap must stay removed");

console.log("v420 portable crafting progression static check passed: self-starting tools, material-filtered Craft menu, portable workstation proximity recipes, and Pickaxe reclaim are wired.");
