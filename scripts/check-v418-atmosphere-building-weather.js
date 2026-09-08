"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

if (!process.env.SLIME_STORY_WORLD_SEED) process.env.SLIME_STORY_WORLD_SEED = "0";
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const weather = require(path.join(root, "public", "shared", "weather-rules.js"));
const server = read("server.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.430");
assert(server.includes('const BUILD_VERSION = "6-11-430";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-430";'));
assert(html.includes('/shared/weather-rules.js?v=430'));
assert(html.indexOf('/shared/weather-rules.js?v=430') < html.indexOf('/game.js?v=430'));

// No arbitrary build-count ceiling: placement is still range/resource/collision
// validated, but long-lived player settlements are not stopped at 96 pieces.
assert(!server.includes("MAX_STRUCTURES_PER_MAP"));
assert(!server.includes('reason = "mapLimit"'));
assert(!server.includes('reason: "mapLimit"'));

// Completed roofs and neighboring floor cells no longer lock the boundary layer.
assert(!server.includes('reason = "interiorEdge"'));
assert(!server.includes('reason = "roofed"'));
assert(!game.includes("if (floorExistsAcrossBuildEdge(candidate.floorX, candidate.floorY, candidate.edge)) return null;"));
assert(!game.includes("if (!candidate || floorBelongsToCompletedRoof(candidate.floor)) return null;"));
assert(server.includes('reason = "doorNeedsWalls"'));
assert(game.includes('kind === "woodDoor" && !doorCandidateHasFlankingWalls(candidate)'));

// Door anti-stuck is symmetric client/server and still constrained to the real
// doorway channel; adjacent wall pieces continue to own the solid frame.
assert(server.includes("function serverDoorAllowsPlayerStep("));
assert(server.includes("tangential > 8 + radius + 2"));
assert(server.includes("playerDoorPassages.set(playerId"));
assert(game.includes("function doorAllowsLocalPlayerStep("));
assert(game.includes("tangential > 8 + playerRadius + 2"));
assert(game.includes("localDoorPassageUntil = performance.now() + DOOR_PASSAGE_MS;"));

// Procedural feature IDs are validated by exact seeded-world identity instead
// of the old kind-prefix assumption, so meadow flowers/grass, ring trees and
// stone-feature rocks can join the authoritative mutable environment registry.
assert(server.includes("function canonicalEnvironmentDefinition(mapId, kind, entityId)"));
assert(server.includes('? "harvestFlowers"'));
assert(server.includes('? "tallGrass"'));
assert(server.includes('? "rocks"'));
assert(server.includes("if (!canonical) return null;"));
const generatedKinds = Object.values(world.maps).flatMap(map => [
  ...(map.environment?.harvestFlowers || []),
  ...(map.environment?.tallGrass || []),
  ...(map.environment?.trees || []),
  ...(map.environment?.rocks || [])
]).map(entity => String(entity.id || ""));
assert(generatedKinds.some(id => id.includes(":meadow:flower:")), "seed fixture needs a generated meadow flower");
assert(generatedKinds.some(id => id.includes(":tree-ring:")), "seed fixture needs a generated tree-ring tree");
assert(generatedKinds.some(id => id.includes(":stone-patch:rock:")), "seed fixture needs a generated stone-patch rock");

// Near-black night with a tiny LOCAL-only visibility pocket. It is deliberately
// not a shared torch source, so other players do not glow on this client.
assert(game.includes('const WORLD_DARKNESS_COLOR = "#020307";'));
assert(game.includes("const midnightAlpha = 0.992;"));
assert(game.includes("const LOCAL_NIGHT_SIGHT_RADIUS = 18;"));
assert(game.includes("function carveLocalPlayerNightSight("));
assert(game.includes("carveLocalPlayerNightSight(bufferCtx, nightAlpha);"));
const sightStart = game.indexOf("function carveLocalPlayerNightSight(");
const sightEnd = game.indexOf("function carveOpenDoorDaylight(", sightStart);
const sightBlock = game.slice(sightStart, sightEnd);
assert(sightBlock.includes("player.x") && sightBlock.includes("player.y"));
assert(!sightBlock.includes("remotePlayers"));
const collectStart = game.indexOf("function collectTorchLightSources(");
const collectEnd = game.indexOf("function structureBlocksLight(", collectStart);
assert(collectStart >= 0 && collectEnd > collectStart);
assert(!game.slice(collectStart, collectEnd).includes("local-night-sight"));

