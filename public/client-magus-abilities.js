// Slime Story client Magus/Jester ability implementations.
// Extracted from game.js in v6-11-235 with function bodies preserved verbatim.
// Classic-script semantics are intentional: these functions resolve shared runtime
// bindings from game.js at invocation time, after initialization has completed.

function spawnFireballImpactBurst(x, y) {
  // Keep the AoE readable without making the impact look larger than the
  // actual 30px Burn-splash area. This is intentionally a tighter, shorter
  // pulse than v269's flare.
  const ringCount = 14;

  for (let i = 0; i < ringCount; i++) {
    const angle =
      (Math.PI * 2 * i) / ringCount +
      (Math.random() - 0.5) * 0.12;
    const speed = 68 + Math.random() * 18;

    spawnFireParticle(
      x + Math.cos(angle) * (3 + Math.random() * 2),
      y + Math.sin(angle) * (3 + Math.random() * 2),
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 2,
      0.20 + Math.random() * 0.05
    );
  }

  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 16 + Math.random() * 22;
    spawnFireParticle(
      x + (Math.random() - 0.5) * 4,
      y + (Math.random() - 0.5) * 3,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 4,
      0.18 + Math.random() * 0.08
    );
  }
}

function spawnRemoteFireballImpact(
  ownerId,
  payload
) {
  const x = Number(payload.x) || 0;
  const y = Number(payload.y) || 0;

  removeClosestRemoteProjectile(
    fireballs,
    ownerId,
    x,
    y
  );

  // Match the small impact burst the caster sees.
  spawnFireballImpactBurst(x, y);
}

function castFireballToPoint(targetX, targetY) {
  const originX = player.x;
  const originY = player.y - 8;
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);
  const startDistance = 11;
  const startX = originX + Math.cos(angle) * startDistance;
  const startY = originY + Math.sin(angle) * startDistance;
  const travelDistance = Math.hypot(targetX - startX, targetY - startY);
  const duration = Math.max(0.30, Math.min(0.78, travelDistance / 205));
  const arcHeight = Math.min(44, 13 + travelDistance * 0.19);

  const fireball = {
    x: startX,
    y: startY,
    startX,
    startY,
    targetX,
    targetY,
    elapsed: 0,
    duration,
    arcHeight,
    airborne: true,
    angle,
    vx: Math.cos(angle) * 138,
    vy: Math.sin(angle) * 138,
    life: duration + 0.20,
    trailTimer: 0
  };

  fireballs.push(fireball);

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "fireball",
      {
        x: fireball.x,
        y: fireball.y,
        vx: fireball.vx,
        vy: fireball.vy,
        life: fireball.life,
        airborne: true,
        startX,
        startY,
        targetX,
        targetY,
        duration,
        arcHeight
      }
    );
  }
}

function getActiveRainCloud() {
  for (let i = rainClouds.length - 1; i >= 0; i--) {
    const cloud = rainClouds[i];

    const remaining = Number.isFinite(Number(cloud.expiresAtMs))
      ? Math.max(0, (Number(cloud.expiresAtMs) - Date.now()) / 1000)
      : Number(cloud.life) || 0;

    if (
      remaining > 0 &&
      !cloud.visualOnly
    ) {
      cloud.life = remaining;
      return cloud;
    }
  }

  return null;
}

function fireballIsAiming() {
  return Boolean(player.fireballAiming);
}

function fireballAimProgress() {
  const time = Math.max(0, Number(player.fireballAimTime) || 0);
  return (time % FIREBALL_AIM_PULSE_DURATION) / FIREBALL_AIM_PULSE_DURATION;
}

function fireballAimRadius() {
  const progress = fireballAimProgress();
  return FIREBALL_AIM_MIN_RANGE +
    (FIREBALL_AIM_MAX_RANGE - FIREBALL_AIM_MIN_RANGE) * progress;
}

function fireballLandingPoint() {
  const target = getCurrentWorldMouseTarget();
  let dx = target.x - player.x;
  let dy = target.y - (player.y - 8);
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;

  const radius = fireballAimRadius();

  return {
    x: clampToWorld(player.x + dx * radius, 5, world.width - 5),
    y: clampToWorld((player.y - 8) + dy * radius, 5, world.height - 5),
    angle: Math.atan2(dy, dx),
    radius
  };
}

function clearFireballChargeState() {
  player.fireballAiming = false;
  player.fireballAimTime = 0;
  player.fireballBoundKey = null;
  player.fireballAimMapId = null;
  player.fireballTargetX = null;
  player.fireballTargetY = null;
  player.fireballTargetAngle = null;
}

