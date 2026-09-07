const fs = require("fs");
const crypto = require("crypto");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const enemies = fs.readFileSync("public/client-enemies.js", "utf8");
const woodRing = fs.readFileSync("public/assets/wood_ring_v3.png");
const woodRingSha = crypto.createHash("sha256").update(woodRing).digest("hex");

const checks = [
  [game.includes('loadImage("assets/wood_ring_v3.png")') && woodRingSha === "ed006485309085c5de0d2ecf4cf825ccf13b6f6dceedb25358c7db21b6dae67b", "custom Wood Ring v3 asset"],
  [html.includes('id="inventoryResourcesGrid"') && html.includes('id="inventoryConsumablesGrid"') && html.includes('id="inventoryWeaponsGrid"') && html.includes('id="inventoryArmorGrid"'), "all legacy inventory groups remain as data containers"],
  [/#inventoryResourcesGrid,[\s\S]*?#inventoryAccessoriesGrid\s*\{\s*display:\s*contents !important;/.test(html), "old categories flatten into one visible inventory grid"],
  [/#inventoryPage \.menu-section-title,[\s\S]*?display:\s*none !important;/.test(html), "category headings are no longer presented"],
  [html.includes('data-owned-item="weapon_pickaxe"') && html.includes('data-owned-item="hat_wood"') && html.includes('data-owned-item="charm_woodRing"'), "weapons, armor and accessories all occupy the unified grid"],
  [game.includes('stackCount.textContent = `${count}`;') && game.includes('stackCount.hidden = false;'), "owned inventory cells show simple quantities including one"],
  [game.includes('function renderInventoryOverlaySelection()') && html.includes('id="inventoryDetailPanel"'), "highlighted inventory item populates the new detail panel"],
  [enemies.includes('inventoryWoodRingImg') && enemies.includes('inventoryWoodRingImg.src = woodRingImage.src'), "wood ring icon wiring retained"],
  [html.includes('/game.js?v=427') && html.includes('/client-enemies.js?v=427'), "v422 inventory cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Unified inventory regression: ${label}`);
}

console.log("Unified flat inventory grid, quantity badges, details panel, and retained item wiring checks passed.");
