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

assert(server.includes('const BUILD_VERSION = "6-11-374";'), 'server build must be 6-11-374');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-374";'), 'client build must be 6-11-374');
assert(html.includes('/game.js?v=374') && html.includes('/client-app.js?v=374'), 'client cache keys must be v333');

assert(!server.includes('clampNumber(value, -32, 672'), 'legacy 640px visual-effect clamp must be removed');
assert(server.includes('function sanitizeVisualPoint(value, mapId, axis = "x", fallback = 0)'), 'visual point sanitizer must be map-aware');
assert(server.includes('const dimensions = mapWorldDimensions(mapId);'), 'visual point sanitizer must read active map dimensions');
assert(server.includes('sanitizeVisualEffectPayload(\n      effect,\n      message.payload,\n      playerState.mapId'), 'visual effects must sanitize against the sender map');
assert(server.includes('sanitizeVisualPoint(payload.targetX, mapId, "x")'), 'skill target X must use map-aware bounds');
assert(server.includes('sanitizeVisualPoint(payload.targetY, mapId, "y")'), 'skill target Y must use map-aware bounds');
assert(server.includes('sanitizeVisualPoint(payload.endX, mapId, "x")'), 'blink/return X must use map-aware bounds');

assert(/#hotbar\s*\{[^}]*pointer-events:\s*auto;/s.test(html), 'top hotbar must accept pointer input');
assert(/\.hotbar-slot\s*\{[^}]*cursor:\s*pointer;/s.test(html), 'hotbar slots should present as clickable');
assert(game.includes('const topHotbar = document.getElementById("hotbar");'), 'top hotbar click handler missing');
assert(game.includes('if (slotNumber >= 1 && slotNumber <= 3)'), 'item slots 1-3 click branch missing');
assert(game.includes('if (itemId) useConsumable(itemId);'), 'clicking 1-3 must immediately use the assigned consumable');
assert(game.includes('if (slotNumber >= 4 && slotNumber <= 8)'), 'equipment slots 4-8 click branch missing');
assert(game.includes('index: slotNumber - 4'), 'clicking 4-8 must select the matching equipment hotbar slot');

// Current design audit: Magic Grass slows enemies, not players. Player movement
// still derives slow from Wet and PvP Snare only; Rain Wet on another player is
// separately gated by mutual PvP opt-in on the server.
assert(clientApp.includes('Magic Grass is caster-created control terrain: players can roam through'), 'player movement should still explicitly ignore Magic Grass');
assert(server.includes('for(const enemy of allSharedEnemies())') && server.includes('updateEnemyRainGrassDerivedState(enemy,now)'), 'Magic Grass membership should remain enemy-derived');
assert(server.includes('Against another player, Wet/slow is') && server.includes('pvpPlayersCanHarm(owner, target)'), 'Rain Wet player slow must remain PvP-gated');

console.log('[PASS] Wide-map skill bounds, clickable top hotbar, and PvP Magic Grass behavior are correct.');
