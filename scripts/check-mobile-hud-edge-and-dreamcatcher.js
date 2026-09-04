const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("public/index.html");
const game = read("public/game.js");
const balanceText = read("public/shared/combat-balance.js");
const balance = require(path.join(root, "public/shared/combat-balance.js"));
const maps = JSON.parse(read("content/adopted-map-overrides.json"));

assert(html.includes("translateX(-50%) scale(.84)"), "mobile top toolbar scale must be .84");
assert(html.includes("translateX(-50%) scale(.54)"), "mobile bottom toolbar scale must be .54");
assert(html.includes("right: 3px !important") && html.includes("left: 2px"), "mobile edge anchors missing");
assert(game.includes('["beachGirl", "greenWitch", "camoGuy"].includes(type)\n    ? screenY - 1'), "Beach Girl shadow must remain moved up 2px");
assert.strictEqual(balance.version, 29, "combat balance revision must be 29");
const dreamcatcher = balance.weaponProfiles.find(profile => profile.id === "weapon_dreamcatcher");
assert.strictEqual(dreamcatcher.attackPower, 20, "Dreamcatcher ATK must be 20");
assert(balanceText.includes('id: "weapon_dreamcatcher"'), "Dreamcatcher profile missing");
assert.ok(maps.version >= 68, "newest live authored map revision must be preserved");

const beach = maps.maps.crabBeach;
const girl = beach.npcs.find(npc => npc.type === "beachGirl");
assert(girl && Number.isFinite(girl.x) && Number.isFinite(girl.y), "live Beach Girl authored placement must remain valid");

console.log("Mobile HUD edge refinement, Dreamcatcher buff, Beach Girl shadow, and live map preservation OK.");