function cancelFireballAim() {
  if (!player.fireballAiming) return false;

  clearFireballChargeState();

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function beginFireballAim(boundKey = null) {
  if (!isAbilityUnlocked("fireball")) return false;

  if (!isWandTypeWeapon()) {
    showWandRequiredMessage();
    return true;
  }

  if (skillIsOnCooldown("fireball")) {
    showSkillCooldownMessage("fireball");
    return true;
  }

  if (player.fireballAiming) return true;
  if (focusFireIsCasting()) return true;

  breakShadowHide();
  player.fireballAiming = true;
  player.fireballAimTime = 0;
  player.fireballBoundKey = boundKey;
  player.fireballAimMapId = currentMapId;
  player.fireballTargetX = null;
  player.fireballTargetY = null;
  player.fireballTargetAngle = null;

  const target = getCurrentWorldMouseTarget();
  aimPlayerTowardPoint(target.x, target.y);

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function releaseFireballAim() {
  if (!player.fireballAiming) return false;

  if (currentMapId !== player.fireballAimMapId) {
    cancelFireballAim();
    return true;
  }

  const landing = fireballLandingPoint();

  clearFireballChargeState();
  player.attackAimAngle = landing.angle;
  player.attackHand = Math.cos(landing.angle) >= 0 ? "right" : "left";
  player.attackTime = Math.max(player.attackTime, 0.10);
  player.attackCooldown = Math.max(player.attackCooldown, 0.20);

  castFireballToPoint(landing.x, landing.y);
  startSkillCooldown("fireball");

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function updateFireballAim(dt) {
  if (!player.fireballAiming) return;

  if (player.isDead || currentMapId !== player.fireballAimMapId) {
    cancelFireballAim();
    return;
  }

  player.fireballAimTime += dt;
  const target = getCurrentWorldMouseTarget();
  aimPlayerTowardPoint(target.x, target.y);
}

function resetRainCloudOrbit(cloud, centerX, centerY, angle = null) {
  if (!cloud) return;

  cloud.orbitCenterX = centerX;
  cloud.orbitCenterY = centerY;
  cloud.orbitElapsed = 0;
  cloud.orbitRadius = 0;

  if (Number.isFinite(angle)) {
    cloud.orbitAngle = angle;
  } else if (!Number.isFinite(cloud.orbitAngle)) {
    cloud.orbitAngle = 0;
  }

  cloud.targetX = centerX;
  cloud.targetY = centerY;
}

function resolveRainCloudCastTarget(targetX, targetY) {
  const originX = player.x;
  const originY = player.y - 8;
  const maxRange = 80;

  let dx = Number(targetX) - originX;
  let dy = Number(targetY) - originY;
  const distance = Math.hypot(dx, dy) || 1;

  if (distance > maxRange) {
    const scale = maxRange / distance;
    targetX = originX + dx * scale;
    targetY = originY + dy * scale;
  }

  targetX = clampToWorld(Number(targetX), 6, world.width - 6);
  targetY = clampToWorld(Number(targetY), 10, world.height - 4);

  const mapDefinition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  if (TERRAIN_RULES?.terrainDefinition(mapDefinition)) {
    const resolved = TERRAIN_RULES.clampSegmentToNonVoid(
      mapDefinition,
      player.x,
      player.y,
      targetX,
      targetY
    );
    targetX = resolved.x;
    targetY = resolved.y;
  }

  return { x: targetX, y: targetY };
}

function castRainOrb(targetX, targetY) {
  const originX = player.x;
  const originY = player.y - 8;
  const resolvedTarget = resolveRainCloudCastTarget(targetX, targetY);
  targetX = resolvedTarget.x;
  targetY = resolvedTarget.y;

  const grassPatchId = ++rainGrassPatchSequence;
  const fieldStartedAtMs = Date.now();
  const initialOrbitAngle = Math.random() * Math.PI * 2;

  spawnTemporaryRainGrassField(
    targetX,
    targetY,
    grassPatchId,
    {
      ownerId: localRainGrassOwnerId(),
      startedAtMs: fieldStartedAtMs,
      serverControlled:
        typeof onlineClient !== "undefined" && Boolean(onlineClient?.connected)
    }
  );

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "rainCast",
      {
        startX: originX,
        startY: originY,
        targetX,
        targetY,
        followPlayer: false,
        retarget: false,
        cloudLife: getRainCloudLifetime(),
        orbitAngle: initialOrbitAngle,
        patchId: grassPatchId,
        instant: true
      }
    );
  }

  // Replace only this client's gameplay cloud. Remote players' visual-only
  // clouds share this array and must survive when the local player casts.
  for (let i = rainClouds.length - 1; i >= 0; i--) {
    if (!rainClouds[i]?.visualOnly) {
      rainClouds.splice(i, 1);
    }
  }

  spawnRainCloud(
    targetX,
    targetY,
    false,
    {
      life: getRainCloudLifetime(),
      orbitAngle: initialOrbitAngle,
      grassPatchId,
      startedAtMs: fieldStartedAtMs
    }
  );
}

function endLocalRainCloud({ startCooldown = true, cooldownStartedAtMs = Date.now() } = {}) {
  let removedCloud = false;
  let resolvedCooldownStartMs = Number(cooldownStartedAtMs) || Date.now();
  const nowMs = Date.now();

  for (let i = rainClouds.length - 1; i >= 0; i--) {
    const cloud = rainClouds[i];
    if (cloud?.visualOnly) continue;

    removedCloud = true;
    const expiresAtMs = Number(cloud.expiresAtMs) || 0;
    const remaining = expiresAtMs > 0
      ? Math.max(0, (expiresAtMs - nowMs) / 1000)
      : Math.max(0, Number(cloud.life) || 0);

    // Leaving/death ends a still-active cloud immediately, so cooldown begins
    // now. If the object merely remained stale while the tab was backgrounded,
    // preserve the true natural expiry time so the hidden time also counts.
    if (remaining <= 0 && expiresAtMs > 0) {
      resolvedCooldownStartMs = Math.min(resolvedCooldownStartMs, expiresAtMs);
    }

    rainClouds.splice(i, 1);
  }

  if (removedCloud && startCooldown) {
    startSkillCooldown("rainCloud", null, resolvedCooldownStartMs);
  }

  return removedCloud;
}

function cancelRainCloudCast() {
  if (!player.rainCloudCasting) return false;

  player.rainCloudCasting = false;
  player.rainCloudCastTime = 0;
  player.rainCloudCastMapId = null;
  player.rainCloudCastTargetX = null;
  player.rainCloudCastTargetY = null;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function beginRainCloudCast() {
  if (!isAbilityUnlocked("rainCloud")) return false;

  if (!isWandTypeWeapon()) {
    showWandRequiredMessage();
    return true;
  }

  if (skillIsOnCooldown("rainCloud")) {
    showSkillCooldownMessage("rainCloud");
    return true;
  }

  if (getActiveRainCloud()) {
    spawnFloatingText(
      player.x,
      player.y - 31,
      "CLOUD ACTIVE",
      "#b9d9ce",
      0.65
    );
    return true;
  }

  if (player.rainCloudCasting) return true;
  if (focusFireIsCasting() || fireballIsAiming()) return true;

  breakShadowHide();

  const mouseTarget = getCurrentWorldMouseTarget();
  const target = resolveRainCloudCastTarget(mouseTarget.x, mouseTarget.y);

  player.rainCloudCasting = true;
  player.rainCloudCastTime = 0;
  player.rainCloudCastMapId = currentMapId;
  player.rainCloudCastTargetX = target.x;
  player.rainCloudCastTargetY = target.y;

  aimPlayerTowardPoint(target.x, target.y);

  // A summon is a committed pose. Gameplay inputs are ignored while this
  // state is active, but held movement keys may resume naturally afterward.

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function updateRainCloudCast(dt) {
  if (!player.rainCloudCasting) return;

  if (
    player.isDead ||
    currentMapId !== player.rainCloudCastMapId ||
    getActiveRainCloud()
  ) {
    cancelRainCloudCast();
    return;
  }

  const targetX = Number(player.rainCloudCastTargetX);
  const targetY = Number(player.rainCloudCastTargetY);

  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    cancelRainCloudCast();
    return;
  }

  // Face the snapshotted summon point for the whole ritual. Moving the mouse
  // after the initial button press deliberately does not retarget the cloud.
  aimPlayerTowardPoint(targetX, targetY);

  player.rainCloudCastTime = Math.min(
    player.rainCloudCastDuration,
    player.rainCloudCastTime + dt
  );

  if (player.rainCloudCastTime < player.rainCloudCastDuration) return;

  player.rainCloudCasting = false;
  player.rainCloudCastTime = 0;
  player.rainCloudCastMapId = null;
  player.rainCloudCastTargetX = null;
  player.rainCloudCastTargetY = null;

  castRainOrb(targetX, targetY);

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.sendLocalState(true);
  }
}

function spawnRainCloud(
  x,
  y,
  followPlayer = false,
  options = {}
) {
  const life = Number.isFinite(options.life)
    ? options.life
    : getRainCloudLifetime();
  const remainingLife = Number.isFinite(Number(options.remainingLife))
    ? Math.max(0, Math.min(life, Number(options.remainingLife)))
    : life;

  const startedAtMs = Number.isFinite(Number(options.startedAtMs))
    ? Number(options.startedAtMs)
    : Date.now();
  const expiresAtMs = Number.isFinite(Number(options.expiresAtMs))
    ? Number(options.expiresAtMs)
    : startedAtMs + life * 1000;

  rainClouds.push({
    x,
    y,
    targetX: x,
    targetY: y,
    moveSpeed: 22,
    followPlayer,
    startedAtMs,
    expiresAtMs,
    lastWallClockUpdateMs: startedAtMs,

    // The cloud slowly paints the battlefield on its own. Its orbit begins
    // tight around the cast point, then expands until it reaches a broad loop.
    orbitCenterX: Number.isFinite(Number(options.orbitCenterX))
      ? Number(options.orbitCenterX)
      : x,
    orbitCenterY: Number.isFinite(Number(options.orbitCenterY))
      ? Number(options.orbitCenterY)
      : y,
    orbitAngle: Number.isFinite(options.orbitAngle)
      ? options.orbitAngle
      : 0,
    initialOrbitAngle: Number.isFinite(options.initialOrbitAngle)
      ? options.initialOrbitAngle
      : Number.isFinite(options.orbitAngle)
        ? options.orbitAngle
        : 0,
    orbitElapsed: Number.isFinite(Number(options.orbitElapsed))
      ? Math.max(0, Number(options.orbitElapsed))
      : 0,
    orbitRadius: Number.isFinite(Number(options.orbitRadius))
      ? Math.max(0, Number(options.orbitRadius))
      : 0,
    orbitMaxRadius: RAIN_CLOUD_ORBIT_MAX_RADIUS,
    orbitExpandTime: RAIN_CLOUD_ORBIT_EXPAND_TIME,
    orbitAngularSpeed: RAIN_CLOUD_ORBIT_ANGULAR_SPEED,
    grassPatchId: Number(options.grassPatchId) || 0,
    life: remainingLife,
    maxLife: life,

    visualOnly: Boolean(options.visualOnly),
    ownerId: options.ownerId || null,
    cooldownStarted: false,

    // After the rain ends, keep the cloud around briefly so it can
    // drift upward and fade away instead of disappearing instantly.
    fadeTime: 0.70,
    maxFadeTime: 0.70,

    pulseTimer: 0,
    pulseInterval: 0.32,
    // Rain also affects creatures on a slower, readable tick:
    // Rain Cloud only affects creatures offensively now: living enemies are
    // unaffected, while ghosts are harmed.
    creatureTimer: 0,
    creatureInterval: 0.48,

    // Rain steadily builds a dense patch of temporary, flammable grass.
    // The first tuft waits a moment so the cloud visually settles before the
    // ground starts changing underneath it.
    grassGrowTimer: 0.65,
    grassGrowInterval: 0.32,

    radius: 24
  });
}

function removeRemoteJesterForOwner(ownerId) {
  for (
    let i = remoteJesterClones.length - 1;
    i >= 0;
    i--
  ) {
    if (
      remoteJesterClones[i].ownerId ===
      ownerId
    ) {
      remoteJesterClones.splice(i, 1);
    }
  }
}

function removeRemoteRainForOwner(ownerId) {
  // Mirror the local one-cloud-per-caster rule. Remove both active/fading
  // clouds and any older orb that is still travelling.
  for (
    let i = rainClouds.length - 1;
    i >= 0;
    i--
  ) {
    const cloud = rainClouds[i];

    if (
      cloud.visualOnly &&
      cloud.ownerId === ownerId
    ) {
      rainClouds.splice(i, 1);
    }
  }
}

function spawnRemoteRainCast(
  ownerId,
  payload
) {
  const targetX = Number(payload.targetX) || 0;
  const targetY = Number(payload.targetY) || 0;
  const followPlayer = Boolean(payload.followPlayer);
  const cloudLife = Math.max(4, Number(payload.cloudLife) || 12);
  const orbitAngle = Number.isFinite(Number(payload.orbitAngle))
    ? Number(payload.orbitAngle)
    : 0;
  const receivedAtMs = Date.now();
  const isSnapshot = Boolean(payload.snapshot);

  const activeRemoteCloud =
    rainClouds.find(cloud =>
      cloud.visualOnly &&
      cloud.ownerId === ownerId &&
      cloud.life > 0
    ) || null;

  if (payload.retarget && activeRemoteCloud) {
    // Mirror the caster: keep the existing cloud and let its normal movement
    // system drift it toward the new target. No rain missile and no teleport.
    activeRemoteCloud.followPlayer = followPlayer;
    resetRainCloudOrbit(
      activeRemoteCloud,
      targetX,
      targetY,
      activeRemoteCloud.orbitAngle
    );
    activeRemoteCloud.life = Math.max(
      activeRemoteCloud.life,
      activeRemoteCloud.maxLife * 0.85
    );
    activeRemoteCloud.fadeTime = activeRemoteCloud.maxFadeTime;
    return;
  }

  removeRemoteRainForOwner(ownerId);

  if (isSnapshot) {
    const totalLife = Math.max(4, Number(payload.totalLife) || cloudLife);
    const remainingLife = Math.max(0.05, Math.min(
      totalLife,
      Number(payload.remainingLife) || totalLife
    ));
    const orbitElapsed = Math.max(0, Number(payload.orbitElapsed) || 0);
    const currentOrbitAngle = Number.isFinite(Number(payload.orbitAngle))
      ? Number(payload.orbitAngle)
      : 0;
    const initialOrbitAngle =
      currentOrbitAngle - RAIN_CLOUD_ORBIT_ANGULAR_SPEED * orbitElapsed;
    const cloudX = Number.isFinite(Number(payload.x))
      ? Number(payload.x)
      : targetX;
    const cloudY = Number.isFinite(Number(payload.y))
      ? Number(payload.y)
      : targetY;

    spawnRainCloud(
      cloudX,
      cloudY,
      false,
      {
        visualOnly: true,
        ownerId,
        life: totalLife,
        remainingLife,
        orbitAngle: currentOrbitAngle,
        initialOrbitAngle,
        orbitElapsed,
        orbitRadius: Number(payload.orbitRadius) || 0,
        orbitCenterX: Number(payload.orbitCenterX),
        orbitCenterY: Number(payload.orbitCenterY),
        grassPatchId: Number(payload.patchId) || 0,
        startedAtMs: receivedAtMs - orbitElapsed * 1000,
        expiresAtMs: receivedAtMs + remainingLife * 1000
      }
    );
    return;
  }

  spawnRainCloud(
    targetX,
    targetY,
    followPlayer,
    {
      visualOnly: true,
      ownerId,
      life: cloudLife,
      orbitAngle,
      grassPatchId: Number(payload.patchId) || 0,
      startedAtMs: receivedAtMs,
      expiresAtMs: receivedAtMs + cloudLife * 1000
    }
  );

  const patchId = Number(payload.patchId) || 0;
  if (patchId > 0) {
    spawnTemporaryRainGrassField(
      targetX,
      targetY,
      patchId,
      {
        ownerId,
        startedAtMs: receivedAtMs,
        serverControlled: true
      }
    );
  }
}

function applyRainCloud(cloud) {
  const radius = cloud.radius;

  const serverOwnsRainGameplay =
    typeof onlineClient !== "undefined" && Boolean(onlineClient?.connected);

  if (serverOwnsRainGameplay) {
    // The server owns Wet, ghost rain damage, grass state, and environment
    // extinguishing online. Keep only immediate local projectile suppression.
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const fireball = fireballs[i];
      if (fireball.visualOnly) continue;
      const dx = fireball.x - cloud.x;
      const dy = fireball.y - cloud.y;
      if (dx * dx + dy * dy <= (radius - 2) * (radius - 2)) {
        fireballs.splice(i, 1);
      }
    }
    return;
  }

  growTemporaryRainGrass(cloud);

  // Rain-grown grass is client-temporary, so the server cannot extinguish it.
  // Handle it locally on every rain pulse so magic grass obeys the same fire
  // rule as ordinary vegetation.
  for (const clump of tallGrass) {
    if (!isTemporaryRainGrass(clump) || clump.burnTime <= 0) continue;

    const dx = clump.x - cloud.x;
    const dy = (clump.y - 5) - cloud.y;

    if (dx * dx + dy * dy <= radius * radius) {
      clump.burnTime = 0;
      clump.burnExpiresAtMs = 0;
      // Online authoritative state is echoed by the server; this is only an
      // immediate local visual prediction.
    }
  }

  const sharedEnvironmentRain =
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected;

  if (!sharedEnvironmentRain) {
  for (const clump of tallGrass) {
    const dx = clump.x - cloud.x;
    const dy = (clump.y - 5) - cloud.y;

    if (dx * dx + dy * dy > radius * radius) continue;

    // Rain extinguishes any actively burning grass under the cloud.
    if (clump.burnTime > 0) {
      clump.burnTime = 0;
    }
  }

  for (const flower of harvestFlowers) {
    const dx = flower.x - cloud.x;
    const dy = (flower.y - 8) - cloud.y;

    if (dx * dx + dy * dy > radius * radius) continue;

    if (flower.burnTime > 0) {
      sootheHarvestFlower(flower);
    }
  }

  for (const tree of trees) {
    if (tree.isStump || tree.falling) continue;

    const dx = tree.x - cloud.x;
    const dy = (tree.y - 18) - cloud.y;

    if (dx * dx + dy * dy > (radius + 10) * (radius + 10)) continue;

    // Rain can save a canopy that is still burning, but once the canopy
    // has burned away it stays gone.
    if (tree.canopyBurnTime > 0) {
      tree.canopyBurnTime = 0;
    }
  }
  }

  const creatureTick = cloud.creatureTimer <= 0;
  let affectedCreatureThisTick = false;

  for (
    const { enemy, profile }
    of activeEnemyRecords({ aliveOnly: true })
  ) {
    const body = enemyBodyPoint(enemy);
    const inset = profile.rainRadiusInset ?? 2;
    const dx = body.x - cloud.x;
    const dy = body.y - cloud.y;
    const hitRadius = Math.max(1, radius - inset);
    const inside =
      dx * dx + dy * dy <=
      hitRadius * hitRadius;

    if (!inside) continue;

    const standingInBurningRainGrass =
      isNearBurningTemporaryRainGrass(body.x, body.y, 14);

    if (profile.rainEffect === "damage") {
      // Spectral creatures remain the exception: rain damages them rather than
      // applying Wet. Ordinary rain still extinguishes their burn.
      if (enemy.burnTime > 0 && !standingInBurningRainGrass) {
        extinguishEnemy(enemy);
      }

      if (!creatureTick) continue;

      sendEnemyAction(
        enemy,
        "rainDamage",
        { power: GAME_CONFIG.rainCloud.ghostDamage }
      );

      affectedCreatureThisTick = true;
      continue;
    }

    // Living enemies now share the same Wet status rule as the player. Wet
    // extinguishes Burn, prevents ordinary re-ignition, and slows movement.
    applyLocalWetStatus(
      enemy,
      GAME_CONFIG.status.enemyWetDuration
    );

    if (creatureTick) {
      sendEnemyAction(
        enemy,
        "wet",
        { duration: GAME_CONFIG.status.enemyWetDuration }
      );
      affectedCreatureThisTick = true;
    }

  }

  if (creatureTick && affectedCreatureThisTick) {
    cloud.creatureTimer = cloud.creatureInterval;
  }

  const pdx = player.x - cloud.x;
  const pdy = (player.y - 8) - cloud.y;
  const playerInside = pdx * pdx + pdy * pdy <= (radius - 1) * (radius - 1);

  if (playerInside) {
    const standingInBurningRainGrass =
      isNearBurningTemporaryRainGrass(player.x, player.y - 8, 12);

    if (standingInBurningRainGrass) {
      // Direct flame contact boils off Wet instead of allowing the rain to
      // erase the grass combo on the same pulse.
      player.wetTime = 0;
    } else {
      applyWetStatus();
    }

    if (player.burnTime > 0 && !standingInBurningRainGrass) {
      extinguishPlayer();
    }

  }

  // Rain also snuffs out active fireballs that pass into the shower.
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fireball = fireballs[i];

    if (fireball.visualOnly) {
      continue;
    }

    const dx = fireball.x - cloud.x;
    const dy = fireball.y - cloud.y;

    if (dx * dx + dy * dy <= (radius - 2) * (radius - 2)) {
      fireballs.splice(i, 1);
    }
  }
}

