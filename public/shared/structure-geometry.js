(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.STRUCTURE_GEOMETRY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EDGE_KINDS = Object.freeze(new Set(["woodWall", "stoneWall", "woodDoor", "caveDoor", "caveMouth"]));

  function axisOf(structure) {
    return structure?.axis === "vertical" ? "vertical" : "horizontal";
  }

  function isBoundaryStructure(structure) {
    return Boolean(structure && EDGE_KINDS.has(structure.kind));
  }

  function boundarySegment(structure) {
    if (!isBoundaryStructure(structure)) return null;
    const x = Number(structure.x);
    const y = Number(structure.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (axisOf(structure) === "vertical") {
      return { x1: x, y1: y - 8, x2: x, y2: y + 8 };
    }
    return { x1: x - 8, y1: y, x2: x + 8, y2: y };
  }


  function lightBarrierSegment(structure, overlap = 0.35) {
    const segment = boundarySegment(structure);
    if (!segment) return null;
    const o = Math.max(0, Number(overlap) || 0);
    if (axisOf(structure) === "vertical") {
      return { ...segment, y1: segment.y1 - o, y2: segment.y2 + o };
    }
    return { ...segment, x1: segment.x1 - o, x2: segment.x2 + o };
  }

  function collisionRect(structure, thickness = 2) {
    const segment = boundarySegment(structure);
    if (!segment) return null;
    const t = Math.max(0.01, Number(thickness) || 2);
    const half = t / 2;
    if (axisOf(structure) === "vertical") {
      return {
        x: segment.x1 - half,
        y: Math.min(segment.y1, segment.y2),
        width: t,
        height: Math.abs(segment.y2 - segment.y1)
      };
    }
    return {
      x: Math.min(segment.x1, segment.x2),
      y: segment.y1 - half,
      width: Math.abs(segment.x2 - segment.x1),
      height: t
    };
  }

  function stoneCubeFootprintRect(structure) {
    const x = Number(structure?.x);
    const y = Number(structure?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // v450: Stone Cube uses its lower/base pixels as the physical footprint.
    // The upper half is visual height so players can walk behind the cube.
    return { x: x - 6, y: y + 2, width: 12, height: 6 };
  }

  function drawSortY(structure) {
    return Number(structure?.y) + (axisOf(structure) === "vertical" ? 8 : 0);
  }

  function sideOfBoundary(structure, x, y) {
    const sx = Number(structure?.x);
    const sy = Number(structure?.y);
    const px = Number(x);
    const py = Number(y);
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    if (axisOf(structure) === "vertical") return px < sx ? "west" : "east";
    return py < sy ? "north" : "south";
  }

  function offsetPointToSide(structure, side, distance = 2) {
    const x = Number(structure?.x);
    const y = Number(structure?.y);
    const d = Math.max(0, Number(distance) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    if (axisOf(structure) === "vertical") {
      return { x: x + (side === "west" ? -d : d), y };
    }
    return { x, y: y + (side === "north" ? -d : d) };
  }

  function offsetBoundaryPointToSide(structure, point, side, distance = 1.25) {
    const px = Number(point?.x);
    const py = Number(point?.y);
    const d = Math.max(0, Number(distance) || 0);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    if (axisOf(structure) === "vertical") {
      return { x: px + (side === "west" ? -d : d), y: py };
    }
    return { x: px, y: py + (side === "north" ? -d : d) };
  }

  function segmentRectIntersectionT(x1, y1, x2, y2, rect, padding = 0) {
    if (!rect) return null;
    const minX = Number(rect.x) - padding;
    const maxX = Number(rect.x) + Number(rect.width) + padding;
    const minY = Number(rect.y) - padding;
    const maxY = Number(rect.y) + Number(rect.height) + padding;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let tMin = 0;
    let tMax = 1;

    for (const [start, delta, low, high] of [
      [x1, dx, minX, maxX],
      [y1, dy, minY, maxY]
    ]) {
      if (Math.abs(delta) < 0.000001) {
        if (start < low || start > high) return null;
        continue;
      }
      let a = (low - start) / delta;
      let b = (high - start) / delta;
      if (a > b) [a, b] = [b, a];
      tMin = Math.max(tMin, a);
      tMax = Math.min(tMax, b);
      if (tMin > tMax) return null;
    }
    return tMin >= 0 && tMin <= 1 ? tMin : null;
  }

  function raySegmentIntersectionDistance(originX, originY, rayX, rayY, segment, minDistance = 0.08) {
    if (!segment) return null;
    const segX = segment.x2 - segment.x1;
    const segY = segment.y2 - segment.y1;
    const cross = rayX * segY - rayY * segX;
    if (Math.abs(cross) < 0.000001) return null;
    const qx = segment.x1 - originX;
    const qy = segment.y1 - originY;
    const t = (qx * segY - qy * segX) / cross;
    const u = (qx * rayY - qy * rayX) / cross;
    if (t < minDistance || u < -0.0001 || u > 1.0001) return null;
    return t;
  }

  function facadeRect(structure, options = {}) {
    if (!isBoundaryStructure(structure)) return null;
    const x = Number(structure.x);
    const y = Number(structure.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (axisOf(structure) === "horizontal") {
      return { x: x - 8, y: y - 31, width: 16, height: 32 };
    }
    const upperJoin = Boolean(options.upperJoin);
    const height = upperJoin ? 48 : 32;
    return { x: x - 2, y: y + 9 - height, width: 4, height };
  }


  function closestPointOnBoundary(structure, x, y) {
    const segment = boundarySegment(structure);
    if (!segment) return null;
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq <= 0.000001
      ? 0
      : Math.max(0, Math.min(1, ((px - segment.x1) * dx + (py - segment.y1) * dy) / lengthSq));
    return { x: segment.x1 + dx * t, y: segment.y1 + dy * t };
  }

  function sameBoundarySide(structure, ax, ay, bx, by) {
    const a = sideOfBoundary(structure, ax, ay);
    const b = sideOfBoundary(structure, bx, by);
    return Boolean(a && b && a === b);
  }

  return Object.freeze({
    VERSION: 2,
    axisOf,
    isBoundaryStructure,
    boundarySegment,
    lightBarrierSegment,
    collisionRect,
    stoneCubeFootprintRect,
    drawSortY,
    sideOfBoundary,
    offsetPointToSide,
    offsetBoundaryPointToSide,
    segmentRectIntersectionT,
    raySegmentIntersectionDistance,
    facadeRect,
    closestPointOnBoundary,
    sameBoundarySide
  });
});
