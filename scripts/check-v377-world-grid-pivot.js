"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));
const world = require(path.join(root, "public", "shared", "world-content.js"));
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const combat = read("public", "client-combat.js");
const html = read("public", "index.html");
const server = read("server.js");

assert.strictEqual(pkg.version, "0.6.11.431");
assert(server.includes('const BUILD_VERSION = "6-11-431";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-431";'));

assert(world.worldGrid, "coordinate world metadata missing");
assert.strictEqual(world.worldGrid.radius, 1);
assert.strictEqual(world.worldGrid.startMapId, "world_p0_p0");
assert.strictEqual(world.defaultPlayerLoad.mapId, "world_p0_p0");

const gridEntries = Object.entries(world.maps).filter(([, map]) => map?.grid);
assert.strictEqual(gridEntries.length, 9);
const coords = new Set();
for (const [mapId, map] of gridEntries) {
  const { x, y, distance } = map.grid;
  coords.add(`${x},${y}`);
  assert.strictEqual(distance, Math.abs(x) + Math.abs(y));
  assert.deepStrictEqual((map.playerSpawns || []).map(spawn => spawn.id), ["center", "west", "east", "north", "south"]);
  assert.strictEqual((map.portals || []).length, 0);
  assert(!Object.prototype.hasOwnProperty.call(map, "enemySpawns"));
}
assert.strictEqual(coords.size, 9);

assert(game.includes("const HOTBAR_SLOT_COUNT = 10;"));
for (let key = 1; key <= 9; key += 1) {
  assert(input.includes(`"${key}": ${key - 1}`));
  assert(html.includes(`id="slot${key}"`));
}
assert(input.includes('"0": 9'));
assert(html.includes('id="slot10"'));

// Legacy class/skill/talent presentation is deleted, not merely hidden.
for (const id of ["abilityBar", "skillsPage", "statsPage", "pvpPage", "talentsPage", "menuSkillHotkeyRail"]) {
  assert(!html.includes(`id="${id}"`), `${id} should be removed`);
}
assert(!game.includes("abilityPoints"));
assert(!game.includes("statPoints"));
assert(!server.includes("sanitizedClassId"));

// Item actions remain tied directly to the equipped item.
assert(combat.includes('if (currentWeapon === "wand")'));
assert(combat.includes("beginFireballAim(target)"));
assert(combat.includes('if (currentWeapon === "rainWand")'));
assert(combat.includes("beginRainCloudCast(target)"));
assert(combat.includes('if (currentWeapon === "tigerPaw")'));
assert(combat.includes("tryCastHurl();"));

// Only level gates remain on equipment.
assert(game.includes("const EQUIPMENT_LEVEL_REQUIREMENTS = Object.freeze({"));
assert(game.includes("function equipmentMissingRequirements(itemId)"));
assert(!game.includes("equipmentClass"));
assert(!game.includes("attributeRequirements"));

assert(game.includes("function updateWorldGridMapConnection()"));
assert(server.includes("function playerMapTransitionAllowed(previousMapId, requestedMapId)"));
assert(server.includes("Math.abs(requestedGrid.x - previousGrid.x)"));

console.log(`v377/current world foundation OK: ${gridEntries.length} coordinate cells, unified 1-0 belt, item-driven actions, no legacy class/skill UI.`);
