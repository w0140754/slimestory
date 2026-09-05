"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const game = read("public/game.js");
const html = read("public/index.html");
const net = read("public/client-network.js");
const world = read("public/client-world.js");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const authored = JSON.parse(read("content/adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.375", "package version must be v374");
assert(server.includes('BUILD_VERSION = "6-11-375"'), "server build marker missing");
assert(read("public/client-config.js").includes('CLIENT_BUILD_VERSION = "6-11-375"'), "client build marker missing");

assert(html.includes('data-craft-filter="consumables"') && html.includes('data-craft-filter="weapons"') && html.includes('data-craft-filter="armor"'), "crafting category buttons missing");
assert(html.includes('.craft-recipe[hidden]') && html.includes('display: none !important'), "crafting hidden-category CSS guard missing");
assert(html.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'), "crafting grid must be three recipes wide");
assert(game.includes('let craftCategoryFilter = "consumables"'), "crafting must default to Consumables");
assert(game.includes('button.style.display = categoryVisible ? "" : "none"'), "crafting category toggle must explicitly change recipe display");
assert(game.includes('craftCategoryFilter = button.dataset.craftFilter || "consumables"'), "crafting tab click routing missing");

for (const [id, name, price] of [
  ["hat_arcanist", "Arcanist Hat", 25],
  ["shirt_arcanist", "Arcanist Robe", 40],
  ["pants_arcanist", "Arcanist Skirt", 30]
]) {
  assert(game.includes(`{ id: "${id}", name: "${name}", vendor: "myrtle", price: ${price} }`), `Myrtle client stock missing ${name}`);
  assert(server.includes(`${id}: Object.freeze({ price: ${price}, level: 10 })`), `Myrtle server stock missing ${name}`);
}
assert(!/reason:\s*"alreadyOwned"/.test(server), "server still rejects repeat shop purchases as already owned");
assert(net.includes('grantInventoryItem(itemId, 1);'), "online shop success must add another item copy");
assert(game.includes('meta.textContent = `${shopItemMetadata(item)} · Owned ${ownedCount}`'), "shop should expose owned quantity");

for (const recipeId of ["woodSword", "woodBow", "shepherdStaff", "woodHelm", "woodChest", "woodGreaves", "woodRing"]) {
  const clientStart = game.indexOf(`${recipeId}: Object.freeze({`);
  const serverStart = server.indexOf(`${recipeId}: Object.freeze({`);
  assert(clientStart >= 0 && game.slice(clientStart, clientStart + 500).includes("repeatable: true"), `${recipeId} client recipe is not repeatable`);
  assert(serverStart >= 0 && server.slice(serverStart, serverStart + 300).includes("repeatable: true"), `${recipeId} server recipe is not repeatable`);
}
assert(game.includes('player.items[itemId] =\n    inventoryItemCount(itemId) + amount;'), "inventory grants must increment quantity");
assert(game.includes('if (count > 0) output[itemId] = count;'), "saved equipment quantities are still being collapsed to unique ownership");
assert(html.includes('class="inventory-stack-count"') || game.includes('stackCount.className = "inventory-stack-count"'), "inventory stack count UI missing");

assert(game.includes('const CLASS_SELECTION_LEVEL = 10;'), "class selection is not locked to level 10");
assert(game.includes('const SELECTABLE_CLASS_IDS = new Set(["arcana", "precision"]);'), "only Magus/Ranger should currently be selectable");
assert(game.includes('CLASSES UNLOCK AT LV ${CLASS_SELECTION_LEVEL}') && game.includes('COMING SOON'), "class selection feedback missing");
assert(html.includes('Classes unlock at Level 10') && html.includes('Bruiser and Rogue are coming soon'), "class selection UI copy missing");

assert(game.includes('flowerHarvesting: {') && game.includes('function awardFlowerHarvestingExp(amount)'), "flower harvesting progression missing");
assert(html.includes('id="flowerHarvestingLevelText"') && html.includes('id="flowerHarvestingFill"'), "flower harvesting talent UI missing");
assert(net.includes('"flowerHarvestingExp"') && net.includes('awardFlowerHarvestingExp'), "network flower harvesting reward handling missing");
assert(world.includes('awardFlowerHarvestingExp(1);'), "offline flower harvesting reward missing");
assert(server.includes('reward: "flowerHarvestingExp"') && server.includes('action === "cutFlower"'), "server flower harvesting reward missing");
assert.strictEqual(authored.version, 88, "map-editor authored world data must match the newest live editor-authored revision preserved for v374");

console.log("v374 progression/inventory/shop regression checks passed.");
