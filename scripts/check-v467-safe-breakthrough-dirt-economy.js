"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const game = read("public", "game.js");
const html = read("public", "index.html");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

assert(server.includes("function undergroundShaftHasUsableLanding(mapId, x, y) {"));
assert(server.includes("const baseY = Number(y) + BUILD_GRID_SIZE;"));
assert(server.includes("undergroundShaftHasUsableLanding(undergroundMapId, x, y)"));
assert(server.includes("A real hole displaces exactly one reusable Dirt block"));
assert(server.includes('ownerId: playerId'));

const shallowStart = server.indexOf('if (structure.kind === "dugDirt") {');
const shallowEnd = server.indexOf("// v406/v414:", shallowStart);
const shallowHandler = server.slice(shallowStart, shallowEnd);
assert(shallowStart >= 0 && shallowEnd > shallowStart);
assert(!shallowHandler.includes("spawnSharedResource("), "shallow patches must not award Dirt");
assert(game.includes("Recovered from a breakthrough hole."));

console.log("v467 safe breakthrough + one-for-one Dirt economy check passed.");
