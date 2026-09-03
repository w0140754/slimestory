// Slime Story client input runtime — extracted verbatim from v240 game.js.

// -----------------------------------------------------------------------------
// INPUT CONTROLLER
// -----------------------------------------------------------------------------
// Browser input is translated into intent here. Gameplay commands are consumed
// by GameSimulation. In a future online build these same command objects can
// be sent over WebSocket instead of applied directly by the client.
class InputController {
  constructor() {
    this.keys = Object.create(null);
    this.commandQueue = [];
    this.mobileDx = 0;
    this.mobileDy = 0;
  }

  setKey(key, pressed) {
    this.keys[key] = pressed;
  }

  queueCommand(type, payload = {}) {
    this.commandQueue.push({ type, payload });
  }

  drainCommands() {
    if (this.commandQueue.length === 0) return [];
    const commands = this.commandQueue;
    this.commandQueue = [];
    return commands;
  }

  clearCommands() {
    this.commandQueue.length = 0;
  }

  clearKeys() {
    for (const key of Object.keys(this.keys)) {
      this.keys[key] = false;
    }
    this.mobileDx = 0;
    this.mobileDy = 0;
  }

  setMobileMovement(dx, dy) {
    this.mobileDx = Number.isFinite(dx) ? dx : 0;
    this.mobileDy = Number.isFinite(dy) ? dy : 0;
  }

  getMovementVector() {
    // While carrying a slime, the player is rooted in place for now.
    // A future enhancement can explicitly relax this rule.
    if (typeof getLocalCarriedHurlObject === "function" && getLocalCarriedHurlObject()) {
      return { dx: 0, dy: 0, moving: false };
    }

    let dx = 0;
    let dy = 0;

    if (this.keys["w"]) dy -= 1;
    if (this.keys["s"]) dy += 1;
    if (this.keys["a"]) dx -= 1;
    if (this.keys["d"]) dx += 1;

    if (Math.hypot(this.mobileDx, this.mobileDy) > 0.08) {
      dx += this.mobileDx;
      dy += this.mobileDy;
    }

    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
    }

    return { dx, dy, moving };
  }
}

const inputController = new InputController();

const mobileControlsEnabled = window.matchMedia(
  "(hover: none) and (pointer: coarse)"
).matches;
let mobileAimDx = 1;
let mobileAimDy = 0;
let mobilePointTargetMode = null;
let mobilePointTargetKey = null;
let mobilePointTargetSuppressMouseUntil = 0;
let mobileAutoBowTarget = null;
let mobileTrackedBowEnemy = null;
let mobileAutoAttackEnabled = false;
let mobileAutoAttackBowDrawing = false;

const MOBILE_COMBAT_ASSIST_MELEE_DISTANCE = 62;
const MOBILE_BOW_VISIBLE_TARGET_DISTANCE = 320;
const MOBILE_POINT_TARGET_SKILLS = new Set([
  "fireball",
  "rainCloud",
  "focusFire"
]);

function mobileAbilitySlotForKey(key) {
  return document.getElementById(
    key === "shift" ? "abilitySlotShift" :
    key === "space" ? "abilitySlotSpace" :
    key === "e" ? "abilitySlotE" :
    key === "r" ? "abilitySlotR" : ""
  );
}

function clearMobilePointTargetMode() {
  mobilePointTargetMode = null;
  mobilePointTargetKey = null;
  document.body.classList.remove("mobile-point-targeting");

  document.getElementById("mobileAttackButton")
    ?.classList.remove("point-target-armed");
  for (const slot of document.querySelectorAll(".ability-slot.point-target-armed")) {
    slot.classList.remove("point-target-armed");
  }

  const hint = document.getElementById("mobileTargetHint");
  if (hint) hint.textContent = "";
}

function armMobilePointTarget(mode, key = null) {
  if (!mobileControlsEnabled) return false;

  if (
    mobilePointTargetMode === mode &&
    mobilePointTargetKey === key
  ) {
    clearMobilePointTargetMode();
    return false;
  }

  clearMobilePointTargetMode();
  mobilePointTargetMode = mode;
  mobilePointTargetKey = key;
  document.body.classList.add("mobile-point-targeting");

  const hint = document.getElementById("mobileTargetHint");
  if (hint) {
    hint.textContent = mode === "bow"
      ? "TAP WHERE THE ARROW SHOULD GO"
      : mode === "focusFire"
        ? "TAP THE RAPID-FIRE TARGET"
        : mode === "rainCloud"
          ? "TAP WHERE THE CLOUD SHOULD FORM"
          : "TAP WHERE THE FIREBALL SHOULD LAND";
  }

  const armedControl = mode === "bow"
    ? document.getElementById("mobileAttackButton")
    : mobileAbilitySlotForKey(key);
  armedControl?.classList.add("point-target-armed");
  return true;
}

