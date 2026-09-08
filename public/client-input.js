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
let mobilePointTargetSuppressMouseUntil = 0;
let mobileBuildCursorWorldX = null;
let mobileBuildCursorWorldY = null;
let mobileBuildCursorMapId = null;
let mobileBuildCursorSuppressMouseUntil = 0;
let mobileAutoBowTarget = null;
let mobileTrackedBowEnemy = null;
let mobileAutoAttackEnabled = false;
let mobileAutoAttackBowDrawing = false;

const MOBILE_COMBAT_ASSIST_MELEE_DISTANCE = 62;
const MOBILE_BOW_VISIBLE_TARGET_DISTANCE = 320;


function mobileBuildModeActive() {
  return Boolean(
    mobileControlsEnabled &&
    typeof selectedBuildPiece !== "undefined" &&
    selectedBuildPiece
  );
}

function mobileBuildCursorWorldPoint() {
  if (!mobileBuildModeActive()) return null;

  // v430: selecting a placeable only puts it in the player's hand. Mobile
  // placement does not invent a target/ghost until the player deliberately
  // taps the world. A map transition also clears any stale target rather than
  // silently creating a new one in front of the player.
  if (mobileBuildCursorMapId !== null && mobileBuildCursorMapId !== currentMapId) {
    mobileBuildCursorWorldX = null;
    mobileBuildCursorWorldY = null;
    mobileBuildCursorMapId = null;
    document.body.classList.remove("mobile-build-cursor-mode");
    updateMobilePrimaryActionButton();
    return null;
  }
  if (mobileBuildCursorWorldX === null || mobileBuildCursorWorldY === null) return null;
  return {
    x: mobileBuildCursorWorldX,
    y: mobileBuildCursorWorldY
  };
}

function setMobileBuildCursorWorldPoint(worldX, worldY) {
  if (!mobileBuildModeActive()) return false;
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
  mobileBuildCursorWorldX = worldX;
  mobileBuildCursorWorldY = worldY;
  mobileBuildCursorMapId = currentMapId;
  return true;
}

function setMobileBuildCursorFromCanvasPoint(point) {
  if (!point || !mobileBuildModeActive()) return false;
  return setMobileBuildCursorWorldPoint(
    currentCamX + Number(point.x),
    currentCamY + Number(point.y)
  );
}

function clearMobileBuildCursor() {
  mobileBuildCursorWorldX = null;
  mobileBuildCursorWorldY = null;
  mobileBuildCursorMapId = null;
  document.body.classList.remove("mobile-build-cursor-mode");
}

function beginMobileBuildCursorForSelectedPiece() {
  if (!mobileBuildModeActive()) {
    clearMobileBuildCursor();
    return false;
  }

  clearMobilePointTargetMode();
  if (mobileAutoAttackEnabled) setMobileAutoAttackEnabled(false, { quiet: true });

  // v430: holding a Floor/Wall/Door/Torch/Chest/Table is now a clean "held"
  // state. The placement cursor, ghost preview and nudge arrows remain dormant
  // until the first world tap establishes an intentional target.
  mobileBuildCursorWorldX = null;
  mobileBuildCursorWorldY = null;
  mobileBuildCursorMapId = null;
  document.body.classList.remove("mobile-build-cursor-mode");
  updateMobilePrimaryActionButton();
  return true;
}

function nudgeMobileBuildCursor(dx, dy) {
  if (!mobileBuildModeActive()) return false;
  const cursor = mobileBuildCursorWorldPoint();
  if (!cursor) return false;

  // Floor cells live on the 16px build grid. Wall/Door targeting needs the
  // half-cell step so one tap can move from a floor centre to a specific edge.
  const step = (["woodFloor", "stoneFloor", "chest", "craftingTable"].includes(selectedBuildPiece) || selectedBuildPiece === "torch") ? 16 : 8;
  return setMobileBuildCursorWorldPoint(
    cursor.x + Number(dx) * step,
    cursor.y + Number(dy) * step
  );
}

function handleMobileBuildCursorPointerDown(event) {
  if (!mobileBuildModeActive()) return;
  if (event.button !== undefined && event.button !== 0) return;

  const point = getCanvasPointerPosition(event);
  if (!setMobileBuildCursorFromCanvasPoint(point)) return;

  event.preventDefault();
  clearMobilePointTargetMode();
  mobileBuildCursorSuppressMouseUntil = performance.now() + 550;

  // Keep the shared pointer coordinates in sync for cursor/UI helpers, while
  // the actual build target remains stored in world coordinates so moving the
  // character/camera cannot drag the preview around.
  mouseCanvasX = point.x;
  mouseCanvasY = point.y;
  document.body.classList.add("mobile-build-cursor-mode");
  updateMobilePrimaryActionButton();
  updateCanvasCursor();
}

