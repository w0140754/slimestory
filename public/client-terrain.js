// Slime Story terrain renderer.
// Gameplay meaning lives in shared/terrain-rules.js; this file is presentation only.

const TERRAIN_RENDER_PALETTE = TERRAIN_PRESENTATION.PALETTE;
const terrainHash = TERRAIN_PRESENTATION.hash;

function currentTerrainDefinition(mapId = currentMapId) {
  const definition = WORLD_CONTENT?.maps?.[mapId] || null;
  return TERRAIN_RULES.terrainDefinition(definition) ? definition : null;
}

function terrainTypeAtWorld(x, y, mapId = currentMapId) {
  const definition = currentTerrainDefinition(mapId);
  return definition ? TERRAIN_RULES.terrainTypeAt(definition, x, y) : null;
}

function terrainAllowsMagicGrass(x, y, mapId = currentMapId) {
  const definition = currentTerrainDefinition(mapId);
  if (!definition) return true;
  return TERRAIN_RULES.canGrowMagicGrassAt(definition, x, y) !== false;
}

function terrainWaterReflectionInfo(x, y, mapId = currentMapId, maxDistance = 16) {
  const definition = currentTerrainDefinition(mapId);
  if (!definition) return null;

  const size = TERRAIN_RULES.cellSize(definition);
  const distanceLimit = Math.max(0, Number(maxDistance) || 0);
  const horizontalMargin = 8;
  const minCellX = Math.floor((x - horizontalMargin) / size) * size;
  const maxCellX = Math.floor((x + horizontalMargin) / size) * size;
  const minCellY = Math.floor((y - distanceLimit - size) / size) * size;
  const maxCellY = Math.floor((y + distanceLimit) / size) * size;
  let best = null;

  const consider = (mirrorWorldY, distanceToShore) => {
    if (distanceToShore < 0 || distanceToShore > distanceLimit) return;
    if (!best || distanceToShore < best.distanceToShore) {
      best = {
        mirrorWorldY,
        distanceToShore,
        fade: distanceLimit > 0 ? Math.max(0, 1 - distanceToShore / distanceLimit) : 1
      };
    }
  };

  for (let cellY = minCellY; cellY <= maxCellY; cellY += size) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += size) {
      if (
        TERRAIN_RULES.terrainTypeAt(
          definition,
          cellX + size / 2,
          cellY + size / 2
        ) !== "water"
      ) {
        continue;
      }

      if (x < cellX - horizontalMargin || x > cellX + size + horizontalMargin) continue;

      const topEdge = cellY;
      const bottomEdge = cellY + size;
      const topNeighbor = TERRAIN_RULES.terrainTypeAt(definition, cellX + size / 2, topEdge - 1);
      const bottomNeighbor = TERRAIN_RULES.terrainTypeAt(definition, cellX + size / 2, bottomEdge + 1);

      if (y <= topEdge && topNeighbor !== "water") {
        consider(topEdge, topEdge - y);
      }

      if (y >= bottomEdge && bottomNeighbor !== "water") {
        consider(bottomEdge, y - bottomEdge);
      }
    }
  }

  return best;
}

function terrainWaterClipPath(mapId = currentMapId, camX = 0, camY = 0) {
  const definition = currentTerrainDefinition(mapId);
  if (!definition) return false;

  const size = TERRAIN_RULES.cellSize(definition);
  const startX = Math.floor(camX / size) * size;
  const startY = Math.floor(camY / size) * size;
  const endX = camX + VIEW_W + size;
  const endY = camY + VIEW_H + size;
  let hasWater = false;

  ctx.beginPath();

  for (let worldY = startY; worldY < endY; worldY += size) {
    for (let worldX = startX; worldX < endX; worldX += size) {
      if (
        TERRAIN_RULES.terrainTypeAt(
          definition,
          worldX + size / 2,
          worldY + size / 2
        ) !== "water"
      ) {
        continue;
      }

      hasWater = true;
      ctx.rect(
        Math.round(worldX - camX),
        Math.round(worldY - camY),
        Math.round(size),
        Math.round(size)
      );
    }
  }

  return hasWater;
}

function drawTerrainWaterSurfaceOverlay(mapId = currentMapId, camX = 0, camY = 0) {
  ctx.save();
  if (!terrainWaterClipPath(mapId, camX, camY)) {
    ctx.restore();
    return false;
  }

  ctx.clip();
  ctx.fillStyle = "rgba(76, 139, 151, .12)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  return true;
}

function drawTerrainCellTexture(type, worldX, worldY, screenX, screenY, size) {
  TERRAIN_PRESENTATION.drawCellTexture(
    ctx,
    type,
    worldX,
    worldY,
    screenX,
    screenY,
    size,
    worldTime
  );
}

