"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
function assert(ok, message) { if (!ok) throw new Error(`[FAIL] ${message}`); }

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const combat = read("public", "client-combat.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");
const balanceText = read("public", "shared", "combat-balance.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));

assert.strictEqual = (actual, expected, message) => assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
assert.strictEqual(pkg.version, "0.6.11.468", "package version");
assert(server.includes('const BUILD_VERSION = "6-11-468";'), "server build marker must be 436");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'), "client build marker must be 436");
assert(html.includes('/game.js?v=431e-468'), "game cache token must be 436");

// The actual retired item/art/style must be gone from runtime files.
for (const [name, source] of [["game", game], ["combat", combat], ["enemies", enemies], ["html", html], ["server", server], ["balance", balanceText]]) {
  assert(!source.includes("weapon_oldSword"), `${name} still contains retired weapon_oldSword`);
  assert(!source.includes("oldSword"), `${name} still contains retired oldSword style/art`);
  assert(!source.includes("inventoryOldSword"), `${name} still contains retired old-sword inventory UI`);
}

// Slot 5 stays deliberately empty so current replicated weapon indices do not move.
assert(game.includes('const WEAPON_STYLES = ["sword", "axe", null, null, null, null, "bow", "bow", "shepherdStaff", "lostKeyWand", "sunflowerWand", "pickaxe", "sapgemWand", "tigerPaw"];'), "client reserved weapon holes/stable mapping missing");
assert(game.includes('null, // retired old-sword slot 5; preserve current protocol indices'), "client item-id slot 5 must stay reserved");
assert(game.includes('if (index >= 2 && index <= 5) return null;'), "retired slot 5 must remain inside the inert weapon-art range");
assert(balance.version >= 33, "combat-balance version must retain or advance the v436 schema");
assert(balance.weaponProfiles.length === 14, "weapon profile table length must remain 14 for index stability");
assert(balance.weaponProfiles[5] === null, "combat profile slot 5 must be inert");
assert(balance.weaponProfiles[6]?.id === "weapon_bow", "Wood Bow must remain weapon index 6");
assert(balance.weaponProfiles[11]?.id === "weapon_pickaxe", "Pickaxe must remain weapon index 11");
assert(balance.weaponProfiles[12]?.id === "weapon_sapgemWand", "Sapgem Wand must remain weapon index 12");
assert(balance.weaponProfiles[13]?.id === "weapon_tigerPaw", "Tiger Paw must remain weapon index 13");

// Incoming stale index 5 is neutralized and cannot attack/cut on the server.
assert(server.includes('const sanitizedWeaponIndex = [2, 3, 4, 5].includes(sanitizedWeaponIndexRaw) ? -1 : sanitizedWeaponIndexRaw;'), "server must still sanitize retired weapon index 5 to empty hands");
assert(server.includes('if (![0, 1, 8, 9, 10, 11, 12].includes(playerState.weaponIndex))'), "enemy melee validator must continue rejecting retired index 5");
assert(!server.includes('[0, 4, 5]'), "grass/flower melee validator still accepts retired index 5");

console.log("v436 retired old-sword purge regression check passed");
