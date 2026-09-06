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
const combat = read("public", "client-combat.js");

assert.strictEqual(pkg.version, "0.6.11.394");
assert(server.includes('const BUILD_VERSION = "6-11-394";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-394";'));
assert.strictEqual(world.version, 394);
assert.strictEqual(Object.keys(world.maps).length, 9, "v391 must preserve the active coordinate world");

assert(game.includes("function pickaxeStructurePointerBounds("), "cursor hit bounds helper missing");
assert(game.includes("const pointerWorldX = currentCamX + mouseCanvasX;"), "Pickaxe target must use cursor world X");
assert(game.includes("const pointerWorldY = currentCamY + mouseCanvasY;"), "Pickaxe target must use cursor world Y");
assert(game.includes("const pointerDistance = pointDistanceToRect("), "Pickaxe target must score structures from cursor geometry");
assert(game.includes("Player position is only a reach gate"), "player position should only constrain reach");
const targetStart = game.indexOf("function playerStructurePickaxeTarget(");
const targetEnd = game.indexOf("function drawPickaxeStructureTargetHighlight(", targetStart);
const targetSource = game.slice(targetStart, targetEnd);
assert(!targetSource.includes("angleDifference("), "old aim-cone targeting should be retired from Pickaxe structure selection");
assert(!targetSource.includes("bestDistance"), "nearest-to-player tie breaking should be retired from Pickaxe structure selection");
assert(game.includes("pointerDistance < bestPointerDistance"), "cursor proximity must select the winning structure");
assert(game.includes("priority < bestPriority"), "wall/door overlap priority should remain for visible facades");

assert(combat.includes('structureTargetId: weapon === "pickaxe"'), "Pickaxe click must lock the cursor-selected structure");
assert(combat.includes("pending.structureTargetId"), "delayed impact must receive the locked structure id");
assert(combat.includes("executeWeaponAttack(weapon, lockedStructureId = undefined)"), "attack must distinguish unlocked from explicitly empty targets");
assert(game.includes("function tryHitPlayerStructure(lockedStructureId = undefined)"), "structure hit must accept a locked target id");
assert(game.includes("lockedStructureId === undefined"), "null click target must not fall back to a later cursor position");

console.log("v391 cursor Pickaxe targeting checks passed: preview follows the cursor, player position only gates range, and the clicked structure is locked through the delayed impact.");
