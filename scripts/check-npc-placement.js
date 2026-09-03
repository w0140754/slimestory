"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const editorHtml = fs.readFileSync(path.join(root, "public", "map-editor.html"), "utf8");
const editorJs = fs.readFileSync(path.join(root, "public", "map-editor.js"), "utf8");
const game = fs.readFileSync(path.join(root, "public", "game.js"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "client-app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const shopkeeperAsset = fs.readFileSync(path.join(root, "public", "assets", "shopkeeper_npc_v1.png"));
const craftBubbleAsset = fs.readFileSync(path.join(root, "public", "assets", "crafting_bubble_axe_v1.png"));

const checks = [
  [editorHtml.includes('data-place="shopkeeperNpc"') && editorHtml.includes('data-place="hunterNpc"') && editorHtml.includes('data-place="jesterNpc"') && editorHtml.includes('data-place="craftingTableNpc"') && editorHtml.includes('data-place="classResetCrystalNpc"'), "editor palette entries"],
  [editorJs.includes('if (!Array.isArray(map.npcs)) map.npcs = [];') && editorJs.includes('npc: { layer: "entities", label: "NPC"'), "NPC editor collection"],
  [editorJs.includes('draft.map.npcs.push(item)') && editorJs.includes('descriptor.kind === "npc"') && editorJs.includes('value: "craftingTable", label: "Crafting Table"') && editorJs.includes('value: "classResetCrystal", label: "Class Reset Crystal"'), "NPC placement and inspector"],
  [game.includes('function placedNpcDefinitionsForMap') && game.includes('function drawPlacedNpc') && game.includes('interaction.npcType === "craftingTable"') && game.includes('interaction.npcType === "classResetCrystal"'), "NPC runtime rendering/interaction"],
  [app.includes('for (const npc of placedNpcDefinitionsForMap(currentMapId))') && app.includes('drawPlacedNpc(npc, camX, camY)'), "NPC drawable integration"],
  [server.includes('function playerNearAuthorizedShopkeeper') && server.includes('playerNearPlacedInteraction(playerState, "shopkeeper", 48, 16)'), "server shopkeeper authorization"],
  [shopkeeperAsset.length > 100 && craftBubbleAsset.length > 100 && crypto.createHash("sha256").update(shopkeeperAsset).digest("hex").length === 64, "required editor assets"],
  [editorHtml.includes('/map-editor.js?v=363') && editorHtml.includes('/shared/map-draft-format.js?v=363'), "326 editor cache keys"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`NPC placement regression: ${label}`);
}

const source = JSON.parse(JSON.stringify(WORLD_CONTENT.maps.prototypeIsland));
source.npcs = [
  { id: "prototypeIsland:npc:shop", type: "shopkeeper", x: 320, y: 260, interactionRadius: 24 },
  { id: "prototypeIsland:npc:hunter", type: "hunter", x: 350, y: 260, interactionRadius: 30 },
  { id: "prototypeIsland:npc:jester", type: "jester", x: 380, y: 260, interactionRadius: 24 },
  { id: "prototypeIsland:npc:bench", type: "craftingTable", x: 410, y: 260, interactionRadius: 24 },
  { id: "prototypeIsland:npc:crystal", type: "classResetCrystal", x: 440, y: 260, interactionRadius: 28 }
];
const payload = {
  editorBuild: "330",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  mapId: "prototypeIsland",
  map: source
};
const valid = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
if (!valid.ok) throw new Error(`Valid NPC draft rejected: ${valid.errors.join(" | ")}`);

const bad = JSON.parse(JSON.stringify(payload));
bad.map.npcs[0].type = "unknownNpc";
const invalid = MAP_DRAFT_FORMAT.validate(bad, WORLD_CONTENT, TERRAIN_RULES);
if (invalid.ok || !invalid.errors.some(error => error.includes("unsupported type"))) {
  throw new Error("Unsupported NPC type should fail map-draft validation");
}

console.log("NPC placement regression checks passed.");
