const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = read('server.js');
const config = read('public', 'client-config.js');
const game = read('public', 'game.js');
const enemies = read('public', 'client-enemies.js');
const rendering = read('public', 'client-enemy-rendering.js');
const editor = read('public', 'map-editor.js');
const draftFormat = read('public', 'shared', 'map-draft-format.js');
const balance = read('public', 'shared', 'combat-balance.js');
const html = read('public', 'index.html');
const readme = read('README.md');

assert(server.includes('const BUILD_VERSION = "6-11-372";'), 'server build must be 6-11-372');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-372";'), 'client build must be 6-11-372');
assert(html.includes('/shared/combat-balance.js?v=372') && html.includes('/client-enemies.js?v=372') && html.includes('/client-enemy-rendering.js?v=372') && html.includes('/game.js?v=372'), 'current enemy/game/combat cache keys missing');

assert(server.includes('crab: makeServerCrab'), 'server enemy factory registry missing Crab');
assert(server.includes('const sharedCrabs ='), 'server Crab collection missing');
assert(server.includes('function tickSharedCrabs(dt)'), 'server Crab AI tick missing');
assert(server.includes('tickSharedCrabs(dt);'), 'Crab AI not wired into authoritative simulation');
assert(server.includes('function chooseServerCrabWanderTarget(crab)'), 'Crab sideways wander planner missing');
assert(server.includes('function crabMovementVector(dx, dy)'), 'Crab sideways movement bias missing');
assert(server.includes('type: "crab"'), 'server Crab type missing');

assert(game.includes('crab: "crabs"'), 'client Crab collection registry missing');
assert(game.includes('crab(spawn)'), 'client Crab factory missing');
assert(game.includes('draw: drawCrab') && game.includes('update: updateCrabs'), 'client Crab runtime profile missing draw/update hooks');
assert(enemies.includes('assets/crab_v2.png?v=347') && enemies.includes('assets/crab_back_v1.png?v=347') && enemies.includes('assets/crab_front_v1.png?v=347'), 'Crab two-piece sprites not loaded with current cache key');
assert(enemies.includes('function makeCrab(') && enemies.includes('function updateCrabs(dt)'), 'client Crab constructor/update missing');
assert(rendering.includes('function drawCrab(crab, camX, camY)'), 'Crab renderer missing');
assert(rendering.includes('effect.enemyType === "crab"'), 'Crab death presentation missing');

assert(editor.includes('{ value: "crab", label: "Crab" }'), 'map editor Crab species option missing');
assert(editor.includes('label: "C"'), 'map editor Crab marker missing');
assert(draftFormat.includes('["slime", "mushroom", "crab", "goblin", "ghost", "bigGoldSlime"]'), 'map draft validation does not accept Crab');
assert(balance.includes('const VERSION = 29;') && balance.includes('crab: Object.freeze({'), 'combat balance v28 Crab monster defaults missing');
assert(readme.includes('## v6-11-337 — Crab enemy'), 'README v337 changelog missing');

for (const name of ['crab_v2.png', 'crab_back_v1.png', 'crab_front_v1.png']) {
  const asset = fs.readFileSync(path.join(root, 'public', 'assets', name));
  assert(asset.length > 24 && asset.toString('ascii', 1, 4) === 'PNG', `${name} is not a PNG`);
  const width = asset.readUInt32BE(16);
  const height = asset.readUInt32BE(20);
  assert(width === 30 && height === 16, `${name} must remain 30x16, got ${width}x${height}`);
}

console.log('Crab enemy regression checks passed.');