function updateRainWetPrediction() {
  const activeClouds = rainClouds.filter(cloud => cloud && cloud.life > 0);
  if (activeClouds.length === 0) return;

  const coveredByRain = (x, y, inset = 0) => {
    for (const cloud of activeClouds) {
      const radius = Math.max(1, (Number(cloud.radius) || 24) - inset);
      const dx = x - cloud.x;
      const dy = y - cloud.y;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  };

  // Local player: immediate movement/status feel while the server independently
  // owns the authoritative Wet/Burn state.
  if (!player.isDead && (Number(player.hp) || 0) > 0) {
    const px = player.x;
    const py = player.y - 8;
    if (coveredByRain(px, py, 1)) {
      if (isNearBurningTemporaryRainGrass(px, py, 12)) {
        player.wetTime = 0;
      } else {
        applyWetStatus();
        if (player.burnTime > 0) extinguishPlayer();
      }
    }
  }

  // Living enemies and remote players can derive the same rain geometry
  // locally, so their Wet visuals never need periodic network refreshes either.
  for (const { enemy, profile } of activeEnemyRecords({ aliveOnly: true })) {
    if (profile?.rainEffect === "damage") continue;
    const body = enemyBodyPoint(enemy);
    if (!coveredByRain(body.x, body.y, profile?.rainRadiusInset ?? 2)) continue;

    if (isNearBurningTemporaryRainGrass(body.x, body.y, 14)) {
      enemy.wetTime = 0;
    } else {
      applyLocalWetStatus(enemy, GAME_CONFIG.status.enemyWetDuration);
    }
  }

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected &&
    typeof onlineClient.playersOnCurrentMap === "function"
  ) {
    for (const remote of onlineClient.playersOnCurrentMap()) {
      if (remote?.isDead || (Number(remote?.hp) || 0) <= 0) continue;
      const rx = Number(remote.x) || 0;
      const ry = (Number(remote.y) || 0) - 8;
      if (!coveredByRain(rx, ry, 1)) continue;

      if (isNearBurningTemporaryRainGrass(rx, ry, 12)) {
        remote.wetTime = 0;
      } else {
        applyLocalWetStatus(remote, GAME_CONFIG.player.wetDuration);
      }
    }
  }
}

