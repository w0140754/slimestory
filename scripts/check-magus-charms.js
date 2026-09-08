"use strict";
const fs = require("fs");

const game = fs.readFileSync("public/game.js", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");
const combat = fs.readFileSync("public/shared/combat-balance.js", "utf8");
const network = fs.readFileSync("public/client-network.js", "utf8");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

const checks = [
  [game.includes('const CHARM_ITEM_IDS = [') && game.includes('"charm_woodRing"') && game.includes('player.charmIndex = recipe.equipIndex;'), "charm item plumbing"],
  [html.includes('data-equipment-slot="charm"') && html.includes('id="equippedCharmImg"') && html.includes('data-owned-item="charm_woodRing"') && !html.includes('gearCharmPanel'), "live charm equipment dock without retired chooser panel"],
  [combat.includes('charms: Object.freeze([1])') && combat.includes('armorSlotValue(values.charms, charmIndex)'), "charm armor values"],
  [network.includes('charmIndex: player.charmIndex') && server.includes('charmIndex: clampInteger(source.charmIndex, -1, 0, -1)'), "charm network sync"],
  [enemies.includes('coin_loot_v2.png') && enemies.includes('healing_potion_v2.png'), "loot and potion art wired"],
  [!game.includes('Spellshred') && !html.includes('data-skill-node='), "retired learned-skill UI is absent"]
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Charm regression: ${label}`);
}

console.log("Charm slot/equipment regression checks passed without legacy skill UI.");