function clearMobilePointTargetMode() {
  mobilePointTargetMode = null;
  document.body.classList.remove("mobile-point-targeting");
  document.getElementById("mobileAttackButton")
    ?.classList.remove("point-target-armed");

  const hint = document.getElementById("mobileTargetHint");
  if (hint) hint.textContent = "";
}

function armMobilePointTarget(mode) {
  if (!mobileControlsEnabled || mode !== "bow") return false;

  if (mobilePointTargetMode === "bow") {
    clearMobilePointTargetMode();
    return false;
  }

  clearMobilePointTargetMode();
  mobilePointTargetMode = "bow";
  document.body.classList.add("mobile-point-targeting");

  const hint = document.getElementById("mobileTargetHint");
  if (hint) hint.textContent = "TAP WHERE THE ARROW SHOULD GO";
  document.getElementById("mobileAttackButton")
    ?.classList.add("point-target-armed");
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
    shopOpen ||
    beachQuestOpen ||
    mobilePointTargetMode ||
    player.rainCloudCasting ||
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
  if (!mobileControlsEnabled || String(payload.mode || "") !== "bow") return false;

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

  if (equippedWeapon() !== "bow" || getLocalCarriedHurlObject()) return true;
  handlePrimaryAttack(mobilePointerEventForCanvas(point));
  mobileAutoAttackBowDrawing = false;
  mobileTrackedBowEnemy = null;
  mobileAutoBowTarget = player.bowDrawing ? target : null;
  return true;
}

