"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const network = read("public/client-network.js");
const config = read("public/client-config.js");
const html = read("public/index.html");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.431");
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-431";'));
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(html.includes('/game.js?v=431'));
assert(server.includes('tigerPaw: Object.freeze({ ingredients: Object.freeze({ wood: 8, stone: 2 }), repeatable: true })'));
assert(server.includes('reason: "invalidRecipe"'));
assert(server.includes('type: "craftResult"'));
assert(network.includes('if (player.benchCraftPending === message.recipe)'));
assert(network.includes('updateCraftingUi();\n      return;'));

console.log("v416 Tiger Paw crafting guard OK: authoritative recipe exists and pending crafting always receives/handles a terminal result.");