function clearMobileAutoBowTarget() {
  mobileAutoBowTarget = null;
  mobileTrackedBowEnemy = null;
  mobileAutoAttackBowDrawing = false;
}

function mobileTargetIsOnScreen(target, margin = 6) {
  if (!target) return false;
  const screenX = target.x - currentCamX;
  const screenY = target.y - currentCamY;
  return (
    screenX >= margin &&
    screenX <= VIEW_W - margin &&
    screenY >= margin &&
    screenY <= VIEW_H - margin
  );
}

function updateMobilePointBowShot() {
  if (!mobileControlsEnabled || !mobileAutoBowTarget) return false;

  if (mobileTrackedBowEnemy) {
    if (!mobileTrackedBowEnemy.alive) {
      player.bowDrawing = false;
      player.bowDrawAmount = 0;
      player.bowReleaseTime = 0;
      clearMobileAutoBowTarget();
      return false;
    }
    const trackedTarget = enemyBodyPoint(mobileTrackedBowEnemy);
    if (!mobileTargetIsOnScreen(trackedTarget)) {
      player.bowDrawing = false;
      player.bowDrawAmount = 0;
      player.bowReleaseTime = 0;
      clearMobileAutoBowTarget();
      return false;
    }
    mobileAutoBowTarget = trackedTarget;
  }

  const automatedDrawBlocked =
    inventoryOpen ||
    shopOpen ||
    craftingOpen ||
    classResetConfirmOpen ||
    beachQuestOpen ||
    mobilePointTargetMode ||
    player.rainCloudCasting ||
    focusFireIsCasting() ||
    fireballIsAiming() ||
    getLocalCarriedHurlObject();

  if (
    !player.bowDrawing ||
    equippedWeapon() !== "bow" ||
    player.isDead ||
    player.hp <= 0 ||
    automatedDrawBlocked
  ) {
    if (automatedDrawBlocked && player.bowDrawing) {
      player.bowDrawing = false;
      player.bowDrawAmount = 0;
      player.bowReleaseTime = 0;
    }
    clearMobileAutoBowTarget();
    return false;
  }

  const point = {
    x: mobileAutoBowTarget.x - currentCamX,
    y: mobileAutoBowTarget.y - currentCamY
  };
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  updateAttackAimFromPointer(point.x, point.y);

  if ((Number(player.bowDrawAmount) || 0) < 1) return false;

  clearMobileAutoBowTarget();
  handleBowVisualMouseUp(mobilePointerEventForCanvas(point));
  return true;
}

function executeMobilePointTargetCommand(payload = {}) {
  if (!mobileControlsEnabled) return false;

  const mode = String(payload.mode || "");
  const key = String(payload.key || "");
  const target = {
    x: Math.max(0, Math.min(world.width, Number(payload.targetX) || 0)),
    y: Math.max(0, Math.min(world.height, Number(payload.targetY) || 0))
  };
  const point = {
    x: target.x - currentCamX,
    y: target.y - currentCamY
  };
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  updateAttackAimFromPointer(point.x, point.y);

  if (mode === "bow") {
    if (equippedWeapon() !== "bow" || getLocalCarriedHurlObject()) return true;

    handlePrimaryAttack(mobilePointerEventForCanvas(point));
    mobileAutoAttackBowDrawing = false;
    mobileTrackedBowEnemy = null;
    mobileAutoBowTarget = player.bowDrawing ? target : null;
    return true;
  }

  if (
    !MOBILE_POINT_TARGET_SKILLS.has(mode) ||
    skillBindings[key] !== mode
  ) {
    return false;
  }

  triggerActiveSkillForKey(key, { pointTarget: target });

  if (mode === "fireball" && player.fireballAiming) {
    releaseFireballAim(target);
  } else if (mode === "focusFire" && player.focusFireCharging) {
    releaseFocusFireCharge(target);
  }

  return true;
}

