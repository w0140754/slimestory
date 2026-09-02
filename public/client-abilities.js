// Slime Story client ability foundation.
// Shared active-skill targeting, cooldown, unlock, dispatch, and input bridge.
// Extracted from game.js without gameplay changes.

function getCurrentWorldMouseTarget() {
  return {
    x: Math.max(0, Math.min(world.width, currentCamX + mouseCanvasX)),
    y: Math.max(0, Math.min(world.height, currentCamY + mouseCanvasY))
  };
}

function aimPlayerTowardPoint(targetX, targetY) {
  const dx = targetX - player.x;
  const dy = targetY - (player.y - 8);
  player.attackAimAngle = Math.atan2(dy, dx);
}

function resolvePlayerPointTarget(
  targetX,
  targetY,
  {
    minRange = 0,
    maxRange = Infinity,
    insetX = 5,
    insetTop = 5,
    insetBottom = 5
  } = {}
) {
  const originX = player.x;
  const originY = player.y - 8;
  let dx = Number(targetX) - originX;
  let dy = Number(targetY) - originY;
  let distance = Math.hypot(dx, dy);

  if (!Number.isFinite(distance)) {
    dx = Math.cos(player.attackAimAngle || 0);
    dy = Math.sin(player.attackAimAngle || 0);
    distance = 1;
  } else if (distance <= 0.001) {
    dx = Math.cos(player.attackAimAngle || 0);
    dy = Math.sin(player.attackAimAngle || 0);
    distance = 1;
  }

  const clampedDistance = Math.max(
    Math.max(0, Number(minRange) || 0),
    Math.min(
      Number.isFinite(Number(maxRange)) ? Number(maxRange) : distance,
      distance
    )
  );
  const scale = clampedDistance / distance;
  const resolvedX = clampToWorld(
    originX + dx * scale,
    insetX,
    world.width - insetX
  );
  const resolvedY = clampToWorld(
    originY + dy * scale,
    insetTop,
    world.height - insetBottom
  );

  return {
    x: resolvedX,
    y: resolvedY,
    angle: Math.atan2(resolvedY - originY, resolvedX - originX),
    radius: Math.hypot(resolvedX - originX, resolvedY - originY)
  };
}

function updateCanvasCursor() {
  // Rain Cloud no longer has self-targeting/repositioning, so there is no
  // ability-specific cursor state to maintain here.
  canvas.style.cursor = "default";
}

function skillCooldownRemaining(skillId) {
  const nowMs = Date.now();

  if (skillId === "jesterBlink") {
    const endAtMs = Number(player.jesterBlinkCooldownEndAtMs) || 0;
    if (endAtMs > 0) {
      return Math.max(0, (endAtMs - nowMs) / 1000);
    }

    return Math.max(0, Number(player.jesterBlinkCooldown) || 0);
  }

  const endAtMs = Number(player.skillCooldownEndTimes?.[skillId]) || 0;
  if (endAtMs > 0) {
    return Math.max(0, (endAtMs - nowMs) / 1000);
  }

  return Math.max(
    0,
    Number(player.skillCooldowns?.[skillId]) || 0
  );
}

function skillCooldownDuration(skillId) {
  if (skillId === "jesterBlink") {
    return hallucinationCooldownAtLevel(abilityLevel("jesterBlink"));
  }

  if (skillId === "fireball") {
    return fireballCooldownAtLevel(abilityLevel("fireball"));
  }

  if (skillId === "rainCloud") {
    return rainCloudCooldownAtLevel(abilityLevel("rainCloud"));
  }

  return Math.max(
    0,
    Number(ACTIVE_SKILLS?.[skillId]?.cooldown) || 0
  );
}

function skillIsOnCooldown(skillId) {
  return skillCooldownRemaining(skillId) > 0;
}

function startSkillCooldown(skillId, duration = null, startedAtMs = Date.now()) {
  if (!player.skillCooldowns) player.skillCooldowns = {};
  if (!player.skillCooldownEndTimes) player.skillCooldownEndTimes = {};

  const resolvedDuration = Number.isFinite(duration)
    ? Math.max(0, duration)
    : skillCooldownDuration(skillId);

  const startMs = Number.isFinite(Number(startedAtMs))
    ? Number(startedAtMs)
    : Date.now();
  const proposedEndAtMs = startMs + resolvedDuration * 1000;
  const existingEndAtMs = Number(player.skillCooldownEndTimes[skillId]) || 0;

  player.skillCooldownEndTimes[skillId] = Math.max(
    existingEndAtMs,
    proposedEndAtMs
  );

  player.skillCooldowns[skillId] = skillCooldownRemaining(skillId);
}

function showSkillCooldownMessage(skillId) {
  const remaining = skillCooldownRemaining(skillId);
  if (remaining <= 0) return;

  spawnFloatingText(
    player.x,
    player.y - 31,
    `${remaining.toFixed(1)}S`,
    "#bbb7c8",
    0.48
  );
}

function abilityLevel(skillId) {
  const rawLevel = Math.max(0, Number(player.abilities[skillId] || 0));
  const maxLevel = Math.max(0, Number(ACTIVE_SKILLS[skillId]?.maxLevel) || rawLevel);
  return Math.min(rawLevel, maxLevel);
}

function isAbilityUnlocked(skillId) {
  return skillBelongsToSelectedClass(skillId) && abilityLevel(skillId) > 0;
}

function normalizeActiveSkillKey(event) {
  if (event.code === "Space") return "space";

  const key = event.key.toLowerCase();
  if (key === "shift" || key === "e" || key === "r") return key;
  return null;
}

function triggerActiveSkillForKey(key, options = {}) {
  const skillId = skillBindings[key];
  if (!skillId || !isAbilityUnlocked(skillId)) return false;
  const pointTarget = options?.pointTarget || null;

  if (
    player.hunterSnareSetting &&
    skillId !== "huntersSnare"
  ) {
    cancelHunterSnarePlacement(true);
  }

  if (focusFireIsCasting() || fireballIsAiming()) {
    return true;
  }

  const carriedEnemy =
    getLocalCarriedHurlObject();

  if (
    carriedEnemy &&
    skillId !== "hurl"
  ) {
    spawnFloatingText(
      player.x,
      player.y - 33,
      "Hands full!",
      "#ffd28a",
      0.72
    );

    return true;
  }

  if (player.rainCloudCasting && skillId !== "rainCloud") {
    return true;
  }

  if (skillId === "shadowHide") {
    return tryEnterShadowHide();
  }

  if (skillId === "hurl") {
    breakShadowHide();
    return tryCastHurl();
  }

  if (skillId === "jesterBlink") {
    // Any non-movement action reveals a hidden player before the blink.
    breakShadowHide();
    return tryCastJesterBlink();
  }

  if (skillId === "focusFire") {
    breakShadowHide();
    return beginFocusFireCharge(key);
  }

  if (skillId === "huntersSnare") {
    breakShadowHide();
    return tryCastHuntersSnare();
  }

  if (skillId === "fireball") {
    return beginFireballAim(key, pointTarget);
  }

  if (skillId === "rainCloud") {
    return beginRainCloudCast(pointTarget);
  }

  return false;
}

function handleActiveSkillKeyDown(event, activeSkillKey) {
  if (!activeSkillKey || !skillBindings[activeSkillKey]) return false;

  if (activeSkillKey === "space") {
    event.preventDefault();
  }

  inputController.queueCommand("useActiveSkill", {
    key: activeSkillKey
  });

  return true;
}
