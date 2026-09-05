// Slime Story enemy foundation/presentation extraction.
// This file defines the builder only. game.js invokes it at the exact former
// inline location so asset setup, random initialization, and DOM wiring keep
// their original execution order.

function buildClientEnemyFoundation() {
  // -----------------------------------------------------------------------------
  // MONSTER
  // -----------------------------------------------------------------------------
  // User-drawn 16x16 slime sprite.
  const slimeImage = new Image();
  const blueSlimeImage = loadImage("assets/slime_blue_v1.png");
  const purpleSlimeImage = loadImage("assets/slime_purple_v1.png");
  const goldBabySlimeImage = loadImage("assets/gold_slime_baby_v1.png");

  const slimeFlashImage = new Image();
  const coinImage = new Image();
  coinImage.src = "./assets/coin_loot_v2.png";

  const arrowResourceImage = new Image();
  arrowResourceImage.src = "./assets/arrow_resource.png";

  const goldSlimeBubbleLootImage = loadImage("assets/big_gold_slime_bubble_loot_v1.png");

  const woodImage = new Image();
  woodImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAe0lEQVQ4T2NkoBAwwllkgkFmgJI4y3+42/CAey//wF0OZ4A0ZwZqMZy99pRBSpQHJowVbDjyFG4ImIBpfv76I4OkKD+cxgVA8jBD4AYE2EgzPHv9BWw7SDMvDxdMPQb4/OUbw/T111ANoMgFIEBRGMAARbFALhg1gIEBAEAwSRFp34JXAAAAEGRlQkc1OERFQTUyNzFDOURCMUM4CKL2nwAAAABJRU5ErkJgggAA";

  function makeFlowerIcon(type = "white") {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const fctx = c.getContext("2d");
    fctx.imageSmoothingEnabled = false;

    fctx.fillStyle = "#4f8e46";
    fctx.fillRect(7, 6, 2, 8);
    fctx.fillRect(5, 9, 2, 1);
    fctx.fillRect(9, 10, 2, 1);

    fctx.fillStyle = type === "blue" ? "#83b9f0" : "#f4bfdc";
    fctx.fillRect(6, 3, 2, 2);
    fctx.fillRect(8, 3, 2, 2);
    fctx.fillRect(5, 5, 2, 2);
    fctx.fillRect(9, 5, 2, 2);
    fctx.fillRect(7, 1, 2, 2);

    fctx.fillStyle = "#ffd760";
    fctx.fillRect(7, 4, 2, 2);

    return c.toDataURL("image/png");
  }

  const flowerImage = new Image();
  flowerImage.src = makeFlowerIcon("white");
  const blueFlowerImage = new Image();
  blueFlowerImage.src = makeFlowerIcon("blue");

  function makePotionIcon(color) {
    const c = document.createElement("canvas");
    c.width = 16; c.height = 16;
    const pctx = c.getContext("2d");
    pctx.imageSmoothingEnabled = false;
    pctx.fillStyle = "#d8cba0"; pctx.fillRect(6, 1, 4, 3);
    pctx.fillStyle = "#765d48"; pctx.fillRect(5, 4, 6, 2);
    pctx.fillStyle = "#e8e1cf"; pctx.fillRect(4, 6, 8, 8);
    pctx.fillStyle = color; pctx.fillRect(5, 9, 6, 4);
    pctx.fillStyle = "#ffffff"; pctx.fillRect(5, 7, 2, 2);
    return c.toDataURL("image/png");
  }
  const healingPotionImage = loadImage("assets/healing_potion_v2.png");
  const attackPotionImage = new Image(); attackPotionImage.src = "assets/attack_potion_v2.png?v=347";
  const magicPotionImage = new Image(); magicPotionImage.src = "assets/magic_potion_v2.png?v=347";


  // Inventory / equipment menu uses the exact same game sprites.
  document.getElementById("inventoryCoinImg").src = coinImage.src;
  document.getElementById("inventoryWoodImg").src = woodImage.src;
  const stoneInventoryImage = document.getElementById("inventoryStoneImg");
  if (stoneInventoryImage) stoneInventoryImage.src = rockLootableImage.src;
  document.getElementById("inventoryArrowImg").src = arrowResourceImage.src;
  document.getElementById("inventoryGoldSlimeBubbleImg").src = goldSlimeBubbleLootImage.src;
  document.getElementById("arrowHudImg").src = arrowResourceImage.src;
  document.getElementById("inventoryWhiteFlowerImg").src = flowerLootImage("white").src;
  document.getElementById("inventoryBlueFlowerImg").src = flowerLootImage("blue").src;
  document.getElementById("inventoryHealingPotionImg").src = healingPotionImage.src;
  document.getElementById("inventoryAttackPotionImg").src = attackPotionImage.src;
  document.getElementById("inventoryMagicPotionImg").src = magicPotionImage.src;
  const attackBuffHudImg = document.getElementById("attackBuffHudImg");
  if (attackBuffHudImg) attackBuffHudImg.src = attackPotionImage.src;
  const magicBuffHudImg = document.getElementById("magicBuffHudImg");
  if (magicBuffHudImg) magicBuffHudImg.src = magicPotionImage.src;
  document.getElementById("craftSwordWoodIcon").src = woodImage.src;
  document.getElementById("craftBowWoodIcon").src = woodImage.src;
  document.getElementById("craftArrowWoodIcon").src = woodImage.src;
  document.getElementById("craftArrowStoneIcon").src = rockLootableImage.src;
  document.getElementById("craftHealingWhiteIcon").src = flowerImage.src;
  document.getElementById("craftHealingBlueIcon").src = blueFlowerImage.src;
  document.getElementById("craftAttackWhiteIcon").src = flowerImage.src;
  document.getElementById("craftMagicBlueIcon").src = blueFlowerImage.src;
  document.getElementById("craftHealingPotionImg").src = healingPotionImage.src;
  document.getElementById("craftAttackPotionImg").src = attackPotionImage.src;
  document.getElementById("craftMagicPotionImg").src = magicPotionImage.src;
  document.getElementById("craftStaffWoodIcon").src = woodImage.src;
  document.getElementById("craftHelmWoodIcon").src = woodImage.src;
  document.getElementById("craftChestWoodIcon").src = woodImage.src;
  document.getElementById("craftGreavesWoodIcon").src = woodImage.src;
  document.getElementById("craftArrowsImg").src = arrowResourceImage.src;
  const craftWoodRingImg = document.getElementById("craftWoodRingImg");
  if (craftWoodRingImg) craftWoodRingImg.src = woodRingImage.src;
  const craftRingWoodIcon = document.getElementById("craftRingWoodIcon");
  if (craftRingWoodIcon) craftRingWoodIcon.src = woodImage.src;

  document.getElementById("inventorySwordImg").src = swordImage.src;
  document.getElementById("inventoryOldSwordImg").src = oldSwordImage.src;
  document.getElementById("inventoryBowImg").src = bowImage.src;
  document.getElementById("inventoryDreamcatcherImg").src = dreamcatcherBowImage.src;
  document.getElementById("inventoryKatanaImg").src = katanaImage.src;
  document.getElementById("inventoryAxeImg").src = axeImage.src;
  const inventoryPickaxeImg = document.getElementById("inventoryPickaxeImg");
  if (inventoryPickaxeImg) inventoryPickaxeImg.src = pickaxeImage.src;
  document.getElementById("inventoryWandImg").src = wandImage.src;
  document.getElementById("inventoryRainWandImg").src = rainWandImage.src;
  document.getElementById("inventoryShepherdStaffImg").src = shepherdStaffImage.src;
  document.getElementById("inventoryLostKeyImg").src = lostKeyWandImage.src;
  document.getElementById("inventoryHugeSunflowerImg").src = hugeSunflowerWandImage.src;
  document.getElementById("inventorySapgemWandImg").src = sapgemWandImage.src;
  document.getElementById("inventoryHatImg").src = sprite.hat.src;
  document.getElementById("inventoryCapImg").src = sprite.blueCap.src;
  document.getElementById("inventoryWizardHatImg").src = sprite.wizardHat.src;
  document.getElementById("inventoryBandanaHatImg").src = sprite.bandanaHat.src;
  document.getElementById("inventoryTravelerShirtImg").src = shirtImageForIndex(0).src;
  document.getElementById("inventoryTravelerPantsImg").src = pantsImageForIndex(0).src;
  document.getElementById("inventoryJesterHatImg").src = sprite.jesterHat.src;
  document.getElementById("inventoryJesterShirtImg").src = shirtImageForIndex(1).src;
  document.getElementById("inventoryJesterPantsImg").src = pantsImageForIndex(1).src;
  document.getElementById("inventoryNinjaHatImg").src = sprite.ninjaHat.src;
  document.getElementById("inventoryNinjaShirtImg").src = shirtImageForIndex(2).src;
  document.getElementById("inventoryNinjaPantsImg").src = pantsImageForIndex(2).src;
  document.getElementById("inventoryKnightHatImg").src = sprite.knightHat.src;
  document.getElementById("inventoryKnightShirtImg").src = shirtImageForIndex(3).src;
  document.getElementById("inventoryKnightPantsImg").src = pantsImageForIndex(3).src;
  document.getElementById("inventoryRangerHatImg").src = sprite.rangerHat.src;
  document.getElementById("inventoryRangerShirtImg").src = shirtImageForIndex(4).src;
  document.getElementById("inventoryRangerPantsImg").src = pantsImageForIndex(4).src;
  document.getElementById("inventoryWoodHatImg").src = sprite.woodHat.src;
  document.getElementById("inventoryWoodShirtImg").src = shirtImageForIndex(5).src;
  document.getElementById("inventoryWoodPantsImg").src = pantsImageForIndex(5).src;
  document.getElementById("inventoryArcanistHatImg").src = sprite.arcanistHat.src;
  document.getElementById("inventoryArcanistShirtImg").src = shirtImageForIndex(6).src;
  document.getElementById("inventoryArcanistPantsImg").src = pantsImageForIndex(6).src;
  document.getElementById("inventoryGreencapHatImg").src = sprite.greencapHat.src;
  document.getElementById("inventoryGreencapShirtImg").src = shirtImageForIndex(7).src;
  document.getElementById("inventoryGreencapPantsImg").src = pantsImageForIndex(7).src;

  document.getElementById("equipBaseHatImg").src = sprite.baseHat.src;
  document.getElementById("equipHatImg").src = sprite.hat.src;
  document.getElementById("equipCapImg").src = sprite.blueCap.src;
  document.getElementById("equipWizardHatImg").src = sprite.wizardHat.src;
  document.getElementById("equipJesterHatImg").src = sprite.jesterHat.src;
  document.getElementById("equipNinjaHatImg").src = sprite.ninjaHat.src;
  document.getElementById("equipKnightHatImg").src = sprite.knightHat.src;
  document.getElementById("equipBandanaHatImg").src = sprite.bandanaHat.src;
  document.getElementById("equipRangerHatImg").src = sprite.rangerHat.src;
  document.getElementById("equipWoodHatImg").src = sprite.woodHat.src;
  document.getElementById("equipArcanistHatImg").src = sprite.arcanistHat.src;
  document.getElementById("equipGreencapHatImg").src = sprite.greencapHat.src;
  document.getElementById("equipBaseShirtImg").src = shirtImageForIndex(-1).src;
  document.getElementById("equipTravelerShirtImg").src = shirtImageForIndex(0).src;
  document.getElementById("equipJesterShirtImg").src = shirtImageForIndex(1).src;
  document.getElementById("equipNinjaShirtImg").src = shirtImageForIndex(2).src;
  document.getElementById("equipKnightShirtImg").src = shirtImageForIndex(3).src;
  document.getElementById("equipRangerShirtImg").src = shirtImageForIndex(4).src;
  document.getElementById("equipWoodShirtImg").src = shirtImageForIndex(5).src;
  document.getElementById("equipArcanistShirtImg").src = shirtImageForIndex(6).src;
  document.getElementById("equipGreencapShirtImg").src = shirtImageForIndex(7).src;
  document.getElementById("equipBasePantsImg").src = pantsImageForIndex(-1).src;
  document.getElementById("equipTravelerPantsImg").src = pantsImageForIndex(0).src;
  document.getElementById("equipJesterPantsImg").src = pantsImageForIndex(1).src;
  document.getElementById("equipNinjaPantsImg").src = pantsImageForIndex(2).src;
  document.getElementById("equipKnightPantsImg").src = pantsImageForIndex(3).src;
  document.getElementById("equipRangerPantsImg").src = pantsImageForIndex(4).src;
  document.getElementById("equipWoodPantsImg").src = pantsImageForIndex(5).src;
  document.getElementById("equipArcanistPantsImg").src = pantsImageForIndex(6).src;
  document.getElementById("equipGreencapPantsImg").src = pantsImageForIndex(7).src;
  const equipBaseCharmImg = document.getElementById("equipBaseCharmImg");
  if (equipBaseCharmImg) equipBaseCharmImg.src = emptyCharmImage.src;
  const equipWoodRingImg = document.getElementById("equipWoodRingImg");
  if (equipWoodRingImg) equipWoodRingImg.src = woodRingImage.src;
  const inventoryWoodRingImg = document.getElementById("inventoryWoodRingImg");
  if (inventoryWoodRingImg) inventoryWoodRingImg.src = woodRingImage.src;

  slimeFlashImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVklEQVR4nO2TMQ4AIAgDhfj/L+OmoYApcbVjWy9CVMxsvGgWfkUVNLRxOM0QwMzjOloFLETR6EKyHbT0AQcQXhghwRt0ILuLIzAQ18l2cIOErPqN9DgLZicMIqXQ8kgAAAAASUVORK5CYII=";slimeImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAt0lEQVQ4T2NkoBAwwlmo4D+chQow1GMIgDTPvlbPcP7eCbgACBgqWTCkajWCmCh60A3AqhkGsBmCbMB/7wlaDPIqsnABbODhnccMWwuugZhgvTADwJpBgBgDQABmCPUNAAFchsA0gwBeA7bkX2XwmagN54MAuhiGAQaZogzS6qJgDkgS2UAQQBZ7evM1w4Xpr0FM6hkAAiiG4ALImuEEEsBrCLpmFAYSwGoINs0ggM0AEKAoM5EEAGibZRH6RFzgAAAAEGRlQkc4QTY1NkIwRTJBQzdBMDI0vGYFOwAAAABJRU5ErkJgggAA";

  function makeSlime(
    x,
    y,
    phase = 0,
    wanderRadiusX = 26,
    wanderRadiusY = 18,
    level = 1,
    options = {}
  ) {
    const variant = options.variant || "green";
    const aggressiveOnSight = Boolean(options.aggressiveOnSight);
    const startsDormant = Boolean(options.startsDormant);
    const maxHp =
      variant === "purple"
        ? 80
        : variant === "blue"
          ? 56
          : variant === "goldBaby"
            ? 64
            : 40;
    const speed = variant === "goldBaby" ? 21 : 16;
    const chaseSpeed = variant === "goldBaby" ? 30 : 22;

    return {
      level,
      variant,
      aggressiveOnSight,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      speed,
      chaseSpeed,
        wanderTargetX: x,
      wanderTargetY: y,
      wanderDecisionTime: 0,
      pauseTime: 0,
      wanderRadiusX,
      wanderRadiusY,
      phase,
      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,
      maxHp,
      hp: startsDormant ? 0 : maxHp,
      alive: !startsDormant,
      respawnTime: 0,

      // Fire debuff state.
      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  // Natural meadow slimes: one original stray, the original south-west trio,
  // two additional roaming patches of three, plus two extra strays.
  const slimes = [
    makeSlime(world.width / 2 - 55, world.height / 2 + 28, 0.0),
    makeSlime(82,  292, 0.9, 18, 13),
    makeSlime(112, 318, 2.2, 18, 13),
    makeSlime(143, 291, 4.1, 18, 13),

    // West-meadow patch.
    makeSlime(172, 124, 0.5, 20, 14),
    makeSlime(205, 138, 1.7, 20, 14),
    makeSlime(232, 121, 3.0, 20, 14),

    // East-meadow patch.
    makeSlime(444, 211, 0.8, 20, 14),
    makeSlime(474, 228, 2.4, 20, 14),
    makeSlime(506, 207, 4.0, 20, 14),

    // A couple of loners to make the map feel less arranged.
    makeSlime(330, 172, 1.3, 24, 17),
    makeSlime(455, 330, 3.6, 24, 17)
  ];

  // -----------------------------------------------------------------------------
  // SLEEPING MUSHROOM
  // -----------------------------------------------------------------------------
  // First mushroom-family enemy. It stays still/asleep while passive, wakes
  // into the annoyed sprite when combat/control motion begins, then returns to
  // its home point and falls asleep again after disengaging.
  const mushroomSleepImage = loadImage("assets/mushroom_sleep_v1.png?v=347");
  const mushroomAwakeImage = loadImage("assets/mushroom_awake_v1.png?v=347");
  const mushroomFlashImage = loadImage("assets/mushroom_flash_v1.png?v=347");

  function makeMushroom(
    x,
    y,
    phase = 0,
    level = 1
  ) {
    return {
      level,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      phase,

      speed: 16,
      chaseSpeed: 22,
      detectionRadius: 72,

      maxHp: 40,
      hp: 40,
      alive: true,
      respawnTime: 0,

      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,

      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  function updateMushrooms(dt) {
    for (
      const mushroom
      of currentEnemyCollection("mushroom")
    ) {
      tickTimer(mushroom, "hitFlash", dt);
      tickTimer(mushroom, "shakeTime", dt);
      tickReplicatedEnemyCountdowns(mushroom, dt);
      updateReplicatedEnemyPosition(mushroom, dt, 14);
    }
  }

  // -----------------------------------------------------------------------------
  // CRAB
  // -----------------------------------------------------------------------------
  // User-drawn 30x16 crab. Server AI supplies horizontal-biased scuttling;
  // the client adds only lightweight presentation motion.
  const crabImage = loadImage("assets/crab_v2.png?v=347");
  const crabBackImage = loadImage("assets/crab_back_v1.png?v=347");
  const crabFrontImage = loadImage("assets/crab_front_v1.png?v=347");

  function makeCrab(x, y, phase = 0, level = 2) {
    return {
      level,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      phase,
      speed: 15,
      chaseSpeed: 42,
      detectionRadius: 76,
      maxHp: 120,
      hp: 120,
      alive: true,
      respawnTime: 0,
      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,
      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  function updateCrabs(dt) {
    for (const crab of currentEnemyCollection("crab")) {
      tickTimer(crab, "hitFlash", dt);
      tickTimer(crab, "shakeTime", dt);
      tickReplicatedEnemyCountdowns(crab, dt);
      updateReplicatedEnemyPosition(crab, dt, 16);
    }
  }

  // -----------------------------------------------------------------------------
  // BIG GOLD SLIME
  // -----------------------------------------------------------------------------
  // Solitary elite hunter prey. The body and bubble are user-drawn; bounce,
  // squash/stretch, tether movement, and bubble secondary motion are code-driven.
  const bigGoldSlimeImage = loadImage("assets/big_gold_slime_v1.png");
  const bigGoldSlimeBubbleImage = loadImage("assets/big_gold_slime_bubble_v1.png");
  const icedCoffeeLootImage = loadImage("assets/iced_coffee.png?v=372");
  const woodFloorLootImage = loadImage("assets/ui/wood_floor.png?v=380");
  const woodWallLootImage = loadImage("assets/ui/wood_wall.png?v=380");
  const bigGoldSlimeFlashImage = new Image();

  // Generic special loot visuals. Wood and flowers keep their older dedicated
  // drop systems; future monster-specific materials can register here without
  // needing another bespoke pickup/render path.
  const specialResourceDrops = [];
  const SPECIAL_RESOURCE_DROP_PROFILES = Object.freeze({
    stone: Object.freeze({
      image: rockLootableImage,
      shadowWidth: 7
    }),
    goldSlimeBubble: Object.freeze({
      image: goldSlimeBubbleLootImage,
      shadowWidth: 7
    }),
    icedCoffee: Object.freeze({
      image: icedCoffeeLootImage,
      shadowWidth: 9,
      drawWidth: 20,
      drawHeight: 20
    }),
    woodFloor: Object.freeze({
      image: woodFloorLootImage,
      shadowWidth: 8
    }),
    woodWall: Object.freeze({
      image: woodWallLootImage,
      shadowWidth: 8
    })
  });

  const LOOT_PICKUP_RADIUS = 24;
  const lootPickupAnimations = [];

  function lootPickupImage(kind, options = {}) {
    if (kind === "coin") return coinImage;
    if (kind === "wood") return woodImage;
    if (kind === "flower") return flowerLootImage(options.flowerType || "white");
    return SPECIAL_RESOURCE_DROP_PROFILES[kind]?.image || null;
  }

  function spawnLootPickupAnimation(kind, x, y, options = {}) {
    const image = lootPickupImage(kind, options);
    if (!image || !Number.isFinite(x) || !Number.isFinite(y)) return;

    const seed = String(options.entityId || `${kind}:${x}:${y}`);
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }

    lootPickupAnimations.push({
      kind,
      image,
      x,
      y,
      age: 0,
      maxLife: 0.78,
      arcSign: (hash & 1) === 0 ? 1 : -1,
      arcStrength: 42 + Math.abs(hash % 15),
      alpha: 1
    });
  }

  function updateLootPickupAnimations(dt) {
    for (let i = lootPickupAnimations.length - 1; i >= 0; i--) {
      const pickup = lootPickupAnimations[i];
      pickup.age += dt;

      const targetX = player.x;
      const targetY = player.y - 11;
      const dx = targetX - pickup.x;
      const dy = targetY - pickup.y;
      const distance = Math.hypot(dx, dy);
      const progress = Math.max(0, Math.min(1, pickup.age / pickup.maxLife));

      if (distance <= 2.5 || pickup.age >= pickup.maxLife) {
        lootPickupAnimations.splice(i, 1);
        continue;
      }

      const invDistance = distance > 0.001 ? 1 / distance : 0;
      const dirX = dx * invDistance;
      const dirY = dy * invDistance;
      const perpX = -dirY;
      const perpY = dirX;

      // Accelerating homing motion with a fading sideways component. Because the
      // target is sampled every frame, the arc keeps bending toward a moving
      // player instead of flying toward the position where pickup began.
      const homingSpeed = 72 + 180 * progress * progress;
      const arcSpeed =
        pickup.arcSign *
        pickup.arcStrength *
        Math.sin(progress * Math.PI) *
        (1 - progress * 0.35);

      pickup.x += (dirX * homingSpeed + perpX * arcSpeed) * dt;
      pickup.y += (dirY * homingSpeed + perpY * arcSpeed) * dt;
      pickup.alpha = Math.max(0.08, 1 - progress * 0.92);
    }
  }

  function drawLootPickupAnimation(pickup, camX, camY) {
    const screenX = Math.round(pickup.x - camX);
    const screenY = Math.round(pickup.y - camY);
    const profile = SPECIAL_RESOURCE_DROP_PROFILES[pickup.kind];
    const drawWidth = profile?.drawWidth || 16;
    const drawHeight = profile?.drawHeight || 16;

    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, pickup.alpha));
    ctx.drawImage(
      pickup.image,
      screenX - Math.floor(drawWidth / 2),
      screenY - (drawHeight - 1),
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  function collectSpecialResourceDrops() {
    for (let i = specialResourceDrops.length - 1; i >= 0; i--) {
      const drop = specialResourceDrops[i];

      drop.pickupRequestCooldown = Math.max(
        0,
        (drop.pickupRequestCooldown || 0) - 1 / 60
      );

      const dx = player.x - drop.x;
      const dy = (player.y - 4) - drop.y;

      if (
        dx * dx + dy * dy <= LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS &&
        drop.pickupRequestCooldown <= 0 &&
        typeof onlineClient !== "undefined"
      ) {
        drop.pickupRequestCooldown = 0.25;
        onlineClient.requestResourcePickup(drop.entityId);
      }
    }
  }

  function drawSpecialResourceDrop(drop, camX, camY, index) {
    const profile = SPECIAL_RESOURCE_DROP_PROFILES[drop.kind];
    if (!profile?.image) return;

    const bob = Math.round(
      Math.sin(worldTime * 4.8 + index * 1.25) * 1
    );
    const screenX = Math.round(drop.x - camX);
    const screenY = Math.round(drop.y - camY);
    const shadowWidth = profile.shadowWidth || 7;
    const drawWidth = profile.drawWidth || 16;
    const drawHeight = profile.drawHeight || 16;

    ctx.fillStyle = "rgba(35, 52, 37, .28)";
    ctx.fillRect(
      screenX - Math.floor(shadowWidth / 2),
      screenY + 1,
      shadowWidth,
      2
    );

    ctx.drawImage(
      profile.image,
      screenX - Math.floor(drawWidth / 2),
      screenY - (drawHeight - 1) + bob,
      drawWidth,
      drawHeight
    );
  }

  bigGoldSlimeImage.addEventListener("load", () => {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const gctx = c.getContext("2d");
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(bigGoldSlimeImage, 0, 0);
    gctx.globalCompositeOperation = "source-in";
    gctx.fillStyle = "#ffffff";
    gctx.fillRect(0, 0, 24, 24);
    bigGoldSlimeFlashImage.src = c.toDataURL("image/png");
  });

  function makeBigGoldSlime(
    x,
    y,
    phase = 0,
    level = 4
  ) {
    return {
      level,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      phase,

      speed: 11,
      chaseSpeed: 28,
      detectionRadius: 96,
        confusionTime: 0,
      confusionTargetId: null,

      maxHp: 420,
      hp: 420,
      alive: true,
      respawnTime: 0,

      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,

      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  const ENEMY_ACTIVE_HANDOFF_MAX_CORRECTION_SPEED = 140;
  const ENEMY_ACTIVE_HANDOFF_DONE_DISTANCE = 1.5;
  const ENEMY_PASSIVE_SYNC_MAX_CORRECTION_SPEED = 70;
  const ENEMY_PASSIVE_SYNC_DONE_DISTANCE = 0.35;

  function updateReplicatedEnemyPosition(enemy, dt, activeBlendRate = 14) {
    if (enemy.networkMotionMode === "passive") {
      const targetX = Number(enemy.passiveWanderTargetX);
      const targetY = Number(enemy.passiveWanderTargetY);
      const anchorX = Number(
        Number.isFinite(enemy.passivePathAnchorX)
          ? enemy.passivePathAnchorX
          : enemy.passiveAuthoritativeX
      );
      const anchorY = Number(
        Number.isFinite(enemy.passivePathAnchorY)
          ? enemy.passivePathAnchorY
          : enemy.passiveAuthoritativeY
      );
      const speed = Math.max(0, Number(enemy.passiveWanderSpeed) || 0);

      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

      // A passive packet is a path plan: fresh authoritative anchor + latest
      // wander target. Genuine plans arrive on the next network tick rather than
      // waiting in a long batch. Reconstruct the expected point locally and
      // smoothly converge toward it instead of replaying server footsteps.
      let expectedX = targetX;
      let expectedY = targetY;

      if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
        const pathDx = targetX - anchorX;
        const pathDy = targetY - anchorY;
        const pathDistance = Math.hypot(pathDx, pathDy);
        const receivedAt = Number(enemy.passiveIntentReceivedAt) || performance.now();
        const planStartAt = Number(enemy.passivePlanStartAt) || receivedAt;
        const elapsedSeconds = Math.max(
          0,
          (performance.now() - planStartAt) / 1000
        );

        if (pathDistance > 0.001 && speed > 0) {
          const travelled = Math.min(
            pathDistance,
            speed * elapsedSeconds
          );
          expectedX = anchorX + (pathDx / pathDistance) * travelled;
          expectedY = anchorY + (pathDy / pathDistance) * travelled;
        } else {
          expectedX = anchorX;
          expectedY = anchorY;
        }
      }

      const dx = expectedX - enemy.x;
      const dy = expectedY - enemy.y;
      const distance = Math.hypot(dx, dy);

      if (distance > ENEMY_PASSIVE_SYNC_DONE_DISTANCE) {
        const maxStep = ENEMY_PASSIVE_SYNC_MAX_CORRECTION_SPEED * dt;
        const step = Math.min(distance, maxStep);
        enemy.x += (dx / distance) * step;
        enemy.y += (dy / distance) * step;

        if (Math.abs(dx) > 0.04) {
          enemy.dir = dx >= 0 ? 1 : -1;
        }
      }
      return;
    }

    const targetX = Number(enemy.serverTargetX);
    const targetY = Number(enemy.serverTargetY);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const receivedAt = Number(enemy.serverMotionReceivedAt) || 0;
    const sampleAgeSeconds = receivedAt > 0
      ? Math.max(0, (performance.now() - receivedAt) / 1000)
      : 0;
    const extrapolationSeconds = Math.min(0.14, sampleAgeSeconds);
    const sampleFresh = sampleAgeSeconds <= 0.28;
    const velocityX = sampleFresh ? Number(enemy.serverVelocityX) || 0 : 0;
    const velocityY = sampleFresh ? Number(enemy.serverVelocityY) || 0 : 0;
    const expectedX = targetX + velocityX * extrapolationSeconds;
    const expectedY = targetY + velocityY * extrapolationSeconds;

    const dx = expectedX - enemy.x;
    const dy = expectedY - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (Math.abs(velocityX) > 0.5) {
      enemy.dir = velocityX >= 0 ? 1 : -1;
    }

    if (enemy.activeMotionHandoff && distance > ENEMY_ACTIVE_HANDOFF_DONE_DISTANCE) {
      // Passive -> precise is intentionally a visual reconciliation, never a
      // teleport. The server is already authoritative for combat; this simply
      // lets the rendered mob converge to that truth while it is still outside
      // immediate contact range.
      const step = Math.min(
        distance,
        ENEMY_ACTIVE_HANDOFF_MAX_CORRECTION_SPEED * dt
      );
      enemy.x += (dx / distance) * step;
      enemy.y += (dy / distance) * step;
      return;
    }

    enemy.activeMotionHandoff = false;
    const blend = 1 - Math.exp(-activeBlendRate * dt);
    enemy.x += dx * blend;
    enemy.y += dy * blend;
  }

  const REPLICATED_ENEMY_COUNTDOWN_FIELDS = Object.freeze([
    "confusionTime",
    "burnTime",
    "respawnTime",
    "pickupTime",
    "hurlTime",
    "snareRootTime",
    "snareSlowTime",
    "wetTime"
  ]);

  const REPLICATED_ENEMY_COUNTDOWN_FIELD_SET = new Set(
    REPLICATED_ENEMY_COUNTDOWN_FIELDS
  );

  function setReplicatedEnemyCountdown(enemy, key, remainingSeconds) {
    const remaining = Math.max(0, Number(remainingSeconds) || 0);
    const previous = Math.max(0, Number(enemy?.[key]) || 0);
    enemy[key] = remaining;

    if (key === "burnTime") {
      if (remaining > 0 && previous <= 0) {
        enemy.burnVisualTickTimer = 0.5;
      } else if (remaining <= 0) {
        enemy.burnVisualTickTimer = 0;
      }
    }

    if (!enemy.networkCountdownEndsAtMs) {
      enemy.networkCountdownEndsAtMs = Object.create(null);
    }

    enemy.networkCountdownEndsAtMs[key] =
      remaining > 0
        ? Date.now() + remaining * 1000
        : 0;
  }

  function applyReplicatedEnemyCountdownsFromState(enemy, state) {
    for (const key of REPLICATED_ENEMY_COUNTDOWN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        setReplicatedEnemyCountdown(enemy, key, state[key]);
      }
    }
  }

  function tickReplicatedEnemyCountdowns(enemy, dt) {
    const now = Date.now();

    if (enemy?.alive && (Number(enemy.burnTime) || 0) > 0) {
      enemy.burnVisualTickTimer =
        (Number(enemy.burnVisualTickTimer) || 0.5) - dt;
      while (enemy.burnVisualTickTimer <= 0 && (Number(enemy.burnTime) || 0) > 0) {
        // Client enemies are tagged with networkMapId (not mapId). The old
        // v253 check therefore suppressed every simulated Burn tick number.
        // This remains presentation-only: authoritative HP still comes from
        // the server's batched enemyStateDelta stream.
        if (naturalEnemyBelongsToCurrentMap(enemy)) {
          spawnDamageNumber(
            enemy.x,
            enemy.y - 24,
            Math.max(1, Math.round(Number(enemy.burnDamagePerTick) || 2)),
            { duration: 0.42 }
          );
        }
        enemy.burnVisualTickTimer += 0.5;
      }
    }

    for (const key of REPLICATED_ENEMY_COUNTDOWN_FIELDS) {
      const endsAt = Number(enemy.networkCountdownEndsAtMs?.[key]) || 0;

      if (endsAt > 0) {
        const remaining = Math.max(0, (endsAt - now) / 1000);
        enemy[key] = remaining;

        if (remaining <= 0) {
          enemy.networkCountdownEndsAtMs[key] = 0;
        }
        continue;
      }

      // Backward/offline fallback for locally-created values that did not come
      // from an authoritative network timer event.
      if ((Number(enemy[key]) || 0) > 0) {
        enemy[key] = Math.max(0, Number(enemy[key]) - dt);
      }
    }
  }

  function updateBigGoldSlimes(dt) {
    for (
      const slime
      of currentEnemyCollection("bigGoldSlime")
    ) {
      tickTimer(slime, "hitFlash", dt);
      tickTimer(slime, "shakeTime", dt);
      tickReplicatedEnemyCountdowns(slime, dt);

      updateReplicatedEnemyPosition(slime, dt, 12);

    }
  }

  function drawBigGoldSlimeHealthBar(slime, screenX, screenY) {
    const maxHp = Math.max(1, Number(slime.maxHp) || 1);
    const hp = Math.max(0, Math.min(maxHp, Number(slime.hp) || 0));
    const ratio = hp / maxHp;
    const width = 44;
    const height = 3;
    const x = Math.round(screenX - width / 2);
    const y = Math.round(screenY - 48);
    const enraged = ratio <= 0.5 && hp > 0;

    ctx.fillStyle = "#17140e";
    ctx.fillRect(x - 1, y - 1, width + 2, height + 2);

    ctx.fillStyle = "#3a3020";
    ctx.fillRect(x, y, width, height);

    const fillWidth = Math.round(width * ratio);

    if (fillWidth > 0) {
      ctx.fillStyle = enraged
        ? "#d45532"
        : "#d7a92f";
      ctx.fillRect(x, y, fillWidth, height);

      ctx.fillStyle = enraged
        ? "#f28b58"
        : "#f4d76f";
      ctx.fillRect(x, y, fillWidth, 1);
    }

  }

  function drawBigGoldSlime(slime, camX, camY) {
    if (!slime.alive) return;

    let screenX = Math.round(slime.x - camX);
    const screenY = Math.round(slime.y - camY);

    if (slime.shakeTime > 0) {
      screenX +=
        Math.sin(slime.shakeTime * 115) > 0
          ? 2
          : -2;
    }

    // Slower and heavier than the starter slimes. Once enraged, the same
    // squash/stretch cycle speeds up to visually match the faster chase phase.
    const enraged =
      slime.hp > 0 &&
      slime.hp <= slime.maxHp * 0.5;
    const animationRate = enraged ? 1.55 : 1;
    const animationTime = worldTime * animationRate;
    const bounceBase =
      Math.sin(animationTime * 3.8 + slime.phase) * 0.5 + 0.5;
    const hopWave = Math.pow(bounceBase, 1.75);
    const hopHeight = Math.round(hopWave * 5);

    // Keep the heavy landing squash, but move through the widest pose quickly
    // instead of parking there around the sine-wave trough.
    const landingSquashRaw = Math.max(
      0,
      Math.min(1, (0.30 - hopWave) / 0.30)
    );
    const landingSquash = Math.pow(landingSquashRaw, 2.35);

    const airStretchRaw = Math.max(
      0,
      Math.min(1, (hopWave - 0.74) / 0.26)
    );
    const airStretch = Math.pow(airStretchRaw, 1.35);

    let drawWidth =
      24 +
      Math.round(3 * landingSquash) -
      Math.round(1 * airStretch);

    let drawHeight =
      24 -
      Math.round(2 * landingSquash) +
      Math.round(2 * airStretch);

    const spawnScale = enemySpawnScale(slime);
    drawWidth = Math.max(1, Math.round(drawWidth * spawnScale.x));
    drawHeight = Math.max(1, Math.round(drawHeight * spawnScale.y));

    const shadowWidth =
      Math.round(20 - hopWave * 7);
    const shadowAlpha =
      0.46 - hopWave * 0.16;

    if (!(typeof terrainEntityIsWading === "function" && terrainEntityIsWading(slime.x, slime.y))) {
      ctx.fillStyle = `rgba(38, 47, 28, ${shadowAlpha})`;
      ctx.fillRect(Math.round(screenX - shadowWidth / 2), screenY, shadowWidth, 4);
    }

    const drawX =
      Math.round(screenX - drawWidth / 2);
    const drawY =
      Math.round(screenY - hopHeight - drawHeight + 1);

    // The bubble behaves like a light mass tethered to the slime's crown.
    // It sways independently and overshoots the body's bounce slightly.
    const tetherAnchorX = screenX;
    const tetherAnchorY = drawY + 3;
    const bubbleSway =
      Math.round(
        Math.sin(animationTime * 2.65 + slime.phase * 1.7) * 3
      );
    const bubbleBob =
      Math.round(
        Math.cos(animationTime * 3.25 + slime.phase) * 2
        - hopWave * 3
      );
    const bubbleCenterX =
      tetherAnchorX + bubbleSway;
    const bubbleCenterY =
      tetherAnchorY - 13 + bubbleBob;

    ctx.save();
    ctx.globalAlpha *= spawnScale.alpha;
    ctx.drawImage(
      bigGoldSlimeImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();

    if (slime.hitFlash > 0 && bigGoldSlimeFlashImage.src) {
      ctx.save();
      ctx.globalAlpha = 0.66;
      ctx.drawImage(
        bigGoldSlimeFlashImage,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );
      ctx.restore();
    }

    // The tether belongs visually in front of the slime body but behind the
    // floating bubble, so it reads as attached rather than disappearing into it.
    drawPixelLine(
      tetherAnchorX,
      tetherAnchorY,
      bubbleCenterX,
      bubbleCenterY + 3,
      "#8d7748"
    );

    // Bubble art has transparent padding, so these offsets line up its visible
    // 9x9 orb with the code-driven tether endpoint.
    ctx.drawImage(
      bigGoldSlimeBubbleImage,
      Math.round(bubbleCenterX - 10),
      Math.round(bubbleCenterY - 11)
    );

    if (slime.burnTime > 0) {
      drawPixelFlame(
        Math.round(screenX - 6),
        Math.round(drawY + 8),
        slime.phase + 0.8
      );
      drawPixelFlame(
        Math.round(screenX + 6),
        Math.round(drawY + 10),
        slime.phase + 3.1
      );
    }

    if ((Number(slime.wetTime) || 0) > 0) {
      drawWetStatus(
        screenX,
        Math.round(screenY - hopHeight - 4),
        slime.wetTime,
        slime.wetDuration || GAME_CONFIG.status.enemyWetDuration
      );
    }

    drawBigGoldSlimeHealthBar(
      slime,
      screenX,
      screenY
    );
  }

  // -----------------------------------------------------------------------------
  // GOBLIN
  // -----------------------------------------------------------------------------
  // Player-drawn 16x24 goblin. The sprite is intentionally kept intact;
  // movement is given life with code-driven bobbing, sway, and a short lunge.
  const goblinImage = new Image();
  goblinImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAYCAYAAADzoH0MAAABYElEQVQ4T2NkoBAwwllkAmQD/pNgIFwtTMP/uOUmDIsiz0C5CHEojcJHUsuIYgAMwAyCiaHzQQDdABD479KswCClIgIXwAae3XnDsKf2AYiJ4gUYABvy5sU7hqOtkgzW1c/BgjC2iIQQimYUBhJA8Q4ygDkbxgcBbAaAAIYh2DSDAIYAFKCEB7q/kQGGABSADUAGpBjwvyTCAMx45c8CpsU2/mG4oP0BqyHoBoBtLpJNZLh38zJcUEldl2HfjvVYDcEwABR4ET99UQyAgVN6DzACE6sBIEUgbygoqoAFQS7wSqhHScIQ5agGYCTnqmA5MLtt7SOsyRhOIAG4C2CaYQBmCD4XwMD/BHthBikRbrgADIAMQdeDbgDcG1CbwABm4LM3XxkWHHwLEsLpAnQDYPJgV0E1gwDpBoAIQmGAEQvIBuCSQ1EAyjQwgJbiUPIGKJPBDEFxAZwFAchyIIBVHgAoTawZMqsQxwAAABBkZUJHRUE3NjhFQjhFQkYzM0Q1NnhkJG4AAAAASUVORK5CYIIA";

  const goblinFlashImage = new Image();
  goblinImage.addEventListener("load", () => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 24;
    const gctx = c.getContext("2d");
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(goblinImage, 0, 0);
    gctx.globalCompositeOperation = "source-in";
    gctx.fillStyle = "#ffffff";
    gctx.fillRect(0, 0, 16, 24);
    goblinFlashImage.src = c.toDataURL("image/png");
  });

  function makeGoblin(
    x,
    y,
    phase = 0,
    level = 3
  ) {
    return {
      level,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      phase,

      speed: 20,
      chaseSpeed: 34,
      detectionRadius: 90,
  

      wanderTargetX: x,
      wanderTargetY: y,
      wanderDecisionTime: 0,
      pauseTime: 0,
      wanderRadiusX: 24,
      wanderRadiusY: 18,

      maxHp: 270,
      hp: 270,
      alive: true,
      respawnTime: 0,

      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,

      // Static-sprite animation state.
      moving: false,
      walkTime: phase,

      // Short melee lunge.
      attackCooldown: 0.25 + Math.random() * 0.35,
      lungeTime: 0,
      lungeDuration: 0.20,
      lungeDirX: 0,
      lungeDirY: 0,
      attackHit: false,

      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  // A few scattered goblins so they feel like a new enemy type, not a swarm.
  const goblins = [
    makeGoblin(190, 110, 0.4),
    makeGoblin(455, 205, 2.0),
    makeGoblin(340, 350, 4.1)
  ];

  // -----------------------------------------------------------------------------
  // SPOOKY GHOST
  // -----------------------------------------------------------------------------
  // Player-drawn 16x24 ghost. Its world position is still its feet/base, so
  // taller art works with the same Y-sorting rule as the player and trees.
  const ghostImage = new Image();
  ghostImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAYCAYAAADzoH0MAAABD0lEQVQ4T72UsQ3CMBBFnSIbQCQioVBDyQBUFCxBwxxUzEHDEhRUDEAJNQgpSIENUgT9i8+yL3YUIYVXYPt893SxLSIVpjKzmsjMLHxBKlysV7wmzocjT50aKai48P0qdKhmOEpo1CJT1xBMl3Oa3E4XHaoR8XYBkvZpqnZxTMFtWapNnpPkf4JJlummau6PR/cOwK9nAIxEIouBFFTJbGwWPorrE4O3A3oDuP9P7r4BZpAm9B7st+AIQq1L7E/pR4AEKbNjvQjo9HHCSGoTYORc1BsBNnH62EACTtxG7nEXjgAgURYz9l5Q0JWGwNd2CP6c/gRIAG1rKQDOTQBx4nSNdrH5seC/ctOZHkNr9QUbT8gZyX9L1wAAABBkZUJHNzJGMjU2QjcxREVBOUMwM48vXdMAAAAASUVORK5CYIIA";

  const ghostFlashImage = new Image();
  ghostImage.addEventListener("load", () => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 24;
    const gctx = c.getContext("2d");
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(ghostImage, 0, 0);
    gctx.globalCompositeOperation = "source-in";
    gctx.fillStyle = "#ffffff";
    gctx.fillRect(0, 0, 16, 24);
    ghostFlashImage.src = c.toDataURL("image/png");
  });

  function makeGhost(
    x,
    y,
    phase = 0,
    level = 5
  ) {
    return {
      level,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: 1,
      phase,

      speed: 10,
      chaseSpeed: 32,
      detectionRadius: 110,
  
      // Server target ownership now decides whether the ghost is engaged.

      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 0.8 + Math.random() * 1.2,

      maxHp: 150,
      hp: 150,
      alive: true,
      respawnTime: 0,

      hitFlash: 0,
      shakeTime: 0,
      knockbackX: 0,
      knockbackY: 0,

      burnTime: 0,
      burnDuration: 3.0,
      burnTickTimer: 0,
      burnTickInterval: 0.5,
      burnDamagePerTick: 2
    };
  }

  // Active-map ghost collection. Natural ghosts are populated exclusively
  // from shared WORLD_CONTENT for the current map.
  const ghosts = [];



  return {
    slimeImage,
    blueSlimeImage,
    purpleSlimeImage,
    goldBabySlimeImage,
    slimeFlashImage,
    coinImage,
    arrowResourceImage,
    goldSlimeBubbleLootImage,
    woodImage,
    makeFlowerIcon,
    flowerImage,
    blueFlowerImage,
    healingPotionImage,
    attackPotionImage,
    magicPotionImage,
    makeSlime,
    slimes,
    mushroomSleepImage,
    mushroomAwakeImage,
    mushroomFlashImage,
    crabImage,
    crabBackImage,
    crabFrontImage,
    makeMushroom,
    updateMushrooms,
    makeCrab,
    updateCrabs,
    bigGoldSlimeImage,
    bigGoldSlimeBubbleImage,
    bigGoldSlimeFlashImage,
    specialResourceDrops,
    SPECIAL_RESOURCE_DROP_PROFILES,
    LOOT_PICKUP_RADIUS,
    lootPickupAnimations,
    lootPickupImage,
    spawnLootPickupAnimation,
    updateLootPickupAnimations,
    drawLootPickupAnimation,
    collectSpecialResourceDrops,
    drawSpecialResourceDrop,
    makeBigGoldSlime,
    ENEMY_ACTIVE_HANDOFF_MAX_CORRECTION_SPEED,
    ENEMY_ACTIVE_HANDOFF_DONE_DISTANCE,
    ENEMY_PASSIVE_SYNC_MAX_CORRECTION_SPEED,
    ENEMY_PASSIVE_SYNC_DONE_DISTANCE,
    updateReplicatedEnemyPosition,
    REPLICATED_ENEMY_COUNTDOWN_FIELDS,
    REPLICATED_ENEMY_COUNTDOWN_FIELD_SET,
    setReplicatedEnemyCountdown,
    applyReplicatedEnemyCountdownsFromState,
    tickReplicatedEnemyCountdowns,
    updateBigGoldSlimes,
    drawBigGoldSlimeHealthBar,
    drawBigGoldSlime,
    goblinImage,
    goblinFlashImage,
    makeGoblin,
    goblins,
    ghostImage,
    ghostFlashImage,
    makeGhost,
    ghosts
  };
}