function drawTerrainTransitions(definition, type, worldX, worldY, screenX, screenY, size) {
  TERRAIN_PRESENTATION.drawTransitions(
    ctx,
    type,
    worldX,
    worldY,
    screenX,
    screenY,
    size,
    (x, y) => TERRAIN_RULES.terrainTypeAt(definition, x, y)
  );
}

function drawTerrainMapTop(mapId, camX, camY) {
  const definition = currentTerrainDefinition(mapId);
  if (!definition) return false;

  const size = TERRAIN_RULES.cellSize(definition);
  const startX = Math.floor(camX / size) * size;
  const startY = Math.floor(camY / size) * size;
  const endX = camX + VIEW_W + size;
  const endY = camY + VIEW_H + size;

  for (let worldY = startY; worldY < endY; worldY += size) {
    for (let worldX = startX; worldX < endX; worldX += size) {
      const centerX = worldX + size / 2;
      const centerY = worldY + size / 2;
      const type = TERRAIN_RULES.terrainTypeAt(definition, centerX, centerY);
      if (!type || type === "void") continue;

      const palette = TERRAIN_RENDER_PALETTE[type];
      if (!palette) continue;

      const screenX = Math.round(worldX - camX);
      const screenY = Math.round(worldY - camY);
      ctx.fillStyle = palette.base;
      ctx.fillRect(screenX, screenY, size, size);
      drawTerrainCellTexture(type, worldX, worldY, screenX, screenY, size);
      drawTerrainTransitions(definition, type, worldX, worldY, screenX, screenY, size);
    }
  }

  return true;
}

const TERRAIN_SOUTH_FACE_CACHE = new Map();

function terrainSouthFaceStyle(type) {
  if (type === "water") {
    return {
      face: "#315e76",
      band: "#294f65",
      bottom: "#1f3d50"
    };
  }

  return {
    face: "#855b3b",
    band: "#725036",
    bottom: "#543723"
  };
}

function terrainSouthVoidSegments(mapId) {
  if (TERRAIN_SOUTH_FACE_CACHE.has(mapId)) {
    return TERRAIN_SOUTH_FACE_CACHE.get(mapId);
  }

  const definition = currentTerrainDefinition(mapId);
  if (!definition) return [];

  const size = TERRAIN_RULES.cellSize(definition);
  const dimensions = definition.dimensions || { width: world.width, height: world.height };
  const rowsByType = new Map();

  for (let y = 0; y < dimensions.height; y += size) {
    for (let x = 0; x < dimensions.width; x += size) {
      const type = TERRAIN_RULES.terrainTypeAt(definition, x + size / 2, y + size / 2);
      if (!type || type === "void") continue;
      if (!TERRAIN_RULES.typeRules(type).walkable && type !== "water") continue;

      const below = TERRAIN_RULES.terrainTypeAt(definition, x + size / 2, y + size + size / 2);
      if (below !== "void") continue;

      const edgeY = y + size;
      const rowKey = `${type}:${edgeY}`;
      if (!rowsByType.has(rowKey)) rowsByType.set(rowKey, []);
      rowsByType.get(rowKey).push(x);
    }
  }

  const segments = [];
  for (const [rowKey, xs] of rowsByType) {
    const separator = rowKey.lastIndexOf(":");
    const type = rowKey.slice(0, separator);
    const y = Number(rowKey.slice(separator + 1));
    xs.sort((a, b) => a - b);
    let start = null;
    let previous = null;

    for (const x of xs) {
      if (start === null) {
        start = x;
        previous = x;
        continue;
      }

      if (x === previous + size) {
        previous = x;
        continue;
      }

      segments.push({ x: start, y, width: previous - start + size, type });
      start = x;
      previous = x;
    }

    if (start !== null) {
      segments.push({ x: start, y, width: previous - start + size, type });
    }
  }

  TERRAIN_SOUTH_FACE_CACHE.set(mapId, segments);
  return segments;
}

function drawTerrainSouthVoidFaces(mapId, camX, camY, depth = 10) {
  const segments = terrainSouthVoidSegments(mapId);
  if (!segments.length) return false;

  ctx.save();
  for (const segment of segments) {
    const x = Math.round(segment.x - camX);
    const y = Math.round(segment.y - camY);
    const width = Math.round(segment.width);
    const style = terrainSouthFaceStyle(segment.type);

    ctx.fillStyle = style.face;
    ctx.fillRect(x, y, width, depth);

    ctx.fillStyle = style.band;
    ctx.fillRect(x, y + 3, width, 2);

    ctx.fillStyle = style.bottom;
    ctx.fillRect(x, y + depth, width, 2);
  }
  ctx.restore();
  return true;
}


