# Slime Story Online v0.6.4 — Hurl Prototype

Built directly on the confirmed-working v0.6.3 baseline.

## Hurl

**Requires 10 Strength.**

Unlock it in the Skill Tree and bind it to Shift, Space, E, or R.

1. Stand close to a slime.
2. Press Hurl.
3. The slime is carried over your head.
4. You can walk while carrying it.
5. Left-click toward the cursor to throw it.

While carrying a slime, normal attacks are replaced by the throw and other
active skills report `Hands full!`.

## Shared/server-authoritative behavior

The server owns the held slime, throw trajectory, collisions, and damage, so
other players see the same result.

### Current interactions
- Thrown slime -> slime: target takes 8–12 damage + knockback.
- Thrown slime -> goblin: goblin takes 8–12 damage + knockback.
- Thrown slime -> tree: tree takes 1 HP.
- Thrown slime landing/missing: thrown slime takes 4–7 damage.
- Ghosts are non-physical and are not hit by Hurl.

A thrown slime travels for about 0.58 seconds / ~70 world pixels.

## Visual treatment

No new art:
- carried slime is lifted about 20 px overhead with a tiny wobble;
- thrown slime follows a procedural sine-wave arc;
- its ground shadow stays underneath;
- carried slime is sorted just after its carrier so it stays visible.

## Testing

Use `F9` for +5 SP / +1 AP while testing. Put 10 points in Strength, unlock
Hurl, bind it, and try:

1. Carrying a slime while walking.
2. Watching the carry from another browser.
3. Throwing slime into slime.
4. Throwing slime into goblin.
5. Throwing slime into a tree.
6. Missing intentionally to check landing damage.
7. Disconnecting while carrying one; the server releases it automatically.

If the core feels good, this same system can later support goblin grabbing,
larger-enemy STR thresholds, burning-slime firebombs, bramble entanglement,
and electrified-rain interactions.


## v0.6.4-1 carry-pose polish

Small visual pass on Hurl:
- players no longer visibly hold their equipped weapon while carrying a slime;
- both arms move into a raised overhead carry pose;
- the carried slime sits a bit lower, closer to the player's hands.


## v0.6.4-2 carry layering polish

- In the Hurl carry pose, the face/hat are now drawn before the raised arms so
  the arms overlap the head correctly.
- Carried slime lowered by another 1 pixel.


## v0.6.4-3 carry pose fix

- Carry-pose arm offsets reduced so the stock arm sprites stay attached to the torso.
- Carry arms still layer over the face/hat, but now read more like a close supporting pose
  instead of floating overhead.


## v0.6.4-4 normal-arms carry cleanup

Removed the experimental carry-arm pose.

Current Hurl carry visuals now use:
- normal arm rendering,
- hidden equipped weapon while carrying,
- the lowered carried-slime position retained from the earlier polish pass.

This avoids the backwards-hand / upside-down-arm artifact from trying to force
the default arm sprites into an overhead pose.


## v0.6.4-5 flipped carry-arm experiment

Trying the intended overhead pose again, this time by actually flipping the
existing separated arm sprites vertically.

- hands are now on the upper end of the arm artwork;
- shoulder ends stay near the torso;
- arms render over the face/hat;
- equipped weapon remains hidden while carrying;
- carried slime keeps the improved lower position from the previous polish.


## v0.6.4-6 carry-arm height tweak

- Lowered both vertically flipped carry arms by 3 pixels.
- No other Hurl behavior or visuals changed.


## v0.6.4-7 steady held-slime polish

- Lowered both flipped carry arms by 1 additional pixel.
- Removed the bobbing motion from slimes while they are being carried.


## v0.6.4-8 grounded held-slime polish

- Lowered the held slime by another 5 pixels.
- Player movement is now disabled while carrying a slime.
  This is intentionally a temporary baseline so a future enhancement can unlock
  movement while carrying.


## v0.6.4-9 animated slime pickup

Added a short synced pickup animation for Hurl:

- on a successful grab, the slime now rises up into the held position instead of
  instantly popping there;
- during the lift, it does a small squash/stretch;
- the pickup animation is part of shared slime state, so nearby players should
  also see the same lift animation.

