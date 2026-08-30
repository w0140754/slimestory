(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ENEMY_NET_PROTOCOL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Compact enemy-state protocol. High-frequency position and authoritative HP
  // are separate streams; this mask is reserved for low-frequency gameplay
  // transitions that a client cannot safely derive from motion alone.
  const STATE = Object.freeze({
    AGGRO_TARGET: 1 << 0,
    BURN: 1 << 1,
    CARRY: 1 << 2,
    HURL: 1 << 3,
    LUNGE: 1 << 4,
    RESPAWN: 1 << 5
  });

  const SCALE = Object.freeze({
    SECONDS_MS: 1000,
    UNIT_VECTOR: 1000
  });

  return Object.freeze({
    VERSION: 1,
    STATE,
    SCALE
  });
});
