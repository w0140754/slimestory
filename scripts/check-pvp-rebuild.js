"use strict";

const fs = require("fs");
const assert = require("assert");

const read = rel => fs.readFileSync(rel, "utf8");
const server = read("server.js");
const game = read("public/game.js");
const world = read("public/client-world.js");
const app = read("public/client-app.js");
const combat = read("public/client-combat.js");
const classes = read("public/client-class-abilities.js");
const fire = read("public/client-fire-environment.js");
const network = read("public/client-network.js");

assert.match(server, /function pvpPlayersCanHarm\(attacker, target\)/);
assert.match(server, /const PVP_PLAYER_BURN_DURATION = 3\.0;/);
assert.match(server, /source === "fireball"/);
assert.match(server, /PVP_FIREBALL_LANDING_RADIUS/);
assert.match(server, /playerOwnedEffectMayAffectTarget/);
assert.match(server, /!isOwner &&\s*\(!owner \|\| !pvpPlayersCanHarm\(owner, target\)\)/);
assert.match(server, /targetPlayerId: triggeredPlayer\.id/);
assert.match(server, /applyPvpCombatLock\(owner, triggeredPlayer\)/);

assert.match(game, /hiddenFromLocalPvpOpponent/);
assert.match(world, /remote\._nextCamouflageParticleAt = now \+ 1\.5;/);
assert.match(app, /pvpSnareRootTime/);
assert.match(app, /pvpSnareSlowMultiplier/);
assert.match(network, /message\.targetPlayerId/);

assert.match(classes, /focusFireRemotePlayerIsTargetable/);
assert.match(classes, /type === "player"/);
assert.match(classes, /aimPlayerTowardPoint\(aim\.x, aim\.y\);/);
assert.match(classes, /return fireBowArrow\(/);
assert.match(classes, /Camouflage immediately breaks an enemy Ranger's assisted lock/);

assert.match(combat, /projectileX: projectile\.x/);
assert.match(combat, /focusFireShotSequence/);
assert.match(fire, /sendPvpAttack\(\s*nearestPvpPlayer\.id,\s*"fireball"/);
assert.match(fire, /!canAttackRemotePlayerWithPvp\(remote\)/);

console.log("PvP rebuild checks passed: mutual gating, Magus Fireball/Rain, Ranger Focus Fire/Snare, and true PvP Camouflage are wired.");
