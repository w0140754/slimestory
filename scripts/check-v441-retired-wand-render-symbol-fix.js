"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const game = read("public", "game.js");
const html = read("public", "index.html");
const server = read("server.js");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

// v438 removed the circular Wand cast pose state along with Fire/Rain casting.
// No drawPlayer branch may still reference that deleted local symbol.
assert(!game.includes("circularWandCastPose"),
  "dangling retired Wand cast-pose symbol survived in player rendering");

// Preserve the live unarmed and attack pose branches surrounding the cleanup.
assert(game.includes('} else if (!currentWeaponForPose && !attacking) {'));
assert(game.includes('if (attackFrame >= 0) {'));
assert(game.includes('if (wandAttackPoseActive) {'));
assert(game.includes('const WAND_WEAPON_TYPES = Object.freeze(["shepherdStaff", "lostKeyWand", "sunflowerWand", "sapgemWand"]);'));

console.log("v441 retired Wand render-symbol fix OK: deleted cast-pose state is no longer referenced and current basic Wand attack rendering remains.");
