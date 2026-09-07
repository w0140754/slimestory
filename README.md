## v6-11-413 — Stone Floor & World Features

- Added the user-authored **16×16 Stone Floor** as a full building surface. It is craftable at the Crafting Table as **Stone Floor ×4 for 2 Stone**, hotbar-assignable, persistent, reclaimable, and follows the same placement/support/roof/collision rules as Wood Floor. Wood Walls, Wood Doors, floor-mounted Torches, and the existing layered occupancy system all work on Stone Floor.
- Expanded deterministic coordinate-world variety with lightweight **ponds**, **meadows**, **tree rings**, and irregular **stone-floor patches**. Ponds reuse the existing water terrain/traversal system; meadows reuse grass/flower scenery; tree rings reuse existing trees; stone patches use the actual Stone Floor structure art.
- Added rare generated **houses/ruins on corner maps only**. Each world generation deterministically contains **0 or 1 most of the time, with a rare maximum of 2 total**. Complete houses use the normal enclosed-wall roof topology; ruins can have missing floors/walls and naturally remain unroofed when incomplete.
- Some generated houses/ruins can contain a **Treasure Chest**. Chests use the normal `F OPEN` interaction and grant a small deterministic bundle of coins/stone with a chance of wood. Opened-chest IDs persist with the character so the same chest cannot be repeatedly farmed.
- **Network traffic stays lightweight:** all generated ponds/scenery/houses/ruins/stone patches are deterministic `WORLD_CONTENT` already present on client and server and are deliberately excluded from player-built structure snapshots. Treasure uses a single request + private response only when opened; there is no polling, heartbeat, or recurring map-feature packet stream. Enemy positions remain runtime-generated server-side rather than authored into the maps, and runtime spawn selection now avoids water and generated-building reservation areas.
- The completed v412 lighting system is unchanged. Generated structures simply participate in the existing collision, roof, attachment, and lighting systems.
- Regression: **32 syntax targets + 98 retained checks/smokes** pass, including Stone Floor craft/place/support, generated-feature topology, zero-idle static-structure replication, runtime spawn safety, and one-time Treasure Chest interaction. Server startup and `/health` pass as build **6-11-413** / world content **413**.

## v6-11-412 — Floor Torch Room Occlusion Fix

- Fixed exterior floor/ground Torches illuminating the inside of a completed building when the Torch is placed immediately beside a wall. The visible flame is intentionally drawn above the Torch base, but that screen-space projection no longer decides which side of a structural boundary the light belongs to.
- Floor/ground Torches now use their **physical placement anchor** for world-space visibility, wall occlusion, and interior/exterior roof-region classification, while the radial light gradient remains centered on the raised flame. In the reported south-wall case, the flame may visually extend one pixel across the wall plane without becoming an interior light source.
- Expanded the visibility-polygon envelope by the render-origin/occlusion-origin offset so this topology correction does not clip or shrink the established v410/v411 Torch radius in open space.
- Wall-mounted Torches keep their existing explicit mount-side origin, wall-face propagation, roof masking, darkness/flicker, and player-independent surface lighting. No building topology, placement, collision, world generation, enemy spawning, or networking cadence changed.
- Regression: **32 syntax targets + 96 retained checks/smokes** pass, including a dedicated v412 geometry case reproducing an exterior floor Torch whose raised flame crosses the south-wall centerline while its physical anchor remains outside. Server startup and `/health` pass as build **6-11-412** / world content **412**.

## v6-11-411 — Enclosed Wall Roof Topology

- Automatic roofs now treat **walls and doors as true separators between floor surfaces**. Adding a Wood Floor immediately outside a completed house no longer merges that porch/deck tile into the interior or removes the roof.
- A roof still requires every exposed edge of the enclosed interior floor region to be closed by a Wood Wall or Wood Door. Removing a real boundary still opens the structure and removes the roof.
- Added shared `structure-topology.js`, used by both client and server, so roof membership is calculated from the same topology rules everywhere instead of duplicating the algorithm.
- Introduced explicit structure occupancy channels for future layered building work: **base → surface → object → boundary → attachment**. Current Wood Floors are surface content, Wood Walls/Doors are boundary content, floor-mounted Torches are object content, and wall-mounted Torches are attachment content. Object/attachment layers do not affect roof detection. This is groundwork only; generic furniture placement is not enabled yet.
- Preserved the completed v410 lighting system unchanged, including wall-surface propagation, roof light masking, interior/exterior occlusion, darkness balance, and Torch behavior.
- Regression: **32 syntax targets + 95 retained checks/smokes** pass, including new v411 topology and live WebSocket exterior-floor roof tests. Server startup and `/health` pass as build **6-11-411** / world content **411**.

## v6-11-410 — Roof Surface Lighting Occlusion Fix

- Fixed the small exterior-roof light leak visible when a Torch is burning inside a completed building. The roof is now treated as its own projected lighting surface instead of inheriting light carved into the ground or hidden wall sprites underneath it.
- Visible roof pixels are reset to ambient darkness **after** wall-facade lighting is resolved, matching the real render order where the roof is drawn on top of the walls. This specifically prevents an illuminated interior/back-wall rectangle from appearing as a bright band across the outside roof.
- Interior Torch sources are classified from their existing visibility origin and cannot re-light any exterior roof surface. This covers both placed wall/floor Torches and held Torches inside an enclosed room without adding any network traffic.
- Exterior Torches still receive an explicit roof-surface lighting pass, so fixing the interior leak does not simply make roofs permanently immune to nearby outside light.
- Preserved v409 wall-surface propagation, v408 canonical structure geometry, existing Torch radius/flicker/night darkness, roof reveal behavior, building placement/collision, world definitions, runtime enemy generation/spawning, and networking cadence.
- Regression: **31 syntax targets + 93 retained checks/smokes** pass, including a new v410 roof-surface ordering/interior-source regression. Server startup and `/health` pass as build **6-11-410** / world content **410**.

## v6-11-409 — Wall Torch Surface Lighting Fix

- Fixed wall-mounted Torch illumination changing when the local player walks to a different side of a wall. Stationary wall lighting is no longer keyed to the player's side of each individual wall segment.
- Completed roofed structures now choose the illuminated wall face from the existing interior/exterior roof-reveal state. Standalone or incomplete walls keep their single visible facade available to nearby Torch light without introducing a hidden opposite-face dependency.
- Wall-face line-of-sight now traces to a point just outside the **near face** of the canonical wall boundary instead of the wall centerline. This prevents the mounted Torch's own support wall—and coplanar neighboring wall collisions—from prematurely blocking the facade-light ray.
- As a result, mounted Torch light can spread continuously across adjacent connected horizontal or vertical wall segments while ordinary ground-plane light remains blocked by the same canonical wall/closed-door barrier used in v408.
- The shared structure geometry API now exposes `offsetBoundaryPointToSide()` and advances to geometry API version 2. No world generation, enemy spawning, building placement, Torch radius, darkness curve, networking cadence, or server-authoritative collision rules were changed.
- Regression: **31 syntax targets + 92 retained checks/smokes** pass, including a new v409 wall-surface lighting regression covering horizontal and vertical coplanar propagation. Server startup and `/health` pass as build **6-11-409** / world content **409**.

## v6-11-408 — Structure Geometry Refactor

- Consolidated Wood Wall and Wood Door geometry into a new shared `structure-geometry.js` module used by both server and client. Boundary segments, collision rectangles, draw-sort depth, boundary-side tests, and light barriers now derive from the same canonical structure coordinates instead of being recreated independently by each subsystem.
- Separated **physical blocking**, **visual held-item occlusion**, and **light-surface rendering**. Combat/projectile collision continues to use authoritative physical geometry, while held-item draw order can remain visually in front of a wall when the player is below it without weakening wall collision.
- Reworked Torch lighting around the canonical boundary model. General light still stops at Wood Walls and closed Wood Doors, then visible wall/door faces receive a separate same-side light pass. This lets a wall-mounted Torch illuminate the face it is attached to while preventing an exterior light source from brightening the opposite/interior wall face.
- Wall-mounted Torch side metadata now uses the same shared boundary-side helper on the server and client, eliminating separate placement/light interpretations of north/south/east/west wall sides.
- Added durable, change-only multiplayer replication for `heldBuildPiece`. Other players can now see a player holding a Torch, and every client derives that remote held Torch's wall-occluded light locally. Holding/unholding sends a player-state change only; there is **no new Torch heartbeat or continuous lighting packet stream**.
- Remote held build items now use the same empty-hand/held-item rendering rules and wall visual-occlusion path as the local player. Placed Torch replication and attachment/reclaim behavior are unchanged.
- Preserves v407 bounded all-map night hostility, deeper midnight darkness, Spawn's special night-Slime pressure, v406 mounted Torches, v405 single-target basic attacks/staggered Slime hops, and all existing building/world generation systems. World definitions are unchanged apart from the 407→408 build marker.
- Regression: **31 syntax targets + 91 retained checks/smokes** pass, including a new shared-geometry check and a WebSocket smoke proving held Torch hold/unhold state reaches another client as a change-only player-state delta. Server startup and `/health` pass as build 6-11-408.

## v6-11-407 — Night Hostility & Lighting Polish

- Held-item visual occlusion now follows the same world Y-sort used for wall/player draw order. A wall can still block the attack mechanically, but if the player is standing below/in front of that wall the held sword/tool/torch remains visible in front instead of being clipped away.
- Wall-mounted Torches now locally brighten the painted Wood Wall face they are attached to while the normal visibility polygon still blocks light from crossing the wall boundary. This is a client-only facade wash and adds no network traffic.
- Night ambient darkness is deeper across the full cycle: darkness begins stronger at 20:00, peaks at **0.92 alpha around midnight**, then eases toward the existing 05:00 dawn.
- All ordinary mobs on occupied maps become hostile at night inside a **208 px detection radius**. A **248 px disengage radius** provides hysteresis so enemies do not rapidly promote/demote at the edge.
- Spawn's special night-only Slimes retain their existing relentless/infinite-range night aggro and sunrise retreat behavior. Ordinary mobs outside the 208 px detection radius remain on the existing passive intent stream, avoiding a map-wide 8 Hz precise-motion traffic spike.
- No new AI/lighting network message type or heartbeat was added; nighttime hostility reuses existing aggro state and movement replication.
- Preserves v406 mounted-Torch attachment/reclaim rules, v405 single-target basic attacks and staggered Slime hops, v404 first-snapshot fake-death prevention, v403 night-Slime roaming, and all existing building/combat/world systems.
- Regression: **30 syntax targets + 89 retained checks/smokes** pass, including a new WebSocket smoke proving an ordinary runtime Slime on a non-Spawn map acquires a nearby player at night. Server startup and `/health` pass as build 6-11-407.

## v6-11-406 — Held Occlusion & Mounted Torches

- Removed the experimental house-only interior-darkness overlay entirely. Ambient darkness is once again owned by the normal world day/night lighting, with real Torch sources providing the contrast.
- Reverted the v405 wall-face lighting carve so placed Torch occlusion uses the proven v402 wall/closed-door visibility polygon without the extra interior-wall exception.
- Rebuilt local held-equipment occlusion around one player-centered visibility mask. Held arms, ordinary weapons/tools, Bow sprite/string/nock, and the carried Torch now share the same wall/closed-door occlusion path instead of separate pose probes.
- Carried-Torch lighting keeps the visible flame center but can use a safe visibility origin on the player's side of a nearby house boundary, preventing the room from going dark just because the visible flame reaches across the wall.
- Torches can now be placed normally on open ground, mounted on a Wood Floor, or mounted on a Wood Wall. Wall mounts store which side the placing player was on so their wall-occluded lighting starts from the correct side of the boundary.
- A Wood Floor or Wood Wall with an attached Torch is protected by an attachment-first Pickaxe rule: the first removal attempt reclaims/drops the Torch and leaves the support intact; a later swing can remove the support normally.
- One Torch may be attached to a given Floor/Wall support at a time. Mounted Torches remain cosmetic/non-colliding and use the existing shared structure replication only; no new lighting or attachment heartbeat was added.
- Retains v405 desynchronized Slime hopping and single-target basic attacks, v404 first-snapshot fake-death prevention, v403 night-Slime roaming, v402 structure AI/building dependency rules, and all existing world/combat systems.
- Regression: **30 syntax targets + 87 retained checks/smokes** pass, including the new mounted-Torch WebSocket lifecycle covering Floor/Wall mounting, duplicate prevention, and attachment-first Pickaxe reclaim. Server startup and `/health` also pass as build 6-11-406.