No Hurl rules changed: the player is still rooted while carrying, the held slime
stays at the lowered height, and held slimes still do not bob.


## v0.6.4-10 player step-and-reach pickup

Refined the Hurl pickup so the player contributes more to the motion:

- when the grab starts, the player now makes a small visual-only step/reach toward
  the target slime;
- the carry arms start slightly lower and more forward, then settle into the
  overhead hold pose as the slime rises;
- pickup direction is synced from the server, so nearby players should see the
  reach coming from the correct direction too.

No gameplay rules changed. The step is purely visual and does not alter the
player's real collision or network position.


## v0.6.4-10.1 hotfix

Fixed a server crash in the new Hurl pickup-direction animation:
- `player.x / player.y` were mistakenly referenced inside the server handler.
- The server now correctly uses `playerState.x / playerState.y`.


## v0.6.4-10.2 hotfix

Fixed the pickup-animation client crash:
- `headOffsetY` was being modified before its `let` declaration inside `drawPlayer()`.
- The pickup head dip now runs only after walk-animation variables are initialized.
- The visual step/reach behavior itself is unchanged.


## v0.6.4-11 hurl whiff animation

Hurl now gives feedback even when there is no valid slime target:

- pressing Hurl with no nearby slime now plays a short visual-only step/reach
  animation toward the cursor;
- the whiff animation is synced in player state, so other players can see it too;
- the existing successful pickup animation is unchanged.


## v0.6.4-11.1 hotfix

Adjusted the no-target Hurl whiff pose:

- the player no longer throws both arms outward on a failed grab;
- one arm now stays anchored near the torso as a support arm;
- the other arm does the small reach toward the cursor.

Successful slime pickups are unchanged.


## v0.6.4-11.2 multiplayer Hurl fixes

Fixed two multiplayer presentation issues:

- A remote player with no carried slime no longer inherits the local player's
  carry-arm pose when the local player is holding a slime.
- The no-target Hurl step/reach animation is now preserved by the server's
  player-state sanitizer and rebroadcast to other players.

The successful server-authoritative Hurl grab/throw behavior is unchanged.


## v0.6.4-12 floating text alphabet fix

Expanded the popup floating-text bitmap font:

- added a full A-Z 3x5 glyph set;
- kept digits and existing symbols;
- added a few extra punctuation marks for future messages (`? . , : - ' /`).

This fixes missing letters in messages like:
- `NO SLIME NEARBY`
- `CLICK TO THROW!`
- and other short status / ability text.


## v0.6.5 base outfit + bandana

- Added the new user-drawn base appearance:
  - base head/hair
  - base torso
  - base left/right arms
  - base left/right legs
- Base appearance is NOT inventory gear. It is automatically rendered whenever
  the matching Head/Shirt/Pants slot is unequipped.
- New players now begin with Head/Shirt/Pants unequipped.
- Added explicit `Unequip` choices to the three armor gear panels.
- The original Traveler pieces remain normal equippable gear.
- Added the user-drawn Bandana as a normal equippable hat and inventory item.
- Updated multiplayer state validation and Jester Blink appearance relay to
  support empty armor slots and the new Bandana index.


## v0.6.5.1 base hat update

- Replaced the default/base hat-hair sprite with the new user-drawn version.
- This only affects the fallback appearance used when the Head slot is unequipped.
- Equippable hats, bandana, and all other systems are unchanged.


## v0.6.6 ownership-driven inventory

New players now begin with a genuinely empty inventory:

- Head / Shirt / Pants start unequipped and continue to show the base outfit.
- Hand starts as Empty Hands.
- No weapons, armor, hats, or other gear are owned.
- The five numbered hotbar slots remain in place, but unowned weapon icons are hidden.
- Zero-count Coins / Wood / Flowers are hidden until the player has at least one.

Inventory and Gear menus are now ownership-driven:

- Inventory only shows equipment the player owns at least one copy of.
- Equipment panels only show owned gear plus the always-available
  Unequip / Empty Hands choices.
- Empty Inventory sections display `No resources` / `No gear or items`.
- Traveler shirt and pants now appear in Inventory when owned, since they are
  real equippable gear.

Added count-based helpers for future loot / shops / chests:

