"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));

const server = read("server.js");
const config = read("public", "client-config.js");
const html = read("public", "index.html");
const game = read("public", "game.js");

assert.strictEqual(pkg.version, "0.6.11.424");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-424";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-424";'));
assert(html.includes('/shared/structure-topology.js?v=424'));
assert(html.indexOf('/shared/structure-topology.js?v=424') < html.indexOf('/game.js?v=424'));
assert(server.includes('const STRUCTURE_TOPOLOGY = require("./public/shared/structure-topology.js");'));
assert(server.includes('STRUCTURE_TOPOLOGY.roofedFloorKeys(structuresOnMap(mapId), BUILD_GRID_SIZE)'));
assert(game.includes('STRUCTURE_TOPOLOGY.automaticRoofRegions('));

assert.strictEqual(topology.VERSION, 2);
assert.strictEqual(topology.layerOf({ kind: "woodFloor" }), topology.LAYERS.SURFACE);
assert.strictEqual(topology.layerOf({ kind: "woodWall" }), topology.LAYERS.BOUNDARY);
assert.strictEqual(topology.layerOf({ kind: "woodDoor" }), topology.LAYERS.BOUNDARY);
assert.strictEqual(topology.layerOf({ kind: "torch", mountType: "wall" }), topology.LAYERS.ATTACHMENT);
assert.strictEqual(topology.layerOf({ kind: "torch", mountType: "floor" }), topology.LAYERS.OBJECT);
assert.strictEqual(topology.layerOf({ kind: "table" }), topology.LAYERS.OBJECT);

const floorA = { id: "floor:a", kind: "woodFloor", x: 32, y: 32 };
const floorB = { id: "floor:b", kind: "woodFloor", x: 48, y: 32 };
const enclosing = [
  floorA,
  floorB,
  { id: "north:a", kind: "woodWall", axis: "horizontal", x: 32, y: 24 },
  { id: "north:b", kind: "woodWall", axis: "horizontal", x: 48, y: 24 },
  { id: "south:a", kind: "woodWall", axis: "horizontal", x: 32, y: 40 },
  // Doors count as a closed structural boundary for automatic-roof topology.
  { id: "south:b", kind: "woodDoor", axis: "horizontal", x: 48, y: 40 },
  { id: "west", kind: "woodWall", axis: "vertical", x: 24, y: 32 },
  { id: "east", kind: "woodWall", axis: "vertical", x: 56, y: 32 }
];

let regions = topology.automaticRoofRegions(enclosing, 16);
assert.strictEqual(regions.length, 1, "closed wall/door loop must create a roof region");
assert.deepStrictEqual([...regions[0].floorKeys].sort(), ["32,32", "48,32"]);

// The v411 regression: adding a porch/deck/floor immediately outside a valid
// house across its wall must not merge that surface into the room or remove
// the roof. Objects on either floor and wall attachments must be irrelevant.
const layered = enclosing.concat([
  { id: "porch", kind: "woodFloor", x: 64, y: 32 },
  { id: "lamp", kind: "torch", mountType: "floor", supportId: "floor:a", x: 32, y: 32 },
  { id: "table", kind: "table", x: 48, y: 32 },
  { id: "walltorch", kind: "torch", mountType: "wall", supportId: "east", x: 56, y: 32 }
]);
regions = topology.automaticRoofRegions(layered, 16);
assert.strictEqual(regions.length, 1, "outside floor/object layers must not invalidate an enclosed building");
assert.deepStrictEqual([...regions[0].floorKeys].sort(), ["32,32", "48,32"]);
assert(!regions[0].floorKeys.has("64,32"), "porch floor across the wall must remain outside the roof region");
assert(topology.roofedFloorKeys(layered, 16).has("48,32"));
assert(!topology.roofedFloorKeys(layered, 16).has("64,32"));

// If the separating wall really is removed, the porch becomes connected to
// the interior and the now-open structure correctly loses its roof.
const opened = layered.filter(item => item.id !== "east");
assert.strictEqual(topology.automaticRoofRegions(opened, 16).length, 0, "a genuine wall opening must still break the roof");

// Automatic roofs remain derived client/server state only; the layering model
// adds no roof or object heartbeat/network stream.
assert(!server.includes("roofSnapshot") && !server.includes("roofPlaced"));

console.log("v411 enclosed-wall roof topology check passed: walls/doors separate roof regions, exterior floors no longer destroy roofs, and object/attachment layers are topology-independent.");
