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
assert(html.includes('/game.js?v=431e-471'), "v435 runtime cache token missing");

// The old tutorial-era restore shim must stay retired.
assert(!game.includes("Bring every migrated character up to the current starter loadout"), "retired starter migration comment survived");
assert(!game.includes('for (const starterItemId of ["weapon_sword", "weapon_pickaxe", "weapon_axe"])'), "retired restore-time starter grant survived");
assert(!game.includes('player.items[starterItemId] = Math.max(1'), "retired restore-time item recreation survived");

// Save restore now respects the saved owned-item dictionary directly.
assert(game.includes("player.items = validSavedItemIds(save.items);"), "modern item restore contract changed");

// New-character starter ownership and belt remain independent of save migration.
assert(game.includes(`items: {
    weapon_sword: 1,
    weapon_pickaxe: 1,
    weapon_axe: 1
  }`), "new-character starter items changed");
assert(game.includes(`hotbarAssignments: [
    "weapon_sword", "weapon_pickaxe", "weapon_axe", null, null, null, null, null, null, null
  ]`), "new-character starter hotbar changed");

console.log("v435 retired starter-kit save migration purge regression check passed");
