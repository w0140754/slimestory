// Slime Story client foundation: build identity and low-side-effect configuration.
// Keep this file free of DOM access and mutable gameplay state.

const CLIENT_BUILD_VERSION = "6-11-390";

const CLIENT_AUTO_RELOAD_SIGNATURE_KEY = "slimeStoryAutoReloadSignature";

const MAP_WORLD_DIMENSIONS = Object.freeze({
  default: Object.freeze({ width: 400, height: 400 })
});

const GAME_CONFIG = Object.freeze({
  player: {
    baseSpeed: 54,
    wetDuration: 3.0,
    wetSpeedMultiplier: 0.75
  },

  status: {
    enemyWetDuration: 3.0,
    enemyWetSpeedMultiplier: 0.75
  },

  house: {
    width: 64,
    height: 64,
    collisionWidth: 48,
    collisionHeight: 30,
    pathWidth: 16,
    pathHeight: 24
  },

  rainCloud: {
    baseLifetime: 12.0,
    ghostDamage: 2
  }

});
