"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const combat = fs.readFileSync(path.join(root, "public/client-combat.js"), "utf8");
const scaling = require(path.join(root, "public/shared/ability-scaling.js"));

assert.strictEqual(scaling.hallucinationBlinkRangeAtLevel(1), 30);
assert.strictEqual(scaling.hallucinationBlinkRangeAtLevel(20), 60);

assert(server.includes("Goblins intentionally phase through decorative trees."));
assert(!server.includes("goblinTreeBases"));
assert(/function goblinPositionAllowed\([\s\S]*?return enemyMapPointAllowed\([\s\S]*?goblin/.test(server));

assert(combat.includes("const slashStartExtension = 8;"));
assert(combat.includes("const slashEndExtension = 2;"));
assert(combat.includes("const slashLength = 10 + slashStartExtension + slashEndExtension;"));
assert(combat.includes("(slashEndExtension - slashStartExtension) / 2"));

console.log("Goblin tree pass-through + Wand Mastery claw presentation checks passed.");
