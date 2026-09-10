"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const pkg = JSON.parse(read("package.json"));

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'), "v433 runtime cache token missing");

const retiredCraftHistory = [
  "woodSwordCrafted",
  "woodBowCrafted",
  "shepherdStaffCrafted",
  "woodHelmCrafted",
  "woodChestCrafted",
  "woodGreavesCrafted",
  "woodRingCrafted",
  'reason: "alreadyCrafted"',
  'message.reason === "alreadyCrafted"',
  "recipe.storyKey",
  "recipe.stateKey",
  "!recipe.repeatable"
];
for (const token of retiredCraftHistory) {
  assert(!game.includes(token), `retired client craft-history token survived: ${token}`);
  assert(!network.includes(token), `retired network craft-history token survived: ${token}`);
  assert(!server.includes(token), `retired server craft-history token survived: ${token}`);
}
assert(!game.includes("player.story"), "retired client crafting story state survived");
assert(!server.includes("state.story"), "retired persistent crafting story payload survived");

const clientCraftBlock = game.slice(
  game.indexOf("const CRAFT_RECIPES = Object.freeze({"),
  game.indexOf("const SHOP_ITEMS = [")
);
const serverCraftBlock = server.slice(
  server.indexOf("const CRAFT_RECIPES = Object.freeze({"),
  server.indexOf("function playerNearPlacedInteraction")
);
assert(!clientCraftBlock.includes("repeatable:"), "client craft table still carries universal repeatable metadata");
assert(!serverCraftBlock.includes("repeatable:"), "server craft table still carries universal repeatable metadata");
assert(!clientCraftBlock.includes("storyKey:"), "client craft table still carries retired storyKey metadata");
assert(!serverCraftBlock.includes("stateKey:"), "server craft table still carries retired stateKey metadata");

// Current recipe contracts remain intact: all crafts are repeatable by default
// because no one-time gate exists, while costs/outputs remain unchanged.
assert(server.includes('craftingTable: Object.freeze({ resourceKey: "craftingTables", outputCount: 1, station: "hand", ingredients: Object.freeze({ wood: 10 }) })'));
assert(server.includes('woodSword: Object.freeze({ ingredients: Object.freeze({ wood: 8 }) })'));
assert(server.includes('woodRing: Object.freeze({ ingredients: Object.freeze({ wood: 5 }) })'));
assert(server.includes('arrows: Object.freeze({ resourceKey: "arrows", outputCount: 50, ingredients: Object.freeze({ wood: 5, stone: 1 }) })'));
assert(game.includes('itemId: "weapon_sword"') && game.includes('itemId: "charm_woodRing"'));
assert(network.includes("grantInventoryItem(") && game.includes("function craftRecipeOffline(recipeId)"));

console.log("v433 retired one-time crafting-history purge regression check passed");