## v6-11-405 — Visual & Basic Combat Refinement

- House interior darkness now appears only while the local player is inside/revealing the completed house; the darkness mask extends one tile farther north and south without widening.
- Held weapons/arms now clip against the exact wall/closed-door boundary plane rather than the thicker collision rectangle; separately drawn bowstrings/nock use the same wall clipping.
- Interior torch light can illuminate the visible inside face of completed-house boundary walls while the boundary still blocks light from leaking outdoors.
- Standard slime hopping uses a deterministic per-enemy presentation phase derived locally from enemy identity, removing synchronized group bouncing with zero added network traffic.
- Basic melee weapon/tool attacks and bow melee now damage at most one enemy per swing; Wand Mastery keeps its deliberate multi-target behavior.
- v404 first-snapshot fake slime death fix is retained unchanged.

## v6-11-404 — Interior Darkness & Precise Weapon Occlusion

- Completed enclosed player-built houses now retain a local ambient interior shadow even during daytime. Night darkness stacks with that room shadow, so an unlit house becomes substantially darker after sunset and near midnight.
- Existing held and placed Torch lighting carves through the interior-darkness layer using the same v402 wall/closed-door occlusion polygons, so interior torches illuminate rooms naturally and exterior light can still spill through an open doorway without any new network traffic.
- Replaced the v397 proximity-only held-equipment clipping rule with actual segment-vs-structure intersection tests. A nearby wall no longer clips a weapon merely because the player is close to it; the current arm/weapon pose must physically cross that specific Wood Wall or closed Wood Door.
- Held-arm clipping now follows the shoulder-to-hand segment, while weapon/tool/torch clipping follows the hand-to-equipment direction. This fixes false clipping below houses and when attacking away from a nearby upper wall while preserving genuine through-wall occlusion.
- Fixed a client initialization artifact where an authoritative first enemy snapshot could be interpreted as an alive-to-dead transition. Dormant server-side enemy pools, especially inactive night Slimes, no longer emit a fake Slime death effect when a player first connects/spawns.
- Preserves v403 night-Slime local roaming/sunrise retreat, v402 organic structure approach AI and wall-occluded lighting, v401 Torch crafting/reclaim, current building dependency rules, and all existing world/combat systems.

## v6-11-403 — Night Slime Roam Behavior

- Night-wave slimes no longer use their map-edge entry point as a combat disengage "home."
- While night is active, a night slime that temporarily has no valid player target stays in the field and adopts its current position as a local roam anchor instead of marching back to the edge.
- Relentless nighttime reacquisition remains unchanged: any visible living player on Spawn is reacquired immediately on the normal AI tick.
- Sunrise retreat is unchanged and remains the only normal behavior that intentionally sends night slimes back to a map edge before despawn.
- No new network messages, timers, or replication cadence were added. Existing movement replication is reused.

## v6-11-402 — Occluded Lighting & Building AI Refinement

- Torch light is now **wall-occluded** instead of a simple circular darkness cutout. Each client derives a local visibility polygon from nearby Wood Walls and closed Wood Doors, clips the existing soft radial/flicker light to that shape, and lets light naturally spill through open doorways and around wall corners.
- Placed-torch visibility polygons are cached by structure revision/nearby closed-door state. The held torch is solved locally as the player moves. This adds **no lighting network packets or heartbeat**.
- Refined Pickaxe floor dependencies: a Wood Floor touching a wall/door may now be reclaimed when that boundary is still supported by another adjacent Wood Floor. The final floor supporting a boundary remains protected.
- Removing a Wood Wall that is required to support a connected Wood Door now automatically removes that unsupported door too. Both the mined wall and cascaded door return as ordinary shared ground loot, so building materials are not lost.
- Aggro enemies no longer all commit indefinitely to the identical doorway route when a player is behind a structure. When direct line-of-effect is blocked, enemies make a **low-frequency server-side approach decision**: some keep pressing the obvious route while others temporarily choose side/rear flank points and route around closed doors before reassessing.
- Organic approach choices persist for roughly 1–6 seconds and reuse the existing cached structure navigation and normal enemy movement replication. No new enemy-AI message type, timer packet, or network heartbeat was added.
- Preserves v401 Green Jelly Cube/Torch crafting, dark midnight lighting, held/placed torch behavior, v400 door-state synchronization, Spawn-only night pressure, runtime enemy generation, and existing combat/world systems.
- Regression: **30 syntax targets + 82 retained checks/smokes** pass, including a new WebSocket building-dependency smoke covering shared-wall floor reclaim, last-support protection, and automatic door removal/drop after a supporting wall is mined.

## v6-11-401 — Green Jelly Cube & Torch Lighting

- Moved the shared world clock from top-center to a compact chip directly beneath the upper-right minimap.
- Added the user-authored **Green Jelly Cube** resource sprite. Green Slimes now have a **30%** server-authoritative chance to drop one on death, including Spawn's nighttime green Slimes; non-green Slime variants do not use this drop rule.
- Added the repeatable crafting recipe **1 Wood + 1 Green Jelly Cube → 1 Torch** in the Building crafting category.
- Torch is a normal 1–9 assignable build item. Selecting it holds the torch in the player's hand and emits portable light while keeping the existing placement cursor available.
- Torches can be placed on the 16px build grid within the normal 96px build range. Placed torches are cosmetic/non-colliding shared structures and emit a softly flickering pool of light without any idle network heartbeat.
- Pickaxe reclaim works like the existing building system: mining a placed Torch removes the structure, drops a Torch as shared ground loot, and picking it up restores it to inventory.
- Night lighting is substantially darker: dusk deepens after 18:00, full night is dark at 20:00, darkness peaks around midnight, then gradually eases toward the existing 05:00 dawn. Carried and placed torches locally cut soft light holes through that darkness layer.
- Torch behavior is visual utility only in this build: no fuel consumption, fire spread, burn damage, enemy fear, or combat effects.
- Preserved v400 synchronized door visuals/collision, Spawn-only night pressure, runtime enemy generation, building rules, and all existing combat/world behavior. World definitions are unchanged apart from the build marker.
- Regression: **30 syntax targets + 80 retained checks/smokes** pass, including a WebSocket Torch lifecycle smoke covering craft → place → Pickaxe reclaim → ground loot → pickup.

## v6-11-400 — Door Visual State Sync

- Fixed the remaining v399 door-state mismatch: when player proximity opens a doorway authoritatively for enemies, the local client now draws that same door open immediately.
- Preserves the existing passage/occupancy hold-open behavior, closed-door blocking, and the rule that enemies cannot open doors themselves.
- No world-generation, enemy-generation, combat, building-placement, or map-definition changes beyond the world build marker.

## v6-11-399 — Shared Door Approach State

- Fixed a client/server door-state timing mismatch: when a player approaches a Wood Door closely enough for the client to present it as open, the server now mirrors that near-door state immediately instead of waiting for the player centre to enter/cross the doorway collider.
- Enemies waiting on the opposite side of an opened doorway can therefore begin entering as soon as the player opens the door from inside/outside.
- Enemies still cannot open closed doors themselves; the shared passage exists only because a living player is near/opening that specific door.
- Existing v398 occupancy safety remains intact, so the door continues to stay open while a player or living enemy is physically in the doorway and closes only after the doorway clears.
- Preserves Spawn-only progressive night Slimes, runtime enemy generation, building controls, closed-door combat blocking, and all v398 gameplay behavior.

## v6-11-398 — Runtime Enemy Generation & Spawn-Night Pressure

- Coordinate-world enemies no longer use fixed mob coordinates in `WORLD_CONTENT`. Each map now exposes only population rules (`enemyGeneration`); the server chooses concrete enemy positions at runtime when the server session starts.
- The Spawn map keeps its normal daytime enemy population empty. Its special night event begins with two hostile green Slimes, then adds one approximately every 10 seconds up to a cap of eight living night Slimes.
- Night-event Slimes exist only on the Spawn map, enter from outside a map edge, acquire a player immediately after entering, and remain relentlessly aggressive for the rest of the night. Other maps keep their normal runtime-generated populations and receive no special night wave.
- At 05:00, surviving night-event Slimes retreat toward the map edge and despawn; not-yet-entered Slimes are removed immediately.
- Escape no longer cancels an active building item or shows a build-cancel message. Building selection remains active until another assigned hotbar item is selected or the selected build stack is exhausted.
- Wood Doors now remain physically open while a player or living enemy occupies the doorway, preventing the collider from closing on top of an entity.
- Preserves v397 corner-door support, closed-door enemy pathing, structure combat blocking, roof/building visuals, mobile building controls, and the current coordinate-world layout.
- Regression: 30 syntax targets + 76 retained checks/smokes pass, including runtime-generated normal mobs, Spawn-only progressive night waves, immediate night aggression, the eight-Slime cap, Escape/build persistence, and occupancy-safe doors.

## v6-11-397 — Closed Doors & Night Slimes

- Closed Wood Doors now behave as actual structure barriers for monsters, melee, arrows, normal wand projectiles, and Fireball unless a player is actively opening that doorway. Enemy path planning may target the doorway, but physical movement cannot cross while the door is closed.
- Door placement now accepts perpendicular/rotated Wood Walls as endpoint supports, allowing valid doors directly beside 90-degree building corners while retaining the two-supported-sides requirement.
- Tightened held-attack occlusion so the attacking hand/arm is clipped with the held weapon when a nearby solid wall or closed door blocks the swing.
- Foreground/inside-house Wood Doors remain more opaque than surrounding faded walls, making the front doorway easier to locate from inside a completed house.
- Top-hotbar Wood Floor/Wall/Door icons are rotated to their upright authored orientation without changing the already-correct inventory/menu presentation.
- Added the first nighttime hostile wave: each occupied coordinate-grid map can activate four runtime-only green Slimes between 20:00 and 05:00. They enter from just outside a map edge, use the normal slime combat model with default aggression, and add no map-editor-authored spawn records.
- At 05:00 sunrise, established night Slimes disengage and retreat toward a reachable map edge before despawning. A slime still entering from outside at the exact dawn boundary is cleaned up immediately, and a retreat trapped by a player-closed door has an 8-second cleanup failsafe rather than phasing through the structure.
- Night-spawn lifecycle uses existing enemy snapshots/movement replication; there is no new idle clock heartbeat or dedicated night-spawn network loop. Empty maps do not run visible night waves.
- Preserved v396 roof treatment, structure-aware routing, Rain Cloud wall exception, building/mobile controls, and all coordinate-world/map-editor content. Coordinate-world content changes only by the 396 → 397 version marker.
- Regression: 30 syntax targets + 74 retained checks/smokes pass, including a WebSocket corner-door placement smoke and runtime night-entry/sunrise-retreat verification.

## v6-11-396 — Structure Combat & Navigation

