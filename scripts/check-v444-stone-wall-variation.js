"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const pkg = require(path.join(root, "package.json"));
const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(html.includes('/game.js?v=431e-468'));

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.subarray(1, 4).toString("ascii"), "PNG", `${file} must be PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

const buildingDir = path.join(root, "public", "assets", "building");
const expectedAssets = [
  ["stone_wall_variant_2_v444.png", [16, 32]],
  ["stone_wall_variant_3_v444.png", [16, 32]],
  ["stone_wall_cap_left_variant_1_v444.png", [16, 32]],
  ["stone_wall_cap_left_variant_2_v444.png", [16, 32]],
  ["stone_wall_cap_left_variant_3_v444.png", [16, 32]],
  ["stone_wall_cap_right_variant_1_v444.png", [16, 32]],
  ["stone_wall_cap_right_variant_2_v444.png", [16, 32]],
  ["stone_wall_cap_right_variant_3_v444.png", [16, 32]],
  ["stone_wall_cap_both_variant_1_v444.png", [16, 32]],
  ["stone_wall_cap_both_variant_2_v444.png", [16, 32]],
  ["stone_wall_cap_both_variant_3_v444.png", [16, 32]],
  ["stone_wall_side_cap_top_v444.png", [4, 32]],
  ["stone_wall_side_cap_bottom_v444.png", [4, 32]],
  ["stone_wall_side_cap_both_v444.png", [4, 32]]
];
for (const [file, dims] of expectedAssets) {
  assert.deepStrictEqual(pngDimensions(path.join(buildingDir, file)), dims, `${file} dimensions`);
}

assert(game.includes('return hash % stoneWallStructureVariantImages.length;'));
assert(game.includes('if (!leftNeighbor && !rightNeighbor) return stoneWallCapBothVariantImages[variantIndex];'));
assert(game.includes('if (!leftNeighbor) return stoneWallCapLeftVariantImages[variantIndex];'));
assert(game.includes('if (!rightNeighbor) return stoneWallCapRightVariantImages[variantIndex];'));
assert(game.includes('const leftInset = leftNeighbor ? 0 : 5;'));
assert(game.includes('const rightInset = rightNeighbor ? 0 : 5;'));
assert(game.includes('const image = stoneWallSideImage(topNeighbor, bottomNeighbor, cornerExtension > 0);'));

console.log("v444 Stone Wall variation check passed: deterministic texture variants plus organic end-cap assets are wired into drawStoneWall without changing build topology.");
