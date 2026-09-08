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

assert(server.includes('const BUILD_VERSION = "6-11-432";'), "server build must be v355");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-432";'), "client build must be v355");
assert.strictEqual(pkg.version, "0.6.11.432", "package version must be v355");
assert(html.includes('/game.js?v=431') && html.includes('/client-combat.js?v=431'), "v355 cache keys missing");

assert(html.includes('translateX(-50%) scale(.84)'), "wide mobile top toolbar scale missing");
assert(html.includes('translateX(-50%) scale(.70)'), "compact mobile top toolbar scale missing");
assert(html.includes('left: 2px;') && html.includes('top: 3px;'), "mobile MENU corner placement missing");
assert(!html.includes('id="abilityBar"'), "retired mobile skill column must be removed");

assert(game.includes('const SWORD_REACH = 26;'), "standard melee reach must be 26");
assert(combat.includes('player.bowDrawing = true;'), "bow press must still start the current draw/release attack");
assert(combat.includes('equippedWeapon() === "katana" ? 31 : SWORD_REACH'), "katana reach must be 31");

assert(server.includes('playerState.weaponIndex === 4 ? 31 : 26;'), "authoritative enemy melee reach validation missing");
assert(!server.includes("validateSharedEnemyBowMeleeHit"), "retired bow-smack server path must stay removed");
assert(server.includes('maxDistance: 320'), "bow projectile range must remain unchanged");

console.log("mobile HUD and weapon reach tuning checks passed");
