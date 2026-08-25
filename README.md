Slime Story v6-11-150 — Weapon Class Locks + Clearer Wand Mastery Scratch

Added:
- Class-locked Fire Wand, Rain Wand, Tournesol/key wand, and Tabatha's Key/sunflower wand to Magus.
- Class-locked Dreamcatcher to Ranger.
- Class-locked Katana to Rogue.
- Locked weapons now sort into their class tabs in the shop and show their required class in shop metadata.
- Off-class weapon equip attempts use the same REQUIRES CLASS feedback as class-locked armor.

Adjusted:
- Wand Mastery's three-hit claw scratch begins 4px earlier for stronger readability.
- The existing finishing endpoint is preserved; only the start side is extended.
- Normal slash thickness, lifetime, travel timing, and endpoint are unchanged.

Preserved from v6-11-149:
- True atomic enemy map-entry position rebase and covered scene synchronization.
- Fixed Shop/Escape menu sizing and menu-safe message toasts.

--- Previous README ---
Slime Story v6-11-149 — True Atomic Enemy Position Rebase

Fixed:
- v6-11-147 startup crash: onlineClient is now declared startup-safe before any map/input code can reference it.
- Map transitions now stay covered until the authoritative enemy snapshot batch is complete.
- New-map enemies are initialized at their server positions before the scene is revealed, preventing both position-jumps and pop-in.
- Gameplay simulation is briefly paused during the cover/sync/reveal boundary so the player cannot move or act inside a scene that is not ready yet.
- Retains the 1.2s emergency sync fallback only as a disconnect/failure safeguard.

Preserved from v6-11-147:
- Map-specific enemy snapshot batching and enemySnapshotSyncComplete marker.
- Snapshot rebases do not play false spawn/death effects.
- Fixed Shop/Escape menu sizing and menu-safe message toasts from v6-11-146.

--- Previous README ---
Slime Story v6-11-78 — Shepherd Staff + Wood Armor

Added:
- Craftable Shepherd Staff using the supplied 16x16 player-drawn sprite.
  - Costs 5 Wood.
  - Equipable/hotbar assignable as a third wand-type weapon.
  - Uses wand hand pivot/attack behavior and fires a green-gold basic magic projectile.
  - Uses the existing basic wand damage class.
- Craftable Wood Armor set using the supplied layered player sprites.
  - Wood Helm: 3 Wood.
  - Wood Chest (torso + both arms): 5 Wood.
  - Wood Greaves (both legs): 4 Wood.
  - Each piece can be worn independently and mixes with all existing gear.
- New equipment and inventory entries for the staff and wood armor.
- Multiplayer equipment synchronization extended to the new weapon/armor indices.
- Client/server build version bumped to 6-11-78 and world-content cache query bumped.

Preserved from v6-11-77:
- Dead players remain stationary as ghosts until Respawn is clicked.
- Ghost floating/pulsing shadow.
- Explicit Respawn button and server-authoritative respawn.
- Gold baby slimes aggro by default and use boss-aware respawn rules.


v6-11-149 correction:
- Fixed the remaining visible enemy jump after a covered map transition.
- Map-entry enemy snapshots now hard-rebase each enemy's live x/y to the authoritative server snapshot while the transition is still fully covered.
- Normal in-map enemy network updates continue to use smoothing/interpolation; only the initial map-entry snapshot bypasses interpolation.
- This makes the first revealed frame use the synchronized enemy positions instead of stale positions from a previous visit.
