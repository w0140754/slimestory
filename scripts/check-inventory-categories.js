const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");

const crypto = require("crypto");
const woodRing = fs.readFileSync("public/assets/wood_ring_v3.png");
const woodRingSha = crypto.createHash("sha256").update(woodRing).digest("hex");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");

const checks = [
  [game.includes('loadImage("assets/wood_ring_v3.png")') && woodRingSha === "ed006485309085c5de0d2ecf4cf825ccf13b6f6dceedb25358c7db21b6dae67b", "custom Wood Ring v3 asset"],
  [html.includes('id="inventoryResourcesGrid"') && html.includes('id="inventoryConsumablesGrid"'), "resources and consumables retained"],
  [html.includes('id="inventoryWeaponsGrid"') && html.includes('>Weapons</div>'), "weapons inventory group"],
  [html.includes('id="inventoryArmorGrid"') && html.includes('>Armor</div>'), "armor inventory group"],
  [html.includes('id="inventoryAccessoriesGrid"') && html.includes('>Accessories</div>'), "accessories inventory group"],
  [html.includes('data-owned-item="weapon_pickaxe"') && html.includes('data-owned-item="hat_wood"'), "existing weapon and armor entries retained"],
  [html.includes('data-owned-item="charm_woodRing"') && html.includes('id="inventoryWoodRingImg"'), "wood ring accessory entry"],
  [game.includes('updateOwnedInventoryGroup("inventoryWeaponsGrid", "inventoryWeaponsEmpty")') && game.includes('updateOwnedInventoryGroup("inventoryArmorGrid", "inventoryArmorEmpty")') && game.includes('updateOwnedInventoryGroup("inventoryAccessoriesGrid", "inventoryAccessoriesEmpty")'), "per-category visibility/empty handling"],
  [enemies.includes('inventoryWoodRingImg') && enemies.includes('inventoryWoodRingImg.src = woodRingImage.src'), "wood ring inventory icon wiring"],
  [html.includes('/game.js?v=370') && html.includes('/client-enemies.js?v=370'), "323 inventory cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Inventory category regression: ${label}`);
}

console.log("Inventory category split regression checks passed.");
