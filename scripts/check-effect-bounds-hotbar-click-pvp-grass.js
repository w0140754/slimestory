const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(`[FAIL] ${message}`);
}

const server = read('server.js');
const game = read('public', 'game.js');
const clientApp = read('public', 'client-app.js');
const html = read('public', 'index.html');
const config = read('public', 'client-config.js');

assert(server.includes('const BUILD_VERSION = "6-11-431";'), 'server build must be 6-11-431');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-431";'), 'client build must be 6-11-431');
assert(html.includes('/game.js?v=431') && html.includes('/client-app.js?v=431'), 'client cache keys must be v431');

assert(!server.includes('clampNumber(value, -32, 672'), 'legacy 640px visual-effect clamp must be removed');
assert(server.includes('function sanitizeVisualPoint(value, mapId, axis = "x", fallback = 0)'), 'visual point sanitizer must be map-aware');
assert(server.includes('const dimensions = mapWorldDimensions(mapId);'), 'visual point sanitizer must read active map dimensions');
assert(/sanitizeVisualEffectPayload\(\s*effect,\s*message\.payload,\s*playerState\.mapId\s*\)/s.test(server), 'visual effects must sanitize against the sender map');
assert(server.includes('sanitizeVisualPoint(payload.targetX, mapId, "x")'), 'targeted action X must use map-aware bounds');
assert(server.includes('sanitizeVisualPoint(payload.targetY, mapId, "y")'), 'targeted action Y must use map-aware bounds');

assert(/#hotbar\s*\{[^}]*pointer-events:\s*auto;/s.test(html), 'top hotbar must accept pointer input');
assert(/\.hotbar-slot\s*\{[^}]*cursor:\s*pointer;/s.test(html), 'hotbar slots should present as clickable');
assert(game.includes('const topHotbar = document.getElementById("hotbar");'), 'top hotbar click handler missing');
assert(game.includes('if (slotNumber >= 1 && slotNumber <= HOTBAR_SLOT_COUNT)'), 'unified 1-0 hotbar click branch missing');
assert(game.includes('index: slotNumber - 1'), 'clicking 1-0 must select the matching weapon/tool belt slot');
assert(game.includes('document.getElementById("inventoryDetailAction")?.addEventListener("click"') && game.includes('useConsumable(itemId);'), 'consumables must remain usable from the selected Inventory detail action');

// Current design audit: Magic Grass slows enemies, not players. Player movement
// still derives slow from Wet, and a player's Rain Cloud can only apply Wet to
// its own owner now that the retired PvP system is gone.
assert(clientApp.includes('Magic Grass is caster-created control terrain: players can roam through'), 'player movement should still explicitly ignore Magic Grass');
assert(server.includes('for(const enemy of allSharedEnemies())') && server.includes('updateEnemyRainGrassDerivedState(enemy,now)'), 'Magic Grass membership should remain enemy-derived');
assert(server.includes('if (target.id !== ownerId)') && !server.includes('pvpPlayersCanHarm') && !server.includes('case \"pvpAttack\"'), 'Rain Cloud player Wet must be owner-only with retired PvP absent');

console.log('[PASS] Wide-map effect bounds, unified clickable 1-0 hotbar, enemy-only Magic Grass, and owner-only player Rain Wet are correct.');
