# Slime Story

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
