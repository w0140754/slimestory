(function (root, factory) {
  const rules = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = rules;
  }

  if (root) {
    root.CAMOUFLAGE_RULES = rules;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BUILD_DURATION = 1.0;
  const GRACE_DURATION = 0.5;
  const CONFUSION_DURATION = 1.25;
  const CLOSE_REVEAL_DISTANCE = 18;
  const OPENER_WINDOW_MS = 2500;
  const RAIN_GRASS_KIND = "magicGrass";
  const RAIN_GRASS_COVER_MATURITY_DELAY = 0.22;

  function rounded(value) {
    return Math.round(Number(value) || 0);
  }

  function treeCoverId(mapId, entityId, x, y) {
    if (entityId) return String(entityId);
    return `${String(mapId || "map")}:camoTree:${rounded(x)}:${rounded(y)}`;
  }

  function grassCoverId(mapId, entityId, x, y) {
    if (entityId) return String(entityId);
    return `${String(mapId || "map")}:camoGrass:${rounded(x)}:${rounded(y)}`;
  }

  function pointInTreeCover(x, y, treeX, treeY) {
    return (
      Number(y) <= Number(treeY) - 2 &&
      Math.abs(Number(x) - Number(treeX)) < 17 &&
      Number(y) > Number(treeY) - 34
    );
  }

  function rainGrassCoverId(mapId, ownerId, patchId, cellIndex) {
    return `${String(mapId || "map")}:camoRainGrass:${String(ownerId || "owner")}:${Number(patchId) || 0}:${Number(cellIndex) || 0}`;
  }

  function pointInGrassCover(x, y, grassX, grassY, width = 13) {
    const halfWidth = Math.max(6, (Number(width) || 13) * 0.48);
    return (
      Math.abs(Number(x) - Number(grassX)) <= halfWidth &&
      Number(y) >= Number(grassY) - 7 &&
      Number(y) <= Number(grassY) + 1
    );
  }

  return Object.freeze({
    version: 2,
    BUILD_DURATION,
    GRACE_DURATION,
    CONFUSION_DURATION,
    CLOSE_REVEAL_DISTANCE,
    OPENER_WINDOW_MS,
    RAIN_GRASS_KIND,
    RAIN_GRASS_COVER_MATURITY_DELAY,
    treeCoverId,
    grassCoverId,
    rainGrassCoverId,
    pointInTreeCover,
    pointInGrassCover
  });
});
