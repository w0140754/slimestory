const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [input.includes('"1": 0') && input.includes('"9": 8') && input.includes('"0": 9'), "keys 1-0 select unified weapon/tool assignments"],
  [!input.includes('player.utilityHotbarAssignments?.[Number(key) - 1]'), "keys 1-3 no longer activate retired utility assignments"],
  [html.includes('data-consumable-item="healingPotion"') && html.includes('data-consumable-item="attackPotion"') && html.includes('data-consumable-item="magicPotion"'), "consumables remain identifiable in Inventory"],
  [game.includes('document.getElementById("inventoryDetailAction")?.addEventListener("click"') && game.includes('useConsumable(itemId);'), "consumables are used from the selected-item detail action rather than accidental grid clicks"],
  [game.includes('topHotbar?.addEventListener("drop"') && game.includes('assignItemToHotbar(itemId, slotNumber - 1);'), "inventory items drag onto the actual HUD hotbar"],
  [game.includes('if (!hotbarItemCanBeAssigned(itemId)) return;'), "actual hotbar rejects non-assignable inventory items such as armor"],
  [html.includes('id="menuUtilityHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"') && html.includes('id="menuSkillHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"'), "old utility/skill rails remain compatibility-only"],
  [html.includes('/client-input.js?v=430') && html.includes('/game.js?v=430'), "v422 cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Unified hotbar / selected consumable regression: ${label}`);
}

console.log("Unified 1-0 hotbar, drag assignment, armor rejection, and selected consumable use checks passed.");
