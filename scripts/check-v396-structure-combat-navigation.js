"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const game = read("public", "game.js");
const combat = read("public", "client-combat.js");
const server = read("server.js");
const html = read("public", "index.html");
const enemies = read("public", "client-enemies.js");
const world = require(path.join(root, "public", "shared", "world-content.js"));
const pkg = JSON.parse(read("package.json"));

assert.strictEqual(pkg.version, "0.6.11.471");
assert.strictEqual(world.version, 414);
assert(server.includes('const BUILD_VERSION = "6-11-471";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-471";'));

// Authored structure UI icons are now the live menu/loot assets.
for (const name of ["wood_floor.png", "wood_wall.png", "wood_door.png"]) {
  assert(fs.existsSync(path.join(root, "public", "assets", "ui", name)), `missing refreshed ${name}`);
  const buf = fs.readFileSync(path.join(root, "public", "assets", "ui", name));
  assert.strictEqual(buf.readUInt32BE(16), 16, `${name} must be 16px wide`);
  assert.strictEqual(buf.readUInt32BE(20), 16, `${name} must be 16px high`);
}
assert(html.includes('assets/ui/wood_floor.png?v=431'));
assert(html.includes('assets/ui/wood_wall.png?v=431'));
assert(html.includes('assets/ui/wood_door.png?v=431'));
assert(enemies.includes('assets/ui/wood_floor.png?v=431'));

// Roof remains deliberately uniform; only the outer silhouette gets special treatment.
assert(game.includes('Keep the authored roof tile completely uniform'));
assert(game.includes('const ROOF_EDGE_DARK ='));
assert(game.includes('const ROOF_EAVE_LIGHT ='));
assert(game.includes('if (north) ctx.fillRect(edgeLeft, edgeTop'));
assert(game.includes('ctx.fillRect(edgeLeft, edgeBottom - 2, edgeRight - edgeLeft, 2)'));
assert(!game.includes('roofTileVariant'), 'v396 must not introduce alternating/variant roof tiles');

// Client presentation: weapon/projectile art cannot pass through walls or closed doors.
assert(game.includes('function structureWallImpactPoint('));
assert(game.includes('const blocks = BUILD_WALL_STRUCTURE_KINDS.includes(structure?.kind) ||'));
assert(game.includes('structure?.kind === "woodDoor" && !doorVisuallyOpen(structure)'));
assert(game.includes('function applyHeldItemStructureVisibilityClip(camX, camY)'));
assert(combat.includes('structureWallImpactPoint(') && combat.includes('previousX') && combat.includes('projectile.y'));
assert(combat.includes('structureLineOfEffectClear('));

// Server authority: Wood Walls and closed Wood Doors block damage.
assert(server.includes('function serverWoodWallImpact('));
assert(server.includes('function serverDoorCurrentlyOpen('));
assert(server.includes('structure?.kind === "woodDoor" && !ignoreDoors && !serverDoorCurrentlyOpen(structure)'));
assert(server.includes('function serverLineOfEffectClear('));
assert(server.includes('validateSharedEnemyMeleeHit('));
assert(!server.includes("validateSharedEnemyBowMeleeHit"));
assert(server.includes('validateSharedEnemyMeleeHit(') && server.includes('serverLineOfEffectClear('));

// Living enemies keep cached 16px routes that PLAN through doors while movement respects closed doors.
assert(server.includes('navigationPlanning = false'));
assert(server.includes('ignoreStructureDoors: Boolean(navigationPlanning)'));
assert(server.includes('{ ignoreDoors: true }'));
assert(server.includes('function enemyStructurePath('));
assert(server.includes('function enemyStructureChaseVector('));
assert(server.includes('structureNavRevision += 1'));
assert(server.includes('expiresAt: now + 750'));
assert((server.match(/enemyStructureChaseVector\(/g) || []).length >= 7, 'current living chase/exit paths should use structure navigation');
assert(server.includes('goblin.attackCooldown <= 0 &&') && server.includes('serverLineOfEffectClear(\n          goblin.mapId'), 'goblin lunge must require clear wall line-of-effect');

console.log('v396 structure combat/navigation regression OK: uniform roof-edge polish, refreshed icons, wall-blocked current combat, and door-aware cached navigation.');
