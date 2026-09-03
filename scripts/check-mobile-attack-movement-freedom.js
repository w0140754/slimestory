"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const config = read("public", "client-config.js");
const app = read("public", "client-app.js");
const combat = read("public", "client-combat.js");
const html = read("public", "index.html");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.360");
assert(server.includes('const BUILD_VERSION = "6-11-360";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-360";'));
assert(html.includes('/client-combat.js?v=360') && html.includes('/client-app.js?v=360'));

assert(config.includes('mobileBaseSpeedMultiplier: 0.85'), "15% mobile movement adjustment missing");
assert(app.includes('mobileControlsEnabled\n        ? GAME_CONFIG.player.mobileBaseSpeedMultiplier\n        : 1'), "mobile-only speed multiplier missing");
assert(combat.includes('mobileControlsEnabled ? 0 : player.attackDuration;'), "mobile attack root removal missing");
assert(app.includes('player.basicAttackMovementLockTime <= 0'), "desktop movement lock gate must remain");
assert(combat.includes('queueBasicAttackImpact(\n    currentWeapon,'), "active-frame attack timing must remain");

assert.strictEqual(adopted.version, 55, "movement tuning must preserve the newest authored world data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must be preserved");

console.log("Mobile attacks allow movement with a 15% mobile-only base-speed adjustment; desktop planting remains.");
