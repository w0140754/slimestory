(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PLAYER_NET_PROTOCOL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Player replication is intentionally split into four semantic channels:
  // movement anchors, continuous aim, transient actions, and durable state.
  // These action codes are low-frequency transition/start events; animation
  // clocks are advanced locally after receipt instead of being streamed.
  const ACTION = Object.freeze({
    ATTACK: 1,
    BOW_DRAW: 2,
    BOW_RELEASE: 3,
    FOCUS_FIRE: 4,
    FIREBALL_AIM: 5,
    RAIN_CAST: 6,
    SHADOW_HIDE: 7,
    SHADOW_REVEAL: 8,
    HURL_REACH: 9
  });

  const DIRECTION = Object.freeze({
    LEFT: 0,
    RIGHT: 1,
    UP: 2,
    DOWN: 3
  });

  const AIM_STEPS = 256;
  const AIM_MIN_STEP_DELTA = 4; // ~5.6 degrees; avoids tiny mouse-jitter packets.
  const AIM_HEARTBEAT_MS = 500;

  function encodeAim(angle) {
    const twoPi = Math.PI * 2;
    let normalized = Number(angle) || 0;
    normalized %= twoPi;
    if (normalized < 0) normalized += twoPi;
    return Math.round((normalized / twoPi) * (AIM_STEPS - 1));
  }

  function decodeAim(value) {
    const q = Math.max(0, Math.min(AIM_STEPS - 1, Math.round(Number(value) || 0)));
    return (q / (AIM_STEPS - 1)) * Math.PI * 2;
  }

  function circularStepDelta(a, b) {
    const qa = Math.max(0, Math.min(AIM_STEPS - 1, Math.round(Number(a) || 0)));
    const qb = Math.max(0, Math.min(AIM_STEPS - 1, Math.round(Number(b) || 0)));
    const raw = Math.abs(qa - qb);
    return Math.min(raw, AIM_STEPS - raw);
  }

  return Object.freeze({
    VERSION: 1,
    ACTION,
    DIRECTION,
    AIM_STEPS,
    AIM_MIN_STEP_DELTA,
    AIM_HEARTBEAT_MS,
    encodeAim,
    decodeAim,
    circularStepDelta
  });
});
