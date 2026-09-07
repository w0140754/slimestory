(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.STRUCTURE_TOPOLOGY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_GRID_SIZE = 16;
  const LAYERS = Object.freeze({
    BASE: "base",
    SURFACE: "surface",
    OBJECT: "object",
    BOUNDARY: "boundary",
    ATTACHMENT: "attachment"
  });
  const SURFACE_KINDS = Object.freeze(new Set(["woodFloor", "stoneFloor"]));
  const BOUNDARY_KINDS = Object.freeze(new Set(["woodWall", "woodDoor"]));

  // v411: occupancy is intentionally layered. A structure cell is not a single
  // slot: terrain/base, floor/surface, furniture/object, wall/boundary and
  // wall-mounted/attachment content are separate channels. Only surface and
  // boundary layers participate in automatic roof topology.
  function layerOf(structure) {
    if (!structure) return null;
    if (SURFACE_KINDS.has(structure.kind)) return LAYERS.SURFACE;
    if (BOUNDARY_KINDS.has(structure.kind)) return LAYERS.BOUNDARY;
    if (structure.kind === "torch" && structure.mountType === "wall") return LAYERS.ATTACHMENT;
    return LAYERS.OBJECT;
  }

  function cellKey(x, y) {
    return `${Math.round(Number(x))},${Math.round(Number(y))}`;
  }

  function boundaryKey(axis, x, y) {
    return `${axis === "vertical" ? "vertical" : "horizontal"}:${Math.round(Number(x))},${Math.round(Number(y))}`;
  }

  function edgeBetweenCellAndNeighbor(x, y, dx, dy, gridSize = DEFAULT_GRID_SIZE) {
    const half = gridSize / 2;
    if (dx === 0 && dy === -gridSize) return { side: "north", key: boundaryKey("horizontal", x, y - half) };
    if (dx === gridSize && dy === 0) return { side: "east", key: boundaryKey("vertical", x + half, y) };
    if (dx === 0 && dy === gridSize) return { side: "south", key: boundaryKey("horizontal", x, y + half) };
    if (dx === -gridSize && dy === 0) return { side: "west", key: boundaryKey("vertical", x - half, y) };
    return null;
  }

  function automaticRoofRegions(structures, gridSize = DEFAULT_GRID_SIZE) {
    const cleanGridSize = Math.max(1, Number(gridSize) || DEFAULT_GRID_SIZE);
    const floors = new Map();
    const boundaries = new Set();

    for (const structure of Array.isArray(structures) ? structures : []) {
      const layer = layerOf(structure);
      if (layer === LAYERS.SURFACE) {
        floors.set(cellKey(structure.x, structure.y), structure);
      } else if (layer === LAYERS.BOUNDARY) {
        boundaries.add(boundaryKey(structure.axis, structure.x, structure.y));
      }
    }

    const directions = [
      [0, -cleanGridSize],
      [cleanGridSize, 0],
      [0, cleanGridSize],
      [-cleanGridSize, 0]
    ];
    const visited = new Set();
    const regions = [];

    for (const [startKey, startFloor] of floors.entries()) {
      if (visited.has(startKey)) continue;

      const queue = [startFloor];
      const component = [];
      const componentKeys = new Set([startKey]);
      visited.add(startKey);

      while (queue.length) {
        const floor = queue.shift();
        component.push(floor);
        const x = Number(floor.x);
        const y = Number(floor.y);

        for (const [dx, dy] of directions) {
          const neighborKey = cellKey(x + dx, y + dy);
          const neighbor = floors.get(neighborKey);
          if (!neighbor || visited.has(neighborKey)) continue;

          // A wall/door is a real topological separator even if floor exists on
          // both sides. This is the key v411 rule: a porch/deck/floor touching
          // the outside of a completed house does not merge into its interior.
          const edge = edgeBetweenCellAndNeighbor(x, y, dx, dy, cleanGridSize);
          if (edge && boundaries.has(edge.key)) continue;

          visited.add(neighborKey);
          componentKeys.add(neighborKey);
          queue.push(neighbor);
        }
      }

      let enclosed = component.length > 0;
      const perimeterBoundaries = new Set();
      const foregroundBoundaries = new Set();

      for (const floor of component) {
        const x = Number(floor.x);
        const y = Number(floor.y);
        for (const [dx, dy] of directions) {
          const neighborKey = cellKey(x + dx, y + dy);
          if (componentKeys.has(neighborKey)) continue;

          const edge = edgeBetweenCellAndNeighbor(x, y, dx, dy, cleanGridSize);
          if (!edge) continue;
          perimeterBoundaries.add(edge.key);
          if (edge.side === "south") foregroundBoundaries.add(edge.key);
          if (!boundaries.has(edge.key)) {
            enclosed = false;
            break;
          }
        }
        if (!enclosed) break;
      }

      if (enclosed) {
        regions.push({
          floors: component,
          floorKeys: componentKeys,
          boundaryKeys: perimeterBoundaries,
          foregroundBoundaryKeys: foregroundBoundaries
        });
      }
    }

    return regions;
  }

  function roofedFloorKeys(structures, gridSize = DEFAULT_GRID_SIZE) {
    const keys = new Set();
    for (const region of automaticRoofRegions(structures, gridSize)) {
      for (const key of region.floorKeys || []) keys.add(key);
    }
    return keys;
  }

  return Object.freeze({
    VERSION: 2,
    DEFAULT_GRID_SIZE,
    LAYERS,
    SURFACE_KINDS,
    layerOf,
    cellKey,
    boundaryKey,
    edgeBetweenCellAndNeighbor,
    automaticRoofRegions,
    roofedFloorKeys
  });
});
