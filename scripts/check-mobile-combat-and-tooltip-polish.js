"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const input = read("public", "client-input.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const html = read("public", "index.html");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.372");
assert(server.includes('const BUILD_VERSION = "6-11-372";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-372";'));
assert(html.includes('/client-input.js?v=372') && html.includes('/game.js?v=372'));

assert(config.includes('baseSpeed: 54'), "25% universal movement reduction missing");
assert(game.includes('Number(player.speed) || GAME_CONFIG.player.baseSpeed'), "stat sheet must show effective movement speed");
assert(game.includes('const WAND_MASTERY_REACH = 45;'), "client Spellshred reach must be 45");
assert(server.includes('distance > 45 + bodyRadius + reconciliationRangeGrace'), "server Spellshred reach must match");

assert(input.includes('function mobileTargetIsOnScreen('), "rendered-view target guard missing");
assert(input.includes('visibleOnly && !mobileTargetIsOnScreen(target)'), "Bow candidate visibility filtering missing");
assert(input.includes('function startMobileSmartBowAttack()'), "one-tap Bow smart shot missing");
assert(input.includes('if (startMobileSmartBowAttack()) return;'), "Bow ATK does not prefer smart targeting");
assert(input.includes('mobileTrackedBowEnemy = player.bowDrawing ? target.enemy : null'), "manual Bow target tracking missing");
assert(input.includes('weapon !== "bow",\n    weapon === "bow"'), "Bow AUTO must request visible-only targets");
assert(input.includes('armMobilePointTarget("bow")'), "manual point fallback must remain");

assert(game.match(/window\.matchMedia\("\(hover: none\) and \(pointer: coarse\)"\)\.matches/g)?.length >= 2, "touch hover-card guards missing");
assert(html.includes('.item-detail-tooltip.show,\n    .skill-detail-tooltip.show'), "touch tooltip CSS suppression missing");

assert.ok(adopted.version >= 68, "mobile polish must preserve current authored map data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must be preserved");

console.log("Mobile combat/tooltip polish checks passed: speed, reach, visible Bow targeting, and touch hover suppression.");