- `grantInventoryItem(itemId, count)`
- `removeInventoryItem(itemId, count)`

Removing the final copy of an equipped item automatically unequips that slot.
Item ownership remains client-local for now, matching the current progression
architecture.


## v0.6.7 first progression loop

Added the first playable progression/tutorial sequence to Safe Spawn:

1. New player begins with no items.
2. Walk near the new NPC and press `F`.
3. NPC grants one Axe and automatically equips it.
4. NPC asks the player to collect 5 Wood.
5. Chop trees and collect shared Wood drops.
6. Walk to the workbench beside the NPC and press `F`.
7. The bench consumes exactly 5 Wood and grants/equips the Wood Sword.

New content:
- exact user-drawn NPC sprite
- exact user-drawn workbench sprite
- exact user-drawn Wood Sword sprite
- Wood Sword replaces the generic slot-1 Sword artwork/name while retaining
  the existing sword combat mechanics
- `F TALK` / `F CRAFT` pixel prompts
- NPC and bench collision footprints

Progress flags:
- `player.story.axeReceived`
- `player.story.woodSwordCrafted`
- `player.benchCraftPending`

Multiplayer/resource note:
- Wood totals are server-owned in online play, so the workbench sends a
  `craftRequest`.
- Server validates that the player is in Spawn, near the bench, has at least
  5 Wood, and has not already completed the recipe in that server session.
- On success the server spends 5 Wood and the client grants the Wood Sword.
- Item ownership/progression is still client/session-local overall; database
  persistence remains future work.


## v0.6.8 shop + Ghost Grove

### Tutorial change
- Receiving the Axe from the tutorial NPC no longer auto-equips it.
- It appears in Inventory / Gear and the player chooses when to equip it.

### NPC shop
After the Wood Sword has been crafted, talking to the tutorial NPC opens the
Village Shop.

- Every current equippable weapon / hat / shirt / pants is listed.
- Every item costs exactly 1 Coin.
- Already-owned items display `OWNED` and cannot be bought again from the UI.
- Axe and Wood Sword are already owned by the time the shop unlocks.
- Online purchases are server validated:
  - player must be in Spawn and near the NPC;
  - Wood Sword tutorial craft must be complete;
  - player must have at least 1 server-owned Coin;
  - the server deducts the Coin and returns the approved item.
- Offline fallback purchases deduct the local Coin and grant the item directly.

### Ghost Grove
- Added a new `ghostGrove` map connected to the NORTH edge of Slime Meadow.
- Added a north path/gate to Meadow.
- Ghost Grove has a matching south entrance back to Meadow.
- Both natural Ghosts were removed from Meadow and moved to Ghost Grove.
- Shared `world-content.js` was updated, so Ghosts remain server authoritative
  in multiplayer on their new map.


## v0.6.8-1 hotfix

Fixed the three issues found in v0.6.8:

- Shop purchases:
  - removed a brittle server-only tutorial flag requirement;
  - shop still only opens client-side after the Wood Sword is crafted;
  - server validates proximity, item id, duplicate purchase, and 1-Coin cost;
  - opening the shop sends a fresh position packet;
  - failed purchases now show an on-screen reason.
- Frozen Meadow ghosts:
  - removed the old hard-coded client ghost pair;
  - natural Ghosts now come only from shared WORLD_CONTENT, where they live in Ghost Grove.
- Ghost Grove portal:
  - fixed impossible `y <= 9` trigger (player Y is clamped to >=15);
  - portal now triggers at `y <= 16`;
  - widened the vertical gate and cleared a deeper north corridor through the trees.


## v0.6.8-2 shop + Ghost routing fix

### Shop click freeze
The shop grid was being regenerated on every animation frame while the shop was
open. A button could be destroyed between mouse-down and mouse-up, preventing
the browser from ever emitting the click event.

- Shop DOM is no longer rebuilt every frame.
- It refreshes when opened and after purchase state changes.
- Networking continues updating while the shop is open.

### Ghost map routing
Added a defensive shared-enemy reconciliation step on every `activateMap()`:

- natural enemies are rebuilt/preserved from that map's `WORLD_CONTENT`;
- each entity has its `networkMapId` reasserted;
- active arrays are loaded only after reconciliation;
- natural Ghosts render/update only when `networkMapId === currentMapId`;
- `drawGhost()` includes the same final map guard.

