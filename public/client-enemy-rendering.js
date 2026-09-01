// Slime Story enemy rendering / presentation extraction.
// Refactor-only module: moved from game.js without behavior changes.
// Loaded before game.js so the existing runtime profile can reference these
// classic-script function bindings at its original initialization point.

function enemySpawnScale(enemy) {
  const time = Math.max(0, Number(enemy?.spawnAnimTime) || 0);
  if (time <= 0) return { x: 1, y: 1, alpha: 1 };

  const progress = Math.max(
    0,
    Math.min(1, 1 - time / ENEMY_SPAWN_ANIM_DURATION)
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  const pop = Math.sin(progress * Math.PI) * 0.10;

  return {
    x: 0.48 + eased * 0.52 + pop,
    y: 0.28 + eased * 0.72 - pop * 0.35,
    alpha: Math.min(1, 0.45 + progress * 0.75)
  };
}

function spawnEnemyDeathEffect(enemy, enemyType, mapId = currentMapId) {
  if (!enemy || !enemyType) return;

  enemyDeathEffects.push({
    enemyType,
    variant: enemy.variant || "green",
    mapId: mapId || currentMapId,
    x: Number(enemy.x) || 0,
    y: Number(enemy.y) || 0,
    phase: Number(enemy.phase) || 0,
    life: ENEMY_DEATH_ANIM_DURATION,
    maxLife: ENEMY_DEATH_ANIM_DURATION
  });
}

function updateEnemyPresentationEffects(dt) {
  for (const { enemy } of activeEnemyRecords()) {
    if ((Number(enemy.spawnAnimTime) || 0) > 0) {
      enemy.spawnAnimTime = Math.max(0, enemy.spawnAnimTime - dt);
    }
  }

  for (let i = enemyDeathEffects.length - 1; i >= 0; i--) {
    enemyDeathEffects[i].life -= dt;
    if (enemyDeathEffects[i].life <= 0) {
      enemyDeathEffects.splice(i, 1);
    }
  }
}

function drawEnemyDeathEffect(effect, camX, camY) {
  const progress = Math.max(0, Math.min(1, 1 - effect.life / effect.maxLife));
  const screenX = Math.round(effect.x - camX);
  const screenY = Math.round(effect.y - camY);
  const squash = Math.sin(progress * Math.PI);
  const scaleX = Math.max(0.18, 1 + squash * 0.28 - progress * 0.76);
  const scaleY = Math.max(0.10, 1 - squash * 0.30 - progress * 0.82);
  const alpha = Math.max(0, 1 - progress * progress);

  let image = slimeImage;
  let width = 16;
  let height = 16;

  if (effect.enemyType === "slime") {
    image =
      effect.variant === "purple" ? purpleSlimeImage :
      effect.variant === "blue" ? blueSlimeImage :
      effect.variant === "goldBaby" ? goldBabySlimeImage :
      slimeImage;
  } else if (effect.enemyType === "mushroom") {
    image = mushroomAwakeImage;
  } else if (effect.enemyType === "goblin") {
    image = goblinImage;
    height = 24;
  } else if (effect.enemyType === "ghost") {
    image = ghostImage;
    height = 24;
  } else if (effect.enemyType === "bigGoldSlime") {
    image = bigGoldSlimeImage;
    width = 24;
    height = 24;
  }

  const drawWidth = Math.max(1, Math.round(width * scaleX));
  const drawHeight = Math.max(1, Math.round(height * scaleY));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(35, 45, 32, ${0.24 * alpha})`;
  ctx.fillRect(
    screenX - Math.max(1, Math.round(drawWidth * 0.35)),
    screenY,
    Math.max(2, Math.round(drawWidth * 0.70)),
    2
  );
  ctx.drawImage(
    image,
    Math.round(screenX - drawWidth / 2),
    Math.round(screenY - drawHeight + 1),
    drawWidth,
    drawHeight
  );
  ctx.restore();
}

function drawSlime(slime, camX, camY) {
  if (!slime.alive) return;

  const carrier =
    slime.carriedBy &&
    typeof onlineClient !== "undefined"
      ? onlineClient.playerForNetworkId(
          slime.carriedBy
        )
      : null;

  const baseWorldX =
    carrier ? carrier.x : slime.x;

  const baseWorldY =
    carrier ? carrier.y : slime.y;

  let screenX =
    Math.round(baseWorldX - camX);

  const screenY =
    Math.round(baseWorldY - camY);

  if (slime.shakeTime > 0) {
    screenX +=
      Math.sin(slime.shakeTime * 120) > 0
        ? 1
        : -1;
  }

  const carried = Boolean(carrier);

  const pickupDuration = Math.max(
    0.01,
    slime.pickupDuration || 0.18
  );

  const pickupProgressRaw = carried
    ? Math.max(
        0,
        Math.min(
          1,
          1 - (slime.pickupTime || 0) / pickupDuration
        )
      )
    : 1;

  const pickupProgress = carried
    ? 1 - Math.pow(1 - pickupProgressRaw, 2)
    : 1;

  const bounceBase = carried
    ? 0
    : Math.sin(
        worldTime * 6.2 + slime.phase
      ) * 0.5 + 0.5;

  const hopWave = carried
    ? 0
    : Math.pow(
        bounceBase,
        1.65
      );

  let hopHeight = carried
    ? Math.round(9 * pickupProgress)
    : Math.round(hopWave * 5);

  if (
    !carried &&
    slime.hurlTime > 0
  ) {
    const duration =
      Math.max(
        0.01,
        slime.hurlDuration || 0.58
      );

    const progress =
      Math.max(
        0,
        Math.min(
          1,
          1 - slime.hurlTime / duration
        )
      );

    hopHeight += Math.round(
      Math.sin(progress * Math.PI) * 13
    );
  }

  let drawWidth = 16;
  let drawHeight = 16;

  if (carried && pickupProgressRaw < 1) {
    const pickupSquash =
      Math.sin(pickupProgressRaw * Math.PI);

    if (pickupSquash > 0.2) {
      drawWidth = 17;
      drawHeight = 15;
    }
  } else if (!carried && hopWave < 0.26) {
    drawWidth = 17;
    drawHeight = 16;
  } else if (!carried && hopWave > 0.78) {
    drawWidth = 16;
    drawHeight = 17;
  }

  const spawnScale = enemySpawnScale(slime);
  drawWidth = Math.max(1, Math.round(drawWidth * spawnScale.x));
  drawHeight = Math.max(1, Math.round(drawHeight * spawnScale.y));

  const shadowWave = carried
    ? pickupProgress
    : hopWave;

  const shadowWidth = Math.round(12 - shadowWave * 5);
  const shadowAlpha = 0.42 - shadowWave * 0.16;

  ctx.fillStyle = `rgba(35, 52, 37, ${shadowAlpha})`;
  ctx.fillRect(
    Math.round(screenX - shadowWidth / 2),
    screenY,
    shadowWidth,
    3
  );

  const drawX = Math.round(screenX - drawWidth / 2);
  const drawY = Math.round(screenY - hopHeight - drawHeight + 1);

  const baseSlimeImage =
    slime.variant === "purple"
      ? purpleSlimeImage
      : slime.variant === "blue"
        ? blueSlimeImage
        : slime.variant === "goldBaby"
          ? goldBabySlimeImage
          : slimeImage;

  ctx.save();
  ctx.globalAlpha *= spawnScale.alpha;
  ctx.drawImage(
    baseSlimeImage,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );
  ctx.restore();

  if (slime.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.drawImage(
      slimeFlashImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  if (slime.burnTime > 0) {
    // Small procedural flames ride with the slime's current hop.
    drawPixelFlame(
      Math.round(screenX - 4),
      Math.round(drawY + 5),
      slime.phase + 0.4
    );

    drawPixelFlame(
      Math.round(screenX + 3),
      Math.round(drawY + 7),
      slime.phase + 2.6
    );

    // Occasionally show a taller centre lick of flame.
    if (Math.sin(worldTime * 14 + slime.phase) > 0.1) {
      drawPixelFlame(
        Math.round(screenX),
        Math.round(drawY + 2),
        slime.phase + 4.7
      );
    }
  }

  if ((Number(slime.wetTime) || 0) > 0) {
    drawWetStatus(
      screenX,
      Math.round(screenY - hopHeight - 2),
      slime.wetTime,
      slime.wetDuration || GAME_CONFIG.status.enemyWetDuration
    );
  }
}

function mushroomIsAwakePresentation(mushroom) {
  if (!mushroom?.alive) return false;

  const motionSpeed = Math.hypot(
    Number(mushroom.serverVelocityX) || 0,
    Number(mushroom.serverVelocityY) || 0
  );
  const targetDistance = Math.hypot(
    (Number(mushroom.serverTargetX) || mushroom.x) - mushroom.x,
    (Number(mushroom.serverTargetY) || mushroom.y) - mushroom.y
  );

  return Boolean(
    mushroom.aggroTargetId ||
    (Number(mushroom.confusionTime) || 0) > 0 ||
    (Number(mushroom.hitFlash) || 0) > 0 ||
    (Number(mushroom.burnTime) || 0) > 0 ||
    motionSpeed > 0.75 ||
    targetDistance > 0.75
  );
}

function drawMushroom(mushroom, camX, camY) {
  if (!mushroom.alive) return;

  const carrier =
    mushroom.carriedBy &&
    typeof onlineClient !== "undefined"
      ? onlineClient.playerForNetworkId(
          mushroom.carriedBy
        )
      : null;

  const baseWorldX =
    carrier ? carrier.x : mushroom.x;
  const baseWorldY =
    carrier ? carrier.y : mushroom.y;

  let screenX =
    Math.round(baseWorldX - camX);
  const screenY =
    Math.round(baseWorldY - camY);

  if (mushroom.shakeTime > 0) {
    screenX +=
      Math.sin(mushroom.shakeTime * 125) > 0
        ? 1
        : -1;
  }

  const awake =
    mushroomIsAwakePresentation(mushroom);

  let lift = 0;
  if (carrier) {
    const pickupDuration = Math.max(
      0.01,
      mushroom.pickupDuration || 0.18
    );
    const pickupProgress = Math.max(
      0,
      Math.min(
        1,
        1 -
          (Number(mushroom.pickupTime) || 0) /
            pickupDuration
      )
    );
    lift = Math.round(
      9 *
      (1 - Math.pow(1 - pickupProgress, 2))
    );
  } else if ((Number(mushroom.hurlTime) || 0) > 0) {
    const duration = Math.max(
      0.01,
      mushroom.hurlDuration || 0.58
    );
    const progress = Math.max(
      0,
      Math.min(
        1,
        1 -
          (Number(mushroom.hurlTime) || 0) /
            duration
      )
    );
    lift = Math.round(
      Math.sin(progress * Math.PI) * 13
    );
  } else if (awake) {
    const hop =
      Math.max(
        0,
        Math.sin(
          worldTime * 7.1 + mushroom.phase
        )
      );
    lift = Math.round(hop * 2);
  }

  const shadowWidth =
    awake ? 10 : 12;
  ctx.fillStyle = "rgba(35, 45, 32, .28)";
  ctx.fillRect(
    Math.round(screenX - shadowWidth / 2),
    screenY,
    shadowWidth,
    2
  );

  const spawnScale =
    enemySpawnScale(mushroom);
  const breathe =
    !awake && !carrier
      ? Math.sin(
          worldTime * 2.1 + mushroom.phase
        ) * 0.025
      : 0;

  const drawWidth = Math.max(
    1,
    Math.round(
      16 *
      spawnScale.x *
      (1 + breathe)
    )
  );
  const drawHeight = Math.max(
    1,
    Math.round(
      16 *
      spawnScale.y *
      (1 - breathe * 0.45)
    )
  );
  const drawX =
    Math.round(screenX - drawWidth / 2);
  const drawY =
    Math.round(
      screenY - drawHeight + 1 - lift
    );
  const image =
    awake
      ? mushroomAwakeImage
      : mushroomSleepImage;

  const imageReady = Boolean(
    image &&
    image.complete &&
    image.naturalWidth > 0 &&
    image.naturalHeight > 0
  );

  ctx.save();
  ctx.globalAlpha *= spawnScale.alpha;
  if (imageReady) {
    ctx.drawImage(
      image,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
  } else {
    // Never let a still-loading/failed mushroom asset abort the entire render loop.
    // The normal sprite takes over automatically as soon as the Image decodes.
    const fallbackScaleX = drawWidth / 16;
    const fallbackScaleY = drawHeight / 16;
    ctx.fillStyle = awake ? "#b64b3b" : "#b95b48";
    ctx.fillRect(
      Math.round(drawX + 2 * fallbackScaleX),
      Math.round(drawY + 2 * fallbackScaleY),
      Math.max(1, Math.round(12 * fallbackScaleX)),
      Math.max(1, Math.round(5 * fallbackScaleY))
    );
    ctx.fillStyle = "#ead4ad";
    ctx.fillRect(
      Math.round(drawX + 5 * fallbackScaleX),
      Math.round(drawY + 7 * fallbackScaleY),
      Math.max(1, Math.round(6 * fallbackScaleX)),
      Math.max(1, Math.round(7 * fallbackScaleY))
    );
  }
  ctx.restore();

  if (
    mushroom.hitFlash > 0 &&
    mushroomFlashImage.complete &&
    mushroomFlashImage.naturalWidth > 0 &&
    mushroomFlashImage.naturalHeight > 0
  ) {
    ctx.save();
    ctx.globalAlpha = 0.66;
    ctx.drawImage(
      mushroomFlashImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  if (mushroom.burnTime > 0) {
    drawPixelFlame(
      screenX - 4,
      drawY + 8,
      mushroom.phase + 0.8
    );
    drawPixelFlame(
      screenX + 3,
      drawY + 10,
      mushroom.phase + 2.9
    );
  }

  if ((Number(mushroom.wetTime) || 0) > 0) {
    drawWetStatus(
      screenX,
      Math.round(screenY - lift - 2),
      mushroom.wetTime,
      mushroom.wetDuration ||
        GAME_CONFIG.status.enemyWetDuration
    );
  }
}

function drawGoblin(goblin, camX, camY) {
  if (!goblin.alive) return;

  const carrier =
    goblin.carriedBy &&
    typeof onlineClient !== "undefined"
      ? onlineClient.playerForNetworkId(goblin.carriedBy)
      : null;

  const baseWorldX = carrier ? carrier.x : goblin.x;
  const baseWorldY = carrier ? carrier.y : goblin.y;

  let screenX = Math.round(baseWorldX - camX);
  const screenY = Math.round(baseWorldY - camY);

  if (goblin.shakeTime > 0) {
    screenX += Math.sin(goblin.shakeTime * 130) > 0 ? 1 : -1;
  }

  // A static sprite can still feel alive: tiny footstep bob + side sway.
  const motionAmount = goblin.moving || goblin.lungeTime > 0 ? 1 : 0.35;
  const step = Math.sin(goblin.walkTime * 10 + goblin.phase);
  const bob = Math.round(Math.abs(step) * motionAmount);
  const sway = Math.round(Math.sin(goblin.walkTime * 5 + goblin.phase) * motionAmount);

  const shadowWidth = goblin.lungeTime > 0 ? 11 : 9;
  ctx.fillStyle = "rgba(35, 52, 37, .30)";
  ctx.fillRect(
    Math.round(screenX - shadowWidth / 2),
    screenY,
    shadowWidth,
    2
  );

  let drawWidth = 16;
  let drawHeight = 24;

  // A very small squash during the lunge sells the attack without limb frames.
  if (goblin.lungeTime > 0) {
    drawWidth = 17;
    drawHeight = 23;
  }

  const spawnScale = enemySpawnScale(goblin);
  drawWidth = Math.max(1, Math.round(drawWidth * spawnScale.x));
  drawHeight = Math.max(1, Math.round(drawHeight * spawnScale.y));

  let hurlLift = carrier ? 15 : 0;

  if (!carrier && goblin.hurlTime > 0) {
    const duration = Math.max(0.01, goblin.hurlDuration || 0.58);
    const progress = Math.max(0, Math.min(1, 1 - goblin.hurlTime / duration));
    hurlLift = Math.round(Math.sin(progress * Math.PI) * 13);
  }

  const drawX = Math.round(screenX - drawWidth / 2 + sway);
  const drawY = Math.round(screenY - drawHeight + 1 - bob - hurlLift);

  ctx.save();
  ctx.globalAlpha *= spawnScale.alpha;
  ctx.drawImage(
    goblinImage,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );
  ctx.restore();

  if (goblin.hitFlash > 0 && goblinFlashImage.complete) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.drawImage(
      goblinFlashImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  if (goblin.burnTime > 0) {
    drawPixelFlame(screenX - 4, drawY + 9, goblin.phase + 0.7);
    drawPixelFlame(screenX + 3, drawY + 13, goblin.phase + 2.8);

    if (Math.sin(worldTime * 13 + goblin.phase) > 0.05) {
      drawPixelFlame(screenX, drawY + 6, goblin.phase + 4.6);
    }
  }

  if ((Number(goblin.wetTime) || 0) > 0) {
    drawWetStatus(
      screenX,
      Math.round(screenY - hurlLift - 4),
      goblin.wetTime,
      goblin.wetDuration || GAME_CONFIG.status.enemyWetDuration
    );
  }
}

function drawGhost(ghost, camX, camY) {
  if (
    !naturalEnemyBelongsToCurrentMap(
      ghost
    ) ||
    !ghost.alive
  ) {
    return;
  }

  let screenX = Math.round(ghost.x - camX);
  const screenY = Math.round(ghost.y - camY);

  if (ghost.shakeTime > 0) {
    screenX += Math.sin(ghost.shakeTime * 135) > 0 ? 1 : -1;
  }

  const hover = Math.round(
    Math.sin(worldTime * 2.35 + ghost.phase) * 1.5
  );

  const shadowPulse =
    Math.sin(worldTime * 2.35 + ghost.phase) * 0.5 + 0.5;

  ctx.fillStyle = `rgba(25, 34, 29, ${0.27 - shadowPulse * 0.05})`;
  ctx.fillRect(screenX - 5, screenY, 10, 2);

  const spawnScale = enemySpawnScale(ghost);
  const drawWidth = Math.max(1, Math.round(16 * spawnScale.x));
  const drawHeight = Math.max(1, Math.round(24 * spawnScale.y));
  const drawX = Math.round(screenX - drawWidth / 2);
  const drawY = Math.round(screenY - drawHeight + hover);

  ctx.save();
  ctx.globalAlpha *= spawnScale.alpha;
  ctx.drawImage(
    ghostImage,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );
  ctx.restore();

  if (ghost.hitFlash > 0 && ghostFlashImage.complete) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.drawImage(
      ghostFlashImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  if (ghost.burnTime > 0) {
    drawPixelFlame(screenX - 4, drawY + 8, ghost.phase + 0.8);
    drawPixelFlame(screenX + 3, drawY + 12, ghost.phase + 2.9);

    if (Math.sin(worldTime * 13 + ghost.phase) > -0.05) {
      drawPixelFlame(screenX, drawY + 5, ghost.phase + 4.2);
    }
  }
}

