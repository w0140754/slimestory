"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const abilities = read("public", "client-abilities.js");

assert.strictEqual(pkg.version, "0.6.11.428");
assert(server.includes('const BUILD_VERSION = "6-11-428";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-428";'));

const declaration = game.indexOf("let selectedBuildPiece = null;");
const equipped = game.indexOf("function equippedWeapon()");
const updateHotbar = game.indexOf("function updateHotbar()");
assert(declaration >= 0, "selectedBuildPiece declaration missing");
assert(declaration < equipped, "selectedBuildPiece must initialize before equippedWeapon can run during startup");
assert(declaration < updateHotbar, "selectedBuildPiece must initialize before updateHotbar can run during startup");
assert.strictEqual((game.match(/let selectedBuildPiece = null;/g) || []).length, 1, "selectedBuildPiece should have one lexical declaration");

const activeHandlerStart = abilities.indexOf("function handleActiveSkillKeyDown(event, activeSkillKey)");
const activeHandlerEnd = abilities.indexOf("\n}\n", activeHandlerStart);
assert(activeHandlerStart >= 0 && activeHandlerEnd > activeHandlerStart, "active-skill compatibility hook missing");
const activeHandler = abilities.slice(activeHandlerStart, activeHandlerEnd + 3);
assert(activeHandler.includes("return false;"), "retired active-skill hook must remain inert");
assert(!activeHandler.includes('queueCommand("useActiveSkill"'), "unreachable retired active-skill queue code must stay removed");

console.log("v387 startup initialization checks passed: build-selection TDZ removed and retired active-skill dead code cleaned up.");
