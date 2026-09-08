// Slime Story client world/environment layer.
// Behavior-locked extraction: declarations below are moved from v6-11-227
// without gameplay, authority, packet, timing, or rendering-order changes.
// Deterministic map construction now lives in client-maps.js; runtime activation remains in game.js.

// Most maps use the original 640x400 world. Gold Slime Den is intentionally
// smaller so the perimeter itself is the encounter boundary rather than a
// decorative inner ring with a safe strip outside it.
let activeWorldDimensionMapId = WORLD_CONTENT?.worldGrid?.startMapId || "world_p0_p0";

function worldDimensionsForMap(mapId = activeWorldDimensionMapId) {
  const sharedDimensions =
    typeof WORLD_CONTENT !== "undefined"
      ? WORLD_CONTENT.maps?.[mapId]?.dimensions
      : null;

  if (
    Number.isFinite(sharedDimensions?.width) &&
    Number.isFinite(sharedDimensions?.height)
  ) {
    return sharedDimensions;
  }

  return MAP_WORLD_DIMENSIONS[mapId] || MAP_WORLD_DIMENSIONS.default;
}

const world = {
  get width() {
    return worldDimensionsForMap().width;
  },
  get height() {
    return worldDimensionsForMap().height;
  }
};

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// -----------------------------------------------------------------------------
// TREE
// -----------------------------------------------------------------------------
// Split tree parts. Both are 32x48 and share the same bottom-centre anchor.
const treeTrunkImage = new Image();
treeTrunkImage.src = "assets/interactive_tree_trunk_damaged_v376.png?v=431";

const treeCanopyImages = [];

const treeCanopyImage = new Image();
treeCanopyImage.src = "assets/interactive_tree_canopy_v376.png?v=431";
treeCanopyImages.push(treeCanopyImage);

const treeCanopyImageVariantB = new Image();
treeCanopyImageVariantB.src = "assets/interactive_tree_canopy_v376_flip.png?v=431";
treeCanopyImages.push(treeCanopyImageVariantB);

const fireResistantTreeTrunkImage = new Image();
fireResistantTreeTrunkImage.src = "assets/fire_immune_tree_trunk_v1.png?v=431";
const fireResistantTreeCanopyImage = new Image();
fireResistantTreeCanopyImage.src = "assets/fire_immune_tree_canopy_v1.png?v=431";
const fireResistantTreeCanopyFlippedImage = new Image();
fireResistantTreeCanopyFlippedImage.src = "assets/fire_immune_tree_canopy_v1_flip.png?v=431";

const rockPlainImage = loadImage("assets/rock_plain.png");
const rockGrassImage = loadImage("assets/rock_grass.png");
const rockCrackOneImage = loadImage("assets/rock_crack_1.png");
const rockCrackTwoImage = loadImage("assets/rock_crack_2.png");
const rockLootableImage = loadImage("assets/rock_lootable.png");
const grassyRockSceneryImage = loadImage("assets/scenery_grassy_rock_v2.png");

function randomTreeCanopyVariant() {
  return Math.floor(Math.random() * treeCanopyImages.length);
}

function getTreeCanopyImage(tree) {
  return treeCanopyImages[tree.canopyVariant ?? 0] || treeCanopyImages[0];
}

const treeDamagedTrunkImage = new Image();
treeDamagedTrunkImage.src = "assets/interactive_tree_trunk_v376.png?v=431";

const treeStumpImage = new Image();
treeStumpImage.src = "assets/interactive_tree_stump_v376.png?v=431";

const trees = [];

function playerIsBehindTree(tree) {
  return (
    player.y <= tree.y - 2 &&
    Math.abs(player.x - tree.x) < 17 &&
    player.y > tree.y - 34
  );
}

function drawPixelFlame(x, y, phase, scale = 1) {
  // Small code-drawn flame: deliberately chunky and irregular.
  const flick = Math.sin(worldTime * 17 + phase);
  const lean = flick > 0.25 ? 1 : flick < -0.25 ? -1 : 0;
  const s = scale;

  ctx.fillStyle = "#b83224";
  ctx.fillRect(x - s, y - 2 * s, 3 * s, 3 * s);

  ctx.fillStyle = "#ed642c";
  ctx.fillRect(x, y - 4 * s, 2 * s, 3 * s);
  ctx.fillRect(x + lean * s, y - 5 * s, s, 2 * s);

  ctx.fillStyle = "#ffb52f";
  ctx.fillRect(x, y - 3 * s, s, 2 * s);

  if (Math.sin(worldTime * 23 + phase * 2.1) > 0.45) {
    ctx.fillStyle = "#ffd969";
    ctx.fillRect(x + lean * s, y - 5 * s, s, s);
  }
}

