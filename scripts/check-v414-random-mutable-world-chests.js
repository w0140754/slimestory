"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = require(path.join(root, "package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const topology = require(path.join(root, "public", "shared", "structure-topology.js"));
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const input = read("public", "client-input.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");

assert.strictEqual(pkg.version, "0.6.11.431");
assert.strictEqual(world.version, 414);
assert.strictEqual(world.schemaVersion, 2);
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-431";'));
assert(html.includes('/game.js?v=431'));

function dims(file) {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
assert.deepStrictEqual(dims(path.join(root, "public/assets/building/chest_closed_v414.png")), [16, 16]);
assert.deepStrictEqual(dims(path.join(root, "public/assets/building/chest_open_v414.png")), [16, 16]);
assert(game.includes('chestClosedStructureImage = loadImage("assets/building/chest_closed_v414.png?v=431")'));
assert(game.includes('chestOpenStructureImage = loadImage("assets/building/chest_open_v414.png?v=431")'));
assert(game.includes("function drawChestStructure("));
assert(html.includes('data-resource-key="chests" data-build-item="chest" data-hotbar-assignable="true"'));
assert(game.includes('const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"]);'));
assert.strictEqual(topology.layerOf({ kind: "chest" }), topology.LAYERS.OBJECT);
assert(input.includes('["woodFloor", "stoneFloor", "chest", "craftingTable"].includes(selectedBuildPiece)'));
assert(enemies.includes('chest: Object.freeze({'));
assert(game.includes('chests: player.chests'), "Chest inventory must be included in persistent bootstrap payload");
assert(server.includes('chests: previous && Number.isFinite(previous.chests)'));
assert(server.includes('totalChests: playerState.chests'));

// World seed must change the generated baseline, while the same seed reproduces it exactly.
function signature(seed) {
  const code = `const w=require('./public/shared/world-content.js'); const out={seed:w.worldSeed,maps:Object.fromEntries(Object.entries(w.maps).map(([id,m])=>[id,{features:(m.features||[]).map(f=>[f.type,f.x,f.y]),structures:(m.structures||[]).map(s=>[s.id,s.kind,s.x,s.y,s.axis||'',!!s.treasure]),trees:(m.environment?.trees||[]).slice(0,5).map(t=>[t.x,t.y])}]))}; process.stdout.write(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ["-e", code], { cwd: root, env: { ...process.env, SLIME_STORY_WORLD_SEED: String(seed) }, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || `seed ${seed} child failed`);
  return r.stdout;
}
const a1 = signature(111111);
const a2 = signature(111111);
const b = signature(222222);
assert.strictEqual(a1, a2, "same world seed must reproduce exactly");
assert.notStrictEqual(a1, b, "different world seeds must produce different maps/features");
assert(server.includes("crypto.randomBytes(4).readUInt32LE(0)"), "server boot without an explicit seed must choose a random seed");
assert(server.includes("process.env.SLIME_STORY_WORLD_SEED = String(WORLD_GENERATION_SEED)"));
assert(server.includes("worldSeed: WORLD_CONTENT.worldSeed"));

// Generated buildings/chests/surfaces are real mutable structures, not fake scenery/NPC stand-ins.
const treasure = Object.values(world.maps).flatMap(map => map.structures || []).find(s => s.kind === "chest" && s.treasure);
assert(treasure && treasure.worldGenerated, "seed-0 fixture must contain a generated real treasure chest");
assert(!Object.values(world.maps).some(map => (map.npcs || []).some(n => n.type === "treasureChest")), "generated chests must no longer be NPC scenery");
assert(!read("public", "shared", "world-content.js").includes("environment.sceneryRocks.push("), "generated stone feature rocks must be mineable entities");
assert(server.includes("function removeWorldGeneratedStructure("));
assert(server.includes("function removeAnyStructure("));
assert(server.includes("const structure = structureById(playerState.mapId, structureId);"));
assert(!game.includes("if (structure.worldGenerated) continue;"), "Pickaxe targeting must not reject generated structures");
assert(server.includes('spawnSharedResource(\n    removed.mapId,\n    removed.kind,'), "destroyed generated structure must drop the exact piece");
assert(server.includes('"woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest"'), "all buildable/generated structure resources must be pickup-compatible");

// Mutations stay map-local and change-only: map entry gets compact deltas, live edits broadcast to current map only.
assert(server.includes("function worldStructureMutationSnapshot(mapId)"));
assert(server.includes("removedWorldStructureIds"));
assert(server.includes("worldStructureStates"));
assert(server.includes("broadcastToMap(removed.mapId, {\n    type: \"structureRemoved\""));
assert(server.includes("broadcastToMap(structure.mapId, {\n    type: \"structureState\""));
assert(network.includes('if (message.type === "structureState")'));
assert(game.includes("function applyStructureState("));
assert(!server.includes("treasureHeartbeat"));
assert(!server.includes("structureMutationHeartbeat"));

// Treasure chest lifecycle remains shared and harvestable, but v424 replaces
// permanent-open/instant-loot with an exclusive short-range context lock.
assert(server.includes("function handleChestContextOpen("));
assert(server.includes("updateChestStructureState(chest, { opened: true })"));
assert(server.includes("updateChestStructureState(chest, { opened: false })"));
assert(server.includes('structure.kind === "chest" && chestLockOwner(structure.id)'));
assert(server.includes('structure.kind === "chest" && chestHasLoot(structure)'), "all non-empty chests remain protected from reclaim");
assert(server.includes('message?.kind === "chest" ? "chest" : message?.kind === "craftingTable" ? "craftingTable" : null'));
assert(server.includes('kind === "chest" ? "chests" : kind === "craftingTable" ? "craftingTables" : "torches"'));
assert(!server.includes("handleChestToggle("), "retired chestToggle compatibility handler must stay removed");
assert(!server.includes('case "chestToggle"'), "retired chestToggle packet route must stay removed");
assert(network.includes("requestChestContextOpen(chestId)"));

console.log("v414 random/mutable world + chest check passed: seeded variation, real generated structures, map-local mutation deltas, authored chest sprites, harvest/re-place lifecycle, and no idle mutation traffic.");