This makes Slime Meadow explicitly have zero natural Ghost visuals, while
Ghost Grove reconstructs its two shared Ghost entities on entry.

Temporary console diagnostics now print the active Ghost IDs/map IDs when
entering Meadow or Ghost Grove.


## v0.6.8-3 shared-world cache fix

The persistent Ghost behavior was a client/server world-data split.

`public/shared/world-content.js` is used by both sides:
- Node loads the current file from disk;
- the browser loads it separately as a script.

If the browser keeps an earlier copy, the two sides can disagree about which
map owns a Ghost. That exactly produces:
- visible stale Ghosts in Meadow;
- authoritative invisible Ghosts damaging the player in Ghost Grove.

Fix:
- `WORLD_CONTENT.version` bumped to `2`;
- browser URL is now `/shared/world-content.js?v=2`;
- static game files are served with `Cache-Control: no-store, max-age=0`;
- server `/health` and WebSocket `welcome` report `worldContentVersion`;
- client reports `WORLD DATA MISMATCH · REFRESH` if its registry version ever
  differs from the server;
- startup diagnostic prints the client Ghost assignments.

Expected client registry:
- Meadow Ghosts: none
- Ghost Grove: `ghostGrove:ghost:1`, `ghostGrove:ghost:2`


## v0.6.9 assignable hotbar

- Hotbar slots 1-5 are now independent assignments rather than fixed weapon positions.
- New usable weapons/tools automatically occupy the first empty hotbar slot.
  - Axe received first -> slot 1.
  - Wood Sword crafted next -> slot 2.
- If all five slots are occupied, later weapons remain owned but unassigned.
- Open Inventory and click an owned weapon/tool to open `Choose a hotbar slot`.
- Buttons 1-5 manually assign/rearrange the selected item.
- Moving an assigned item onto another occupied slot swaps the two items.
- Moving an unassigned item onto an occupied slot replaces that assignment.
- Clear removes the selected item from the hotbar without deleting it.
- Inventory weapon/tool cards show their current hotbar number.
- Gear-page equipping remains independent from hotbar organization.
- Pressing 1-5 equips whatever item is assigned to that slot.
- Pressing 0 still switches to Empty Hands.
- Losing the final copy of a usable item clears it from the hotbar.


## v0.6.9.1 hotbar unassign / held-item fix

- Clearing the currently equipped weapon from the hotbar now immediately
  switches the player to Empty Hands.
- Moving that weapon to another hotbar slot does NOT unequip it.
- Swapping two assigned hotbar items does NOT unequip the current weapon.
- If an unassigned weapon is placed over an occupied slot and the displaced
  weapon was currently held, the displaced weapon is unequipped because it is
  no longer assigned anywhere.


## v0.6.10 combat progression foundation

### Monster levels / tougher enemies
- Slime: Level 1, 40 HP
- Goblin: Level 3, 90 HP
  - chase speed 34
  - detection radius 90
  - lunge damage 9-13
- Ghost: Level 5, 150 HP
  - chase speed 32
  - detection radius 110
  - contact damage 14-18

Enemy levels now live in shared `world-content.js` and are carried by both the
server and browser entity objects/snapshots.

### Shared damage formula
Added `public/shared/combat-balance.js`, loaded by both Node and the browser.

Ordinary player attack damage now uses:

`(Weapon/Spell Power + stat scaling) × level multiplier × monster resistance × random roll`

- If the player is below the monster's level:
  - damage loses 7% per level behind.
  - multiplier bottoms out at 45%.
- Being above the monster's level does not currently add a level bonus.
- Normal melee / wand shots have a 90%-110% damage roll.
- Rain Cloud damage is steady rather than randomly rolled.
- Shadow critical hits still multiply final melee damage by 1.75.

### Weapon power / scaling
- Wood Sword: PWR 8
  - +0.50 per STR
  - +0.20 per DEX
- Axe: PWR 10
  - +0.75 per STR
- Fire Wand: PWR 8
  - +0.70 per INT
- Rain Wand: PWR 7
  - +0.65 per INT
