(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ACTION_BALANCE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;

  const FIREBALL = Object.freeze({
    cooldown: 7.0
  });

  const RAIN_CLOUD = Object.freeze({
    cooldown: 30.0,
    castTime: 2.0,
    grassSlowPercent: 10,
    grassSpeedMultiplier: 0.90
  });

  return Object.freeze({
    VERSION,
    fireball: FIREBALL,
    rainCloud: RAIN_CLOUD
  });
});
