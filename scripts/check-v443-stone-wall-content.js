"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));

const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.subarray(1, 4).toString("ascii"), "PNG", `${file} must be PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const authoredWall = path.join(root, "public", "assets", "building", "stone_wall_v443.png");
const sideWall = path.join(root, "public", "assets", "building", "stone_wall_side_v443.png");
const roof = path.join(root, "public", "assets", "building", "stone_roof_v443.png");
const icon = path.join(root, "public", "assets", "ui", "stone_wall.png");
assert.deepStrictEqual(pngDimensions(authoredWall), [16, 32]);
assert.deepStrictEqual(pngDimensions(sideWall), [4, 32]);
assert.deepStrictEqual(pngDimensions(roof), [16, 16]);
assert.deepStrictEqual(pngDimensions(icon), [16, 16]);
assert.strictEqual(sha256(authoredWall), "28f9474390e29bdeadd5ceddc0e014f74be9a7a4a7b7bc3c35d02b5b12e1824b",
  "the in-world Stone Wall must preserve the exact user-supplied 16x32 sprite bytes");

assert.strictEqual(topology.layerOf({ kind: "stoneWall" }), topology.LAYERS.BOUNDARY);
assert(geometry.isBoundaryStructure({ kind: "stoneWall", x: 16, y: 16, axis: "horizontal" }));
assert.deepStrictEqual(geometry.collisionRect({ kind: "stoneWall", x: 16, y: 16, axis: "horizontal" }, 2),
  { x: 8, y: 15, width: 16, height: 2 });

const enclosingStoneRoom = [
  { id: "floor", kind: "stoneFloor", x: 32, y: 32 },
  { id: "north", kind: "stoneWall", axis: "horizontal", x: 32, y: 24 },
  { id: "south", kind: "woodDoor", axis: "horizontal", x: 32, y: 40 },
  { id: "west", kind: "stoneWall", axis: "vertical", x: 24, y: 32 },
  { id: "east", kind: "stoneWall", axis: "vertical", x: 40, y: 32 }
];
assert.strictEqual(topology.automaticRoofRegions(enclosingStoneRoom, 16).length, 1,
  "Stone Walls must participate in the same enclosed-room/automatic-roof topology as Wood Walls");

assert(game.includes('stoneWalls: 0'));
assert(game.includes('stoneWalls: "stoneWall"'));
assert(game.includes('stoneWall: Object.freeze({'));
assert(game.includes('ingredients: Object.freeze({ stone: 1 })'));
assert(game.includes('const BUILD_WALL_STRUCTURE_KINDS = Object.freeze(["woodWall", "stoneWall"]);'));
assert(game.includes('function drawStoneWall(structure, camX, camY, alpha = 1)'));
assert(game.includes('const stoneWallStructureImage = loadImage("assets/building/stone_wall_v443.png?v=444")'));
assert(game.includes('const stoneWallStructureVariantImages = Object.freeze(['));
assert(game.includes('const stoneWallCapLeftVariantImages = Object.freeze(['));
assert(game.includes('const stoneWallCapRightVariantImages = Object.freeze(['));
assert(game.includes('const stoneWallCapBothVariantImages = Object.freeze(['));
assert(game.includes('const stoneWallSideStructureImage = loadImage("assets/building/stone_wall_side_v443.png?v=444")'));
assert(game.includes('const stoneWallSideCapTopStructureImage = loadImage("assets/building/stone_wall_side_cap_top_v444.png?v=444")'));
assert(game.includes('const stoneWallSideCapBottomStructureImage = loadImage("assets/building/stone_wall_side_cap_bottom_v444.png?v=444")'));
assert(game.includes('const stoneWallSideCapBothStructureImage = loadImage("assets/building/stone_wall_side_cap_both_v444.png?v=444")'));
assert(game.includes('const stoneRoofStructureImage = loadImage("assets/building/stone_roof_v445.png?v=445")'));
assert(game.includes('function stoneWallVariantIndex(structure) {'));
assert(game.includes('function stoneWallHorizontalImage(structure, leftNeighbor, rightNeighbor) {'));
assert(game.includes('function stoneWallSideImage(topNeighbor, bottomNeighbor, hasUpperJoin) {'));
assert(game.includes('solidWalls.every(kind => kind === "stoneWall") ? "stone" : "wood"'));
assert(game.includes('if (kind === "stoneWall") return Math.max(0, Number(player.stoneWalls) || 0);'));
assert(game.includes('else if (selectedBuildPiece === "stoneWall") drawStoneWall(preview'));

assert(html.includes('data-resource-key="stoneWalls" data-build-item="stoneWall"'));
assert(html.includes('id="inventoryStoneWallCount"'));
assert(html.includes('data-craft-recipe="stoneWall"'));
assert(html.includes('<span class="craft-cost-value">1</span>'));

assert(server.includes('const BUILD_WALL_KINDS = Object.freeze(new Set(["woodWall", "stoneWall"]));'));
assert(server.includes('message?.kind === "stoneWall" ? "stoneWall"'));
assert(server.includes('kind === "stoneWall" ? "stoneWalls"'));
assert(server.includes('stoneWall: Object.freeze({ resourceKey: "stoneWalls", outputCount: 1, ingredients: Object.freeze({ stone: 1 }) })'));
assert(server.includes('"woodFloors", "stoneFloors", "woodWalls", "stoneWalls", "stoneCubes", "stoneArches", "ropes", "woodDoors"'));
assert(server.includes('} else if (resource.kind === "stoneWall") {\n    playerState.stoneWalls += 1;'));
assert(server.includes('BUILD_WALL_KINDS.has(torchSupport.kind) ? "wall" : "floor"'));
assert(server.includes('if (!BUILD_WALL_KINDS.has(removedWall?.kind)) return [];'));
assert(server.includes('totalStoneWalls: playerState.stoneWalls'));

assert(network.includes('["woodWall", "stoneWall", "woodDoor", "caveDoor"].includes(kind)'));
assert(network.includes('if (Number.isFinite(message.totalStoneWalls)) player.stoneWalls'));
assert(network.includes('stoneWalls: "totalStoneWalls"'));

console.log("v443/v444 Stone Wall content check passed: exact authored wall sprite, organic visual variants, 1 Stone crafting, build/hotbar/save/drop/network/collision/roof parity with Wood Wall.");
