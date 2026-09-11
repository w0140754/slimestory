"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.471");
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-471";'));
assert(html.includes('/game.js?v=431e-471'));

assert(server.includes('["woodDoor", "caveDoor"].includes(entity?.kind) || ["stoneCube", "cavernColumn"].includes(entity?.kind)'),
  "Pickaxe validation must ignore the targeted Stone Cube in its own line-of-effect trace");
assert(server.includes('if (ignoreStructureId && structure.id === ignoreStructureId) continue;'),
  "server line-of-effect must honor the target ignoreStructureId");

assert(game.includes('const caveDoorStructureImage = loadImage("assets/building/stone_cave_door_v451.png?v=451");'));
assert(game.includes('function drawNaturalCaveDoor(structure, camX, camY, alpha = 1) {'));
assert(game.includes('ctx.drawImage(caveDoorStructureImage, left, top, 16, 32);'));
assert(game.includes('if (structure.kind === "caveDoor" || structure.kind === "caveMouth") {'));
assert(game.includes('drawNaturalCaveDoor(structure, camX, camY)'));

console.log("v449 Stone Cube mining + cave-door regression passed: target cube self-occlusion is ignored and the new stone cave-door art is wired into cave rendering.");
