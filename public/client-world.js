// Slime Story client world/environment layer.
// Behavior-locked extraction: declarations below are moved from v6-11-227
// without gameplay, authority, packet, timing, or rendering-order changes.
// Deterministic map construction now lives in client-maps.js; runtime activation remains in game.js.

// Most maps use the original 640x400 world. Gold Slime Den is intentionally
// smaller so the perimeter itself is the encounter boundary rather than a
// decorative inner ring with a safe strip outside it.
let activeWorldDimensionMapId = "meadow";

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
treeTrunkImage.src = "assets/interactive_tree_trunk_damaged_v376.png?v=380";

const treeCanopyImages = [];

const treeCanopyImage = new Image();
treeCanopyImage.src = "assets/interactive_tree_canopy_v376.png?v=380";
treeCanopyImages.push(treeCanopyImage);

const treeCanopyImageVariantB = new Image();
treeCanopyImageVariantB.src = "assets/interactive_tree_canopy_v376_flip.png?v=380";
treeCanopyImages.push(treeCanopyImageVariantB);

const fireResistantTreeTrunkImage = new Image();
fireResistantTreeTrunkImage.src = "assets/fire_immune_tree_trunk_v1.png?v=380";
const fireResistantTreeCanopyImage = new Image();
fireResistantTreeCanopyImage.src = "assets/fire_immune_tree_canopy_v1.png?v=380";
const fireResistantTreeCanopyFlippedImage = new Image();
fireResistantTreeCanopyFlippedImage.src = "assets/fire_immune_tree_canopy_v1_flip.png?v=380";

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
treeDamagedTrunkImage.src = "assets/interactive_tree_trunk_v376.png?v=380";

const treeStumpImage = new Image();
treeStumpImage.src = "assets/interactive_tree_stump_v376.png?v=380";

const trees = [
  // Loose trees around the central clearing.
  { x: 390, y: 200, phase: 0.0 },
  { x: 250, y: 145, phase: 0.8 },
  { x: 305, y: 115, phase: 1.7 },
  { x: 430, y: 125, phase: 2.3 },
  { x: 500, y: 170, phase: 3.0 },
  { x: 205, y: 235, phase: 3.8 },
  { x: 485, y: 270, phase: 4.6 },
  { x: 270, y: 310, phase: 5.2 },
  { x: 390, y: 330, phase: 5.9 },
  { x: 545, y: 335, phase: 6.5 },

  // North-west forest patch.
  { x: 72,  y: 82,  phase: 0.4 },
  { x: 101, y: 96,  phase: 1.1 },
  { x: 132, y: 78,  phase: 1.9 },
  { x: 158, y: 108, phase: 2.7 },
  { x: 91,  y: 132, phase: 3.5 },
  { x: 126, y: 148, phase: 4.3 },

  // Eastern forest patch.
  { x: 555, y: 220, phase: 0.6 },
  { x: 588, y: 238, phase: 1.4 },
  { x: 526, y: 252, phase: 2.2 },
  { x: 565, y: 278, phase: 3.1 },
  { x: 605, y: 296, phase: 4.0 },
  { x: 525, y: 306, phase: 5.0 }
];

// Dense forest border around the whole map. Two staggered rows on each side
// make the edge feel naturally enclosed.
//
// The wall-side row is always the large fire-resistant scenery tree so no
// flammable tree touches the map boundary. The inner perimeter row keeps the
// deterministic checker-like mix of fire-resistant scenery and ordinary
// flammable/choppable trees. Interior trees never opt into this helper, so
// their existing gameplay stays unchanged.
function configurePerimeterTree(
  tree,
  x,
  y,
  mapSeed = 0,
  outermost = false
) {
  const gridX = Math.floor(x / 24);
  const gridY = Math.floor(y / 24);

  // The wall-side row is always fire-immune so no flammable tree ever touches
  // the map boundary. The inner staggered row keeps the existing deterministic
  // mix of ordinary and fire-resistant trees.
  const fireImmune =
    outermost || ((gridX + gridY + mapSeed) & 1) === 0;

  tree.perimeterTree = true;
  tree.outermostPerimeterTree = outermost;
  tree.fireImmune = fireImmune;
  tree.nonInteractive = fireImmune;
  return tree;
}

let perimeterTreePhase = 0;

function addPerimeterTree(x, y, outermost = false) {
  const tree = configurePerimeterTree(
    { x, y, phase: perimeterTreePhase },
    x,
    y,
    0,
    outermost
  );

  trees.push(tree);
  perimeterTreePhase += 0.73;
}

