const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [game.includes('utilityHotbarAssignments: [\n    null,\n    null,\n    null\n  ]') && game.includes('utilityHotbarCustomized: false'), "item hotkeys start empty instead of preset potions"],
  [game.includes('function assignUtilityItemToHotbar') && game.includes('function clearUtilityItemFromHotbar') && game.includes('function sanitizeUtilityHotbarAssignments'), "generic item-slot assignment helpers"],
  [game.includes('utilityHotbarCustomized: Boolean(player.utilityHotbarCustomized)') && game.includes('save.utilityHotbarCustomized === true'), "explicit item-hotkey customization persists"],
  [game.includes('player.utilityHotbarAssignments = player.utilityHotbarCustomized && Array.isArray(savedUtilityAssignments)') && game.includes('Array.from({ length: UTILITY_HOTBAR_SLOT_COUNT }, () => null)'), "legacy uncustomized saves migrate to empty item slots"],
  [input.includes('player.utilityHotbarAssignments?.[Number(key) - 1]') && !input.includes('UTILITY_SLOT_ITEMS[Number(key) - 1]'), "keys 1-3 use assignments rather than fixed potion identities"],
  [html.includes('id="menuUtilityHotkeyRail"') && html.includes('data-menu-utility-slot="0"') && html.includes('data-menu-utility-slot="2"'), "dedicated Items 1-3 rail exists"],
  [game.includes('application/x-slime-utility-item') && game.includes('menuUtilityHotkeyRail?.addEventListener("drop"') && game.includes('menuUtilityHotkeyRail?.addEventListener("contextmenu"'), "consumables drag/drop and right-click clear are wired"],
  [game.includes('element.draggable = eligible;') && html.includes('data-utility-hotbar-assignable="true" data-utility-item="healingPotion"'), "owned consumables can be dragged from Inventory"],
  [game.includes('updateMenuHotkeyRailVisibility(pageId)') && game.includes('pageId === "inventoryPage"') && game.includes('pageId === "skillsPage"'), "shortcut rails are contextual by tab"],
  [html.includes('id="menuSkillHotkeyRail" class="menu-hotkey-rail context-hidden"'), "skill rail is hidden outside the Skills tab by default"],
  [game.includes('const itemId = player.utilityHotbarAssignments[index] || null;') && game.includes('utilityItemDisplayName(itemId)'), "top hotbar renders current assigned item"],
  [game.includes('const cooling = assigned && cooldownRemaining > 0;') && game.includes('triggerPotionFeedback(itemId, player.x, player.y);'), "existing potion cooldown/feedback behavior retained"],
  [html.includes('/client-input.js?v=370') && html.includes('/game.js?v=370'), "323 cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Assignable item hotkeys regression: ${label}`);
}

console.log("Contextual drag-and-drop item hotkey regression checks passed.");
