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
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen) {
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












canvas.addEventListener("mousedown", handlePrimaryAttack);
window.addEventListener("mouseup", handleBowVisualMouseUp);

function resetInputAfterFocusLoss() {
  cancelHunterSnarePlacement(false);

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
