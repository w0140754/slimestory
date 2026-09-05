const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [input.includes('"1": 0') && input.includes('"9": 8'), "keys 1-9 select unified weapon/tool assignments"],
  [!input.includes('player.utilityHotbarAssignments?.[Number(key) - 1]'), "keys 1-3 no longer activate utility hotbar assignments"],
  [html.includes('data-consumable-item="healingPotion"') && html.includes('data-consumable-item="attackPotion"') && html.includes('data-consumable-item="magicPotion"'), "consumables are marked for direct Inventory use"],
  [html.includes('Healing Potion · restores 20 HP · click to use') && !html.includes('drag to Items 1–3'), "consumable UI no longer advertises retired utility hotkeys"],
  [game.includes("event.target.closest('[data-consumable-item]')") && game.includes('utilityElement.dataset.consumableItem') && game.includes('useConsumable(utilityItemId);'), "Inventory click directly uses consumables"],
  [html.includes('id="menuUtilityHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"') && html.includes('id="menuSkillHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"'), "old utility/skill rails remain hidden only for compatibility"],
  [game.includes('document.getElementById("menuUtilityHotkeyRail")?.classList.add("context-hidden")') && game.includes('document.getElementById("menuSkillHotkeyRail")?.classList.add("context-hidden")'), "retired shortcut rails cannot become active by tab switching"],
  [html.includes('/client-input.js?v=380') && html.includes('/game.js?v=380'), "v377 cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Unified hotbar / direct consumable regression: ${label}`);
}

console.log("Unified 1-9 weapon/tool keys and direct Inventory consumable use checks passed.");