// Night awareness is finite and short, preventing whole-map wakeups.
assert(server.includes("const NIGHT_HOSTILE_DETECTION_RADIUS = 64;"));
assert(server.includes("const NIGHT_HOSTILE_DISENGAGE_RADIUS = 96;"));
assert(server.includes("const NIGHT_ONLY_DETECTION_RADIUS = 104;"));
assert(server.includes("const NIGHT_ONLY_DISENGAGE_RADIUS = 144;"));
assert(!server.includes("const acquireRadius = relentlessNightAggro\n      ? Infinity"));

// Roofed interiors own a separate ambient darkness layer. Existing torch
// occlusion remains the light-carving system; open doors get a small daylight
// spill only inside the revealed room.
assert(game.includes("const INTERIOR_DAY_AMBIENT_ALPHA = 0.54;"));
assert(game.includes("function restoreActiveInteriorAmbient("));
assert(game.includes("restoreActiveInteriorAmbient(bufferCtx, interiorRegion, interiorAlpha);"));
assert(game.includes("function carveOpenDoorDaylight("));
assert(game.includes("structureInteriorBoundarySide(door, region)"));
assert(game.includes("carveOpenDoorDaylight(bufferCtx, interiorRegion, nightAlpha);"));
assert(game.includes("function carveTorchStructureFaceLight("));
assert(game.includes("function carveTorchRoofSurfaceLight("));

// Clouds are richer irregular banks/wisps; tree-painted sunlight shadow still
// falls to zero with darkness rather than appearing as a night-time blob.
assert(game.includes("function traceIrregularCloudBank("));
assert(game.includes("banks,"));
assert(game.includes("wisps"));
assert(game.includes("return Math.max(0, Math.min(1, 1 - darkness / 0.68));"));

// Rain is deterministic from world seed + map + absolute game time. Both ends
// can derive it without a weather heartbeat. Gameplay Wet is refreshed at a
// low local cadence and roof topology supplies shelter.
assert.strictEqual(weather.version, 1);
assert.strictEqual(weather.weatherBlockMinutes, 360);
assert(weather.rainChance > 0 && weather.rainChance < 1);
let episode = null;
for (let block = 0; block < 40 && !episode; block += 1) {
  episode = weather.rainEpisodeForBlock(0, world.worldGrid.startMapId, block);
}
assert(episode, "deterministic weather fixture should produce a rain episode");
assert(episode.duration >= 35 && episode.duration <= 190);
const midpoint = (episode.start + episode.end) / 2;
assert(weather.rainIntensity(0, world.worldGrid.startMapId, midpoint) > 0.5);
assert(server.includes("absoluteGameMinutes: serverWorldClockAbsoluteGameMinutes(now)"));
assert(server.includes("function serverMapRainIntensity("));
assert(server.includes("function refreshServerMapWeatherWetness("));
assert(server.includes("const MAP_WEATHER_WET_REFRESH_SECONDS = 0.6;"));
assert(server.includes("serverPointUnderAutomaticRoof"));
assert(server.includes("applyServerPlayerWet(target, STATUS_RULES.playerWetDuration)"));
assert(server.includes("applyServerEnemyWet(enemy, STATUS_RULES.enemyWetDuration)"));
assert(game.includes("function currentMapRainIntensity()"));
assert(game.includes("function drawMapRainOverlay()"));
assert(app.includes("drawWorldLightingOverlay();\n    drawMapRainOverlay();"));
assert(!server.includes('type: "weather"'));
assert(!server.includes('type: "rainState"'));

console.log("v418 atmosphere/build/weather checks passed: uncapped building, interior partitions, door anti-stuck, mutable generated scenery, near-black local-only night sight, short night aggro, dim interiors, richer clouds, and zero-heartbeat map rain.");