function updateRainMagic(dt) {
  for (let i = rainClouds.length - 1; i >= 0; i--) {
    const cloud = rainClouds[i];

    if (cloud.life > 0) {
      const nowMs = Date.now();
      const previousWallClockUpdateMs = Number(cloud.lastWallClockUpdateMs) || nowMs;
      const wallClockGap = Math.max(0, (nowMs - previousWallClockUpdateMs) / 1000);
      cloud.lastWallClockUpdateMs = nowMs;

      if (Number.isFinite(Number(cloud.startedAtMs))) {
        const wallClockAge = Math.max(
          0,
          Math.min(
            Number(cloud.maxLife) || 0,
            (nowMs - Number(cloud.startedAtMs)) / 1000
          )
        );
        cloud.orbitElapsed = wallClockAge;
        cloud.orbitAngle =
          (Number(cloud.initialOrbitAngle) || 0) +
          (Number(cloud.orbitAngularSpeed) || RAIN_CLOUD_ORBIT_ANGULAR_SPEED) * wallClockAge;
      } else {
        cloud.orbitElapsed =
          (Number(cloud.orbitElapsed) || 0) + dt;
        cloud.orbitAngle =
          (Number(cloud.orbitAngle) || 0) +
          (Number(cloud.orbitAngularSpeed) || RAIN_CLOUD_ORBIT_ANGULAR_SPEED) * dt;
      }

      const expandTime = Math.max(
        0.01,
        Number(cloud.orbitExpandTime) || RAIN_CLOUD_ORBIT_EXPAND_TIME
      );
      const orbitProgress = Math.max(
        0,
        Math.min(1, cloud.orbitElapsed / expandTime)
      );
      // Smoothstep keeps the first few seconds subtle, then opens into a wider
      // loop that naturally spreads the temporary grass across a broad patch.
      const easedOrbit = orbitProgress * orbitProgress * (3 - 2 * orbitProgress);
      cloud.orbitRadius =
        (Number(cloud.orbitMaxRadius) || RAIN_CLOUD_ORBIT_MAX_RADIUS) * easedOrbit;

      const orbitCenterX = Number.isFinite(cloud.orbitCenterX)
        ? cloud.orbitCenterX
        : cloud.x;
      const orbitCenterY = Number.isFinite(cloud.orbitCenterY)
        ? cloud.orbitCenterY
        : cloud.y;

      let orbitTargetX = clampToWorld(
        orbitCenterX + Math.cos(cloud.orbitAngle) * cloud.orbitRadius,
        6,
        world.width - 6
      );
      let orbitTargetY = clampToWorld(
        orbitCenterY + Math.sin(cloud.orbitAngle) * cloud.orbitRadius * 0.72,
        10,
        world.height - 4
      );

      const mapDefinition = WORLD_CONTENT?.maps?.[currentMapId] || null;
      if (TERRAIN_RULES?.terrainDefinition(mapDefinition)) {
        const resolvedOrbitTarget = TERRAIN_RULES.clampSegmentToNonVoid(
          mapDefinition,
          cloud.x,
          cloud.y,
          orbitTargetX,
          orbitTargetY
        );
        orbitTargetX = resolvedOrbitTarget.x;
        orbitTargetY = resolvedOrbitTarget.y;
      }

      cloud.targetX = orbitTargetX;
      cloud.targetY = orbitTargetY;

      const moveDx = cloud.targetX - cloud.x;
      const moveDy = cloud.targetY - cloud.y;
      const moveDist = Math.hypot(moveDx, moveDy);

      if (wallClockGap > 0.25) {
        // Returning from a throttled/background tab should resume at the
        // cloud's current orbit position, not visibly chase several seconds
        // of missed client frames.
        cloud.x = cloud.targetX;
        cloud.y = cloud.targetY;
      } else if (moveDist > 0.25) {
        const step = Math.min(moveDist, cloud.moveSpeed * dt);
        cloud.x += moveDx / moveDist * step;
        cloud.y += moveDy / moveDist * step;
      } else {
        cloud.x = cloud.targetX;
        cloud.y = cloud.targetY;
      }

      if (Number.isFinite(Number(cloud.expiresAtMs))) {
        cloud.life = Math.max(
          0,
          (Number(cloud.expiresAtMs) - Date.now()) / 1000
        );
      } else {
        cloud.life -= dt;
      }
      cloud.pulseTimer -= dt;
      cloud.creatureTimer -= dt;
      cloud.grassGrowTimer = Math.max(
        0,
        (Number(cloud.grassGrowTimer) || 0) - dt
      );

      // Remote copies render the spell but never run its gameplay effects.
      if (
        !cloud.visualOnly &&
        cloud.life > 0 &&
        cloud.pulseTimer <= 0
      ) {
        cloud.pulseTimer = cloud.pulseInterval;
        applyRainCloud(cloud);
      }

      if (cloud.life <= 0) {
        cloud.life = 0;

        if (!cloud.visualOnly && !cloud.cooldownStarted) {
          cloud.cooldownStarted = true;
          startSkillCooldown(
            "rainCloud",
            null,
            Number(cloud.expiresAtMs) || Date.now()
          );
        }
      }
    } else {
      // Departure phase: no rain/effects, just the visual cloud fading away.
      cloud.fadeTime -= dt;

      if (cloud.fadeTime <= 0) {
        rainClouds.splice(i, 1);
      }
    }
  }

  updateRainWetPrediction();
}

