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

assert.strictEqual(pkg.version, "0.6.11.427", "package version must be v377");
assert(server.includes('const BUILD_VERSION = "6-11-427";'), "server build marker must be v377");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-427";'), "client build marker must be v377");

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
    assert(map.enemyGeneration, `${mapId} outer-ring map should expose runtime enemy generation rules`);
    assert(Number(map.enemyGeneration.slimeCount || 0) + Number(map.enemyGeneration.mushroomCount || 0) > 0, `${mapId} outer-ring map should request a runtime mob population`);
    assert(Number(map.enemyGeneration.level) >= 2, `${mapId} runtime enemy level should scale above spawn`);
  }
  assert(!Object.prototype.hasOwnProperty.call(map, "enemySpawns"), `${mapId} must not store fixed enemy spawn coordinates`);
}
assert.strictEqual(coords.size, 9, "coordinate world must have nine unique cells");

const center = world.maps.world_p0_p0;
assert(!center.npcs.some(npc => npc.type === "shopkeeper"), "coordinate spawn must not restore the retired starter Marnie NPC");
assert(!center.npcs.some(npc => npc.type === "craftingTable"), "coordinate spawn must not restore a static crafting bench");
assert(game.includes("weapon_sword: 1") && game.includes("weapon_pickaxe: 1") && game.includes("weapon_axe: 1"), "new-player starter tools must be granted directly");
assert(game.includes("\"weapon_sword\", \"weapon_pickaxe\", \"weapon_axe\""), "starter tools must occupy hotbar slots 1-3");
assert(Number(center.enemyGeneration?.slimeCount || 0) === 0 && Number(center.enemyGeneration?.mushroomCount || 0) === 0, "coordinate spawn should be free of normal runtime mobs");

assert(game.includes("const HOTBAR_SLOT_COUNT = 10;"), "weapon/tool belt must have 10 slots");
for (let key = 1; key <= 9; key += 1) {
  assert(input.includes(`"${key}": ${key - 1}`), `physical key ${key} must map to belt slot ${key}`);
  assert(html.includes(`id="slot${key}"`), `HUD hotbar slot ${key} missing`);
  assert(html.includes(`data-menu-hotbar-slot="${key - 1}"`), `menu hotbar slot ${key} missing`);
}
assert(!/if \(key === "1" \|\| key === "2" \|\| key === "3"\)/.test(input), "1-3 must no longer be consumable hotkeys");
assert(game.includes('document.getElementById("inventoryDetailAction")?.addEventListener("click"') && game.includes("useConsumable(itemId);"), "consumables should remain usable from the selected Inventory detail action");

assert(html.includes('id="abilityBar" class="retired-system"'), "old active-skill HUD must be retired");
assert(html.includes('id="skillsPage" class="inventory-page retired-system"'), "Class page must remain retired");
assert(html.includes('id="talentsPage" class="inventory-page retired-system"'), "Talents page must remain retired");
assert(html.includes("Stat Points 0"), "Stats page should use Stat Points terminology");
assert(html.includes('id="worldMiniMap"'), "world minimap missing");
assert(!html.includes('id="worldGridStatus"'), "retired Spawn/Distance/Radius status banner must stay removed");

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

console.log(`v377 world-grid pivot OK: ${gridEntries.length} cells, radius ${world.worldGrid.radius}, item-driven actions + unified 1-0 belt.`);
