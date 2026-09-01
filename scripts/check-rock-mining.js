"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

function pngSize(rel) {
  const data = fs.readFileSync(path.join(root, rel));
  assert.strictEqual(data.toString("ascii", 1, 4), "PNG", `${rel} is not a PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

for (const rel of [
  "public/assets/rock_plain.png",
  "public/assets/rock_grass.png",
  "public/assets/rock_crack_1.png",
  "public/assets/rock_crack_2.png",
  "public/assets/rock_lootable.png",
  "public/assets/pickaxe_v6.png"
]) {
  assert.deepStrictEqual(pngSize(rel), { width: 16, height: 16 }, `${rel} must stay native 16x16`);
}
assert.deepStrictEqual(
  pngSize("public/assets/grassyrock.png"),
  { width: 16, height: 18 },
  "scenery rock must be the updated 16x18 sprite"
);

const server = read("server.js");
const game = read("public/game.js");
const world = read("public/client-world.js");
const network = read("public/client-network.js");
const combat = read("public/client-combat.js");
const balance = read("public/shared/combat-balance.js");
const html = read("public/index.html");

assert.match(server, /action === "hitRock"/);
assert.match(server, /damageServerRock\(entity, 1, playerId, "mining"\)/);
assert.match(server, /spawnSharedResource\([\s\S]*?"stone"/);
assert.match(server, /damageServerRock\(rock, 1, attackerId, "hurl"\)/);
assert.match(server, /ROCK_REGROW_MIN_MS/);
assert.match(game, /const SHOP_ITEMS = \[[\s\S]*\{ id: "weapon_pickaxe", name: "Pickaxe" \}/);
assert.match(game, /function tryHitRock\(/);
assert.match(combat, /weapon === "pickaxe"/);
assert.match(balance, /id: "weapon_pickaxe"/);
assert.match(world, /rockCrackOneImage/);
assert.match(world, /rockCrackTwoImage/);
assert.match(network, /message\.totalStone/);
assert.match(html, /inventoryStoneCount/);
assert.match(html, /inventoryPickaxeImg/);
assert.match(html, /miningLevelText/);


assert.match(server, /const RESOURCE_REGROW_CLEAR_RADIUS = 96;/);
assert.match(server, /function livingPlayerNearRockHome\(entity, radius = RESOURCE_REGROW_CLEAR_RADIUS\)/);
assert.match(server, /if \(!livingPlayerNearRockHome\(entity\)\) \{\s*resetRockToFresh\(entity\);/);
console.log("Rock mining OK: 3-hit cracks, Stone loot, Hurl wear, respawn, Pickaxe, and 18px scenery rock are wired.");