- Polished authored player-built structures without changing placement geometry: stronger continuous wall/door perimeter contrast, refreshed authored Wood Floor/Wall/Door menu/hotbar icons, and a roof-specific silhouette pass.
- Roof interiors remain deliberately uniform. Only the outer perimeter receives dedicated top/side edges, corner coverage, the existing 3px overhang, and a stronger south eave/shadow so roofs read as one object rather than a tiled rectangle.
- Solid Wood Walls now block melee, arrows, normal wand projectiles, and Fireball line-of-effect on both client presentation and server-authoritative damage validation. Wood Doors remain intentional openings. Rain Cloud remains intentionally exempt because it summons weather at a location rather than firing a projectile through the wall.
- Basic projectiles and Fireballs stop visually at player-built Wood Walls; held weapon art is clipped to the player side of nearby walls instead of drawing through them.
- Living shared enemies now use cached 16px structure-aware A* routing when a direct chase line is blocked by player-built walls, allowing them to seek door/opening routes instead of repeatedly walking into the wall. Routes replan on target-cell/build-layout changes or a short cache timeout and add no new network messages.
- Goblin lunges require a clear wall line-of-effect. Ghost behavior is intentionally unchanged: Ghosts continue phasing through terrain.
- v395 building placement rules, roof enclosure rules, mobile build cursor controls, and map-editor-authored coordinate data are preserved. Coordinate-world content changes only by the 395 → 396 version marker.

## v6-11-395 — Authored Wood Structure Sprites

- Finished the interrupted wood-art handoff from v394 by wiring the supplied in-world building sprites into the actual structure renderer.
- Wood Floors now use the supplied 16×16 authored floor tile instead of procedural rectangles.
- Horizontal Wood Walls and closed Wood Doors now use the supplied 16×32 authored sprites at the existing projected wall height and exact placement boundary.
- Side-facing Wall/Door projections reuse the same authored sprite in a narrow perspective face, preserving the existing thin edge collider, depth sorting, corner extension, and door passage behavior.
- Automatic roofs now use the supplied 16×16 authored roof tile. Existing 3px outer overhang is preserved by extending only the source edge pixels so the tile itself remains crisp and unscaled.
- Open-door presentation still folds the authored door sprite against/along the jamb; no door networking or collision rules changed.
- v394 mobile build cursor, arrow nudge pad, 96px placement range, perimeter-wall/flanked-door/roof-lock rules, desktop controls, and coordinate-world data are preserved.
- Added a focused v395 sprite-wiring regression check; full retained regression suite still runs through `npm run check`.
- Coordinate-world layout/content is unchanged apart from the 394 → 395 version marker.

## v6-11-394 — Mobile Build Cursor Mode

- Replaced v393's character-driven mobile build aiming with an independent world-space build cursor.
- While Wood Floor, Wood Wall, or Wood Door is selected on mobile, tapping the game world now moves the build preview/cursor without placing anything.
- The `PLACE` button confirms exactly that stored world-space cursor target, so moving the character or camera no longer drags the selected build location around.
- Added a compact four-arrow build nudge pad beside the movement joystick. Floors nudge by one 16px build cell; Walls/Doors nudge by 8px half-cell steps so individual floor edges can be selected precisely.
- Mobile build taps suppress the synthesized mouse click that previously could turn the targeting tap into an immediate placement.
- Placement range is mirrored client-side at the server-authoritative 96px radius. Out-of-range previews remain visible as invalid and `PLACE` does nothing until the cursor/player is back in range.
- Invalid Wall/Door targets retain a red edge/cursor marker so the player can see what they are adjusting instead of the preview disappearing entirely.
- AUTO attack is hidden/disabled during mobile build-cursor mode. Character movement remains fully independent on the normal joystick.
- Desktop mouse building and all v392 perimeter-wall/flanked-door/roof-lock rules are unchanged.

## v6-11-393 — Mobile Build Place Button

- On touch/mobile controls, the primary `ATK` button becomes `PLACE` whenever Wood Floor, Wood Wall, or Wood Door placement mode is active.
- Pressing `PLACE` confirms the exact build preview that is currently highlighted by `mouseCanvasX` / `mouseCanvasY`; mobile combat-assist targeting is deliberately skipped so the button cannot move the placement target before confirming it.
- Leaving build mode restores the button to `ATK`.
- Desktop mouse placement is unchanged. Existing v392 perimeter-wall, flanked-door, roof-lock, server-authoritative placement, and silent-invalid-placement rules remain intact.
- Mobile AUTO attack is quietly disabled if it is still active when `PLACE` is pressed, preventing combat automation from competing with build mode.

## v6-11-392 — Building Placement Rules

- Wood Walls and Wood Doors are now perimeter-only edge pieces: placement is rejected when another Wood Floor exists directly across the selected edge.
- Wood Doors require an existing same-axis Wood Wall immediately on both sides of the door segment before placement is accepted.
- The client placement preview applies the same perimeter/flanking-wall rules, so invalid internal edges and unsupported door openings are not shown as valid placement targets.
- The server independently enforces both rules authoritatively; invalid placement remains quiet with no floating placement-tip chatter.
- Existing roofed-building lock, door passage behavior, cursor Pickaxe targeting, house visibility, day/night clock, and all gameplay systems are preserved.

## v6-11-391 — Cursor Pickaxe Targeting

- Pickaxe structure targeting is now driven by the cursor/touch aim point rather than choosing the nearest in-range placed Wood structure to the player.
- Player position is used only as the maximum interaction-range gate; it no longer breaks ties between candidate structures.
- Walls/Doors retain priority only when their visible facade actually overlaps the Floor under the cursor.
- The cursor-selected structure ID is locked at attack start, so moving the pointer during the short Pickaxe wind-up cannot redirect the delayed impact to another piece.
- Clicking empty space stays an empty structure hit rather than retargeting at impact time.
- v390 house visibility/roof lock, v389 day-night clock, building, mobile, combat, and coordinate-world behavior are otherwise unchanged.
- Regression: 30 syntax targets + 66 retained checks/smokes pass.

## v6-11-390 — House Interior Visibility & Build Targeting

- Completed-house interior presentation refined: while the local player is inside a roofed enclosure, the roof is fully hidden, only the south/foreground wall or door is partially transparent, and back/side walls remain solid.
- Existing outside/behind-wall transparency remains available when a wall visually covers the player.
- Invalid Wood Floor/Wall/Door placement is fully quiet locally and over the network; placement preview is the only feedback.
- Once a connected floor component is fully enclosed and therefore has an automatic roof, new Wood Wall/Wood Door placement on floors in that completed building is rejected authoritatively.
- Pickaxe structure targeting now has a visible gold outline that exactly matches the same target selector used by the actual Pickaxe hit; walls/doors retain priority over floors.
- Shared day/night clock, directional doors, automatic roofs, minimap, mobile transitions, Test Wood, permanent grass clearing, and all current coordinate-world behavior are preserved.
- Coordinate-world layout/content remains unchanged apart from the v390 version marker.
- Regression: 30 syntax targets + 65 retained checks/smokes pass.

## v6-11-389 — House Facade & Day/Night Foundation

- Completed roofed houses now behave as one visual facade: while the local player stands inside the enclosed floor region, the roof plus every perimeter Wood Wall/Wood Door fades together to 34% opacity instead of only fading the individual wall directly over the player.
- Outside a completed house, the existing canopy-style wall transparency still works. Automatic roofs also fade when their projected roof art visually covers the local player behind the back/north wall.
- Automatic roofs now overhang exposed perimeter edges by 3px so thin side/back wall rails cannot remain visible through/around the roof surface. Wall collision and placement geometry are unchanged.
- Invalid Wood Floor/Wall/Door placement clicks are now silent; the placement preview remains the feedback instead of floating PLACE ON FLOOR / BLOCKED / TOO FAR / NONE LEFT notes.
- Added the first shared day/night foundation. The server starts at 08:00 and sends one world-clock anchor on connect; clients advance the clock locally with no periodic clock packets.
- One full in-game day currently lasts 12 real minutes for rapid encounter testing. DAY / DUSK / NIGHT / DAWN phases are shown in a compact top-center clock and dusk/night gradually darken the world.
- No nighttime monster spawning/raid behavior is enabled yet; v389 only establishes the synchronized clock and lighting foundation.
- Coordinate-world layout/content remains unchanged apart from the v389 version marker.

## v6-11-388 — World UI, Door Flow & Automatic Roofs

- Removed the Spawn / Distance / Radius HUD banner.
- Enlarged the desktop minimap, made the mobile minimap flush to the top-right, and changed it to a fixed world view with a gliding player marker.
- Fixed mobile map-transition player rendering by restoring the logical GAME_RENDER_SCALE before drawing the live player over physical-pixel transition snapshots.
- Rebuilt the desktop 1–9 assignment rail so item art is readable instead of being hidden behind tiny number boxes.
- Removed the retired F8/F9 bow/arrows and progression/coin debug cheats.
- Pickaxe targeting now prioritizes walls/doors over the supporting floor when both are inside the attack cone.
- Wood Doors no longer open from proximity alone. A player must already be adjacent and step toward the door; a short passage window keeps it open while crossing, then it closes after the player leaves. Enemy/world collision still treats doors as solid.
- Added a server-authoritative free `Test Wood +100` supply to the crafting table's Building tab for rapid construction testing.
- Added client-derived automatic roofs: a connected floor component gains a roof only when every exposed outer edge is closed by a wall or door. Roofs require no network state and fade nearly transparent while the local player is inside.
- Coordinate-world content is unchanged apart from the v388 version marker.

## v6-11-387 — Startup Initialization Fix

- Fixed a v386 startup crash where early skill-tree/hotbar rendering read `selectedBuildPiece` before its lexical declaration had initialized.
- Build selection is now declared before any startup UI helper can access it; the later duplicate declaration was removed.
- Removed unreachable retired active-skill code after the unconditional `return false` in `client-abilities.js`.
- No gameplay, wall/door behavior, world content, resource costs, or coordinate-world layout changed.
- Retains v386 empty-handed building, wall transparency, Wood Door auto-open behavior, persistent build hotbar, and all v385 wall geometry.

## v6-11-386 — Build Visuals & Wood Door

- Selecting Wood Floor, Wood Wall, or Wood Door now makes the local player visibly empty-handed while preserving the previously equipped weapon for instant return when building selection ends.
- Wood walls now fade to 58% opacity when their projected art covers the local player, matching the existing tree-canopy visibility treatment.
- Added Wood Door: craft 1 for 4 Wood, assign it to the 1–9 hotbar, and place it on any Wood Floor edge using the same edge highlight as walls.
- Doors share wall boundaries, so a wall and door cannot occupy the same edge. Attached doors also protect their supporting floor from Pickaxe removal until the door is removed.
- Doors auto-open for players within 20px and close when players leave. Opening is derived from player proximity rather than a ticking network state, so idle doors add no traffic. Enemy/world collision continues to treat doors as closed, leaving the base-defense path ready for later mob logic.
- Added `public/assets/ui/wood_door.png` and restored the existing Wood Floor/Wall UI PNGs into the full-project snapshot so the backup is self-contained.
- Preserved v385 corner-wall projection, v384 edge placement/collision, persistent build hotbar assignments, permanent grass clearing, coordinate-world navigation, and existing combat/mobile systems.

## v6-11-385 — Corner Wall Alignment

- Fixed the upper/back corner projection gap identified in the in-game building screenshot and floor-grid diagram.
- A vertical Wood Wall now detects when a horizontal Wood Wall meets its upper endpoint.
- Only that upper corner gains one extra 16px tile of render height, so the side wall reaches the top of the 32px back-wall projection.
- Lower/front joins remain unchanged because the existing side-wall projection already aligns with a horizontal wall at its lower endpoint.
- This is render-only: placement, resource cost, shared-edge identity, 2×16 / 16×2 wall collision, Pickaxe reclaim, and network structure state are unchanged.
- Persistent Wood Floor/Wood Wall hotbar assignments and all v384 floor-edge building rules are preserved.

## v6-11-384 — Floor-Edge Walls & Persistent Build Hotbar

