"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const app = read("public", "client-app.js");
const config = read("public", "client-config.js");
const index = read("public", "index.html");
const readme = read("README.md");

assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-362";'), "client build must be v344");
assert(index.includes('/client-app.js?v=362') && index.includes('/client-terrain.js?v=362'), "v344 terrain/app cache keys missing");
assert(app.includes('function isAuthoredTerrainMap('), "authored-terrain runtime detector missing");
assert(app.includes('const usesTerrainBackdrop =') && app.includes('isPrototypeIslandMap(currentMapId)') && app.includes('isAuthoredTerrainMap(currentMapId);'), "renderer is still restricted to prototype island IDs");
assert(app.includes('drawTerrainMapTop(currentMapId, camX, camY)'), "shared terrain renderer is not wired into ground layer");
assert(app.includes('drawBeachTideOverlay(currentMapId, camX, camY)'), "beach tide overlay missing from authored terrain ground layer");
assert(WORLD_CONTENT.maps.crabBeach?.terrain, "Crab Beach authored terrain missing");
assert(WORLD_CONTENT.version >= 44, "current world content must preserve or advance beyond v344 W44 authored data");
assert(readme.includes('## v6-11-344 — Terrain map runtime rendering'), "historical README v344 changelog missing");
console.log("Terrain map runtime rendering regression checks passed.");
