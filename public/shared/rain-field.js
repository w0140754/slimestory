(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RAIN_FIELD = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 2;
  const CELL_COUNT = 20;
  const FIRST_GROW_DELAY = 0.65;
  const GROW_INTERVAL = 0.38;
  const CELL_LIFETIME = 30.0;
  const BURN_DURATION = 3.0;
  const SPEED_MULTIPLIER = 0.70;
  const FIELD_RADIUS_X = 44;
  const FIELD_RADIUS_Y = 34;
  const CELL_MIN_SPACING = 8;
  const CELL_HIT_RADIUS_SCALE = 0.40;
  const FIRE_CHAIN_RADIUS = 22;
  const FIRE_CHAIN_CHANCE = 0.60;
  const FIRE_CHAIN_MAX_IGNITIONS = 2;
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }
  function makePrng(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fieldSeed(ownerId, patchId) {
    return hashString(`${String(ownerId || "local")}|${Number(patchId) || 0}|rain-field-v${VERSION}`);
  }
  function cellBit(index) { return 1 << index; }
  function generateCells({ ownerId, patchId, centerX, centerY, worldWidth, worldHeight }) {
    const random = makePrng(fieldSeed(ownerId, patchId));
    const cells = [];
    const safeWidth = Math.max(32, Number(worldWidth) || 640);
    const safeHeight = Math.max(32, Number(worldHeight) || 400);
    const cx = Number(centerX) || safeWidth / 2;
    const cy = Number(centerY) || safeHeight / 2;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      let chosen = null;
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const angle = random() * Math.PI * 2;
        const radial = Math.sqrt(random());
        const x = clamp(cx + Math.cos(angle) * FIELD_RADIUS_X * radial, 8, safeWidth - 8);
        const y = clamp(cy + Math.sin(angle) * FIELD_RADIUS_Y * radial + 3, 12, safeHeight - 4);
        let allowed = true;
        for (const existing of cells) {
          if (Math.hypot(existing.x - x, existing.y - y) < CELL_MIN_SPACING) { allowed = false; break; }
        }
        if (allowed) { chosen = { x, y }; break; }
      }
      if (!chosen) {
        const angle = (index / CELL_COUNT) * Math.PI * 2;
        const ring = 0.55 + (index % 3) * 0.16;
        chosen = {
          x: clamp(cx + Math.cos(angle) * FIELD_RADIUS_X * ring, 8, safeWidth - 8),
          y: clamp(cy + Math.sin(angle) * FIELD_RADIUS_Y * ring + 3, 12, safeHeight - 4)
        };
      }
      const width = 17 + Math.floor(random() * 6);
      const phase = random() * Math.PI * 2;
      const growDelay = FIRST_GROW_DELAY + index * GROW_INTERVAL;
      cells.push(Object.freeze({ index, x: chosen.x, y: chosen.y, width, phase, growDelay, expiresDelay: growDelay + CELL_LIFETIME }));
    }
    return Object.freeze(cells);
  }
  function cellIsGrown(cell, fieldStartedAtMs, nowMs = Date.now()) {
    return nowMs >= Number(fieldStartedAtMs) + Number(cell.growDelay) * 1000;
  }
  function cellIsNaturallyAlive(cell, fieldStartedAtMs, nowMs = Date.now()) {
    return nowMs < Number(fieldStartedAtMs) + Number(cell.expiresDelay) * 1000;
  }
  function fieldExpiresAtMs(fieldStartedAtMs) {
    return Number(fieldStartedAtMs) + (FIRST_GROW_DELAY + (CELL_COUNT - 1) * GROW_INTERVAL + CELL_LIFETIME) * 1000;
  }
  function combinedHitRadius(cell, entityRadius = 7) {
    return Math.max(0, Number(entityRadius) || 0) + Math.max(4, Number(cell.width || 12) * CELL_HIT_RADIUS_SCALE);
  }
  return Object.freeze({ VERSION, CELL_COUNT, FIRST_GROW_DELAY, GROW_INTERVAL, CELL_LIFETIME, BURN_DURATION, SPEED_MULTIPLIER, FIELD_RADIUS_X, FIELD_RADIUS_Y, CELL_MIN_SPACING, CELL_HIT_RADIUS_SCALE, FIRE_CHAIN_RADIUS, FIRE_CHAIN_CHANCE, FIRE_CHAIN_MAX_IGNITIONS, fieldSeed, cellBit, generateCells, cellIsGrown, cellIsNaturallyAlive, fieldExpiresAtMs, combinedHitRadius });
});

