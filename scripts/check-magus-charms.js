const fs = require("fs");

const game = fs.readFileSync("public/game.js", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");
const combat = fs.readFileSync("public/shared/combat-balance.js", "utf8");
const network = fs.readFileSync("public/client-network.js", "utf8");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

const checks = [
  [game.includes('name: "Spellshred"') && game.includes('name: "Ignite"') && game.includes('name: "Rainbloom"') && game.includes('name: "Mirage"'), "magus skill renames"],
  [html.includes('Spellshred, Mirage, Ignite, and Rainbloom.') && html.includes('data-skill-node="wandMastery"') && html.includes('Wood Ring'), "skill and UI copy"],
  [game.includes('const CHARM_ITEM_IDS = [') && game.includes('"charm_woodRing"') && game.includes('player.charmIndex = recipe.equipIndex;'), "charm item plumbing"],
  [html.includes('data-gear-panel="gearCharmPanel"') && html.includes('id="equippedCharmImg"') && html.includes('data-charm-index="0"'), "charm equipment UI"],
  [combat.includes('charms: Object.freeze([1])') && combat.includes('armorSlotValue(values.charms, charmIndex)'), "charm armor values"],
  [network.includes('charmIndex: player.charmIndex') && server.includes('charmIndex: clampInteger(source.charmIndex, -1, 0, -1)'), "charm network sync"],
  [enemies.includes('coin_loot_v2.png') && enemies.includes('healing_potion_v2.png'), "new loot and potion art wired"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Magus/charms regression: ${label}`);
}

console.log("Magus renames / charm slot regression checks passed.");
