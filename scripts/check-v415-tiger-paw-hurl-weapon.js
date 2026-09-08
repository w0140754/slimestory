"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const config = read("public/client-config.js");
const game = read("public/game.js");
const combat = read("public/client-combat.js");
const abilities = read("public/client-tiger-paw-actions.js");
const input = read("public/client-input.js");
const balance = read("public/shared/combat-balance.js");
const index = read("public/index.html");
const server = read("server.js");

assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-431";'));
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(game.includes('"weapon_tigerPaw"'));
assert(game.includes('"tigerPaw"'));
assert(game.includes('name: "Tiger Paw"'));
assert(game.includes('equipIndex: 13'));
assert(game.includes('ingredients: Object.freeze({ wood: 8, stone: 2 })'));
assert(game.includes('if (index === 13) return tigerPawImage;'));
assert(game.includes('if (style === "tigerPaw") return "Tiger Paw";'));
assert(balance.includes('id: "weapon_tigerPaw"'));
assert(balance.includes('name: "Tiger Paw"'));
assert(index.includes('data-owned-item="weapon_tigerPaw"'));
assert(index.includes('data-craft-recipe="tigerPaw"'));
assert(!index.includes('Hurl moved to Tiger Paw'), 'retired skill-migration UI copy should stay removed');
assert(!index.includes('data-skill-node="hurl"'));
assert(!index.includes('data-ability-id="hurl"'));

assert(combat.includes('if (currentWeapon === "tigerPaw")'));
assert(combat.includes('tryCastHurl();'));
assert(abilities.includes('if (equippedWeapon() !== "tigerPaw") return false;'));
assert(abilities.includes('return findNearestHurlableEnemy(maxDistance);'));
assert(abilities.includes('// v415 Tiger Paw throws carried mobs only.'));

// Throwable-rock Hurl compatibility is fully retired; Tiger Paw Hurl is mob-only.
const targetFn = abilities.slice(
  abilities.indexOf('function findNearestHurlableTarget('),
  abilities.indexOf('function sendHurlEnemyAction(')
);
assert(!targetFn.includes('findNearestHurlableRock'));
const throwFn = abilities.slice(
  abilities.indexOf('function tryThrowCarriedHurlObject('),
  abilities.indexOf('function startHurlReachAnimation(')
);
assert(!throwFn.includes('getLocalCarriedRock'));
assert(!throwFn.includes('sendHurlRockAction'));

assert(server.includes('const TIGER_PAW_WEAPON_INDEX = 13;'));
assert(server.includes('if (playerState.weaponIndex !== TIGER_PAW_WEAPON_INDEX) return;'));
assert(!server.includes('handleRockHurlAction'), 'retired rock Hurl handler must stay removed');
assert(!server.includes('\"rockMotion\"'), 'retired rockMotion protocol must stay removed');
assert(!server.includes('\"rockState\"'), 'retired rockState protocol must stay removed');
assert(server.includes('playerCarriesHurlEnemy('), 'current mob-only Hurl carry validation must remain');
assert(server.includes('clampInteger(source.weaponIndex, -1, TIGER_PAW_WEAPON_INDEX, -1)'));
assert(input.includes('weapon === "tigerPaw"'));
assert(input.includes('"MANUAL HURL"'));

console.log("v415 Tiger Paw OK: Hurl is item-driven, mob-only, server-authoritative, hotbar/crafting wired, and rock targeting is rejected.");