function handleMobilePointTargetPointerDown(event) {
  if (!mobileControlsEnabled || !mobilePointTargetMode || event.button !== 0) return;
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen) {
    clearMobilePointTargetMode();
    return;
  }

  event.preventDefault();
  const pointer = getCanvasPointerPosition(event);
  const payload = {
    mode: mobilePointTargetMode,
    key: mobilePointTargetKey,
    targetX: currentCamX + pointer.x,
    targetY: currentCamY + pointer.y
  };

  clearMobilePointTargetMode();
  mobilePointTargetSuppressMouseUntil = performance.now() + 500;
  inputController.queueCommand("mobilePointTarget", payload);
}

function mobileEnemyTarget(
  maxDistance,
  requireMeleeRange = false,
  visibleOnly = false
) {
  if (!mobileControlsEnabled || player.isDead || player.hp <= 0) return null;
  if (typeof activeEnemyRecords !== "function" || typeof enemyBodyPoint !== "function") return null;

  const originX = player.x;
  const originY = player.y - 8;

  let best = null;
  for (const { enemy, profile } of activeEnemyRecords({ aliveOnly: true })) {
    const target = enemyBodyPoint(enemy);
    const dx = target.x - originX;
    const dy = target.y - originY;
    const distance = Math.hypot(dx, dy);
    if (visibleOnly && !mobileTargetIsOnScreen(target)) continue;
    if (requireMeleeRange) {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const bodyRadius = horizontal
        ? profile.horizontalMeleeBodyRadius ?? 6
        : profile.meleeBodyRadius ?? 5;
      if (distance > currentMeleeReach() + bodyRadius) continue;
    }
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    best = { enemy, profile, target, dx, dy, distance };
  }

  return best;
}

function mobileResourceTarget() {
  if (!mobileControlsEnabled || player.isDead || player.hp <= 0) return null;

  const weapon = equippedWeapon();
  if (weapon !== "axe" && weapon !== "pickaxe") return null;

  const originX = player.x;
  const originY = player.y - 8;
  let best = null;

  if (weapon === "axe" && Array.isArray(trees)) {
    for (const tree of trees) {
      if (!tree || tree.nonInteractive || tree.isStump || tree.falling) continue;
      const target = { x: tree.x, y: tree.y - 15 };
      const dx = target.x - originX;
      const dy = target.y - originY;
      const distance = Math.hypot(dx, dy);
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const trunkRadius = horizontal ? 9 : 8;
      if (
        distance > currentMeleeReach() + trunkRadius ||
        (best && distance >= best.distance)
      ) {
        continue;
      }
      best = { target, dx, dy, distance, kind: "tree" };
    }
  }

  if (weapon === "pickaxe" && Array.isArray(rocks)) {
    for (const rock of rocks) {
      if (
        !rock ||
        rock.depleted ||
        rock.carriedBy ||
        (Number(rock.hurlTime) || 0) > 0 ||
        (Number(rock.rollTime) || 0) > 0
      ) {
        continue;
      }
      const target = { x: rock.x, y: rock.y - 4 };
      const dx = target.x - originX;
      const dy = target.y - originY;
      const distance = Math.hypot(dx, dy);
      if (
        distance > currentMeleeReach() + 7 ||
        (best && distance >= best.distance)
      ) {
        continue;
      }
      best = { target, dx, dy, distance, kind: "rock" };
    }
  }

  return best;
}

function mobileCombatAssistCanvasPoint() {
  const weapon = equippedWeapon();
  const best = mobileResourceTarget() || mobileEnemyTarget(
    weapon === "bow"
      ? MOBILE_BOW_VISIBLE_TARGET_DISTANCE
      : MOBILE_COMBAT_ASSIST_MELEE_DISTANCE
  );

  if (!best || best.distance <= 0.001) return null;

  mobileAimDx = best.dx / best.distance;
  mobileAimDy = best.dy / best.distance;
  return {
    x: best.target.x - currentCamX,
    y: best.target.y - currentCamY
  };
}