function drawFireballTargeting(camX, camY) {
  if (!player.fireballAiming) return;

  const radius = fireballAimRadius();
  const progress = fireballAimProgress();
  const centerX = Math.round(player.x - camX);
  const centerY = Math.round(player.y - 8 - camY);
  const pointCount = Math.max(18, Math.round(radius / 5));

  ctx.save();
  ctx.globalAlpha *= 0.30 + Math.sin(progress * Math.PI) * 0.12;
  ctx.fillStyle = "#e99a55";

  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const x = Math.round(centerX + Math.cos(angle) * radius);
    const y = Math.round(centerY + Math.sin(angle) * radius);
    ctx.fillRect(x, y, 1, 1);
  }

  const landing = fireballLandingPoint();
  const x = Math.round(landing.x - camX);
  const y = Math.round(landing.y - camY);

  ctx.globalAlpha = 0.94;
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(x - 3, y, 2, 1);
  ctx.fillRect(x + 2, y, 2, 1);
  ctx.fillRect(x, y - 3, 1, 2);
  ctx.fillRect(x, y + 2, 1, 2);
  ctx.fillStyle = "#fff0a7";
  ctx.fillRect(x, y, 1, 1);

  ctx.restore();
}

function fireballVisualY(fireball) {
  if (!fireball?.airborne) {
    return Number(fireball?.y) || 0;
  }

  const duration = Math.max(0.001, Number(fireball.duration) || 0.4);
  const progress = Math.max(
    0,
    Math.min(1, (Number(fireball.elapsed) || 0) / duration)
  );
  const arcHeight = Math.max(0, Number(fireball.arcHeight) || 0);
  return fireball.y - Math.sin(progress * Math.PI) * arcHeight;
}

function drawFireball(fireball, camX, camY) {
  const x = Math.round(fireball.x - camX);
  const groundY = Math.round(fireball.y - camY);
  const visualY = fireballVisualY(fireball);
  const y = Math.round(visualY - camY);

  if (fireball.airborne) {
    const duration = Math.max(0.001, Number(fireball.duration) || 0.4);
    const progress = Math.max(0, Math.min(1, (Number(fireball.elapsed) || 0) / duration));
    const height = Math.max(0, fireball.y - visualY);

    // Moving shadow sells that the projectile is passing over enemies/trees
    // instead of colliding with them on the ground plane.
    ctx.save();
    ctx.globalAlpha *= Math.max(0.08, 0.28 - height * 0.0045);
    ctx.fillStyle = "#26382b";
    const shadowWidth = Math.max(2, Math.round(5 - Math.min(2, height / 18)));
    ctx.fillRect(x - Math.floor(shadowWidth / 2), groundY, shadowWidth, 1);
    ctx.restore();
  }

  // Chunky 5x5-ish projectile with a hot center.
  ctx.fillStyle = "#a52d22";
  ctx.fillRect(x - 2, y - 2, 5, 5);

  ctx.fillStyle = "#ef622b";
  ctx.fillRect(x - 1, y - 2, 3, 4);
  ctx.fillRect(x - 2, y - 1, 4, 3);

  ctx.fillStyle = "#ffbd36";
  ctx.fillRect(x - 1, y - 1, 2, 2);

  ctx.fillStyle = "#ffe47a";
  ctx.fillRect(x, y - 1, 1, 1);
}

function spawnJesterConfettiBurst(x, y, count = 16) {
  const colors = ["#ff5da2", "#59d7ff", "#ffd95a", "#a8ff69", "#e9b0ff"];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 12 + Math.random() * 26;

    jesterConfetti.push({
      x,
      y: y - 10 + Math.random() * 5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      life: 0.45 + Math.random() * 0.45,
      maxLife: 0.45 + Math.random() * 0.45,
      color: colors[(Math.random() * colors.length) | 0],
      size: Math.random() < 0.35 ? 2 : 1
    });
  }
}

function updateJesterConfetti(dt) {
  for (let i = jesterConfetti.length - 1; i >= 0; i--) {
    const p = jesterConfetti[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 18 * dt;
    p.vx *= 0.98;

    if (p.life <= 0) {
      jesterConfetti.splice(i, 1);
    }
  }
}

function drawJesterConfetti(camX, camY) {
  for (const p of jesterConfetti) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    const x = Math.round(p.x - camX);
    const y = Math.round(p.y - camY);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, p.size, p.size);
    ctx.restore();
  }
}

function spawnJesterAfterimageTrail(
  startX,
  startY,
  endX,
  endY,
  appearance = null
) {
  const steps = 4;

  const hatIndex =
    appearance?.hatIndex ??
    player.hatIndex;

  const shirtIndex =
    appearance?.shirtIndex ??
    player.shirtIndex;

  const pantsIndex =
    appearance?.pantsIndex ??
    player.pantsIndex;

  for (let i = 0; i < steps; i++) {
    const t =
      steps <= 1
        ? 1
        : i / (steps - 1);

    jesterAfterimages.push({
      x:
        startX +
        (endX - startX) * t,

      y:
        startY +
        (endY - startY) * t,

      life: 0.18 + t * 0.10,
      duration: 0.18 + t * 0.10,

      hatIndex,
      shirtIndex,
      pantsIndex
    });
  }
}

function updateJesterAfterimages(dt) {
  for (let i = jesterAfterimages.length - 1; i >= 0; i--) {
    const item = jesterAfterimages[i];
    item.life -= dt;

    if (item.life <= 0) {
      jesterAfterimages.splice(i, 1);
    }
  }
}

function drawJesterAfterimages(camX, camY) {
  for (const item of jesterAfterimages) {
    const appearance = playerAppearanceForIndices(
      item.hatIndex,
      item.shirtIndex,
      item.pantsIndex
    );

    const alpha = Math.max(0, Math.min(1, item.life / item.duration)) * 0.28;
    const screenX = Math.round(item.x - camX);
    const screenY = Math.round(item.y - camY);
    const baseX = screenX - 8;
    const baseY = screenY - 15;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(240, 180, 255, 0.25)";
    ctx.fillRect(screenX - 4, screenY, 8, 2);

    ctx.drawImage(appearance.leftLeg, baseX, baseY);
    ctx.drawImage(appearance.rightLeg, baseX, baseY);
    ctx.drawImage(appearance.torso, baseX, baseY);
    ctx.drawImage(appearance.leftArm, baseX, baseY);
    ctx.drawImage(appearance.rightArm, baseX, baseY);
    ctx.drawImage(sprite.face, baseX, baseY);
    ctx.drawImage(appearance.hat, baseX, baseY);

    ctx.restore();
  }
}

