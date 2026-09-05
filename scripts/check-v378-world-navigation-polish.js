"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const game = read("public", "game.js");
const html = read("public", "index.html");
const server = read("server.js");

assert.strictEqual(pkg.version, "0.6.11.380", "package version must be v378");
assert(server.includes('const BUILD_VERSION = "6-11-380";'), "server build marker must be v378");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-380";'), "client build marker must be v378");

assert(html.includes('id="worldMiniMap"'), "fixed local minimap DOM is missing");
assert(html.includes("grid-template-columns: repeat(3, 18px)"), "minimap must stay fixed at 3 columns");
assert(html.includes("grid-template-rows: repeat(3, 18px)"), "minimap must stay fixed at 3 rows");
assert(game.includes("for (let offsetY = -1; offsetY <= 1; offsetY += 1)"), "minimap must render a sliding 3x3 local window");
assert(game.includes("for (let offsetX = -1; offsetX <= 1; offsetX += 1)"), "minimap must render three local columns");
assert(game.includes("worldGridDiscoveredCells"), "minimap discovery state is missing");
assert(game.includes("worldGridDiscovery: Array.from(worldGridDiscoveredCells).sort()"), "discovery state must persist in the browser-local save");
assert(game.includes('cell.classList.add("outside-world")'), "minimap world-edge cells are missing");
assert(game.includes('cell.classList.add("undiscovered")'), "unvisited minimap darkening is missing");
assert(game.includes('cell.classList.add("spawn-cell")'), "spawn minimap marker is missing");
assert(game.includes('cell.classList.add("current-cell")'), "current-map minimap marker is missing");

assert(game.includes("const MAP_TRANSITION_SLIDE_DURATION = 0.34;"), "directional pan timing is missing");
assert(game.includes("function captureMapTransitionFrame()"), "outgoing map frame capture is missing");
assert(game.includes('mapTransitionPhase = "syncing";'), "destination must synchronize before panning");
assert(game.includes("ctx.drawImage(mapTransitionOutgoingFrame, outX, outY);"), "outgoing scene slide is missing");
assert(game.includes("ctx.drawImage(incomingFrame, inX, inY);"), "incoming scene slide is missing");
const transitionPresentation = game.slice(
  game.indexOf("function drawMapTransitionCover()"),
  game.indexOf("function activateMap(mapId, entrySide)")
);
assert(!transitionPresentation.includes('fillStyle = "#101510"'), "v378 map transition must not use the old black cover");

assert(server.includes("function gridEnemyMapTier(mapId"), "grid enemy lifecycle tiers are missing");
assert(server.includes('return "warm";') && server.includes('return "cold";'), "warm/cold enemy map lifecycle is missing");
assert(server.includes("gridMapCardinalDistance(mapId, activeMapId) === 1"), "only cardinal neighbours should retain warm mob snapshots");
assert(server.includes("function enemyMapSimulationActive(mapId)"), "enemy simulation activity gate is missing");
assert(server.includes("return !worldGridMetaForMap(mapId) || mapHasNetworkRecipients(mapId);"), "grid enemies must simulate only where a player socket is present");
assert(server.includes("if (!mapHasNetworkRecipients(mapId)) {\n      pendingPassiveEnemyIntents.delete(mapId);\n      continue;"), "empty maps must skip enemy delta construction/serialization");
assert(server.includes('if (nextTier === "cold" && previousTier && previousTier !== "cold")'), "far grid maps must reset only when they transition cold");

for (const marker of [
  "if (!enemyMapSimulationActive(slime.mapId)) continue;",
  "if (!enemyMapSimulationActive(mushroom.mapId)) continue;",
  "if (!enemyMapSimulationActive(crab.mapId)) continue;",
  "if (!enemyMapSimulationActive(goblin.mapId)) continue;",
  "if (!enemyMapSimulationActive(ghost.mapId)) continue;"
]) {
  assert(server.includes(marker), `missing traffic-conscious enemy simulation gate: ${marker}`);
}

assert.strictEqual(world.worldGrid.radius, 1, "v378 must keep the radius-1 foundation world");
assert.strictEqual(world.worldGrid.mapWidth, 400, "current grid maps must remain 400px wide");
assert.strictEqual(world.worldGrid.mapHeight, 400, "v378 navigation pass must not silently resize maps");

console.log("v378 world navigation polish OK: directional pan, sliding 3x3 discovery minimap, active-only grid enemy simulation with warm/cold snapshots.");