- Wood Floor / Wood Wall hotbar assignments now survive refreshes. Build assignments are restored using the same persistence rules that allow placeable items to remain hotkeyed at zero count.
- Wood Wall is no longer a full 16×16 structure tile. Walls are placed on one of the four edges of an existing Wood Floor.
- Hovering a floor while Wood Wall is active highlights the nearest north/east/south/west edge; clicking places that edge directly, so no separate rotation key/state is needed.
- Shared edges are normalized server-side: east of one floor and west of its neighbor are the same wall boundary and cannot be double-placed.
- Wall collision is a thin authoritative edge rather than a full tile. Existing shared occupancy checks use the new edge collider, preparing the structure model for future base-defense pathing.
- Wall visuals are approximately 32px tall and depth-sort against players/monsters, allowing actors to pass visually behind or in front while remaining unable to cross the wall edge.
- v383 wall autotiling is removed for now.
- A floor with any attached wall cannot be pickaxed until those wall segments are removed.
- Current 3×3 coordinate-world data remains unchanged apart from build/version markers; the retired visual-editor/legacy-map subsystem remains removed.

# Slime Story

## v6-11-383 — Full-Cell Building & Legacy Map Cleanup

- Wood Floors and Wood Walls now use one shared build layer: **only one structure can occupy a 16×16 build cell**. A wall can no longer be placed on top of a floor or vice versa.
- Wood Walls now render in the same **16×16 visual footprint** as Wood Floors instead of extending 4 pixels taller. Collision remains a full build cell.
- Wood Walls now **auto-tile from cardinal neighbours**. Shared edges blend together and straight runs, corners, junctions, and isolated pieces receive different connector/seam treatment automatically; there is no manual rotation state.
- Fixed mouse-wheel building selection so only the currently selected building piece is highlighted; the previously equipped weapon/tool no longer stays highlighted at the same time.
- Fixed mouse-wheel movement interruption: selecting a building piece while the inventory is already closed no longer calls the inventory-close input reset, so held movement continues normally.
- Removed the retired visual map editor (`map-editor.html/js/css`), draft/adoption format and tool, authored override JSON/JS store, and editor/legacy-map regression scripts.
- Removed the old hand-authored client map registry and legacy map dimensions. Canonical `WORLD_CONTENT` now contains **only the active deterministic 3×3 coordinate grid**.
- Replaced the giant historical `npm run check` command with a compact regression runner that syntax-checks current runtime files and runs all retained current checks/smokes automatically.
- Preserved v382 permanent normal-grass clearing, v380 Pickaxe building reclaim, current 400×400 grid cells, Manhattan difficulty, and traffic-idle structure state.

## v6-11-382 — Building Cleanup & Permanent Grass Clearing

- Retired the experimental Wood Wall rotation controls and orientation state. Walls remain full build-grid cells with no manual orientation.
- Preserved the v381 mouse-wheel building-slot cycling fix and silent build selection.
- Normal tall grass is now a one-time clearing resource: once cut with a valid melee tool, it stays cleared instead of respawning after 3–5 minutes.
- Normal grass consumed by fire also stays cleared, preventing a burned building footprint from later growing grass back through placed flooring.
- Cleared normal grass no longer renders permanent stubble. Temporary Rain Cloud grass keeps its existing temporary field lifecycle and is unaffected by this change.
- Building placement still requires the grass to be cleared first; once cleared, that cell remains naturally buildable.
- The then-current live map-editor-authored world content v96 remained untouched in this checkpoint; that retired editor/legacy-map store is intentionally removed in v383.

## v6-11-381 — Building Rotation & Layering

- Removed the floating **PLACE WOOD FLOOR / PLACE WOOD WALL** text when entering building placement mode.
- Fixed mouse-wheel hotbar cycling while a Wood Floor or Wood Wall is active so the selected building slot is treated as the current slot instead of snapping relative to the equipped weapon.
- Wood Walls now support **horizontal / vertical orientation**. While placing a wall, press **R** or right-click to rotate the preview; the chosen orientation is server-authoritative and synchronized to other players.
- Wood Floors and Wood Walls now occupy separate build layers, so a wall can be placed on top of an existing floor and a floor can be added beneath an existing wall. Duplicate floors and duplicate/stacked walls in the same build cell remain blocked.
- Preserved v380 map-edge transitions, Pickaxe building reclaim, 400×400 coordinate maps, Manhattan difficulty, and traffic-idle structure state.
- Preserved live map-editor-authored world content **v96** unchanged.

## v6-11-380 — Building & Seam Refinement

- Fixed player-built **Wood Floors** not rendering on coordinate maps that use authored terrain layers.
- **Wood Floor** and **Wood Wall** can now be assigned to any 1–9 action slot. Selecting their hotbar slot enters placement mode; the assignment remains available even when the current stack reaches zero.
- The **Pickaxe** can now reclaim placed Wood Floors and Wood Walls. The server removes the structure, drops the exact piece as shared ground loot, and the piece can be picked up back into building inventory.
- Reclaimed building-piece drops use the existing shared-loot path and expire after 30 seconds rather than creating persistent loose-item simulation.
- Coordinate-map edge travel now preserves the player’s perpendicular position: east/west travel keeps Y, while north/south travel keeps X, instead of recentering on every destination map.
- Directional map panning now renders the local player only once across the seam, removing the duplicate outgoing/incoming player sprite while keeping the v378 transition feel.
- Corrected the interactive tree trunk art mapping so untouched trees show the clean trunk and the first axe hit reveals the damaged/cut trunk before the tree is felled.
- Preserved the **400×400** coordinate maps, Manhattan-distance difficulty, active/warm/cold enemy lifecycle, and traffic-idle building persistence introduced in v379.
- Preserved live map-editor-authored world content **v96** unchanged.

## v6-11-379 — Persistent World & Building Foundation

- Coordinate-world cells are now square **400×400** maps; legacy/editor-authored maps keep their original dimensions.
- Coordinate difficulty now uses Manhattan distance: `abs(x) + abs(y)`. Cardinal neighbours are difficulty 1; current corner maps are difficulty 2.
- Generated map population budgets were reduced for the smaller cells to avoid needless crowding/network pressure.
- Chopped trees no longer regrow at the harvested position. The stump remains briefly, then disappears.
- A removed tree slot can very rarely establish a fresh tree at a different valid location, and this reseed check only occurs while that map is active.
- Added craftable **Wood Floor ×4 (2 Wood)** and **Wood Wall ×2 (3 Wood)** recipes under a new Building crafting tab.
- Crafted building pieces appear in Inventory; click a piece, then click the world to place it on the 16px building grid. Esc cancels placement.
- Player-built floors/walls are server-authoritative, synchronized only as snapshots/placement events, and persist while leaving/re-entering maps during the server session.
- Wood walls are solid for players and enemies. Placement is range-limited, edge-safe, avoids existing environment/NPC/player footprints, and each map has a hard 96-structure cap.
- Building state has no simulation tick and creates no idle network traffic. Existing v378 active/warm/cold enemy lifecycle remains intact.
- Map-editor-authored world data remains isolated from generated coordinate-world persistence/building state.

## v6-11-378 — World Navigation Polish

- Replaced the coordinate-world black map cover with a **directional 0.34s pan**. The outgoing map stays visible while the destination enemy snapshot synchronizes, then slides out as the new map slides in from the travelled direction.
- Added a compact **fixed 3×3 local minimap** that always centers the player’s current map. The window shifts as the player travels, keeps Spawn marked when visible, darkens undiscovered cells, shows simple biome icons for discovered cells, highlights the current cell, and renders hard world-edge cells outside the current radius.
- Persisted discovered coordinate cells in the existing browser-local character save without adding websocket traffic.
- Added a traffic-conscious grid enemy lifecycle: only maps with a player socket actively simulate enemies; cardinal neighbours retain a frozen **warm** mob snapshot for quick backtracking; maps farther away become **cold** and reset ordinary enemy state once.
- Empty maps now skip enemy delta construction/serialization entirely, so sleeping cells do not produce zero-recipient enemy traffic.
- Kept the radius-1 world and current **640×400** generated map dimensions unchanged for this navigation pass so map-size tuning can be tested separately rather than silently altering the new world feel.
- Preserved the live map-editor-authored world content **v96** unchanged; generated coordinate cells remain separate from authored legacy/special-map data.

## v6-11-377 — World Grid Pivot Foundation

- Pivoted Slime Story from a fixed authored-map/class-skill structure to a **coordinate world** foundation. The active world now begins at `(0,0)` in a deterministic radius-1 **3×3 grid**, with cardinal edge travel to neighbouring cells and a square ring boundary ready for later expansion.
- Added deterministic first-pass **Spawn Plains / Plains / Forest / Rocky Plains** generation. Outer-ring cells populate from their biome seed and distance from spawn, with distance-1 enemies beginning above the safe center's difficulty.
- Retired active **classes, skills, skill hotkeys, and gathering talents** from player-facing progression. Historical save/schema fields and legacy authored maps remain readable for migration/rollback, but no longer drive active gameplay.
- Rebuilt the main belt as **nine unified weapon/tool slots on keys 1–9**. Existing v376 4–8 assignments migrate to the same physical keys, mouse wheel cycles all occupied 1–9 slots, and consumables remain usable directly from Inventory.
- Moved the first abilities onto items: the **Fire Wand primary action casts Fireball** and the **Rain Wand primary action casts Rain Cloud** using their existing aim/cast/cooldown behavior. The server derives these capabilities from equipped item index rather than trusting a learned-skill payload.
- Added server-side cardinal adjacency validation for coordinate-map changes and moved death respawn to the new `(0,0)` world spawn.
- Kept Marnie and the crafting table at the new safe center so the existing Axe → 10 Wood → Pickaxe onboarding remains usable while the new world evolves.
- Kept generated coordinate cells out of the authored-map editor so a draft cannot accidentally freeze procedural biome cells into canonical map data.
- Preserved the latest live map-editor-authored world data from Drive as untouched legacy/special-map content while the coordinate-world architecture becomes the active game.

## v6-11-376 — Interactive tree art refresh
- Replaced the interactive/choppable tree canopy, standing trunk, damaged trunk, and harvested stump sprites with the newly provided art.
- Preserved existing tree behavior, hit states, falling animation, and stump/harvest logic.
- Preserved the newer live map-editor-authored world content **v92** from Drive before deployment; the canonical map JSON/JS were not overwritten by this art patch.


## v6-11-375 — Decorative tree art swap

- Replaced the decorative fire-immune tree sprites with the user's new 32x48 trunk and canopy art, preserving the existing two-piece decorative-tree system, placement data, layering, and non-interactive behavior.
- Generated a matching flipped canopy variant from the new canopy art so the current decorative-tree variant randomization continues to work without code-path changes.
- Added explicit cache-busting on the decorative tree trunk/canopy asset URLs so the art swap shows up immediately after deploy/reload instead of being masked by browser cache.
- Preserved the current map-editor-authored world content unchanged while applying this asset-only build.

## v6-11-374 — Multi-item progression, shop/crafting fixes, and Flower Harvesting

- Fixed the crafting-table category tabs so **Consumables / Weapons / Armor** actually hide/show their own recipes; Consumables remains the default and the grid stays three recipes wide.
- Fixed the shop UX that made level-gated Myrtle stock feel unbuyable: locked items remain clickable and now explain their required level. Myrtle's server/client catalog was also expanded with **Arcanist Hat / Robe / Skirt** at Lv10.
- Locked new class selection until **Level 10**. For now only **Magus** and **Ranger** can be newly selected; **Bruiser** and **Rogue** are shown as coming soon while legacy already-selected characters remain load-safe.
- Removed unique-ownership behavior from normal equipment acquisition: equipment quantities persist as counts, repeated shop purchases and equipment crafting are allowed, and inventory entries display stack counts when more than one copy is owned.
- Added **Flower Harvesting** as a real talent. Cutting an intact harvestable flower grants 1 Harvesting EXP both online (server-authoritative environment reward) and offline; level/progress is shown in Talents and saved with the character.
- Added focused regression coverage plus a WebSocket smoke test proving repeat Myrtle purchases work, including buying the same Arcanist piece and Sapgem Wand more than once.
- Preserved the current map-editor-authored world content **v88** unchanged during this code build.

