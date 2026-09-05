// Slime Story client simulation/render/bootstrap runtime — extracted verbatim from v240 game.js.


// -----------------------------------------------------------------------------

// UPDATE
// -----------------------------------------------------------------------------
function updateHudUi() {
  const mobileInteractButton = document.getElementById("mobileInteractButton");
  if (mobileInteractButton) {
    const interactionAvailable = Boolean(
      !player.isDead &&
      !inventoryOpen &&
      !shopOpen &&
      !craftingOpen &&
      !classResetConfirmOpen &&
      !beachQuestOpen &&
      nearbySpawnInteraction()
    );
    mobileInteractButton.classList.toggle("available", interactionAvailable);
    mobileInteractButton.disabled = !interactionAvailable;
  }

  const hpFill = document.getElementById("hpFill");
  if (hpFill) {
    const pct = Math.max(0, Math.min(1, player.hp / player.maxHp));
    hpFill.style.width = `${pct * 100}%`;
  }

  const hpBarText = document.getElementById("hpBarText");
  if (hpBarText) {
    hpBarText.textContent = `HP ${player.hp} / ${player.maxHp}`;
  }

  const xpFill = document.getElementById("xpFill");
  if (xpFill) {
    const pct = Math.max(0, Math.min(1, player.exp / player.expToNext));
    xpFill.style.width = `${pct * 100}%`;
  }

  const xpBarText = document.getElementById("xpBarText");
  if (xpBarText) {
    xpBarText.textContent =
      `LV ${player.level} · ${player.exp} / ${player.expToNext} EXP`;
  }

  const now = Date.now();
  const buffRows = [
    ["attackBuffHud", "attackBuffHudTime", Number(player.attackPotionUntil) || 0],
    ["magicBuffHud", "magicBuffHudTime", Number(player.magicPotionUntil) || 0]
  ];
  for (const [hudId, timeId, until] of buffRows) {
    const remaining = Math.max(0, until - now);
    const hud = document.getElementById(hudId);
    const time = document.getElementById(timeId);
    if (hud) hud.classList.toggle("active", remaining > 0);
    if (time) time.textContent = remaining > 0 ? `${Math.ceil(remaining / 1000)}s` : "";
  }

  setRespawnButtonVisible(player.isDead);
}

function resetLocalTreeToFresh(tree) {
  tree.hp = tree.maxHp;
  tree.isStump = false;
  tree.falling = false;
  tree.fallTime = 0;
  tree.canopyBurnTime = 0;
  tree.canopyBurned = false;
  tree.regrowAt = 0;

  spawnTreeRegrowBurst(tree);
}

function resetLocalGrassToFresh(clump) {
  clump.cut = false;
  clump.burnt = false;
  clump.burnTime = 0;
  clump.regrowAt = 0;

  spawnGrassRegrowBurst(clump);
}

function updateEnvironmentRegrowthEffects(
  dt
) {
  const now = Date.now();

  for (const tree of trees) {
    tree.regrowAnimTime =
      Math.max(
        0,
        (tree.regrowAnimTime || 0) - dt
      );

    if (
      !tree.serverControlled &&
      tree.regrowAt > 0 &&
      now >= tree.regrowAt
    ) {
      resetLocalTreeToFresh(
        tree
      );
    }
  }

  for (const clump of tallGrass) {
    clump.regrowAnimTime =
      Math.max(
        0,
        (clump.regrowAnimTime || 0) - dt
      );

    if (
      !clump.serverControlled &&
      clump.regrowAt > 0 &&
      now >= clump.regrowAt
    ) {
      resetLocalGrassToFresh(
        clump
      );
    }
  }

  updateGrowthParticles(dt);
}

