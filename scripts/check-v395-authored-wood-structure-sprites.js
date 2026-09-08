"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.strictEqual(buf.toString("hex", 0, 8), "89504e470d0a1a0a", `${file} must be PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const game = read("public", "game.js");
const assetRoot = path.join(root, "public", "assets", "building");
const floor = path.join(assetRoot, "wood_floor_v395.png");
const wall = path.join(assetRoot, "wood_wall_v395.png");
const door = path.join(assetRoot, "wood_door_v395.png");
const roof = path.join(assetRoot, "roof_v395.png");

for (const file of [floor, wall, door, roof]) assert(fs.existsSync(file), `missing ${file}`);
assert.deepStrictEqual(pngSize(floor), [16, 16]);
assert.deepStrictEqual(pngSize(wall), [16, 32]);
assert.deepStrictEqual(pngSize(door), [16, 32]);
assert.deepStrictEqual(pngSize(roof), [16, 16]);

assert(game.includes('const woodFloorStructureImage = loadImage("assets/building/wood_floor_v395.png?v=428");'));
assert(game.includes('const woodWallStructureImage = loadImage("assets/building/wood_wall_v395.png?v=428");'));
assert(game.includes('const woodDoorStructureImage = loadImage("assets/building/wood_door_v395.png?v=428");'));
assert(game.includes('const woodRoofStructureImage = loadImage("assets/building/roof_v395.png?v=428");'));

assert(game.includes("ctx.drawImage(image, x, y, 16, 16);"));
assert(game.includes("ctx.drawImage(woodWallStructureImage, left, top, 16, 32);"));
assert(game.includes("ctx.drawImage(woodDoorStructureImage, left, top, 16, 32);"));
assert(game.includes("ctx.drawImage(woodRoofStructureImage, x, y, 16, 16);"));
assert(game.includes("verticalWallHasUpperHorizontalJoin(structure)"));
assert(game.includes("ROOF_OVERHANG"));
assert(game.includes("structureFadeAlpha(structure, alpha)"));
assert(game.includes("doorVisuallyOpen(structure)"));

console.log("v395 authored wood structure sprite regression OK");
