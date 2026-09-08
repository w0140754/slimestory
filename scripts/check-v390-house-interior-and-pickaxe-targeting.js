"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const network = read("public", "client-network.js");
const topology = read("public", "shared", "structure-topology.js");

assert.strictEqual(pkg.version, "0.6.11.430");
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-430";'));
assert.strictEqual(world.version, 414);
assert.strictEqual(Object.keys(world.maps).length, 9, "v390 must preserve the active coordinate world");

assert(game.includes("const HOUSE_FOREGROUND_ALPHA = 0.34;"), "foreground wall fade alpha missing");
assert(topology.includes("foregroundBoundaryKeys: foregroundBoundaries"), "roof regions must classify foreground/south boundaries");
assert(game.includes("function structureIsForegroundRoofBoundary("), "foreground wall classification helper missing");
assert(game.includes("? alpha * (structure?.kind === \"woodDoor\" ? HOUSE_FOREGROUND_DOOR_ALPHA : HOUSE_FOREGROUND_ALPHA)"), "only the foreground boundary should fade while inside, with a more visible door");
assert(game.includes("if (inside) continue;"), "roof must be fully invisible while the player is inside");
assert(!game.includes("HOUSE_FACADE_ALPHA"), "old whole-facade fade constant should be retired");

assert(!game.includes('"PLACE ON FLOOR"'), "local PLACE ON FLOOR tip should be retired");
assert(!game.includes('"CONNECT TO BUILD"'), "local CONNECT TO BUILD tip should be retired");
assert(!network.includes('message.reason === "blocked" ? "BLOCKED"'), "server placement failures must remain quiet on the client");

assert(game.includes("function floorBelongsToCompletedRoof("), "completed-roof topology helper missing");
assert(!game.includes("if (!candidate || floorBelongsToCompletedRoof(candidate.floor)) return null;"), "roofed interiors must allow later partition placement");
assert(server.includes("function roofedFloorKeysOnMap("), "server authoritative roofed-floor detector missing");
assert(!server.includes('reason = "roofed";'), "server must not lock wall/door placement after a roof forms");

assert(game.includes("function playerStructurePickaxeTarget("), "shared Pickaxe target selector missing");
assert(game.includes("function drawPickaxeStructureTargetHighlight("), "Pickaxe target highlight renderer missing");
assert(game.includes('equippedWeapon() !== "pickaxe"'), "target highlight must only appear while Pickaxe is equipped");
assert(app.includes("drawPickaxeStructureTargetHighlight(renderCamera.x, renderCamera.y);"), "Pickaxe target highlight must be part of the render pass");
assert(game.includes("function playerStructurePickaxeTarget("), "Pickaxe target selector must remain shared by preview/attack code");

console.log("v390 retained house/build targeting checks passed: invisible interior roof, foreground-only fade, editable roofed interiors, and exact Pickaxe target highlighting.");
