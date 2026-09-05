const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const app = fs.readFileSync("public/client-app.js", "utf8");
const network = fs.readFileSync("public/client-network.js", "utf8");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

const checks = [
  [html.includes('id="hudBuffs"') && html.includes('id="attackBuffHud"') && html.includes('id="magicBuffHud"'), "buff status HUD markup"],
  [html.indexOf('id="hudBuffs"') < html.indexOf('id="hpBar"') && html.indexOf('id="arrowHud"') > html.indexOf('id="xpBar"'), "buffs and arrows flank HP markup"],
  [/#hudBuffs\s*\{[\s\S]*?right:\s*calc\(100% \+ 12px\)/.test(html) && /#arrowHud\s*\{[\s\S]*?left:\s*calc\(100% \+ 12px\)/.test(html), "desktop side anchoring"],
  [app.includes('Number(player.attackPotionUntil) || 0') && app.includes('Number(player.magicPotionUntil) || 0') && app.includes('Math.ceil(remaining / 1000)'), "buff countdown refresh"],
  [enemies.includes('attackBuffHudImg') && enemies.includes('magicBuffHudImg'), "buff potion art wiring"],
  [game.includes('const potionUseEffects = [];') && game.includes('POTION_USE_EFFECT_STYLES') && game.includes('function triggerPotionFeedback') && game.includes('drawPotionUseEffects'), "three-potion animation system"],
  [game.includes('triggerPotionFeedback(itemId, player.x, player.y);'), "offline all-potion feedback"],
  [network.includes('successfulPotion') && network.includes('triggerPotionFeedback(message.item, player.x, player.y);'), "authoritative local all-potion feedback"],
  [network.includes('message.type === "playerConsumableEffect"') && network.includes('spawnPotionUseEffect(message.item, remote.x, remote.y);'), "remote all-potion feedback"],
  [server.includes('broadcastToMap(playerState.mapId, { type: "playerConsumableEffect", playerId, item }, socket);'), "existing consumable presentation broadcast retained"],
  [server.includes('playerState.hp = Math.min(playerState.maxHp, playerState.hp + 20)') && server.includes('const POTION_BUFF_MS = 300000;') && server.includes('const HEALING_POTION_COOLDOWN_MS = 15000;') && server.includes('const BUFF_POTION_COOLDOWN_MS = 1000;'), "potion healing/buff values and new cooldowns"],
  [game.includes('equippedWeapon() === "bow" ? "flex" : "none"'), "arrow HUD remains bow-only"],
  [html.includes('/client-app.js?v=380') && html.includes('/client-network.js?v=380') && html.includes('/game.js?v=380'), "323 client cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Potion/status HUD regression: ${label}`);
}

console.log("Potion animation, timed buff HUD, and bow-only arrow indicator checks passed.");
