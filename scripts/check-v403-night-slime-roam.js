"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const world = require("../public/shared/world-content.js");

assert.strictEqual(pkg.version, "0.6.11.429");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-429";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-429";'));
assert(html.includes('/game.js?v=429'));

assert(server.includes("if (slime.nightOnly && serverWorldIsNight())"));
assert(server.includes("slime.homeX = slime.x;"));
assert(server.includes("slime.homeY = slime.y;"));
assert(server.includes("chooseServerSlimeWanderTarget(slime);"));
assert(server.includes("dawn\n      // still uses the dedicated edge-retreat lifecycle above."));

console.log("v403 static check passed: active night slimes no longer return to their map-edge entry home; they roam locally and still use the dedicated dawn retreat.");
