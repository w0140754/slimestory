const fs = require("fs");

const game = fs.readFileSync("public/game.js", "utf8");
const app = fs.readFileSync("public/client-app.js", "utf8");
const network = fs.readFileSync("public/client-network.js", "utf8");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");

const checks = [
  [!game.includes("sparkleTime") && !game.includes("drawCoinDropSparkles"), "coin sparkle state/render helper removed"],
  [!app.includes("drawCoinDropSparkles"), "coin sparkle render call removed"],
  [!network.includes("serverCoin.sparkle") && !network.includes("sparkle: Boolean"), "shared coin sparkle plumbing removed"],
  [enemies.includes('inventoryWhiteFlowerImg").src = flowerLootImage("white").src') && enemies.includes('inventoryBlueFlowerImg").src = flowerLootImage("blue").src'), "inventory uses exact flower loot sprites"],
  [enemies.includes('craftHealingWhiteIcon").src = flowerImage.src') && enemies.includes('craftHealingBlueIcon").src = blueFlowerImage.src'), "crafting flower icons unchanged"]
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Loot/UI polish regression: ${label}`);
}

console.log("Coin shimmer removal and inventory flower loot-icon checks passed.");
