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
const abilities = read("public", "client-abilities.js");
const html = read("public", "index.html");
const server = read("server.js");
const editor = read("public", "map-editor.js");

assert.strictEqual(pkg.version, "0.6.11.380", "package version must be v377");
assert(server.includes('const BUILD_VERSION = "6-11-380";'), "server build marker must be v377");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-380";'), "client build marker must be v377");

assert(world.worldGrid, "coordinate world metadata missing");
assert.strictEqual(world.worldGrid.radius, 1, "foundation world radius must be 1");
assert.strictEqual(world.worldGrid.startMapId, "world_p0_p0", "coordinate world must start at 0,0");
assert.strictEqual(world.defaultPlayerLoad.mapId, "world_p0_p0", "default player load must use coordinate-world spawn");

const gridEntries = Object.entries(world.maps).filter(([, map]) => map?.grid);
assert.strictEqual(gridEntries.length, 9, "radius-1 coordinate world must contain exactly 9 grid maps");
const coords = new Set();
for (const [mapId, map] of gridEntries) {
  const { x, y, distance } = map.grid;
  coords.add(`${x},${y}`);
  assert.strictEqual(distance, Math.abs(x) + Math.abs(y), `${mapId} difficulty distance must be Manhattan distance`);
  assert.deepStrictEqual((map.playerSpawns || []).map(spawn => spawn.id), ["center", "west", "east", "north", "south"], `${mapId} must expose cardinal entry spawns`);
  assert.strictEqual((map.portals || []).length, 0, `${mapId} must use edge traversal instead of authored portals`);
  if (distance > 0) {
    assert((map.enemySpawns || []).length > 0, `${mapId} outer-ring map should be populated`);
    assert((map.enemySpawns || []).every(spawn => Number(spawn.level) >= 2), `${mapId} outer-ring enemies should scale above spawn`);
  }
}
assert.strictEqual(coords.size, 9, "coordinate world must have nine unique cells");

const center = world.maps.world_p0_p0;
assert(center.npcs.some(npc => npc.type === "shopkeeper"), "coordinate spawn must retain Marnie tutorial access");
assert(center.npcs.some(npc => npc.type === "craftingTable"), "coordinate spawn must retain crafting access");
assert((center.enemySpawns || []).length === 0, "coordinate spawn should be enemy-free");

assert(game.includes("const HOTBAR_SLOT_COUNT = 9;"), "weapon/tool belt must have 9 slots");
for (let key = 1; key <= 9; key += 1) {
  assert(input.includes(`"${key}": ${key - 1}`), `physical key ${key} must map to belt slot ${key}`);
  assert(html.includes(`id="slot${key}"`), `HUD hotbar slot ${key} missing`);
  assert(html.includes(`data-menu-hotbar-slot="${key - 1}"`), `menu hotbar slot ${key} missing`);
}
assert(!/if \(key === "1" \|\| key === "2" \|\| key === "3"\)/.test(input), "1-3 must no longer be consumable hotkeys");
assert(game.includes("useConsumable(utilityItemId);"), "consumables should remain directly usable from Inventory");

assert(html.includes('id="abilityBar" class="retired-system"'), "old active-skill HUD must be retired");
assert(html.includes('data-page="skillsPage" aria-hidden="true"') || html.includes('retired-system" data-page="skillsPage"'), "Class tab must be retired");
assert(html.includes('retired-system" data-page="talentsPage"'), "Talents tab must be retired");
assert(html.includes("Stat Points 0"), "Stats page should use Stat Points terminology");
assert(html.includes('id="worldGridStatus"'), "world-grid coordinate/biome status missing");

assert(abilities.includes('skillId === "fireball" && weapon === "wand"'), "Fireball must derive from Fire Wand");
assert(abilities.includes('skillId === "rainCloud" && weapon === "rainWand"'), "Rain Cloud must derive from Rain Wand");
assert(combat.includes('currentWeapon === "wand"') && combat.includes("beginFireballAim(null, target)"), "Fire Wand primary must start Fireball");
assert(combat.includes('currentWeapon === "rainWand"') && combat.includes("beginRainCloudCast(target)"), "Rain Wand primary must start Rain Cloud");
assert(combat.includes("releaseFireballAim({"), "Fire Wand release path missing");

assert(game.includes("function awardWoodcuttingExp(amount)"), "woodcutting compatibility helper missing");
assert(game.includes("v377: gathering talents are retired"), "gathering talent retirement marker missing");
assert(game.includes("const sanitizedClassId") === false, "client game should not reintroduce a sanitized class concept");
assert(game.includes("return null;\n}\n\nfunction equipmentAttributeRequirements"), "equipment class restrictions should resolve to null");

assert(game.includes("function updateWorldGridMapConnection()"), "client coordinate edge-travel system missing");
assert(game.includes("Math.max(Math.abs(targetX), Math.abs(targetY)) > radius"), "client world-radius boundary missing");
assert(server.includes("function playerMapTransitionAllowed(previousMapId, requestedMapId)"), "server adjacency validation missing");
assert(server.includes("Math.abs(requestedGrid.x - previousGrid.x)"), "server cardinal-grid validation missing");
assert(server.includes("fireball: sanitizedWeaponIndex === 2 ? 1 : 0"), "server must derive Fireball from Fire Wand");
assert(server.includes("rainCloud: sanitizedWeaponIndex === 3 ? 1 : 0"), "server must derive Rain Cloud from Rain Wand");
assert(server.includes("const sanitizedClassId = null; // v377: classes are retired."), "server classes must be retired");
assert(editor.includes("!definition?.grid"), "map editor must not expose generated coordinate cells as authored maps");

console.log(`v377 world-grid pivot OK: ${gridEntries.length} cells, radius ${world.worldGrid.radius}, item-driven actions + unified 1-9 belt.`);