function updateRockPresentation(dt) {
  const nowMs = performance.now();

  for (const rock of rocks) {
    if (rock.depleted) continue;

    rock.pickupTime = Math.max(
      0,
      (Number(rock.pickupTime) || 0) - dt
    );

    if (rock.carriedBy) {
      rock.visualRotation = 0;
      continue;
    }

    const wasHurling = (Number(rock.hurlTime) || 0) > 0;
    const wasRolling = (Number(rock.rollTime) || 0) > 0;

    rock.hurlTime = Math.max(
      0,
      (Number(rock.hurlTime) || 0) - dt
    );
    rock.rollTime = Math.max(
      0,
      (Number(rock.rollTime) || 0) - dt
    );

    if (!Number.isFinite(Number(rock.renderX))) rock.renderX = rock.x;
    if (!Number.isFinite(Number(rock.renderY))) rock.renderY = rock.y;

    const snapshotAge = Math.max(
      0,
      Math.min(
        0.16,
        (nowMs - (Number(rock.serverSnapshotAtMs) || nowMs)) / 1000
      )
    );

    let velocityX = 0;
    let velocityY = 0;
    let spinSpeed = 0;

    if (wasHurling) {
      velocityX = Number(rock.hurlVelocityX) || 0;
      velocityY = Number(rock.hurlVelocityY) || 0;
      spinSpeed = 10.8;
    } else if (wasRolling) {
      const rollDuration = Math.max(0.01, Number(rock.rollDuration) || 0.24);
      const fraction = Math.max(0, Math.min(1, (Number(rock.rollTime) || 0) / rollDuration));
      velocityX = (Number(rock.rollVelocityX) || 0) * fraction;
      velocityY = (Number(rock.rollVelocityY) || 0) * fraction;
      spinSpeed = 6.2 * fraction;
    }

    if (wasHurling || wasRolling) {
      // Predict continuously at render rate, then make only a gentle correction
      // toward an extrapolated authoritative snapshot. This keeps the server in
      // charge without visually following its 10 Hz stepping.
      rock.renderX += velocityX * dt;
      rock.renderY += velocityY * dt;

      const targetX = Number(rock.serverTargetX);
      const targetY = Number(rock.serverTargetY);

      if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
        const predictedTargetX = targetX + velocityX * snapshotAge;
        const predictedTargetY = targetY + velocityY * snapshotAge;
        const correctionBlend = 1 - Math.exp(-9 * dt);
        rock.renderX += (predictedTargetX - rock.renderX) * correctionBlend;
        rock.renderY += (predictedTargetY - rock.renderY) * correctionBlend;
      }

      // Keep one cosmetic spin direction for the whole throw + landing roll.
      // This prevents a server phase transition from visually reversing the
      // rock even though its physical trajectory remains continuous.
      const directionSign = Number(rock.visualSpinDirection) < 0 ? -1 : 1;
      rock.visualRotation += spinSpeed * directionSign * dt;
      return;
    }

    // Once motion ends, smoothly settle onto the exact authoritative landing
    // point. Preserve the angle where the physical roll stopped; forcing the
    // sprite back upright created a conspicuous post-landing reverse spin.
    const settleBlend = 1 - Math.exp(-24 * dt);
    const targetX = Number(rock.serverTargetX);
    const targetY = Number(rock.serverTargetY);

    if (Number.isFinite(targetX)) {
      rock.renderX += (targetX - rock.renderX) * settleBlend;
      if (Math.abs(targetX - rock.renderX) < 0.03) rock.renderX = targetX;
    }

    if (Number.isFinite(targetY)) {
      rock.renderY += (targetY - rock.renderY) * settleBlend;
      if (Math.abs(targetY - rock.renderY) < 0.03) rock.renderY = targetY;
    }

    // Normalize by whole turns only. This keeps the exact same visible pose
    // while preventing the accumulated angle from growing forever.
    const rotation = Number(rock.visualRotation) || 0;
    if (Math.abs(rotation) > Math.PI * 2) {
      rock.visualRotation = Math.atan2(
        Math.sin(rotation),
        Math.cos(rotation)
      );
    }
  }
}

function updateTransientSystems(dt) {
  updateEnemyPresentationEffects(dt);
  updateRockPresentation(dt);
  updateDamageNumbers(dt);
  updateFloatingTexts(dt);
  updatePotionUseEffects(dt);
  updateJesterConfetti(dt);
  updateLevelUpParticles(dt);
  updateWandSweepParticles(dt);
  updateJesterAfterimages(dt);
  updateShadowSmoke(dt);
  updateCoins(dt);
  updateWoodDrops(dt);
  updateFlowerDrops(dt);
  updateLootPickupAnimations(dt);
  updateFocusFire(dt);
  updateFireballAim(dt);
  updateRainCloudCast(dt);
  updateBasicProjectiles(dt);
  updateRainMagic(dt);
  updateFire(dt);
  updateEnvironmentRegrowthEffects(dt);
}

function updateWorldObjectStates(dt) {
  for (const tree of trees) {
    tickTimer(tree, "shakeTime", dt);

    if (!tree.falling) continue;

    tree.fallTime -= dt;

    if (tree.fallTime <= 0) {
      tree.fallTime = 0;

      if (tree.serverControlled) {
        // Wait for the server patch to finalize stump/drop/reward state.
        continue;
      }

      tree.falling = false;
      tree.isStump = true;

      spawnWood(
        tree.x +
          tree.fallDirection * 14,
        tree.y - 1
      );

      // v377: tree harvesting no longer feeds a gathering talent.
    }
  }
}










