"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(read("public", "index.html").includes('/game.js?v=431e-471'));

const start = server.indexOf('if (structure.kind === "dugDirt") {');
const end = server.indexOf("// v406/v414:", start);
const handler = server.slice(start, end);
assert(start >= 0 && end > start);
assert(handler.includes('reason: "useDirt"'));
assert(!handler.includes("removeAnyStructure("));
assert(!handler.includes("spawnSharedResource("));

console.log("v468 persistent shallow Dirt check passed.");
