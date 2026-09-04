"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const scaling = require(path.join(root, "public/shared/ability-scaling.js"));
const balance = require(path.join(root, "public/shared/combat-balance.js"));
const rainField = require(path.join(root, "public/shared/rain-field.js"));

function approx(actual, expected, tolerance = 0.001) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

assert.strictEqual(scaling.rainCloud.maxLevel, 20);
approx(scaling.rainCloudGrassSlowPercentAtLevel(1), 10);
approx(scaling.rainCloudGrassSlowPercentAtLevel(20), 30);
approx(scaling.rainCloudGrassSpeedMultiplierAtLevel(1), 0.90);
approx(scaling.rainCloudGrassSpeedMultiplierAtLevel(20), 0.70);
approx(scaling.rainCloudCooldownAtLevel(1), 30);
approx(scaling.rainCloudCooldownAtLevel(20), 20);
approx(scaling.rainCloudCastTimeAtLevel(1), 2.0);
approx(scaling.rainCloudCastTimeAtLevel(20), 0.5);
assert.strictEqual(rainField.CELL_LIFETIME, 30);

assert.strictEqual(scaling.hallucination.maxLevel, 20);
approx(scaling.hallucinationBlinkRangeAtLevel(1), 30);
approx(scaling.hallucinationBlinkRangeAtLevel(20), 60);
approx(scaling.hallucinationDecoyDurationAtLevel(1), 2.0);
approx(scaling.hallucinationDecoyDurationAtLevel(20), 5.0);
approx(scaling.hallucinationCooldownAtLevel(1), 20);
approx(scaling.hallucinationCooldownAtLevel(20), 15);

assert.strictEqual(balance.profileForAttack("fireball", 2).damageType, "magic");
assert.strictEqual(balance.elementForAttack("fireball", 2), "fire");
assert.strictEqual(balance.elementForAttack("fireballBurnTick", 2), "fire");
assert.strictEqual(balance.elementForAttack("rain", 2), "neutral");
approx(balance.monsterElementMultiplier("slime", "fire"), 1);

const input = fs.readFileSync(path.join(root, "public/client-input.js"), "utf8");
const game = fs.readFileSync(path.join(root, "public/game.js"), "utf8");
const network = fs.readFileSync(path.join(root, "public/client-network.js"), "utf8");
const magus = fs.readFileSync(path.join(root, "public/client-magus-abilities.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
assert(input.includes("player.abilityPoints += 3;"));
assert(input.includes('"+3 AP"'));
assert(game.includes("player.abilityPoints += 3;"));
assert(network.includes('jesterBlink: abilityLevel("jesterBlink")'));
assert(game.includes('onlineClient.sendLocalState(true)'));
assert(server.includes("removeServerRainGrassForOwner(ownerId);"));
assert(server.includes("ABILITY_SCALING.rainCloudGrassSpeedMultiplierAtLevel"));
assert(server.includes("ABILITY_SCALING.hallucinationDecoyDurationAtLevel"));
assert(magus.includes("startHallucinationCooldown(Date.now());"));
assert(magus.includes('const cooldownRemaining = skillCooldownRemaining("jesterBlink");'));
assert(magus.includes('updateAbilityCooldownHud();'));
assert(game.includes('function updateAbilityCooldownHud()'));
const app = fs.readFileSync(path.join(root, "public/client-app.js"), "utf8");
assert(app.includes('updateAbilityCooldownHud();'));
assert(indexHtml.includes('/client-magus-abilities.js?v=368'));
assert(indexHtml.includes('/client-app.js?v=368'));
assert(!indexHtml.includes('?v=310'));
assert(!indexHtml.includes('?v=308'));
assert(!indexHtml.includes('?v=307'));
assert(!indexHtml.includes('?v=305'));
assert(magus.includes("lifetime runs inside this timer"));
assert(!magus.includes("cooldownStartedAtMs: Number(jesterClone.expiresAtMs)"));

assert(magus.includes("player.rainCloudCastDuration = rainCloudCastTimeAtLevel();"));
assert(server.includes("rainCloudCastDuration, 0.05, 2, 0.50"));
assert(game.includes('displayKind = "return"'));
assert(game.includes('hudSlot.classList.toggle("return-window", returnWindow)'));
assert(indexHtml.includes('.ability-slot.return-window .ability-cooldown-mask'));

console.log("Ability scaling + elemental damage checks passed.");
