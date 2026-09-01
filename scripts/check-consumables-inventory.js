const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const app = fs.readFileSync("public/client-app.js", "utf8");
const world = fs.readFileSync("public/client-world.js", "utf8");

const resources = html.indexOf('<div class="menu-section-title">Resources</div>');
const consumables = html.indexOf('<div class="menu-section-title">Consumables</div>');
const weapons = html.indexOf('<div class="menu-section-title">Weapons</div>', consumables);
if (!(resources >= 0 && consumables > resources && weapons > consumables)) {
  throw new Error("Inventory section order Resources -> Consumables -> Weapons is not preserved");
}

for (const id of ["inventoryHealingPotionImg", "inventoryAttackPotionImg", "inventoryMagicPotionImg", "inventoryArrowImg"]) {
  const at = html.indexOf(`id="${id}"`);
  if (!(at > consumables && at < weapons)) {
    throw new Error(`${id} is not inside the Consumables section`);
  }
}

for (const id of ["inventoryCoinImg", "inventoryWoodImg", "inventoryStoneImg", "inventoryWhiteFlowerImg", "inventoryBlueFlowerImg", "inventoryGoldSlimeBubbleImg"]) {
  const at = html.indexOf(`id="${id}"`);
  if (!(at > resources && at < consumables)) {
    throw new Error(`${id} is not inside the Resources section`);
  }
}

if (!html.includes('id="inventoryResourcesGrid"') || !html.includes('id="inventoryConsumablesGrid"')) {
  throw new Error("Independent Resources/Consumables grids are missing");
}
if (!html.includes('id="inventoryConsumablesEmpty"')) {
  throw new Error("Consumables empty state is missing");
}
if (!game.includes('updateInventoryResourceGroup("inventoryResourcesGrid", "inventoryResourcesEmpty")')) {
  throw new Error("Resources visibility is not independently updated");
}
if (!game.includes('updateInventoryResourceGroup("inventoryConsumablesGrid", "inventoryConsumablesEmpty")')) {
  throw new Error("Consumables visibility is not independently updated");
}
if (!app.includes('drawTerrainWaterSurfaceOverlay(currentMapId, camX, camY)')) {
  throw new Error("Authored terrain water surface overlay is not in the prototype ground pipeline");
}
if (!world.includes('terrainWaterReflectionInfo(player.x, player.y, currentMapId, 16)')) {
  throw new Error("Local player authored-water reflection is not wired");
}
if (!game.includes('terrainWaterReflectionInfo(remote.x, remote.y, currentMapId, 16)')) {
  throw new Error("Remote player authored-water reflection is not wired");
}

console.log("Consumables inventory / authored-water reflection regression checks passed.");