function startMobileSmartBowAttack() {
  const target = mobileEnemyTarget(
    MOBILE_BOW_VISIBLE_TARGET_DISTANCE,
    false,
    true
  );
  if (!target) return false;

  clearMobilePointTargetMode();
  const point = {
    x: target.target.x - currentCamX,
    y: target.target.y - currentCamY
  };
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  mobileAimDx = target.dx / Math.max(0.001, target.distance);
  mobileAimDy = target.dy / Math.max(0.001, target.distance);
  updateAttackAimFromPointer(point.x, point.y);
  handlePrimaryAttack(mobilePointerEventForCanvas(point));

  mobileAutoAttackBowDrawing = false;
  mobileTrackedBowEnemy = player.bowDrawing ? target.enemy : null;
  mobileAutoBowTarget = player.bowDrawing ? target.target : null;
  return true;
}

function updateMobileAutoAttackButton() {
  const button = document.getElementById("mobileAutoAttackButton");
  if (!button) return;
  button.classList.toggle("active", mobileAutoAttackEnabled);
  button.setAttribute("aria-pressed", mobileAutoAttackEnabled ? "true" : "false");
  button.textContent = mobileAutoAttackEnabled ? "AUTO ON" : "AUTO";
}

function setMobileAutoAttackEnabled(enabled, { quiet = false } = {}) {
  const nextEnabled = Boolean(enabled && mobileControlsEnabled);
  if (mobileAutoAttackEnabled === nextEnabled) {
    updateMobileAutoAttackButton();
    return;
  }

  mobileAutoAttackEnabled = nextEnabled;
  if (!nextEnabled && mobileAutoAttackBowDrawing) {
    player.bowDrawing = false;
    player.bowDrawAmount = 0;
    player.bowReleaseTime = 0;
  }
  clearMobileAutoBowTarget();
  updateMobileAutoAttackButton();

  if (!quiet) {
    spawnFloatingText(
      player.x,
      player.y - 27,
      nextEnabled ? "AUTO ATTACK ON" : "AUTO ATTACK OFF",
      nextEnabled ? "#bff28f" : "#ffe38b",
      0.72
    );
  }
}

function updateMobileAutoAttack() {
  if (!mobileControlsEnabled || !mobileAutoAttackEnabled) return false;
  if (player.isDead || player.hp <= 0) {
    setMobileAutoAttackEnabled(false, { quiet: true });
    return false;
  }
  if (
    inventoryOpen ||
    shopOpen ||
    craftingOpen ||
    classResetConfirmOpen ||
    beachQuestOpen ||
    mobilePointTargetMode ||
    player.rainCloudCasting ||
    focusFireIsCasting() ||
    fireballIsAiming() ||
    getLocalCarriedHurlObject()
  ) {
    return false;
  }

  const weapon = equippedWeapon();
  if (!weapon) return false;

  const target = mobileEnemyTarget(
    weapon === "bow"
      ? MOBILE_BOW_VISIBLE_TARGET_DISTANCE
      : MOBILE_COMBAT_ASSIST_MELEE_DISTANCE,
    weapon !== "bow",
    weapon === "bow"
  );

  if (!target) {
    if (mobileAutoAttackBowDrawing) {
      player.bowDrawing = false;
      player.bowDrawAmount = 0;
      player.bowReleaseTime = 0;
      clearMobileAutoBowTarget();
    }
    return false;
  }

  const point = {
    x: target.target.x - currentCamX,
    y: target.target.y - currentCamY
  };
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  mobileAimDx = target.dx / Math.max(0.001, target.distance);
  mobileAimDy = target.dy / Math.max(0.001, target.distance);
  updateAttackAimFromPointer(point.x, point.y);

  if (weapon === "bow") {
    if ((Number(player.arrows) || 0) <= 0) {
      setMobileAutoAttackEnabled(false, { quiet: true });
      spawnFloatingText(player.x, player.y - 27, "AUTO OFF · NO ARROWS", "#ffe38b", 0.72);
      return false;
    }

    if (player.bowDrawing) {
      if (mobileAutoAttackBowDrawing) {
        mobileTrackedBowEnemy = target.enemy;
        mobileAutoBowTarget = target.target;
      }
      return mobileAutoAttackBowDrawing;
    }
    if (player.attackCooldown > 0 || player.bowReleaseTime > 0) return false;

    handlePrimaryAttack(mobilePointerEventForCanvas(point));
    mobileAutoAttackBowDrawing = Boolean(player.bowDrawing);
    mobileTrackedBowEnemy = mobileAutoAttackBowDrawing ? target.enemy : null;
    mobileAutoBowTarget = mobileAutoAttackBowDrawing ? target.target : null;
    return true;
  }

  if (player.attackCooldown > 0) return false;
  executePrimaryAttackCommand({
    pointerX: point.x,
    pointerY: point.y
  });
  return true;
}