## v6-11-373 — Crafting categories, Marnie progression, and class shops

- Reorganized the crafting table into **Consumables / Weapons / Armor** categories, opening on Consumables and displaying three recipes per row.
- Increased Wood equipment costs; Wood Helm/Chest/Greaves now also require Stone, while Wood Sword, Wood Bow, Wood Ring, and Shepherd Staff remain Wood-only.
- Extended Marnie's tutorial: she still gives the Axe first, now asks for **10 Wood**, consumes the 10 Wood on turn-in, and rewards the **Pickaxe**. Marnie no longer opens a shop.
- Moved the currently accessible class shop stock to **Cam (Ranger)** and **Myrtle (Magus)**. Myrtle's quest conversation now includes a separate Shop button.
- Cam sells Ranger Hat/Shirt/Pants (Lv10), Dreamcatcher (Lv20), and repeatable bundles of 50 Arrows.
- Myrtle sells Sapgem Wand (Lv10), Tournesol (Lv15), Tabatha's Key (Lv20), and the Jester set (Lv20). Other former shop stock is intentionally unavailable for now.
- Replaced the one-coin placeholder pricing with item-specific prices and server-authoritative vendor, level, proximity, coin, repeat-purchase, and Arrow-bundle validation.

## v6-11-372 — New-map portal runtime fix

- Fixed portals into editor-created maps by dynamically creating a normal client runtime map state for every shared `WORLD_CONTENT` map that is not one of the older hard-coded maps.
- This removes the v371 failure where a newly authored map existed in canonical world data, but `requestMapTransition()` rejected its portal because the destination was missing from the client `mapStates` registry.
- Validated the current editor-authored `forestPathWest` map and both of its live portal links/spawn targets.
- Preserved the newer live editor-authored world content version **81** captured from Drive before this build; the canonical map JSON was not rewritten by the code update.

## v6-11-372 — New map authoring

- Added a **+ New Map** workflow to the visual map editor with map name/ID, width, height, starting terrain, and an automatically created center player spawn.
- New maps can be exported or applied into the canonical adopted-map store; after server restart they become ordinary runtime/editor maps and can be targeted by portals.
- Added **Purple Slime** to the editor's slime variant list and gave Purple Slime spawns a distinct purple editor marker.
- Consolidated character NPC placement into one **NPC** button with a dropdown for Shopkeeper, Hunter, Jester, Beach Girl, Myrtle, and Cam; Crafting Table and Class Reset Crystal remain separate interactions.
- Preserved the newer live editor-authored world data revision **72** captured from Drive before this build, rather than overwriting it with v370's older revision 68 snapshot.

## v6-11-370 — Greencap armor

- Added the user-drawn **Greencap** armor set: Greencap Cap, Greencap Tunic, and Greencap Pants.
- Made all three pieces **Common** equipment with a **Level 5** equip requirement and no class lock.
- Added balanced Greencap defense/resist values (2/2 head, 3/2 torso, 2/2 legs) and advanced shared combat-balance revision to 29.
- Added Greencap to the shop, inventory, equipment menus, local saves, multiplayer appearance syncing, and Hallucination appearance snapshots.
- Preserved every existing equipment index by appending Greencap after the current sets, and preserved live editor-authored world revision 68 unchanged.

## v6-11-369 — Subtle nameplates and NPC shadow anchors

- Added a very transparent charcoal backing behind the crisp screen-resolution NPC labels, with no border or decorative frame.
- Anchored Myrtle's and Cam's shadows directly beneath their opaque bottom rows instead of using the generic two-pixel gap.
- Sized Myrtle's shadow to her wider robe base and Cam's shadow to his narrower stance.
- Preserved every NPC position, interaction, quest, movement rule, and the live editor-authored world revision 68 unchanged.

## v6-11-368 — Crisp NPC labels

- Replaced the five-pixel canvas-rendered NPC name tags with ordinary screen-resolution text that stays sharp after the game canvas is enlarged.
- Removed the label box and retained only simple light text with a crisp one-pixel dark outline for readability over varied terrain.
- Kept every existing NPC name, placement, interaction, quest, movement rule, and the live editor-authored world revision 68 unchanged.

## v6-11-367 — Myrtle quest and universal attack movement

- Replaced Cam's 20×20 sprite with the revised user-drawn version while preserving his live map-editor position.
- Reworked every character name tag into a much smaller mixed-case label with a translucent charcoal backing and subtle pale border.
- Added Myrtle's level-3 **Petals for the Falls** quest: bring 10 White Flowers and 10 Blue Flowers, with both stacks required for NPC turn-in.
- Myrtle removes exactly 10 of each flower on completion and rewards 50 Coins plus 10 EXP; quest progress and completion persist with the character.
- Removed the basic-attack/tool self-root on desktop, matching mobile, and changed the shared base movement speed from 72 to 54 px/s on both input schemes.
- Preserved the newer live editor-authored world revision 68, including Cam at 249,173 and Sunny at 578,324.

## v6-11-366 — NPC names and art refresh

- Replaced the iced-coffee and Sapgem Wand visuals with the latest user-drawn artwork; the 20×20 coffee now renders at its native size.
- Shortened the coffee pickup callout to **FOUND IT!**, so collecting the quest item no longer flashes **ICED COFFEE** over the player.
- Added **Myrtle**, the purple-haired green witch, beside the Waterfall Grove and gave her waterfall-themed dialogue.
- Added **Cam**, the camouflage enthusiast, to the current starting map with a suitably evasive greeting.
- Added small under-character name tags for Marnie, Bramble, Jinx, Sunny, Myrtle, and Cam, with editable NPC names in the map editor.
- Advanced the live authored map data to revision 59 while preserving the existing Beach Girl and crab placements.

## v6-11-365 — Mobile HUD edge refinement and Dreamcatcher buff

- Moved the mobile MENU button, skill column, movement pad, and combat controls closer to the rendered game viewport edges instead of applying the phone safe-area inset a second time inside the existing gutters.
- Increased the mobile top item/equipment toolbar from 78% to 84% scale and the bottom HP/EXP toolbar from 48% to 54% scale.
- Increased Dreamcatcher attack power from 10 to **20** and advanced the shared combat-balance revision to 28.
- Moved the Beach Girl's shadow up 2 pixels so it meets her visible feet.
- Preserved the newest live editor-authored world revision 58, including the moved Beach Girl and two repositioned beach crabs.

## v6-11-364 — Beach Girl questline

- Added the user-drawn Beach Girl to the western side of Crab Beach, with matching map-editor support and a mobile-safe dialogue panel.
- Added the level-5 **A Very Iced Emergency** quest: find her iced coffee and defeat 10 crabs, with both objectives required before NPC turn-in.
- Added a private 15% iced-coffee world drop while the first quest is active, using the supplied 16×16 item artwork.
- Added the level-7 follow-up **Crab Revenge**, unlocked only after the first quest, requiring 25 crab defeats and NPC turn-in.
- Persisted quest stage, counters, and coffee ownership in the browser character save and restored them into authoritative server session state.
- Added quest rewards of 20 Coins + 5 EXP for the first quest and 50 Coins + 10 EXP for the follow-up.
- Advanced the authored map revision to 56 while preserving all existing map content outside the requested NPC placement.

## v6-11-363 — Pixel-perfect mobile scaling

- Replaced arbitrary exact-fit mobile stretching with the largest whole physical-pixel scale that fits the usable landscape viewport, accepting small centred gutters when needed.
- Added a small device-aware backing grid so v362 camera motion remains smoother while every translated terrain, sprite, and canvas-text pixel lands on an integer backing pixel.
- Kept the 224×126 logical mobile world view, 54 px/s movement, combat, targeting, controls, HUD placement, and desktop rendering unchanged.
- Preserved the live editor-authored world data revision 55 without overwriting it.

## v6-11-362 — Mobile camera smoothing

- Added a mobile-only fractional camera presentation pass to smooth the uneven whole-pixel scrolling exposed by the newer 54 px/s movement speed.
- Kept world sprites on one shared pixel grid and pinned the local player in place while the environment consumes the camera's fractional movement.
- Left gameplay coordinates, targeting, movement speed, mobile zoom, Bow behavior, combat, HUD layout, and desktop rendering unchanged.
- Preserved the live editor-authored world data revision 55 without overwriting it.

## v6-11-361 — Mobile HUD cleanup and arrow crafting

- Increased the mobile-only base movement reduction from 15% to **25%**, bringing touch movement to 54 px/s while desktop remains at 72 px/s.
- Nudged MENU nearly flush with the upper-left safe edge and moved the skill column to the upper-right with a small safe-area margin.
- Removed keyboard labels from both mobile hotbars while preserving their tap targets, icons, cooldowns, and counts.
- Hid version/online status during mobile gameplay and moved it to the lower-left whenever Inventory, Shop, Crafting, or confirmation menus are open.
- Increased each Arrow craft from 20 to **50 arrows** while retaining its 5 Wood + 1 Stone cost.
- Preserved the live editor-authored world data revision 55 without overwriting it.

## v6-11-360 — Mobile combat and tooltip polish

- Increased the mobile-only base movement reduction from 8% to **15%**, bringing touch movement to 61.2 px/s while desktop remains at 72 px/s.
- Reduced Spellshred/Wand Mastery reach slightly from **49 px to 45 px**, including matching multiplayer validation.
- Changed manual mobile Bow basics to a one-tap smart shot at the nearest visible monster. If no monster is visible, ATK retains the existing tap-the-battlefield fallback.
- Restricted Bow AUTO targeting to monsters currently inside the rendered mobile view. Smart shots track their selected monster during the draw and cancel rather than firing off-screen.
- Disabled large item and skill hover cards on coarse-pointer touch devices so tapping or levelling a skill cannot leave a description panel covering the menu. Desktop hover cards remain unchanged.
- Incorporated and preserved the newest live editor-authored world data revision 55 without overwriting it.

## v6-11-359 — Mobile attack movement freedom

- Removed the voluntary movement self-root from mobile basic attacks and tool swings, including attacks triggered by the mobile AUTO toggle.
- Kept attack animations, active-frame impact timing, cooldowns, hit ranges, damage, and multiplayer validation unchanged.
- Reduced mobile base movement speed by a modest **8%** to balance attacking while moving without making exploration feel substantially slower.
- Preserved the existing planted basic-attack gesture on desktop.
- Incorporated and preserved the newer live Waterfall Grove/editor-authored world data revision 54 without overwriting it.

## v6-11-358 — Mobile resource targeting and auto attack

- Added reach-aware mobile tool assistance: tapping ATK with an Axe targets the nearest usable tree in chopping range, and tapping with a Pickaxe targets the nearest usable rock in mining range. Dragging ATK still switches to manual aim.
- Added a separate mobile **AUTO** toggle beside the attack controls. While enabled, the player attacks the nearest monster only when it is inside the equipped weapon's usable range; it never moves or chases for the player.
- Auto attack supports melee weapons, tools, Wand Mastery reach, and Bow full-draw shots. Bow auto attack tracks moving targets during the draw, stops if they leave range, and switches itself off when arrows run out.
- Auto attack pauses for menus, point-targeted skills, held objects, and casting, and disables when the game loses focus or the player dies.
- Preserved desktop input, manual mobile attacks, Waterfall Grove, and editor-authored world data revision 53 unchanged.

## v6-11-357 — Mobile camera zoom

- Reduced the mobile logical world viewport from **256×144** to **224×126**, making players, monsters, terrain, and range spacing another **14.3% larger** on phones.
- Mobile now renders the game world at roughly **1.43× desktop scale** while retaining the same 16:9 view shape.
- Kept HUD, menu, toolbar, and touch-control sizing independent from the world zoom.
- Desktop remains at **320×180** with no camera or gameplay changes.
- Preserved Waterfall Grove and the live editor-authored world data at revision 53 unchanged.

## v6-11-356 — Waterfall Grove

