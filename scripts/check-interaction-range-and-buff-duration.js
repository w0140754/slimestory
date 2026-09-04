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
  [server.includes('function playerNearAuthorizedCraftingTable(playerState)') && server.includes('playerNearPlacedInteraction(playerState, "craftingTable", 40, 12)') && server.includes('const validBench =\n    playerNearAuthorizedCraftingTable(playerState);'), "editor crafting-table server authorization"],
  [server.includes('playerNearPlacedInteraction(playerState, "shopkeeper", 48, 16)'), "editor shopkeeper server authorization"],
  [game.includes('const bubbleWidth = 18;') && game.includes('const bubbleHeight = 18;') && game.includes('rgba(248, 244, 221, 0.78)') && game.includes('drawIcon(left + 1, anchorY + 1);'), "compact translucent native-icon bubbles"],
  [html.includes('/game.js?v=372') && html.includes('/client-config.js?v=372'), "326 cache keys"]
];
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Interaction/buff regression: ${label}`);
}
console.log("Interaction range, potion duration, and bubble tuning checks passed.");