// Top + bottom bands.
for (let x = 12; x <= world.width - 12; x += 28) {
  addPerimeterTree(x, 28, true);
  addPerimeterTree(x, world.height - 6, true);
}

for (let x = 26; x <= world.width - 12; x += 28) {
  addPerimeterTree(x, 52);
  addPerimeterTree(x, world.height - 30);
}

// Left + right bands. Start lower / stop higher to avoid over-stacking the
// already-dense corners created by the top and bottom rows.
for (let y = 78; y <= world.height - 78; y += 28) {
  addPerimeterTree(14, y, true);
  addPerimeterTree(world.width - 14, y, true);
}

for (let y = 92; y <= world.height - 78; y += 28) {
  addPerimeterTree(40, y);
  addPerimeterTree(world.width - 40, y);
}

// Collision is ONLY around each trunk/base.
// The canopy stays non-solid so the player can walk behind it.
for (const tree of trees) {
  tree.collision = {
    width: 10,
    height: 8
  };

  // Tree chopping state.
  tree.maxHp = 4;
  tree.hp = 4;
  tree.isStump = false;
  tree.removed = false;
  tree.shakeTime = 0;

  // Final chop animation.
  tree.falling = false;
  tree.fallTime = 0;
  tree.fallDuration = 0.42;
  tree.fallDirection = 1;

  // Fire only destroys the leafy canopy; the trunk remains for the axe.
  tree.canopyBurnTime = 0;
  tree.canopyBurnDuration = 2.7;
  tree.canopyBurned = false;

  // Local animation only. Server authority decides when the tree regrows.
  tree.regrowAnimTime = 0;
  tree.regrowAnimDuration = 0.34;
  tree.regrowAt = 0;

  tree.canopyVariant = randomTreeCanopyVariant();
}

function playerIsBehindTree(tree) {
  return CAMOUFLAGE_RULES.pointInTreeCover(
    player.x,
    player.y,
    tree.x,
    tree.y
  );
}

const CAMOUFLAGE_CONFUSION_DURATION = CAMOUFLAGE_RULES.CONFUSION_DURATION;
const CAMOUFLAGE_CLOSE_REVEAL_DISTANCE = CAMOUFLAGE_RULES.CLOSE_REVEAL_DISTANCE;

function camouflageCoverAtPlayer() {
  if (!isAbilityUnlocked("camouflage")) return null;

  for (const tree of trees) {
    if (
      tree.removed ||
      tree.isStump ||
      tree.falling ||
      tree.canopyBurned ||
      tree.canopyBurnTime > 0
    ) {
      continue;
    }

    if (
      CAMOUFLAGE_RULES.pointInTreeCover(
        player.x,
        player.y,
        tree.x,
        tree.y
      )
    ) {
      return {
        type: "tree",
        id: CAMOUFLAGE_RULES.treeCoverId(
          currentMapId,
          tree.fireImmune && tree.nonInteractive
            ? null
            : (tree.entityId || null),
          tree.x,
          tree.y
        ),
        object: tree
      };
    }
  }

  const nowMs = Date.now();
  for (const clump of tallGrass) {
    if (clump.temporaryRainGrass) {
      // Each deterministic Magic Grass cell becomes cover as soon as that
      // individual clump has finished growing. Burning/burnt/expired cells
      // stop qualifying immediately; the normal Camo grace handles reveal.
      if (
        clump.mapId !== currentMapId ||
        !temporaryRainGrassCellIsAlive(clump, nowMs) ||
        nowMs < (Number(clump.growAtMs) || 0) +
          CAMOUFLAGE_RULES.RAIN_GRASS_COVER_MATURITY_DELAY * 1000 ||
        (Number(clump.burnTime) || 0) > 0 ||
        (Number(clump.burnExpiresAtMs) || 0) > nowMs
      ) {
        continue;
      }

      if (
        CAMOUFLAGE_RULES.pointInGrassCover(
          player.x,
          player.y,
          clump.x,
          clump.y,
          clump.width || 13
        )
      ) {
        return {
          type: CAMOUFLAGE_RULES.RAIN_GRASS_KIND,
          id: CAMOUFLAGE_RULES.rainGrassCoverId(
            currentMapId,
            temporaryRainGrassOwnerId(clump),
            clump.grassPatchId,
            clump.fieldCellIndex
          ),
          object: clump
        };
      }
      continue;
    }

    if (
      !clump.entityId ||
      clump.cut ||
      clump.burnt ||
      clump.burnTime > 0
    ) {
      continue;
    }

    if (
      CAMOUFLAGE_RULES.pointInGrassCover(
        player.x,
        player.y,
        clump.x,
        clump.y,
        clump.width || 13
      )
    ) {
      return {
        type: "grass",
        id: CAMOUFLAGE_RULES.grassCoverId(
          currentMapId,
          clump.entityId,
          clump.x,
          clump.y
        ),
        object: clump
      };
    }
  }

  return null;
}

