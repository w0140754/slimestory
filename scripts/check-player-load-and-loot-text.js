"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
function assert(ok, msg) { if (!ok) throw new Error(msg); }
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const editor = read("public", "map-editor.js");
const format = read("public", "shared", "map-draft-format.js");
const network = read("public", "client-network.js");
const world = read("public", "client-world.js");
assert(game.includes("function sharedDefaultPlayerLoadTarget()"), "global player load-target resolver missing");
assert(app.includes("activateMap(initialPlayerLoadTarget.mapId, initialPlayerLoadTarget.spawnId);"), "startup must use authored map + spawn loading target");
assert(editor.includes("Use as default loading position") && editor.includes("defaultPlayerSpawnId"), "editor default load-position control missing");
assert(format.includes("defaultPlayerSpawnId") && format.includes("does not match a player spawn"), "draft validation for default player spawn missing");
for (const text of ["+1 STONE", "+1 BLUE FLOWER", "+1 WHITE FLOWER", "+1 GOLD BUBBLE"]) assert(!network.includes(text), `pickup label still present: ${text}`);
assert(!world.includes("+1 FLW"), "offline flower pickup label still present");
console.log("Player load position + loot text cleanup checks passed.");
