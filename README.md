# Slime Story Online v0.6.3 — Spawn / Map-Entry Interpolation Fix

Built on the working v0.6.2 build.

## What was happening

Interpolation is desirable for ordinary multiplayer movement, but it was also
being applied to state transitions that are really teleports.

### Remote player entering a map

A known remote player retained their last coordinates from the previous map.
When their new snapshot changed `mapId`, the client changed only
`targetX/targetY`.

As soon as that player became visible on the new map, the renderer showed them
rapidly interpolating from their old-map coordinates to the new spawn point.

### Enemy respawn

A dead slime/goblin/ghost remained at its death coordinates locally. When the
server respawned it at its home position, the browser smoothly interpolated
from the death point to home, making the monster visibly streak across the map.

## Fixed rules

Network movement is now divided into two categories:

### Interpolate
- ordinary player movement
- ordinary slime/goblin/ghost movement
- normal server position corrections

### Snap immediately
- first appearance
- remote player map change
- slime/goblin/ghost `dead -> alive` respawn
- an unusually large server correction (96+ world pixels)

The 96-pixel threshold is deliberately much larger than Jester Blink's normal
range, so Jester's short teleport presentation is not converted into an
unrelated hard snap by this safety rule.

## Test

### Player map entry
1. Open two tabs.
2. Keep Player B on Meadow.
3. Move Player A from Spawn into Meadow.
4. On Player B's screen, Player A should appear at the Meadow entrance without
   flying across the map.

Repeat in the opposite direction and with Goblin Woods.

### Enemy respawn
1. Kill a slime somewhere away from its home point.
2. Wait for respawn.
3. It should reappear immediately at its spawn/home position.
4. It should not streak from the death location to spawn.

Repeat with a goblin and natural ghost.

Normal movement should remain smoothly interpolated.
