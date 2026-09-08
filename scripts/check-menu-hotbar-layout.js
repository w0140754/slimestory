const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [input.includes('"1": 0') && input.includes('"9": 8') && input.includes('"0": 9'), "weapon/tool keys map 1-0 to ten assignment slots"],
  [game.includes('player.hotbarAssignments') && game.includes('HOTBAR_SLOT_COUNT = 10'), "unified belt still uses ten saved assignments"],
  [html.includes('id="menuHudButton"') && html.includes('id="craftHudButton"'), "Menu and Craft are independent top-level HUD buttons"],
  [game.includes('setInventoryOpen(!inventoryOpen)') && game.includes('setCraftingOpen(!craftingOpen)'), "Menu and Craft buttons toggle their own overlays"],
  [game.includes('function syncInventoryOverlayToViewport()') && game.includes('viewport.getBoundingClientRect()'), "inventory overlay anchors to the rendered game viewport"],
  [/#inventoryOverlay\s*\{[\s\S]*?pointer-events:\s*none;/.test(html), "inventory workspace does not swallow world input outside its panels"],
  [/#inventoryDetailPanel,[\s\S]*?#inventoryPage,[\s\S]*?#equipmentPage\s*\{[\s\S]*?pointer-events:\s*auto;/.test(html), "only visible inventory panels capture pointer input"],
  [game.includes('topHotbar?.addEventListener("drop"'), "real top hotbar is the assignment drop target"],
  [html.includes('data-equipment-slot="head"') && html.includes('data-equipment-slot="shirt"') && html.includes('data-equipment-slot="pants"') && html.includes('data-equipment-slot="charm"'), "right equipment dock exposes armor destinations"],
  [/#statsPage,[\s\S]*?#pvpPage,[\s\S]*?display:\s*none !important;/.test(html), "Stats and PvP pages are removed from the presented menu"],
  [html.includes('/client-input.js?v=430') && html.includes('/game.js?v=430'), "v422 client cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Live menu/hotbar regression: ${label}`);
}

console.log("Live overlay Menu/Craft, viewport anchoring, equipment dock, and actual-hotbar drag checks passed.");