function drawTree(tree, camX, camY) {
  if (tree.removed) return;
  const screenX = Math.round(tree.x - camX);
  const screenY = Math.round(tree.y - camY);

  const drawX = screenX - 16;
  const drawY = screenY - 47;

  if (tree.fireImmune && tree.nonInteractive) {
    const fadedCanopy = playerIsBehindTree(tree);
    const sway = Math.sin(worldTime * 1.7 + tree.phase);
    const canopyOffsetX = Math.round(sway * 1);
    const canopyOffsetY = Math.round(
      (1 - Math.cos(worldTime * 1.2 + tree.phase)) * 0.35
    );

    const shadowX = screenX + 3 + Math.round(sway * 1);
    const shadowY = screenY + 2;

    const daylightShadowFactor = typeof worldClockSunShadowFactor === "function"
      ? worldClockSunShadowFactor()
      : 1;
    if (daylightShadowFactor > 0.001) {
      ctx.save();
      ctx.globalAlpha = 0.16 * daylightShadowFactor;
      ctx.fillStyle = "#203b24";
      ctx.fillRect(shadowX - 10, shadowY - 4, 18, 2);
      ctx.fillRect(shadowX - 13, shadowY - 2, 25, 2);
      ctx.fillRect(shadowX - 15, shadowY,     28, 2);
      ctx.fillRect(shadowX - 11, shadowY + 2, 20, 2);
      ctx.restore();
    }

    // Keep the base planted, but let the upper trunk bend with the canopy so
    // the whole fire-resistant tree participates in the wind animation.
    const immuneTrunkTopOffsetX = Math.round(sway * 0.6);
    const immuneTrunkTopSliceHeight = 26;
    const immuneTrunkBottomSliceStart = 24;

    ctx.drawImage(
      fireResistantTreeTrunkImage,
      0,
      immuneTrunkBottomSliceStart,
      32,
      48 - immuneTrunkBottomSliceStart,
      drawX,
      drawY + immuneTrunkBottomSliceStart,
      32,
      48 - immuneTrunkBottomSliceStart
    );

    ctx.drawImage(
      fireResistantTreeTrunkImage,
      0,
      0,
      32,
      immuneTrunkTopSliceHeight,
      drawX + immuneTrunkTopOffsetX,
      drawY,
      32,
      immuneTrunkTopSliceHeight
    );

    const immuneCanopyImage =
      ((tree.canopyVariant ?? 0) & 1) === 1
        ? fireResistantTreeCanopyFlippedImage
        : fireResistantTreeCanopyImage;

    ctx.save();
    if (fadedCanopy) ctx.globalAlpha = 0.62;
    ctx.drawImage(
      immuneCanopyImage,
      drawX + canopyOffsetX,
      drawY + canopyOffsetY
    );
    ctx.restore();
    return;
  }

  // Chopped tree: just draw the stump.
  if (tree.isStump) {
    ctx.drawImage(
      treeStumpImage,
      drawX,
      drawY
    );
    return;
  }

  const fadedCanopy = playerIsBehindTree(tree);
  const sway = Math.sin(worldTime * 1.7 + tree.phase);

  const shakeX =
    tree.shakeTime > 0
      ? (Math.sin(tree.shakeTime * 145) > 0 ? 1 : -1)
      : 0;

  const trunkImage =
    tree.hp <= 2
      ? treeDamagedTrunkImage
      : treeTrunkImage;

  const canopyImage = getTreeCanopyImage(tree);

  const canopyOffsetX = Math.round(sway * 1) + shakeX;
  const canopyOffsetY = Math.round(
    (1 - Math.cos(worldTime * 1.2 + tree.phase)) * 0.35
  );

  const trunkTopOffsetX = Math.round(sway * 0.6) + shakeX;

  const topSliceHeight = 26;
  const bottomSliceStart = 24;

  // Soft, chunky canopy shadow on the ground.
  // It sways slightly with the leaves and fades away as fire consumes them.
  if (!tree.canopyBurned) {
    let shadowAlpha = 0.16;
    const daylightShadowFactor = typeof worldClockSunShadowFactor === "function"
      ? worldClockSunShadowFactor()
      : 1;
    shadowAlpha *= daylightShadowFactor;

    if (tree.canopyBurnTime > 0) {
      const burnProgress =
        1 - tree.canopyBurnTime / tree.canopyBurnDuration;
      shadowAlpha *= Math.max(0, 1 - burnProgress);
    }

    if (tree.falling) {
      const fallProgress =
        1 - tree.fallTime / tree.fallDuration;
      shadowAlpha *= Math.max(0, 1 - fallProgress * 0.9);
    }

    const shadowX = screenX + 3 + Math.round(sway * 1);
    const shadowY = screenY + 2;

    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = "#203b24";

    // Uneven stepped shape keeps it looking pixel-art rather than a smooth oval.
    ctx.fillRect(shadowX - 10, shadowY - 4, 18, 2);
    ctx.fillRect(shadowX - 13, shadowY - 2, 25, 2);
    ctx.fillRect(shadowX - 15, shadowY,     28, 2);
    ctx.fillRect(shadowX - 11, shadowY + 2, 20, 2);

    ctx.restore();
  }

  // On the final hit, the stump stays planted while only the upper
  // trunk + canopy topple away from the player.
  if (tree.falling) {
    const progress =
      1 - (tree.fallTime / tree.fallDuration);

    const eased = progress * progress * (3 - 2 * progress);
    const angle = tree.fallDirection * eased * 0.78;
    const dropY = Math.round(eased * 2);
    const fade = 1 - Math.max(0, progress - 0.78) / 0.22;

    // The stump appears immediately and never moves.
    ctx.drawImage(
      treeStumpImage,
      drawX,
      drawY
    );

    // Draw only the portion of the damaged trunk ABOVE the stump.
    const cutSourceY = 26;

    // Pivot from the bottom/base area of the tree rather than the cut line.
    // This makes the falling section feel grounded instead of hinged high up.
    const pivotX = screenX;
    const pivotY = screenY - 1;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    ctx.translate(-pivotX, -pivotY + dropY);
    ctx.globalAlpha = Math.max(0, fade);

    ctx.drawImage(
      treeDamagedTrunkImage,
      0, 0, 32, cutSourceY,
      drawX, drawY, 32, cutSourceY
    );

    // Canopy follows the falling upper trunk unless fire already consumed it.
    if (!tree.canopyBurned) {
      ctx.drawImage(
        canopyImage,
        drawX + canopyOffsetX,
        drawY + canopyOffsetY
      );
    }

    ctx.restore();
    return;
  }

  ctx.drawImage(
    trunkImage,
    0, bottomSliceStart, 32, 48 - bottomSliceStart,
    drawX, drawY + bottomSliceStart, 32, 48 - bottomSliceStart
  );

  ctx.drawImage(
    trunkImage,
    0, 0, 32, topSliceHeight,
    drawX + trunkTopOffsetX, drawY, 32, topSliceHeight
  );

  if (!tree.canopyBurned) {
    ctx.save();

    let canopyAlpha = fadedCanopy ? 0.58 : 1;

    if (tree.canopyBurnTime > 0) {
      const burnProgress =
        1 - tree.canopyBurnTime / tree.canopyBurnDuration;

      // The existing canopy art gradually scorches/fades rather than needing
      // separate burning frames.
      canopyAlpha *= 1 - burnProgress * 0.52;
    }

    ctx.globalAlpha = canopyAlpha;

    if (tree.regrowAnimTime > 0) {
      const progress =
        Math.max(
          0,
          Math.min(
            1,
            1 -
              tree.regrowAnimTime /
              (tree.regrowAnimDuration || 0.34)
          )
        );

      const popScale =
        progress < 0.72
          ? 0.88 +
            (progress / 0.72) * 0.18
          : 1.06 -
            (
              (progress - 0.72) /
              0.28
            ) * 0.06;

      const bounceY =
        -Math.round(
          Math.sin(progress * Math.PI) *
          2
        );

      const canopyX =
        drawX +
        canopyOffsetX;

      const canopyY =
        drawY +
        canopyOffsetY +
        bounceY;

      ctx.translate(
        canopyX + 16,
        canopyY + 24
      );

      ctx.scale(
        popScale,
        popScale
      );

      ctx.drawImage(
        canopyImage,
        -16,
        -24,
        32,
        48
      );
    } else {
      ctx.drawImage(
        canopyImage,
        drawX + canopyOffsetX,
        drawY + canopyOffsetY
      );
    }

    ctx.restore();
  }

  if (tree.canopyBurnTime > 0 && !tree.canopyBurned) {
    // A handful of independent flames makes the canopy feel alive without
    // requiring a dedicated burning-tree sprite sheet.
    const flameY = drawY + canopyOffsetY + 24;
    drawPixelFlame(drawX + canopyOffsetX + 7,  flameY - 5, tree.phase + 0.2);
    drawPixelFlame(drawX + canopyOffsetX + 15, flameY - 10, tree.phase + 1.7);
    drawPixelFlame(drawX + canopyOffsetX + 23, flameY - 4, tree.phase + 3.1);

    if (tree.canopyBurnTime < tree.canopyBurnDuration * 0.62) {
      drawPixelFlame(drawX + canopyOffsetX + 11, flameY + 1, tree.phase + 4.8);
      drawPixelFlame(drawX + canopyOffsetX + 27, flameY - 11, tree.phase + 6.0);
    }
  }
}