function applyMobileCombatAssistAim() {
  const point = mobileCombatAssistCanvasPoint();
  if (!point) return false;
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  updateAttackAimFromPointer(point.x, point.y);
  return true;
}

function mobileAimCanvasPoint(distance = 64) {
  const playerScreenX = player.x - currentCamX;
  const playerScreenY = player.y - currentCamY - 8;
  return {
    x: Math.max(0, Math.min(VIEW_W, playerScreenX + mobileAimDx * distance)),
    y: Math.max(0, Math.min(VIEW_H, playerScreenY + mobileAimDy * distance))
  };
}

function mobilePointerEventForCanvas(point) {
  const rect = canvas.getBoundingClientRect();
  return {
    button: 0,
    clientX: rect.left + point.x * (rect.width / VIEW_W),
    clientY: rect.top + point.y * (rect.height / VIEW_H)
  };
}

function installMobileControls() {
  if (!mobileControlsEnabled) return;

  const pad = document.getElementById("mobileMovePad");
  const knob = document.getElementById("mobileMoveKnob");
  const attack = document.getElementById("mobileAttackButton");
  const autoAttack = document.getElementById("mobileAutoAttackButton");
  const interact = document.getElementById("mobileInteractButton");
  const menu = document.getElementById("mobileMenuButton");
  if (!pad || !knob || !attack || !autoAttack || !interact || !menu) return;

  let attackPointerId = null;
  let attackPointerStartX = 0;
  let attackPointerStartY = 0;
  let attackManualAim = false;
  let attackAssistFrame = 0;
  let movePointerId = null;
  const updateMove = event => {
    const rect = pad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = Math.max(1, rect.width * 0.32);
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;
    knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    const normalizedLength = Math.min(1, length / radius);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    inputController.setMobileMovement(nx * normalizedLength, ny * normalizedLength);
    if (
      normalizedLength > 0.18 &&
      !(attackPointerId !== null && !attackManualAim)
    ) {
      mobileAimDx = nx;
      mobileAimDy = ny;
    }
  };
  const stopMove = event => {
    if (movePointerId !== event.pointerId) return;
    movePointerId = null;
    knob.style.transform = "translate(0, 0)";
    inputController.setMobileMovement(0, 0);
  };
  pad.addEventListener("pointerdown", event => {
    event.preventDefault();
    movePointerId = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    updateMove(event);
  });
  pad.addEventListener("pointermove", event => {
    if (movePointerId === event.pointerId) updateMove(event);
  });
  pad.addEventListener("pointerup", stopMove);
  pad.addEventListener("pointercancel", stopMove);

  const aimAttackFromEvent = event => {
    const rect = attack.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > 8) {
      mobileAimDx = dx / length;
      mobileAimDy = dy / length;
    }
    const point = mobileAimCanvasPoint();
    mouseCanvasX = point.x;
    mouseCanvasY = point.y;
    updateAttackAimFromPointer(point.x, point.y);
  };

  const keepMobileAttackAssistFresh = () => {
    attackAssistFrame = 0;
    if (attackPointerId === null || attackManualAim) return;
    applyMobileCombatAssistAim();
    attackAssistFrame = requestAnimationFrame(keepMobileAttackAssistFresh);
  };

  attack.addEventListener("pointerdown", event => {
    event.preventDefault();

    if (
      equippedWeapon() === "bow" &&
      !getLocalCarriedHurlObject() &&
      !player.rainCloudCasting &&
      !focusFireIsCasting() &&
      !fireballIsAiming()
    ) {
      if ((Number(player.arrows) || 0) <= 0) {
        spawnFloatingText(player.x, player.y - 27, "NO ARROWS", "#ffe38b", 0.72);
        return;
      }
      if (startMobileSmartBowAttack()) return;
      armMobilePointTarget("bow");
      return;
    }

    clearMobilePointTargetMode();
    attackPointerId = event.pointerId;
    attackPointerStartX = event.clientX;
    attackPointerStartY = event.clientY;
    attackManualAim = false;
    attack.setPointerCapture(event.pointerId);

    if (!applyMobileCombatAssistAim()) {
      aimAttackFromEvent(event);
    }
    if (!attackAssistFrame) {
      attackAssistFrame = requestAnimationFrame(keepMobileAttackAssistFresh);
    }

    handlePrimaryAttack(mobilePointerEventForCanvas({
      x: mouseCanvasX,
      y: mouseCanvasY
    }));
  });

  attack.addEventListener("pointermove", event => {
    if (attackPointerId !== event.pointerId) return;
    if (
      Math.hypot(
        event.clientX - attackPointerStartX,
        event.clientY - attackPointerStartY
      ) > 11
    ) {
      attackManualAim = true;
      if (attackAssistFrame) {
        cancelAnimationFrame(attackAssistFrame);
        attackAssistFrame = 0;
      }
    }
    if (attackManualAim) aimAttackFromEvent(event);
  });

  const releaseAttack = event => {
    if (attackPointerId !== event.pointerId) return;
    attackPointerId = null;
    if (attackAssistFrame) {
      cancelAnimationFrame(attackAssistFrame);
      attackAssistFrame = 0;
    }
    handleBowVisualMouseUp(mobilePointerEventForCanvas({
      x: mouseCanvasX,
      y: mouseCanvasY
    }));
  };
  attack.addEventListener("pointerup", releaseAttack);
  attack.addEventListener("pointercancel", releaseAttack);

  autoAttack.addEventListener("pointerdown", event => {
    event.preventDefault();
    clearMobilePointTargetMode();
    if (!mobileAutoAttackEnabled && !equippedWeapon()) {
      spawnFloatingText(player.x, player.y - 27, "EQUIP A WEAPON", "#ffe38b", 0.72);
      return;
    }
    setMobileAutoAttackEnabled(!mobileAutoAttackEnabled);
  });

  interact.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (!interact.classList.contains("available")) return;
    inputController.queueCommand("interact");
  });

  menu.addEventListener("pointerdown", event => {
    event.preventDefault();
    clearMobilePointTargetMode();
    handleMenuKeyDown("escape");
  });

  const abilityKeys = ["shift", "space", "e", "r"];
  for (const key of abilityKeys) {
    const slot = document.getElementById(
      key === "shift" ? "abilitySlotShift" :
      key === "space" ? "abilitySlotSpace" :
      key === "e" ? "abilitySlotE" : "abilitySlotR"
    );
    if (!slot) continue;
    let pointerId = null;
    slot.addEventListener("pointerdown", event => {
      event.preventDefault();
      const skillId = skillBindings[key];
      if (MOBILE_POINT_TARGET_SKILLS.has(skillId)) {
        armMobilePointTarget(skillId, key);
        return;
      }

      clearMobilePointTargetMode();
      pointerId = event.pointerId;
      slot.setPointerCapture(event.pointerId);
      const point = mobileAimCanvasPoint();
      mouseCanvasX = point.x;
      mouseCanvasY = point.y;
      inputController.queueCommand("useActiveSkill", { key });
    });
    slot.addEventListener("pointermove", event => {
      if (pointerId !== event.pointerId) return;
      const rect = slot.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy);
      if (length <= 7) return;
      mobileAimDx = dx / length;
      mobileAimDy = dy / length;
      const point = mobileAimCanvasPoint();
      mouseCanvasX = point.x;
      mouseCanvasY = point.y;
      updateAttackAimFromPointer(point.x, point.y);
    });
    const releaseSkill = event => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      const skillId = skillBindings[key];
      if (skillId === "focusFire") {
        inputController.queueCommand("releaseFocusFire", { key });
      } else if (skillId === "fireball") {
        inputController.queueCommand("releaseFireball", { key });
      }
    };
    slot.addEventListener("pointerup", releaseSkill);
    slot.addEventListener("pointercancel", releaseSkill);
  }

  canvas.addEventListener("pointerdown", handleMobilePointTargetPointerDown);
}

