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

assert.strictEqual(pkg.version, "0.6.11.372");
assert(server.includes('const BUILD_VERSION = "6-11-372";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-372";'));
assert(html.includes('/client-combat.js?v=372') && html.includes('/client-app.js?v=372'));

assert(config.includes('baseSpeed: 54'), "25% universal movement adjustment missing");
assert(!config.includes('mobileBaseSpeedMultiplier'), "movement reduction must not remain mobile-only");
assert(combat.includes('player.basicAttackMovementLockTime = 0;'), "universal attack root removal missing");
assert(!app.includes('player.basicAttackMovementLockTime <= 0'), "desktop attack root gate must be removed");
assert(combat.includes('queueBasicAttackImpact(\n    currentWeapon,'), "active-frame attack timing must remain");

assert.ok(adopted.version >= 68, "movement tuning must preserve the newest authored world data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must be preserved");

console.log("Desktop and mobile attacks allow movement at the shared 54 px/s base speed.");