function playerIsPveEngaged() {
  const localId =
    typeof onlineClient !== "undefined"
      ? onlineClient?.localPlayerId
      : null;

  if (!localId) return false;

  for (const { enemy } of activeEnemyRecords({ aliveOnly: true })) {
    if (enemy.aggroTargetId === localId) {
      return true;
    }

    if (
      enemy.confusionTargetId === localId &&
      (Number(enemy.confusionTime) || 0) > 0
    ) {
      return true;
    }
  }

  return false;
}

function closeMonsterCanRevealCamouflage() {
  for (const { enemy } of activeEnemyRecords({ aliveOnly: true })) {
    const body = enemyBodyPoint(enemy);

    if (
      Math.hypot(
        body.x - player.x,
        body.y - (player.y - 7)
      ) <= CAMOUFLAGE_CLOSE_REVEAL_DISTANCE
    ) {
      return true;
    }
  }

  return false;
}

function emitCamouflageParticleAt(x, y) {
  const colors = [
    "#3f7d3b",
    "#55964a",
    "#6baa54",
    "#87bd62"
  ];

  const life = 0.34 + Math.random() * 0.24;

  growthParticles.push({
    x: x + (Math.random() - 0.5) * 15,
    y: y - 5 - Math.random() * 15,
    vx: (Math.random() - 0.5) * 8,
    vy: -4 - Math.random() * 8,
    life,
    maxLife: life,
    color: colors[(Math.random() * colors.length) | 0],
    size: Math.random() < 0.22 ? 2 : 1
  });
}

function emitCamouflageParticle() {
  emitCamouflageParticleAt(player.x, player.y);
}

function emitRemoteCamouflageParticles(remote) {
  if (!remote || !remote.camouflaged) {
    if (remote) remote._nextCamouflageParticleAt = 0;
    return;
  }

  const now = Number(worldTime) || 0;
  const nextAt = Number(remote._nextCamouflageParticleAt) || 0;

  if (now < nextAt) return;

  emitCamouflageParticleAt(Number(remote.x) || 0, Number(remote.y) || 0);
  if (Math.random() < 0.72) {
    emitCamouflageParticleAt(Number(remote.x) || 0, Number(remote.y) || 0);
  }
  if (Math.random() < 0.28) {
    emitCamouflageParticleAt(Number(remote.x) || 0, Number(remote.y) || 0);
  }

  // PvP counterplay: a fully hidden Ranger leaves only a brief, intermittent
  // leaf tell. Once emitted, the next clue is deliberately far enough away
  // that it cannot be used as continuous tracking.
  remote._nextCamouflageParticleAt = now + 1.5;
}

function updateCamouflageParticles(dt) {
  if (!player.camouflaged) {
    player.camouflageParticleTimer = 0;
    return;
  }

  player.camouflageParticleTimer -= dt;

  if (player.camouflageParticleTimer > 0) return;

  emitCamouflageParticle();
  if (Math.random() < 0.72) {
    emitCamouflageParticle();
  }
  if (Math.random() < 0.28) {
    emitCamouflageParticle();
  }

  player.camouflageParticleTimer = 0.055;
}

function clearCamouflageState(sendState = false) {
  player.camouflaged = false;
  player.camouflageBuildTime = 0;
  player.camouflageGraceTime = 0;
  player.camouflageCoverType = null;
  player.camouflageSourceCover = null;
  player.camouflageParticleTimer = 0;
}

function applyAuthoritativeCamouflageState(message) {
  if (!message) return;
  const active = Boolean(message.camouflaged);

  player.camouflaged = active;
  player.camouflageBuildTime = active
    ? player.camouflageBuildDuration
    : 0;
  player.camouflageGraceTime = active
    ? player.camouflageGraceDuration
    : 0;
  player.camouflageSourceCover = active
    ? (message.sourceCoverId || player.camouflageSourceCover || null)
    : null;
  player.camouflageParticleTimer = 0;

}

function consumeCamouflageOpening() {
  if (!player.camouflaged) return false;

  player.camouflaged = false;
  player.camouflageBuildTime = 0;
  player.camouflageGraceTime = 0;
  player.camouflageCoverType = null;
  player.camouflageSourceCover = null;
  player.camouflageParticleTimer = 0;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.breakCamouflage();
  }

  return true;
}

