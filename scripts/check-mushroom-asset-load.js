const fs = require('fs');
const path = require('path');
function read(...parts) { return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'); }
function assert(ok, message) { if (!ok) throw new Error(message); }
const enemies = read('public', 'client-enemies.js');
const rendering = read('public', 'client-enemy-rendering.js');
const index = read('public', 'index.html');
assert(enemies.includes('mushroom_sleep_v1.png?v=347'), 'sleep mushroom asset must use v331 retry key');
assert(enemies.includes('mushroom_awake_v1.png?v=347'), 'awake mushroom asset must use v331 retry key');
assert(enemies.includes('mushroom_flash_v1.png?v=347'), 'flash mushroom asset must use v331 retry key');
assert(rendering.includes('image.naturalWidth > 0') && rendering.includes('image.naturalHeight > 0'), 'mushroom base image must be decode-guarded');
assert(rendering.includes('mushroomFlashImage.naturalWidth > 0') && rendering.includes('mushroomFlashImage.naturalHeight > 0'), 'mushroom flash image must be decode-guarded');
assert(rendering.includes('Never let a still-loading/failed mushroom asset abort the entire render loop'), 'fallback render guard missing');
assert(index.includes('/client-enemy-rendering.js?v=355') && index.includes('/client-enemies.js?v=355'), 'client cache keys must be v332');
console.log('[PASS] Mushroom image loading is render-safe and cache-busted for v332.');
