"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const game = read("public", "game.js");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(read("public", "index.html").includes('/game.js?v=431e-471'));

assert(server.includes("function excavationAtBuildCell(mapId, x, y) {"));
assert(server.includes("else if (excavationAtBuildCell(playerState.mapId, floorX, floorY)) reason = \"blocked\";"));
assert(game.includes("function excavationAtBuildCell(x, y) {"));
assert(game.includes("if (!buildPlacementWithinRange(x, y) || excavationAtBuildCell(x, y) || cavernColumnAtBuildCell(x, y)) return true;"));
assert(game.includes("Boolean(floor) && !occupied && !excavationAtBuildCell(x, y) && !cavernColumnAtBuildCell(x, y)"));
assert(game.includes("valid: !occupied && !excavationAtBuildCell(x, y) && !cavernColumnAtBuildCell(x, y)"));

const ropeBranch = server.slice(server.indexOf('if (message?.kind === "rope") {'), server.indexOf("const kind = message?.kind", server.indexOf('if (message?.kind === "rope") {')));
assert(ropeBranch.includes('structure?.kind === "dugPit"'));
assert(ropeBranch.includes("!structure?.ropePlaced"));

console.log("v469 excavation placement guard check passed.");