// -----------------------------------------------------------------------------
// TALL GRASS
// -----------------------------------------------------------------------------
// Visual-only grass clumps. They do not block movement.
// Each clump has a slightly different phase so the field doesn't sway in sync.
const tallGrass = [];
// Server-authoritative Rain Cloud fields are reconstructed locally from compact field packets.
// This registry is current runtime state, not the retired per-cell rain compatibility system.
const temporaryRainGrassFields = new Map();
// These constants belong to the current compact/server-authoritative Rain Field
// simulation. They are shared by field reconstruction, burn propagation and
// local cast prediction; they are not part of the retired per-cell packet layer.
const TEMP_RAIN_GRASS_BURN_DURATION = RAIN_FIELD.BURN_DURATION;
const TEMP_RAIN_GRASS_CHAIN_SOURCE_CHANCE = RAIN_FIELD.FIRE_CHAIN_CHANCE;
const TEMP_RAIN_GRASS_CHAIN_TARGET_CHANCE = 1;
const TEMP_RAIN_GRASS_CHAIN_RADIUS = RAIN_FIELD.FIRE_CHAIN_RADIUS;
const TEMP_RAIN_GRASS_CHAIN_MAX_IGNITIONS = RAIN_FIELD.FIRE_CHAIN_MAX_IGNITIONS;
let rainGrassPatchSequence = 0;

function isTemporaryRainGrass(clump) {
  return Boolean(clump?.temporaryRainGrass);
}

function localRainGrassOwnerId() {
  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected &&
    onlineClient.localPlayerId
  ) {
    return String(onlineClient.localPlayerId);
  }

  return "local";
}

function temporaryRainGrassOwnerId(clump) {
  return String(clump?.grassOwnerId || "local");
}

function temporaryRainGrassFieldKey(ownerId, patchId) {
  return `${String(ownerId || "local")}:${Math.max(0, Number(patchId) || 0)}`;
}

function temporaryRainGrassCellIsGrown(clump, nowMs = Date.now()) {
  if (!isTemporaryRainGrass(clump)) return true;
  if (!Number.isFinite(Number(clump.growAtMs))) return true;
  return nowMs >= Number(clump.growAtMs);
}

function temporaryRainGrassCellIsAlive(clump, nowMs = Date.now()) {
  if (!isTemporaryRainGrass(clump)) return !clump?.cut && !clump?.burnt;
  if (!temporaryRainGrassCellIsGrown(clump, nowMs)) return false;
  if (clump.cut || clump.burnt) return false;
  if (
    Number.isFinite(Number(clump.tempExpiresAtMs)) &&
    nowMs >= Number(clump.tempExpiresAtMs)
  ) {
    return false;
  }
  return true;
}

