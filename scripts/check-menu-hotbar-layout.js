const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [input.includes('"1": 0') && input.includes('"9": 8'), "weapon/tool keys map 1-9 to nine assignment slots"],
  [!input.includes('player.utilityHotbarAssignments?.[Number(key) - 1]'), "retired 1-3 utility key path is inactive"],
  [game.includes('`slot${slotIndex + 1}`'), "weapon/tool assignments render in physical slots 1-9"],
  [game.includes('player.hotbarAssignments') && game.includes('HOTBAR_SLOT_COUNT = 9'), "unified belt uses nine saved assignment slots"],
  [html.includes('aria-label="Weapon and tool hotkeys"') && html.includes('<span class="menu-hotkey-key">1</span>') && html.includes('<span class="menu-hotkey-key">9</span>'), "Escape weapon/tool rail labels 1-9"],
  [html.includes('data-menu-hotbar-slot="0"') && html.includes('data-menu-hotbar-slot="8"'), "Escape rail exposes nine weapon/tool slots"],
  [html.includes('id="menuUtilityHotkeyRail" class="menu-hotkey-rail context-hidden retired-system"'), "old utility rail is retained only as hidden migration UI"],
  [game.includes('updateMenuHotkeyRailVisibility(pageId)') && game.includes('context-hidden'), "Escape shortcut rail still switches by active tab"],
  [/grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(html) && /#menuItemHotkeyRail,[\s\S]*?#inventoryPanel\s*\{[\s\S]*?grid-row:\s*1;/.test(html), "Escape menu and contextual rail share one centered grid row"],
  [/#inventoryOverlay\s*\{[\s\S]*?z-index:\s*220;/.test(html), "Escape overlay renders above viewport HUD"],
  [/@media \(min-width: 981px\) and \(min-height: 650px\)[\s\S]*?#inventoryOverlay\s*\{[\s\S]*?1120px/.test(html), "desktop Escape workspace enlarged"],
  [/\.item-detail-tooltip\s*\{[\s\S]*?width:\s*440px;/.test(html), "item hover card enlarged"],
  [/\.skill-detail-tooltip\s*\{[\s\S]*?width:\s*460px;/.test(html), "legacy skill detail style remains layout-safe while skill UI is retired"],
  [html.includes('/client-input.js?v=379') && html.includes('/game.js?v=379'), "v377 client cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Menu/hotbar regression: ${label}`);
}

console.log("Menu layering, sizing, hover cards, and unified assignable 1-9 weapon/tool hotbar checks passed.");