function handleMobilePointTargetPointerDown(event) {
  if (!mobileControlsEnabled || !mobilePointTargetMode || event.button !== 0) return;
  if (shopOpen || beachQuestOpen) {
    clearMobilePointTargetMode();
    return;
  }

  event.preventDefault();
  const pointer = getCanvasPointerPosition(event);
  const payload = {
    mode: mobilePointTargetMode,
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
      if (!rock || rock.depleted) continue;
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

function updateMobilePrimaryActionButton() {
  const button = document.getElementById("mobileAttackButton");
  if (!button) return;
  const buildMode = typeof selectedBuildPiece !== "undefined" && Boolean(selectedBuildPiece);
  const cursorActive = Boolean(
    buildMode &&
    mobileControlsEnabled &&
    mobileBuildCursorWorldX !== null &&
    mobileBuildCursorWorldY !== null &&
    mobileBuildCursorMapId === currentMapId
  );
  button.classList.toggle("build-place-mode", buildMode);
  button.textContent = buildMode ? "PLACE" : "ATK";
  button.setAttribute("aria-label", buildMode ? "Place building piece" : "Attack");
  document.body.classList.toggle("mobile-build-selected-mode", Boolean(buildMode && mobileControlsEnabled));
  document.body.classList.toggle("mobile-build-cursor-mode", cursorActive);
  const nudgePad = document.getElementById("mobileBuildNudgePad");
  if (nudgePad) nudgePad.setAttribute("aria-hidden", cursorActive ? "false" : "true");
  if (buildMode) button.classList.remove("point-target-armed");
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
    shopOpen ||
    beachQuestOpen ||
    mobilePointTargetMode ||
    player.rainCloudCasting ||
    fireballIsAiming() ||
    getLocalCarriedHurlObject()
  ) {
    return false;
  }

  const weapon = equippedWeapon();
  if (!weapon) return false;

  // v377: Fire Wand and Rain Wand own aimed/channelled primary actions. AUTO
  // intentionally stays off those actions so it cannot choose cast locations.
  if (weapon === "wand" || weapon === "rainWand" || weapon === "tigerPaw") return false;

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
  const buildNudgePad = document.getElementById("mobileBuildNudgePad");
  if (!pad || !knob || !attack || !autoAttack || !interact || !menu || !buildNudgePad) return;

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


  for (const button of buildNudgePad.querySelectorAll("[data-build-nudge]")) {
    button.addEventListener("pointerdown", event => {
      if (!mobileBuildModeActive()) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = button.dataset.buildNudge;
      const delta =
        direction === "up" ? [0, -1] :
        direction === "right" ? [1, 0] :
        direction === "down" ? [0, 1] :
        direction === "left" ? [-1, 0] :
        null;
      if (delta) nudgeMobileBuildCursor(delta[0], delta[1]);
    });
  }

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

    // v394: mobile building owns a world-space cursor independent of player
    // movement/camera movement. PLACE confirms that exact cursor target; it
    // never invokes combat assist or derives a fresh point from the character.
    if (mobileBuildModeActive()) {
      clearMobilePointTargetMode();
      if (mobileAutoAttackEnabled) setMobileAutoAttackEnabled(false, { quiet: true });
      const cursor = mobileBuildCursorWorldPoint();
      if (cursor && typeof tryPlaceSelectedBuildPieceAtWorld === "function") {
        tryPlaceSelectedBuildPieceAtWorld(cursor.x, cursor.y);
      }
      return;
    }

    if (
      equippedWeapon() === "bow" &&
      !getLocalCarriedHurlObject() &&
      !player.rainCloudCasting &&
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
    const weapon = equippedWeapon();
    if (!mobileAutoAttackEnabled && !weapon) {
      spawnFloatingText(player.x, player.y - 27, "EQUIP A WEAPON", "#ffe38b", 0.72);
      return;
    }
    if (!mobileAutoAttackEnabled && (weapon === "wand" || weapon === "rainWand" || weapon === "tigerPaw")) {
      spawnFloatingText(player.x, player.y - 27, weapon === "tigerPaw" ? "MANUAL HURL" : "MANUAL CAST", "#ffe38b", 0.72);
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

  canvas.addEventListener("pointerdown", handleMobilePointTargetPointerDown);
  canvas.addEventListener("pointerdown", handleMobileBuildCursorPointerDown);
}

installMobileControls();
updateMobilePrimaryActionButton();

function handleCanvasMouseMove(event) {
  const pointer = getCanvasPointerPosition(event);
  mouseCanvasX = pointer.x;
  mouseCanvasY = pointer.y;

  if (
    !shopOpen &&
    equippedWeapon() === "bow" &&
    player.bowDrawing
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
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
  "7": 6,
  "8": 7,
  "9": 8,
  "0": 9
});

function handleMenuKeyDown(key) {
  if (beachQuestOpen) {
    if (key === "escape") setBeachQuestOpen(false);
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

  // v422: Escape toggles the regular Menu independently from Craft. Focused
  // contextual/modal screens still close first.
  if (shopOpen) {
    setShopOpen(false);
    return true;
  }

  setInventoryOpen(!inventoryOpen);
  return true;
}


function handleWeaponHotkey(key) {
  if (Object.prototype.hasOwnProperty.call(HOTBAR_KEY_TO_INDEX, key)) {
    inputController.queueCommand("equipWeapon", {
      index: HOTBAR_KEY_TO_INDEX[key]
    });
    return true;
  }


  return false;
}

function handleGameKeyDown(event) {
  const key = event.key.toLowerCase();

  if (event.repeat) return;

  // Escape is the game's menu key. Prevent any browser-level handling from
  // competing with the game UI.
  if (key === "escape") {
    event.preventDefault();
  }

  if (handleMenuKeyDown(key)) return;

  if (shopOpen || beachQuestOpen) {
    inputController.setKey(key, false);
    return;
  }

  inputController.setKey(key, true);

  if (key === "f") {
    inputController.queueCommand(
      "interact"
    );
    return;
  }
  handleWeaponHotkey(key);
}

window.addEventListener("keydown", handleGameKeyDown);

function handleGameKeyUp(event) {
  const key = event.key.toLowerCase();
  inputController.setKey(key, false);
}

window.addEventListener("keyup", handleGameKeyUp);

// Left click chooses the nearest CARDINAL attack direction.
// We avoid arbitrary rotations so the tiny pixel sword stays crisp.












canvas.addEventListener("mousedown", event => {
  if (
    mobileControlsEnabled &&
    (
      performance.now() < mobilePointTargetSuppressMouseUntil ||
      performance.now() < mobileBuildCursorSuppressMouseUntil
    )
  ) {
    return;
  }
  handlePrimaryAttack(event);
});

window.addEventListener("mouseup", handleBowVisualMouseUp);

function resetInputAfterFocusLoss() {
  clearMobilePointTargetMode();
  clearMobileBuildCursor();
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
