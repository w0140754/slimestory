const fs = require("fs");
const path = require("path");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const html = read("public", "index.html");
const enemies = read("public", "client-enemies.js");
const server = read("server.js");
const balanceText = read("public", "shared", "combat-balance.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));
const pkg = require(path.join(root, "package.json"));
const readme = read("README.md");

assert(server.includes('const BUILD_VERSION = "6-11-353";'), "server build must be 6-11-353");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-353";'), "client build must be 6-11-353");
assert(pkg.version === "0.6.11.353", "package version must be 0.6.11.353");
assert(html.includes('/shared/combat-balance.js?v=353') && html.includes('/game.js?v=353'), "v336 cache keys missing");
assert(fs.existsSync(path.join(root, "public", "assets", "sapgem_wand_v3.png")), "Sapgem sprite missing");
assert(game.includes('sapgemWandImage = loadImage("assets/sapgem_wand_v3.png?v=347")'), "Sapgem asset is not loaded with v336 key");
assert(game.includes('"weapon_sapgemWand"') && game.includes('"sapgemWand"'), "Sapgem weapon id/style missing");
assert(game.includes('weapon_sapgemWand: "arcana"'), "Sapgem should use Arcana weapon requirement");
assert(html.includes('data-owned-item="weapon_sapgemWand"') && enemies.includes('inventorySapgemWandImg'), "Sapgem inventory UI missing");
assert(game.includes('currentWeapon === "sapgemWand"') && game.includes('? sapgemWandImage'), "Sapgem held sprite render missing");

const expected = [["weapon_shepherdStaff",5,10],["weapon_sapgemWand",6,15],["weapon_lostKey",7,20],["weapon_hugeSunflower",8,25]];
for (const [id, attack, magic] of expected) {
  const p = balance.weaponProfiles.find(x => x.id === id);
  assert(p, `${id} profile missing`);
  assert(p.attackPower === attack, `${id} attackPower should be ${attack}`);
  assert(p.magicPower === magic, `${id} magicPower should be ${magic}`);
}
const sapgem = balance.weaponProfiles.find(x => x.id === "weapon_sapgemWand");
assert(sapgem.attackSpeed === "normal", "Sapgem attack speed must be Normal");
assert(balance.weaponAttackSpeedLabel(12) === "Normal", "Sapgem shared attack-speed label must be Normal");
assert(balance.isWandWeaponIndex(12), "Sapgem index 12 must be treated as a wand");
assert(balanceText.includes('const VERSION = 27;'), "combat balance version must be 27");

const shopBlock = game.match(/const SHOP_ITEMS = \[([\s\S]*?)\n\];/);
assert(shopBlock, "client SHOP_ITEMS missing");
assert(!shopBlock[1].includes('weapon_wand') && !shopBlock[1].includes('weapon_rainWand'), "Fire/Rain Wand must be retired from client shop");
assert(shopBlock[1].includes('weapon_sapgemWand'), "Sapgem must be sold in client shop");
const serverShop = server.match(/const SHOP_ITEM_IDS = new Set\(\[([\s\S]*?)\n\]\);/);
assert(serverShop, "server SHOP_ITEM_IDS missing");
assert(!serverShop[1].includes('weapon_wand') && !serverShop[1].includes('weapon_rainWand'), "Fire/Rain Wand must be retired from server shop");
assert(serverShop[1].includes('weapon_sapgemWand'), "Sapgem must be authorized for server shop purchase");
assert(server.includes('SHOP_PURCHASE_HISTORY_ITEM_IDS') && server.includes('"weapon_wand"') && server.includes('"weapon_rainWand"'), "legacy Fire/Rain purchase-history compatibility missing");
assert(server.includes('weaponIndex: clampInteger(source.weaponIndex, -1, 12, -1)'), "server weapon index clamp must include Sapgem");
assert(readme.includes('## v6-11-334 — Sapgem Wand + wand progression cleanup'), "README historical v334 changelog missing");
console.log("Sapgem wand/shop retirement regression checks passed.");
