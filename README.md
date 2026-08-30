# Slime Story

## v6-11-300 — Large-map coordinate authority fix

- Fire/environment actions now validate against each map's real WORLD_CONTENT dimensions instead of the legacy 640×400 prototype bounds.
- Fixes Fireball impacts visually landing in one place while the server ignites vegetation near the old 640×400 boundary on larger maps.
- Fixes otherwise valid trees/vegetation beyond that legacy boundary appearing impossible to burn.
- Hallucination/taunt coordinates now use the target enemy map's real dimensions for the same reason.

## v6-11-299 — PvP rebuild: Magus + Ranger

PvP now uses one mutual opt-in gate for player-created harmful effects instead of the older basic-attack-only exceptions.

- **Magus:** Fireball can directly hit opted-in players and applies a shorter 3-second PvP Burn. Rain Cloud can Wet/slow opted-in opponents and extinguish their Burn. Player-owned environment fire chains cannot harm a non-PvP player.
- **Ranger:** Focus Fire can lock opted-in players. Each barrage arrow aims at the locked player's position when that individual arrow is released; arrows never home after launch. Entering Camouflage breaks assisted Focus Fire lock. Hunter's Snare can root/slow opted-in players.
- **Camouflage PvP:** a camouflaged Ranger is completely hidden from a mutual-PvP opponent (including equipment/reflection/PvP marker). The opponent instead gets a small leaf-particle tell about every 1.5 seconds. Unguided attacks can still physically hit the hidden Ranger if they pass through the correct location.
- Existing 50% PvP damage scaling and the 10-second combat toggle lock remain in place.
- Neutral/world hazards remain hazards; self-inflicted fire still works normally.

`npm run check` includes a PvP wiring regression check, and the server was smoke-tested with two real WebSocket clients for mutual Fireball damage/Burn, Focus Fire arrow damage, Hunter's Snare player triggering, and PvP-off rejection.

## v6-11-290 — Editor object coverage

The terrain-driven map editor now supports the remaining environment-object arrays already present in the shared map schema: **harvest flowers** and **houses**. Both can be placed, selected, moved, duplicated, deleted, exported/imported, and applied through the existing canonical map workflow. Harvest flowers expose White/Blue variants and enter the existing authoritative cut/burn/loot environment system. Houses expose Original/Red variants plus editable collision width/height and are converted into the existing runtime house/collision/path behavior on Prototype Island maps.

This pass intentionally does not migrate legacy NPC/workbench/crystal fixtures into `WORLD_CONTENT`; those remain hard-coded map fixtures for now and can be tackled as a separate editor-fixture milestone.


## v6-11-289 — World-content cache fix

Map Apply already writes the canonical map correctly. v289 fixes the remaining browser-cache problem discovered during live testing: after a restart the server could be on a newer world-content version while an existing browser tab still ran an older runtime map snapshot until a hard refresh.

The server now renders HTML with a world-versioned runtime map URL such as `/shared/world-content-runtime.js?build=6-11-289&world=20`. When an Apply advances the canonical map to W21 and the server restarts, the next page load points at a different URL (`world=21`), so the browser cannot reuse W20. HTML and runtime world-content responses also carry explicit no-store/no-cache headers. The existing client/server world-version mismatch detector remains as a fallback and its automatic reload will now fetch the newly versioned map URL.

Expected editor workflow: **edit → Apply Draft to Game → restart server → normal reload/open game**. Export/import remains optional backup/resume functionality, not part of applying a map.

This build was made from the user's current W20 project folder, so the latest Prototype Island edits are preserved.

# v0.6.11.287 — Apply Draft Runtime Sync Fix

This checkpoint closes the first complete visual map-editing loop: a draft can now be edited, exported, reopened, and deliberately adopted as the game's canonical shared map content.

## Editor workflow

1. Open `/map-editor.html` on the local Slime Story server.
2. Edit terrain and objects, or import a saved `.map-draft.json`.
3. Export whenever you want a portable backup.
4. Click **Apply Draft to Game** when the current working copy should become canonical.
5. Restart the Slime Story server and reload the browser before testing the adopted map.

The Apply button is intentionally restricted to loopback/local development requests. A hosted copy of the editor cannot rewrite the deployed project source.

## What adoption writes

Adopted maps are stored as plain JSON in:

- `content/adopted-map-overrides.json`

That JSON file is the single canonical adopted-map store. The Node runtime reads it on startup, and the local HTTP server now generates `/shared/adopted-map-overrides.js` directly from that same JSON on request with `Cache-Control: no-store`.

A generated `public/shared/adopted-map-overrides.js` file is still written as a portable/static-host fallback, but the Slime Story server no longer relies on that mirror when serving the game. This removes the browser/server divergence found while testing v286.

Each changed adoption increments the shared world-content version. Re-applying an identical map is idempotent and does not bump the version.

## CLI fallback

A saved draft can also be adopted without the editor UI:

```bash
npm run adopt-map -- path/to/prototypeIsland.map-draft.json
```

The same validation and generated override path are used by both the CLI and the local editor button.

## Safety boundaries

- Draft JSON is validated before source content is changed.
- Schema and map dimensions must match the current build.
- Duplicate/malformed object data is rejected.
- Portal target problems remain warnings so a work-in-progress map can still be adopted deliberately.
- The browser endpoint requires a localhost/loopback request plus the editor-specific request header.
- Applying does not hot-swap a running multiplayer server. Restart after a changed adoption.

## Included canonical map

The Prototype Island draft used to test v285 import/resume has been adopted into this build. Shared world content is now version 15.

## Verification

`npm run check` syntax-checks the client/server/editor, validates shared map data and terrain round-tripping, verifies import rules and editor DOM contracts, and tests adoption persistence/idempotence.

## v287 runtime-sync fix

During v286 testing an editor apply could advance the server-side canonical JSON while the playable browser still appeared to use an older generated browser mirror. v287 removes that mirror from the normal server path: both sides are now fed from `content/adopted-map-overrides.json`.

The editor also treats a successful Apply as its new saved baseline and tracks the newly assigned world-content version in the current tab, avoiding the confusing stale-version message seen in v286.
