"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const server = read("server.js");
const worldSource = read("public", "shared", "world-content.js");
const pkg = require(path.join(root, "package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(read("public", "index.html").includes('/game.js?v=431e-471'));

const oldSeed = process.env.SLIME_STORY_WORLD_SEED;
process.env.SLIME_STORY_WORLD_SEED = "0";
const worldPath = path.join(root, "public", "shared", "world-content.js");
delete require.cache[require.resolve(worldPath)];
const world = require(worldPath);
if (oldSeed === undefined) delete process.env.SLIME_STORY_WORLD_SEED; else process.env.SLIME_STORY_WORLD_SEED = oldSeed;
const underground = Object.values(world.maps).filter(map => map.subterranean);
assert.strictEqual(underground.length, 9);
for (const map of underground) {
  const columns = map.structures.filter(structure => structure.kind === "cavernColumn");
  assert(columns.length >= 300 && columns.length <= 650, `${map.name} needs a solid but carved column field`);
  assert.strictEqual(map.terrain.defaultType, "stone");
  assert(!map.structures.some(structure => structure.undergroundShell && structure.kind === "stoneWall"));
  assert(columns.every(column => column.worldGenerated && column.undergroundColumn));
  assert.strictEqual(new Set(columns.map(column => column.id)).size, columns.length);
}

assert(worldSource.includes("kind: 'cavernColumn'"));
assert(worldSource.includes(":cavern-column:${cx}:${cy}`"));
assert(game.includes("function drawCavernColumn("));
assert(game.includes("function cavernColumnFootprintRect("));
assert(game.includes('structure.kind === "cavernColumn"'));
assert(game.includes('structure?.kind === "cavernColumn" ||'));
assert(server.includes("function cavernColumnIsExposed(mapId, structure)"));
assert(server.includes('if (structure.kind === "cavernColumn") {'));
assert(server.includes('reason: "minedCavernColumn"'));
assert(server.includes('spawnSharedResource(removedColumn.mapId, "stone"'));
assert(server.includes('structure?.kind === "cavernColumn" &&'));

console.log("v471 destructible Cavern Column check passed.");
