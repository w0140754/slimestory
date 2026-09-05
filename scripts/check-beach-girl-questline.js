"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const html = read("public", "index.html");
const editor = read("public", "map-editor.js");
const draftFormat = read("public", "shared", "map-draft-format.js");
const maps = JSON.parse(read("content", "adopted-map-overrides.json"));

const girl = maps.maps.crabBeach.npcs.find(npc => npc.type === "beachGirl");
assert(girl, "Beach Girl must be placed on Crab Beach");
assert.strictEqual(girl.id, "crabBeach:npc:beachGirl");
assert.strictEqual(girl.name, "Sunny");
assert.strictEqual(girl.interactionRadius, 28);
assert.ok(maps.version >= 68, "authored map revision must include the named NPC additions");

for (const [file, width, height] of [
  ["beach_girl_npc.png", 13, 17],
  ["iced_coffee.png", 20, 20]
]) {
  const png = fs.readFileSync(path.join(root, "public", "assets", file));
  assert.strictEqual(png.readUInt32BE(16), width, `${file} width changed`);
  assert.strictEqual(png.readUInt32BE(20), height, `${file} height changed`);
}

assert(server.includes("const BEACH_QUEST_COFFEE_DROP_CHANCE = 0.15;"), "coffee drop rate must be 15%");
assert(server.includes('playerState.beachQuestFirstCrabKills >= BEACH_QUEST_FIRST_CRAB_GOAL &&') && server.includes("playerState.beachQuestIcedCoffee >= 1"), "first turn-in must require both objectives");
assert(server.includes('stage === "firstComplete" && playerState.level >= 7'), "second quest must require level 7 and first completion");
assert(server.includes('action === "turnInSecond"') && server.includes("BEACH_QUEST_SECOND_CRAB_GOAL"), "25-crab revenge turn-in missing");
assert(server.includes('playerNearPlacedInteraction(playerState, "beachGirl", 48, 16)'), "server NPC proximity authorization missing");
assert(server.includes('type: "beachQuestProgress"'), "server quest progress updates missing");

assert(game.includes("function interactWithBeachGirl()") && game.includes("function applyBeachQuestState(message)"), "client quest interaction missing");
assert(network.includes('type: "beachQuestInteract"') && network.includes('message.type === "beachQuestProgress"'), "quest networking missing");
assert(network.includes('"FOUND IT!"') && !network.includes('"ICED COFFEE FOUND!"'), "coffee pickup copy must stay compact");
assert(enemies.includes("icedCoffee: Object.freeze") && enemies.includes("assets/iced_coffee.png?v=372"), "coffee world-drop rendering missing");
assert(html.includes('id="beachQuestOverlay"') && html.includes('assets/beach_girl_npc.png?v=374'), "quest dialogue UI missing");
assert(editor.includes('NPC_CHARACTER_TYPES') && editor.includes('"beachGirl"') && draftFormat.includes('"beachGirl"'), "map editor Beach Girl support missing");

console.log("Beach Girl questline regression checks passed.");