function updateCamouflageState(dt) {
  if (!isAbilityUnlocked("camouflage")) {
    clearCamouflageState(false);
    return;
  }

  if (player.shadowHidden || player.isDead) {
    clearCamouflageState(false);
    return;
  }

  const cover = camouflageCoverAtPlayer();
  const coverType = cover?.type || null;
  player.camouflageCoverType = coverType;

  updateCamouflageParticles(dt);


  if (player.camouflaged) {
    // Client-side prediction makes reveal feel immediate. The server performs
    // the same checks authoritatively and sends the actual transition.
    if (
      playerIsPveEngaged() ||
      closeMonsterCanRevealCamouflage()
    ) {
      clearCamouflageState(false);
      return;
    }

    if (cover) {
      player.camouflageGraceTime = player.camouflageGraceDuration;
      return;
    }

    player.camouflageGraceTime = Math.max(
      0,
      player.camouflageGraceTime - dt
    );

    if (player.camouflageGraceTime <= 0) {
      clearCamouflageState(false);
    }
    return;
  }

  if (playerIsPveEngaged() || player.hunterSnareSetting) {
    player.camouflageBuildTime = 0;
    return;
  }

  const stationary =
    !player.wasMoving &&
    Math.hypot(player.knockbackX, player.knockbackY) < 0.5 &&
    player.attackTime <= 0 &&
    !player.bowDrawing &&
    !focusFireIsCasting();

  if (!cover || !stationary) {
    player.camouflageBuildTime = 0;
    return;
  }

  player.camouflageBuildTime = Math.min(
    player.camouflageBuildDuration,
    player.camouflageBuildTime + dt
  );

  if (
    player.camouflageBuildTime >= player.camouflageBuildDuration &&
    !(typeof onlineClient !== "undefined" && onlineClient?.connected)
  ) {
    // Offline keeps the exact same gameplay without a server authority layer.
    player.camouflaged = true;
    player.camouflageSourceCover = cover.id;
    player.camouflageGraceTime = player.camouflageGraceDuration;
  }
}