function clearTemporaryRainGrass() {
  temporaryRainGrassFields.clear();

  for (let i = tallGrass.length - 1; i >= 0; i--) {
    if (isTemporaryRainGrass(tallGrass[i])) {
      tallGrass.splice(i, 1);
    }
  }
}

function clearTemporaryRainGrassForOwner(ownerId) {
  if (!ownerId) return;
  const normalizedOwnerId = String(ownerId);

  for (const [key, field] of temporaryRainGrassFields) {
    if (String(field.ownerId) === normalizedOwnerId) {
      temporaryRainGrassFields.delete(key);
    }
  }

  for (let i = tallGrass.length - 1; i >= 0; i--) {
    const clump = tallGrass[i];
    if (
      isTemporaryRainGrass(clump) &&
      temporaryRainGrassOwnerId(clump) === normalizedOwnerId
    ) {
      tallGrass.splice(i, 1);
    }
  }
}

function removeTemporaryRainGrassFieldsForOwner(ownerId) {
  const normalizedOwnerId = String(ownerId || "local");

  for (const [key, field] of temporaryRainGrassFields) {
    if (String(field?.ownerId || "local") === normalizedOwnerId) {
      temporaryRainGrassFields.delete(key);
    }
  }

  for (let i = tallGrass.length - 1; i >= 0; i--) {
    const clump = tallGrass[i];
    if (!isTemporaryRainGrass(clump)) continue;
    if (temporaryRainGrassOwnerId(clump) !== normalizedOwnerId) continue;
    tallGrass.splice(i, 1);
  }
}

// One Rain Cloud cast defines a deterministic field locally from its compact
// field description. Individual grass cells are never replicated as packets.
function spawnTemporaryRainGrassField(
  centerX,
  centerY,
  patchId = 0,
  options = {}
) {
  const ownerId = String(options.ownerId || localRainGrassOwnerId());
  const normalizedPatchId = Math.max(0, Number(patchId) || 0);
  if (!normalizedPatchId) return null;

  const nowMs = Date.now();
  const ageSeconds = Math.max(0, Number(options.ageSeconds) || 0);
  const startedAtMs = Number.isFinite(Number(options.startedAtMs))
    ? Number(options.startedAtMs)
    : nowMs - ageSeconds * 1000;
  const burningMask = Number(options.burningMask) >>> 0;
  const burntMask = Number(options.burntMask) >>> 0;
  const burnEnds = Array.isArray(options.burnEnds) ? options.burnEnds : [];
  const burnEndByCell = new Map();

  for (const item of burnEnds) {
    const index = Math.max(0, Number(Array.isArray(item) ? item[0] : item?.index) || 0);
    const remaining = Math.max(0, Number(Array.isArray(item) ? item[1] : item?.remaining) || 0);
    if (index < RAIN_FIELD.CELL_COUNT && remaining > 0) {
      burnEndByCell.set(index, nowMs + remaining * 1000);
    }
  }

  removeTemporaryRainGrassFieldsForOwner(ownerId);

  const cells = RAIN_FIELD.generateCells({
    ownerId,
    patchId: normalizedPatchId,
    centerX: clampToWorld(centerX, 8, world.width - 8),
    centerY: clampToWorld(centerY, 12, world.height - 4),
    worldWidth: world.width,
    worldHeight: world.height
  });

  const field = {
    ownerId,
    patchId: normalizedPatchId,
    centerX: clampToWorld(centerX, 8, world.width - 8),
    centerY: clampToWorld(centerY, 12, world.height - 4),
    startedAtMs,
    expiresAtMs: RAIN_FIELD.fieldExpiresAtMs(startedAtMs),
    burningMask,
    burntMask,
    mapId: currentMapId,
    cells
  };

  temporaryRainGrassFields.set(
    temporaryRainGrassFieldKey(ownerId, normalizedPatchId),
    field
  );

  for (const cell of cells) {
    if (
      typeof terrainAllowsMagicGrass === "function" &&
      !terrainAllowsMagicGrass(cell.x, cell.y, currentMapId)
    ) {
      continue;
    }

    const bit = RAIN_FIELD.cellBit(cell.index);
    const naturallyExpiredAtMs = startedAtMs + cell.expiresDelay * 1000;
    if (nowMs >= naturallyExpiredAtMs) continue;

    const burnt = Boolean(burntMask & bit);
    const burning = Boolean(burningMask & bit) && !burnt;
    const burnExpiresAtMs = burnEndByCell.get(cell.index) ||
      (burning ? nowMs + TEMP_RAIN_GRASS_BURN_DURATION * 1000 : 0);

    const clump = {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      phase: cell.phase,
      cut: burnt,
      flowerType: null,
      flowerPicked: true,
      patchFlower: false,
      burnt,
      burnTime: burning
        ? Math.max(0, (burnExpiresAtMs - nowMs) / 1000)
        : 0,
      burnDuration: TEMP_RAIN_GRASS_BURN_DURATION,
      burnExpiresAtMs,
      serverBurnWillConsume: burning,
      regrowAnimTime: 0,
      regrowAnimDuration: 0.22,
      regrowAt: 0,
      temporaryRainGrass: true,
      tempLife: Math.max(0, (naturallyExpiredAtMs - nowMs) / 1000),
      tempBornAtMs: startedAtMs,
      tempExpiresAtMs: naturallyExpiredAtMs,
      growAtMs: startedAtMs + cell.growDelay * 1000,
      mapId: currentMapId,
      grassPatchId: normalizedPatchId,
      grassBornAt: worldTime,
      grassOwnerId: ownerId,
      grassSyncId: `${normalizedPatchId}:${cell.index}`,
      fieldCellIndex: cell.index,
      serverControlled: Boolean(options.serverControlled),
      fieldControlled: true
    };

    tallGrass.push(clump);
  }

  return field;
}

