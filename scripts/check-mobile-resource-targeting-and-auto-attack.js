"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const html = read("public", "index.html");
const input = read("public", "client-input.js");
const app = read("public", "client-app.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const pkg = JSON.parse(read("package.json"));
const adopted = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.strictEqual(pkg.version, "0.6.11.359");
assert(server.includes('const BUILD_VERSION = "6-11-359";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-359";'));
assert(html.includes('/client-input.js?v=359') && html.includes('/client-app.js?v=359'));

assert(html.includes('id="mobileAutoAttackButton"'), "AUTO control missing");
assert(html.includes('aria-pressed="false">AUTO</button>'), "AUTO toggle semantics missing");
assert(html.includes('#mobileAutoAttackButton.active'), "AUTO active-state styling missing");

assert(input.includes('function mobileResourceTarget()'), "resource target selector missing");
assert(input.includes('weapon === "axe" && Array.isArray(trees)'), "Axe tree targeting missing");
assert(input.includes('tree.nonInteractive || tree.isStump || tree.falling'), "invalid trees must be skipped");
assert(input.includes('distance > currentMeleeReach() + trunkRadius'), "tree target must be in real chop range");
assert(input.includes('weapon === "pickaxe" && Array.isArray(rocks)'), "Pickaxe rock targeting missing");
assert(input.includes('distance > currentMeleeReach() + 7'), "rock target must be in real mining range");
assert(input.includes('mobileResourceTarget() || mobileEnemyTarget('), "resources must take priority for tool taps");

assert(input.includes('function updateMobileAutoAttack()'), "AUTO update missing");
assert(input.includes('weapon !== "bow"\n  );'), "melee AUTO must require actual hit range");
assert(input.includes('MOBILE_AUTO_ATTACK_BOW_DISTANCE = 150'), "Bow AUTO range cap missing");
assert(input.includes('mobileAutoBowTarget = target.target'), "Bow AUTO target tracking missing");
assert(input.includes('"AUTO OFF · NO ARROWS"'), "empty-ammo shutoff missing");
assert(input.includes('automatedDrawBlocked'), "automated Bow draw pause/cancel guard missing");
assert(input.includes('setMobileAutoAttackEnabled(false, { quiet: true });'), "focus/death safety shutoff missing");
assert(app.includes('repeatHeldPrimaryAttackIfReady();\n      updateMobileAutoAttack();'), "AUTO must run in gameplay command phase");

assert.strictEqual(adopted.version, 54, "mobile combat changes must preserve current authored world data");
assert(adopted.maps.waterfallGrove, "Waterfall Grove must be preserved");

console.log("Mobile resource targeting and optional in-range auto attack checks passed.");
