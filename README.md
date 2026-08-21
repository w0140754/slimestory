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
