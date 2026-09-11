"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const geometry = require(path.join(root, "public", "shared", "structure-geometry.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const game = read("public", "game.js");
const server = read("server.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");
const pkg = require(path.join(root, "package.json"));
assert.strictEqual(pkg.version, "0.6.11.471");

// v448 intentionally supersedes the v445 Short Stone Wall concept: the 16x16
// visual becomes a Stone Cube object and must no longer be a wall boundary.
assert.strictEqual(geometry.isBoundaryStructure({ kind: "stoneCube", x: 32, y: 32 }), false);
assert.strictEqual(topology.layerOf({ kind: "stoneCube", x: 32, y: 32 }), topology.LAYERS.OBJECT);
assert(game.includes('const BUILD_WALL_STRUCTURE_KINDS = Object.freeze(["woodWall", "stoneWall"]);'));
assert(server.includes('const BUILD_WALL_KINDS = Object.freeze(new Set(["woodWall", "stoneWall"]));'));
assert(!network.includes('["woodWall", "stoneWall", "stoneCube", "woodDoor"].includes(kind)'));

// The useful v445 content survives: one-Stone recipe and geometric stone roof.
assert(game.includes('stoneCube: Object.freeze({'));
assert(game.includes('resourceKey: "stoneCubes"'));
assert(server.includes('stoneCube: Object.freeze({ resourceKey: "stoneCubes", outputCount: 1, ingredients: Object.freeze({ stone: 1 }) })'));
assert(html.includes('data-craft-recipe="stoneCube"'));
assert(game.includes('const stoneRoofStructureImage = loadImage("assets/building/stone_roof_v445.png?v=445")'));
console.log("v445 compatibility check passed: its 16x16 stone content survives as v448 Stone Cube while boundary/roof semantics remain tall-wall-only.");
