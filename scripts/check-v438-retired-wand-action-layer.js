"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const html = read("public", "index.html");
const game = read("public", "game.js");
const actions = read("public", "client-actions.js");
const combat = read("public", "client-combat.js");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const fire = read("public", "client-fire-environment.js");
const network = read("public", "client-network.js");
const world = read("public", "client-world.js");
const protocol = read("public", "shared", "player-net-protocol.js");
const server = read("server.js");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471') && html.includes('/client-network.js?v=431e-471'));

// The two files whose only purpose was the retired Fire/Rain Wand action layer
// must be physically absent and no longer loaded by the browser.
assert(!fs.existsSync(path.join(root, "public", "client-wand-actions.js")));
assert(!fs.existsSync(path.join(root, "public", "shared", "action-balance.js")));
assert(!html.includes("client-wand-actions.js"));
assert(!html.includes("shared/action-balance.js"));

const retiredClientRuntime = [game, actions, combat, input, app, fire, network].join("\n");
for (const token of [
  "fireballAiming",
  "fireballAimTime",
  "rainCloudCasting",
  "rainCloudCastTime",
  "circularWandCastPose",
  "beginFireballAim",
  "releaseFireballAim",
  "cancelFireballAim",
  "beginRainCloudCast",
  "cancelRainCloudCast",
  "endLocalRainCloud",
  "updateFireballAim",
  "drawFireballTargeting",
  "drawRainCloudCastIndicator",
  "updateHotbarActionCooldownHud",
  "actionCooldowns",
  "rainWand"
]) {
  assert(!retiredClientRuntime.includes(token), `retired Wand client-action token survived: ${token}`);
}

// Historical action codes 4/5 stay retired without shifting the current Hurl
// action at code 6.
assert(!protocol.includes("FIREBALL_AIM"));
assert(!protocol.includes("RAIN_CAST"));
assert(protocol.includes("HURL_REACH: 6"));
assert(!server.includes("A.FIREBALL_AIM"));
assert(!server.includes("A.RAIN_CAST"));
assert(!network.includes("A.FIREBALL_AIM"));
assert(!network.includes("A.RAIN_CAST"));

// The old visual-effect ingress must not be accepted or rendered anymore.
for (const effect of ["fireballImpact", "rainCast"]) {
  assert(!network.includes(`message.effect === "${effect}"`), `retired client visual effect survived: ${effect}`);
  assert(!server.includes(`"${effect}",`), `retired server visual effect survived: ${effect}`);
}
assert(!network.includes('message.effect === "fireball"'));
assert(server.includes('const allowedEffects = new Set([\n    "basicProjectile",\n    "basicProjectileImpact",\n    "levelUp"'));

// Current magic weapons still use the generic basic-projectile path.
assert(game.includes('const WAND_WEAPON_TYPES = Object.freeze(["shepherdStaff", "lostKeyWand", "sunflowerWand", "sapgemWand"]);'));
assert(combat.includes("function isWandTypeWeapon("));
assert(combat.includes('"basicProjectile"'));
assert(network.includes('message.effect === "basicProjectile"'));
assert(server.includes('effect === "basicProjectile"'));

// The compact Rain Field registry/protocol was deliberately left for a later
// audit in v438 and was subsequently retired in v442 when it proved unreachable.
assert(!fs.existsSync(path.join(root, "public", "shared", "rain-field.js")));
assert(!world.includes("temporaryRainGrassFields"));
assert(!world.includes("applyTransientActionSnapshot"));
assert(!network.includes('message.type === "rainFieldDelta"'));
assert(!network.includes('message.type === "transientActionSnapshot"'));
assert(!server.includes('type:"rainFieldDelta"'));
assert(!server.includes("return { rainFields }"));

// Environmental fire remains live and independent of the retired Fireball UI.
assert(fire.includes("function spawnFireParticle("));
assert(fire.includes("function igniteGrass("));

console.log("v438 retired Wand action layer OK: obsolete Fire/Rain cast wiring is gone; current wands/Hurl/environmental fire remain and the later Rain Field backend stays retired.");