function drawCamouflageIndicator(camX, camY) {
  if (!isAbilityUnlocked("camouflage")) return;

  const screenX = Math.round(player.x - camX);
  const screenY = Math.round(player.y - camY - 27);

  if (player.camouflaged) {
    return;
  }

  if (
    !player.camouflageCoverType ||
    player.camouflageBuildTime <= 0
  ) {
    return;
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      player.camouflageBuildTime /
        player.camouflageBuildDuration
    )
  );

  ctx.fillStyle = "rgba(28, 38, 27, .78)";
  ctx.fillRect(screenX - 8, screenY, 16, 3);
  ctx.fillStyle = "#a9cf85";
  ctx.fillRect(
    screenX - 7,
    screenY + 1,
    Math.round(14 * progress),
    1
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

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#203b24";
    ctx.fillRect(shadowX - 10, shadowY - 4, 18, 2);
    ctx.fillRect(shadowX - 13, shadowY - 2, 25, 2);
    ctx.fillRect(shadowX - 15, shadowY,     28, 2);
    ctx.fillRect(shadowX - 11, shadowY + 2, 20, 2);
    ctx.restore();

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
const tallGrass = [
  // Large west meadow.
  { x: 180, y: 168, phase: 0.2, width: 13, cut: false },
  { x: 195, y: 174, phase: 0.7, width: 12, cut: false },
  { x: 211, y: 169, phase: 1.1, width: 14, cut: false },
  { x: 226, y: 178, phase: 1.6, width: 13, cut: false },
  { x: 168, y: 184, phase: 2.0, width: 12, cut: false },
  { x: 186, y: 190, phase: 2.5, width: 14, cut: false },
  { x: 205, y: 188, phase: 3.0, width: 13, cut: false },
  { x: 223, y: 197, phase: 3.4, width: 14, cut: false },
  { x: 241, y: 187, phase: 3.9, width: 12, cut: false },
  { x: 174, y: 205, phase: 4.3, width: 13, cut: false },
  { x: 194, y: 209, phase: 4.8, width: 12, cut: false },
  { x: 214, y: 215, phase: 5.2, width: 14, cut: false },
  { x: 235, y: 209, phase: 5.7, width: 13, cut: false },

  // Large east meadow.
  { x: 447, y: 207, phase: 0.4, width: 13, cut: false },
  { x: 465, y: 213, phase: 0.9, width: 14, cut: false },
  { x: 484, y: 205, phase: 1.5, width: 12, cut: false },
  { x: 502, y: 219, phase: 2.0, width: 13, cut: false },
  { x: 438, y: 227, phase: 2.4, width: 12, cut: false },
  { x: 457, y: 234, phase: 2.9, width: 14, cut: false },
  { x: 477, y: 230, phase: 3.4, width: 13, cut: false },
  { x: 497, y: 241, phase: 3.8, width: 14, cut: false },
  { x: 516, y: 231, phase: 4.2, width: 12, cut: false },
  { x: 446, y: 250, phase: 4.7, width: 13, cut: false },
  { x: 467, y: 256, phase: 5.1, width: 14, cut: false },
  { x: 489, y: 259, phase: 5.6, width: 13, cut: false },
  { x: 510, y: 253, phase: 6.0, width: 12, cut: false },

  // South-west field near the slime group.
  { x: 70,  y: 252, phase: 0.3, width: 13, cut: false },
  { x: 87,  y: 259, phase: 0.8, width: 12, cut: false },
  { x: 105, y: 251, phase: 1.3, width: 14, cut: false },
  { x: 123, y: 262, phase: 1.8, width: 13, cut: false },
  { x: 142, y: 254, phase: 2.3, width: 12, cut: false },
  { x: 62,  y: 271, phase: 2.8, width: 14, cut: false },
  { x: 81,  y: 278, phase: 3.3, width: 13, cut: false },
  { x: 101, y: 275, phase: 3.8, width: 14, cut: false },
  { x: 121, y: 283, phase: 4.3, width: 13, cut: false },
  { x: 143, y: 276, phase: 4.8, width: 12, cut: false },
  { x: 72,  y: 294, phase: 5.3, width: 13, cut: false },
  { x: 95,  y: 298, phase: 5.8, width: 14, cut: false },
  { x: 120, y: 302, phase: 6.2, width: 12, cut: false },

  // Smaller northern patch.
  { x: 335, y: 84,  phase: 0.6, width: 13, cut: false },
  { x: 352, y: 91,  phase: 1.2, width: 12, cut: false },
  { x: 370, y: 86,  phase: 1.8, width: 14, cut: false },
  { x: 386, y: 98,  phase: 2.4, width: 13, cut: false },
  { x: 344, y: 106, phase: 3.0, width: 14, cut: false },
  { x: 365, y: 111, phase: 3.6, width: 12, cut: false },

  // A few stray clumps to break up empty ground.
  { x: 292, y: 235, phase: 0.9, width: 12, cut: false },
  { x: 344, y: 348, phase: 2.7, width: 13, cut: false },
  { x: 566, y: 154, phase: 4.4, width: 12, cut: false },
  { x: 586, y: 181, phase: 5.0, width: 13, cut: false }
];

tallGrass.forEach(clump => {
  // Decorative grass flowers have been retired. World flowers now use the
  // dedicated harvestable flower system below.
  clump.flowerType = null;
  clump.flowerPicked = true;
  clump.patchFlower = false;

  clump.burnt =
    Boolean(clump.burnt);
  clump.burnTime =
    Number(clump.burnTime) || 0;
  clump.burnDuration =
    Number(clump.burnDuration) || 1.05;

  clump.regrowAnimTime = 0;
  clump.regrowAnimDuration = 0.22;
  clump.regrowAt = 0;
});

const TEMP_RAIN_GRASS_LIFETIME = RAIN_FIELD.CELL_LIFETIME;
const TEMP_RAIN_GRASS_BURN_DURATION = RAIN_FIELD.BURN_DURATION;
const TEMP_RAIN_GRASS_SPEED_MULTIPLIER = RAIN_FIELD.SPEED_MULTIPLIER;
const TEMP_RAIN_GRASS_CHAIN_SOURCE_CHANCE = RAIN_FIELD.FIRE_CHAIN_CHANCE;
const TEMP_RAIN_GRASS_CHAIN_TARGET_CHANCE = 1;
const TEMP_RAIN_GRASS_CHAIN_RADIUS = RAIN_FIELD.FIRE_CHAIN_RADIUS;
const TEMP_RAIN_GRASS_CHAIN_MAX_IGNITIONS = RAIN_FIELD.FIRE_CHAIN_MAX_IGNITIONS;
let rainGrassPatchSequence = 0;
let rainGrassClumpSequence = 0;
const temporaryRainGrassFields = new Map();

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

function findTemporaryRainGrass(ownerId, grassId) {
  if (!ownerId || !grassId) return null;

  return tallGrass.find(clump =>
    isTemporaryRainGrass(clump) &&
    temporaryRainGrassOwnerId(clump) === String(ownerId) &&
    clump.grassSyncId === String(grassId)
  ) || null;
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

function removeTemporaryRainGrassField(ownerId, patchId) {
  const key = temporaryRainGrassFieldKey(ownerId, patchId);
  temporaryRainGrassFields.delete(key);

  for (let i = tallGrass.length - 1; i >= 0; i--) {
    const clump = tallGrass[i];
    if (!isTemporaryRainGrass(clump)) continue;
    if (temporaryRainGrassOwnerId(clump) !== String(ownerId || "local")) continue;
    if ((Number(clump.grassPatchId) || 0) !== (Number(patchId) || 0)) continue;
    tallGrass.splice(i, 1);
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

// Retired in v260. One Rain Cloud cast defines the deterministic field; there
// are no per-cell spawn/state messages anymore. These remain as no-op shims so
// stale compatibility paths cannot accidentally recreate the old traffic loop.
function syncTemporaryRainGrassSpawn(_clump) {}
function syncTemporaryRainGrassState(_clump, _state) {}
function growTemporaryRainGrass(_cloud) {}
function updateTemporaryRainGrassSlow(_dt) {}

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

// Compatibility/offline helper. New online Rain Clouds never use this path.
function spawnTemporaryRainGrassAt(x, y, patchId = 0, options = {}) {
  if (
    typeof terrainAllowsMagicGrass === "function" &&
    !terrainAllowsMagicGrass(x, y, currentMapId)
  ) {
    return null;
  }

  const ownerId = String(options.ownerId || localRainGrassOwnerId());
  const requestedGrassId = options.grassId
    ? String(options.grassId)
    : `${patchId}:legacy:${++rainGrassClumpSequence}`;
  const existing = findTemporaryRainGrass(ownerId, requestedGrassId);
  if (existing) return existing;

  const nowMs = Date.now();
  const tempLife = Number.isFinite(options.tempLife)
    ? Math.max(0.1, Number(options.tempLife))
    : TEMP_RAIN_GRASS_LIFETIME;
  const clump = {
    x: clampToWorld(x, 8, world.width - 8),
    y: clampToWorld(y, 12, world.height - 4),
    width: Number.isFinite(options.width) ? Number(options.width) : 18,
    phase: Number.isFinite(options.phase) ? Number(options.phase) : Math.random() * Math.PI * 2,
    cut: false,
    flowerType: null,
    flowerPicked: true,
    patchFlower: false,
    burnt: false,
    burnTime: Math.max(0, Number(options.burnTime) || 0),
    burnDuration: TEMP_RAIN_GRASS_BURN_DURATION,
    burnExpiresAtMs: 0,
    regrowAnimTime: 0.22,
    regrowAnimDuration: 0.22,
    regrowAt: 0,
    temporaryRainGrass: true,
    tempLife,
    tempBornAtMs: nowMs,
    tempExpiresAtMs: nowMs + tempLife * 1000,
    growAtMs: nowMs,
    mapId: currentMapId,
    grassPatchId: Number(patchId) || 0,
    grassBornAt: worldTime,
    grassOwnerId: ownerId,
    grassSyncId: requestedGrassId,
    serverControlled: Boolean(options.serverControlled),
    fieldControlled: false
  };
  tallGrass.push(clump);
  return clump;
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

function pointIsInTemporaryRainGrass(x, y, radius = 9) {
  const nowMs = Date.now();
  for (const clump of tallGrass) {
    if (
      !isTemporaryRainGrass(clump) ||
      clump.mapId !== currentMapId ||
      !temporaryRainGrassCellIsAlive(clump, nowMs)
    ) {
      continue;
    }

    const dx = x - clump.x;
    const dy = y - clump.y;
    const combinedRadius = RAIN_FIELD.combinedHitRadius(
      { width: Number(clump.width) || 12 },
      radius
    );

    if (dx * dx + dy * dy <= combinedRadius * combinedRadius) {
      return true;
    }
  }
  return false;
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

  // Once cut/burned, leave a little uneven stubble behind.
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

      // Offline fallback.
      clump.cut = true;
      scheduleLocalGrassRegrow(clump);
    }
  }
}

// -----------------------------------------------------------------------------
// HARVESTABLE WILDFLOWERS
// -----------------------------------------------------------------------------
// Larger, clearer flowers that grow around the grass patches. These must be
// cut with the sword and then looted as a dropped pickup.
const harvestFlowers = [
  { x: 188, y: 179, phase: 0.4, type: "white", cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 230, y: 194, phase: 1.2, type: "blue",  cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 474, y: 221, phase: 2.0, type: "white", cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 500, y: 246, phase: 2.8, type: "blue",  cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 96,  y: 266, phase: 3.5, type: "white", cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 127, y: 288, phase: 4.0, type: "blue",  cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 361, y: 96,  phase: 4.8, type: "white", cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false },
  { x: 575, y: 170, phase: 5.5, type: "blue",  cut: false, looted: false, burnTime: 0, burnDuration: 1.15, burnt: false }
];

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
    regrowAt: 0,
    carriedBy: null,
    pickupTime: 0,
    pickupDuration: 0.18,
    pickupDirX: 0,
    pickupDirY: 0,
    hurlTime: 0,
    hurlDuration: 0.58,
    hurlVelocityX: 0,
    hurlVelocityY: 0,
    rollTime: 0,
    rollDuration: 0.24,
    rollVelocityX: 0,
    rollVelocityY: 0,

    // Render-only state. Authoritative x/y still come from the server; these
    // fields dead-reckon between 10 Hz snapshots so flight can look 60 FPS.
    renderX: x,
    renderY: y,
    serverTargetX: x,
    serverTargetY: y,
    serverSnapshotAtMs: 0,
    visualRotation: 0
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

function rockCarrier(rock) {
  if (
    !rock?.carriedBy ||
    typeof onlineClient === "undefined" ||
    !onlineClient
  ) {
    return null;
  }

  return onlineClient.playerForNetworkId(
    rock.carriedBy
  );
}

function drawRock(rock, camX, camY) {
  if (!rock || rock.depleted) return;

  const carrier = rockCarrier(rock);
  const worldX = carrier
    ? carrier.x
    : Number.isFinite(Number(rock.renderX))
      ? Number(rock.renderX)
      : rock.x;
  const worldY = carrier
    ? carrier.y
    : Number.isFinite(Number(rock.renderY))
      ? Number(rock.renderY)
      : rock.y;
  const screenX = Math.round(worldX - camX);
  const screenY = Math.round(worldY - camY);
  const image = rockImageForState(rock);

  let lift = 0;

  if (carrier) {
    const duration = Math.max(
      0.01,
      Number(rock.pickupDuration) || 0.18
    );

    const progress = Math.max(
      0,
      Math.min(
        1,
        1 - (Number(rock.pickupTime) || 0) / duration
      )
    );

    lift = Math.round(3 + progress * 9);
  } else if ((Number(rock.hurlTime) || 0) > 0) {
    const duration = Math.max(
      0.01,
      Number(rock.hurlDuration) || 0.58
    );

    const progress = Math.max(
      0,
      Math.min(
        1,
        1 - (Number(rock.hurlTime) || 0) / duration
      )
    );

    lift = Math.round(
      Math.sin(progress * Math.PI) * 13
    );
  }

  ctx.fillStyle = "rgba(22, 28, 24, 0.22)";
  ctx.fillRect(screenX - 5, screenY - 1, 10, 2);

  if (image) {
    const rawRotation = carrier
      ? 0
      : Number(rock.visualRotation) || 0;

    // Keep the tiny 16x16 rock art on clean quarter-turn poses. The underlying
    // rotation remains continuous, so throw/roll direction and momentum still
    // flow naturally; only the rendered pose is quantized for crisp pixel art.
    const quarterTurn = Math.PI / 2;
    const rotation = carrier
      ? 0
      : Math.round(rawRotation / quarterTurn) * quarterTurn;

    ctx.save();
    ctx.translate(
      screenX,
      screenY - lift - 4
    );
    ctx.rotate(rotation);
    ctx.drawImage(
      image,
      -8,
      -8
    );
    ctx.restore();
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
      awardFlowerHarvestingExp(1);

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
const pond = {
  x: 260,
  y: 171,
  width: 120,
  height: 58
};

function pondPath(camX, camY, inset = 0) {
  const x = Math.round(pond.x - camX + inset);
  const y = Math.round(pond.y - camY + inset);
  const w = pond.width - inset * 2;
  const h = pond.height - inset * 2;

  ctx.beginPath();
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + w - 12, y);
  ctx.lineTo(x + w - 12, y + 2);
  ctx.lineTo(x + w - 5, y + 2);
  ctx.lineTo(x + w - 5, y + 6);
  ctx.lineTo(x + w, y + 6);
  ctx.lineTo(x + w, y + h - 8);
  ctx.lineTo(x + w - 4, y + h - 8);
  ctx.lineTo(x + w - 4, y + h - 3);
  ctx.lineTo(x + w - 12, y + h - 3);
  ctx.lineTo(x + w - 12, y + h);
  ctx.lineTo(x + 10, y + h);
  ctx.lineTo(x + 10, y + h - 2);
  ctx.lineTo(x + 3, y + h - 2);
  ctx.lineTo(x + 3, y + h - 7);
  ctx.lineTo(x, y + h - 7);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x + 4, y + 7);
  ctx.lineTo(x + 4, y + 3);
  ctx.lineTo(x + 8, y + 3);
  ctx.closePath();
}

function drawWaterBase(camX, camY) {
  pondPath(camX, camY);

  // Dark shoreline edge.
  ctx.fillStyle = "#365f67";
  ctx.fill();

  // Main water body.
  pondPath(camX, camY, 2);
  ctx.fillStyle = "#4f8791";
  ctx.fill();

  // Slightly darker depth toward the bottom.
  const sx = Math.round(pond.x - camX + 4);
  const sy = Math.round(pond.y - camY + pond.height * 0.58);
  ctx.fillStyle = "rgba(44, 104, 117, .30)";
  ctx.fillRect(sx, sy, pond.width - 8, Math.round(pond.height * 0.32));
}

function drawWaterSurface(camX, camY) {
  // A light blue-green veil tints the reflection into the water.
  ctx.save();
  pondPath(camX, camY, 2);
  ctx.clip();

  ctx.fillStyle = "rgba(76, 139, 151, .19)";
  ctx.fillRect(
    Math.round(pond.x - camX),
    Math.round(pond.y - camY),
    pond.width,
    pond.height
  );

  // Tiny pixel ripples. They drift slowly but stay subtle.
  const phase = Math.floor(worldTime * 7) % 18;
  ctx.fillStyle = "rgba(163, 205, 207, .46)";

  const rippleYs = [12, 29, 44];
  for (let r = 0; r < rippleYs.length; r++) {
    const baseY = Math.round(pond.y - camY + rippleYs[r]);
    const startX = Math.round(pond.x - camX + 12 + ((phase + r * 7) % 18));

    ctx.fillRect(startX, baseY, 8, 1);
    ctx.fillRect(startX + 12, baseY, 4, 1);
    ctx.fillRect(startX + 31, baseY + (r % 2), 7, 1);
    ctx.fillRect(startX + 55, baseY, 5, 1);
  }

  ctx.restore();
}

function hitsWater(x, y) {
  const terrainDefinition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  if (TERRAIN_RULES.terrainDefinition(terrainDefinition)) {
    return TERRAIN_RULES.circleTouchesType(
      terrainDefinition,
      x,
      y,
      4,
      "water"
    );
  }

  // Legacy pond collision sits just inside the drawn shoreline so the player's
  // feet can visually reach the very edge without stepping into the pond.
  return circleRectCollision(
    x,
    y,
    4,
    pond.x + 3,
    pond.y + 2,
    pond.width - 6,
    pond.height - 4
  );
}

function drawPlayerReflection(camX, camY) {
  // A fully hidden ninja casts no reflection.
  if (player.shadowHidden && player.shadowHideRevealTime <= 0) return;

  const terrainDefinition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  const usesAuthoredTerrain = Boolean(TERRAIN_RULES.terrainDefinition(terrainDefinition));

  if (usesAuthoredTerrain && typeof terrainWaterReflectionInfo === "function") {
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
    return;
  }

  // Legacy pond reflection path.
  const withinX =
    player.x > pond.x - 8 &&
    player.x < pond.x + pond.width + 8;

  if (!withinX) return;

  let mirrorWorldY = null;
  let distanceToShore = 999;

  if (player.y <= pond.y) {
    distanceToShore = pond.y - player.y;
    if (distanceToShore <= 16) mirrorWorldY = pond.y;
  } else if (player.y >= pond.y + pond.height) {
    distanceToShore = player.y - (pond.y + pond.height);
    if (distanceToShore <= 16) mirrorWorldY = pond.y + pond.height;
  }

  if (mirrorWorldY === null) return;

  const fade = Math.max(0, 1 - distanceToShore / 16);
  const mirrorScreenY = Math.round(mirrorWorldY - camY);

  ctx.save();
  pondPath(camX, camY, 2);
  ctx.clip();
  ctx.translate(0, mirrorScreenY * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.18 * fade;
  drawPlayer(camX, camY, true);
  ctx.restore();
}
