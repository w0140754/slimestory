# v6-11-226 Deep Code Review

Source reviewed: v6-11-225 Slow Wand Recovery Tune.

## Scope

This review deliberately excludes gameplay tuning and network optimization. The goal is to remove code that current execution cannot reach, remove compatibility shims whose callers are gone, and create a safe physical boundary for a larger client-first refactor.

## Before / after

- v225 `public/index.html`: 30,981 lines, including the entire client game script inline.
- v226 `public/index.html`: 4,116 lines.
- v226 `public/game.js`: 25,990 lines.
- v225 inline client script had 579 named top-level function declarations; v226 has 541.
- **38 named client functions were removed.** No new gameplay function was introduced.
- All 6 existing client classes (`GameState`, `OnlineClient`, `InputController`, `GameSimulation`, `GameRenderer`, `GameApp`) are text-identical to v225.
- Of the 541 surviving named client functions, only `updateSkillBindingUi` differs from v225, and only because its call to the removed no-op `renderSkillDetailPanel()` was deleted.
- Post-cleanup declaration-reference audit: 0 declaration-only top-level functions and 0 declaration-only top-level variables in both client and server.

## Removed client remnants

### Old local-authority combat/enemy code
- `RANGED_HIT_PROFILES` / `applyRangedHit`
- `calculateLocalCombatDamage`
- `killSlime`, `killGoblin`, `killGhost` no-op death paths
- local slime `updateSlimeBurn`, `updateSlimeAi`, `updateSlimeKnockback`
- old slime/goblin/ghost reset/wander/movement helpers
- orphaned clone-target helper used only by the removed local slime AI
- old local `projectileDamage` config values used only by `applyRangedHit`

### Abandoned test/duplicate helpers
- combat-test dummy object and hit/draw helpers
- old `drawCoins` renderer (current renderer owns coin drawing)
- old `drawSlashEffect` renderer
- declaration-only collision helpers (`hitsSlime`, `hitsRockObstacle`)
- unused local Fireball-water/vegetation restore helpers

### UI/input compatibility remnants
- unused `keys = inputController.keys` alias
- removed permanent skill-detail-panel no-op/call and unused skill-tree scroll-arrow no-op
- declaration-only inventory/skill helpers such as `removeInventoryItem`, `enhancementIconMarkup`, `meetsAbilityRequirement`, `cycleHat`, and snare-placement query helper

## Removed server/shared compatibility remnants

- unused `applyServerPlayerWet` helper
- unused `sharedEnvironmentSnapshot` helper
- unused `MEADOW_POND` constant
- pre-v197 conversion of immutable perimeter trees from mutable `entities` into `staticTrees`; current clients already use `staticTrees` directly
- numeric legacy `Defense` input accepted by `mitigatePlayerDamage`
- stale `playerDefenseRatingPerPoint`, `playerDefenseFromGear`, and `playerDefenseMultiplier` exports

Current immutable perimeter trees are still explicitly prevented from entering the mutable environment registry.

## Refactor risks identified

1. **Global-state density.** `game.js` still has broad cross-section access to globals. Moving code should be done in order-preserving slices before introducing stricter module scopes.
2. **Authority history.** Some systems have both presentation code and remnants of former local simulation. The dead local enemy layer was removed, but future extraction must keep server authority obvious.
3. **Network sensitivity.** `OnlineClient` and server combat/environment code contain the existing map-scoped, passive-vs-precise, and diagnostics work. Do not rewrite these while merely moving files.
4. **Initialization order.** The original giant classic script benefits from whole-file function hoisting. Splitting files can expose load-order assumptions. Each extraction needs a boot + browser gameplay test.
5. **Protocol-shaped compatibility.** One non-airborne Fireball fallback remains. Current Fireballs use the arced/airborne path, but it should be removed only in an isolated combat patch after validating current visual-effect payloads.

## Recommended next extraction

Do **not** split `OnlineClient` first. Start with the lowest-side-effect client declarations and pure helpers, then world/environment sections, then combat/entities, and only then networking/app shell. This minimizes the chance that a structural change touches packet behavior while the codebase is still highly global.

See `REFACTOR_PLAN.md` for the staged sequence and test guardrails.