function applyRainFieldDelta(message) {
  const ownerId = String(message?.ownerId || "");
  const patchId = Math.max(0, Number(message?.patchId) || 0);
  if (!ownerId || !patchId) return;

  const field = temporaryRainGrassFields.get(
    temporaryRainGrassFieldKey(ownerId, patchId)
  );
  if (!field || field.mapId !== currentMapId) return;

  const burningAddedMask = Number(message.burningAddedMask) >>> 0;
  const extinguishedMask = Number(message.extinguishedMask) >>> 0;
  const burnEnds = Array.isArray(message.burnEnds) ? message.burnEnds : [];
  const nowMs = Date.now();
  const burnEndByCell = new Map();

  for (const item of burnEnds) {
    const index = Math.max(0, Number(Array.isArray(item) ? item[0] : item?.index) || 0);
    const remaining = Math.max(0, Number(Array.isArray(item) ? item[1] : item?.remaining) || 0);
    if (index < RAIN_FIELD.CELL_COUNT && remaining > 0) {
      burnEndByCell.set(index, nowMs + remaining * 1000);
    }
  }

  field.burningMask = ((Number(field.burningMask) >>> 0) | burningAddedMask) >>> 0;
  field.burningMask = (field.burningMask & ~extinguishedMask) >>> 0;
  // A server extinguish means the cell survived; a new server ignition means
  // any locally predicted burnt bit was stale. Server truth wins both cases.
  field.burntMask = ((Number(field.burntMask) >>> 0) & ~extinguishedMask & ~burningAddedMask) >>> 0;

  for (const clump of tallGrass) {
    if (!isTemporaryRainGrass(clump) || !clump.fieldControlled) continue;
    if (temporaryRainGrassOwnerId(clump) !== ownerId) continue;
    if ((Number(clump.grassPatchId) || 0) !== patchId) continue;

    const index = Math.max(0, Number(clump.fieldCellIndex) || 0);
    const bit = RAIN_FIELD.cellBit(index);

    if (extinguishedMask & bit) {
      clump.burnTime = 0;
      clump.burnExpiresAtMs = 0;
      clump.serverBurnWillConsume = false;
      clump.cut = false;
      clump.burnt = false;
    }

    if (burningAddedMask & bit) {
      const burnExpiresAtMs = burnEndByCell.get(index) ||
        nowMs + TEMP_RAIN_GRASS_BURN_DURATION * 1000;
      clump.cut = false;
      clump.burnt = false;
      clump.burnExpiresAtMs = burnExpiresAtMs;
      clump.burnTime = Math.max(0, (burnExpiresAtMs - nowMs) / 1000);
      clump.serverBurnWillConsume = true;
    }
  }
}

