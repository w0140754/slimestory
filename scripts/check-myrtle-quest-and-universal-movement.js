"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("server.js");
const config = read("public", "client-config.js");
const app = read("public", "client-app.js");
const combat = read("public", "client-combat.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const maps = JSON.parse(read("content", "adopted-map-overrides.json"));

assert.ok(maps.version >= 68, "newest live authored maps must be preserved");
const authoredCam = maps.maps.prototypeIsland.npcs.find(npc => npc.type === "camoGuy");
const authoredSunny = maps.maps.crabBeach.npcs.find(npc => npc.type === "beachGirl");
assert(authoredCam && authoredCam.name === "Cam" && authoredCam.interactionRadius === 24 && Number.isFinite(authoredCam.x) && Number.isFinite(authoredCam.y));
assert(authoredSunny && authoredSunny.name === "Sunny" && authoredSunny.interactionRadius === 28 && Number.isFinite(authoredSunny.x) && Number.isFinite(authoredSunny.y));

const cam = fs.readFileSync(path.join(root, "public", "assets", "camo_npc.png"));
assert.strictEqual(cam.readUInt32BE(16), 20);
assert.strictEqual(cam.readUInt32BE(20), 20);
assert.strictEqual(crypto.createHash("sha256").update(cam).digest("hex"), "b67bc97de6c7e7f00df50fb70b848d82e8e52deb37dc8ffe54ae02e8d791a727");
assert(game.includes('camoNpcImage = loadImage("assets/camo_npc.png?v=372")'));

assert(game.includes('document.getElementById("npcNameLayer")'));
assert(game.includes('node.className = "npc-name-label"'));
assert(!game.includes('ctx.font = "5px Arial, sans-serif"'));
assert(!game.includes('ctx.fillStyle = "rgba(24, 24, 24, .76)"'));
assert(!/function drawNpcNameTag[\s\S]{0,220}drawStaticPixelText/.test(game), "NPC labels must not use the oversized pixel glyph renderer");

assert(config.includes("baseSpeed: 54"), "54 px/s must apply to every input scheme");
assert(!config.includes("mobileBaseSpeedMultiplier"), "speed reduction must no longer be mobile-only");
assert(combat.includes("player.basicAttackMovementLockTime = 0;"), "basic attacks and tools must not self-root");
assert(!app.includes("player.basicAttackMovementLockTime <= 0"), "movement must not be gated by the old attack root");
assert(!app.includes("GAME_CONFIG.player.mobileBaseSpeedMultiplier"));

assert(server.includes("const MYRTLE_QUEST_LEVEL = 3;"));
assert(server.includes("const MYRTLE_QUEST_FLOWER_GOAL = 10;"));
assert(server.includes('playerNearPlacedInteraction(playerState, "greenWitch", 48, 16)'));
assert(server.includes("playerState.whiteFlowers >= MYRTLE_QUEST_FLOWER_GOAL &&\n    playerState.blueFlowers >= MYRTLE_QUEST_FLOWER_GOAL"));
assert(server.includes("playerState.whiteFlowers -= MYRTLE_QUEST_FLOWER_GOAL") && server.includes("playerState.blueFlowers -= MYRTLE_QUEST_FLOWER_GOAL"));
assert(server.includes("playerState.coins += 50") && server.includes("rewardExp = 10"));
assert(server.includes('case "myrtleQuestInteract"'));
assert(game.includes('myrtleQuest: {\n    stage: "none"'));
assert(game.includes("function applyMyrtleQuestState") && game.includes("function interactWithMyrtle"));
assert(network.includes('message.type === "myrtleQuestState"') && network.includes('type: "myrtleQuestInteract"'));
assert(game.includes('icon === "blueFlower"') && game.includes("blueFlowerImage.src") && game.includes("flowerImage.src"));

console.log("Myrtle quest, crisp NPC labels, Cam redraw, and universal movement/attack tuning OK.");
