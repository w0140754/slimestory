(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ABILITY_SCALING = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const MAX_LEVEL = 20;

  function clampLevel(level, maxLevel = MAX_LEVEL) {
    return Math.max(1, Math.min(maxLevel, Math.floor(Number(level) || 1)));
  }

  function linearAtLevel(level, levelOneValue, maxLevelValue, maxLevel = MAX_LEVEL) {
    const cleanLevel = clampLevel(level, maxLevel);
    if (maxLevel <= 1) return Number(maxLevelValue) || Number(levelOneValue) || 0;
    const t = (cleanLevel - 1) / (maxLevel - 1);
    return Number(levelOneValue) + (Number(maxLevelValue) - Number(levelOneValue)) * t;
  }

  const RAIN_CLOUD = Object.freeze({
    maxLevel: MAX_LEVEL,
    levelOneGrassSlowPercent: 10,
    maxLevelGrassSlowPercent: 30,
    levelOneCooldown: 30.0,
    maxLevelCooldown: 20.0,
    levelOneCastTime: 2.0,
    maxLevelCastTime: 0.5
  });

  const HALLUCINATION = Object.freeze({
    maxLevel: MAX_LEVEL,
    levelOneBlinkRange: 30,
    maxLevelBlinkRange: 60,
    levelOneCooldown: 20.0,
    maxLevelCooldown: 15.0,
    levelOneDecoyDuration: 2.0,
    maxLevelDecoyDuration: 5.0
  });

  function rainCloudGrassSlowPercentAtLevel(level) {
    return linearAtLevel(
      level,
      RAIN_CLOUD.levelOneGrassSlowPercent,
      RAIN_CLOUD.maxLevelGrassSlowPercent,
      RAIN_CLOUD.maxLevel
    );
  }

  function rainCloudGrassSpeedMultiplierAtLevel(level) {
    return Math.max(0.1, 1 - rainCloudGrassSlowPercentAtLevel(level) / 100);
  }

  function rainCloudCooldownAtLevel(level) {
    return linearAtLevel(
      level,
      RAIN_CLOUD.levelOneCooldown,
      RAIN_CLOUD.maxLevelCooldown,
      RAIN_CLOUD.maxLevel
    );
  }


  function rainCloudCastTimeAtLevel(level) {
    return linearAtLevel(
      level,
      RAIN_CLOUD.levelOneCastTime,
      RAIN_CLOUD.maxLevelCastTime,
      RAIN_CLOUD.maxLevel
    );
  }

  function hallucinationBlinkRangeAtLevel(level) {
    return linearAtLevel(
      level,
      HALLUCINATION.levelOneBlinkRange,
      HALLUCINATION.maxLevelBlinkRange,
      HALLUCINATION.maxLevel
    );
  }

  function hallucinationCooldownAtLevel(level) {
    return linearAtLevel(
      level,
      HALLUCINATION.levelOneCooldown,
      HALLUCINATION.maxLevelCooldown,
      HALLUCINATION.maxLevel
    );
  }

  function hallucinationDecoyDurationAtLevel(level) {
    return linearAtLevel(
      level,
      HALLUCINATION.levelOneDecoyDuration,
      HALLUCINATION.maxLevelDecoyDuration,
      HALLUCINATION.maxLevel
    );
  }

  return Object.freeze({
    VERSION,
    MAX_LEVEL,
    rainCloud: RAIN_CLOUD,
    hallucination: HALLUCINATION,
    clampLevel,
    linearAtLevel,
    rainCloudGrassSlowPercentAtLevel,
    rainCloudGrassSpeedMultiplierAtLevel,
    rainCloudCooldownAtLevel,
    rainCloudCastTimeAtLevel,
    hallucinationBlinkRangeAtLevel,
    hallucinationCooldownAtLevel,
    hallucinationDecoyDurationAtLevel
  });
});