function drawTallGrass(clump, camX, camY) {
  const nowMs = Date.now();
  if (isTemporaryRainGrass(clump) && !temporaryRainGrassCellIsGrown(clump, nowMs)) {
    return;
  }

  const screenX = Math.round(clump.x - camX);
  const screenY = Math.round(clump.y - camY);
  const magicGrass = isTemporaryRainGrass(clump);

  if (magicGrass && Number.isFinite(Number(clump.growAtMs))) {
    const elapsed = Math.max(0, (nowMs - Number(clump.growAtMs)) / 1000);
    clump.regrowAnimTime = Math.max(0, (clump.regrowAnimDuration || 0.22) - elapsed);
  }

  // Normal tall grass is permanently cleared once cut or burned. Temporary
  // Rain Cloud grass keeps its own short-lived field lifecycle.
  if (clump.cut && !magicGrass) return;

  if (clump.cut) {
    ctx.fillStyle = clump.burnt
      ? "rgba(45, 35, 28, .30)"
      : "rgba(40, 73, 38, .20)";

    ctx.fillRect(
      screenX - Math.floor(clump.width / 2),
      screenY,
      clump.width,
      1
    );

    ctx.fillStyle = clump.burnt ? "#4b3a2b" : "#477b40";
    ctx.fillRect(screenX - 5, screenY - 2, 1, 2);
    ctx.fillRect(screenX - 2, screenY - 3, 1, 3);
    ctx.fillRect(screenX + 1, screenY - 2, 1, 2);
    ctx.fillRect(screenX + 4, screenY - 3, 1, 3);
    return;
  }

  ctx.save();

  if (clump.regrowAnimTime > 0) {
    const progress =
      Math.max(
        0,
        Math.min(
          1,
          1 -
            clump.regrowAnimTime /
            (clump.regrowAnimDuration || 0.22)
        )
      );

    const eased =
      1 -
      Math.pow(
        1 - progress,
        3
      );

    const scaleY =
      0.30 + eased * 0.70;

    const riseY =
      Math.round(
        (1 - eased) * 3
      );

    // Pivot at the grass base so the blades visibly grow upward from the soil.
    ctx.translate(
      0,
      screenY + riseY
    );

    ctx.scale(
      1,
      scaleY
    );

    ctx.translate(
      0,
      -screenY
    );
  }

  // Shared breeze direction with a little per-clump variation.
  const sway = Math.sin(worldTime * 1.9 + clump.phase);
  const topShift = Math.round(sway * 1);

  // Tiny secondary motion helps keep the grass from looking mechanical.
  const flutter = Math.sin(worldTime * 3.1 + clump.phase * 1.7);

  ctx.fillStyle = magicGrass
    ? "rgba(47, 78, 50, .27)"
    : "rgba(40, 73, 38, .28)";
  ctx.fillRect(
    screenX - Math.floor(clump.width / 2),
    screenY,
    clump.width,
    2
  );

  const bladeOffsets = [];
  const bladeHalfSpan = magicGrass
    ? Math.max(6, Math.floor((Number(clump.width) || 18) / 2) - 1)
    : 6;

  for (let offset = -bladeHalfSpan; offset <= bladeHalfSpan; offset += 2) {
    bladeOffsets.push(offset);
  }

  for (let i = 0; i < bladeOffsets.length; i++) {
    const bx = screenX + bladeOffsets[i];

    const baseHeight =
      i % 4 === 0 ? 9 :
      i % 4 === 1 ? 11 :
      i % 4 === 2 ? 8 : 10;

    const height = baseHeight + (magicGrass ? 1 : 0);

    const bladeTop = screenY - height;

    // Lower stalk stays planted.
    ctx.fillStyle = magicGrass
      ? (i % 2 === 0 ? "#477c49" : "#508850")
      : (i % 2 === 0 ? "#3d743d" : "#467f43");
    ctx.fillRect(bx, bladeTop + 4, 1, height - 4);

    // Upper portion bends in the breeze.
    const localShift =
      topShift +
      (i % 2 === 0 ? 0 : Math.round(flutter * 0.5));

    ctx.fillStyle = magicGrass
      ? (i % 2 === 0 ? "#70a86c" : "#7bb678")
      : (i % 2 === 0 ? "#5b9850" : "#67a858");

    ctx.fillRect(bx + localShift, bladeTop, 1, 3);
    ctx.fillRect(
      bx + Math.round(localShift * 0.65),
      bladeTop + 3,
      1,
      2
    );

    if (i % 3 === 1) {
      ctx.fillRect(
        bx + Math.sign(localShift || 1),
        bladeTop + 2,
        1,
        1
      );
    }
  }

  // Shorter blades fill in the foreground edge.
  ctx.fillStyle = magicGrass ? "#61975f" : "#4f8947";
  ctx.fillRect(screenX - 5, screenY - 4, 1, 4);
  ctx.fillRect(screenX - 1, screenY - 5, 1, 5);
  ctx.fillRect(screenX + 3, screenY - 4, 1, 4);
  ctx.fillRect(screenX + 5, screenY - 3, 1, 3);

  if (magicGrass && clump.burnTime <= 0) {
    // A rare pale glint helps the rain-grown field read as magical without
    // turning it into a glowing neon patch.
    const shimmer = Math.sin(worldTime * 1.55 + clump.phase * 1.9);
    if (shimmer > 0.97) {
      const shimmerX = screenX + ((Math.floor(clump.phase * 7) % 9) - 4);
      const shimmerY = screenY - 10 - (Math.floor(clump.phase * 3) % 3);
      ctx.fillStyle = "#d4e8bd";
      ctx.fillRect(shimmerX, shimmerY, 1, 1);
      if (shimmer > 0.992) {
        ctx.fillStyle = "#9fc59a";
        ctx.fillRect(shimmerX - 1, shimmerY, 1, 1);
        ctx.fillRect(shimmerX + 1, shimmerY, 1, 1);
      }
    }
  }

  if (clump.burnTime > 0) {
    drawPixelFlame(screenX - 3, screenY - 4, clump.phase + 0.4);
    drawPixelFlame(screenX + 3, screenY - 2, clump.phase + 2.1);

    if (clump.burnTime < 0.75) {
      drawPixelFlame(screenX, screenY - 6, clump.phase + 4.0);
    }
  }

  ctx.restore();
}

function tryCutGrass() {
  const originX = player.x;
  const originY = player.y - 8;

  for (const clump of tallGrass) {
    if (clump.cut) continue;
    if (isTemporaryRainGrass(clump) && !temporaryRainGrassCellIsAlive(clump)) continue;

    const dx = clump.x - originX;
    const dy = (clump.y - 5) - originY;

    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const horizontalSwing =
      player.attackDirection === "left" ||
      player.attackDirection === "right";

    // Grass cutting is deliberately a little forgiving.
    const cutHalfArc = horizontalSwing ? 0.90 : 0.75;
    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle))
      <= cutHalfArc;

    const insideRange = distance <= currentMeleeReach() + 8;

    if (insideAngle && insideRange) {
      if (
        typeof onlineClient !== "undefined" &&
        onlineClient.sendEnvironmentAction(
          "cutGrass",
          clump
        )
      ) {
        continue;
      }

      // Offline fallback. Normal tall grass is a one-time clearing resource.
      clump.cut = true;
      clump.regrowAt = 0;
    }
  }
}

// -----------------------------------------------------------------------------
// HARVESTABLE WILDFLOWERS
// -----------------------------------------------------------------------------
// Larger, clearer flowers that grow around the grass patches. These must be
// cut with the sword and then looted as a dropped pickup.
const harvestFlowers = [];

function makeSceneryRock(x, y) {
  return {
    x,
    y,
    collision: {
      width: 10,
      height: 6
    }
  };
}

function drawSceneryRock(rock, camX, camY) {
  if (!rock || !grassyRockSceneryImage) return;

  const screenX = Math.round(rock.x - camX);
  const screenY = Math.round(rock.y - camY);

  // The updated scenery rock is 16x18 and remains bottom-centre anchored.
  // Its extra two pixels extend upward rather than shifting the ground contact.
  ctx.drawImage(
    grassyRockSceneryImage,
    screenX - 8,
    screenY - 18
  );
}

function makeMapRock(x, y, variant = "plain") {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    variant,
    hp: 3,
    maxHp: 3,
    depleted: false,
    regrowAt: 0
  };
}

