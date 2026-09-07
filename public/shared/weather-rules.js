(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.WEATHER_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const WEATHER_BLOCK_MINUTES = 360;
  const RAIN_CHANCE = 0.36;
  const MIN_RAIN_DURATION_MINUTES = 35;
  const MAX_RAIN_DURATION_MINUTES = 190;
  const MAX_START_OFFSET_MINUTES = 155;
  const FADE_MINUTES = 10;

  function hashText(text) {
    let hash = 2166136261;
    const source = String(text ?? "");
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mix(seed, value) {
    let x = (Number(seed) >>> 0) ^ (Number(value) >>> 0);
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function sample(worldSeed, mapId, blockIndex, salt) {
    const a = mix(worldSeed, hashText(mapId));
    const b = mix(a, (Math.trunc(blockIndex) + 0x9e3779b9) >>> 0);
    return mix(b, salt) / 0x100000000;
  }

  function rainEpisodeForBlock(worldSeed, mapId, blockIndex) {
    const blockStart = Math.trunc(blockIndex) * WEATHER_BLOCK_MINUTES;
    if (sample(worldSeed, mapId, blockIndex, 101) >= RAIN_CHANCE) return null;

    const startOffset = 10 + sample(worldSeed, mapId, blockIndex, 211) * MAX_START_OFFSET_MINUTES;
    const duration = MIN_RAIN_DURATION_MINUTES +
      sample(worldSeed, mapId, blockIndex, 307) *
        (MAX_RAIN_DURATION_MINUTES - MIN_RAIN_DURATION_MINUTES);

    return {
      start: blockStart + startOffset,
      end: blockStart + startOffset + duration,
      duration
    };
  }

  function activeRainEpisode(worldSeed, mapId, absoluteGameMinutes) {
    const minutes = Number(absoluteGameMinutes);
    if (!Number.isFinite(minutes)) return null;
    const blockIndex = Math.floor(minutes / WEATHER_BLOCK_MINUTES);

    // A shower can extend into the next block, so inspect the current and
    // previous deterministic block only. This is O(1) and identical on server
    // and client without any weather heartbeat traffic.
    for (const candidate of [blockIndex, blockIndex - 1]) {
      const episode = rainEpisodeForBlock(worldSeed, mapId, candidate);
      if (episode && minutes >= episode.start && minutes < episode.end) return episode;
    }
    return null;
  }

  function rainIntensity(worldSeed, mapId, absoluteGameMinutes) {
    const minutes = Number(absoluteGameMinutes);
    const episode = activeRainEpisode(worldSeed, mapId, minutes);
    if (!episode) return 0;
    const fade = Math.max(1, Math.min(FADE_MINUTES, episode.duration * 0.22));
    const inFactor = Math.max(0, Math.min(1, (minutes - episode.start) / fade));
    const outFactor = Math.max(0, Math.min(1, (episode.end - minutes) / fade));
    return Math.min(inFactor, outFactor);
  }

  function isRaining(worldSeed, mapId, absoluteGameMinutes) {
    return rainIntensity(worldSeed, mapId, absoluteGameMinutes) > 0.04;
  }

  return Object.freeze({
    version: VERSION,
    weatherBlockMinutes: WEATHER_BLOCK_MINUTES,
    rainChance: RAIN_CHANCE,
    rainEpisodeForBlock,
    activeRainEpisode,
    rainIntensity,
    isRaining
  });
});
