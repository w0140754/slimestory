"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const pkg = JSON.parse(read("package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'), "v434 runtime cache token missing");

// The pre-v424 five-slot/equipment hotbar remapper is retired.
assert(!game.includes("legacyFiveSlotHotbar"), "retired five-slot migration flag survived");
assert(!game.includes("index - 3"), "retired physical-key hotbar offset survived");
assert(!game.includes("v376 equipment lived on physical keys 4-8"), "retired migration comment survived");
assert(!game.includes("positions during the one-time migration into the unified number-key belt"), "retired migration path survived");

// Current saves remain a direct ten-slot 1-0 assignment array.
assert(game.includes("HOTBAR_SLOT_COUNT = 10"), "modern hotbar must stay ten slots");
assert(game.includes(`hotbarAssignments: Array.from(
      { length: HOTBAR_SLOT_COUNT },`), "save must persist all ten assignments");
assert(game.includes("const savedItemId = savedHotbarAssignments[index] || null;"), "restore must read modern slots directly by index");
assert(game.includes('const itemId = savedItemId === "stoneShortWall" ? "stoneCube" : savedItemId;'), "v448 may only rename the retired short-wall item in-place without remapping physical slots");
assert(game.includes("sanitizeHotbarAssignments();"), "restored assignments must still be sanitized");

// Brand-new characters still receive the current starter belt independently.
assert(game.includes(`items: {
    weapon_sword: 1,
    weapon_pickaxe: 1,
    weapon_axe: 1
  }`), "starter items changed");
assert(game.includes(`hotbarAssignments: [
    "weapon_sword", "weapon_pickaxe", "weapon_axe", null, null, null, null, null, null, null
  ]`), "starter 1-3 hotbar loadout changed");

console.log("v434 retired five-slot hotbar migration purge regression check passed");
