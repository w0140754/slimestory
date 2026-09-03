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

function drawBeachTideOverlay(mapId = currentMapId, camX = 0, camY = 0) {
  const definition = currentTerrainDefinition(mapId);
  if (!definition) return false;

  const size = TERRAIN_RULES.cellSize(definition);
  const startX = Math.floor(camX / size) * size;
  const startY = Math.floor(camY / size) * size;
  const endX = camX + VIEW_W + size;
  const endY = camY + VIEW_H + size;
  const tidePhase = Math.floor((worldTime || 0) * 2) % 6;
  let drew = false;

  const sampleType = (x, y) => TERRAIN_RULES.terrainTypeAt(definition, x, y);

  ctx.save();
  for (let worldY = startY; worldY < endY; worldY += size) {
    for (let worldX = startX; worldX < endX; worldX += size) {
      const type = sampleType(worldX + size / 2, worldY + size / 2);
      if (type !== "sand") continue;

      const top = sampleType(worldX + size / 2, worldY - 1);
      const bottom = sampleType(worldX + size / 2, worldY + size + 1);
      const left = sampleType(worldX - 1, worldY + size / 2);
      const right = sampleType(worldX + size + 1, worldY + size / 2);
      if (top !== "water" && bottom !== "water" && left !== "water" && right !== "water") {
        continue;
      }

      const screenX = Math.round(worldX - camX);
      const screenY = Math.round(worldY - camY);
      const hashValue = terrainHash(worldX, worldY, 209);
      const drift = ((hashValue >>> 3) % 2) + (tidePhase >= 3 ? 1 : 0);

      ctx.fillStyle = "rgba(171, 152, 108, 0.28)";
      if (top === "water") ctx.fillRect(screenX, screenY, size, Math.min(2 + drift, size));
      if (bottom === "water") ctx.fillRect(screenX, screenY + size - Math.min(2 + drift, size), size, Math.min(2 + drift, size));
      if (left === "water") ctx.fillRect(screenX, screenY, Math.min(2 + drift, size), size);
      if (right === "water") ctx.fillRect(screenX + size - Math.min(2 + drift, size), screenY, Math.min(2 + drift, size), size);

      if (((hashValue >>> 6) % 6) === tidePhase) {
        ctx.fillStyle = "rgba(240, 248, 252, 0.72)";
        if (top === "water") ctx.fillRect(screenX + 1, screenY + drift, Math.max(2, size - 2), 1);
        if (bottom === "water") ctx.fillRect(screenX + 1, screenY + size - 1 - drift, Math.max(2, size - 2), 1);
        if (left === "water") ctx.fillRect(screenX + drift, screenY + 1, 1, Math.max(2, size - 2));
        if (right === "water") ctx.fillRect(screenX + size - 1 - drift, screenY + 1, 1, Math.max(2, size - 2));
      }
      drew = true;
    }
  }
  ctx.restore();
  return drew;
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
    (x, y) => TERRAIN_RULES.terrainTypeAt(definition, x, y),
    worldTime
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

function drawWaterfallGroveLandmark(mapId, camX, camY) {
  if (mapId !== "waterfallGrove") return false;
  const waterfall = WORLD_CONTENT?.maps?.[mapId]?.landmarks?.waterfall;
  if (!waterfall) return false;

  const centerX = Number(waterfall.x) || 320;
  const topY = Number(waterfall.topY) || 76;
  const baseY = Number(waterfall.baseY) || 218;
  const width = Number(waterfall.width) || 88;
  const left = Number(waterfall.cliffLeft) || 160;
  const right = Number(waterfall.cliffRight) || 480;
  const fallLeft = centerX - width / 2;
  const fallRight = centerX + width / 2;
  const sx = value => Math.round(value - camX);
  const sy = value => Math.round(value - camY);
  const fallFrame = Math.floor((worldTime || 0) * 8);

  if (right < camX - 20 || left > camX + VIEW_W + 20 || baseY < camY - 20 || topY > camY + VIEW_H + 20) {
    return true;
  }

  ctx.save();

  // Mossy stepped cliff shoulders. Keeping the geometry chunky lets this sit
  // naturally beside the game's pixel terrain instead of reading as a photo.
  ctx.fillStyle = "#243b35";
  ctx.fillRect(sx(left), sy(topY - 8), Math.round(right - left), Math.round(baseY - topY + 18));
  ctx.fillStyle = "#405246";
  ctx.fillRect(sx(left + 8), sy(topY), Math.round(fallLeft - left - 12), Math.round(baseY - topY));
  ctx.fillRect(sx(fallRight + 4), sy(topY), Math.round(right - fallRight - 12), Math.round(baseY - topY));
  ctx.fillStyle = "#536456";
  ctx.fillRect(sx(left + 16), sy(topY + 10), Math.round(fallLeft - left - 28), 7);
  ctx.fillRect(sx(fallRight + 12), sy(topY + 16), Math.round(right - fallRight - 32), 6);
  ctx.fillRect(sx(left + 28), sy(topY + 55), Math.round(fallLeft - left - 40), 5);
  ctx.fillRect(sx(fallRight + 24), sy(topY + 68), Math.round(right - fallRight - 38), 5);

  const rockBlocks = [
    [176, 102, 24, 13], [210, 128, 34, 17], [170, 158, 42, 19],
    [226, 178, 28, 15], [398, 106, 31, 15], [438, 134, 25, 18],
    [414, 164, 40, 16], [382, 190, 30, 13]
  ];
  for (let i = 0; i < rockBlocks.length; i += 1) {
    const [x, y, blockWidth, blockHeight] = rockBlocks[i];
    ctx.fillStyle = i % 2 === 0 ? "#66715f" : "#586657";
    ctx.fillRect(sx(x), sy(y), blockWidth, blockHeight);
    ctx.fillStyle = "rgba(151,175,126,.32)";
    ctx.fillRect(sx(x + 2), sy(y + 1), Math.max(4, blockWidth - 7), 2);
  }

  // Ferny moss bands soften the rock and visually join it to the tree canopy.
  ctx.fillStyle = "#567b45";
  for (const [x, y, bandWidth] of [[164, 92, 88], [388, 94, 82], [186, 146, 60], [402, 150, 62], [204, 194, 48], [390, 198, 46]]) {
    ctx.fillRect(sx(x), sy(y), bandWidth, 4);
    ctx.fillStyle = "#75a255";
    for (let blade = 2; blade < bandWidth; blade += 8) {
      ctx.fillRect(sx(x + blade), sy(y - 3 - ((blade / 8) % 2)), 2, 4);
    }
    ctx.fillStyle = "#567b45";
  }

  // Deep channel first, then moving sheets and bright broken highlights.
  ctx.fillStyle = "#28536a";
  ctx.fillRect(sx(fallLeft - 3), sy(topY - 2), Math.round(width + 6), Math.round(baseY - topY + 5));
  ctx.fillStyle = "#4d91aa";
  ctx.fillRect(sx(fallLeft), sy(topY), Math.round(width), Math.round(baseY - topY));
  ctx.fillStyle = "#75bfd0";
  ctx.fillRect(sx(fallLeft + 8), sy(topY), 14, Math.round(baseY - topY));
  ctx.fillRect(sx(fallLeft + 35), sy(topY), 9, Math.round(baseY - topY));
  ctx.fillRect(sx(fallRight - 22), sy(topY), 12, Math.round(baseY - topY));

  for (let y = topY + ((fallFrame * 3) % 18) - 18; y < baseY; y += 18) {
    ctx.fillStyle = "rgba(229,250,255,.82)";
    ctx.fillRect(sx(fallLeft + 4 + ((y / 18) % 3) * 7), sy(y), 18, 2);
    ctx.fillRect(sx(centerX + 3), sy(y + 7), 25, 2);
  }
  ctx.fillStyle = "rgba(241,253,255,.92)";
  ctx.fillRect(sx(fallLeft + 2), sy(topY + 3), 3, Math.round(baseY - topY - 4));
  ctx.fillRect(sx(fallRight - 7), sy(topY + 8), 3, Math.round(baseY - topY - 12));

  // A stepped burst of foam anchors the vertical fall to the pool surface.
  const foamY = baseY - 2;
  ctx.fillStyle = "rgba(235,252,255,.92)";
  ctx.fillRect(sx(centerX - 54), sy(foamY), 108, 4);
  ctx.fillRect(sx(centerX - 68), sy(foamY + 5), 136, 3);
  ctx.fillRect(sx(centerX - 42), sy(foamY + 10), 84, 2);
  ctx.fillStyle = "rgba(157,220,229,.70)";
  ctx.fillRect(sx(centerX - 82), sy(foamY + 13), 52, 2);
  ctx.fillRect(sx(centerX + 30), sy(foamY + 13), 52, 2);

  ctx.restore();
  return true;
}

function drawWaterfallGroveAtmosphere(mapId, camX, camY) {
  if (mapId !== "waterfallGrove") return false;
  const landmarks = WORLD_CONTENT?.maps?.[mapId]?.landmarks;
  if (!landmarks) return false;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const beam of landmarks.lightBeams || []) {
    const x = Math.round(Number(beam.x) - camX);
    const y = Math.round(Number(beam.y) - camY);
    const width = Math.round(Number(beam.width));
    const height = Math.round(Number(beam.height));
    const lean = Math.round(Number(beam.lean) || 0);
    ctx.fillStyle = `rgba(255,249,195,${Number(beam.alpha) || 0.08})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width + lean, y + height);
    ctx.lineTo(x + lean, y + height);
    ctx.closePath();
    ctx.fill();
  }

  const time = worldTime || 0;
  for (let i = 0; i < 18; i += 1) {
    const seedX = 148 + ((i * 71) % 344);
    const seedY = 96 + ((i * 47) % 268);
    const driftX = Math.sin(time * 0.7 + i * 1.9) * 5;
    const driftY = ((time * (4 + i % 3) + i * 13) % 36) - 18;
    const x = Math.round(seedX + driftX - camX);
    const y = Math.round(seedY - driftY - camY);
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,248,177,.42)" : "rgba(221,255,224,.28)";
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }

  const fall = landmarks.waterfall;
  if (fall) {
    const baseX = Math.round(Number(fall.x) - camX);
    const baseY = Math.round(Number(fall.baseY) - camY);
    const mistShift = Math.round(Math.sin(time * 0.8) * 5);
    ctx.fillStyle = "rgba(224,249,248,.12)";
    ctx.fillRect(baseX - 78 + mistShift, baseY + 5, 64, 12);
    ctx.fillRect(baseX - 20 - mistShift, baseY + 10, 86, 10);
    ctx.fillRect(baseX + 44 + mistShift, baseY + 1, 46, 9);
  }
  ctx.restore();
  return true;
}


function terrainEntityTouchesWater(
  worldX,
  worldY,
  mapId = currentMapId,
  radius = 3
) {
  const definition = currentTerrainDefinition(mapId);
  if (definition) {
    return TERRAIN_RULES.circleTouchesType(
      definition,
      worldX,
      worldY,
      Math.max(0, Number(radius) || 0),
      "water"
    );
  }

  // Legacy maps currently expose one pond/water collision helper. Keep the
  // same result for local/remote entities without changing legacy map data.
  if (
    mapId === currentMapId &&
    typeof hitsWater === "function"
  ) {
    return hitsWater(worldX, worldY);
  }

  return false;
}

function terrainPointIsWater(worldX, worldY, mapId = currentMapId) {
  const definition = currentTerrainDefinition(mapId);
  if (definition) {
    return TERRAIN_RULES.terrainTypeAt(definition, worldX, worldY) === "water";
  }
  return Boolean(
    mapId === currentMapId &&
    typeof hitsWater === "function" &&
    hitsWater(worldX, worldY)
  );
}

function terrainEntityIsWading(worldX, worldY, mapId = currentMapId) {
  // Keep the immediate shoreline visually shallow. Requiring a small footprint
  // to be inside water prevents a hard half-sprite cut when an entity is only
  // straddling the land/water boundary.
  return (
    terrainPointIsWater(worldX, worldY, mapId) &&
    terrainPointIsWater(worldX - 3, worldY, mapId) &&
    terrainPointIsWater(worldX + 3, worldY, mapId) &&
    terrainPointIsWater(worldX, worldY - 2, mapId)
  );
}

function drawTerrainWadingOverlay(
  worldX,
  worldY,
  camX = 0,
  camY = 0,
  {
    width = 14,
    depth = 5,
    phase = 0,
    mapId = currentMapId
  } = {}
) {
  if (!terrainEntityIsWading(worldX, worldY, mapId)) return false;

  const safeWidth = Math.max(6, Math.round(Number(width) || 14));
  const safeDepth = Math.max(3, Math.round(Number(depth) || 5));
  const screenX = Math.round(worldX - camX);
  const screenY = Math.round(worldY - camY);
  const left = screenX - Math.floor(safeWidth / 2);
  const top = screenY - safeDepth + 1;
  const ripple = Math.floor((worldTime * 5 + Number(phase || 0) * 3) % 4);

  ctx.save();
  // Clip each overlay row to the actual water beneath it so shoreline overlap
  // cannot paint a rectangular blue band across dry terrain.
  ctx.beginPath();
  let hasWaterPixels = false;
  for (let row = 0; row <= safeDepth; row++) {
    const sampleWorldY = worldY - safeDepth + 1 + row;
    let runStart = -1;
    for (let column = 0; column <= safeWidth; column++) {
      const inWater =
        column < safeWidth &&
        terrainPointIsWater(
          worldX - Math.floor(safeWidth / 2) + column + 0.5,
          sampleWorldY + 0.5,
          mapId
        );
      if (inWater && runStart < 0) runStart = column;
      if (!inWater && runStart >= 0) {
        ctx.rect(left + runStart, top + row, column - runStart, 1);
        hasWaterPixels = true;
        runStart = -1;
      }
    }
  }
  if (!hasWaterPixels) {
    ctx.restore();
    return false;
  }
  ctx.clip();
  // The opaque lower band is what makes the feet/body read as submerged rather
  // than simply standing on a blue tile. A brighter one-pixel ripple sells the
  // water surface without introducing another per-frame terrain scan.
  ctx.fillStyle = "rgba(63, 118, 144, .93)";
  ctx.fillRect(left, top + 1, safeWidth, safeDepth);

  ctx.fillStyle = "rgba(114, 170, 190, .92)";
  ctx.fillRect(left + 1, top, Math.max(3, safeWidth - 2), 1);

  ctx.fillStyle = "rgba(238, 249, 255, .60)";
  const rippleWidth = Math.max(3, Math.floor(safeWidth * 0.38));
  const rippleX = left + 1 + (ripple % Math.max(1, safeWidth - rippleWidth - 1));
  ctx.fillRect(rippleX, top, rippleWidth, 1);
  ctx.restore();

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

  if (type === "sand") {
    return {
      face: "#bea36d",
      band: "#a68e61",
      bottom: "#806946"
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