- Added **Waterfall Grove**, a peaceful enemy-free destination centered on a broad animated waterfall, misty pool, pixel-art cliff, moving light shafts, and drifting sun motes.
- Built a dense two-layer forest frame with 116 trees, an open southern approach, a simple dirt path to the water, 22 flowering grass patches, and 16 harvestable wildflowers.
- Added a small north trail from Prototype Island West beside its existing stream, creating a reciprocal portal connection while preserving the rest of the live editor-authored layout.
- Added Waterfall Grove to the visual map editor, including landmark preview rendering, so its terrain and environmental objects remain editable.
- Preserved the existing global starting map and all prior combat/mobile behavior.

## v6-11-355 — Mobile point targeting

- Changed mobile Bow attacks to a two-step point-target flow: tap ATK, then tap the battlefield. The Bow automatically holds its normal full draw and releases toward that point; close taps still use the existing Bow-smack fallback.
- Changed mobile Ignite (Fireball), Rainbloom (Rain Cloud), and Focus Fire (the rapid-fire barrage) to tap-skill, tap-battlefield placement.
- Added a compact target prompt and a bright armed-state outline so it is always clear which attack is waiting for a target; tapping the armed control again cancels it.
- Direct spell/marker points are clamped to each skill's existing minimum and maximum range. Damage, cooldowns, ammo costs, projectile behavior, and multiplayer authority are unchanged.
- Preserved desktop mouse/keyboard hold-and-release controls and the live map-editor-authored map override revision 50 unchanged.

## v6-11-354 — Mobile HUD and weapon reach tuning

- Enlarged the mobile Items 1–3 / Equipment 4–8 toolbar again for easier reading and tapping.
- Tucked the mobile MENU button into the rendered game viewport's top-left safe corner.
- Returned the mobile skill hotbar to a vertical four-slot column centered on the right edge.
- Increased standard melee reach from 22 to 26 px, Katana reach from 27 to 31 px, and close-range Bow-smack reach from 24 to 28 px.
- Increased Wand Mastery reach more substantially, from 41 to 49 px, so Spellshred retains a clear reach advantage.
- Updated matching multiplayer enemy, PvP, and resource-hit validation without changing arrow or spell projectile ranges.
- Preserved the live map-editor-authored map override revision 50 unchanged.

## v6-11-353 — Mobile toolbar, crafting, and hotbar assignment

- Enlarged the mobile Items 1–3 / Equipment 4–8 toolbar while keeping desktop HUD sizing unchanged.
- Rebuilt the crafting menu as a compact landscape panel with dense recipe cards, internal scrolling, a large always-visible close button, and tap-outside dismissal.
- Added a persistent compact assignment dock to the mobile Inventory and Class pages.
- Mobile players can now tap a potion or weapon and then tap its Items/Equipment slot; active skills use the same tap-skill, tap-slot workflow.
- Desktop drag-and-drop and right-click clearing remain available and unchanged.
- Preserved the live map-editor-authored map override revision 50 unchanged.

## v6-11-352 — Mobile world scale and compact shop

- Mobile coarse-pointer clients now render the world at a 256×144 logical viewport instead of 320×180, making players, mobs, tiles, attack spacing, and distance cues about 25% larger while leaving the DOM HUD independently sized.
- Desktop keeps the existing 320×180 logical viewport and rendering scale.
- The mobile shop is now a centered compact panel rather than nearly full-screen, with denser item cards, more columns in landscape, and the verbose footer hidden on touch layouts.
- Preserved the live map-editor-authored map override revision 50 unchanged.

## v6-11-351 — Mobile combat and menu refinement
- Added a mobile **MENU** button so touch players can open the existing Escape menu and reach inventory, class, talents, stats, PvP, and skill binding without a keyboard.
- Added held-ATK soft targeting: tapping/holding ATK tracks the nearest monster within a modest combat-assist radius while the movement thumb remains independent; dragging ATK still switches to deliberate manual aim.
- Moved the movement pad slightly upward and increased the top item/weapon toolbar scale from the first mobile prototype.
- Reworked shop and Escape-menu sizing for landscape touch screens using the dynamic viewport and safe-area padding so tabs/close controls remain reachable; desktop layouts are unchanged.
- Preserved the live Google Drive map-editor override revision (v50) instead of replacing it with the older copy embedded in the v350 ZIP.

## v6-11-350 — Mobile controls prototype
- Added an opt-in coarse-pointer mobile layout for landscape phones while preserving all desktop keyboard/mouse controls.
- Added a left-thumb analog movement pad, a right-thumb hold/drag attack button, touch-enabled Shift/Space/E/R skill slots, and a contextual ACT button that becomes available near supported NPCs and stations.
- Touch aim follows the last movement direction by default; dragging ATK or a skill button adjusts aim, and releasing Fireball/Focus Fire completes their existing charge/release lifecycle.
- Added a portrait orientation prompt instead of relying on unsupported forced browser rotation, plus mobile viewport/safe-area handling.
- Substantially reduced the HP/EXP, equipment/potion hotbar, skill buttons, and connection indicator on landscape phones. Desktop HUD sizing and behavior are unchanged.
- Preserves v349 shoreline/water presentation, all gameplay values, multiplayer authority, and editor-authored world data.

## v6-11-349 — Shoreline rendering cache-bust fix
- Updated every browser script cache key to v349 so the v348 shoreline clipping and water-shadow corrections cannot be masked by cached v347 rendering modules.
- Added a narrow shallow-water threshold at shorelines: sprites remain fully visible with their shadow while merely straddling land and water, then switch to the wading presentation once their foot area is properly inside the water.
- Preserves v348 rendering logic, gameplay, traversal, Wet rules, Crab affinity, and editor-authored world data.

## v6-11-348 — Shoreline wading presentation fix
- Clipped player and enemy wading overlays to the actual water pixels beneath them, so shoreline overlap no longer paints a rectangular water band across dry ground.
- Suppressed player and grounded-enemy shadows while their foot point is in water; shadows return immediately on dry ground.
- Preserves v347 traversal, Wet rules, Crab speed affinity, combat behavior, and editor-authored world data.

## v6-11-347 — Water traversal + Crab Wet affinity
- Players and enemy species can now enter water by default instead of treating every pool/shoreline as an impassable safety barrier. Enemy species can explicitly opt out later with `canEnterWater: false`.
- Standing/wading in water continuously applies **Wet** using the existing status rules and extinguishes Burn; Wet keeps its normal 3-second linger after leaving the water.
- Added lightweight wading presentation for local/remote players and grounded enemies: the lower portion of the sprite is covered by an animated water/ripple band so entities read as partially submerged.
- Crabs invert the normal Wet movement penalty: while Wet they gain a **1.25× movement multiplier**, making shoreline/water pursuit especially dangerous while other Wet enemies keep the existing slowdown.
- Preserves v346 Crab combat tuning, v345 terrain lookup caching, portals, map layouts, and editor-authored world data.

## v6-11-346 — Crab combat buff
- Buffed Crab durability from **58 HP to 120 HP** and raised physical Defense from **4 to 18**, making the shell meaningfully tougher against physical attacks.
- Increased Crab contact damage from **5–8 to 9–13** per hit.
- Increased Crab aggro/chase speed from **24 to 42** while preserving its existing passive beach scuttle speed of 15, so calm Crabs still wander normally but become considerably faster once provoked.
- Preserves Crab AI style, status interactions, drops, respawn behavior, map placement, and the latest editor-authored world data; this build changes Crab combat tuning only.

## v6-11-345 — Terrain lookup cache
- Optimized shared authored-terrain lookup with a per-map spatial bucket cache, so render/collision samples no longer scan every terrain paint region on every query.
- Preserves exact paint-order and rectangle-edge behavior, including non-cell-aligned terrain regions; later paint regions still override earlier ones exactly as before.
- Prototype Island West keeps the latest editor-authored **W48** map data unchanged; this build changes lookup performance only, not terrain layout or gameplay rules.
- Added a regression that compares cached results against the original full-scan algorithm across Prototype Island West and reports candidate-bucket/performance diagnostics.

## v6-11-344 — Terrain map runtime rendering
- Fixed authored terrain maps outside the original Prototype Island pair falling back to the legacy grass ground renderer in-game.
- Crab Beach now uses the shared runtime terrain renderer, so its sand, beach water, shoreline treatment, and animated tide/foam presentation match the map editor.
- Generalized the renderer gate to detect any map with authored terrain data instead of hard-coding only `prototypeIsland` and `prototypeIslandWest`.
- No map layout, enemy placement, Crab behavior, combat, portal, or authored world-data changes. The latest editor-authored world data is preserved unchanged at W44.

## v6-11-343 — Crab Beach + sand terrain
- Added a new **Crab Beach** map with a sandy shoreline, tide-pool water, four placed Crab spawns, and a return portal back to Prototype Island West.
- Added a new shared **sand** terrain type to gameplay/editor data. Sand is walkable, blocks Magic Grass growth, renders with beach-specific pixel texture, and supports south-void faces like other terrain.
- Added beach-styled water presentation where water meets sand, including lighter sandy shoreline treatment and a subtle animated foam/tide wash along beach edges.
- Added **sand** to the map editor terrain brush so beach maps can be authored directly.
- Preserved all existing combat, Crab behavior, potion, HUD, NPC, and authored-map systems aside from the intentional new Prototype Island West -> Crab Beach portal.

## v6-11-342 — Crab face clip fix
- Fixed the two-piece Crab walk presentation so the front/face section no longer reads as clipped at the top while scuttling.
- Removed the walk-time vertical squash from the two-piece Crab renderer and tuned the front/back offsets so the scuttle still has motion without chopping the face.
- Crab AI, combat, statuses, balance, editor placement, and authored world data are unchanged.

## v6-11-341 — Crab two-piece animation
- Replaced the Crab's single flat presentation with the user-supplied two-piece art split: `crab_back_v1.png` for the shell/rear section and `crab_front_v1.png` for the eyes/front claws.
- The Crab renderer now animates the back and front sections independently with subtle idle bobbing, claw twitching, and out-of-phase sideways scuttle motion while preserving existing AI, combat, status, and multiplayer behavior.
- Added a fresh combined `crab_v2.png` asset for cache-safe legacy/death presentation and a focused regression check covering the two-piece renderer wiring.

## v6-11-340 — Crab wet status fix

- Fixed Crab Wet presentation being drawn even when `wetTime` was zero, which made every Crab appear permanently Wet.
- Crab droplets now render only while the Crab actually has active Wet status, matching Slime, Mushroom, and Goblin presentation guards.
- Wet mechanics, duration, slowing/status rules, Crab AI/combat/balance, and authored map data are unchanged.
- Preserves the newer map-editor-authored world override data incorporated into the v339 snapshot.

## v6-11-339 — Crab renderer hardening

- Fixed a second Crab renderer crash caused by a call to the nonexistent `drawBurnEffect` helper.
- Crab burn visuals now use the same proven `drawPixelFlame` primitive already used by Slimes, Mushrooms, and Goblins, with no combat/status-rule change.
- Audited the full Crab draw path for standalone renderer helper calls so the v337/v338 undefined-helper class cannot recur through another Crab-only helper.
- Preserves the newer map-editor-authored world override data detected after v337; no authored map data was overwritten.

## v6-11-338 — Crab render fix

- Fixed a Crab renderer crash caused by a call to the nonexistent `drawEnemySpawnShimmer` helper.
- Crab spawn scaling, idle/scuttle animation, status effects, combat, AI, editor placement, and balance are unchanged from v337.
- No authored world/map data changed.

## v6-11-337 — Crab enemy

- Added the user-drawn 30×16 **Crab** as a new editor-placeable enemy species without adding it to any existing authored map.
- Crab AI uses short pauses and mostly horizontal scuttling near its spawn; when provoked it chases with the same sideways-biased movement and ordinary contact damage.
- Added lightweight code-driven crab presentation: low two-beat scuttle motion, subtle idle pincer/body twitch, facing flip, hurt/death/status/Hurl presentation, and normal multiplayer enemy replication.
- Crab supports the existing combat/status systems including Burn, Wet, Snare, Hurl, Hallucination redirect, Focus Fire targeting, death/respawn, EXP, and coin drops.
- Added Crab to the map-editor enemy species selector and draft validation. No current authored world/map data was changed.

