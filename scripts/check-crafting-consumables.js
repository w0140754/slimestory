const fs = require("fs");

const server = fs.readFileSync("server.js", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");

const checks = [
  [server.includes('ingredients: Object.freeze({ wood: 5, stone: 1 })') && server.includes("outputCount: 50"), "arrow recipe"],
  [server.includes('woodRing: Object.freeze({') && server.includes('stateKey: "woodRingCrafted"') && game.includes('itemId: "charm_woodRing"') && game.includes('ingredients: Object.freeze({ wood: 5 })'), "wood ring recipe"],
  [server.includes('ingredients: Object.freeze({ whiteFlowers: 1, blueFlowers: 1 })'), "Healing Potion recipe"],
  [server.includes('ingredients: Object.freeze({ whiteFlowers: 2 })'), "Attack Potion recipe"],
  [server.includes('ingredients: Object.freeze({ blueFlowers: 2 })'), "Magic Potion recipe"],
  [server.includes("HEALING_POTION_COOLDOWN_MS = 15000") && server.includes("BUFF_POTION_COOLDOWN_MS = 1000") && server.includes("POTION_BUFF_MS = 300000"), "potion timing"],
  [server.includes('item === "healingPotion" && playerState.hp >= playerState.maxHp') && server.includes("playerState.hp + 20"), "healing validation"],
  [server.includes("playerState.attackPotionUntil = now + POTION_BUFF_MS") && server.includes("playerState.magicPotionUntil = now + POTION_BUFF_MS"), "buff refresh"],
  [server.includes("? 1.15 : 1"), "damage multiplier"],
  [game.includes('UTILITY_SLOT_ITEMS = Object.freeze(["healingPotion", "attackPotion", "magicPotion"])'), "utility mapping"],
  [!input.includes('key === "1" || key === "2" || key === "3"') && game.includes('useConsumable(utilityItemId);'), "v377 consumables use directly from Inventory"],
  [html.includes('id="slot1"') && html.includes('id="slot9"') && game.includes('const HOTBAR_SLOT_COUNT = 9;'), "v377 unified weapon/tool HUD 1-9"],
  [html.includes('data-craft-recipe="woodRing"') && html.includes('id="craftWoodRingImg"'), "wood ring craft button"],
  [!server.includes("playerState.flowers +=") && !game.includes("player.flowers"), "split flower inventory"]
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Crafting/consumables regression: ${label}`);
}

console.log("Crafting/consumables regression checks passed.");