function rockImageForState(rock) {
  if (!rock || rock.depleted) return null;

  const hp = Math.max(0, Math.floor(Number(rock.hp) || 0));
  const maxHp = Math.max(1, Math.floor(Number(rock.maxHp) || 3));
  const damage = Math.max(0, maxHp - hp);

  if (damage >= 2) return rockCrackTwoImage;
  if (damage >= 1) return rockCrackOneImage;
  return rock.variant === "grass" ? rockGrassImage : rockPlainImage;
}

function drawRock(rock, camX, camY) {
  if (!rock || rock.depleted) return;

  const screenX = Math.round(rock.x - camX);
  const screenY = Math.round(rock.y - camY);
  const image = rockImageForState(rock);

  ctx.fillStyle = "rgba(22, 28, 24, 0.22)";
  ctx.fillRect(screenX - 5, screenY - 1, 10, 2);

  if (image) {
    ctx.drawImage(image, screenX - 8, screenY - 12);
  }
}

// Keep vegetation from living right underneath tree trunks/canopies.
// That prevents the bright grass from creating a fake "highlight/glow" on trees.
function isTooCloseToTreeVegetation(x, y) {
  for (const tree of trees) {
    // Clear space around the trunk / root area.
    const trunkDx = x - tree.x;
    const trunkDy = y - (tree.y - 3);
    if (trunkDx * trunkDx + trunkDy * trunkDy <= 17 * 17) {
      return true;
    }

    // Also clear a softer area just under the canopy so vegetation doesn't
    // visually peek through and brighten the tree.
    const canopyDx = x - tree.x;
    const canopyDy = y - (tree.y - 14);
    if (canopyDx * canopyDx + canopyDy * canopyDy <= 13 * 13) {
      return true;
    }
  }

  return false;
}

for (let i = tallGrass.length - 1; i >= 0; i--) {
  const clump = tallGrass[i];
  if (isTooCloseToTreeVegetation(clump.x, clump.y)) {
    tallGrass.splice(i, 1);
  }
}

for (let i = harvestFlowers.length - 1; i >= 0; i--) {
  const flower = harvestFlowers[i];
  if (isTooCloseToTreeVegetation(flower.x, flower.y)) {
    harvestFlowers.splice(i, 1);
  }
}

const flowerDrops = [];

// Borderless versions are the living flowers in the world.
const whiteWorldFlowerImage = new Image();
whiteWorldFlowerImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAkElEQVQ4T92QsQ7DIAxEz2NnyNY1ElP//zsyIWXtFpgzOjIqFgk0QslS9U32YR8nE25CWl3kRw1CCKwZP1hrm2krUZaNMYgxqpb7lkklMDPL8LI84dwI72cMwzuZEFE1vxNkWRu8tAImrY4mlWNOID96/4Bza4rflUC4fQOhNDlbFpqiUN6jFT3z9aGXPzDYAAO+RRH+FJuvAAAAEGRlQkdCRjk5RjY0RkQ2ODZGNjVC6kOW5gAAAABJRU5ErkJgggAA";

const blueWorldFlowerImage = new Image();
blueWorldFlowerImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAiUlEQVQ4T2NkoBAwwllkAtoZINud8l9WU5Xh8fXbDI9L5+BUh1Ui+Nyi//LiUgwnzp9lsDA0Znj48hnDWqM4rGqxChY93fMfRPP0ajJ8Kb4OFuuTdsGqFkMQpvlTMTuDlJQSw7Nn9xj4en+C5bAZgiEAAsiG4NMMAlgFKQ4DEKAoFkgBowZQIQwAZgQ6EXUb8pQAAAAQZGVCR0EyRjk1QTA0M0M4MzgzMjAMZ77TAAAAAElFTkSuQmCC";

// Black-bordered versions are reserved for collectible drops.
const whiteFlowerLootImage = new Image();
whiteFlowerLootImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnklEQVQ4T8WQsQ7DIAxEzdgZsnWNxJT//45OSF27BeaMjmyBo4KJqqIob7F9nC8EA4MY6f7ksgCU7kD1aiLGGGUoOOeoNP5a4GVrLaSURCyzFtIEICKb1/UJ3s8Qwhum6cMhxrC9G8DLB4t0AC/p6pDuDeiLITzA+03meploAkbfgPgKOVsmGiHDv0JXLrXnVcUMvSidl6rSPfiV+wN2ieZLEeHng6kAAAAQZGVCR0M3REYyMzI3OUJGMkY5NkZLhrdrAAAAAElFTkSuQmCC";

const blueFlowerLootImage = new Image();
blueFlowerLootImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnElEQVQ4T2NkoBAwwllkAnwG/Iez8KjDJfFftjuFQVZTleHx9dsMj0vngMSwqsUm+D/43CIGeXEphhPnzzJYGBozPHz5jGGtURxIDkM9hgDIgKKne8AMnl5Nhi/F18HsPmkXEIWhHl0ArvlTMTuDlJQSw7Nn9xj4en+CxbAZgm4ACKAYgk8zCGAIUCMMQICiWIABitIB0WDUAAYGAF3/PBEGfs+8AAAAEGRlQkdFQ0U0NDI2NkREMUFEREUxIzBs3wAAAABJRU5ErkJgggAA";

function worldFlowerImage(type) {
  return type === "blue" ? blueWorldFlowerImage : whiteWorldFlowerImage;
}

function flowerLootImage(type) {
  return type === "blue" ? blueFlowerLootImage : whiteFlowerLootImage;
}

function spawnFlowerDrop(x, y, type = "white") {
  flowerDrops.push({
    x,
    y,
    type,
    life: 18.0
  });
}