function updatePlayerStatusAndTimers(dt) {
  if (player.isDead) {
    player.bowDrawing = false;
    player.bowDrawAmount = 0;
    player.bowReleaseTime = 0;
    player.attackTime = 0;
    player.attackDuration = DEFAULT_BASIC_ATTACK_DURATION;
    player.attackCooldown = 0;
    player.basicAttackMovementLockTime = 0;
    player.slashTime = 0;
    pendingBasicAttack = null;
    player.wetTime = 0;
    player.burnTime = 0;
    return;
  }

  updateBowVisualState(dt);
  updatePendingBasicAttack(dt);

  tickTimer(player, "shadowHideRevealTime", dt);
  tickTimer(player, "contactCooldown", dt);
  tickTimer(player, "wetTime", dt);

  if (
    typeof terrainEntityTouchesWater === "function" &&
    terrainEntityTouchesWater(player.x, player.y, currentMapId, 4)
  ) {
    applyLocalWetStatus(player, player.wetDuration || GAME_CONFIG.player.wetDuration);
  }

  tickTimer(player, "hurlReachTime", dt);
  const attackWasActive = player.attackTime > 0;
  tickTimer(player, "attackTime", dt);
  tickTimer(player, "attackCooldown", dt);
  tickTimer(player, "basicAttackMovementLockTime", dt);
  tickTimer(player, "slashTime", dt);

  if (attackWasActive && player.attackTime <= 0) {
    player.attackDuration = DEFAULT_BASIC_ATTACK_DURATION;
  }

  if (player.skillCooldowns) {
    for (const skillId of Object.keys(player.skillCooldowns)) {
      const endAtMs = Number(player.skillCooldownEndTimes?.[skillId]) || 0;
      if (endAtMs > 0) {
        player.skillCooldowns[skillId] = Math.max(
          0,
          (endAtMs - Date.now()) / 1000
        );
      } else {
        player.skillCooldowns[skillId] = Math.max(
          0,
          (Number(player.skillCooldowns[skillId]) || 0) - dt
        );
      }
    }
  }

  updateJesterRuntime(dt);
  updatePlayerBurnStatus(dt);
}

function updatePlayerContactsAndKnockback(dt) {

  if (
    Math.abs(player.knockbackX) <= 0.1 &&
    Math.abs(player.knockbackY) <= 0.1
  ) {
    return;
  }

  const nextX = player.x + player.knockbackX * dt;
  const nextY = player.y + player.knockbackY * dt;

  moveWithWorldCollision(player, nextX, nextY);

  player.knockbackX *= 0.78;
  player.knockbackY *= 0.78;
}


function readMovementInput() {
  return inputController.getMovementVector();
}

function bowStrafeMovementMultiplier() {
  const bowMovementRestricted =
    player.bowDrawing ||
    focusFireIsCasting();

  if (!bowMovementRestricted) return 1;

  // Strafe's enhancement is toggled directly inside the Ranger skill card and
  // defaults ON when learned. Focus Fire intentionally uses the same movement
  // rule for targeting and barrage.
  if (!hasEnhancement("strafe_enh_1")) return 0;

  const level = Math.max(0, Math.min(5, abilityLevel("strafe")));
  if (level <= 0) return 0;

  // LV1-LV5: 30%, 35%, 40%, 45%, 50%.
  return 0.25 + level * 0.05;
}

function updatePlayerMovement(dt) {
  player.pvpSnareRootTime = Math.max(
    0,
    (Number(player.pvpSnareRootTime) || 0) - dt
  );
  player.pvpSnareSlowTime = Math.max(
    0,
    (Number(player.pvpSnareSlowTime) || 0) - dt
  );

  if (player.isDead) {
    player.walkTime = 0;
    player.wasMoving = false;

    // Stay exactly where death occurred until the Respawn button is clicked.
    return;
  }

  updateHunterSnarePlacement(dt);

  const movement = readMovementInput();
  const strafeMultiplier = bowStrafeMovementMultiplier();
  const pvpSnareRooted =
    (Number(player.pvpSnareRootTime) || 0) > 0;

  const canActuallyMove =
    !player.rainCloudCasting &&
    !player.hunterSnareSetting &&
    !pvpSnareRooted &&
    movement.moving &&
    strafeMultiplier > 0;

  if (canActuallyMove) {
    if (!player.wasMoving) {
      player.firstRaisedLeg = movement.dx > 0 ? "right" : "left";
      player.walkTime = 0;
    }

    // Magic Grass is caster-created control terrain: players can roam through
    // it freely. Wet still slows players normally.
    const wetMovementMultiplier =
      playerIsWet() ? GAME_CONFIG.player.wetSpeedMultiplier : 1;

    const pvpSnareMovementMultiplier =
      (Number(player.pvpSnareSlowTime) || 0) > 0
        ? Math.max(
            0.1,
            Math.min(
              1,
              Number(player.pvpSnareSlowMultiplier) || 0.45
            )
          )
        : 1;

    const moveSpeed =
      player.speed *
      strafeMultiplier *
      wetMovementMultiplier *
      pvpSnareMovementMultiplier;

    const nextX = player.x + movement.dx * moveSpeed * dt;
    const nextY = player.y + movement.dy * moveSpeed * dt;

    moveWithWorldCollision(player, nextX, nextY);
    player.walkTime += dt * 10 * strafeMultiplier;
  } else {
    player.walkTime = 0;
  }

  player.wasMoving = canActuallyMove;

  player.x = clampToWorld(player.x, 8, world.width - 8);
  player.y = clampToWorld(player.y, 15, world.height - 1);

  updateMapConnection();
  updateCamouflageState(dt);
}

function collectNearbyPickups() {
  if (player.isDead) return;

  collectCoins();
  collectWoodDrops();
  collectFlowerDrops();
  collectSpecialResourceDrops();
}

