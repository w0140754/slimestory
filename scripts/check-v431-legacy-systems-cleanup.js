"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const pkg = JSON.parse(read("package.json"));
const html = read("public", "index.html");
const game = read("public", "game.js");
const input = read("public", "client-input.js");
const abilities = read("public", "client-actions.js");
const tigerPaw = read("public", "client-tiger-paw-actions.js");
const combat = read("public", "client-combat.js");
const network = read("public", "client-network.js");
const world = read("public", "client-world.js");
const fire = read("public", "client-fire-environment.js");
const status = read("public", "client-status.js");
const app = read("public", "client-app.js");
const server = read("server.js");
const balance = require(path.join(root, "public", "shared", "combat-balance.js"));

assert.strictEqual(pkg.version, "0.6.11.468");
assert(server.includes('const BUILD_VERSION = "6-11-468";'));
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-468";'));
assert(!fs.existsSync(path.join(root, "public", "shared", "ability-scaling.js")));
assert(!fs.existsSync(path.join(root, "public", "shared", "camouflage-rules.js")));
assert(!fs.existsSync(path.join(root, "public", "assets", "skills")));

const runtime = [html, game, input, abilities, tigerPaw, combat, network, world, fire, status, app, server].join("\n");
for (const retired of [
  "focusFire", "wandMastery", "hallucination", "jesterBlink", "shadowHide",
  "camouflage", "hunterSnare", "skillBindings", "abilityPoints", "skillPoints",
  "statPoints", "classResetConfirm", "skillsPage", "statsPage", "pvpPage",
  "menuSkillHotkeyRail", "environmentReward", "utilityHotbarAssignments",
  "utilityHotbarCustomized", "menuUtilityHotkeyRail", "updatePvpUi",
  "pvpToggleButton", "pvpStatusBadge"
]) {
  assert(!runtime.toLowerCase().includes(retired.toLowerCase()), `retired runtime token survived: ${retired}`);
}

for (const retiredFile of ["map-editor.html", "map-editor.css", "map-editor.js"]) {
  assert(!fs.existsSync(path.join(root, "public", retiredFile)), `${retiredFile} must stay removed`);
}
assert(!server.includes("/dev/map-editor"));
assert(!server.includes("X-Slime-Story-Editor"));


// Retired high-traffic compatibility protocols and dead persistent-state
// shims must stay gone. The later compact Rain Field backend is retired too;
// Tiger Paw Hurl is mob-only and current chests use chestContext* packets.
for (const retiredProtocol of [
  "rainGrassSpawn", "rainGrassState", "playerDamageRequest", "playerIgniteRequest",
  "rockMotion", "rockState", "handleRockHurlAction", "handleTreasureOpen",
  "handleChestToggle", "openedTreasureIds", "shopPurchases",
  "SHOP_PURCHASE_HISTORY_ITEM_IDS", "rainFieldDelta", "transientActionSnapshot",
  "temporaryRainGrass", "startServerRainCloud"
]) {
  assert(!runtime.includes(retiredProtocol), `retired compatibility token survived: ${retiredProtocol}`);
}
assert(server.includes("playerCarriesHurlEnemy("), "current mob-only Tiger Paw Hurl must remain");
assert(server.includes('case "chestContextOpen"') && server.includes('case "chestContextClose"'), "current chest context protocol must remain");
assert(server.includes("const TRANSFERABLE_EQUIPMENT_ITEM_IDS = new Set(["), "current transferable equipment token catalog must remain");

// The PvP page had already been removed and no current control could enable
// PvP, so the unreachable combat protocol/state is retired too. The old
// client-sent Rain heal request was likewise unreachable after potions became
// server-authoritative consumables.
for (const retiredRuntime of [
  "pvpEnabled", "pvpCombatUntil", "pvpToggle", "pvpAttack", "drawPvpMarker",
  "playerHealRequest", "requestPlayerHeal", "handlePlayerHeal"
]) {
  assert(!runtime.includes(retiredRuntime), `retired unreachable runtime token survived: ${retiredRuntime}`);
}
assert(!runtime.includes("environmentCatalog"), "client-uploaded environment catalog protocol must stay removed");
assert(server.includes("function initializeSharedEnvironmentFromWorldContent()"), "server must initialize mutable environment from WORLD_CONTENT");
for (const retiredInboundAlias of ["enemyHeal", "enemyHitPlayer", "treasureResult"]) {
  assert(!network.includes(`message.type === "${retiredInboundAlias}"`), `retired inbound alias survived: ${retiredInboundAlias}`);
}

