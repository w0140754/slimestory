"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const TERRAIN_PRESENTATION = require("../public/shared/terrain-presentation.js");

const read = rel => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

assert.strictEqual(TERRAIN_RULES.TYPES.sand.walkable, true, "sand must be walkable");
assert.strictEqual(TERRAIN_RULES.TYPES.sand.magicGrass, false, "sand must block magic grass");
assert.ok(TERRAIN_PRESENTATION.PALETTE.sand, "sand palette missing");
const fakeContext = { fillStyle: "", fillRect() {} };
assert.doesNotThrow(() => TERRAIN_PRESENTATION.drawCellTexture(fakeContext, "water", 0, 0, 0, 0, 8, 1), "water texture renderer must remain standalone");
assert.doesNotThrow(() => TERRAIN_PRESENTATION.drawCellTexture(fakeContext, "sand", 0, 0, 0, 0, 8, 1), "sand texture renderer failed");
assert.doesNotThrow(() => TERRAIN_PRESENTATION.drawTransitions(fakeContext, "water", 0, 0, 0, 0, 8, () => "sand", 1), "sand-water transition renderer failed");

const beach = WORLD_CONTENT.maps.crabBeach;
assert.ok(beach, "Crab Beach map missing");
assert.strictEqual(beach.name, "Crab Beach");
assert.ok((beach.enemySpawns || []).some(spawn => spawn.type === "crab"), "Crab Beach needs crab spawns");
assert.ok((beach.terrain?.regions || []).some(region => region.type === "sand"), "Crab Beach missing sand terrain");
assert.ok((beach.terrain?.regions || []).some(region => region.type === "water"), "Crab Beach missing water terrain");
assert.ok((beach.portals || []).some(portal => portal.targetMapId === "prototypeIslandWest"), "Crab Beach return portal missing");

const adopted = require("../public/shared/adopted-map-overrides.js");
assert.ok(adopted.version >= 42, "Crab Beach world override must be v42 or newer");
const west = adopted.maps.prototypeIslandWest;
assert.ok((west.portals || []).some(portal => portal.id === "prototypeIslandWest:portal:crabBeach" && portal.targetMapId === "crabBeach"), "Prototype Island West portal to Crab Beach missing");

const indexHtml = read("public/index.html");
const editorHtml = read("public/map-editor.html");
const editorJs = read("public/map-editor.js");
const clientTerrain = read("public/client-terrain.js");
const readme = read("README.md");

assert.ok(indexHtml.includes('/client-terrain.js?v=370') && indexHtml.includes('/shared/terrain-presentation.js?v=370'), "v343 terrain cache keys missing");
assert.ok(editorHtml.includes('data-terrain="sand"') && editorHtml.includes('<kbd>5</kbd>'), "sand/void terrain tools missing from editor");
assert.ok(read("public/map-editor.css").includes(".swatch.sand"), "sand editor swatch style missing");
assert.ok(!editorJs.includes('{ value: "sand", label: "Sand" }'), "sand must not appear as a throwable-rock variant");
assert.ok(editorJs.includes('setActiveTerrain("sand")') && editorJs.includes('setActiveTerrain("water")') && editorJs.includes('setActiveTerrain("void")'), "editor terrain hotkeys missing");
assert.ok(clientTerrain.includes('function drawBeachTideOverlay'), "beach tide overlay missing");
assert.ok(readme.includes('## v6-11-343 — Crab Beach + sand terrain'), "README v343 changelog missing");

console.log("Crab Beach + sand terrain checks passed");
