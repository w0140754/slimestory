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
const input = read("public", "client-input.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");
const balanceText = read("public", "shared", "combat-balance.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));

assert(pkg.version === "0.6.11.471", "package version must be 437");
assert(server.includes('const BUILD_VERSION = "6-11-471";'), "server build marker must be 437");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'), "client build marker must be 437");
assert(html.includes('/game.js?v=431e-471'), "game cache token must be 437");

// The three pre-current-game equipment items are no longer valid inventory/equipment tokens.
for (const token of ["weapon_wand", "weapon_rainWand", "weapon_katana"]) {
  for (const [name, source] of [["game", game], ["combat", combat], ["enemies", enemies], ["input", input], ["html", html], ["server", server], ["balance", balanceText]]) {
    assert(!source.includes(token), `${name} still contains retired item token ${token}`);
  }
}
for (const token of ["inventoryWandImg", "inventoryRainWandImg", "inventoryKatanaImg", "katanaImage", "rainWandImage"]) {
  assert(!game.includes(token) && !enemies.includes(token) && !html.includes(token), `retired art/UI token remains: ${token}`);
}
// wandImage specifically is retired held-item art and must not return.
assert(!game.includes("const wandImage ="), "retired Fire Wand embedded art remains");

// Preserve every post-legacy protocol index rather than collapsing the table.
assert(game.includes('const WEAPON_STYLES = ["sword", "axe", null, null, null, null, "bow", "bow", "shepherdStaff", "lostKeyWand", "sunflowerWand", "pickaxe", "sapgemWand", "tigerPaw"];'), "client weapon index holes/stable mapping missing");
assert(balance.version === 34, "combat-balance schema must be 34");
assert(balance.weaponProfiles.length === 14, "weapon profile table length must remain 14");
for (const index of [2, 3, 4, 5]) assert(balance.weaponProfiles[index] === null, `weapon profile slot ${index} must be inert`);
assert(balance.weaponProfiles[0]?.id === "weapon_sword", "Wood Sword index changed");
assert(balance.weaponProfiles[1]?.id === "weapon_axe", "Axe index changed");
assert(balance.weaponProfiles[6]?.id === "weapon_bow", "Wood Bow index changed");
assert(balance.weaponProfiles[7]?.id === "weapon_dreamcatcher", "Dreamcatcher index changed");
assert(balance.weaponProfiles[8]?.id === "weapon_shepherdStaff", "Shepherd Staff index changed");
assert(balance.weaponProfiles[9]?.id === "weapon_lostKey", "Tournesol index changed");
assert(balance.weaponProfiles[10]?.id === "weapon_hugeSunflower", "Tabatha's Key index changed");
assert(balance.weaponProfiles[11]?.id === "weapon_pickaxe", "Pickaxe index changed");
assert(balance.weaponProfiles[12]?.id === "weapon_sapgemWand", "Sapgem Wand index changed");
assert(balance.weaponProfiles[13]?.id === "weapon_tigerPaw", "Tiger Paw index changed");

// Old clients/saves cannot resurrect retired slots; current melee/harvest rules no longer special-case Katana.
assert(server.includes('const sanitizedWeaponIndex = [2, 3, 4, 5].includes(sanitizedWeaponIndexRaw) ? -1 : sanitizedWeaponIndexRaw;'), "server must sanitize retired indices 2-5");
assert(server.includes('if (![0, 1, 8, 9, 10, 11, 12].includes(playerState.weaponIndex))'), "server melee allowlist still includes retired weapons");
assert(!server.includes('[0, 4],'), "server harvest rules still include retired Katana");
assert(combat.includes('function currentMeleeReach() {\n  return SWORD_REACH;\n}'), "client melee reach still special-cases retired Katana");

console.log("v437 retired legacy weapon trio regression check passed");