function updateFlowerDrops(dt) {
  for (
    let i = flowerDrops.length - 1;
    i >= 0;
    i--
  ) {
    if (flowerDrops[i].shared) {
      continue;
    }

    flowerDrops[i].life -= dt;

    if (flowerDrops[i].life <= 0) {
      flowerDrops.splice(i, 1);
    }
  }
}

function collectFlowerDrops() {
  for (
    let i = flowerDrops.length - 1;
    i >= 0;
    i--
  ) {
    const flower = flowerDrops[i];

    if (flower.shared) {
      flower.pickupRequestCooldown =
        Math.max(
          0,
          (flower.pickupRequestCooldown || 0) -
          1 / 60
        );
    }

    const dx = player.x - flower.x;
    const dy = (player.y - 4) - flower.y;

    if (dx * dx + dy * dy <= LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS) {
      if (flower.shared) {
        if (
          flower.pickupRequestCooldown <= 0 &&
          typeof onlineClient !== "undefined"
        ) {
          flower.pickupRequestCooldown = 0.25;

          onlineClient.requestResourcePickup(
            flower.entityId
          );
        }

        continue;
      }

      if (flower.type === "blue") player.blueFlowers += 1;
      else player.whiteFlowers += 1;
      spawnLootPickupAnimation(
        "flower",
        flower.x,
        flower.y,
        { flowerType: flower.type }
      );
      flowerDrops.splice(i, 1);
    }
  }
}

function drawHarvestFlower(flower, camX, camY) {
  const screenX = Math.round(flower.x - camX);
  const screenY = Math.round(flower.y - camY);

  if (flower.cut) {
    ctx.fillStyle = "rgba(40, 73, 38, .20)";
    ctx.fillRect(screenX - 3, screenY, 6, 1);

    ctx.fillStyle = flower.burnt ? "#4b4d46" : "#568447";
    ctx.fillRect(screenX, screenY - 3, 1, 3);
    return;
  }

  const sway = Math.sin(worldTime * 1.9 + flower.phase);
  const topShift = Math.round(sway * 1);
  const flutter = Math.sin(worldTime * 3.0 + flower.phase * 1.4);
  const bloomLift = Math.round(flutter * 0.25);

  ctx.fillStyle = "rgba(40, 73, 38, .18)";
  ctx.fillRect(screenX - 3, screenY, 6, 1);

  // Simple stem, kept mostly planted while the flower head gently sways.
  ctx.fillStyle = "#558d49";
  ctx.fillRect(screenX, screenY - 8, 1, 8);

  ctx.fillStyle = "#6da259";
  ctx.fillRect(screenX - 2, screenY - 4, 2, 1);
  ctx.fillRect(screenX + 1, screenY - 6, 2, 1);

  ctx.drawImage(
    worldFlowerImage(flower.type),
    screenX - 8 + topShift,
    screenY - 16 + bloomLift
  );

  if (flower.burnTime > 0) {
    drawPixelFlame(screenX - 1, screenY - 8, flower.phase + 0.7, 0.9);
    drawPixelFlame(screenX + 2, screenY - 12, flower.phase + 2.2, 0.85);

    if (flower.burnTime < flower.burnDuration * 0.65) {
      drawPixelFlame(screenX - 3, screenY - 5, flower.phase + 4.0, 0.75);
    }
  }
}

function drawFlowerDrop(drop, camX, camY, index) {
  const bob = Math.round(Math.sin(worldTime * 4.3 + index * 1.2) * 1);
  const screenX = Math.round(drop.x - camX);
  const screenY = Math.round(drop.y - camY);

  ctx.fillStyle = "rgba(35, 52, 37, .26)";
  ctx.fillRect(screenX - 4, screenY + 1, 8, 2);

  ctx.drawImage(
    flowerLootImage(drop.type),
    screenX - 9,
    screenY - 13 + bob
  );
}

function tryCutHarvestFlowers() {
  const originX = player.x;
  const originY = player.y - 8;

  for (const flower of harvestFlowers) {
    if (flower.cut) continue;

    const dx = flower.x - originX;
    const dy = (flower.y - 7) - originY;

    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const horizontalSwing =
      player.attackDirection === "left" ||
      player.attackDirection === "right";

    const cutHalfArc = horizontalSwing ? 0.90 : 0.75;
    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle))
      <= cutHalfArc;

    const insideRange = distance <= currentMeleeReach() + 8;

    if (insideAngle && insideRange) {
      if (
        typeof onlineClient !== "undefined" &&
        onlineClient.sendEnvironmentAction(
          "cutFlower",
          flower
        )
      ) {
        continue;
      }

      // Offline fallback.
      flower.cut = true;

      if (!flower.looted) {
        flower.looted = true;

        spawnFlowerDrop(
          flower.x + 5,
          flower.y - 1,
          flower.type
        );
      }
    }
  }
}

// -----------------------------------------------------------------------------
// WATER
// -----------------------------------------------------------------------------
// A small pond centered in the Slime Meadow. The irregular stepped outline
// keeps it feeling more like pixel terrain than a perfect blue rectangle.
function drawPlayerReflection(camX, camY) {
  if (typeof terrainWaterReflectionInfo !== "function") return;
  const reflection = terrainWaterReflectionInfo(player.x, player.y, currentMapId, 16);
  if (!reflection) return;

  const mirrorScreenY = Math.round(reflection.mirrorWorldY - camY);
  ctx.save();
  if (
    typeof terrainWaterClipPath !== "function" ||
    !terrainWaterClipPath(currentMapId, camX, camY)
  ) {
    ctx.restore();
    return;
  }
  ctx.clip();
  ctx.translate(0, mirrorScreenY * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.18 * reflection.fade;
  drawPlayer(camX, camY, true);
  ctx.restore();
}
