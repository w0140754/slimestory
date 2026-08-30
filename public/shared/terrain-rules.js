(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.TERRAIN_RULES = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = Object.freeze({
    void: Object.freeze({ walkable: false, magicGrass: false }),
    grass: Object.freeze({ walkable: true, magicGrass: true }),
    dirt: Object.freeze({ walkable: true, magicGrass: true }),
    water: Object.freeze({ walkable: false, magicGrass: false }),
    stone: Object.freeze({ walkable: true, magicGrass: false })
  });

  function normalizeType(type, fallback = "void") {
    const normalized = String(type || "").trim();
    return TYPES[normalized] ? normalized : fallback;
  }

  function terrainDefinition(mapDefinition) {
    const terrain = mapDefinition?.terrain;
    return terrain && typeof terrain === "object" ? terrain : null;
  }

  function cellSize(mapDefinition) {
    const terrain = terrainDefinition(mapDefinition);
    const value = Number(terrain?.cellSize);
    return Number.isFinite(value) && value >= 2 ? value : 8;
  }

  function regionRect(region) {
    const source = region?.rect && typeof region.rect === "object"
      ? region.rect
      : region;

    const x = Number(source?.x);
    const y = Number(source?.y);
    const width = Number(source?.width);
    const height = Number(source?.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }

    return { x, y, width, height };
  }

  function pointInRect(x, y, rect) {
    return (
      x >= rect.x &&
      x < rect.x + rect.width &&
      y >= rect.y &&
      y < rect.y + rect.height
    );
  }

  function terrainTypeAt(mapDefinition, x, y) {
    const terrain = terrainDefinition(mapDefinition);
    if (!terrain) return null;

    let type = normalizeType(terrain.defaultType, "void");
    const regions = Array.isArray(terrain.regions) ? terrain.regions : [];

    // Regions are paint operations: later entries sit on top of earlier ones.
    // That makes the same schema convenient for a future visual terrain brush.
    for (const region of regions) {
      const rect = regionRect(region);
      if (!rect || !pointInRect(x, y, rect)) continue;
      type = normalizeType(region.type, type);
    }

    return type;
  }

  function typeRules(type) {
    return TYPES[normalizeType(type, "void")];
  }

  function isWalkableAt(mapDefinition, x, y) {
    const type = terrainTypeAt(mapDefinition, x, y);
    if (type === null) return null;
    return Boolean(typeRules(type).walkable);
  }

  function canGrowMagicGrassAt(mapDefinition, x, y) {
    const type = terrainTypeAt(mapDefinition, x, y);
    if (type === null) return null;
    return Boolean(typeRules(type).magicGrass);
  }

  function sampleCircle(mapDefinition, x, y, radius, predicate) {
    const r = Math.max(0, Number(radius) || 0);
    const samples = r > 0
      ? [
          [0, 0],
          [r, 0], [-r, 0], [0, r], [0, -r],
          [r * 0.7071, r * 0.7071],
          [-r * 0.7071, r * 0.7071],
          [r * 0.7071, -r * 0.7071],
          [-r * 0.7071, -r * 0.7071]
        ]
      : [[0, 0]];

    for (const [dx, dy] of samples) {
      if (!predicate(terrainTypeAt(mapDefinition, x + dx, y + dy))) {
        return false;
      }
    }

    return true;
  }

  function circleCanOccupy(mapDefinition, x, y, radius = 0) {
    if (!terrainDefinition(mapDefinition)) return null;
    return sampleCircle(
      mapDefinition,
      x,
      y,
      radius,
      type => Boolean(typeRules(type).walkable)
    );
  }

  function circleTouchesType(mapDefinition, x, y, radius, wantedType) {
    if (!terrainDefinition(mapDefinition)) return false;
    const normalizedWanted = normalizeType(wantedType, "void");
    let touched = false;

    sampleCircle(mapDefinition, x, y, radius, type => {
      if (normalizeType(type, "void") === normalizedWanted) {
        touched = true;
      }
      return true;
    });

    return touched;
  }

  // Follow a line from a known in-map point toward a requested target and
  // stop at the first void boundary. Water/stone remain legitimate terrain:
  // this helper is specifically about the edge of the authored map.
  //
  // It is intentionally shared by client + server so targeted abilities can
  // preview the same point the authoritative simulation will accept.
  function clampSegmentToNonVoid(
    mapDefinition,
    startX,
    startY,
    targetX,
    targetY
  ) {
    if (!terrainDefinition(mapDefinition)) {
      return { x: Number(targetX) || 0, y: Number(targetY) || 0, clamped: false };
    }

    const sx = Number(startX);
    const sy = Number(startY);
    const tx = Number(targetX);
    const ty = Number(targetY);

    if (![sx, sy, tx, ty].every(Number.isFinite)) {
      return { x: Number.isFinite(sx) ? sx : 0, y: Number.isFinite(sy) ? sy : 0, clamped: true };
    }

    if (terrainTypeAt(mapDefinition, sx, sy) === "void") {
      return { x: sx, y: sy, clamped: true };
    }

    const dx = tx - sx;
    const dy = ty - sy;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) {
      return { x: sx, y: sy, clamped: false };
    }

    // A one-pixel sample keeps the resolved point visually tight to an 8px
    // terrain edge while remaining tiny work for an occasional ability cast.
    const steps = Math.max(1, Math.ceil(distance));
    let lastX = sx;
    let lastY = sy;

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = sx + dx * t;
      const y = sy + dy * t;

      if (terrainTypeAt(mapDefinition, x, y) === "void") {
        return { x: lastX, y: lastY, clamped: true };
      }

      lastX = x;
      lastY = y;
    }

    return { x: tx, y: ty, clamped: false };
  }

  return Object.freeze({
    TYPES,
    normalizeType,
    terrainDefinition,
    cellSize,
    regionRect,
    terrainTypeAt,
    typeRules,
    isWalkableAt,
    canGrowMagicGrassAt,
    circleCanOccupy,
    circleTouchesType,
    clampSegmentToNonVoid
  });
});
