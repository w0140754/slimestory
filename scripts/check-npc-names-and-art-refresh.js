"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bytes = (...parts) => fs.readFileSync(path.join(root, ...parts));
const hash = buffer => crypto.createHash("sha256").update(buffer).digest("hex");

const server = read("server.js");
const config = read("public", "client-config.js");
const game = read("public", "game.js");
const network = read("public", "client-network.js");
const enemies = read("public", "client-enemies.js");
const editor = read("public", "map-editor.js");
const editorHtml = read("public", "map-editor.html");
const draftFormat = read("public", "shared", "map-draft-format.js");
const authored = JSON.parse(read("content", "adopted-map-overrides.json"));
const authoredMirror = require(path.join(root, "public", "shared", "adopted-map-overrides.js"));
const world = require(path.join(root, "public", "shared", "world-content.js"));

assert(server.includes('const BUILD_VERSION = "6-11-366";'));
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-366";'));
assert.strictEqual(authored.version, 59);
assert.deepStrictEqual(authoredMirror, authored, "browser and server authored-map copies must match");

const expectedAssets = {
  "iced_coffee.png": [20, 20, "7c35ea312f72f98560ac948608c982ef8498085efeb382b248a243d9a14e0b18"],
  "sapgem_wand_v4.png": [16, 16, "3b3b4ee785837a2d8cd0f5a7d71d4efd9eeea07f3158bc492fbe0f074ab6f4d3"],
  "green_witch_npc.png": [20, 20, "432d4c8ebc939caeda382cf97202df1b27cb879c786e8bc5c02529640dfeb0b3"],
  "camo_npc.png": [20, 20, "396b6bc3b29a082c77161af340d6b2a9274888eea0183c662838684c70a0fb2e"]
};

for (const [file, [width, height, sha]] of Object.entries(expectedAssets)) {
  const png = bytes("public", "assets", file);
  assert.strictEqual(png.readUInt32BE(16), width, `${file} width changed`);
  assert.strictEqual(png.readUInt32BE(20), height, `${file} height changed`);
  assert.strictEqual(hash(png), sha, `${file} is not the supplied artwork`);
}

assert(game.includes('sapgemWandImage = loadImage("assets/sapgem_wand_v4.png?v=366")'));
assert(enemies.includes('icedCoffeeLootImage = loadImage("assets/iced_coffee.png?v=366")'));
assert(enemies.includes("drawWidth: 20") && enemies.includes("drawHeight: 20"), "coffee must render at its native size");
assert(network.includes('"FOUND IT!"') && !network.includes('"ICED COFFEE FOUND!"'), "coffee pickup label must not spell out its item name");

const cam = authored.maps.prototypeIsland.npcs.find(npc => npc.type === "camoGuy");
const myrtle = authored.maps.waterfallGrove.npcs.find(npc => npc.type === "greenWitch");
const sunny = authored.maps.crabBeach.npcs.find(npc => npc.type === "beachGirl");
assert.deepStrictEqual(cam, { id: "prototypeIsland:npc:camoGuy", type: "camoGuy", name: "Cam", x: 472, y: 264, interactionRadius: 24 });
assert.deepStrictEqual(myrtle, { id: "waterfallGrove:npc:greenWitch", type: "greenWitch", name: "Myrtle", x: 414, y: 334, interactionRadius: 24 });
assert.strictEqual(sunny.name, "Sunny");
assert.strictEqual(world.defaultPlayerLoad.mapId, "prototypeIsland");
assert(world.maps.prototypeIsland.npcs.some(npc => npc.type === "camoGuy" && npc.name === "Cam"));

for (const [type, name] of Object.entries({ shopkeeper: "Marnie", hunter: "Bramble", jester: "Jinx", beachGirl: "Sunny", greenWitch: "Myrtle", camoGuy: "Cam" })) {
  assert(game.includes(`${type}: "${name}"`), `${name} default name missing`);
}
assert(game.includes("function drawNpcNameTag") && game.includes("drawNpcNameTag(npcDisplayName(type, npc)"));
assert(game.includes("The waterfall remembers every spell cast beside it."));
assert(game.includes("I'm conducting an extremely secret camouflage exercise."));
assert(draftFormat.includes('"greenWitch", "camoGuy"'));
assert(editor.includes('type: "greenWitch", name: "Myrtle"') && editor.includes('type: "camoGuy", name: "Cam"'));
assert(editor.includes('makePropertyRow("Name", textControl('), "NPC names should be editable");
assert(editorHtml.includes("green_witch_npc.png?v=366") && editorHtml.includes("camo_npc.png?v=366"));

console.log("NPC names, dialogue, placements, and refreshed user artwork OK.");
