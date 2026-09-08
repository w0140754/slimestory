"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const network = read("public", "client-network.js");
const world = read("public", "client-world.js");
const fire = read("public", "client-fire-environment.js");

assert.strictEqual(pkg.version, "0.6.11.430");
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-430";'));

assert(!game.includes("selectedBuildOrientation"));
assert(!game.includes("rotateSelectedBuildPiece"));
assert(!input.includes("rotateSelectedBuildPiece"));
assert(network.includes("requestStructurePlacement(kind, x, y, edge = null, supportId = null)"));
assert(!network.includes("orientation = null"));
assert(!server.includes("structure.orientation"));
assert(!server.includes("message?.orientation"));

assert(server.includes('if (entity.removed || entity.depleted || entity.cut) continue;'), "cut grass must stop blocking building placement");
assert(server.includes('entity.cut = true;\n    entity.burnTime = 0;\n    entity.regrowAt = 0;'), "server sword-cut grass must remain cleared");
assert(!server.includes("scheduleGrassRegrow"), "normal grass must not schedule server regrowth");
assert(!server.includes("resetGrassToFresh"), "normal grass must not reset to fresh");
assert(!server.includes("GRASS_REGROW_MIN_MS") && !server.includes("GRASS_REGROW_MAX_MS"), "normal grass regrow timers must be retired");
assert(world.includes('if (clump.cut && !magicGrass) return;'), "cleared normal grass should draw nothing");
assert(world.includes('clump.cut = true;\n      clump.regrowAt = 0;'), "offline sword-cut grass must remain cleared");
assert(fire.includes('clump.cut = true;\n          clump.burnt = true;\n          clump.regrowAt = 0;'), "offline burned normal grass must remain cleared");
assert(!game.includes("scheduleLocalGrassRegrow"), "offline normal grass regrowth helper must be retired");

console.log("v382 building/permanent-grass checks passed: rotation removed and normal tall grass stays permanently cleared.");