## v6-11-336 — Sapgem rotation fix

- Replaced the Sapgem Wand art with the user-supplied correctly rotated 16×16 sprite on a fresh `sapgem_wand_v3.png` asset path/cache key.
- Wand stats remain unchanged from v335: Shepherd Staff 10 MAG, Sapgem Wand 15 MAG, Tournesol 20 MAG, Tabatha's Key 25 MAG; Sapgem remains Normal attack speed.
- Fire Wand and Rain Wand remain retired from the shop while staying fully defined for legacy compatibility.
- No authored world/map data or unrelated gameplay changed.

## v6-11-335 — Wand power rescale + Sapgem redraw

- Replaced the Sapgem Wand art with the user-supplied redrawn 16×16 sprite on a fresh `sapgem_wand_v2.png` asset path/cache key.
- Rescaled accessible wand **Magic Power** to a clean four-step progression: **Shepherd Staff 10 → Sapgem Wand 15 → Tournesol 20 → Tabatha's Key 25**. Existing ATK values remain 5 → 6 → 7 → 8.
- Preserved attack-speed identities: Shepherd Slow, Sapgem Normal, Tournesol Normal, Tabatha's Key Quick.
- Fire Wand and Rain Wand remain fully defined for legacy compatibility but retired from both client and server shop catalogs.
- Preserves v334 weapon indices/save mappings and current authored world/map data.

## v6-11-334 — Sapgem Wand + wand progression cleanup

- Added the user-supplied **Sapgem Wand** as a new 16×16 wand weapon at appended weapon index 12, preserving every existing weapon index/save mapping. Sapgem uses **Normal** attack speed.
- Accessible wand progression is now **Shepherd Staff 5 ATK / 9 MAG → Sapgem Wand 6 ATK / 10 MAG → Tournesol 7 ATK / 11 MAG → Tabatha's Key 8 ATK / 12 MAG**. Their existing attack-speed identities remain Shepherd Slow, Sapgem Normal, Tournesol Normal, and Tabatha's Key Quick.
- Removed **Fire Wand** and **Rain Wand** from the client/server shop catalogs so they can no longer be newly purchased. Their weapon profiles, sprites, indices, combat behavior, and legacy ownership remain supported for compatibility.
- Existing saves that previously purchased Fire/Rain Wand retain that purchase history instead of losing the retired items on server restore.
- Preserves v333 universal attack-speed tiers, v332 universal basic attacks, and current authored world/map data.

## v6-11-333 — Universal attack-speed tiers

- Extended the existing **Slow / Normal / Quick** attack-speed system from wands to every non-bow weapon and tool. Bows and Dreamcatcher remain governed by draw/charge time instead of the basic-attack tier table.
- Assigned current non-bow equipment tiers: **Quick** — Katana, Tabatha's Key; **Normal** — Wood Sword, Sword, Tournesol; **Slow** — Axe, Pickaxe, Fire Wand, Rain Wand, Shepherd Staff.
- Basic-attack repeat cooldowns now come from the shared combat-balance tier for all non-bow equipment, and the server enforces the same tier cadence for enemy hits, PvP melee, Wand Mastery melee, and wand basic projectiles.
- Inventory/shop weapon details now show **Attack Speed** for all non-bow weapons/tools, not only wands. Existing attack power, scaling, reach, attack animation timing, environment interactions, and bow behavior are otherwise unchanged.
- Preserves v332 universal basic-attack lifecycle, v331 wide-map skill bounds/clickable hotbar, v330 potion art/start-map fix, and current authored world/map data.

## v6-11-332 — Universal non-bow basic attacks

- Generalized the deliberate basic-attack lifecycle that was previously wand-specific to **all non-bow weapons and tools**: swords, Katana, Axe, Pickaxe, and all wand/staff variants now use a shared wind-up -> impact -> follow-through path.
- Non-wand melee/tool hits now land on the active animation frame instead of instantly on mouse-down, and voluntary movement is locked only for the visible attack gesture. Held movement input resumes automatically afterward.
- Preserved every weapon's existing repeat cooldown, damage source/scaling, reach, environment interaction (cutting/chopping/mining), Wand Mastery behavior, Camouflage opener handling, PvP validation, and held-left-click repeat behavior.
- **Bows and Dreamcatcher are intentionally excluded** and retain their existing draw/release, Focus Fire, arrow, and close-range bow-melee behavior.
- Refactored the former wand-only pending-impact/movement-lock state to generic basic-attack state so future non-bow weapons can plug into one attack foundation instead of adding parallel input/combat paths.
- Preserves v331 wide-map skill bounds, clickable hotbar, potion art, map-aware loading, authored world/map data, inventory, crafting, NPCs, and unrelated gameplay.

## v6-11-331 — Wide-map skill bounds + clickable top hotbar

- Fixed remaining skill/effect coordinate sanitization that still used the legacy 640px map width. Fireball/focus-fire/rain/blink visual targets and server-side Hallucination positions now sanitize against the active authored map dimensions, so skills continue correctly across wide maps such as Prototype Island West.
- The top HUD hotbar is now clickable. Clicking item slots **1–3** immediately uses the assigned consumable; clicking equipment slots **4–8** selects/equips that slot exactly like the matching number key, without triggering an attack. Existing number-key and mouse-wheel controls are unchanged.
- PvP behavior audit: **Magic Grass itself does not slow players**. It continues to slow monsters only. Rain Cloud Wet still slows another player only when both players are mutually PvP-enabled. No PvP balance change was made in this build.
- Preserves v330 potion art, map-aware loading, authored world/map data, combat values, cooldowns, inventory, crafting, NPCs, and unrelated gameplay.

## v6-11-330 — Potion art + map-aware player loading fix

- Replaced the generated **Attack Potion** and **Magic Potion** icons with the newly supplied 16×16 orange and purple pixel sprites. Inventory, crafting, hotbar, active-buff HUD, and potion-use world presentation all use the same new assets; potion values/cooldowns/behavior are unchanged.
- Fixed the v329 loading-position implementation so the editor-authored default controls **both the starting map and the exact player spawn**, instead of only looking for a position on the hard-coded Spawn Clearing map.
- The default loading target is now stored as one global world-content pointer (`mapId` + `spawnId`). Applying it does not rewrite unrelated authored data on other maps. Existing v329 per-map markers remain readable as a compatibility fallback.
- Death respawn remains the existing safe Spawn Clearing behavior, and portal target spawns remain independent. Pickup-name text remains suppressed from v329.
- Preserves the current authored map override data from world-content version 39; the latest editor-authored loading marker is preserved. The existing v329 marker on Prototype Island is recognized automatically by the v330 compatibility path; no re-placement is required.

## v6-11-329 — Player loading position + loot text cleanup

- Player Spawn markers in the map editor can now be designated as the map's **default loading position**. On the Spawn Clearing, that authored point is used for new/reloaded sessions; maps without one keep the historical center fallback. Portal targets continue using their explicit Spawn IDs.
- The selected default loading spawn is visually marked in the editor and draft validation prevents dangling references. Deleting that spawn clears the default reference.
- Picking up Stone, Flowers, and Gold Slime Bubbles no longer prints the item name above the player. Existing pickup animation, inventory credit, networking, and loot behavior are unchanged.
- No existing authored map data is modified by this build; the new spawn field appears only when explicitly set and applied through the editor.

## v6-11-328 — Mushroom asset-load render guard

- Fixed a Firefox `CanvasRenderingContext2D.drawImage` DOMException that could stop the entire client render loop when a new Mushroom sprite had not decoded yet or its initial asset request failed.
- Mushroom rendering now verifies `complete`, `naturalWidth`, and `naturalHeight` before drawing; a tiny pixel fallback is used only while the real image is unavailable, so world rendering never crashes.
- Mushroom sprite requests use the v328 cache key, forcing a clean retry after the v327 asset-sync failure.
- No enemy balance, AI, combat, editor spawn data, authored maps, inventory, crafting, HUD, NPC, terrain, or other gameplay behavior changed.

## v6-11-327 — Sleeping Mushroom enemy + map-editor spawn support

- Added the first **Sleeping Mushroom** enemy species to the shared client/server enemy registries, networking, combat/status, death/respawn, loot, and targeting pipelines.
- Sleeping Mushrooms stay planted and harmless while asleep, wake into an annoyed chase/contact state only when provoked or redirected, then return to their authored home point and fall asleep again after disengaging.
- Added dedicated 16×16 sleeping/awake/flash pixel sprites and a Mushroom-aware renderer while preserving Hurl, Snare, Burn/Wet, Focus Fire, damage text, and generic enemy presentation behavior.
- The map editor can now select **Sleeping Mushroom** as an enemy-spawn species (alongside existing registered species); mushroom spawns are editor-authored only and this patch does **not** add or modify any existing map spawn data.
- Preserves all unrelated gameplay, HUD, potion, crafting, NPC, terrain, and authored world behavior from v326.

## v6-11-326 — Placed interaction range + 5-minute buffs + bubble polish

- ATK and Magic Potion buffs now last 5 minutes; their 1-second anti-spam use cooldowns are unchanged.
- Editor-placed Crafting Tables are server-authorized from their actual map coordinates and saved interaction radius, fixing craft requests that previously checked only the original Spawn Clearing bench.
- Editor-placed Shopkeepers remain coordinate-authorized and now share the same placed-interaction helper/regression coverage.
- Shop/crafting bubbles are slightly smaller (18x18), keep native 16x16 icons, and use a semi-transparent light interior.
- Preserves current map-editor-authored world data and all unrelated gameplay/UI behavior.

## v6-11-325 — ProtoWest enemy bounds + NPC bubble tuning

- Replaced legacy 640×400 passive enemy wander clamps with each map's real dimensions for slimes, goblins, and ghosts. This fixes ProtoWest enemies beyond x=628 being pulled/squeezed left.
- Ghost movement clamping now also follows the active map dimensions instead of the old 640×400 limits.
- Raised shop/crafting role bubbles so they clear the NPC/table sprite again.
- Enlarged the simple bubbles to fit the existing 16×16 coin/axe art at native size; marker icons are no longer downscaled and have no icon shadow pass.
- No authored map/world content changes.

## v6-11-324 — Map-editor NPC placement + Wood Ring art refresh

- Added placeable **Shopkeeper**, **Hunter**, and **Jester** NPCs to the terrain-map editor. NPCs can be selected, dragged, duplicated, deleted, and changed between the three existing NPC roles in the inspector.
- NPC placement is stored as optional `map.npcs` world data and survives editor draft export/import/adoption without modifying any existing authored maps unless the user explicitly applies an edited draft.
- Placed Shopkeepers use the existing Axe tutorial/shop interaction, and the server now accepts shop purchases near a placed Shopkeeper on an authored map. Placed Hunters use the existing Hunter talk interaction; Jesters are visual-only for now.
- Updated the Wood Ring to the newly supplied replacement sprite via fresh `wood_ring_v3.png` asset path.
- Existing legacy-map NPC placement/behavior remains unchanged.

## v6-11-322 — Top hotbar scale + custom Wood Ring art

- Increased the top HUD hotbar (item slots 1–3 and weapon slots 4–8) by about **30%** while preserving the current split, viewport anchoring, and existing hotbar behavior.
- Updated the Wood Ring to the newly supplied custom sprite and moved it to a fresh **`wood_ring_v2.png`** asset path to prevent stale browser image caching.
- Inventory categories, equipment behavior, consumable behavior, combat, crafting, and authored world/map data are unchanged.

## v6-11-321 — Pickaxe art + inventory category split

