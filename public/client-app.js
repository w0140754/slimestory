// Slime Story client simulation/render/bootstrap runtime — extracted verbatim from v240 game.js.


// -----------------------------------------------------------------------------

// UPDATE
// -----------------------------------------------------------------------------
function updateHudUi() {
  const mobileInteractButton = document.getElementById("mobileInteractButton");
  if (mobileInteractButton) {
    const interactionAvailable = Boolean(
      !player.isDead &&
      !shopOpen &&
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

  updateWorldClockHud();
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

function updateTransientSystems(dt) {
  updateEnemyPresentationEffects(dt);
  updateDamageNumbers(dt);
  updateFloatingTexts(dt);
  updatePotionUseEffects(dt);
  updateLevelUpParticles(dt);
  updateCoins(dt);
  updateWoodDrops(dt);
  updateFlowerDrops(dt);
  updateLootPickupAnimations(dt);
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

  tickTimer(player, "contactCooldown", dt);
  tickTimer(player, "wetTime", dt);

  if (
    typeof terrainEntityTouchesWater === "function" &&
    terrainEntityTouchesWater(player.x, player.y, currentMapId, 4)
  ) {
    applyLocalWetStatus(player, player.wetDuration || GAME_CONFIG.player.wetDuration);
  }

  // v419: map rain is deterministic on every client, so exposed players can
  // refresh their own Wet timer locally instead of waiting for repeated
  // server packets. This keeps Wet continuous for the entire time the player
  // remains outdoors in rain while preserving automatic-roof shelter.
  if (
    typeof currentMapIsRaining === "function" &&
    currentMapIsRaining() &&
    (typeof pointUnderAutomaticRoof !== "function" ||
      !pointUnderAutomaticRoof(player.x, player.y))
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

  if (player.actionCooldowns) {
    for (const actionId of Object.keys(player.actionCooldowns)) {
      const endAtMs = Number(player.actionCooldownEndTimes?.[actionId]) || 0;
      if (endAtMs > 0) {
        player.actionCooldowns[actionId] = Math.max(
          0,
          (endAtMs - Date.now()) / 1000
        );
      } else {
        player.actionCooldowns[actionId] = Math.max(
          0,
          (Number(player.actionCooldowns[actionId]) || 0) - dt
        );
      }
    }
  }

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
  // Drawing a bow uses the base rooted
  // behavior. Ordinary movement is unaffected.
  return player.bowDrawing ? 0 : 1;
}

function updatePlayerMovement(dt) {

  if (player.isDead) {
    player.walkTime = 0;
    player.wasMoving = false;

    // Stay exactly where death occurred until the Respawn button is clicked.
    return;
  }

  const movement = readMovementInput();
  const strafeMultiplier = bowStrafeMovementMultiplier();
  const canActuallyMove =
    !player.rainCloudCasting &&
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

    const moveSpeed =
      player.speed *
      strafeMultiplier *
      wetMovementMultiplier;

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

  // Enemy Wet from open water and deterministic map rain is derived locally
  // from the same authored world state the server uses. Refreshing the status
  // locally prevents the 3-second visual timer from expiring during a long
  // shower without adding a rain heartbeat or wetTime refresh stream.
  const mapRaining =
    typeof currentMapIsRaining === "function" && currentMapIsRaining();
  for (const { enemy } of activeEnemyRecords()) {
    if (!enemy?.alive || enemy.carriedBy || (Number(enemy.hurlTime) || 0) > 0) continue;
    const inWater =
      typeof terrainEntityTouchesWater === "function" &&
      terrainEntityTouchesWater(enemy.x, enemy.y, currentMapId, 4);
    const exposedToRain =
      mapRaining &&
      (typeof pointUnderAutomaticRoof !== "function" ||
        !pointUnderAutomaticRoof(enemy.x, enemy.y));
    if (inWater || exposedToRain) {
      applyLocalWetStatus(enemy, enemy.wetDuration || GAME_CONFIG.status.enemyWetDuration);
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
    // Wand actions are committed while aiming/casting.
    if (fireballIsAiming() || player.rainCloudCasting) return;

    const slotIndex =
      Number(command.payload.index);

    if (slotIndex < 0) {
      player.weaponIndex = -1;
    } else {
      selectHotbarSlot(slotIndex);
    }

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

    const modalInputBlocked = shopOpen || beachQuestOpen;

    worldTime += dt;
    this.state.advanceTick();

    // v422: Inventory and Craft are live overlays. Only focused modal dialogs
    // block local gameplay intent; the world remains fully playable under the
    // normal inventory/crafting workspace.
    if (modalInputBlocked) {
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

const TERRAIN_FACE_DEPTH = 10;

function drawTerrainBackdrop() {
  ctx.fillStyle = "#090b09";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTerrainEarthFaces(camX, camY) {
  if (typeof drawTerrainSouthVoidFaces === "function") {
    drawTerrainSouthVoidFaces(
      currentMapId,
      camX,
      camY,
      TERRAIN_FACE_DEPTH
    );
  }
}

function drawTerrainGroundLayer(camX, camY) {
  if (typeof drawTerrainMapTop !== "function") return;
  drawTerrainMapTop(currentMapId, camX, camY);

  if (typeof drawWaterfallGroveLandmark === "function") {
    drawWaterfallGroveLandmark(currentMapId, camX, camY);
  }

  drawPlayerStructureFloors(camX, camY);
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
    // Loose map rocks are no longer part of the retired carry/hurl system.
    // Sort them directly from their authored world position.
    addDrawable(
      drawables,
      rock.y - 0.15,
      () => drawRock(rock, camX, camY)
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

  drawFireParticles(camX, camY);
  drawGrowthParticles(camX, camY);
  drawLevelUpParticles(camX, camY);

  drawFireballTargeting(camX, camY);
  drawRainCloudCastIndicator(camX, camY);
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

    // v431: every active map is a coordinate-world terrain map.
    drawTerrainBackdrop();

    ctx.save();
    ctx.translate(
      mobileCameraPresentationOffsetX,
      mobileCameraPresentationOffsetY
    );

    drawTerrainEarthFaces(renderCamera.x, renderCamera.y);
    drawTerrainGroundLayer(renderCamera.x, renderCamera.y);
    drawSortedWorldLayer(renderCamera.x, renderCamera.y);
    drawAutomaticStructureRoofs(renderCamera.x, renderCamera.y);
    drawCloudShadows(renderCamera.x, renderCamera.y);
    drawForegroundLayer(renderCamera.x, renderCamera.y);

    ctx.restore();
    mobileCameraPresentationOffsetX = 0;
    mobileCameraPresentationOffsetY = 0;

    if (typeof endNpcNameTagFrame === "function") {
      endNpcNameTagFrame();
    }

    drawBuildPlacementPreview(renderCamera.x, renderCamera.y);
    drawWorldLightingOverlay();
    drawMapRainOverlay();
    drawPickaxeStructureTargetHighlight(renderCamera.x, renderCamera.y);
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

    // v424: nearby chests are local proximity-driven context targets. This
    // performs no polling: network traffic only occurs when the nearest chest
    // changes, the player explicitly switches context, or a stack is moved.
    if (typeof updateNearbyChestContext === "function") {
      updateNearbyChestContext();
    }

    // Cooldown deadlines are wall-clock based; refresh only the lightweight
    // item-action layer every frame. This never rewrites item image sources.
    if (typeof updateHotbarActionCooldownHud === "function") {
      updateHotbarActionCooldownHud();
    }

    // v420: recipe availability depends on live proximity to a portable
    // Crafting Table. Refresh only while the menu is open so walking into/out
    // of range immediately adds/removes workstation recipes without polling
    // the server or generating any network traffic.
    if (typeof craftingOpen !== "undefined" && craftingOpen && typeof updateCraftingUi === "function") {
      updateCraftingUi();
    }

    if (this.online) {
      this.online.update(dt);
    }

    this.renderer.render();

    requestAnimationFrame(this.loop);
  }
}

console.log(
  "WORLD_CONTENT coordinate registry:",
  {
    version: WORLD_CONTENT?.version,
    startMapId: WORLD_CONTENT?.worldGrid?.startMapId || null,
    mapCount: Object.keys(WORLD_CONTENT?.maps || {}).length
  }
);

applySharedWorldContentToClientMaps();
assignPersistentEntityIds();
loadLocalCharacterState();

// Character progression/loadout persists, but map position intentionally does
// not. The coordinate world owns the canonical loading target and defaults to
// the safe center cell.
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