- Katana: PWR 12
  - +0.30 per STR
  - +0.65 per DEX
- Fireball: spell PWR 12
  - +0.90 per INT
- Rain Cloud: spell PWR 4
  - +0.30 per INT
  - Power enhancement still adds additional spell power.

Selecting a usable weapon in Inventory now shows its `PWR` value in the hotbar
assignment panel.

### Ghost resistance
Ghosts are intentionally poor targets for mundane weapons:
- physical damage multiplier: 15%
- magic damage multiplier: 115%

This means swords, axes, and katanas generally scratch a Ghost for only 1-2
damage, especially while under-levelled, while Wand shots, Fireball, Rain Cloud,
and burning remain practical answers.

### Multiplayer authority
The browser now sends player Level + STR/DEX/LUCK/INT as progression state.
The server sanitizes those values and computes the actual damage itself. Clients
do not submit their final damage numbers.

Progression itself is still client-owned in this prototype; moving progression
to server/database authority remains a later architecture step.

### Shared-data versions
- WORLD_CONTENT version: 3
- COMBAT_BALANCE version: 1
Both versions are included in the WebSocket welcome/health data so future
client/server data mismatches are detectable.


## v0.6.10.1 remote weapon visibility fix

Fixed multiplayer weapon rendering.

Root cause:
- remote player state correctly synced `weaponIndex`;
- `drawRemotePlayer()` temporarily reused the local `player` object;
- `drawPlayer()` called `equippedWeapon()`;
- `equippedWeapon()` checked the local viewer's inventory ownership;
- therefore a remote player's weapon disappeared if the viewer did not own the
  same weapon.

This was especially noticeable with the Wood Sword (weapon index 0), but could
affect any remote weapon the viewer had not yet acquired.

Fix:
- added a scoped `remotePlayerDrawDepth` render context;
- local gameplay still requires actual inventory ownership;
- while rendering a remote player/reflection, `equippedWeapon()` trusts the
  remote synced `weaponIndex`;
- `try/finally` guarantees the remote render context and temporarily-swapped
  player fields are restored even if drawing throws.

This preserves multiplayer weapon animations, Hurl carry poses, reflections,
and all v0.6.10 combat progression changes.


## v0.6.10.2 original Sword restored

The pre-Wood-Sword weapon art was recovered exactly from the older v0.6.6
build and reintroduced as a completely separate weapon.

Weapon indices remain backward-compatible:
- 0 Wood Sword
- 1 Axe
- 2 Fire Wand
- 3 Rain Wand
- 4 Katana
- 5 Sword

Sword:
- exact original 16x16 sprite
- normal sword swing / cutting behavior
- PWR 10
- +0.55 damage per STR
- +0.25 damage per DEX
- physical damage type
- available in the NPC shop for the current test price of 1 Coin
- ownership-driven Inventory / Gear visibility
- assignable to any hotbar slot
- synced and rendered for remote multiplayer players

Wood Sword remains unchanged as the tutorial-crafted first weapon.

COMBAT_BALANCE version bumped from 1 to 2.


## v0.6.10.3 map-bound Rain / Blink cleanup

Rain Cloud and Jester Blink decoys now end immediately when their caster leaves
the map.

- local map transitions already clear the caster's own transient effects;
- server detects the caster's map change and broadcasts an
  `ownerTransientCleanup` event to players still on the OLD map;
- old-map clients immediately remove that owner's Rain Cloud, travelling Rain
  Orb, and Jester decoy;
- remote player map-change handling performs the same cleanup as a fallback;
- disconnecting also clears all caster-owned Rain/Blink visuals.

Blink's gameplay taunt is now map-bound too:
- Slime, Goblin, and Ghost decoy taunts track the caster player ID;
- changing maps or disconnecting immediately cancels those taunts.

### Balance constructor correction
While validating this patch, a v0.6.10 constructor regression was found:
Goblin/Ghost runtime HP and some client movement defaults did not match the
intended balance. Client and server now agree on:
- Goblin: 90 HP, speed 20, chase 34, detect 90, leash 120
- Ghost: 150 HP, speed 10, chase 32, detect 110, leash 145

The restored original Sword from v0.6.10.2 is retained.
