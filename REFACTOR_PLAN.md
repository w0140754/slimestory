# v277 rollback note

The v276 CompactPassiveWander experiment was rejected after live testing: passive enemies appeared frozen and snapped when promoted to active motion. v277 is intentionally based on the known-good v275 code and restores the full authoritative-anchor `enemyWanderIntent` contract. Do not reintroduce anchorless passive legs or batching without visual-equivalence tests.

# v275 Player Replication Refactor

## Goal
Stop treating animation/cast progress as generic player state.

## Final channel boundaries
- movement -> `playerMove`
- continuous aim -> `playerAim`
- action starts/transitions -> `playerAction`
- Wet -> `playerWetState`
- combat/lifecycle -> existing dedicated authoritative events
- durable state -> `playerStatePatch` / `playerStateDelta`
- recovery/bootstrap -> full player snapshots

## Design rule
If a value can be reconstructed from a start event + known duration, do not stream its timer.
