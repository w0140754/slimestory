"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));
const game = read("public", "game.js");
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

assert.deepStrictEqual(
  geometry.stoneCubeFootprintRect({ kind: "stoneCube", x: 80, y: 96 }),
  { x: 74, y: 98, width: 12, height: 6 },
  "Stone Cube physical collision must occupy only the lower/base footprint"
);
assert.strictEqual(geometry.stoneCubeFootprintRect({ x: NaN, y: 96 }), null);

const drawStart = game.indexOf('function drawStoneCube(structure, camX, camY, alpha = 1) {');
const drawEnd = game.indexOf('\nfunction roofRegionIsNaturalCave', drawStart);
assert(drawStart >= 0 && drawEnd > drawStart, "drawStoneCube function missing");
const drawCube = game.slice(drawStart, drawEnd);
assert(drawCube.includes('const top = sy - 8;'), "cube sprite must fill its selected 16x16 world cell");
assert(drawCube.includes('localForegroundOcclusionAlpha('), "cube must use the universal local foreground-occlusion rule");
assert(!drawCube.includes('structureFadeAlpha'), "cube must not inherit wall facade fading");

assert(game.includes('addDrawable(drawables, Number(structure.y) + 8, () => drawStoneCube(structure, camX, camY));'),
  "cube draw sorting must use its lower/base edge");
assert(game.includes('const rect = STRUCTURE_GEOMETRY.stoneCubeFootprintRect(structure);'),
  "client movement/line-of-effect must use the canonical cube footprint");
assert(server.includes('return STRUCTURE_GEOMETRY.stoneCubeFootprintRect(structure);'),
  "server movement/line-of-effect must use the same canonical cube footprint");
assert(!server.includes('y: Number(structure.y) - 14, width: 14, height: 14'),
  "old full-sprite cube collision must stay retired");

assert(game.includes('top: Number(structure.y) - 8,\n      right: Number(structure.x) + 8,\n      bottom: Number(structure.y) + 8'),
  "Pickaxe pointer target must follow the re-anchored visible cube");
assert(game.includes('const top = Math.round(Number(structure.y) - camY - 9);'),
  "Pickaxe highlight must follow the re-anchored cube sprite");
assert(game.includes('const y = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;'),
  "Stone Cube placement must remain centered on the 16px build grid");

console.log("v450 Stone Cube object anchoring check passed: cell-aligned sprite, lower-footprint collision, base-edge depth sorting, universal foreground occlusion, and matching Pickaxe targeting are wired client/server.");
