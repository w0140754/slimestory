"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const input = read("public", "client-input.js");
const game = read("public", "game.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.429");
assert(server.includes('const BUILD_VERSION = "6-11-429";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-429";'));
assert(html.includes('/client-input.js?v=429') && html.includes('/game.js?v=429'));

assert(input.includes("function updateMobilePrimaryActionButton()"), "contextual mobile primary button updater missing");
assert(input.includes('button.textContent = buildMode ? "PLACE" : "ATK";'), "mobile build mode must relabel ATK to PLACE");
assert(input.includes('button.setAttribute("aria-label", buildMode ? "Place building piece" : "Attack")'), "mobile action aria label must follow build mode");
assert(input.includes("if (mobileBuildModeActive()) {"), "mobile attack pointerdown must intercept build mode");
assert(input.includes('if (cursor && typeof tryPlaceSelectedBuildPieceAtWorld === "function") {') && input.includes("tryPlaceSelectedBuildPieceAtWorld(cursor.x, cursor.y);"), "PLACE must reuse canonical world-space build placement function");
assert(input.includes("const cursor = mobileBuildCursorWorldPoint();"), "PLACE must confirm the stored world-space build cursor");

const buildBranch = input.indexOf('if (mobileBuildModeActive()) {', input.indexOf('attack.addEventListener("pointerdown"'));
const combatAssist = input.indexOf("applyMobileCombatAssistAim()", buildBranch);
assert(buildBranch >= 0 && combatAssist > buildBranch, "build PLACE branch must run before mobile combat assist can retarget the pointer");

assert(game.includes('if (typeof updateMobilePrimaryActionButton === "function") updateMobilePrimaryActionButton();'), "build begin/cancel must refresh the mobile button label");
assert(html.includes("#mobileAttackButton.build-place-mode"), "PLACE mode visual state missing");

console.log("v396 mobile build PLACE button regression OK");