- Replaced the Pickaxe with the newly supplied 16×16 sprite and moved it to a fresh **`pickaxe_v6.png`** path so browsers cannot reuse the prior cached image.
- Inventory gear is now separated into **Weapons**, **Armor**, and **Accessories** beneath the existing Resources and Consumables groups.
- The existing Wood Ring now appears in **Accessories** when owned; its Charms equipment slot and +1 Armor behavior are unchanged.
- Weapon hotbar assignment, item hotbar assignment, equipment restrictions, combat, crafting, potion behavior, and authored map/world data are unchanged.

## v6-11-320 — Pickaxe asset cache fix

- The supplied replacement pickaxe artwork now loads from a new **`pickaxe_v5.png`** asset path instead of reusing the old `pickaxe_v4.png` URL, preventing browsers/static caches from continuing to display the previous sprite.
- No potion, shop, hotbar, combat, mining behavior, or authored map/world data changed from v319.

## v6-11-319 — Potion feedback, cooldown groups, shop scale, and pickaxe art

- Attack and Magic Potions now use distinct world-space potion animations matching the Healing Potion feedback style; same-map remote players see them too.
- Healing Potion cooldown is now **15 seconds** and uses the existing shared healing-family cooldown field so future stronger HP potions can share it. Attack and Magic Potions each use a **1-second** anti-spam cooldown while retaining their existing 30-second buffs.
- The shop panel, tabs, item cards, icons, labels, prices, and footer are substantially larger on desktop while remaining viewport-bounded on small screens.
- Replaced the Pickaxe sprite with the newly supplied 16×16 asset.
- Increased only the visual separation between hotbar keys **3** and **4** to reinforce Items 1–3 versus Equipment 4–8.
- Existing inventory categories, potion assignment, combat values, maps, authored world data, and other HUD anchors are unchanged.

## v6-11-318 — Consumables inventory + authored-water reflections

- Added a dedicated **Consumables** category to Inventory between Resources and Equipment. Healing, Attack, and Magic Potions plus Arrows now live there; Resources retains coins, wood, stone, flowers, and Gold Slime Bubbles.
- Preserved the v316/v317 item drag-and-drop flow: potion entries remain draggable into Items 1–3, with no preset assignments.
- Fixed player reflections on map-editor/prototype authored water. Local and remote players now use terrain-defined water shorelines and are clipped to authored water cells, while legacy-map pond reflections remain unchanged.
- Added a subtle authored-water surface veil after reflections so the reflected sprite reads as submerged rather than painted over the water.
- Authored map/world data itself is unchanged.

## v6-11-317 — Escape menu centering fix

- Keeps the main Escape/inventory panel vertically centered when the contextual Equipment + Items rails are visible.
- Explicitly places the Equipment, Items, Skills, and main menu panel on the same overlay grid row so CSS auto-placement cannot push the main menu into a second row.
- Left and right contextual rails remain independently vertically centered alongside the main panel.
- Item 1–3 drag/drop, Equipment 4–8 drag/drop, skill bindings, potion behavior, HUD layout, and authored world/map data are unchanged.

## v6-11-316 — Contextual drag-and-drop item hotkeys

- Item hotkeys **1–3 now start empty** instead of being prefilled with Healing / Attack / Magic Potion. Existing v315 saves without an explicit customization marker migrate to empty item slots while preserving all other progression.
- Added a dedicated **Items** hotkey rail on the right side of the Inventory tab. Consumables are assigned by dragging them from Inventory into slots 1–3; assigned items can be dragged between slots to swap and right-clicked to clear.
- The Escape-menu shortcut rails are now contextual: **Inventory** shows Equipment 4–8 on the left and Items 1–3 on the right; **Class/Skills** shows only the skill-binding rail; other tabs hide all shortcut rails.
- Equipment 4–8 drag/drop, skill drag/drop, potion behavior, potion feedback/status HUD, and world/map data are unchanged.

## v6-11-316 — Assignable item hotkeys

- Keys **1–3 are now generic consumable/item hotkeys** instead of being hard-wired to Healing / Attack / Magic Potion.
- Potion/resource entries in the Escape inventory can be selected and assigned to **1, 2, or 3** using the same assignment panel pattern as equipment hotkeys 4–8.
- Item assignments can be moved, swapped, or cleared and persist in the browser-local character save. Existing saves without item-hotkey data migrate to the former Healing / Attack / Magic layout so current controls are not lost.
- Potion healing, buffs, shared cooldown, HP-potion feedback animation, ATK/MAG status HUD, arrow HUD, equipment hotkeys, and authored world data are unchanged.

## v6-11-314 — Potion feedback and status HUD

- Healing Potions now give immediate visual feedback: the potion sprite pops above the player with a short pixel-cross burst and the enlarged HP bar pulses when the local authoritative heal succeeds. Remote players on the same map see the world-space healing animation too.
- Active **Attack Potion** and **Magic Potion** buffs now appear as timed status icons on the left side of the bottom-center HP/EXP HUD.
- The bow-only **arrow counter** moved from beneath the top hotbar to the opposite (right) side of the HP/EXP HUD, keeping the top hotbar clean.
- Potion values, heal amount, buff duration, consumable cooldown, combat math, and inventory behavior are unchanged.
- Authored map/world content is unchanged.

## v6-11-312 — Menu and hotbar layout

- Reassigned the top hotbar so **1–3 are fixed item/consumable hotkeys** (Healing, Attack, Magic Potion) and **4–8 are the five equipment/weapon hotkeys**. Existing five-slot weapon assignments keep their saved order; only their physical keys move.
- Updated the Escape-menu equipment hotkey rail and assignment buttons to show **4–8**.
- Raised the Escape inventory/class/equipment overlay above all viewport HUD elements so the top hotbar, HP/EXP bar, and skill column never cover it.
- Enlarged the desktop Escape workspace, inventory/equipment tiles, hotkey rails, and both item/skill hover-detail cards substantially for readability. Compact-window breakpoints remain intact.
- Gameplay, combat, cooldowns, crafting logic, map/world content, coin presentation, and flower loot-icon behavior are unchanged from v311.

## v6-11-311 — HUD reposition and loot polish

- Moved the 1–8 equipment/item hotbar to the **top-center** of the rendered game viewport.
- Moved HP/EXP to the **bottom-center** and vertically centered the Shift/Space/E/R skill column along the **right side** of the rendered viewport. All anchors remain relative to the game viewport rather than browser gutters.
- Removed the short coin-drop shimmer/glint animation; coin drop and pickup behavior is unchanged.
- Inventory White/Blue Flower icons now use the exact bordered flower loot sprites shown on the ground after cutting a flower. Living world flowers and crafting ingredient icons are unchanged.
- Authored map/world data and unrelated gameplay systems are unchanged.

## v6-11-310 — Magus renames, new loot art, and charm slot

- Renamed the Arcana kit across the skills page, descriptions, and bound hotbars: **Spellshred**, **Ignite**, **Rainbloom**, and **Mirage**. Gameplay, cooldowns, scaling, and behavior are otherwise unchanged.
- Wired the user-drawn replacement **coin** art into mob loot drops and the new **HP potion** art into inventory/crafting/hotbar usage.
- Added a new **Charms** equipment slot with a craftable **Wood Ring** that costs **2 Wood**, auto-equips on craft, and grants **+1 Armor**.
- Charm ownership now persists through local/browser restore and participates in the same gear-based armor calculation on both client and server.
- Existing combat, crafting, inventory, cooldown, hotbar, and world content systems are unchanged outside the requested updates.

## v6-11-308 — Ability active-state scaling

- Hallucination blink range is retuned to **30px→50px** from LV1→LV20; its 2s→5s return window and 20s→15s cast-start cooldown remain unchanged.
- While the Hallucination clone exists, the skill hotbar now displays the remaining clone-return window. Consuming or expiring the clone immediately switches the same slot to the actual cooldown time already elapsed since the first blink.
- Rain Cloud now gains cast-time scaling from **2.0s at LV1 → 0.5s at LV20**. Its 10%→30% Magic Grass slow, 30s grass lifetime, and 30s→20s post-cloud cooldown remain unchanged.
- Remote Rain Cloud casting accepts the longer 2-second LV1 animation duration so multiplayer presentation matches the local committed cast.
- Authored map/world data and unrelated gameplay systems are unchanged.

## v6-11-307 — Hallucination cooldown visibility fix

- Hallucination still uses the v306 balance values: 40px→80px blink range, 2s→5s decoy duration, and 20s→15s cooldown.
- The cooldown deadline continues to begin on the first successful cast, but the activation gate now reads that wall-clock deadline directly instead of relying on a mirrored frame value.
- The skill hotbar cooldown mask/text now refreshes every frame, so Hallucination visibly enters cooldown on the cast frame and counts down while the decoy is still alive.
- Returning to the active decoy remains available during cooldown because it is the second half of the same cast; it does not restart or extend the cooldown.
- Rain Cloud scaling, 3 AP per level, elemental damage, Fireball Fire element, gameplay systems, and authored map/world data are unchanged from v306.

## v6-11-305 — Ability scaling + elemental damage foundation

- Level-ups now award **3 Ability Points** instead of 1; the F9 progression test grant mirrors the same +3 AP reward.
- Added a shared elemental layer on top of physical/magic damage. Fireball impact and On-Fire ticks are now explicitly **Fire** element; current monsters have neutral elemental resistances, so this adds no hidden damage rebalance yet.
- Rain Cloud now scales from LV1-LV20: Magic Grass slow increases from 30% to 50%, and post-cloud cooldown falls from 15.0s to 10.0s. Magic Grass base lifetime increases from 24s to 36s per tuft. Casting a new Rain Cloud replaces that caster's prior Magic Grass field.
- Hallucination now scales from LV1-LV20: blink range grows from 34px to 60px, decoy duration from 5.8s to 8.0s, and post-decoy cooldown falls from 15.0s to 10.0s. Server-clocked decoy lifetime and late-join snapshots use the learned level.

## v6-11-304 — Viewport HUD anchoring

- Starts from `6-11-303 HUDAnchoringFix`.
- Adds a rendered `#gameViewport` container that exactly follows the 16:9 game canvas footprint.
- Anchors HP/EXP to the game viewport upper-left, the 1–8 item hotbar to game viewport bottom-center, and the vertical Shift / Space / E / R skill column to game viewport lower-right.
- Black browser gutters / letterboxing no longer become HUD positioning space.
- Preserves HUD contents, cooldown overlays/text, item hotbar behavior, skill behavior, gameplay, map-editor workflow, and authored world data.

## v6-11-303 — HUD anchoring fix

- HP/EXP, the 1–8 item hotbar, and the skill hotbar are now separate viewport-level HUD siblings with independent fixed anchors.
- HP/EXP stays upper-left, the item hotbar stays bottom-center, and the skills occupy a compact bottom-right four-slot Shift / Space / E / R column.
- Extra compact-width rules keep all three HUD groups visible and non-overlapping without changing hotbar, cooldown, inventory, or gameplay behavior.

## v6-11-302 — HUD layout fix

- Skill icons now occupy a dedicated compact lower-right 2×2 grid above the item bar, eliminating overlap with utility slots 6–8.
- The complete 1–8 item hotbar remains bottom-center with a distinct gap between weapon/tool slot 5 and utility slot 6.
- HP/EXP remain anchored upper-left.
- Compact viewport rules reduce slot sizes while preserving counts, key labels, and cooldown overlays.

## v6-11-301 — Crafting and consumables

- White and Blue harvest flowers now persist as separate inventory resources without changing their world/editor placement or visuals.
- Added Healing, Attack, and Magic potions with server-authoritative crafting, shared consumable cooldown, healing validation, and refresh-only 30-second damage buffs.
- Arrow crafting now costs 5 Wood + 1 Stone and produces 20 arrows.
- Weapon slots 1–5 remain unchanged; utility slots 6–8 show potion stacks and cooldowns. HP moved upper-left and skills moved to a compact lower-right grid.
- Browser persistence restores potion inventory and remaining buff/cooldown durations with server clamping.

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