function drawRainCloudGround(cloud, camX, camY) {
  // This is a ground decal, not part of the floating cloud sprite. Drawing it
  // before trees/characters keeps trunks and canopies naturally in front of it.
  if (cloud.life <= 0) return;

  const cx = Math.round(cloud.x - camX);
  const groundY = Math.round(cloud.y - camY);

  ctx.fillStyle = "rgba(28, 40, 48, .18)";
  ctx.fillRect(cx - 9, groundY - 3, 18, 2);

  ctx.fillStyle = "rgba(28, 40, 48, .10)";
  ctx.fillRect(cx - 6, groundY - 4, 12, 1);

  ctx.fillStyle = "rgba(90, 135, 150, .10)";
  ctx.fillRect(cx - 11, groundY - 1, 22, 2);
}

function drawRainCloud(cloud, camX, camY) {
  const cx = Math.round(cloud.x - camX);

  // The shadow marks the actual ground target. Lift only the visible cloud
  // and rain curtain so they sit above that ground point.
  const visualLift = 12;
  const cy = Math.round(cloud.y - camY - 28 - visualLift);

  const active = cloud.life > 0;
  const age = cloud.maxLife - cloud.life;

  // Quick pop-in: a tiny scale-up and fade from lower transparency so
  // the cloud feels summoned instead of just appearing abruptly.
  const popDuration = 0.22;
  const popT = Math.max(0, Math.min(1, age / popDuration));
  const popEase = 1 - Math.pow(1 - popT, 2);

  // Departure begins only after the active rain duration has fully ended.
  const fadeProgress = active
    ? 0
    : Math.max(0, Math.min(1, 1 - cloud.fadeTime / cloud.maxFadeTime));

  const departureAlpha = active ? 1 : 1 - fadeProgress;
  const alpha = (0.55 + popEase * 0.45) * departureAlpha;

  // Once summoned, the cloud gently "breathes" and drifts by a single pixel.
  // During departure, it additionally floats upward several pixels.
  const breathe = Math.sin(age * 2.15);
  const floatY = Math.round(Math.sin(age * 1.55) * popEase);
  const exitLift = active ? 0 : Math.round(fadeProgress * 6);

  const baseScale = 0.88 + popEase * 0.12;
  const scaleX = baseScale * (1 + breathe * 0.018 * popEase);
  const scaleY = baseScale * (1 - breathe * 0.012 * popEase);
  const cloudVisualY = cy + floatY - exitLift;

  const rainTop = cloudVisualY + 11;
  const rainBottom = Math.round(cloud.y - camY + 7 - visualLift);

  // Draw rain FIRST so the cloud sprite sits over it.
  // Once the active lifetime expires, rain stops immediately.
  if (active) {
  const laneXs = [-10, -7, -4, -1, 2, 5, 8];
  const dropSpeed = 34;          // pixels per second
  const emissionInterval = 0.22;
  const fallDistance = Math.max(1, rainBottom - rainTop);
  const travelTime = fallDistance / dropSpeed;
  const dropsNeeded =
    Math.ceil(travelTime / emissionInterval) + 2;

  for (let lane = 0; lane < laneXs.length; lane++) {
    const laneX = laneXs[lane];
    const laneDelay = lane * 0.035;

    if (age < laneDelay) continue;

    const latestEmission =
      Math.floor((age - laneDelay) / emissionInterval);

    for (let back = 0; back < dropsNeeded; back++) {
      const emissionIndex = latestEmission - back;
      if (emissionIndex < 0) continue;

      const spawnTime =
        laneDelay + emissionIndex * emissionInterval;
      const dropAge = age - spawnTime;

      if (dropAge < 0 || dropAge > travelTime) continue;

      const dropY =
        Math.round(rainTop + dropAge * dropSpeed);

      // Very slight lane variation keeps the rain from looking like a grid.
      const drift =
        ((lane + emissionIndex) % 3 === 0) ? 1 : 0;
      const dropX = cx + laneX + drift;

      ctx.fillStyle = "#79c3e8";
      ctx.fillRect(dropX, dropY, 1, 2);

      ctx.fillStyle = "#c3eefc";
      ctx.fillRect(dropX, dropY, 1, 1);

      if ((lane + emissionIndex) % 4 === 0) {
        ctx.fillStyle = "#9dd9f2";
        ctx.fillRect(dropX + 1, dropY + 1, 1, 1);
      }
    }
  }

  // Ground splashes only begin after the FIRST drops have actually had enough
  // time to fall from the cloud to the ground.
  if (age >= travelTime) {
    const splashPhase = worldTime * 7;

    for (let i = -9; i <= 9; i += 4) {
      const flicker = Math.sin(splashPhase * 1.4 + i * 0.8);

      if (flicker > 0.35) {
        const splashY = rainBottom - 1;
        ctx.fillStyle = "#a9e1f7";
        ctx.fillRect(cx + i, splashY, 1, 1);
      }
    }
  }
  }

  // Draw the cloud body on top with the pop-in + subtle breathing motion.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cloudVisualY + 6);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(
    rainCloudImage,
    -Math.floor(rainCloudImage.width / 2),
    -7
  );
  ctx.restore();

  // Sparse magical twinkles around the cloud body. Keep these tiny and
  // intermittent so the rain still reads first and the cloud feels enchanted
  // rather than covered in constant glitter.
  const sparkleSeeds = [
    { x: -12, y: -2, phase: 0.2 },
    { x:  11, y:  1, phase: 1.7 },
    { x:  -5, y: -8, phase: 3.1 },
    { x:   6, y: -6, phase: 4.6 }
  ];

  ctx.save();
  ctx.globalAlpha = departureAlpha;

  for (let i = 0; i < sparkleSeeds.length; i++) {
    const sparkle = sparkleSeeds[i];
    const wave = Math.sin(worldTime * 3.4 + sparkle.phase + age * 0.9);

    // Only let each star show near the top of its pulse so the effect flickers
    // naturally instead of becoming a permanent outline around the cloud.
    if (wave < 0.42) continue;

    const driftX = Math.round(
      Math.sin(worldTime * 1.15 + sparkle.phase) * 1
    );
    const driftY = Math.round(
      Math.cos(worldTime * 1.35 + sparkle.phase) * 1
    );
    const sx = Math.round(cx + sparkle.x + driftX);
    const sy = Math.round(cloudVisualY + 6 + sparkle.y + driftY);
    const sparkleAlpha = Math.min(0.9, 0.35 + (wave - 0.42) * 0.95);

    ctx.globalAlpha = departureAlpha * sparkleAlpha;
    ctx.fillStyle = "#dff7f4";
    ctx.fillRect(sx, sy, 1, 1);

    // Stronger pulses briefly become a tiny pixel-star cross.
    if (wave > 0.78) {
      ctx.fillStyle = "#f4fff4";
      ctx.fillRect(sx - 1, sy, 1, 1);
      ctx.fillRect(sx + 1, sy, 1, 1);
      ctx.fillRect(sx, sy - 1, 1, 1);
      ctx.fillRect(sx, sy + 1, 1, 1);
    }
  }

  ctx.restore();
}

function fireballCooldownAtLevel(level = abilityLevel("fireball")) {
  const cleanLevel = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)));
  const t = (cleanLevel - 1) / 19;
  return 7.0 + (3.5 - 7.0) * t;
}

function getActiveJesterClone() {
  if (!jesterClone) return null;
  if (Number.isFinite(Number(jesterClone.expiresAtMs))) {
    jesterClone.life = Math.max(
      0,
      (Number(jesterClone.expiresAtMs) - Date.now()) / 1000
    );
  }
  if (jesterClone.life <= 0) return null;
  if (jesterClone.mapId !== currentMapId) return null;
  return jesterClone;
}

