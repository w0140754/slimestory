const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");
const server = read("server.js");
const config = read("public", "client-config.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));
const pkg = JSON.parse(read("package.json"));
const mapOverride = JSON.parse(read("content", "adopted-map-overrides.json"));

assert(server.includes('const BUILD_VERSION = "6-11-379";'), "server build must be 6-11-379");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-379";'), "client build must be 6-11-379");
assert.strictEqual(pkg.version, "0.6.11.379", "package version must be 0.6.11.379");
assert(html.includes('/game.js?v=379') && html.includes('/client-enemies.js?v=379'), "Greencap build cache keys missing");

for (const file of [
  "greencap_cap_v1.png",
  "greencap_torso_v1.png",
  "greencap_leftarm_v1.png",
  "greencap_rightarm_v1.png",
  "greencap_leftleg_v1.png",
  "greencap_rightleg_v1.png",
  path.join("ui", "greencap_shirt_preview.png"),
  path.join("ui", "greencap_pants_preview.png")
]) {
  assert(fs.existsSync(path.join(root, "public", "assets", file)), `missing Greencap asset ${file}`);
}

assert(game.includes('const HAT_STYLES = ["original", "blueCap", "wizardHat", "jesterHat", "ninjaHat", "knightHat", "bandanaHat", "rangerHat", "woodHat", "arcanistHat", "greencapHat"];'), "Greencap hat style must append after legacy indices");
assert(game.includes('const SHIRT_STYLES = ["traveler", "jester", "ninja", "knight", "ranger", "wood", "arcanist", "greencap"];'), "Greencap shirt style must append after legacy indices");
assert(game.includes('const PANTS_STYLES = ["traveler", "jester", "ninja", "knight", "ranger", "wood", "arcanist", "greencap"];'), "Greencap pants style must append after legacy indices");

for (const id of ["hat_greencap", "shirt_greencap", "pants_greencap"]) {
  assert(game.includes(`${id}: Object.freeze({ level: 5 })`), `${id} must require level 5`);
  assert(!game.match(new RegExp(`${id}:\\s*"(?:might|arcana|precision|guile)"`)), `${id} must remain common/classless`);
  assert(server.includes(`"${id}"`), `${id} must be server-authorized for shop purchase`);
  assert(html.includes(`data-owned-item="${id}"`), `${id} must appear in inventory/equipment UI`);
}

assert(game.includes('if (style === "greencapHat") return "Greencap Cap";'), "Greencap Cap display name missing");
assert(game.includes('if (style === "greencap") return "Greencap Tunic";'), "Greencap Tunic display name missing");
assert(game.includes('if (style === "greencap") return "Greencap Pants";'), "Greencap Pants display name missing");
const shopItemsBlock = (game.match(/const SHOP_ITEMS = \[([\s\S]*?)\n\];/) || ["", ""])[1];
assert(!shopItemsBlock.includes("greencap"), "Greencap must remain unavailable from current class shops");
assert(game.includes('if (index === 10) return sprite.greencapHat;'), "Greencap head rendering missing");
assert(game.includes('? sprite.greencapTorso'), "Greencap torso rendering missing");
assert(game.includes('? sprite.greencapLeftLeg') && game.includes('? sprite.greencapRightLeg'), "Greencap leg rendering missing");
assert(enemies.includes('inventoryGreencapHatImg') && enemies.includes('equipGreencapPantsImg'), "Greencap UI image wiring missing");

assert.strictEqual(balance.version, 29, "combat balance revision must be 29");
assert.strictEqual(balance.armorDefense.hats[10], 2, "Greencap Cap armor must be 2");
assert.strictEqual(balance.armorResist.hats[10], 2, "Greencap Cap resist must be 2");
assert.strictEqual(balance.armorDefense.shirts[7], 3, "Greencap Tunic armor must be 3");
assert.strictEqual(balance.armorResist.shirts[7], 2, "Greencap Tunic resist must be 2");
assert.strictEqual(balance.armorDefense.pants[7], 2, "Greencap Pants armor must be 2");
assert.strictEqual(balance.armorResist.pants[7], 2, "Greencap Pants resist must be 2");

assert(server.includes('hatIndex: clampInteger(payload.hatIndex, -1, 10, -1)'), "Hallucination head index sanitizer must accept Greencap");
assert(server.includes('shirtIndex: clampInteger(payload.shirtIndex, -1, 7, -1)'), "Hallucination shirt index sanitizer must accept Greencap");
assert(server.includes('pantsIndex: clampInteger(payload.pantsIndex, -1, 7, -1)'), "Hallucination pants index sanitizer must accept Greencap");
assert(server.includes('hatIndex: clampInteger(source.hatIndex, -1, 10, -1)'), "player sync head index sanitizer must accept Greencap");
assert(server.includes('shirtIndex: clampInteger(source.shirtIndex, -1, 7, -1)'), "player sync shirt index sanitizer must accept Greencap");
assert(server.includes('pantsIndex: clampInteger(source.pantsIndex, -1, 7, -1)'), "player sync pants index sanitizer must accept Greencap");

assert.ok(mapOverride.version >= 68, "live editor-authored world data must not regress below revision 68");
console.log("Greencap armor regression checks passed.");
