const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(`[FAIL] ${message}`);
}

const balance = require(path.join(root, 'public', 'shared', 'combat-balance.js'));
const combat = read('public', 'client-combat.js');
const game = read('public', 'game.js');
const server = read('server.js');
const config = read('public', 'client-config.js');
const html = read('public', 'index.html');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');

assert(server.includes('const BUILD_VERSION = "6-11-353";'), 'server build must be 6-11-353');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-353";'), 'client build must be 6-11-353');
assert(pkg.version === '0.6.11.353', 'package version must be 0.6.11.353');
assert(html.includes('/shared/combat-balance.js?v=353') && html.includes('/client-combat.js?v=353') && html.includes('/game.js?v=353'), 'v333 combat cache keys missing');

assert(balance.version === 27, 'combat balance version must be 27');
assert(balance.attackSpeedTiers?.slow?.cooldown === 0.83, 'Slow tier must remain 0.83s');
assert(balance.attackSpeedTiers?.normal?.cooldown === 0.75, 'Normal tier must remain 0.75s');
assert(balance.attackSpeedTiers?.quick?.cooldown === 0.65, 'Quick tier must remain 0.65s');

const expected = new Map([
  [0, ['Normal', 0.75]], // Wood Sword
  [1, ['Slow', 0.83]],   // Axe
  [2, ['Slow', 0.83]],   // Fire Wand
  [3, ['Slow', 0.83]],   // Rain Wand
  [4, ['Quick', 0.65]],  // Katana
  [5, ['Normal', 0.75]], // Sword
  [8, ['Slow', 0.83]],   // Shepherd Staff
  [9, ['Normal', 0.75]], // Tournesol
  [10, ['Quick', 0.65]], // Tabatha's Key
  [11, ['Slow', 0.83]],  // Pickaxe
  [12, ['Normal', 0.75]] // Sapgem Wand
]);
for (const [index, [label, cooldown]] of expected) {
  assert(balance.weaponAttackSpeedLabel(index) === label, `weapon ${index} expected ${label}`);
  assert(balance.weaponAttackCooldown(index) === cooldown, `weapon ${index} expected ${cooldown}s cooldown`);
}
assert(balance.weaponAttackSpeedProfile(6) === null && balance.weaponAttackSpeedProfile(7) === null, 'bows must be excluded from attack-speed tiers');

assert(combat.includes('COMBAT_BALANCE.weaponAttackCooldown(player.weaponIndex)'), 'client basic attacks must read shared weapon attack cooldown');
assert(!combat.includes('if (weapon === "katana") return 0.42;'), 'legacy Katana-only cooldown override must be removed');
assert(game.includes('COMBAT_BALANCE.weaponAttackSpeedLabel(weaponIndex)'), 'weapon detail UI must use universal attack-speed label');
assert(game.includes('if (!isBowWeapon)'), 'weapon detail UI must exclude bows from basic attack speed');

assert(server.includes('function weaponAttackRateLimitMs(weaponIndex)'), 'server universal weapon rate limiter missing');
assert(server.includes('COMBAT_BALANCE.weaponAttackCooldown(weaponIndex)'), 'server rate limiter must read shared weapon cooldown');
assert(server.includes('minimumMs = weaponAttackRateLimitMs(attacker.weaponIndex);'), 'PvP melee must enforce universal weapon cadence');
assert(server.includes('minimumMs = weaponAttackRateLimitMs(playerState.weaponIndex);'), 'enemy melee/basic attacks must enforce universal weapon cadence');

assert(readme.includes('## v6-11-333 — Universal attack-speed tiers'), 'README historical v333 changelog missing');
console.log('[PASS] Universal non-bow Slow/Normal/Quick attack-speed tiers are shared by client, server, and weapon UI; bows remain draw-time based.');
