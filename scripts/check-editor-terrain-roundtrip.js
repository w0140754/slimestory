"use strict";

const WORLD_CONTENT = require("../public/shared/world-content.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");

function rasterize(map) {
  const cellSize = TERRAIN_RULES.cellSize(map);
  const width = Number(map.dimensions.width);
  const height = Number(map.dimensions.height);
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells = new Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells[row * cols + col] = TERRAIN_RULES.terrainTypeAt(
        map,
        col * cellSize + cellSize / 2,
        row * cellSize + cellSize / 2
      ) || "void";
    }
  }

  return { cellSize, width, height, cols, rows, cells };
}

function compress(draft) {
  const size = draft.cellSize;
  const runsByRow = [];

  for (let row = 0; row < draft.rows; row += 1) {
    const runs = [];
    let col = 0;
    while (col < draft.cols) {
      const type = draft.cells[row * draft.cols + col];
      if (type === "void") {
        col += 1;
        continue;
      }
      const start = col;
      col += 1;
      while (col < draft.cols && draft.cells[row * draft.cols + col] === type) col += 1;
      runs.push({
        type,
        x: start * size,
        y: row * size,
        width: (col - start) * size,
        height: size
      });
    }
    runsByRow.push(runs);
  }

  const regions = [];
  let active = new Map();
  for (const runs of runsByRow) {
    const next = new Map();
    for (const run of runs) {
      const key = `${run.type}:${run.x}:${run.width}`;
      const previous = active.get(key);
      if (previous && previous.y + previous.height === run.y) {
        previous.height += size;
        next.set(key, previous);
      } else {
        const region = { ...run };
        regions.push(region);
        next.set(key, region);
      }
    }
    active = next;
  }

  return regions.map(region => ({
    type: region.type,
    x: region.x,
    y: region.y,
    width: Math.min(region.width, draft.width - region.x),
    height: Math.min(region.height, draft.height - region.y)
  })).filter(region => region.width > 0 && region.height > 0);
}

let checked = 0;
for (const [mapId, map] of Object.entries(WORLD_CONTENT.maps || {})) {
  if (!map?.terrain || !map?.dimensions) continue;
  const draft = rasterize(map);
  const roundTripMap = {
    ...map,
    terrain: {
      cellSize: draft.cellSize,
      defaultType: "void",
      regions: compress(draft)
    }
  };

  for (let row = 0; row < draft.rows; row += 1) {
    for (let col = 0; col < draft.cols; col += 1) {
      const expected = draft.cells[row * draft.cols + col];
      const actual = TERRAIN_RULES.terrainTypeAt(
        roundTripMap,
        col * draft.cellSize + draft.cellSize / 2,
        row * draft.cellSize + draft.cellSize / 2
      );
      if (actual !== expected) {
        throw new Error(
          `${mapId} editor terrain round-trip mismatch at cell ${col},${row}: ${expected} -> ${actual}`
        );
      }
    }
  }
  checked += 1;
}

if (checked === 0) throw new Error("No terrain-driven maps found for editor round-trip check");
console.log(`Editor terrain round-trip OK: ${checked} maps`);
