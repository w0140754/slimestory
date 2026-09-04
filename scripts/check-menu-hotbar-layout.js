const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const game = fs.readFileSync("public/game.js", "utf8");
const input = fs.readFileSync("public/client-input.js", "utf8");

const checks = [
  [input.includes('"4": 0') && input.includes('"8": 4'), "equipment keys map 4-8 to five saved assignment slots"],
  [input.includes('key === "1" || key === "2" || key === "3"') && input.includes('player.utilityHotbarAssignments?.[Number(key) - 1]'), "item hotkeys use player assignments on 1-3"],
  [game.includes('`slot${slotIndex + 4}`'), "weapon assignments render in physical slots 4-8"],
  [game.includes('player.utilityHotbarAssignments[index] || null') && game.includes('`slot${index + 1}`'), "assigned consumables render in physical slots 1-3"],
  [html.includes('aria-label="Equipment hotkeys"') && html.includes('<span class="menu-hotkey-key">4</span>') && html.includes('<span class="menu-hotkey-key">8</span>'), "Escape equipment rail labels 4-8"],
  [html.includes('id="menuUtilityHotkeyRail"') && html.includes('data-menu-utility-slot="0"') && html.includes('data-menu-utility-slot="2"') && html.includes('data-menu-hotbar-slot="0"') && html.includes('data-menu-hotbar-slot="4"'), "contextual rails expose item keys 1-3 and equipment keys 4-8"],
  [game.includes('updateMenuHotkeyRailVisibility(pageId)') && game.includes('context-hidden'), "Escape shortcut rails switch by active tab"],
  [/grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(html) && /#menuItemHotkeyRail,[\s\S]*?#inventoryPanel\s*\{[\s\S]*?grid-row:\s*1;/.test(html), "Escape menu and contextual rails share one centered grid row"],
  [/#inventoryOverlay\s*\{[\s\S]*?z-index:\s*220;/.test(html), "Escape overlay renders above viewport HUD"],
  [/@media \(min-width: 981px\) and \(min-height: 650px\)[\s\S]*?#inventoryOverlay\s*\{[\s\S]*?1120px/.test(html), "desktop Escape workspace enlarged"],
  [/\.item-detail-tooltip\s*\{[\s\S]*?width:\s*440px;/.test(html), "item hover card enlarged"],
  [/\.skill-detail-tooltip\s*\{[\s\S]*?width:\s*460px;/.test(html), "skill hover card enlarged"],
  [html.includes('/client-input.js?v=365') && html.includes('/game.js?v=365'), "323 client cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Menu/hotbar regression: ${label}`);
}

console.log("Menu layering, sizing, hover cards, and assignable 1-3/4-8 hotkey layout checks passed.");