installMobileControls();

const HUNTER_SNARE_MOVEMENT_KEYS = new Set([
  "w",
  "a",
  "s",
  "d"
]);

function noteHunterSnareMovementCommand(key) {
  if (
    !player.hunterSnareSetting ||
    !HUNTER_SNARE_MOVEMENT_KEYS.has(key)
  ) {
    return false;
  }

  // A movement key that was already held before Snare began does not create a
  // fresh keydown here (repeat events are ignored). Releasing/re-pressing it,
  // or pressing another movement key, is a new command and cancels setup.
  cancelHunterSnarePlacement(true);
  return true;
}


function handleCanvasMouseMove(event) {
  const pointer = getCanvasPointerPosition(event);
  mouseCanvasX = pointer.x;
  mouseCanvasY = pointer.y;

  if (
    !inventoryOpen &&
    !shopOpen &&
    !craftingOpen &&
    equippedWeapon() === "bow" &&
    (player.bowDrawing || player.focusFireCharging)
  ) {
    updateAttackAimFromPointer(
      pointer.x,
      pointer.y
    );
  }

  updateCanvasCursor();
}

canvas.addEventListener("mousemove", handleCanvasMouseMove);

const HOTBAR_KEY_TO_INDEX = Object.freeze({
  "4": 0,
  "5": 1,
  "6": 2,
  "7": 3,
  "8": 4
});

