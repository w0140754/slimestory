"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.427");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-427";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-427";'));
assert(html.includes('/game.js?v=427'));

// v399: the server must recognize the same near-door state the client already
// presents as open, so enemies can use the doorway before the player crosses it.
assert(server.includes("const DOOR_SERVER_OPEN_DISTANCE = 14;"));
assert(server.includes("const DOOR_SERVER_OPEN_TANGENTIAL_DISTANCE = 12;"));
assert(server.includes("function serverRefreshDoorPassageFromNearbyPlayer(structure, now = Date.now())"));
assert(server.includes("serverDoorPerpendicularDistance(structure, playerState.x, playerState.y) > DOOR_SERVER_OPEN_DISTANCE"));
assert(server.includes("serverDoorTangentialDistance(structure, playerState.x, playerState.y) > DOOR_SERVER_OPEN_TANGENTIAL_DISTANCE"));
assert(server.includes("playerDoorPassages.set(playerId, { doorId: structure.id, expiresAt: now + DOOR_PASSAGE_MS });"));
assert(server.includes("if (serverRefreshDoorPassageFromNearbyPlayer(structure, now)) return true;"));

// Enemy collision/line-of-effect must continue to consume shared authoritative
// door-open state rather than inventing an enemy-specific door opener.
assert(server.includes('structure.kind === "woodDoor" && serverDoorCurrentlyOpen(structure)'));
assert(server.includes('structure?.kind === "woodDoor" && !ignoreDoors && !serverDoorCurrentlyOpen(structure)'));

console.log("v399 door-approach sharing checks passed: player approach now authoritatively opens the shared doorway for waiting enemies before player crossing.");
