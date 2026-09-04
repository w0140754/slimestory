const fs = require("fs");
const path = require("path");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const html = read("public", "index.html");
const balanceText = read("public", "shared", "combat-balance.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));
const pkg = require(path.join(root, "package.json"));
const readme = read("README.md");

assert(server.includes('const BUILD_VERSION = "6-11-373";'), "server build must be 6-11-373");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-373";'), "client build must be 6-11-373");
assert(pkg.version === "0.6.11.373", "package version must be 0.6.11.373");
assert(html.includes('/shared/combat-balance.js?v=373') && html.includes('/game.js?v=373'), "v336 cache keys missing");
assert(balanceText.includes('const VERSION = 29;'), "combat balance version must be 29");
assert(fs.existsSync(path.join(root, "public", "assets", "sapgem_wand_v4.png")), "current redrawn Sapgem sprite missing");
assert(game.includes('sapgemWandImage = loadImage("assets/sapgem_wand_v4.png?v=372")'), "current redrawn Sapgem sprite not wired");

const expected = [
  ["weapon_shepherdStaff", 10, "slow"],
  ["weapon_sapgemWand", 15, "normal"],
  ["weapon_lostKey", 20, "normal"],
  ["weapon_hugeSunflower", 25, "quick"]
];
for (const [id, magic, speed] of expected) {
  const p = balance.weaponProfiles.find(x => x.id === id);
  assert(p, `${id} profile missing`);
  assert(p.magicPower === magic, `${id} magicPower should be ${magic}`);
  assert(p.attackSpeed === speed, `${id} attack speed should remain ${speed}`);
}
const shopBlock = game.match(/const SHOP_ITEMS = \[([\s\S]*?)\n\];/);
assert(shopBlock && !shopBlock[1].includes('weapon_wand') && !shopBlock[1].includes('weapon_rainWand'), "retired Fire/Rain Wands must stay out of client shop");
assert(server.includes('const SHOP_VENDOR_CATALOGS = Object.freeze({'), "server vendor catalogs missing");
const vendorCatalogBlock = server.match(/const SHOP_VENDOR_CATALOGS = Object\.freeze\(\{([\s\S]*?)\n\}\);\n\nconst SHOP_ITEM_IDS/);
assert(vendorCatalogBlock && !vendorCatalogBlock[1].includes('weapon_wand') && !vendorCatalogBlock[1].includes('weapon_rainWand'), "retired Fire/Rain Wands must stay out of current vendor stock");
assert(readme.includes('## v6-11-336 — Sapgem rotation fix'), "README historical v336 changelog missing");
console.log("Wand power rescale + Sapgem redraw regression checks passed.");
