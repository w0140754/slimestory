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

// v438 deleted the retired Fire/Rain action cooldown HUD helpers. No live
// hotbar render path may continue to call the removed slot helper.
assert(!game.includes("updateHotbarActionCooldownSlot"),
  "dangling retired Wand hotbar cooldown helper survived");
assert(!game.includes("updateHotbarActionCooldownHud"),
  "retired Wand cooldown HUD helper survived");
assert(!game.includes("hotbarActionIdForItemId"),
  "retired Wand hotbar action mapper survived");

// Preserve the modern hotbar contracts that surround the deleted call.
assert(game.includes("function updateHotbar()"));
assert(game.includes("sanitizeHotbarAssignments();"));
assert(game.includes('slot.classList.toggle("active"'));
assert(game.includes('slot.querySelector(".utility-count")'));
assert(game.includes("hotbarItemInventoryCount(itemId)"));
assert(game.includes('slot.style.opacity = assigned ? (available ? "1" : "0.5") : "0.48";'));

console.log("v440 retired Wand dangling-reference fix OK: no deleted cooldown helper remains in the live hotbar path.");