function updateEnemySystems(dt) {
  const profiles =
    Object.values(
      CLIENT_ENEMY_RUNTIME_PROFILES
    )
      .filter(profile =>
        typeof profile.update === "function"
      )
      .sort(
        (a, b) =>
          (a.updatePriority || 0) -
          (b.updatePriority || 0)
      );

  const called = new Set();

  for (const profile of profiles) {
    if (called.has(profile.update)) continue;
    called.add(profile.update);
    profile.update(dt);
  }

  // Enemy Wet from open water is derived locally from the same authored
  // terrain geometry the server uses. This mirrors the existing Rain approach
  // and avoids a noisy wetTime packet every simulation tick.
  if (typeof terrainEntityTouchesWater === "function") {
    for (const { enemy } of activeEnemyRecords()) {
      if (!enemy?.alive || enemy.carriedBy || (Number(enemy.hurlTime) || 0) > 0) continue;
      if (terrainEntityTouchesWater(enemy.x, enemy.y, currentMapId, 4)) {
        applyLocalWetStatus(enemy, enemy.wetDuration || GAME_CONFIG.status.enemyWetDuration);
      }
    }
  }
}

const GAMEPLAY_UPDATE_SYSTEMS = Object.freeze([
  updateTransientSystems,
  updateWorldObjectStates,
  updatePlayerStatusAndTimers,
  updatePlayerContactsAndKnockback,
  updateEnemySystems,
  updatePlayerMovement
]);