function spawnJesterClone(x, y) {
  const cloneId =
    `hallucination:${currentMapId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

  const startedAtMs = Date.now();

  jesterClone = {
    cloneId,
    x,
    y,
    life: JESTER_CLONE_DURATION,
    startedAtMs,
    returnReadyAtMs: startedAtMs + JESTER_RETURN_LOCKOUT_SECONDS * 1000,
    expiresAtMs: startedAtMs + JESTER_CLONE_DURATION * 1000,
    duration: JESTER_CLONE_DURATION,
    phase: Math.random() * Math.PI * 2,
    releasedEnemyIds: new Set(),
    hatIndex: player.hatIndex,
    shirtIndex: player.shirtIndex,
    pantsIndex: player.pantsIndex,
    mapId: currentMapId
  };

  spawnJesterConfettiBurst(x, y, 18);
}

function spawnRemoteJesterBlinkVisual(
  ownerId,
  payload
) {
  const startX =
    Number(payload.startX) || 0;

  const startY =
    Number(payload.startY) || 0;

  const endX =
    Number(payload.endX) || 0;

  const endY =
    Number(payload.endY) || 0;

  const appearance = {
    hatIndex:
      Number.isFinite(payload.hatIndex)
        ? payload.hatIndex
        : 0,

    shirtIndex:
      Number.isFinite(payload.shirtIndex)
        ? payload.shirtIndex
        : 0,

    pantsIndex:
      Number.isFinite(payload.pantsIndex)
        ? payload.pantsIndex
        : 0
  };

  const startedAtMs = Date.now();
  const isSnapshot = Boolean(payload.snapshot);
  const remainingLife = isSnapshot
    ? Math.max(0.05, Math.min(
        JESTER_CLONE_DURATION,
        Number(payload.remainingLife) || JESTER_CLONE_DURATION
      ))
    : JESTER_CLONE_DURATION;

  if (isSnapshot) {
    removeRemoteJesterForOwner(ownerId);
  }

  remoteJesterClones.push({
    ownerId,
    cloneId: typeof payload.cloneId === "string" ? payload.cloneId : null,
    x: startX,
    y: startY,
    life: remainingLife,
    startedAtMs: startedAtMs - (JESTER_CLONE_DURATION - remainingLife) * 1000,
    expiresAtMs: startedAtMs + remainingLife * 1000,
    duration: JESTER_CLONE_DURATION,
    phase: Math.random() * Math.PI * 2,

    hatIndex: appearance.hatIndex,
    shirtIndex: appearance.shirtIndex,
    pantsIndex: appearance.pantsIndex,

    mapId: currentMapId
  });

  if (!isSnapshot) {
    spawnJesterConfettiBurst(
      startX,
      startY,
      18
    );

    spawnJesterAfterimageTrail(
      startX,
      startY,
      endX,
      endY,
      appearance
    );
  }

}

function applyTransientAbilitySnapshot(message) {
  if (!message || message.mapId !== currentMapId) return;

  for (const cloud of Array.isArray(message.rainClouds) ? message.rainClouds : []) {
    if (!cloud?.ownerId) continue;
    spawnRemoteRainCast(
      String(cloud.ownerId),
      {
        snapshot: true,
        x: cloud.x,
        y: cloud.y,
        targetX: cloud.orbitCenterX,
        targetY: cloud.orbitCenterY,
        orbitCenterX: cloud.orbitCenterX,
        orbitCenterY: cloud.orbitCenterY,
        orbitAngle: cloud.orbitAngle,
        orbitElapsed: cloud.orbitElapsed,
        orbitRadius: cloud.orbitRadius,
        totalLife: cloud.totalLife,
        remainingLife: cloud.remainingLife,
        patchId: cloud.patchId
      }
    );
  }

  for (const clone of Array.isArray(message.hallucinations) ? message.hallucinations : []) {
    if (!clone?.ownerId) continue;
    spawnRemoteJesterBlinkVisual(
      String(clone.ownerId),
      {
        snapshot: true,
        startX: clone.x,
        startY: clone.y,
        endX: clone.x,
        endY: clone.y,
        cloneId: clone.cloneId,
        remainingLife: clone.remainingLife,
        hatIndex: clone.hatIndex,
        shirtIndex: clone.shirtIndex,
        pantsIndex: clone.pantsIndex
      }
    );
  }

  for (const field of Array.isArray(message.rainFields) ? message.rainFields : []) {
    if (!field?.ownerId || !(Number(field.patchId) > 0)) continue;
    spawnTemporaryRainGrassField(
      Number(field.centerX) || 0,
      Number(field.centerY) || 0,
      Number(field.patchId) || 0,
      {
        ownerId: String(field.ownerId),
        ageSeconds: Math.max(0, Number(field.age) || 0),
        burningMask: Number(field.burningMask) >>> 0,
        burntMask: Number(field.burntMask) >>> 0,
        burnEnds: Array.isArray(field.burnEnds) ? field.burnEnds : [],
        serverControlled: true
      }
    );
  }
}

function spawnRemoteJesterReturnVisual(ownerId, payload) {
  const startX = Number(payload.startX) || 0;
  const startY = Number(payload.startY) || 0;
  const endX = Number(payload.endX) || 0;
  const endY = Number(payload.endY) || 0;

  removeRemoteJesterForOwner(ownerId);
  spawnJesterAfterimageTrail(startX, startY, endX, endY);
  spawnJesterConfettiBurst(endX, endY, 24);
}

function returnToJesterClone(clone) {
  if (!clone || clone.mapId !== currentMapId) return false;

  const nowMs = Date.now();
  if (nowMs < (Number(clone.returnReadyAtMs) || 0)) {
    return true;
  }

  if (!canOccupyPlayerPoint(clone.x, clone.y)) {
    spawnFloatingText(player.x, player.y - 26, "Blocked", "#ffe38b", 0.7);
    return true;
  }

  const startX = player.x;
  const startY = player.y;
  const endX = clone.x;
  const endY = clone.y;
  const cloneId = clone.cloneId || null;

  spawnJesterAfterimageTrail(startX, startY, endX, endY);
  spawnJesterConfettiBurst(endX, endY, 24);

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "jesterReturn",
      { startX, startY, endX, endY, cloneId }
    );
  }

  player.x = endX;
  player.y = endY;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = Math.max(player.contactCooldown, 0.20);
  player.attackTime = 0;
  player.slashTime = 0;
  player.jesterBlinkFadeTime = player.jesterBlinkFadeDuration;

  endLocalHallucination({ burst: false, startCooldown: true });

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function tryCastJesterBlink() {
  if (inventoryOpen) return false;

  const activeClone = getActiveJesterClone();
  if (activeClone) {
    return returnToJesterClone(activeClone);
  }

  if (player.jesterBlinkCooldown > 0) {
    const remaining = Math.max(0, Number(player.jesterBlinkCooldown) || 0);
    spawnFloatingText(
      player.x,
      player.y - 26,
      `${remaining.toFixed(1)}s`,
      "#e7a2ff",
      0.7
    );
    return true;
  }

  const startX = player.x;
  const startY = player.y;

  const targetWorldX =
    Math.max(0, Math.min(world.width, currentCamX + mouseCanvasX));
  const targetWorldY =
    Math.max(0, Math.min(world.height, currentCamY + mouseCanvasY));

  let dx = targetWorldX - startX;
  let dy = targetWorldY - (startY - 8);

  const distance = Math.hypot(dx, dy);

  if (distance < 0.001) {
    dx = Math.cos(player.attackAimAngle);
    dy = Math.sin(player.attackAimAngle);
  } else {
    dx /= distance;
    dy /= distance;
  }

  let destination = null;

  for (let step = JESTER_BLINK_RANGE; step >= 10; step -= 4) {
    const testX = startX + dx * step;
    const testY = startY + dy * step;

    if (canOccupyPlayerPoint(testX, testY)) {
      destination = { x: testX, y: testY };
      break;
    }
  }

  if (!destination) {
    spawnFloatingText(player.x, player.y - 26, "Blocked", "#ffe38b", 0.7);
    return true;
  }

  spawnJesterClone(startX, startY);

  spawnJesterAfterimageTrail(
    startX,
    startY,
    destination.x,
    destination.y
  );

  if (typeof onlineClient !== "undefined") {
    onlineClient.sendVisualEffect(
      "jesterBlink",
      {
        startX,
        startY,
        endX: destination.x,
        endY: destination.y,
        cloneId: jesterClone?.cloneId || null,
        hatIndex: player.hatIndex,
        shirtIndex: player.shirtIndex,
        pantsIndex: player.pantsIndex
      }
    );
  }

  player.x = destination.x;
  player.y = destination.y;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = Math.max(player.contactCooldown, 0.20);
  player.attackTime = 0;
  player.slashTime = 0;
  player.jesterBlinkFadeTime = player.jesterBlinkFadeDuration;


  return true;
}

function getRainCloudLifetime() {
  return GAME_CONFIG.rainCloud.baseLifetime;
}

function drawRainCloudCastIndicator(camX, camY) {
  if (!player.rainCloudCasting) return;

  const screenX = Math.round(player.x - camX);
  const screenY = Math.round(player.y - camY - 32);
  const progress = Math.max(
    0,
    Math.min(
      1,
      player.rainCloudCastTime /
        Math.max(0.05, player.rainCloudCastDuration)
    )
  );

  ctx.fillStyle = "rgba(28, 32, 29, .82)";
  ctx.fillRect(screenX - 9, screenY, 18, 4);
  ctx.fillStyle = "#8fc7bd";
  ctx.fillRect(
    screenX - 8,
    screenY + 1,
    Math.round(16 * progress),
    2
  );
}

function startHallucinationCooldown(startedAtMs = Date.now()) {
  const duration = Number(player.jesterBlinkCooldownDuration) || 15;
  const startMs = Number.isFinite(Number(startedAtMs))
    ? Number(startedAtMs)
    : Date.now();
  const proposedEndAtMs = startMs + duration * 1000;

  player.jesterBlinkCooldownEndAtMs = Math.max(
    Number(player.jesterBlinkCooldownEndAtMs) || 0,
    proposedEndAtMs
  );
  player.jesterBlinkCooldown = skillCooldownRemaining("jesterBlink");
}

function endLocalHallucination({ burst = false, startCooldown = true, cooldownStartedAtMs = Date.now() } = {}) {
  if (!jesterClone) return false;

  if (burst) {
    spawnJesterConfettiBurst(
      jesterClone.x,
      jesterClone.y,
      34
    );
  }

  jesterClone = null;

  if (startCooldown) {
    startHallucinationCooldown(cooldownStartedAtMs);
  }

  return true;
}

function updateJesterRuntime(dt) {
  player.jesterBlinkCooldown = skillCooldownRemaining("jesterBlink");

  tickTimer(
    player,
    "jesterBlinkFadeTime",
    dt
  );

  if (jesterClone) {
    if (Number.isFinite(Number(jesterClone.expiresAtMs))) {
      jesterClone.life = Math.max(
        0,
        (Number(jesterClone.expiresAtMs) - Date.now()) / 1000
      );
    } else {
      jesterClone.life -= dt;
    }
    jesterClone.phase += dt * 7;
    const releasedEnemyIds =
      jesterClone.releasedEnemyIds ||
      (jesterClone.releasedEnemyIds = new Set());

    const enemyRecords =
      activeEnemyRecords({ aliveOnly: true });

    // Hallucination redirect is authoritative on the server. The local client
    // only remembers which enemies have visually reached this clone; it no
    // longer sends periodic taunt/clearTaunt enemyAction packets.
    for (const { enemy } of enemyRecords) {
      const enemyId = enemy?.entityId || null;
      if (!enemyId || releasedEnemyIds.has(enemyId)) continue;

      const body = enemyBodyPoint(enemy);
      const contactDistance = Math.hypot(
        body.x - jesterClone.x,
        body.y - jesterClone.y
      );

      if (contactDistance <= JESTER_CLONE_CONTACT_RADIUS) {
        releasedEnemyIds.add(enemyId);
      }
    }

    if (jesterClone.life <= 0) {
      endLocalHallucination({
        burst: true,
        startCooldown: true,
        cooldownStartedAtMs: Number(jesterClone.expiresAtMs) || Date.now()
      });
    } else if (
      jesterClone.mapId !== currentMapId
    ) {
      endLocalHallucination({ burst: false, startCooldown: true });
    }
  }

  for (
    let i = remoteJesterClones.length - 1;
    i >= 0;
    i--
  ) {
    const clone =
      remoteJesterClones[i];

    if (Number.isFinite(Number(clone.expiresAtMs))) {
      clone.life = Math.max(
        0,
        (Number(clone.expiresAtMs) - Date.now()) / 1000
      );
    } else {
      clone.life -= dt;
    }
    clone.phase += dt * 7;

    if (clone.life <= 0) {
      spawnJesterConfettiBurst(
        clone.x,
        clone.y,
        34
      );

      remoteJesterClones.splice(i, 1);
      continue;
    }

    if (clone.mapId !== currentMapId) {
      remoteJesterClones.splice(i, 1);
    }
  }
}

function drawJesterCloneEntity(
  clone,
  camX,
  camY
) {
  if (!clone) return;

  const screenX = Math.round(clone.x - camX);
  const screenY = Math.round(clone.y - camY);
  const bobY = Math.round(Math.sin(clone.phase) * 1);
  const baseX = screenX - 8;
  const baseY = screenY - 15 + bobY;
  const appearance = playerAppearanceForIndices(
    clone.hatIndex,
    clone.shirtIndex,
    clone.pantsIndex
  );

  const fade = Math.max(0, Math.min(1, clone.life / clone.duration));
  const pulse = 0.5 + 0.5 * Math.sin(worldTime * 7 + clone.phase);

  ctx.save();
  ctx.globalAlpha = 0.18 * fade;
  ctx.drawImage(appearance.leftLeg, baseX + 1, baseY);
  ctx.drawImage(appearance.rightLeg, baseX + 1, baseY);
  ctx.drawImage(appearance.torso, baseX + 1, baseY);
  ctx.drawImage(appearance.leftArm, baseX + 1, baseY);
  ctx.drawImage(appearance.rightArm, baseX + 1, baseY);
  ctx.drawImage(sprite.face, baseX + 1, baseY);
  ctx.drawImage(appearance.hat, baseX + 1, baseY);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = (0.58 + pulse * 0.10) * fade;
  ctx.drawImage(appearance.leftLeg, baseX, baseY);
  ctx.drawImage(appearance.rightLeg, baseX, baseY);
  ctx.drawImage(appearance.torso, baseX, baseY);
  ctx.drawImage(appearance.leftArm, baseX, baseY);
  ctx.drawImage(appearance.rightArm, baseX, baseY);
  ctx.drawImage(sprite.face, baseX, baseY);
  ctx.drawImage(appearance.hat, baseX, baseY);
  ctx.restore();

  const sparkleY =
    baseY - 3 + Math.round(Math.sin(worldTime * 9 + clone.phase) * 1);
  ctx.fillStyle = "#f3c9ff";
  ctx.fillRect(screenX - 3, sparkleY, 1, 1);
  ctx.fillRect(screenX, sparkleY - 1, 1, 1);
  ctx.fillRect(screenX + 3, sparkleY, 1, 1);

  const confettiColors = ["#ff6dac", "#53d2ff", "#ffd95a", "#a8ff71"];
  for (let i = 0; i < 4; i++) {
    const angle = clone.phase * 0.7 + i * (Math.PI / 2);
    const confX = Math.round(screenX + Math.cos(angle) * 7);
    const confY = Math.round(screenY - 8 + Math.sin(angle) * 3);
    ctx.fillStyle = confettiColors[i % confettiColors.length];
    ctx.fillRect(confX, confY, 1, 1);
  }
}

function drawJesterClone(camX, camY) {
  drawJesterCloneEntity(
    getActiveJesterClone(),
    camX,
    camY
  );
}
