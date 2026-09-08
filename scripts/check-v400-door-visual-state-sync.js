"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.431");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-431";'));
assert(html.includes('/game.js?v=431'));

// v399 made player proximity authoritative for enemy doorway collision.
assert(server.includes("const DOOR_SERVER_OPEN_DISTANCE = 14;"));
assert(server.includes("const DOOR_SERVER_OPEN_TANGENTIAL_DISTANCE = 12;"));
assert(server.includes("if (serverRefreshDoorPassageFromNearbyPlayer(structure, now)) return true;"));

// v400 makes the local visual state consume the matching proximity window,
// so enemies cannot cross a doorway that still looks closed to that player.
assert(game.includes("function localPlayerApproachOpensDoor(structure)"));
assert(game.includes("doorPerpendicularDistance(structure, player.x, player.y) <= DOOR_PASSAGE_DISTANCE"));
assert(game.includes("doorTangentialDistance(structure, player.x, player.y) <= 12"));
assert(game.includes("if (localPlayerApproachOpensDoor(structure)) return true;"));
assert(game.indexOf("if (localPlayerApproachOpensDoor(structure)) return true;") < game.indexOf("if (localDoorPassageActive(structure)) return true;"));

console.log("v400 door visual-state sync checks passed: local door animation now matches the server approach-open window used by enemy collision.");