function processGameCommand(command) {
  if (!command) return;
  if (player.isDead) return;

  if (command.type === "equipWeapon") {
    // Focus Fire is a committed channel. Hotbar keys and mouse wheel cannot
    // be used as a free cancel by swapping weapons mid-skill.
    if (focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return;

    const slotIndex =
      Number(command.payload.index);

    if (slotIndex < 0) {
      player.weaponIndex = -1;
    } else {
      selectHotbarSlot(slotIndex);
    }

    return;
  }

  if (command.type === "useActiveSkill") {
    triggerActiveSkillForKey(command.payload.key);
    return;
  }

  if (command.type === "releaseFocusFire") {
    releaseFocusFireCharge();
    return;
  }

  if (command.type === "releaseFireball") {
    releaseFireballAim();
    return;
  }

  if (command.type === "mobilePointTarget") {
    executeMobilePointTargetCommand(command.payload);
    return;
  }

  if (command.type === "interact") {
    if (player.rainCloudCasting) return;
    interactWithNearbyObject();
    return;
  }

  if (command.type === "primaryAttack") {
    if (player.rainCloudCasting) return;
    executePrimaryAttackCommand(command.payload);
  }
}

class GameSimulation {
  constructor(gameState, input) {
    this.state = gameState;
    this.input = input;
    this.systems = GAMEPLAY_UPDATE_SYSTEMS;
  }

  processInputCommands() {
    for (const command of this.input.drainCommands()) {
      processGameCommand(command);
    }
  }

  update(dt) {
    updateCanvasCursor();

    if (updateMapTransition(dt)) {
      updateHudUi();
      updateHotbar();
      updateInventoryUi();
      return;
    }

    const menuOpen = inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen;

    worldTime += dt;
    this.state.advanceTick();

    // Menus block local gameplay intent, but they do not pause the multiplayer
    // world. Enemy interpolation, effects, contacts, timers, loot animation,
    // and authoritative state presentation continue underneath the UI.
    if (menuOpen) {
      this.input.clearCommands();
      primaryAttackHeld = false;
    } else {
      // This is the future client -> server command boundary.
      this.processInputCommands();
      repeatHeldPrimaryAttackIfReady();
      updateMobileAutoAttack();
    }

    for (const system of this.systems) {
      system(dt);
    }

    collectNearbyPickups();
    updateHudUi();
    updateHotbar();
    updateInventoryUi();
  }
}
function getCameraPosition() {
  return {
    x: Math.max(
      0,
      Math.min(world.width - VIEW_W, player.x - VIEW_W / 2)
    ),
    y: Math.max(
      0,
      Math.min(world.height - VIEW_H, player.y - VIEW_H / 2)
    )
  };
}

const PROTOTYPE_ISLAND_MAP_ID = "prototypeIsland";
const PROTOTYPE_ISLAND_WEST_MAP_ID = "prototypeIslandWest";
const PROTOTYPE_ISLAND_FACE_DEPTH = 10;

function isPrototypeIslandMap(mapId = currentMapId) {
  return (
    mapId === PROTOTYPE_ISLAND_MAP_ID ||
    mapId === PROTOTYPE_ISLAND_WEST_MAP_ID
  );
}

function isAuthoredTerrainMap(mapId = currentMapId) {
  const definition =
    typeof WORLD_CONTENT !== "undefined"
      ? WORLD_CONTENT?.maps?.[mapId]
      : null;

  return Boolean(
    definition &&
    typeof TERRAIN_RULES !== "undefined" &&
    TERRAIN_RULES.terrainDefinition(definition)
  );
}

function getPrototypeIslandLayout(mapId = currentMapId) {
  if (!isPrototypeIslandMap(mapId)) return null;

  const isWestHalf = mapId === PROTOTYPE_ISLAND_WEST_MAP_ID;
  const main = {
    x: 200,
    y: 130,
    width: isWestHalf ? 600 : 300,
    height: 300
  };

  const eastBridge = {
    x: main.x + main.width,
    y: 266,
    width: 78,
    height: 28
  };

  const westBridge =
    mapId === PROTOTYPE_ISLAND_MAP_ID
      ? {
          x: 122,
          y: 266,
          width: 78,
          height: 28
        }
      : null;

  const walkableRects = [main];
  if (westBridge) walkableRects.push(westBridge);
  walkableRects.push(eastBridge);

  return {
    main,
    eastBridge,
    westBridge,
    walkableRects
  };
}

function prototypeIslandWalkableRects(mapId = currentMapId) {
  const layout = getPrototypeIslandLayout(mapId);
  if (!layout) return [];
  return layout.walkableRects || [];
}


function pointInPrototypeIslandWalkableArea(x, y) {
  const rects = prototypeIslandWalkableRects();
  if (!rects.length) return true;
  return rects.some(rect => pointInRect(x, y, rect));
}

function buildPrototypeIslandTopPath(camX, camY) {
  const rects = prototypeIslandWalkableRects();
  if (!rects.length) return null;

  const path = new Path2D();
  for (const rect of rects) {
    path.rect(
      Math.round(rect.x - camX),
      Math.round(rect.y - camY),
      Math.round(rect.width),
      Math.round(rect.height)
    );
  }
  return path;
}

function drawPrototypeIslandBackdrop() {
  ctx.fillStyle = "#090b09";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}


function prototypeIslandExposedBottomSegments() {
  const rects = prototypeIslandWalkableRects();
  const segments = [];

  for (const rect of rects) {
    const bottomY = rect.y + rect.height;
    let intervals = [[rect.x, rect.x + rect.width]];

    for (const other of rects) {
      if (other === rect) continue;

      const otherTop = other.y;
      const otherBottom = other.y + other.height;

      // If terrain already occupies space directly below this bottom edge,
      // that horizontal overlap is not an exposed south-facing face.
      if (otherTop <= bottomY && otherBottom > bottomY) {
        const cut = [other.x, other.x + other.width];
        intervals = intervals.flatMap(interval => subtractInterval(interval, cut));
      }
    }

    for (const [x1, x2] of intervals) {
      segments.push({ x: x1, y: bottomY, width: x2 - x1 });
    }
  }

  return segments;
}

function drawPrototypeIslandEarthFaces(camX, camY) {
  if (
    typeof drawTerrainSouthVoidFaces === "function" &&
    drawTerrainSouthVoidFaces(
      currentMapId,
      camX,
      camY,
      PROTOTYPE_ISLAND_FACE_DEPTH
    )
  ) {
    return;
  }

  // Legacy fallback retained until every island map is terrain-driven.
  const segments = prototypeIslandExposedBottomSegments();
  if (!segments.length) return;

  const depth = PROTOTYPE_ISLAND_FACE_DEPTH;

  ctx.save();
  ctx.fillStyle = "#8b5a3c";

  for (const segment of segments) {
    ctx.fillRect(
      Math.round(segment.x - camX),
      Math.round(segment.y - camY),
      Math.round(segment.width),
      depth
    );
  }

  ctx.fillStyle = "#5f3925";

  for (const segment of segments) {
    ctx.fillRect(
      Math.round(segment.x - camX),
      Math.round(segment.y - camY + depth),
      Math.round(segment.width),
      2
    );
  }

  ctx.restore();
}

function drawPrototypeIslandGroundLayer(camX, camY) {
  if (
    typeof drawTerrainMapTop === "function" &&
    drawTerrainMapTop(currentMapId, camX, camY)
  ) {
    if (typeof drawWaterfallGroveLandmark === "function") {
      drawWaterfallGroveLandmark(currentMapId, camX, camY);
    }

    // Player floors sit on top of the authored/generated terrain surface.
    // v379 only drew them on the legacy flat-ground path, which made placement
    // consume inventory without a visible floor on coordinate maps.
    drawPlayerStructureFloors(camX, camY);

    // Terrain owns the top surface (including dirt/water). Reflections are
    // layered into authored water before a light surface veil.
    drawPlayerReflection(camX, camY);

    if (onlineClient) {
      for (const remotePlayer of onlineClient.playersOnCurrentMap()) {
        drawRemotePlayerReflection(remotePlayer, camX, camY);
      }
    }

    if (typeof drawTerrainWaterSurfaceOverlay === "function") {
      drawTerrainWaterSurfaceOverlay(currentMapId, camX, camY);
    }

    if (typeof drawBeachTideOverlay === "function") {
      drawBeachTideOverlay(currentMapId, camX, camY);
    }

    for (const cloud of rainClouds) {
      drawRainCloudGround(cloud, camX, camY);
    }

    for (const house of houses) {
      drawHouseGround(house, camX, camY);
    }
    return;
  }

  const path = buildPrototypeIslandTopPath(camX, camY);
  if (!path) {
    drawGroundLayer(camX, camY);
    return;
  }

  ctx.save();
  ctx.clip(path);
  drawGroundLayer(camX, camY);
  ctx.restore();
}

function drawGroundLayer(camX, camY) {
  drawGround(camX, camY);
  drawPlayerStructureFloors(camX, camY);
  drawMapConnection(camX, camY);

  drawWaterBase(
    camX,
    camY
  );

  drawPlayerReflection(
    camX,
    camY
  );

  if (onlineClient) {
    for (
      const remotePlayer
      of onlineClient.playersOnCurrentMap()
    ) {
      drawRemotePlayerReflection(
        remotePlayer,
        camX,
        camY
      );
    }
  }

  drawWaterSurface(
    camX,
    camY
  );

  for (const cloud of rainClouds) {
    drawRainCloudGround(cloud, camX, camY);
  }

  for (const house of houses) {
    drawHouseGround(house, camX, camY);
  }
}

function addDrawable(drawables, y, draw) {
  drawables.push({ y, draw });
}

function buildWorldDrawables(camX, camY) {
  const drawables = [];

  addPlayerStructureDrawables(drawables, camX, camY);

  for (const tree of trees) {
    addDrawable(drawables, tree.y, () => drawTree(tree, camX, camY));
  }

  for (const house of houses) {
    addDrawable(drawables, house.y, () => drawHouse(house, camX, camY));
  }

  for (const rock of sceneryRocks) {
    addDrawable(
      drawables,
      rock.y - 0.2,
      () => drawSceneryRock(rock, camX, camY)
    );
  }

  for (const rock of rocks) {
    const carrier = rockCarrier(rock);
    const sortY = carrier
      ? carrier.y + 0.25
      : rock.y - 0.15;

    addDrawable(
      drawables,
      sortY,
      () => drawRock(rock, camX, camY)
    );
  }

  for (const snare of hunterSnareVisuals.values()) {
    if (snare.mapId !== currentMapId) continue;

    addDrawable(
      drawables,
      snare.y - 0.25,
      () => drawHunterSnare(snare, camX, camY)
    );
  }

  if (currentMapId === "spawn") {
    addDrawable(
      drawables,
      tutorialNpc.y,
      () =>
        drawTutorialNpc(
          camX,
          camY
        )
    );

    addDrawable(
      drawables,
      woodCraftBench.y,
      () =>
        drawWoodCraftBench(
          camX,
          camY
        )
    );

    addDrawable(
      drawables,
      classResetCrystal.y,
      () =>
        drawClassResetCrystal(
          camX,
          camY
        )
    );
  }

  if (currentMapId === "hunterHollow") {
    addDrawable(
      drawables,
      hunterNpc.y,
      () =>
        drawHunterNpc(
          camX,
          camY
        )
    );

    addDrawable(
      drawables,
      jesterNpc.y,
      () =>
        drawJesterNpc(
          camX,
          camY
        )
    );
  }

  for (const npc of placedNpcDefinitionsForMap(currentMapId)) {
    addDrawable(
      drawables,
      Number(npc.y) || 0,
      () => drawPlacedNpc(npc, camX, camY)
    );
  }

  for (const flower of harvestFlowers) {
    addDrawable(
      drawables,
      flower.y + 1,
      () => drawHarvestFlower(flower, camX, camY)
    );
  }

  for (const clump of tallGrass) {
    addDrawable(
      drawables,
      clump.y,
      () => drawTallGrass(clump, camX, camY)
    );
  }

  coins.forEach((coin, index) => {
    addDrawable(drawables, coin.y, () => {
      const bob = Math.round(
        Math.sin(worldTime * 5 + index * 1.3) * 1
      );
      const screenX = Math.round(coin.x - camX);
      const screenY = Math.round(coin.y - camY);

      ctx.fillStyle = "rgba(35, 52, 37, .28)";
      ctx.fillRect(screenX - 4, screenY + 1, 8, 2);

      // Native 16x16: this coin sprite was drawn specifically for world use.
      ctx.drawImage(
        coinImage,
        screenX - 8,
        screenY - 15 + bob
      );

    });
  });

  woodDrops.forEach((wood, index) => {
    addDrawable(
      drawables,
      wood.y,
      () => drawWoodDrop(wood, camX, camY, index)
    );
  });

  flowerDrops.forEach((flower, index) => {
    addDrawable(
      drawables,
      flower.y,
      () => drawFlowerDrop(flower, camX, camY, index)
    );
  });

  specialResourceDrops.forEach((drop, index) => {
    addDrawable(
      drawables,
      drop.y,
      () => drawSpecialResourceDrop(drop, camX, camY, index)
    );
  });

  lootPickupAnimations.forEach(pickup => {
    addDrawable(
      drawables,
      pickup.y,
      () => drawLootPickupAnimation(pickup, camX, camY)
    );
  });

  if (shouldRenderCurrentMapEnemies()) {
    for (
      const { enemy, profile }
      of activeEnemyRecords()
    ) {
      if (
        typeof profile.draw !== "function"
      ) {
        continue;
      }

      const sortY =
        typeof profile.drawSortY === "function"
          ? profile.drawSortY(enemy)
          : enemy.y;

      addDrawable(
        drawables,
        sortY,
        () => {
          profile.draw(
            enemy,
            camX,
            camY
          );
          if (
            !enemy.carriedBy &&
            (Number(enemy.hurlTime) || 0) <= 0 &&
            typeof drawTerrainWadingOverlay === "function"
          ) {
            drawTerrainWadingOverlay(
              enemy.x,
              enemy.y,
              camX,
              camY,
              {
                width: enemy.type === "crab" ? 24 : 14,
                depth: enemy.type === "ghost" ? 4 : 5,
                phase: enemy.phase || 0
              }
            );
          }
        }
      );
    }

    for (const effect of enemyDeathEffects) {
      if (effect.mapId && effect.mapId !== currentMapId) continue;

      addDrawable(
        drawables,
        effect.y + 0.1,
        () => drawEnemyDeathEffect(effect, camX, camY)
      );
    }
  }

  for (const projectile of basicProjectiles) {
    addDrawable(
      drawables,
      projectile.y,
      () => drawBasicProjectile(projectile, camX, camY)
    );
  }

  for (const fireball of fireballs) {
    addDrawable(
      drawables,
      fireball.y,
      () => drawFireball(fireball, camX, camY)
    );
  }


  for (const cloud of rainClouds) {
    addDrawable(
      drawables,
      cloud.y,
      () => drawRainCloud(cloud, camX, camY)
    );
  }

  const clone = getActiveJesterClone();

  if (clone) {
    addDrawable(
      drawables,
      clone.y,
      () => drawJesterClone(camX, camY)
    );
  }

  for (
    const remoteClone
    of remoteJesterClones
  ) {
    addDrawable(
      drawables,
      remoteClone.y,
      () => drawJesterCloneEntity(
        remoteClone,
        camX,
        camY
      )
    );
  }

  if (onlineClient) {
    for (const remotePlayer of onlineClient.playersOnCurrentMap()) {
      addDrawable(
        drawables,
        remotePlayer.y,
        () => {
          drawRemotePlayer(remotePlayer, camX, camY);
          if (typeof drawTerrainWadingOverlay === "function") {
            drawTerrainWadingOverlay(
              remotePlayer.x,
              remotePlayer.y,
              camX,
              camY,
              { width: 14, depth: 5, phase: 1.7 }
            );
          }
        }
      );
    }
  }

  if (!shouldSuppressLocalPlayerForMapTransition()) {
    addDrawable(
      drawables,
      player.y,
      () => {
        drawPlayer(camX, camY);
        if (typeof drawTerrainWadingOverlay === "function") {
          drawTerrainWadingOverlay(
            player.x,
            player.y,
            camX,
            camY,
            { width: 14, depth: 5, phase: 0.4 }
          );
        }
        drawPvpMarker(player, camX, camY);
      }
    );
  }

  return drawables;
}

function drawSortedWorldLayer(camX, camY) {
  const drawables = buildWorldDrawables(camX, camY);
  drawables.sort((a, b) => a.y - b.y);

  for (const drawable of drawables) {
    drawable.draw();
  }
}

function drawForegroundLayer(camX, camY) {
  drawFireLighting(camX, camY);

  if (typeof drawWaterfallGroveAtmosphere === "function") {
    drawWaterfallGroveAtmosphere(currentMapId, camX, camY);
  }

  drawJesterAfterimages(camX, camY);
  drawFireParticles(camX, camY);
  drawWandSweepParticles(camX, camY);
  drawGrowthParticles(camX, camY);
  drawShadowSmoke(camX, camY);
  drawJesterConfetti(camX, camY);
  drawLevelUpParticles(camX, camY);

  for (const opener of focusFireOpeners) {
    drawFocusFireOpener(opener, camX, camY);
  }

  drawFireballTargeting(camX, camY);
  drawFocusFireTargeting(camX, camY);
  drawFocusFireTargetMarker(camX, camY);
  drawCamouflageIndicator(camX, camY);
  drawRainCloudCastIndicator(camX, camY);
  drawHunterSnarePlacementIndicator(camX, camY);
  drawDamageNumbers(camX, camY);
  drawFloatingTexts(camX, camY);
  drawPotionUseEffects(camX, camY);
  drawInteractionPrompt(camX, camY);
}

class GameRenderer {
  constructor(gameState) {
    this.state = gameState;
  }

  render() {
    if (typeof beginNpcNameTagFrame === "function") {
      beginNpcNameTagFrame();
    }

    const camera = getCameraPosition();

    // At the enlarged mobile world scale, 54 px/s is about 0.9 logical pixels
    // per 60 Hz frame. A purely rounded camera therefore repeats occasional
    // frames and reads as judder. Render from the nearest whole-pixel camera,
    // then shift the complete world layer by its fractional remainder. This is
    // presentation-only: targeting continues to use the exact camera below.
    const useMobileSubpixelCamera = mobileControlsEnabled;
    const renderCamera = useMobileSubpixelCamera
      ? {
          x: Math.round(camera.x),
          y: Math.round(camera.y)
        }
      : camera;

    mobileCameraPresentationOffsetX = useMobileSubpixelCamera
      ? Math.round(
          (renderCamera.x - camera.x) * GAME_RENDER_SCALE
        ) / GAME_RENDER_SCALE
      : 0;
    mobileCameraPresentationOffsetY = useMobileSubpixelCamera
      ? Math.round(
          (renderCamera.y - camera.y) * GAME_RENDER_SCALE
        ) / GAME_RENDER_SCALE
      : 0;

    currentCamX = camera.x;
    currentCamY = camera.y;

    const usesTerrainBackdrop =
      isPrototypeIslandMap(currentMapId) ||
      isAuthoredTerrainMap(currentMapId);

    if (usesTerrainBackdrop) {
      drawPrototypeIslandBackdrop();
    } else if (useMobileSubpixelCamera) {
      // The fractional translation can uncover less than one logical pixel at
      // a canvas edge. Pre-fill it so no stale-frame seam can appear there.
      ctx.fillStyle = "#6f9f52";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.save();
    ctx.translate(
      mobileCameraPresentationOffsetX,
      mobileCameraPresentationOffsetY
    );

    if (usesTerrainBackdrop) {
      drawPrototypeIslandEarthFaces(renderCamera.x, renderCamera.y);
      drawPrototypeIslandGroundLayer(renderCamera.x, renderCamera.y);
      drawSortedWorldLayer(renderCamera.x, renderCamera.y);
      drawForegroundLayer(renderCamera.x, renderCamera.y);
    } else {
      drawGroundLayer(renderCamera.x, renderCamera.y);
      drawSortedWorldLayer(renderCamera.x, renderCamera.y);
      drawForegroundLayer(renderCamera.x, renderCamera.y);
    }

    ctx.restore();
    mobileCameraPresentationOffsetX = 0;
    mobileCameraPresentationOffsetY = 0;

    if (typeof endNpcNameTagFrame === "function") {
      endNpcNameTagFrame();
    }

    drawBuildPlacementPreview(renderCamera.x, renderCamera.y);
    drawMapTransitionCover();
  }
}

// -----------------------------------------------------------------------------
// GAME APP / SERVER-READY ARCHITECTURE
// -----------------------------------------------------------------------------
// Browser events -> InputController -> command queue -> GameSimulation
//                                        |
//                                        v
//                                     GameState
//                                        |
//                                        v
//                                   GameRenderer
//
// Later:
// CLIENT: InputController + GameRenderer
// SERVER: GameSimulation + authoritative GameState
class GameApp {
  constructor(simulation, renderer, online) {
    this.simulation = simulation;
    this.renderer = renderer;
    this.online = online;
    this.lastFrameTime = performance.now();
    this.loop = this.loop.bind(this);
  }

  start() {
    requestAnimationFrame(this.loop);
  }

  loop(now) {
    const dt = Math.min(
      0.033,
      (now - this.lastFrameTime) / 1000
    );

    this.lastFrameTime = now;

    this.simulation.update(dt);

    // Cooldown deadlines are wall-clock based; refresh only the lightweight
    // hotbar cooldown layer every frame so cast-time cooldowns are visible
    // immediately and continue counting down without requiring a menu refresh.
    if (typeof updateAbilityCooldownHud === "function") {
      updateAbilityCooldownHud();
    }

    if (this.online) {
      this.online.update(dt);
    }

    this.renderer.render();

    requestAnimationFrame(this.loop);
  }
}

console.log(
  "WORLD_CONTENT client registry:",
  {
    version: WORLD_CONTENT?.version,
    meadowGhosts:
      (WORLD_CONTENT?.maps?.meadow?.enemySpawns || [])
        .filter(spawn => spawn.type === "ghost")
        .map(spawn => spawn.id),
    ghostGroveGhosts:
      (WORLD_CONTENT?.maps?.ghostGrove?.enemySpawns || [])
        .filter(spawn => spawn.type === "ghost")
        .map(spawn => spawn.id)
  }
);

applySharedWorldContentToClientMaps();
assignPersistentEntityIds();
loadLocalCharacterState();

// Character progression/loadout persists, but map position intentionally does
// not. The map editor owns one global loading target; when none has been
// authored yet, preserve the historical Spawn Clearing center fallback.
const initialPlayerLoadTarget = sharedDefaultPlayerLoadTarget();
activateMap(initialPlayerLoadTarget.mapId, initialPlayerLoadTarget.spawnId);
updateHotbar();
updateInventoryUi();

const gameState = new GameState();

const gameSimulation = new GameSimulation(
  gameState,
  inputController
);

const gameRenderer = new GameRenderer(gameState);

onlineClient = new OnlineClient();
onlineClient.connect();

const gameApp = new GameApp(
  gameSimulation,
  gameRenderer,
  onlineClient
);

// Development hooks. The snapshot contains gameplay state only—no canvas
// objects—so it can also help when server synchronization is added.
window.gameState = gameState;
window.gameSimulation = gameSimulation;
window.onlineClient = onlineClient;

gameApp.start();
