"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.strictEqual(pkg.version, "0.6.11.468");
assert(game.includes("const extensionTop = top + 15;"), "Rope extension must overlap its primary segment");
assert(game.includes("const extensionHeight = 14;"), "Rope extension must stop inside the pit boundary");
assert(game.includes("if (underground && dy < 9) continue;"), "underground exit must require the Rope base");
assert(game.includes("function spawnGroundDigBurst(x, y, openedHole = false) {"));
assert(game.includes("if (requested) spawnGroundDigBurst(x, y, false);"));
assert(game.includes("spawnGroundDigBurst(structure.x, structure.y, structure.kind === \"dugPit\");"));

console.log("v464 Rope/base/dig polish check passed.");
