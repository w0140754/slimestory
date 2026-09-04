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

assert(server.includes('const BUILD_VERSION = "6-11-367";'), "server build must be 6-11-367");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-367";'), "client build must be 6-11-367");
assert(pkg.version === "0.6.11.367", "package version must be 0.6.11.367");
assert(html.includes('/shared/combat-balance.js?v=367') && html.includes('/game.js?v=367'), "v336 cache keys missing");
assert(balanceText.includes('const VERSION = 28;'), "combat balance version must be 28");
assert(fs.existsSync(path.join(root, "public", "assets", "sapgem_wand_v4.png")), "current redrawn Sapgem sprite missing");
assert(game.includes('sapgemWandImage = loadImage("assets/sapgem_wand_v4.png?v=367")'), "current redrawn Sapgem sprite not wired");

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
const serverShop = server.match(/const SHOP_ITEM_IDS = new Set\(\[([\s\S]*?)\n\]\);/);
assert(serverShop && !serverShop[1].includes('weapon_wand') && !serverShop[1].includes('weapon_rainWand'), "retired Fire/Rain Wands must stay out of server shop");
assert(readme.includes('## v6-11-336 — Sapgem rotation fix'), "README historical v336 changelog missing");
console.log("Wand power rescale + Sapgem redraw regression checks passed.");
