const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("public", "index.html");
const game = read("public", "game.js");
const combat = read("public", "client-combat.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));

assert(server.includes('const BUILD_VERSION = "6-11-370";'), "server build must be v355");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-370";'), "client build must be v355");
assert.strictEqual(pkg.version, "0.6.11.370", "package version must be v355");
assert(html.includes('/game.js?v=370') && html.includes('/client-combat.js?v=370'), "v355 cache keys missing");

assert(html.includes('translateX(-50%) scale(.84)'), "wide mobile top toolbar scale missing");
assert(html.includes('translateX(-50%) scale(.70)'), "compact mobile top toolbar scale missing");
assert(html.includes('left: 2px;') && html.includes('top: 3px;'), "mobile MENU corner placement missing");
assert(html.includes('top: 4px !important;') && html.includes('grid-template-rows: repeat(4, 38px) !important;'), "mobile skill column is not upper-right aligned");

assert(game.includes('const SWORD_REACH = 26;'), "standard melee reach must be 26");
assert(game.includes('const WAND_MASTERY_REACH = 45;'), "Wand Mastery reach must be 45");
assert(game.includes('const BOW_MELEE_TRIGGER_RANGE = 28;'), "bow-smack reach must be 28");
assert(combat.includes('equippedWeapon() === "katana" ? 31 : SWORD_REACH'), "katana reach must be 31");

assert(server.includes('attacker.weaponIndex === 4 ? 40 : 36;'), "PvP standard reach validation missing");
assert(server.includes('distance > 45 + bodyRadius + reconciliationRangeGrace'), "server Wand Mastery validation missing");
assert(server.includes('distance > 28 + bodyRadius'), "server bow-smack validation missing");
assert(server.includes('maxDistance: 320'), "bow projectile range must remain unchanged");

console.log("mobile HUD and weapon reach tuning checks passed");
