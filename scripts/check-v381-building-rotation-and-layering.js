const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const network = read("public", "client-network.js");
const config = read("public", "client-config.js");

assert.strictEqual(pkg.version, "0.6.11.427");
assert(server.includes('const BUILD_VERSION = "6-11-427";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-427";'));
assert(!game.includes('selectedBuildOrientation'), "old free-rotation state must stay retired");
assert(!input.includes('rotateSelectedBuildPiece'), "old R-key rotation must stay retired");
assert(network.includes('requestStructurePlacement(kind, x, y, edge = null, supportId = null)'), "edge-aware placement request missing");
assert(!network.includes('orientation = null'), "old orientation payload must stay retired");
assert(!server.includes('message?.orientation'), "old orientation message field must stay retired");
assert(server.includes('normalizedWallFromFloorEdge'), "v384 floor-edge normalization missing");
assert(server.includes('floorStructureAt(playerState.mapId, floorX, floorY)'), "walls must require a floor");

console.log("v381 compatibility OK: free rotation remains retired; v384 uses direct floor-edge orientation instead.");
