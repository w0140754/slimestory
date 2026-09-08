"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const combat = fs.readFileSync(path.join(root, "public/client-combat.js"), "utf8");

assert(server.includes("Goblins intentionally phase through decorative trees."));
assert(!server.includes("goblinTreeBases"));
assert(/function goblinPositionAllowed\([\s\S]*?return enemyMapPointAllowed\([\s\S]*?goblin/.test(server));

// Ordinary melee presentation remains crisp and single-target after retired
// mastery and bow-melee fallback paths were removed.
assert(combat.includes('tryHitEnemies("melee", 1);'));
assert(!combat.includes("wandMastery"));
assert(!combat.includes("executeBowMeleeAttack"));

console.log("Goblin tree pass-through + current single-target combat presentation checks passed.");
