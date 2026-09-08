"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

const checks = [
  [server.includes('const POTION_BUFF_MS = 300000;') && game.includes('const POTION_BUFF_MS = 300000;'), "5-minute buff duration on server/client"],
  [game.includes('Math.min(POTION_BUFF_MS, clampLocalSaveInteger(save.buffs?.attackRemainingMs, 0, POTION_BUFF_MS, 0))') && server.includes('Math.min(POTION_BUFF_MS, clampInteger(buffs.attackRemainingMs, 0, POTION_BUFF_MS, 0))'), "5-minute duration survives save/load"],
  [html.includes('+15% physical damage for 5 min') && html.includes('+15% magic damage for 5 min'), "inventory potion descriptions"],
  [server.includes('function playerNearAuthorizedCraftingTable(playerState)') && server.includes('structure?.kind === "craftingTable"') && server.includes('const validBench = recipe.station === "hand" || playerNearAuthorizedCraftingTable(playerState);'), "portable crafting-table server authorization"],
  [html.includes('/game.js?v=431') && html.includes('/client-config.js?v=431'), "431 cache keys"]
];
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Interaction/buff regression: ${label}`);
}
console.log("Interaction range and potion duration checks passed.");
