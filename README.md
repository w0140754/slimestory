Slime Story v6-11-57 — Generic Hurl + Combat Leash Cleanup

Changes in this build:
- Removed the dormant player-grave / grave-ghost system completely.
- Normal Ghost Grove ghosts remain unchanged as a real enemy species.
- Hurl now targets generic enemies rather than only slimes.
- Slimes and goblins are hurlable.
- Ghosts are explicitly marked hurlable: false.
- Added a per-enemy/per-spawn hurlable override so future monsters can opt out without adding Hurl-specific code.
- Generic Hurl handles grab, carry, throw, landing damage, monster collisions, and tree collisions.
- Goblins now render correctly while carried and while flying through the air.
- Hurl uses the generic enemyAction route for both slimes and goblins.
- Existing slime combat/damage snapshots remain on their legacy channel for now; Hurl itself no longer depends on that distinction.

Leash changes:
- Patrol/wander leash remains relatively compact.
- Once an enemy is actively in combat, it can pursue much farther before giving up.
- Slime combat leash: 240 px.
- Goblin combat leash: 260 px.
- Ghost combat leash: 280 px.
- This is intended to stop ranged characters from safely killing enemies by standing just outside the old home leash.

Validation:
- Client syntax check passed.
- Server syntax check passed.
- Server startup smoke test passed with a local WebSocket stub (the container does not have the ws package installed).
- Hurl smoke test passed: goblin and slime can be grabbed; ghost is rejected.
- Combat-leash smoke test passed for slime, goblin, and ghost beyond their old leash ranges.
Slime Story v6-11-56 — Generic Enemy Runtime Refactor

This is intentionally a behavior-preserving architecture pass. No new monster, balance change, skill change, art change, map change, or item change was added.

Refactor highlights:
- Added a client-side generic enemy runtime/profile registry.
- Added generic active-enemy iteration instead of repeatedly enumerating slime/goblin/ghost arrays.
- Camouflage engagement/reveal checks now work through the generic enemy registry.
- Focus Fire targeting, body aim points, lock marker sizing, and projectile damage now use enemy profiles.
- Fire spread/ignite, Rain interactions, basic projectiles, Fireball collision, burning glows, Jester Blink taunts, melee attacks, bow close-target checks, and world rendering now work through generic enemy helpers.
- Species-specific client quirks (blue/purple slime spawn data, goblin lunge snapshot state, etc.) are isolated behind profile hooks.
- Added server-side generic enemy runtime metadata and centralized enemy factory/registry creation.
- Server environment fire, Camouflage engagement checks, transient taunt cleanup, respawn/drop metadata, and shared snapshot broadcasting now use the generic registry.
- New non-slime species automatically use the generic shared-enemy snapshot/action collection once registered. Slimes intentionally retain their special protocol because Hurl/carrying is slime-specific.

Intentional species-specific code that remains:
- Slime/Goblin/Ghost AI and movement implementations.
- Their sprite render functions.
- Hurl remains explicitly slime-only.
- Grave ghosts remain a local-only special case.
- Goblin lunge animation data is a profile hook rather than a shared-system branch.

Refactor audit:
- Direct client species loops reduced from 39 to 6; the remaining loops are species-specific AI/Hurl helpers rather than shared combat/skill systems.
- Server startup/health entity counts match v6-11-55 exactly: 25 shared enemies (20 slime, 3 goblin, 2 ghost).
- Client and server syntax checks pass.

---

Slime Story v6-11-55 — Dreamcatcher + Respawn Tuning

Changes:
- Added the user-drawn Dreamcatcher bow as a separate weapon.
- Dreamcatcher is sold in the existing shop for 1 coin.
- Wood Bow remains unchanged and available separately.
- Dreamcatcher uses the same bow mechanics as Wood Bow: arrows, one-second draw, bow melee, Focus Fire, Strafe, Camouflage opener behavior, PvP validation, and multiplayer visuals.
- Tree regrowth increased from 75–105 seconds to 180–240 seconds (3–4 minutes).
- Tall-grass/brush regrowth increased from 25–45 seconds to 90–120 seconds (1.5–2 minutes).
- Slime respawn increased from 2 seconds to 30 seconds.
- Goblin respawn increased from 4 seconds to 40 seconds.
- Ghost respawn increased from 6 seconds to 50 seconds.
