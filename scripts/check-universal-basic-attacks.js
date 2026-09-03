const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
function assert(ok, message) { if (!ok) throw new Error(`[FAIL] ${message}`); }

const game = read("public", "game.js");
const combat = read("public", "client-combat.js");
const app = read("public", "client-app.js");
const input = read("public", "client-input.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const readme = read("README.md");

assert(server.includes('const BUILD_VERSION = "6-11-359";'), "server build must be 6-11-359");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-359";'), "client build must be 6-11-359");
assert(html.includes('/client-combat.js?v=359') && html.includes('/game.js?v=359'), "client cache keys must be v333");

assert(game.includes('let pendingBasicAttack = null;'), "generic pending basic attack state missing");
assert(game.includes('basicAttackMovementLockTime: 0'), "generic basic attack movement lock missing");
assert(!game.includes('pendingWandBasicAttack'), "wand-only pending attack state still present");
assert(!game.includes('wandMovementLockTime'), "wand-only movement lock state still present");
assert(game.includes('const MELEE_BASIC_ATTACK_IMPACT_PHASE = 0.34;'), "non-wand active-frame impact phase missing");

assert(combat.includes('function attackImpactDelayForWeapon(weapon)'), "generic impact timing helper missing");
assert(combat.includes('function queueBasicAttackImpact(weapon, shadowCritAttack)'), "generic queued impact helper missing");
assert(combat.includes('function updatePendingBasicAttack(dt)'), "generic pending attack updater missing");
assert(combat.includes('mobileControlsEnabled ? 0 : player.attackDuration;'), "desktop attacks must stay planted while mobile can move through the gesture");
assert(combat.includes('queueBasicAttackImpact(\n    currentWeapon,'), "primary attacks must queue through generic impact path");
assert(!combat.includes('if (isWandTypeWeapon(currentWeapon)) {\n    // Plant only voluntary movement'), "old wand-only impact branch still present");

for (const weapon of ['"sword"', '"oldSword"', '"katana"', '"axe"', '"pickaxe"']) {
  assert(combat.includes(weapon), `expected non-bow weapon routing missing: ${weapon}`);
}
assert(combat.includes('if (isWandTypeWeapon(weapon))'), "wand/Wand Mastery routing must remain");
assert(combat.includes('if (\n    equippedWeapon() === "bow"'), "bow must retain separate primary-input path");
assert(combat.includes('if (!weapon || weapon === "bow" || getLocalCarriedHurlObject()) return;'), "held-repeat must continue excluding bows and Hurl");

assert(app.includes('updatePendingBasicAttack(dt);'), "main update loop does not tick generic pending attack");
assert(app.includes('player.basicAttackMovementLockTime <= 0'), "movement loop does not honor generic attack lock");
assert(input.includes('pendingBasicAttack = null;'), "input reset does not clear generic pending attack");

assert(readme.includes('## v6-11-332 — Universal non-bow basic attacks'), "README v332 historical changelog missing");
console.log('[PASS] Universal non-bow basic attacks share queued impact/movement-lock lifecycle; bows remain separate.');
