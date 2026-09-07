"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));
const pkg = JSON.parse(read("package.json"));
const server = read("server.js");
const game = read("public", "game.js");
const config = read("public", "client-config.js");
const clientMaps = read("public", "client-maps.js");
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert.strictEqual(pkg.version, "0.6.11.424");
assert(!pkg.scripts?.["adopt-map"] && !pkg.scripts?.["build-waterfall-grove"], "retired editor/map npm aliases survived");
assert(server.includes('const BUILD_VERSION = "6-11-424";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-424";'));

// v383 cleanup remains, while its temporary full-cell/autotile wall model is retired.
assert(!server.includes('if (sameCell) return true;'), "v383 one-structure-per-cell wall rule survived");
assert(!game.includes('function woodWallConnections(structure)'), "v383 wall autotiling survived");
assert(game.includes('function wallPlacementCandidate(worldX, worldY, kind'), "floor-edge placement candidate missing");
assert(game.includes('function wallCollisionRect(structure)'), "thin wall collision helper missing");
assert(game.includes('const BUILD_WALL_EDGES = Object.freeze(["north", "east", "south", "west"]);'), "four floor edges missing");

// Mouse-wheel/build selection fixes.
assert(!game.includes('if (inventoryOpen) setInventoryOpen(false);'), "v422 live inventory should stay open during build selection");
assert(game.includes('selectedBuildPiece ? itemId === selectedBuildPiece : itemId === equippedItemId'), "menu hotbar single-active selection rule missing");
assert(game.includes('selectedBuildPiece ? selectedBuildPiece === itemId : equippedItemId === itemId'), "HUD hotbar single-active selection rule missing");
assert(game.includes('window.addEventListener("wheel"') && game.includes('cycleHotbarSelection(direction)'), "mouse wheel hotbar cycling missing");

// Retired editor/legacy authored map data is actually gone.
for (const parts of [
  ["public", "map-editor.html"], ["public", "map-editor.css"], ["public", "map-editor.js"],
  ["public", "shared", "map-draft-format.js"], ["public", "shared", "adopted-map-overrides.js"],
  ["content", "adopted-map-overrides.json"], ["tools", "map-draft-adoption.js"]
]) assert(!exists(...parts), `retired file still exists: ${parts.join("/")}`);
assert(!server.includes('/dev/map-editor/adopt'), "retired editor HTTP route survived");
assert(!server.includes('/shared/adopted-map-overrides.js'), "retired override HTTP route survived");
assert.strictEqual(Object.keys(world.maps).length, 9, "only the active 3x3 coordinate world should remain");
assert(Object.values(world.maps).every(map => map?.grid), "legacy non-grid maps survived in canonical world data");
assert.strictEqual(world.defaultPlayerLoad.mapId, "world_p0_p0");
assert(!clientMaps.includes('prototypeIsland') && !clientMaps.includes('waterfallGrove') && !clientMaps.includes('goldSlimeDen'), "legacy client map registry data survived");
assert(clientMaps.includes('for (const mapId of Object.keys(WORLD_CONTENT?.maps || {}))'), "client registry should be generated only from current WORLD_CONTENT");
assert(config.includes('default: Object.freeze({ width: 400, height: 400 })'), "client fallback dimensions should match coordinate-grid cells");
assert(!config.includes('prototypeIsland') && !config.includes('waterfallGrove'), "legacy map dimensions survived");

console.log("v383 cleanup compatibility passed: wheel/editor cleanup remains while full-cell/autotile walls are retired in v384.");
