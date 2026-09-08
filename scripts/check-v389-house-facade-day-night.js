"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const app = read("public", "client-app.js");
const network = read("public", "client-network.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.428");
assert(server.includes('const BUILD_VERSION = "6-11-428";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-428";'));
assert.strictEqual(world.version, 414);
assert.strictEqual(Object.keys(world.maps).length, 9, "current build must preserve the active 3x3 coordinate world");

// v389 foundations retained after the v390 interior-visibility refinement.
assert(game.includes("function structureBelongsToRoofFacade("), "roof facade membership helper missing");
assert(game.includes("activeInteriorRoofRegion()"), "interior roof detection missing");
assert(game.includes("function roofRegionVisuallyCoversLocalPlayer("), "completed roof must still fade when it visually covers a player outside/behind it");
assert(game.includes("ROOF_PLAYER_COVER_ALPHA"), "roof canopy-style player cover alpha missing");
assert(game.includes("const ROOF_OVERHANG = 3;"), "roof overhang missing");
assert(game.includes("x - ROOF_OVERHANG") && game.includes("x + 16"), "roof must extend authored edge pixels over exposed side-wall art");
assert(game.includes("y - ROOF_OVERHANG") && game.includes("y + 16"), "roof must extend authored edge pixels over exposed north/south wall seams");

assert(!network.includes('message.reason === "needsFloor" ? "PLACE ON FLOOR"'), "failed placement text should remain retired");
assert(!network.includes('message.reason === "blocked" ? "BLOCKED"'), "failed placement BLOCKED note should remain retired");

assert(server.includes("const WORLD_CLOCK_REAL_MS_PER_GAME_MINUTE = 500;"), "shared clock speed missing");
assert(server.includes("const WORLD_CLOCK_START_GAME_MINUTES = 8 * 60;"), "world clock should start at 08:00 on server boot");
assert(server.includes("function serverWorldClockSnapshot("), "server world-clock anchor helper missing");
assert(server.includes("worldClock,"), "welcome packet must include the one-time world-clock anchor");
assert(!server.includes('type: "worldClock"'), "day/night must not create a periodic world-clock packet type");
assert(network.includes("applyWorldClockSnapshot(message.worldClock);"), "client must accept the server clock anchor");
assert(game.includes("function currentWorldClockMinutes("), "client clock extrapolation missing");
assert(game.includes("function worldClockLightingAlpha("), "day/night lighting curve missing");
assert(game.includes("function drawWorldLightingOverlay("), "night lighting overlay missing");
assert(app.includes("drawWorldLightingOverlay();"), "night lighting overlay must be rendered over the world");
assert(app.includes("updateWorldClockHud();"), "clock HUD must refresh through normal HUD updates");
assert(html.includes('id="worldClockHud"'), "on-screen world clock missing");
assert(html.includes("08:00 · DAY"), "clock must have a stable pre-connect fallback");

console.log("v389 compatibility checks passed: roof overhang/behind-player fade and the zero-heartbeat shared day/night clock remain intact after v390 interior refinement.");
