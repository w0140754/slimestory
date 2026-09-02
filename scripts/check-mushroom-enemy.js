"use strict";

const fs = require("fs");
const path = require("path");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const game = read("public", "game.js");
const enemies = read("public", "client-enemies.js");
const rendering = read("public", "client-enemy-rendering.js");
const editor = read("public", "map-editor.js");
const draftFormat = read("public", "shared", "map-draft-format.js");
const balance = read("public", "shared", "combat-balance.js");
const indexHtml = read("public", "index.html");
const editorHtml = read("public", "map-editor.html");
const packageJson = JSON.parse(read("package.json"));
const adoptedOverrides = read("content", "adopted-map-overrides.json");

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`${path.basename(filePath)} is not a valid PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length
  };
}

const assetNames = [
  "mushroom_sleep_v1.png",
  "mushroom_awake_v1.png",
  "mushroom_flash_v1.png"
];
for (const name of assetNames) {
  const info = pngDimensions(path.join(root, "public", "assets", name));
  if (info.width !== 16 || info.height !== 16 || info.bytes < 80) {
    throw new Error(`Mushroom asset regression: ${name} must remain a non-empty 16x16 PNG`);
  }
}

const checks = [
  [packageJson.version === "0.6.11.352", "package version is 0.6.11.352"],
  [server.includes('const BUILD_VERSION = "6-11-352";') && read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-352";'), "server/client build versions are 330"],
  [indexHtml.includes('/client-enemies.js?v=352') && indexHtml.includes('/client-enemy-rendering.js?v=352') && indexHtml.includes('/game.js?v=352'), "330 game cache keys"],
  [editorHtml.includes('/map-editor.js?v=352') && editor.includes('const BUILD = "351";'), "330 editor cache/build keys"],
  [server.includes('mushroom: Object.freeze({') && server.includes('mushroom: makeServerMushroom') && server.includes('const sharedMushrooms =') && server.includes('tickSharedMushrooms(dt);'), "server registry/factory/collection/tick wiring"],
  [/function makeServerMushroom\([\s\S]*?type: "mushroom"[\s\S]*?aggroMode: ENEMY_AGGRO_PROVOKED/.test(server), "mushroom starts provoked-only"],
  [/function tickSharedMushrooms\([\s\S]*?Passive state: deliberately no wander target choice or movement\./.test(server), "sleeping mushroom has no passive wander"],
  [server.includes('enemy.type === "slime" || enemy.type === "mushroom"') && server.includes('enemyType === "mushroom"'), "mushroom participates in ground return/hurl/passive networking"],
  [game.includes('mushroom: "mushrooms"') && game.includes('mushroom(spawn) {') && game.includes('draw: drawMushroom') && game.includes('update: updateMushrooms'), "client enemy registry wiring"],
  [enemies.includes('assets/mushroom_sleep_v1.png') && enemies.includes('assets/mushroom_awake_v1.png') && enemies.includes('function makeMushroom(') && enemies.includes('function updateMushrooms(dt)'), "client mushroom assets/factory/update"],
  [rendering.includes('function drawMushroom(') && rendering.includes('function mushroomIsAwakePresentation(') && rendering.includes('effect.enemyType === "mushroom"'), "sleep/awake/death rendering"],
  [balance.includes('mushroom: Object.freeze({') && /mushroom: Object\.freeze\(\{[\s\S]*?level: 1,[\s\S]*?physicalDefense: 0,[\s\S]*?magicResist: 0/.test(balance), "explicit neutral combat-balance profile"],
  [editor.includes('{ value: "mushroom", label: "Sleeping Mushroom" }') && editor.includes('type === "mushroom"') && editor.includes('label: "M"'), "map-editor mushroom species and marker"],
  [draftFormat.includes('["slime", "mushroom", "crab", "goblin", "ghost", "bigGoldSlime"]'), "map draft enemy type validation includes mushroom"],
  [!read("public", "shared", "world-content.js").includes('type: "mushroom"') && !adoptedOverrides.includes('"type": "mushroom"'), "patch does not auto-place mushrooms or mutate authored spawn data"],
  [read("README.md").includes('## v6-11-327 — Sleeping Mushroom enemy + map-editor spawn support'), "README retains v327 MushroomEnemy changelog"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Mushroom enemy regression: ${label}`);
}

const source = JSON.parse(JSON.stringify(WORLD_CONTENT.maps.prototypeIsland));
source.enemySpawns = [
  ...(source.enemySpawns || []),
  {
    id: "prototypeIsland:mushroom:test",
    type: "mushroom",
    level: 1,
    x: 340,
    y: 260,
    phase: 0.5
  }
];

const payload = {
  editorBuild: "330",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  mapId: "prototypeIsland",
  map: source
};
const valid = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
if (!valid.ok) {
  throw new Error(`Valid Sleeping Mushroom draft rejected: ${valid.errors.join(" | ")}`);
}

const bad = JSON.parse(JSON.stringify(payload));
bad.map.enemySpawns[bad.map.enemySpawns.length - 1].type = "unknownEnemy";
const invalid = MAP_DRAFT_FORMAT.validate(bad, WORLD_CONTENT, TERRAIN_RULES);
if (invalid.ok || !invalid.errors.some(error => error.includes("enemySpawns") && error.includes("unsupported type"))) {
  throw new Error("Unsupported enemy species should fail map-draft validation");
}

console.log("Sleeping Mushroom enemy registry/editor regression checks passed.");