const DEBUG_ARROW_GRANT = 99;

function grantBowVisualTest() {
  if (!playerOwnsItem("weapon_bow")) {
    grantInventoryItem(
      "weapon_bow",
      1
    );
  }

  equipWeaponIndex(6);

  player.bowDrawing = false;
  player.bowDrawAmount = 0;
  player.bowReleaseTime = 0;

  let requestedServerArrows = false;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    requestedServerArrows =
      onlineClient.requestDebugArrows();
  }

  // Offline/local fallback. In multiplayer the server owns arrow totals.
  if (!requestedServerArrows) {
    player.arrows =
      Math.max(0, Math.floor(Number(player.arrows) || 0)) +
      DEBUG_ARROW_GRANT;

    spawnFloatingText(
      player.x,
      player.y - 50,
      `+${DEBUG_ARROW_GRANT} ARROWS`,
      "#e9e1c7",
      0.9
    );
  }

  spawnFloatingText(
    player.x,
    player.y - 38,
    "BOW TEST",
    "#f0d77d",
    1.0
  );

  updateInventoryUi();
  updateHotbar();

  if (
    typeof onlineClient !== "undefined"
  ) {
    onlineClient.sendLocalState(true);
  }
}

const DEBUG_COIN_GRANT = 10;

function grantDebugProgressionPoints() {
  player.skillPoints += 5;
  player.abilityPoints += 3;

  spawnFloatingText(
    player.x,
    player.y - 38,
    "+5 SP",
    "#ffe070",
    1.0
  );

  spawnFloatingText(
    player.x,
    player.y - 48,
    "+3 AP",
    "#e5b8ff",
    1.0
  );

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.requestDebugCoins();
  } else {
    player.coins += DEBUG_COIN_GRANT;

    spawnFloatingText(
      player.x,
      player.y - 58,
      `+${DEBUG_COIN_GRANT} COINS`,
      "#ffd760",
      1.0
    );

    updateShopUi();
  }

  updateInventoryUi();
}

function handleMenuKeyDown(key) {
  if (beachQuestOpen) {
    if (key === "escape") setBeachQuestOpen(false);
    return true;
  }

  // The class-reset crystal uses a focused confirmation prompt. While it is
  // open, do not let gameplay/menu keys leak through underneath it.
  if (classResetConfirmOpen) {
    if (key === "escape" || key === "n") {
      setClassResetConfirmOpen(false);
      return true;
    }

    if (key === "y" || key === "enter") {
      setClassResetConfirmOpen(false);
      resetClassAndSkills();
      return true;
    }

    return true;
  }

  if (key !== "escape") {
    return false;
  }

  // Rain Cloud is a committed summon. Do not allow the inventory/menu to open
  // mid-channel, because that exposes equipment/hotbar mutations while the
  // player is meant to be action-locked.
  if (player.rainCloudCasting) {
    return true;
  }

  // Escape acts as the universal menu key. If a contextual station/shop is
  // open, close that first. Otherwise toggle the main inventory/menu overlay.
  if (craftingOpen) {
    setCraftingOpen(false);
    return true;
  }

  if (shopOpen) {
    setShopOpen(false);
    return true;
  }

  setInventoryOpen(!inventoryOpen);
  return true;
}