// The v422+ live equipment dock replaced the old hidden gear chooser panels.
// Armor is equipped from the inventory via click/drag/double-click instead of
// maintaining a second invisible copy of every equipment choice in the DOM.
for (const retiredGearUi of ["gearHeadPanel", "gearShirtPanel", "gearPantsPanel", "gearCharmPanel", "data-gear-panel", "hat-choice", "shirt-choice", "pants-choice", "charm-choice", "weapon-choice"]) {
  assert(!runtime.includes(retiredGearUi), `retired gear chooser token survived: ${retiredGearUi}`);
}
assert(html.includes('data-equipment-slot="head"') && html.includes('data-equipment-slot="charm"'), "current compact equipment dock must remain");
assert(!game.includes("equipmentAttributeRequirements"), "level-only equipment gates should not retain the old attribute-requirement wrapper");

// Coordinate-world water is terrain-defined. The legacy mutable `pond` box
// was removed, so map activation must never try to copy state.pond into a
// deleted global (which would crash immediately on startup).
assert(!game.includes("state.pond"), "legacy state.pond activation path must stay removed");
assert(!game.match(/\bpond\.(x|y|width|height)\s*=/), "legacy mutable pond box must stay removed");
assert(!read("public", "client-maps.js").includes("pond:"), "map state must not carry the retired dummy pond rectangle");

// The compact Rain Field registry was itself retired in v442 once the final
// Rain Cloud cast entry point disappeared. No shared module or runtime registry
// should survive from that ability backend.
assert(!fs.existsSync(path.join(root, "public", "shared", "rain-field.js")));
assert(!world.includes("temporaryRainGrassFields"));
assert(!network.includes("rainFieldDelta"));
assert(!server.includes("activeServerRainFields"));

// Loose rocks were removed from Tiger Paw carry/hurl in v415. The renderer must
// not retain the deleted rockCarrier helper or other carry-only rock state.
assert(!app.includes("rockCarrier("), "renderer must not call retired rockCarrier helper");

// onlineClient is intentionally null for a short startup window before the
// OnlineClient instance is constructed. Item-action helpers must tolerate that
// state rather than dereferencing localPlayerId/connected during early input.
assert(tigerPaw.includes("!onlineClient?.localPlayerId"), "Tiger Paw local carry helpers must tolerate null onlineClient");
assert(tigerPaw.includes("!onlineClient?.connected"), "Tiger Paw action helper must tolerate null onlineClient");

// Superseded sprite revisions that were kept only for cache/history baggage are
// intentionally absent from the runtime package.
for (const retiredAsset of [
  "pickaxe_v1.png", "pickaxe_v2.png", "pickaxe_v3.png", "pickaxe_v4.png", "pickaxe_v5.png",
  "sapgem_wand_v1.png", "sapgem_wand_v2.png", "sapgem_wand_v3.png",
  "wood_ring_v1.png", "wood_ring_v2.png", "crab_v1.png", "shopkeeper_npc_v1.png",
  "fire_resistant_tree_canopy_v3.png", "grassyrock.png", "ui/wood_roof.png"
]) {
  assert(!fs.existsSync(path.join(root, "public", "assets", retiredAsset)), `${retiredAsset} must stay removed`);
}

// Equipment requirements are level-only.
assert(game.includes("const EQUIPMENT_LEVEL_REQUIREMENTS = Object.freeze({"));
assert(game.includes("function equipmentMissingRequirements(itemId)"));
assert(game.includes("Requires Lv"));
assert(!/requires?\s+(str|dex|int|luk|luck|class)/i.test(game));
assert(!game.includes("Level/class requirements"));
assert(game.includes("Prices vary by item · Level requirements apply · Esc to close"));

// Outgoing damage is equipment/action power + enemy defenses/level, with no
// player class/stat/mastery input.
assert.strictEqual(balance.calculateAttackPower(0), 8);
assert.strictEqual(balance.calculateMagicPower(12), 15);
assert(!read("public", "shared", "combat-balance.js").match(/strength|dexterity|intelligence|\bLUK\b|wandMastery/i));

// The retired Fire/Rain Wand item-action layer was removed later. Tiger Paw is
// still the current mob-only item action and must remain intact.
assert(!combat.includes('if (currentWeapon === "wand")'));
assert(!combat.includes('if (currentWeapon === "rainWand")'));
assert(combat.includes('if (currentWeapon === "tigerPaw")') && combat.includes("tryCastHurl();"));
assert(tigerPaw.includes('if (equippedWeapon() !== "tigerPaw") return false;'));
assert(!app.includes("updateHotbarActionCooldownHud"));
assert(!app.includes("updateAbilityCooldownHud"));

// Retired gathering/talent progression was a no-op and should no longer be
// serialized or updated at runtime.
assert(!game.includes("awardWoodcuttingExp"));
assert(!game.includes("awardMiningExp"));
assert(!game.includes("awardFlowerHarvestingExp"));
assert(!game.includes("player.woodcutting"));
assert(!game.includes("player.flowerHarvesting"));

console.log("v431 legacy cleanup OK: retired skills/classes/editor/talent code removed; level-only gear and current item actions remain.");
