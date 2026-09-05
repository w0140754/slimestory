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

assert.strictEqual(pkg.version, "0.6.11.380", "package version must be v374");
assert(server.includes('BUILD_VERSION = "6-11-380"'), "server build marker missing");
assert(read("public/client-config.js").includes('CLIENT_BUILD_VERSION = "6-11-380"'), "client build marker missing");

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

// v374's class/talent feature assertions are intentionally inverted in v377:
// the inventory/shop/stacking work remains, while class selection and gathering
// talent progression are retired from active gameplay.
assert(game.includes('function equipmentRequiredClass(itemId)') && game.includes('v377 pivot: classes are retired'), "class restriction retirement marker missing");
assert(html.includes('retired-system" data-page="skillsPage"') && html.includes('retired-system" data-page="talentsPage"'), "class/talent tabs should be retired from player UI");
assert(game.includes('function awardFlowerHarvestingExp(amount)') && game.includes('v377: gathering talents are retired'), "flower harvesting compatibility no-op missing");
assert(!server.includes('reward: "flowerHarvestingExp"'), "server must not award retired flower-harvesting talent EXP");
assert(authored.version >= 88, "map-editor authored world data must preserve at least the v88 baseline or newer user-authored revisions");

console.log("v374 inventory/shop stacking retained; v377 class/talent retirement checks passed.");