function handleWeaponHotkey(key) {
  if (key === "1" || key === "2" || key === "3") {
    sanitizeUtilityHotbarAssignments();
    const itemId = player.utilityHotbarAssignments?.[Number(key) - 1] || null;
    if (itemId) useConsumable(itemId);
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(HOTBAR_KEY_TO_INDEX, key)) {
    inputController.queueCommand("equipWeapon", {
      index: HOTBAR_KEY_TO_INDEX[key]
    });
    return true;
  }

  if (key === "0") {
    inputController.queueCommand("equipWeapon", {
      index: -1
    });
    return true;
  }

  return false;
}

function handleGameKeyDown(event) {
  const key = event.key.toLowerCase();
  const activeSkillKey = normalizeActiveSkillKey(event);

  if (event.repeat) return;

  // Escape is the game's menu key. Prevent any browser-level handling from
  // competing with the game UI.
  if (key === "escape") {
    event.preventDefault();
  }

  if (handleMenuKeyDown(key)) return;

  // TEST CHEAT: grant/equip the Wood Bow and add 99 arrows.
  if (key === "f8") {
    event.preventDefault();
    grantBowVisualTest();
    return;
  }

  // TEST CHEAT: same AP/SP rewards as one normal level-up, without level/EXP.
  if (key === "f9") {
    event.preventDefault();
    grantDebugProgressionPoints();
    return;
  }
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen) {
    inputController.setKey(key, false);
    return;
  }

  if (
    HUNTER_SNARE_MOVEMENT_KEYS.has(key) &&
    !inputController.keys[key]
  ) {
    noteHunterSnareMovementCommand(key);
  }

  inputController.setKey(key, true);

  if (key === "f") {
    inputController.queueCommand(
      "interact"
    );
    return;
  }

  if (activeSkillKey === "space") {
    event.preventDefault();
  }

  if (handleActiveSkillKeyDown(event, activeSkillKey)) return;
  handleWeaponHotkey(key);
}

window.addEventListener("keydown", handleGameKeyDown);

function handleGameKeyUp(event) {
  const key = event.key.toLowerCase();
  const activeSkillKey = normalizeActiveSkillKey(event);
  inputController.setKey(key, false);

  if (
    activeSkillKey &&
    skillBindings[activeSkillKey] === "focusFire"
  ) {
    if (activeSkillKey === "space") {
      event.preventDefault();
    }

    // Queue the release even if the key was tapped between animation frames.
    // The command queue preserves keydown -> keyup order, so Focus Fire cannot
    // become stuck charging from an extremely quick tap.
    inputController.queueCommand(
      "releaseFocusFire",
      { key: activeSkillKey }
    );
  }

  if (
    activeSkillKey &&
    skillBindings[activeSkillKey] === "fireball"
  ) {
    if (activeSkillKey === "space") {
      event.preventDefault();
    }

    inputController.queueCommand(
      "releaseFireball",
      { key: activeSkillKey }
    );
  }

}

window.addEventListener("keyup", handleGameKeyUp);

// Left click chooses the nearest CARDINAL attack direction.
// We avoid arbitrary rotations so the tiny pixel sword stays crisp.












canvas.addEventListener("mousedown", event => {
  if (
    mobileControlsEnabled &&
    performance.now() < mobilePointTargetSuppressMouseUntil
  ) {
    return;
  }
  handlePrimaryAttack(event);
});
window.addEventListener("mouseup", handleBowVisualMouseUp);

function resetInputAfterFocusLoss() {
  cancelHunterSnarePlacement(false);
  clearMobilePointTargetMode();
  setMobileAutoAttackEnabled(false, { quiet: true });

  // A key released while another tab/window owns focus does not reliably send
  // keyup back to the game. Clear every held input so the player cannot keep
  // walking (or execute a queued action) while the page is unfocused.
  inputController.clearKeys();
  inputController.clearCommands();
  primaryAttackHeld = false;
  pendingBasicAttack = null;

  if (player.bowDrawing) {
    player.bowDrawing = false;
    player.bowReleaseTime = 0;
    player.bowDrawAmount = 0;
  }

  if (focusFireIsCasting()) {
    cancelFocusFire();
  }

  if (fireballIsAiming()) {
    cancelFireballAim();
  }

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    onlineClient.sendLocalState(true);
  }
}

window.addEventListener("blur", resetInputAfterFocusLoss);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetInputAfterFocusLoss();
    return;
  }

  // HP/enemy state stayed authoritative while hidden; old floating numbers do
  // not need to be replayed when rendering resumes.
  damageNumbers.length = 0;
});
window.addEventListener("pagehide", resetInputAfterFocusLoss);
