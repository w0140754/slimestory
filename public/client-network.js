// Slime Story client networking / connection runtime.
// Extracted from game.js in v6-11-240 with the OnlineClient class body preserved verbatim.
// Classic-script semantics are intentional: methods resolve shared game.js bindings at invocation time,
// after startup has initialized the gameplay/runtime state.

class OnlineClient {
  constructor() {
    this.socket = null;
    this.localPlayerId = null;
    this.remotePlayers = new Map();
    this.sharedCoins = new Map();
    this.sharedResources = new Map();
    this.sendAccumulator = 0;
    this.sendInterval = 0.10; // compact motion can still update at 10 Hz
    this.lastLocalStateSnapshot = null;
    this.lastLocalMotionJson = null;
    this.lastSentMapId = null;
    this.lastFullStateSentAt = 0;
    this.fullStateSafetyHeartbeatMs = 10000;
    this.lastTransientReplicationState = null;
    this.lastAimQuantized = null;
    this.lastAimSentAt = 0;
    this.connected = false;
    this.reconnectTimer = null;
    this.statusEl = document.getElementById("onlineStatus");
    this.serverBuildVersion = null;
    this.playerCount = 1;
    this.autoReloadScheduled = false;
  }

  buildStatusText() {
    const serverBuild =
      this.serverBuildVersion || "?";

    const worldVersion =
      Number.isFinite(Number(WORLD_CONTENT?.version))
        ? Number(WORLD_CONTENT.version)
        : "?";

    return `ONLINE · ${this.playerCount} · C${CLIENT_BUILD_VERSION}/S${serverBuild} · W${worldVersion}`;
  }

  setStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  clearAutoReloadMarker() {
    try {
      sessionStorage.removeItem(
        CLIENT_AUTO_RELOAD_SIGNATURE_KEY
      );
    } catch {
      // Session storage can fail in some private / restricted contexts.
    }
  }

  scheduleAutoReloadForMismatch(
    statusText,
    signature
  ) {
    if (this.autoReloadScheduled) return;

    try {
      const previousSignature = sessionStorage.getItem(
        CLIENT_AUTO_RELOAD_SIGNATURE_KEY
      );

      if (
        signature &&
        previousSignature === signature
      ) {
        console.warn(
          "Version mismatch persisted after one forced reload; leaving current page loaded to avoid a reload loop.",
          signature
        );
        return;
      }

      if (signature) {
        sessionStorage.setItem(
          CLIENT_AUTO_RELOAD_SIGNATURE_KEY,
          signature
        );
      }
    } catch {
      // Ignore storage failures and still attempt a one-off reload.
    }

    this.autoReloadScheduled = true;
    this.setStatus(statusText);

    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set(
        "reload_ts",
        String(Date.now())
      );

      if (signature) {
        url.searchParams.set(
          "reload_sig",
          String(signature)
            .replace(/[^a-zA-Z0-9_.:-]/g, "_")
            .slice(0, 120)
        );
      }

      window.location.replace(url.toString());
    }, 350);
  }

  connect() {
    if (window.location.protocol === "file:") {
      this.setStatus("OFFLINE · RUN npm start");
      return;
    }

    const protocol =
      window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    this.setStatus("CONNECTING…");

    try {
      this.socket = new WebSocket(url);
    } catch (error) {
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.playerCount = 1;
      this.setStatus(this.buildStatusText());
      this.sendLocalState(true);
    });

    this.socket.addEventListener("message", event => {
      this.handleMessage(event.data);
    });

    this.socket.addEventListener("close", () => {
      this.connected = false;

      // Once authority is gone, discard any player Burned status that had
      // been mirrored from the server. Disconnected local fire remains a
      // visual/environment simulation and cannot reapply it.
      clearLocalBurnStatus(player);

      this.localPlayerId = null;
      this.lastLocalStateSnapshot = null;
      this.lastLocalMotionJson = null;
      this.lastSentMapId = null;
      this.lastFullStateSentAt = 0;
      this.lastTransientReplicationState = null;
      this.lastAimQuantized = null;
      this.lastAimSentAt = 0;
      this.remotePlayers.clear();
      this.sharedCoins.clear();
      this.sharedResources.clear();
        cancelPendingMapEnemySync();
      this.removeSharedCoinVisuals();
      this.removeSharedResourceVisuals();
      this.setStatus("RECONNECTING…");
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      // close() triggers reconnect handling.
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  handleMessage(raw) {
    let message;

    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "welcome") {
      this.localPlayerId = message.id;
      ensureEntityId(player, `player:${message.id}`);
      applyWorldClockSnapshot(message.worldClock);
      this.serverBuildVersion =
        typeof message.buildVersion === "string"
          ? message.buildVersion
          : null;

      const buildMismatch =
        this.serverBuildVersion &&
        this.serverBuildVersion !== CLIENT_BUILD_VERSION;

      const worldContentMismatch =
        Number.isFinite(message.worldContentVersion) &&
        message.worldContentVersion !==
          WORLD_CONTENT?.version;

      const combatBalanceMismatch =
        Number.isFinite(message.combatBalanceVersion) &&
        message.combatBalanceVersion !==
          COMBAT_BALANCE?.version;

      if (buildMismatch) {
        console.error(
          "BUILD VERSION MISMATCH",
          {
            client: CLIENT_BUILD_VERSION,
            server: this.serverBuildVersion
          }
        );
      }

      if (worldContentMismatch) {
        console.error(
          "WORLD CONTENT VERSION MISMATCH",
          {
            client:
              WORLD_CONTENT?.version,
            server:
              message.worldContentVersion
          }
        );
      }

      if (combatBalanceMismatch) {
        console.error(
          "COMBAT BALANCE VERSION MISMATCH",
          {
            client:
              COMBAT_BALANCE?.version,
            server:
              message.combatBalanceVersion
          }
        );
      }

      if (
        buildMismatch ||
        worldContentMismatch ||
        combatBalanceMismatch
      ) {
        const reloadSignature = [
          this.serverBuildVersion || "?",
          Number.isFinite(message.worldContentVersion)
            ? message.worldContentVersion
            : "?",
          Number.isFinite(message.combatBalanceVersion)
            ? message.combatBalanceVersion
            : "?"
        ].join("|");

        this.scheduleAutoReloadForMismatch(
          "NEW VERSION DETECTED · RELOADING…",
          reloadSignature
        );
      } else {
        this.clearAutoReloadMarker();
        this.setStatus(this.buildStatusText());
      }

      const restoringPersistentState =
        sendLocalPersistentStateToServer(this.socket);

      if (!restoringPersistentState) {
        if (Number.isFinite(message.coins)) {
          player.coins = message.coins;
        }

        if (Number.isFinite(message.wood)) {
          player.wood = message.wood;
        }

        if (Number.isFinite(message.stone)) {
          player.stone = message.stone;
        }

        if (Number.isFinite(message.whiteFlowers)) player.whiteFlowers = message.whiteFlowers;
        if (Number.isFinite(message.blueFlowers)) player.blueFlowers = message.blueFlowers;
        if (Number.isFinite(message.healingPotions)) player.healingPotions = message.healingPotions;
        if (Number.isFinite(message.attackPotions)) player.attackPotions = message.attackPotions;
        if (Number.isFinite(message.magicPotions)) player.magicPotions = message.magicPotions;
        if (Number.isFinite(message.healingPotionCooldownUntil)) player.healingPotionCooldownUntil = message.healingPotionCooldownUntil;
        if (Number.isFinite(message.attackPotionCooldownUntil)) player.attackPotionCooldownUntil = message.attackPotionCooldownUntil;
        if (Number.isFinite(message.magicPotionCooldownUntil)) player.magicPotionCooldownUntil = message.magicPotionCooldownUntil;
        if (Number.isFinite(message.attackPotionUntil)) player.attackPotionUntil = message.attackPotionUntil;
        if (Number.isFinite(message.magicPotionUntil)) player.magicPotionUntil = message.magicPotionUntil;

        if (Number.isFinite(message.goldSlimeBubbles)) {
          player.goldSlimeBubbles = message.goldSlimeBubbles;
        }

        if (Number.isFinite(message.arrows)) {
          player.arrows = message.arrows;
        }
      }


      if (Number.isFinite(message.maxHp)) {
        player.maxHp = message.maxHp;
      }

      if (Number.isFinite(message.hp)) {
        player.hp = message.hp;
      }

      updateInventoryUi();
      return;
    }

    if (message.type === "arrowUseResult") {
      if (Number.isFinite(message.totalArrows)) {
        player.arrows = Math.max(0, Math.floor(message.totalArrows));
        updateInventoryUi();
      }
      return;
    }

    if (message.type === "craftResult") {
      this.handleCraftResult(message);
      return;
    }

    if (message.type === "consumableUseResult") {
      const successfulPotion = message.success && CONSUMABLE_ITEM_IDS.includes(message.item);
      if (Number.isFinite(message.hp)) player.hp = message.hp;
      if (Number.isFinite(message.maxHp)) player.maxHp = message.maxHp;
      if (Number.isFinite(message.totalHealingPotions)) player.healingPotions = message.totalHealingPotions;
      if (Number.isFinite(message.totalAttackPotions)) player.attackPotions = message.totalAttackPotions;
      if (Number.isFinite(message.totalMagicPotions)) player.magicPotions = message.totalMagicPotions;
      if (Number.isFinite(message.healingPotionCooldownUntil)) player.healingPotionCooldownUntil = message.healingPotionCooldownUntil;
      if (Number.isFinite(message.attackPotionCooldownUntil)) player.attackPotionCooldownUntil = message.attackPotionCooldownUntil;
      if (Number.isFinite(message.magicPotionCooldownUntil)) player.magicPotionCooldownUntil = message.magicPotionCooldownUntil;
      if (Number.isFinite(message.attackPotionUntil)) player.attackPotionUntil = message.attackPotionUntil;
      if (Number.isFinite(message.magicPotionUntil)) player.magicPotionUntil = message.magicPotionUntil;
      if (!message.success && message.reason === "fullHp") spawnFloatingText(player.x, player.y - 42, "HP FULL", "#f6c8df", 0.8);
      if (successfulPotion) triggerPotionFeedback(message.item, player.x, player.y);
      updateInventoryUi();
      updateHotbar();
      saveLocalCharacterState(true);
      return;
    }

    if (message.type === "shopPurchaseResult") {
      this.handleShopPurchaseResult(
        message
      );
      return;
    }

    if (message.type === "persistentStateRestored") {
      if (Number.isFinite(message.coins)) player.coins = Math.max(0, Math.floor(message.coins));
      if (Number.isFinite(message.wood)) player.wood = Math.max(0, Math.floor(message.wood));
      if (Number.isFinite(message.stone)) player.stone = Math.max(0, Math.floor(message.stone));
      if (Number.isFinite(message.whiteFlowers)) player.whiteFlowers = Math.max(0, Math.floor(message.whiteFlowers));
      if (Number.isFinite(message.blueFlowers)) player.blueFlowers = Math.max(0, Math.floor(message.blueFlowers));
      if (Number.isFinite(message.healingPotions)) player.healingPotions = Math.max(0, Math.floor(message.healingPotions));
      if (Number.isFinite(message.attackPotions)) player.attackPotions = Math.max(0, Math.floor(message.attackPotions));
      if (Number.isFinite(message.magicPotions)) player.magicPotions = Math.max(0, Math.floor(message.magicPotions));
      if (Number.isFinite(message.healingPotionCooldownUntil)) player.healingPotionCooldownUntil = message.healingPotionCooldownUntil;
      if (Number.isFinite(message.attackPotionCooldownUntil)) player.attackPotionCooldownUntil = message.attackPotionCooldownUntil;
      if (Number.isFinite(message.magicPotionCooldownUntil)) player.magicPotionCooldownUntil = message.magicPotionCooldownUntil;
      if (Number.isFinite(message.attackPotionUntil)) player.attackPotionUntil = message.attackPotionUntil;
      if (Number.isFinite(message.magicPotionUntil)) player.magicPotionUntil = message.magicPotionUntil;
      if (Number.isFinite(message.goldSlimeBubbles)) {
        player.goldSlimeBubbles = Math.max(0, Math.floor(message.goldSlimeBubbles));
      }
      if (Number.isFinite(message.arrows)) player.arrows = Math.max(0, Math.floor(message.arrows));
      if (Number.isFinite(message.woodFloors)) player.woodFloors = Math.max(0, Math.floor(message.woodFloors));
      if (Number.isFinite(message.stoneFloors)) player.stoneFloors = Math.max(0, Math.floor(message.stoneFloors));
      if (Number.isFinite(message.woodWalls)) player.woodWalls = Math.max(0, Math.floor(message.woodWalls));
      if (Number.isFinite(message.woodDoors)) player.woodDoors = Math.max(0, Math.floor(message.woodDoors));
      if (Number.isFinite(message.greenJellyCubes)) player.greenJellyCubes = Math.max(0, Math.floor(message.greenJellyCubes));
      if (Number.isFinite(message.torches)) player.torches = Math.max(0, Math.floor(message.torches));
      if (Number.isFinite(message.chests)) player.chests = Math.max(0, Math.floor(message.chests));
      if (Number.isFinite(message.craftingTables)) player.craftingTables = Math.max(0, Math.floor(message.craftingTables));
      if (typeof message.beachQuestStage === "string") player.beachQuest.stage = message.beachQuestStage;
      if (Number.isFinite(message.beachQuestFirstCrabKills)) player.beachQuest.firstCrabKills = Math.max(0, Math.floor(message.beachQuestFirstCrabKills));
      if (Number.isFinite(message.beachQuestSecondCrabKills)) player.beachQuest.secondCrabKills = Math.max(0, Math.floor(message.beachQuestSecondCrabKills));
      if (Number.isFinite(message.beachQuestIcedCoffee)) player.beachQuest.icedCoffee = Math.max(0, Math.min(1, Math.floor(message.beachQuestIcedCoffee)));
      if (typeof message.myrtleQuestStage === "string") player.myrtleQuest.stage = message.myrtleQuestStage;

      updateInventoryUi();
      updateShopUi();
      saveLocalCharacterState(true);
      return;
    }

    if (message.type === "snapshot") {
      this.applyPlayerMapSnapshot(
        message.mapId,
        message.players
      );
      return;
    }

    if (message.type === "playerState") {
      this.receiveRemotePlayer(message.player);
      return;
    }

    if (message.type === "playerMove") {
      this.receiveRemotePlayerMove(message);
      return;
    }

    if (message.type === "playerStateDelta") {
      this.receiveRemotePlayerDelta(
        message.player
      );
      return;
    }

    if (message.type === "playerAction") { this.applyRemotePlayerAction(message); return; }
    if (message.type === "playerAim") { this.applyRemotePlayerAim(message); return; }
    if (message.type === "playerWetState") {
      const remote = message.id === this.localPlayerId ? player : this.remotePlayers.get(message.id);
      if (remote) remote.wetTime = Math.max(0, Number(message.wetTime) || 0);
      return;
    }

    if (message.type === "playerConsumableEffect") {
      if (message.playerId !== this.localPlayerId && CONSUMABLE_ITEM_IDS.includes(message.item)) {
        const remote = this.remotePlayers.get(message.playerId);
        if (remote && remote.mapId === currentMapId) {
          spawnPotionUseEffect(message.item, remote.x, remote.y);
        }
      }
      return;
    }


    if (message.type === "playerLeft") {
      removeRemoteCasterEffectsForOwner(
        message.id
      );

      this.remotePlayers.delete(message.id);
      return;
    }

    if (message.type === "enemySnapshot") {
      this.applySharedEnemySnapshot(message);
      return;
    }

    if (message.type === "enemyMotion") {
      this.applySharedEnemyMotion(message);
      return;
    }

    if (message.type === "enemyWanderIntent") {
      this.applySharedEnemyWanderIntent(message);
      return;
    }

    if (message.type === "enemyHealthDelta") {
      this.applySharedEnemyHealthDelta(message);
      return;
    }

    if (message.type === "enemyStateDelta") {
      this.applySharedEnemyStateDelta(message);
      return;
    }

    if (message.type === "enemySnapshotSyncComplete") {
      if (message.mapId === currentMapId) {
        finishMapEnemySync(message.mapId);
      }
      return;
    }










    if (message.type === "enemyDamage") {
      this.handleSharedEnemyDamage(message);
      return;
    }

    if (message.type === "enemyKilled") {
      this.handleSharedEnemyKilled(message);
      return;
    }

    if (message.type === "playerDamage") {
      this.handlePlayerDamage(message);
      return;
    }

    if (message.type === "playerRespawn") {
      this.handlePlayerRespawn(message);
      return;
    }

    if (message.type === "visualEffect") {
      this.handleVisualEffect(message);
      return;
    }

    if (message.type === "transientActionSnapshot") {
      applyTransientActionSnapshot(message);
      return;
    }

    if (message.type === "rainFieldDelta") {
      applyRainFieldDelta(message);
      return;
    }

    if (message.type === "environmentSnapshot") {
      this.applyEnvironmentSnapshot(
        message.entities,
        message.mapId,
        Boolean(message.sparse)
      );
      return;
    }

    if (message.type === "environmentPatch") {
      this.applyEnvironmentPatch(message.entities);
      return;
    }

    if (message.type === "structureSnapshot") {
      applyStructureSnapshot(
        message.mapId,
        message.structures,
        message.removedWorldStructureIds,
        message.worldStructureStates
      );
      return;
    }

    if (message.type === "structurePlaced") {
      applyStructurePlaced(message.structure);
      return;
    }

    if (message.type === "structureRemoved") {
      applyStructureRemoved(message.mapId, message.structureId);
      return;
    }

    if (message.type === "structureState") {
      applyStructureState(message.mapId, message.structureId, message.state);
      return;
    }

    if (message.type === "structureDestroyResult") {
      if (!message.success) {
        const text = message.reason === "needPickaxe" ? "NEED PICKAXE" : message.reason === "wallAttached" ? "REMOVE WALL FIRST" : message.reason === "objectAttached" ? "REMOVE OBJECT FIRST" : message.reason === "inUse" ? "CHEST IN USE" : message.reason === "lootFirst" ? "LOOT CHEST FIRST" : "TOO FAR";
        spawnFloatingText(player.x, player.y - 30, text, "#ffe38b", 0.7);
      }
      return;
    }

    if (message.type === "structurePlaceResult") {
      if (Number.isFinite(message.totalWoodFloors)) player.woodFloors = Math.max(0, Math.floor(message.totalWoodFloors));
    if (Number.isFinite(message.totalStoneFloors)) player.stoneFloors = Math.max(0, Math.floor(message.totalStoneFloors));
      if (Number.isFinite(message.totalWoodWalls)) player.woodWalls = Math.max(0, Math.floor(message.totalWoodWalls));
      if (Number.isFinite(message.totalWoodDoors)) player.woodDoors = Math.max(0, Math.floor(message.totalWoodDoors));
      if (Number.isFinite(message.totalTorches)) player.torches = Math.max(0, Math.floor(message.totalTorches));
      if (Number.isFinite(message.totalChests)) player.chests = Math.max(0, Math.floor(message.totalChests));
      if (Number.isFinite(message.totalCraftingTables)) player.craftingTables = Math.max(0, Math.floor(message.totalCraftingTables));
      // v389: invalid building placement is intentionally quiet. The placement
      // preview already communicates where a piece can go; failed clicks should
      // not spam floating BLOCKED / PLACE ON FLOOR / TOO FAR notes.
      if (message.success && buildPieceCount(message.kind) <= 0) cancelBuildPlacement(true);
      updateInventoryUi();
      saveLocalCharacterState(true);
      return;
    }

    if (message.type === "resourceSnapshot") {
      this.applyResourceSnapshot(
        message.resources
      );
      return;
    }

    if (message.type === "resourceSpawn") {
      this.receiveSharedResource(
        message.resource
      );
      return;
    }

    if (message.type === "resourceRemoved") {
      this.removeSharedResource(
        message.resourceId
      );
      return;
    }

    if (message.type === "resourcePicked") {
      this.handleResourcePicked(message);
      return;
    }

    if (message.type === "chestContextResult") {
      applyChestContextResult(message);
      return;
    }

    if (message.type === "chestContextClosed") {
      applyChestContextClosed(message);
      return;
    }

    if (message.type === "chestTakeResult") {
      applyChestTakeResult(message);
      return;
    }

    if (message.type === "chestTakeAllResult") {
      applyChestTakeAllResult(message);
      return;
    }

    if (message.type === "chestStoreResult") { applyChestStoreResult(message); return; }
    if (message.type === "inventoryDropResult") { applyInventoryDropResult(message); return; }


    if (message.type === "beachQuestState") {
      applyBeachQuestState(message);
      return;
    }

    if (message.type === "myrtleQuestState") {
      applyMyrtleQuestState(message);
      return;
    }

    if (message.type === "beachQuestProgress") {
      player.beachQuest.stage = message.stage || player.beachQuest.stage;
      player.beachQuest.firstCrabKills = Math.max(0, Math.floor(Number(message.firstCrabKills) || 0));
      player.beachQuest.secondCrabKills = Math.max(0, Math.floor(Number(message.secondCrabKills) || 0));
      player.beachQuest.icedCoffee = Math.max(0, Math.floor(Number(message.icedCoffee) || 0));
      if (beachQuestOpen && beachQuestView) onlineClient.requestBeachGirlQuest("talk");
      saveLocalCharacterState(true);
      return;
    }

    if (message.type === "playerIgnited") {
      this.handlePlayerIgnited(message);
      return;
    }

    if (message.type === "coinSnapshot") {
      this.applyCoinSnapshot(message.coins);
      return;
    }

    if (message.type === "coinSpawn") {
      this.receiveSharedCoin(message.coin);
      return;
    }

    if (message.type === "coinRemoved") {
      this.removeSharedCoin(message.coinId);
      return;
    }

    if (message.type === "coinPicked") {
      this.handleCoinPicked(message);
      return;
    }

    if (message.type === "presence") {
      const count = Math.max(1, Number(message.count) || 1);
      this.playerCount = count;
      this.setStatus(this.buildStatusText());
    }
  }

  findEnvironmentEntity(
    entityId,
    mapId = null
  ) {
    const mapEntries = mapId
      ? [[mapId, mapStates[mapId]]]
      : Object.entries(mapStates);

    for (const [, state] of mapEntries) {
      if (!state) continue;

      for (const collection of [
        state.trees || [],
        state.tallGrass || [],
        state.rocks || [],
        state.harvestFlowers || []
      ]) {
        const entity = collection.find(
          item =>
            item.entityId === entityId
        );

        if (entity) {
          return entity;
        }
      }
    }

    return null;
  }

  applyEnvironmentEntityState(
    state,
    animateRegrowth = true
  ) {
    if (!state || !state.id) return;

    const entity =
      this.findEnvironmentEntity(
        state.id,
        state.mapId
      );

    if (!entity) return;

    entity.serverControlled = true;

    if (state.kind === "tree") {
      const oldHp = entity.hp;
      const oldX = entity.x;
      const oldY = entity.y;
      const wasRemoved = Boolean(entity.removed);

      const wasDepleted =
        Boolean(
          entity.isStump ||
          entity.falling ||
          entity.canopyBurned ||
          (
            Number.isFinite(entity.hp) &&
            Number.isFinite(entity.maxHp) &&
            entity.hp < entity.maxHp
          )
        );

      entity.hp =
        Number.isFinite(state.hp)
          ? state.hp
          : entity.hp;

      entity.maxHp =
        Number.isFinite(state.maxHp)
          ? state.maxHp
          : entity.maxHp;

      if (Number.isFinite(state.x)) entity.x = Number(state.x);
      if (Number.isFinite(state.y)) entity.y = Number(state.y);

      entity.isStump =
        Boolean(state.isStump);

      entity.removed = Boolean(state.removed);

      entity.falling =
        Boolean(state.falling);

      entity.fallTime = Math.max(
        0,
        Number(state.fallTime) || 0
      );

      entity.fallDuration =
        Number(state.fallDuration) ||
        entity.fallDuration;

      entity.fallDirection =
        state.fallDirection === -1
          ? -1
          : 1;

      entity.canopyBurnTime =
        Math.max(
          0,
          Number(state.canopyBurnTime) || 0
        );

      entity.canopyBurnDuration =
        Number(state.canopyBurnDuration) ||
        entity.canopyBurnDuration;

      entity.canopyBurned =
        Boolean(state.canopyBurned);

      if (Number.isFinite(state.canopyVariant)) {
        entity.canopyVariant =
          state.canopyVariant;
      }

      if (
        Number.isFinite(oldHp) &&
        entity.hp < oldHp &&
        !entity.falling
      ) {
        entity.shakeTime = 0.18;
      }

      const isFreshNow =
        !entity.removed &&
        !entity.isStump &&
        !entity.falling &&
        !entity.canopyBurned &&
        entity.canopyBurnTime <= 0 &&
        entity.hp >= entity.maxHp;

      if (
        animateRegrowth &&
        (wasDepleted || wasRemoved || oldX !== entity.x || oldY !== entity.y) &&
        isFreshNow &&
        state.mapId === currentMapId
      ) {
        spawnTreeRegrowBurst(
          entity
        );
      }

      return;
    }

    if (state.kind === "rock") {
      const oldRockHp = Math.max(0, Number(entity.hp) || Number(entity.maxHp) || 3);
      const oldRockDepleted = Boolean(entity.depleted);

      entity.homeX = Number.isFinite(state.homeX) ? state.homeX : entity.homeX;
      entity.homeY = Number.isFinite(state.homeY) ? state.homeY : entity.homeY;
      entity.variant = state.variant || entity.variant || "plain";
      entity.maxHp = Math.max(1, Math.floor(Number(state.maxHp) || Number(entity.maxHp) || 3));
      entity.hp = Math.max(0, Math.min(entity.maxHp, Math.floor(Number(state.hp) || 0)));
      entity.depleted = Boolean(state.depleted) || entity.hp <= 0;

      if (Number.isFinite(Number(state.x))) entity.x = Number(state.x);
      if (Number.isFinite(Number(state.y))) entity.y = Number(state.y);

      if (
        animateRegrowth &&
        entity.hp < oldRockHp &&
        state.mapId === currentMapId &&
        typeof spawnRockChipBurst === "function"
      ) {
        spawnRockChipBurst(entity, entity.depleted);
      }

      if (
        animateRegrowth &&
        oldRockDepleted &&
        !entity.depleted &&
        state.mapId === currentMapId &&
        typeof spawnRockChipBurst === "function"
      ) {
        spawnRockChipBurst(entity, false);
      }

      return;
    }

    const grassWasDepleted =
      state.kind === "grass" &&
      Boolean(
        entity.cut ||
        entity.burnt
      );

    entity.cut = Boolean(state.cut);
    entity.burnt = Boolean(state.burnt);
    entity.burnTime = Math.max(
      0,
      Number(state.burnTime) || 0
    );

    if (Number.isFinite(state.burnDuration)) {
      entity.burnDuration =
        state.burnDuration;
    }

    if (
      animateRegrowth &&
      state.kind === "grass" &&
      grassWasDepleted &&
      !entity.cut &&
      !entity.burnt &&
      state.mapId === currentMapId
    ) {
      spawnGrassRegrowBurst(
        entity
      );
    }

    if (state.kind === "flower") {
      entity.looted = Boolean(state.looted);

      if (state.flowerType) {
        entity.type =
          state.flowerType;
      }
    }
  }

  resetEnvironmentMapToDefaults(mapId) {
    const state = mapStates[mapId];
    if (!state) return;
    for (const tree of state.trees || []) {
      tree.serverControlled = true;
      tree.maxHp = Number.isFinite(tree.maxHp) ? tree.maxHp : 4;
      tree.hp = tree.maxHp;
      tree.isStump = false;
      tree.removed = false;
      tree.falling = false;
      tree.fallTime = 0;
      tree.fallDirection = 1;
      tree.canopyBurnTime = 0;
      tree.canopyBurned = false;
    }
    for (const grass of state.tallGrass || []) {
      grass.serverControlled = true;
      grass.cut = false;
      grass.burnt = false;
      grass.burnTime = 0;
    }
    for (const rock of state.rocks || []) {
      rock.serverControlled = true;
      rock.maxHp = Math.max(1, Math.floor(Number(rock.maxHp) || 3));
      rock.hp = rock.maxHp;
      rock.depleted = false;
      rock.x = Number.isFinite(rock.homeX) ? rock.homeX : rock.x;
      rock.y = Number.isFinite(rock.homeY) ? rock.homeY : rock.y;
    }
    for (const flower of state.harvestFlowers || []) {
      flower.serverControlled = true;
      flower.cut = false;
      flower.burnt = false;
      flower.burnTime = 0;
      flower.looted = false;
    }
  }

  applyEnvironmentSnapshot(states, mapId = currentMapId, sparse = false) {
    if (sparse && typeof mapId === "string") {
      this.resetEnvironmentMapToDefaults(mapId);
    }
    for (const state of states || []) {
      this.applyEnvironmentEntityState(state, false);
    }
  }

  applyEnvironmentPatch(states) {
    for (const state of states || []) {
      this.applyEnvironmentEntityState(
        state,
        true
      );
    }
  }

  sendEnvironmentAction(
    action,
    entity = null,
    payload = {}
  ) {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "environmentAction",
      action,
      entityId:
        entity?.entityId || null,
      payload
    }));

    return true;
  }

  receiveSharedResource(serverResource) {
    if (
      !serverResource ||
      !serverResource.id
    ) {
      return;
    }

    this.sharedResources.set(
      serverResource.id,
      {
        id: serverResource.id,
        mapId: serverResource.mapId,
        kind: serverResource.kind,
        x: Number(serverResource.x) || 0,
        y: Number(serverResource.y) || 0,
        flowerType:
          serverResource.flowerType ||
          "white",
        itemToken: typeof serverResource.itemToken === "string" ? serverResource.itemToken : null,
        itemCount: Math.max(1, Math.floor(Number(serverResource.itemCount) || 1)),
        ownerId: typeof serverResource.ownerId === "string" ? serverResource.ownerId : null,
        life: Math.max(
          0,
          Number(serverResource.life) || 0
        )
      }
    );

    this.syncSharedResourceVisuals();
  }

  applyResourceSnapshot(resources) {
    const incomingIds = new Set();

    for (const resource of resources || []) {
      if (!resource?.id) continue;

      incomingIds.add(resource.id);
      this.receiveSharedResource(resource);
    }

    for (
      const resourceId
      of [...this.sharedResources.keys()]
    ) {
      if (!incomingIds.has(resourceId)) {
        this.sharedResources.delete(
          resourceId
        );
      }
    }

    this.syncSharedResourceVisuals();
  }

  removeSharedResource(resourceId) {
    this.sharedResources.delete(resourceId);

    for (
      let i = woodDrops.length - 1;
      i >= 0;
      i--
    ) {
      if (
        woodDrops[i].shared &&
        woodDrops[i].entityId === resourceId
      ) {
        woodDrops.splice(i, 1);
      }
    }

    for (
      let i = flowerDrops.length - 1;
      i >= 0;
      i--
    ) {
      if (
        flowerDrops[i].shared &&
        flowerDrops[i].entityId === resourceId
      ) {
        flowerDrops.splice(i, 1);
      }
    }

    for (let i = specialResourceDrops.length - 1; i >= 0; i--) {
      if (specialResourceDrops[i].entityId === resourceId) {
        specialResourceDrops.splice(i, 1);
      }
    }
  }

  removeSharedResourceVisuals() {
    for (
      let i = woodDrops.length - 1;
      i >= 0;
      i--
    ) {
      if (woodDrops[i].shared) {
        woodDrops.splice(i, 1);
      }
    }

    for (
      let i = flowerDrops.length - 1;
      i >= 0;
      i--
    ) {
      if (flowerDrops[i].shared) {
        flowerDrops.splice(i, 1);
      }
    }

    specialResourceDrops.length = 0;
  }

  syncSharedResourceVisuals() {
    // Remove visuals that no longer exist server-side or belong to another map.
    for (
      let i = woodDrops.length - 1;
      i >= 0;
      i--
    ) {
      const drop = woodDrops[i];
      if (!drop.shared) continue;

      const resource =
        this.sharedResources.get(
          drop.entityId
        );

      if (
        !resource ||
        resource.kind !== "wood" ||
        resource.mapId !== currentMapId ||
        resource.life <= 0
      ) {
        woodDrops.splice(i, 1);
      }
    }

    for (
      let i = flowerDrops.length - 1;
      i >= 0;
      i--
    ) {
      const drop = flowerDrops[i];
      if (!drop.shared) continue;

      const resource =
        this.sharedResources.get(
          drop.entityId
        );

      if (
        !resource ||
        resource.kind !== "flower" ||
        resource.mapId !== currentMapId ||
        resource.life <= 0
      ) {
        flowerDrops.splice(i, 1);
      }
    }

    for (let i = specialResourceDrops.length - 1; i >= 0; i--) {
      const drop = specialResourceDrops[i];
      const resource = this.sharedResources.get(drop.entityId);

      if (
        !resource ||
        !(SPECIAL_RESOURCE_DROP_PROFILES[resource.kind] || resource.kind === "inventoryItem") ||
        resource.mapId !== currentMapId ||
        resource.life <= 0
      ) {
        specialResourceDrops.splice(i, 1);
      }
    }

    // Create missing visuals and update existing ones in place so transient
    // client fields such as pickupRequestCooldown are preserved.
    for (
      const resource
      of this.sharedResources.values()
    ) {
      if (
        resource.mapId !== currentMapId ||
        (resource.ownerId && resource.ownerId !== this.localPlayerId) ||
        resource.life <= 0
      ) {
        continue;
      }

      if (resource.kind === "wood") {
        let drop = woodDrops.find(
          item =>
            item.shared &&
            item.entityId === resource.id
        );

        if (!drop) {
          drop = {
            x: resource.x,
            y: resource.y,
            life: resource.life,
            shared: true,
            entityId: resource.id,
            mapId: resource.mapId,
            ownerId: resource.ownerId || null,
            pickupRequestCooldown: 0
          };

          woodDrops.push(drop);
        } else {
          drop.x = resource.x;
          drop.y = resource.y;
          drop.life = resource.life;
          drop.mapId = resource.mapId;
          drop.ownerId = resource.ownerId || null;
        }

        continue;
      }

      if (SPECIAL_RESOURCE_DROP_PROFILES[resource.kind] || resource.kind === "inventoryItem") {
        let drop = specialResourceDrops.find(
          item => item.entityId === resource.id
        );

        if (!drop) {
          drop = {
            x: resource.x,
            y: resource.y,
            kind: resource.kind,
            itemToken: resource.itemToken || null,
            itemCount: Math.max(1, Math.floor(Number(resource.itemCount) || 1)),
            life: resource.life,
            shared: true,
            entityId: resource.id,
            mapId: resource.mapId,
            pickupRequestCooldown: 0
          };
          specialResourceDrops.push(drop);
        } else {
          drop.x = resource.x;
          drop.y = resource.y;
          drop.itemToken = resource.itemToken || null;
          drop.itemCount = Math.max(1, Math.floor(Number(resource.itemCount) || 1));
          drop.life = resource.life;
          drop.mapId = resource.mapId;
        }

        continue;
      }

      if (resource.kind !== "flower") {
        continue;
      }

      let drop = flowerDrops.find(
        item =>
          item.shared &&
          item.entityId === resource.id
      );

      if (!drop) {
        drop = {
          x: resource.x,
          y: resource.y,
          type: resource.flowerType,
          life: resource.life,
          shared: true,
          entityId: resource.id,
          mapId: resource.mapId,
          pickupRequestCooldown: 0
        };

        flowerDrops.push(drop);
      } else {
        drop.x = resource.x;
        drop.y = resource.y;
        drop.type = resource.flowerType;
        drop.life = resource.life;
        drop.mapId = resource.mapId;
      }
    }
  }

  requestResourcePickup(resourceId) {
    if (
      !resourceId ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "resourcePickup",
      resourceId
    }));

    return true;
  }

  requestInventoryDrop(token, count, x, y) {
    if (typeof token !== "string" || !token || !Number.isFinite(Number(count)) || Number(count) <= 0 || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "inventoryDrop", token, count: Math.floor(Number(count)), x, y }));
    return true;
  }

  requestBeachGirlQuest(action = "talk") {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "beachQuestInteract",
      action
    }));
    return true;
  }

  requestMyrtleQuest(action = "talk") {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "myrtleQuestInteract",
      action
    }));
    return true;
  }



  requestArrowUse() {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "arrowUse"
    }));

    return true;
  }

  requestChestContextOpen(chestId) {
    if (
      typeof chestId !== "string" ||
      !chestId ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    this.socket.send(JSON.stringify({ type: "chestContextOpen", chestId }));
    return true;
  }

  requestChestContextClose(chestId) {
    if (
      typeof chestId !== "string" ||
      !chestId ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    this.socket.send(JSON.stringify({ type: "chestContextClose", chestId }));
    return true;
  }

  requestChestTakeItem(chestId, token) {
    if (typeof chestId !== "string" || !chestId || typeof token !== "string" || !token || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "chestTakeItem", chestId, token }));
    return true;
  }

  requestChestTakeAll(chestId) {
    if (typeof chestId !== "string" || !chestId || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "chestTakeAll", chestId }));
    return true;
  }

  requestChestStoreItem(chestId, token, count) {
    if (typeof chestId !== "string" || !chestId || typeof token !== "string" || !token || !Number.isFinite(Number(count)) || Number(count) <= 0 || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "chestStoreItem", chestId, token, count: Math.floor(Number(count)) }));
    return true;
  }

  requestCraft(recipe) {
    if (
      !recipe ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "craftRequest",
      recipe
    }));

    return true;
  }

  requestStructurePlacement(kind, x, y, edge = null, supportId = null) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const payload = { type: "structurePlace", kind, x, y };
    if (["woodWall", "woodDoor"].includes(kind) && ["north", "east", "south", "west"].includes(edge)) payload.edge = edge;
    if (kind === "torch" && typeof supportId === "string" && supportId) payload.supportId = supportId;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  requestStructureDestroy(structureId) {
    if (!structureId || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "structureDestroy", structureId }));
    return true;
  }

  requestConsumableUse(item) {
    if (!item || !this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "consumableUse", item }));
    return true;
  }

  requestShopPurchase(itemId, vendor) {
    if (
      !itemId ||
      !vendor ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "shopPurchase",
      itemId,
      vendor
    }));

    return true;
  }

  handleShopPurchaseResult(message) {
    const itemId = typeof message.itemId === "string" ? message.itemId : null;
    player.shopPurchasePending = null;
    if (Number.isFinite(message.totalCoins)) player.coins = Math.max(0, Math.floor(message.totalCoins));
    if (Number.isFinite(message.totalArrows)) player.arrows = Math.max(0, Math.floor(message.totalArrows));

    if (message.success && itemId) {
      if (ALL_EQUIPMENT_ITEM_IDS.has(itemId)) {
        grantInventoryItem(itemId, 1);
      }
      spawnFloatingText(player.x, player.y - 30, "PURCHASED!", "#ffe38b", 0.85);
      updateShopUi();
      updateInventoryUi();
      updateHotbar();
      saveLocalCharacterState(true);
      return;
    }

    if (message.reason === "needCoin") {
      const need = Math.max(1, Number(message.price) || 1);
      spawnFloatingText(player.x, player.y - 30, `NEED ${need} COINS`, "#ffe38b", 0.85);
    } else if (message.reason === "needLevel") {
      spawnFloatingText(player.x, player.y - 30, `REQUIRES LV ${Math.max(1, Number(message.level) || 1)}`, "#ffe38b", 0.85);
    } else if (message.reason === "tooFar") {
      spawnFloatingText(player.x, player.y - 30, "MOVE CLOSER", "#ffe38b", 0.85);
    } else if (message.reason === "alreadyOwned") {
      spawnFloatingText(player.x, player.y - 30, "ALREADY OWNED", "#ffe38b", 0.85);
    } else if (!message.success) {
      spawnFloatingText(player.x, player.y - 30, "PURCHASE FAILED", "#ffe38b", 0.85);
    }
    updateShopUi();
  }

  handleCraftResult(message) {
    // Clear the matching pending state as soon as the server answers. This keeps
    // the crafting menu recoverable even if client/server recipe metadata ever
    // drifts again.
    if (player.benchCraftPending === message.recipe) {
      player.benchCraftPending = null;
    }

    const recipe =
      CRAFT_RECIPES[message.recipe];

    if (!recipe) {
      updateCraftingUi();
      return;
    }

    player.benchCraftPending = null;
    const beforeHotbarCounts = hotbarAssignableAcquisitionSnapshot();

    if (message.resourceKind === "inventoryItem" && typeof message.itemToken === "string") {
      const token = message.itemToken;
      const amount = Math.max(1, Math.floor(Number(message.itemCount) || 1));
      const parts = inventoryTransferTokenParts(token);
      if (parts?.type === "resource" && Number.isFinite(message.playerCount)) player[parts.id] = Math.max(0, Math.floor(Number(message.playerCount)));
      else if (parts?.type === "item") applyInventoryTransferDelta(token, amount, { autoAssign: true });
    }

    if (Number.isFinite(message.totalWood)) {
      player.wood = message.totalWood;
    }
    if (Number.isFinite(message.totalStone)) player.stone = message.totalStone;
    if (Number.isFinite(message.totalWhiteFlowers)) player.whiteFlowers = message.totalWhiteFlowers;
    if (Number.isFinite(message.totalBlueFlowers)) player.blueFlowers = message.totalBlueFlowers;
    if (Number.isFinite(message.totalHealingPotions)) player.healingPotions = message.totalHealingPotions;
    if (Number.isFinite(message.totalAttackPotions)) player.attackPotions = message.totalAttackPotions;
    if (Number.isFinite(message.totalMagicPotions)) player.magicPotions = message.totalMagicPotions;
    if (Number.isFinite(message.totalWoodFloors)) player.woodFloors = Math.max(0, Math.floor(message.totalWoodFloors));
    if (Number.isFinite(message.totalStoneFloors)) player.stoneFloors = Math.max(0, Math.floor(message.totalStoneFloors));
    if (Number.isFinite(message.totalWoodWalls)) player.woodWalls = Math.max(0, Math.floor(message.totalWoodWalls));
    if (Number.isFinite(message.totalWoodDoors)) player.woodDoors = Math.max(0, Math.floor(message.totalWoodDoors));
    if (Number.isFinite(message.totalGreenJellyCubes)) player.greenJellyCubes = Math.max(0, Math.floor(message.totalGreenJellyCubes));
    if (Number.isFinite(message.totalTorches)) player.torches = Math.max(0, Math.floor(message.totalTorches));
    if (Number.isFinite(message.totalChests)) player.chests = Math.max(0, Math.floor(message.totalChests));
    if (Number.isFinite(message.totalCraftingTables)) player.craftingTables = Math.max(0, Math.floor(message.totalCraftingTables));

    if (Number.isFinite(message.totalArrows)) {
      player.arrows = Math.max(0, Math.floor(message.totalArrows));
    }

    if (message.success) {
      if (recipe.resourceKey) {
        const totalField = {
          wood: "totalWood",
          arrows: "totalArrows",
          healingPotions: "totalHealingPotions",
          attackPotions: "totalAttackPotions",
          magicPotions: "totalMagicPotions",
          woodFloors: "totalWoodFloors",
          stoneFloors: "totalStoneFloors",
          woodWalls: "totalWoodWalls",
          woodDoors: "totalWoodDoors",
          greenJellyCubes: "totalGreenJellyCubes",
          torches: "totalTorches",
          chests: "totalChests",
          craftingTables: "totalCraftingTables"
        }[recipe.resourceKey];
        if (!totalField || !Number.isFinite(message[totalField])) {
          player[recipe.resourceKey] =
            Math.max(0, Number(player[recipe.resourceKey]) || 0) +
            Math.max(1, Number(recipe.outputCount) || 1);
        }
      } else {
        if (recipe.storyKey) player.story[recipe.storyKey] = true;

        grantInventoryItem(
          recipe.itemId,
          1
        );

        equipCraftedRecipe(recipe);
      }

      autoAssignNewlyAcquiredHotbarItems(beforeHotbarCounts);

      // v427: crafting is deliberately quiet. The recipe card/count changes are
      // the feedback; no world-space success popup is emitted.
      updateCraftingUi();
      updateInventoryUi();
      updateHotbar();
      return;
    }

    // v427: all craft-result popups are silent. One-time recipe reconciliation
    // still repairs local ownership if the authoritative server reports it.
    if (message.reason === "alreadyCrafted") {
      if (recipe.storyKey) player.story[recipe.storyKey] = true;
      if (recipe.itemId && !playerOwnsItem(recipe.itemId)) grantInventoryItem(recipe.itemId, 1);
      updateInventoryUi();
      updateHotbar();
    }

    updateCraftingUi();
  }

  handleResourcePicked(message) {
    let pickupVisual = null;

    if (message.collectorId === this.localPlayerId) {
      if (message.resourceKind === "wood") {
        pickupVisual = woodDrops.find(
          drop => drop.shared && drop.entityId === message.resourceId
        ) || null;
      } else if (message.resourceKind === "flower") {
        pickupVisual = flowerDrops.find(
          drop => drop.shared && drop.entityId === message.resourceId
        ) || null;
      } else {
        pickupVisual = specialResourceDrops.find(
          drop => drop.entityId === message.resourceId
        ) || null;
      }
    }

    if (pickupVisual) {
      spawnLootPickupAnimation(
        message.resourceKind,
        pickupVisual.x,
        pickupVisual.y,
        {
          entityId: message.resourceId,
          flowerType: pickupVisual.type,
          itemToken: pickupVisual.itemToken || message.itemToken || null
        }
      );
    }

    this.removeSharedResource(
      message.resourceId
    );

    if (
      message.collectorId !==
      this.localPlayerId
    ) {
      return;
    }

    const beforeHotbarCounts = hotbarAssignableAcquisitionSnapshot();

    if (Number.isFinite(message.totalWood)) {
      player.wood =
        message.totalWood;
    }

    if (Number.isFinite(message.totalStone)) {
      player.stone = message.totalStone;
    }

    if (Number.isFinite(message.totalWhiteFlowers)) player.whiteFlowers = message.totalWhiteFlowers;
    if (Number.isFinite(message.totalBlueFlowers)) player.blueFlowers = message.totalBlueFlowers;

    if (Number.isFinite(message.totalGoldSlimeBubbles)) {
      player.goldSlimeBubbles = message.totalGoldSlimeBubbles;
    }
    if (Number.isFinite(message.totalWoodFloors)) player.woodFloors = Math.max(0, Math.floor(message.totalWoodFloors));
    if (Number.isFinite(message.totalStoneFloors)) player.stoneFloors = Math.max(0, Math.floor(message.totalStoneFloors));
    if (Number.isFinite(message.totalWoodWalls)) player.woodWalls = Math.max(0, Math.floor(message.totalWoodWalls));
    if (Number.isFinite(message.totalWoodDoors)) player.woodDoors = Math.max(0, Math.floor(message.totalWoodDoors));
    if (Number.isFinite(message.totalGreenJellyCubes)) player.greenJellyCubes = Math.max(0, Math.floor(message.totalGreenJellyCubes));
    if (Number.isFinite(message.totalTorches)) player.torches = Math.max(0, Math.floor(message.totalTorches));
    if (Number.isFinite(message.totalChests)) player.chests = Math.max(0, Math.floor(message.totalChests));
    if (Number.isFinite(message.totalCraftingTables)) player.craftingTables = Math.max(0, Math.floor(message.totalCraftingTables));

    if (message.resourceKind === "icedCoffee" && Number.isFinite(message.beachQuestIcedCoffee)) {
      player.beachQuest.icedCoffee = Math.max(0, Math.min(1, Math.floor(message.beachQuestIcedCoffee)));
      spawnFloatingText(player.x, player.y - 42, "FOUND IT!", "#e8d6b4", 1.2);
      saveLocalCharacterState(true);
    }


    autoAssignNewlyAcquiredHotbarItems(beforeHotbarCounts);
    updateInventoryUi();
    updateHotbar();
  }

  handlePlayerIgnited(message) {
    const target =
      this.playerForNetworkId(
        message.targetId
      );

    if (!target) return;

    const syncedBurnTime = Number(message.burnTime);

    if (!Number.isFinite(syncedBurnTime)) {
      return;
    }

    if (syncedBurnTime <= 0) {
      target.burnTime = 0;
      if (message.targetId === this.localPlayerId) {
        player.burnTickTimer = 0;
      }
      return;
    }

    // Wet and Burn are mutually exclusive. The server is authoritative, but
    // this guard prevents a stale/out-of-order ignition packet from creating
    // an impossible local Wet + Burn state.
    if ((Number(target.wetTime) || 0) > 0) {
      return;
    }

    target.burnTime = Math.max(
      Number(target.burnTime) || 0,
      syncedBurnTime
    );

    if (
      message.targetId ===
      this.localPlayerId
    ) {
      player.burnTickTimer =
        player.burnTickInterval;
    }
  }

  applyPlayerMapSnapshot(mapId, players) {
    const snapshotMapId =
      typeof mapId === "string"
        ? mapId
        : currentMapId;

    // A map-entry snapshot is authoritative for who is actually present there.
    // Drop stale cached players from this map before applying the current list.
    for (const [remoteId, remote] of this.remotePlayers.entries()) {
      if (remote?.mapId === snapshotMapId) {
        removeRemoteCasterEffectsForOwner(remoteId);
        this.remotePlayers.delete(remoteId);
      }
    }

    for (const remote of players || []) {
      this.receiveRemotePlayer(remote);
    }
  }

  receiveRemotePlayerMove(message) {
    if (!message || message.id === this.localPlayerId || !Array.isArray(message.p)) return;
    const state = this.remotePlayers.get(message.id);
    if (!state) return;
    const [packetX, packetY, packetWalkTime, packetRaisedLeg] = message.p;
    const nextX = Number.isFinite(packetX) ? packetX : state.targetX;
    const nextY = Number.isFinite(packetY) ? packetY : state.targetY;
    if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
      const snapPosition = shouldSnapNetworkPosition(
        state.x, state.y, nextX, nextY, false
      );
      state.targetX = nextX;
      state.targetY = nextY;
      if (snapPosition) { state.x = nextX; state.y = nextY; }
    }
    if (Number.isFinite(packetWalkTime)) state.walkTime = packetWalkTime;
    if (packetRaisedLeg === 0 || packetRaisedLeg === 1) {
      state.firstRaisedLeg = packetRaisedLeg === 1 ? "right" : "left";
    }
  }

  receiveRemotePlayerDelta(remote) {
    if (!remote || remote.id === this.localPlayerId) return;

    const state = this.remotePlayers.get(remote.id);

    // A delta should normally follow a full same-map snapshot/state. If network
    // ordering ever produces a delta first, accept it only when it contains the
    // minimum full-position information needed to initialize safely.
    if (!state) {
      if (
        typeof remote.mapId === "string" &&
        Number.isFinite(remote.x) &&
        Number.isFinite(remote.y)
      ) {
        this.receiveRemotePlayer(remote);
      }
      return;
    }

    const nextX =
      Number.isFinite(remote.x)
        ? remote.x
        : state.targetX;

    const nextY =
      Number.isFinite(remote.y)
        ? remote.y
        : state.targetY;

    if (
      Number.isFinite(nextX) &&
      Number.isFinite(nextY)
    ) {
      const snapPosition =
        shouldSnapNetworkPosition(
          state.x,
          state.y,
          nextX,
          nextY,
          false
        );

      state.targetX = nextX;
      state.targetY = nextY;

      if (snapPosition) {
        state.x = nextX;
        state.y = nextY;
      }
    }

    for (const [key, value] of Object.entries(remote)) {
      if (
        key !== "id" &&
        key !== "x" &&
        key !== "y"
      ) {
        state[key] = value;
      }
    }
  }

  receiveRemotePlayer(remote) {
    if (!remote || remote.id === this.localPlayerId) return;

    let state = this.remotePlayers.get(remote.id);

    const targetX =
      Number(remote.x) || 0;

    const targetY =
      Number(remote.y) || 0;

    if (!state) {
      state = {
        ...remote,
        x: targetX,
        y: targetY,
        targetX,
        targetY
      };

      this.remotePlayers.set(
        remote.id,
        state
      );

      return;
    }

    const mapChanged =
      state.mapId !== remote.mapId;

    if (mapChanged) {
      removeRemoteCasterEffectsForOwner(
        remote.id
      );
    }

    const snapPosition =
      shouldSnapNetworkPosition(
        state.x,
        state.y,
        targetX,
        targetY,
        mapChanged
      );

    state.targetX = targetX;
    state.targetY = targetY;

    if (snapPosition) {
      state.x = targetX;
      state.y = targetY;
    }

    for (
      const [key, value]
      of Object.entries(remote)
    ) {
      if (
        key !== "x" &&
        key !== "y"
      ) {
        state[key] = value;
      }
    }
  }

  receiveSharedCoin(serverCoin) {
    if (!serverCoin || !serverCoin.id) return;

    this.sharedCoins.set(serverCoin.id, {
      id: serverCoin.id,
      mapId: serverCoin.mapId,
      x: Number(serverCoin.x) || 0,
      y: Number(serverCoin.y) || 0,
      life: Math.max(0, Number(serverCoin.life) || 0)
    });

    this.syncSharedCoinVisuals();
  }

  applyCoinSnapshot(serverCoins) {
    const incomingIds = new Set();

    for (const serverCoin of serverCoins || []) {
      if (!serverCoin || !serverCoin.id) continue;
      incomingIds.add(serverCoin.id);
      this.receiveSharedCoin(serverCoin);
    }

    for (const coinId of [...this.sharedCoins.keys()]) {
      if (!incomingIds.has(coinId)) {
        this.sharedCoins.delete(coinId);
      }
    }

    this.syncSharedCoinVisuals();
  }

  removeSharedCoin(coinId) {
    this.sharedCoins.delete(coinId);

    for (let i = coins.length - 1; i >= 0; i--) {
      if (
        coins[i].shared &&
        coins[i].entityId === coinId
      ) {
        coins.splice(i, 1);
      }
    }
  }

  removeSharedCoinVisuals() {
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].shared) {
        coins.splice(i, 1);
      }
    }
  }

  syncSharedCoinVisuals() {
    // Remove shared visuals that are no longer server-owned or belong to a
    // different map. Local goblin/ghost coins are left untouched.
    for (let i = coins.length - 1; i >= 0; i--) {
      const coin = coins[i];

      if (!coin.shared) continue;

      const serverCoin = this.sharedCoins.get(coin.entityId);

      if (
        !serverCoin ||
        serverCoin.mapId !== currentMapId
      ) {
        coins.splice(i, 1);
      }
    }

    for (const serverCoin of this.sharedCoins.values()) {
      if (serverCoin.mapId !== currentMapId) continue;

      let coin = coins.find(item =>
        item.shared &&
        item.entityId === serverCoin.id
      );

      if (!coin) {
        coin = spawnCoin(
          serverCoin.x,
          serverCoin.y,
          {
            shared: true,
            entityId: serverCoin.id,
            mapId: serverCoin.mapId,
            life: serverCoin.life
          }
        );
      } else {
        coin.x = serverCoin.x;
        coin.y = serverCoin.y;
        coin.life = serverCoin.life;
      }
    }
  }

  requestCoinPickup(coinId) {
    if (
      !coinId ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "coinPickup",
      coinId
    }));

    return true;
  }

  handleCoinPicked(message) {
    const pickupVisual =
      message.collectorId === this.localPlayerId
        ? coins.find(
            coin => coin.shared && coin.entityId === message.coinId
          ) || null
        : null;

    if (pickupVisual) {
      spawnLootPickupAnimation(
        "coin",
        pickupVisual.x,
        pickupVisual.y,
        { entityId: message.coinId }
      );
    }

    this.removeSharedCoin(message.coinId);

    if (message.collectorId !== this.localPlayerId) {
      return;
    }

    if (Number.isFinite(message.totalCoins)) {
      player.coins = message.totalCoins;
    } else {
      player.coins += 1;
    }

    updateInventoryUi();
  }

  findSharedEnemy(
    enemyType,
    enemyId,
    mapId = null
  ) {
    const enemy = findClientWorldEnemy(
      enemyId,
      enemyType,
      mapId
    );

    return enemy || null;
  }

  sendSharedEnemyAction(
    enemyType,
    action,
    enemy,
    payload = {}
  ) {
    if (
      !enemy ||
      !enemy.entityId ||
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    const outgoingPayload = payload;

    this.socket.send(JSON.stringify({
      type: "enemyAction",
      enemyType,
      action,
      enemyId: enemy.entityId,
      payload: outgoingPayload
    }));

    return true;
  }

  sendVisualEffect(effect, payload = {}) {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "visualEffect",
      effect,
      payload
    }));

    return true;
  }

  handleVisualEffect(message) {
    if (message.mapId !== currentMapId) {
      return;
    }

    // Most effects are already rendered by their sender and should not echo
    // back. Server-driven shared effects (currently Rain Cloud grass growth)
    // opt into a self echo so the caster sees the exact same authoritative
    // growth events as every other player.
    if (
      message.senderId === this.localPlayerId &&
      !message.serverEcho
    ) {
      return;
    }

    const payload = message.payload || {};

    if (
      message.effect ===
      "ownerTransientCleanup"
    ) {
      removeRemoteCasterEffectsForOwner(
        message.senderId
      );
      return;
    }

    if (message.effect === "basicProjectile") {
      basicProjectiles.push({
        type:
          payload.projectileType === "rainWand"
            ? "rainWand"
            : payload.projectileType === "shepherdStaff"
              ? "shepherdStaff"
              : payload.projectileType === "arrow"
                ? "arrow"
                : "wand",

        x: Number(payload.x) || 0,
        y: Number(payload.y) || 0,
        vx: Number(payload.vx) || 0,
        vy: Number(payload.vy) || 0,

        life: Math.max(
          0.1,
          Number(payload.life) || 1.2
        ),

        visualOnly: true,
        ownerId: message.senderId
      });

      return;
    }


    if (message.effect === "fireball") {
      const startX = Number(payload.startX) || 0;
      const startY = Number(payload.startY) || 0;
      const targetX = Number(payload.targetX) || startX;
      const targetY = Number(payload.targetY) || startY;
      const duration = Math.max(0.18, Number(payload.duration) || 0.4);
      const angle = Math.atan2(targetY - startY, targetX - startX);

      fireballs.push({
        x: startX,
        y: startY,
        startX,
        startY,
        targetX,
        targetY,
        elapsed: 0,
        duration,
        arcHeight: Math.max(0, Number(payload.arcHeight) || 0),
        airborne: true,
        angle,
        vx: Math.cos(angle) * 138,
        vy: Math.sin(angle) * 138,
        life: duration + 0.20,

        trailTimer: 0,
        visualOnly: true,
        ownerId: message.senderId
      });

      return;
    }

    if (message.effect === "fireballImpact") {
      spawnRemoteFireballImpact(
        message.senderId,
        payload
      );
      return;
    }

    if (
      message.effect ===
      "basicProjectileImpact"
    ) {
      spawnRemoteBasicProjectileImpact(
        message.senderId,
        payload
      );
      return;
    }


    if (message.effect === "levelUp") {
      const remote =
        this.remotePlayers.get(
          message.senderId
        );

      const effectX = Number.isFinite(Number(payload.x))
        ? Number(payload.x)
        : Number(remote?.x);
      const effectY = Number.isFinite(Number(payload.y))
        ? Number(payload.y)
        : Number(remote?.y);

      if (!Number.isFinite(effectX) || !Number.isFinite(effectY)) return;

      spawnFloatingText(
        effectX,
        effectY - 38,
        "LEVEL UP!",
        "#ffe070",
        1.35
      );
      spawnLevelUpBurst(effectX, effectY);

      return;
    }

    if (message.effect === "rainCast") {
      spawnRemoteRainCast(
        message.senderId,
        payload
      );
      return;
    }

}

  playerForNetworkId(playerId) {
    if (playerId === this.localPlayerId) {
      return player;
    }

    return this.remotePlayers.get(playerId) || null;
  }

  handlePlayerDamage(message) {
    const target =
      this.playerForNetworkId(message.targetId);

    if (!target) return;

    if (Number.isFinite(message.maxHp)) {
      target.maxHp = message.maxHp;
    }

    if (Number.isFinite(message.hp)) {
      target.hp = message.hp;
    }

    const targetIsDead = Number(target.hp) <= 0;

    const damage = Math.max(
      0,
      Number(message.amount) || 0
    );


    // HP stays synchronized for everyone, but floating combat text only exists
    // on clients currently looking at the map where the hit happened.
    if (
      currentMapId === message.mapId &&
      damage > 0
    ) {
      spawnDamageNumber(
        target.x,
        target.y - 24,
        damage,
        {
          // Burn ticks arrive at 2 Hz. The generic 0.72 s combat-number life
          // overlaps consecutive ticks and makes two half-second ticks read as
          // one burst. Keep Burn numbers shorter without changing damage or
          // network timing.
          duration: message.sourceType === "burn" ? 0.42 : 0.72
        }
      );
    }

    if (message.targetId !== this.localPlayerId) {
      target.isDead = targetIsDead;
      return;
    }

    player.knockbackX =
      Number(message.knockbackX) || 0;

    player.knockbackY =
      Number(message.knockbackY) || 0;

    player.contactCooldown = Math.max(
      player.contactCooldown,
      Number(message.contactCooldown) || 0
    );


    if (targetIsDead) {
      handlePlayerDeath();
    } else {
      player.isDead = false;
      setRespawnButtonVisible(false);
    }
  }

  handlePlayerRespawn(message) {
    const state = message.player;
    if (!state || !state.id) return;

    if (state.id === this.localPlayerId) {
      completePlayerRespawn(state);
      return;
    }

    state.isDead = false;
    this.receiveRemotePlayer(state);
  }


  notifyRespawn() {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      type: "playerRespawn"
    }));

    return true;
  }

  makeLocalPlayerState() {
    return {
      mapId: currentMapId,
      x: player.x,
      y: player.y,
      isDead: player.isDead,

      hatIndex: player.hatIndex,
      shirtIndex: player.shirtIndex,
      pantsIndex: player.pantsIndex,
      charmIndex: player.charmIndex,
      weaponIndex: player.weaponIndex,
      heldBuildPiece: typeof selectedBuildPiece === "string" ? selectedBuildPiece : null,

      level: player.level,

      walkTime: player.walkTime,
      firstRaisedLeg: player.firstRaisedLeg,

      attackTime: player.attackTime,
      attackDuration: player.attackDuration,
      attackDirection: player.attackDirection,
      attackHand: player.attackHand,
      attackAimAngle: player.attackAimAngle,

      bowDrawing: player.bowDrawing,
      bowDrawAmount: player.bowDrawAmount,
      bowDrawDuration: player.bowDrawDuration,
      bowReleaseTime: player.bowReleaseTime,
      bowReleaseDuration: player.bowReleaseDuration,
      fireballAiming: player.fireballAiming,
      fireballAimTime: player.fireballAimTime,
      rainCloudCasting: player.rainCloudCasting,
      rainCloudCastTime: player.rainCloudCastTime,
      rainCloudCastDuration: player.rainCloudCastDuration,

      // Wet and Burn countdowns are server-owned. Their visuals are predicted
      // locally, but they are no longer uploaded in routine playerStatePatch.
      hurlReachTime: player.hurlReachTime,
      hurlReachDuration: player.hurlReachDuration,
      hurlReachDirX: player.hurlReachDirX,
      hurlReachDirY: player.hurlReachDirY
    };
  }

  localMotionPayload(state) {
    return [
      Number.isFinite(state.x) ? Number(state.x.toFixed(2)) : 0,
      Number.isFinite(state.y) ? Number(state.y.toFixed(2)) : 0,
      Number.isFinite(state.walkTime) ? Number(state.walkTime.toFixed(3)) : 0,
      state.firstRaisedLeg === "right" ? 1 : 0
    ];
  }

  localStatePatch(previousState, nextState) {
    const patch = {};
    const movementFields = new Set(["mapId", "x", "y", "walkTime", "firstRaisedLeg"]);
    const transientFields = new Set([
      "attackTime", "attackDuration", "attackDirection", "attackHand", "attackAimAngle",
      "bowDrawing", "bowDrawAmount", "bowDrawDuration", "bowReleaseTime", "bowReleaseDuration",
      "fireballAiming", "fireballAimTime",
      "rainCloudCasting", "rainCloudCastTime", "rainCloudCastDuration",
      "hurlReachTime", "hurlReachDuration", "hurlReachDirX", "hurlReachDirY"
    ]);
    for (const [key, value] of Object.entries(nextState)) {
      if (movementFields.has(key) || transientFields.has(key)) continue;
      if (JSON.stringify(previousState?.[key]) !== JSON.stringify(value)) patch[key] = value;
    }
    return patch;
  }

  sendPlayerAction(data) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: "playerAction", a: data }));
    return true;
  }

  playerDirectionCode(direction) {
    const D = PLAYER_NET_PROTOCOL.DIRECTION;
    if (direction === "right") return D.RIGHT;
    if (direction === "up") return D.UP;
    if (direction === "down") return D.DOWN;
    return D.LEFT;
  }

  currentTransientReplicationState() {
    return {
      attackTime: Math.max(0, Number(player.attackTime) || 0),
      bowDrawing: Boolean(player.bowDrawing),
      bowReleaseTime: Math.max(0, Number(player.bowReleaseTime) || 0),
      fireballAiming: Boolean(player.fireballAiming),
      rainCloudCasting: Boolean(player.rainCloudCasting),
      hurlReachTime: Math.max(0, Number(player.hurlReachTime) || 0)
    };
  }

  syncLocalTransientReplication(force = false) {
    const A = PLAYER_NET_PROTOCOL.ACTION;
    const current = this.currentTransientReplicationState();
    const previous = this.lastTransientReplicationState || {};
    const rose = (key, epsilon = 0.01) => current[key] > 0 && ((Number(previous[key]) || 0) <= 0 || current[key] > (Number(previous[key]) || 0) + epsilon);

    if (rose("attackTime", 0.015)) {
      this.sendPlayerAction([A.ATTACK, Math.round(Math.max(0.05, Number(player.attackDuration) || 0.30) * 1000), this.playerDirectionCode(player.attackDirection), player.attackHand === "right" ? 1 : 0, PLAYER_NET_PROTOCOL.encodeAim(player.attackAimAngle)]);
    }
    if (current.bowDrawing !== Boolean(previous.bowDrawing)) {
      this.sendPlayerAction([A.BOW_DRAW, current.bowDrawing ? 1 : 0, Math.round(Math.max(0.05, Number(player.bowDrawDuration) || 1) * 1000)]);
    }
    if (rose("bowReleaseTime", 0.005)) {
      this.sendPlayerAction([A.BOW_RELEASE, Math.round(Math.max(0.03, Number(player.bowReleaseDuration) || 0.12) * 1000), Math.max(0, Math.min(255, Math.round((Number(player.bowDrawAmount) || 0) * 255))), PLAYER_NET_PROTOCOL.encodeAim(player.attackAimAngle)]);
    }
    if (current.fireballAiming !== Boolean(previous.fireballAiming)) this.sendPlayerAction([A.FIREBALL_AIM, current.fireballAiming ? 1 : 0]);
    if (current.rainCloudCasting !== Boolean(previous.rainCloudCasting)) this.sendPlayerAction([A.RAIN_CAST, current.rainCloudCasting ? 1 : 0, Math.round(Math.max(0.05, Number(player.rainCloudCastDuration) || 0.50) * 1000)]);
    if (rose("hurlReachTime", 0.005)) {
      this.sendPlayerAction([A.HURL_REACH, Math.round(Math.max(0.05, Number(player.hurlReachDuration) || 0.18) * 1000), Math.round(Math.max(-1, Math.min(1, Number(player.hurlReachDirX) || 0)) * 1000), Math.round(Math.max(-1, Math.min(1, Number(player.hurlReachDirY) || 0)) * 1000)]);
    }

    const aiming = current.bowDrawing || current.fireballAiming || current.rainCloudCasting;
    const now = performance.now();
    const aimQ = PLAYER_NET_PROTOCOL.encodeAim(player.attackAimAngle);
    const changed = this.lastAimQuantized === null || PLAYER_NET_PROTOCOL.circularStepDelta(aimQ, this.lastAimQuantized) >= PLAYER_NET_PROTOCOL.AIM_MIN_STEP_DELTA;
    const heartbeat = now - this.lastAimSentAt >= PLAYER_NET_PROTOCOL.AIM_HEARTBEAT_MS;
    if (aiming && (changed || heartbeat || (force && this.lastAimQuantized === null))) {
      this.socket.send(JSON.stringify({ type: "playerAim", a: aimQ }));
      this.lastAimQuantized = aimQ;
      this.lastAimSentAt = now;
    }
    if (!aiming) this.lastAimQuantized = null;
    this.lastTransientReplicationState = current;
  }

  applyRemotePlayerAim(message) {
    if (!message || message.id === this.localPlayerId) return;
    const remote = this.remotePlayers.get(message.id);
    if (!remote) return;
    remote.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(message.a);
    const ax = Math.cos(remote.attackAimAngle), ay = Math.sin(remote.attackAimAngle);
    remote.attackDirection = Math.abs(ax) >= Math.abs(ay) ? (ax >= 0 ? "right" : "left") : (ay >= 0 ? "down" : "up");
  }

  applyRemotePlayerAction(message) {
    if (!message || message.id === this.localPlayerId || !Array.isArray(message.a)) return;
    const remote = this.remotePlayers.get(message.id);
    if (!remote) return;
    const data = message.a, code = Number(data[0]) || 0, A = PLAYER_NET_PROTOCOL.ACTION;
    if (code === A.ATTACK) {
      remote.attackDuration = Math.max(0.05, (Number(data[1]) || 300) / 1000);
      remote.attackTime = remote.attackDuration;
      remote.attackDirection = ["left", "right", "up", "down"][Math.max(0, Math.min(3, Number(data[2]) || 0))];
      remote.attackHand = data[3] === 1 ? "right" : "left";
      remote.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(data[4]);
    } else if (code === A.BOW_DRAW) {
      remote.bowDrawing = data[1] === 1;
      remote.bowDrawDuration = Math.max(0.05, (Number(data[2]) || 1000) / 1000);
      if (remote.bowDrawing) { remote.bowDrawAmount = 0; remote.bowReleaseTime = 0; }
    } else if (code === A.BOW_RELEASE) {
      remote.bowDrawing = false;
      remote.bowReleaseDuration = Math.max(0.03, (Number(data[1]) || 120) / 1000);
      remote.bowReleaseTime = remote.bowReleaseDuration;
      remote.bowDrawAmount = Math.max(0, Math.min(1, (Number(data[2]) || 0) / 255));
      remote.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(data[3]);
    } else if (code === A.FIREBALL_AIM) { remote.fireballAiming = data[1] === 1; remote.fireballAimTime = 0; }
    else if (code === A.RAIN_CAST) { remote.rainCloudCasting = data[1] === 1; remote.rainCloudCastDuration = Math.max(0.05, (Number(data[2]) || 500) / 1000); remote.rainCloudCastTime = 0; }
    else if (code === A.HURL_REACH) { remote.hurlReachDuration = Math.max(0.05, (Number(data[1]) || 180) / 1000); remote.hurlReachTime = remote.hurlReachDuration; remote.hurlReachDirX = Math.max(-1, Math.min(1, (Number(data[2]) || 0) / 1000)); remote.hurlReachDirY = Math.max(-1, Math.min(1, (Number(data[3]) || 0) / 1000)); }
  }

  sendLocalState(force = false) {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const state = this.makeLocalPlayerState();
    const now = performance.now();
    const hadSnapshot = Boolean(this.lastLocalStateSnapshot);
    const mapChanged = this.lastSentMapId !== state.mapId;
    if (hadSnapshot && !mapChanged) this.syncLocalTransientReplication(force);
    else this.lastTransientReplicationState = this.currentTransientReplicationState();
    const safetyFullDue =
      now - this.lastFullStateSentAt >= this.fullStateSafetyHeartbeatMs;

    // Full state is now exceptional: connection/bootstrap, map transition, or
    // a slow safety keyframe. Routine play uses compact motion plus change-only
    // state patches, which avoids uploading ~800 bytes ten times per second.
    if (!this.lastLocalStateSnapshot || mapChanged || safetyFullDue) {
      this.socket.send(JSON.stringify({
        type: "playerState",
        player: state,
        force
      }));

      this.lastLocalStateSnapshot = state;
      this.lastLocalMotionJson = JSON.stringify(this.localMotionPayload(state));
      this.lastSentMapId = state.mapId;
      this.lastFullStateSentAt = now;
      this.lastTransientReplicationState = this.currentTransientReplicationState();
      this.lastAimQuantized = null;
      return;
    }

    const motion = this.localMotionPayload(state);
    const motionJson = JSON.stringify(motion);

    if (force || motionJson !== this.lastLocalMotionJson) {
      this.socket.send(JSON.stringify({
        type: "playerMotion",
        p: motion
      }));
      this.lastLocalMotionJson = motionJson;
    }

    const patch = this.localStatePatch(
      this.lastLocalStateSnapshot,
      state
    );

    if (Object.keys(patch).length > 0) {
      this.socket.send(JSON.stringify({
        type: "playerStatePatch",
        player: patch
      }));
    }

    this.lastLocalStateSnapshot = state;
    this.lastSentMapId = state.mapId;
  }

  updateRemoteInterpolation(dt) {
    const blend = 1 - Math.exp(-16 * dt);

    for (const remote of this.remotePlayers.values()) {
      remote.x += (remote.targetX - remote.x) * blend;
      remote.y += (remote.targetY - remote.y) * blend;

      remote.attackTime = Math.max(
        0,
        (Number(remote.attackTime) || 0) - dt
      );

      if (remote.bowDrawing) {
        remote.bowDrawAmount = Math.min(1, (Number(remote.bowDrawAmount) || 0) + dt / Math.max(0.05, Number(remote.bowDrawDuration) || 1));
        remote.bowReleaseTime = 0;
      } else if ((Number(remote.bowReleaseTime) || 0) > 0) {
        remote.bowReleaseTime = Math.max(0, remote.bowReleaseTime - dt);
        remote.bowDrawAmount = Math.max(0, (Number(remote.bowDrawAmount) || 0) - dt / 0.09);
      }
      if (remote.fireballAiming) remote.fireballAimTime = Math.max(0, (Number(remote.fireballAimTime) || 0) + dt);
      else remote.fireballAimTime = 0;
      if (remote.rainCloudCasting) remote.rainCloudCastTime = Math.min(Math.max(0.05, Number(remote.rainCloudCastDuration) || 0.50), Math.max(0, Number(remote.rainCloudCastTime) || 0) + dt);
      else remote.rainCloudCastTime = 0;


      remote.wetTime = Math.max(
        0,
        (Number(remote.wetTime) || 0) - dt
      );

      // v419: remote players on this map derive map-rain Wet from the same
      // deterministic weather/roof geometry as the local player. This is
      // presentation/state continuity only and requires no periodic packet.
      if (
        remote.mapId === currentMapId &&
        typeof currentMapIsRaining === "function" &&
        currentMapIsRaining() &&
        (typeof pointUnderAutomaticRoof !== "function" ||
          !pointUnderAutomaticRoof(remote.x, remote.y))
      ) {
        applyLocalWetStatus(remote, GAME_CONFIG.player.wetDuration);
      }

      remote.burnTime = Math.max(
        0,
        (Number(remote.burnTime) || 0) - dt
      );

      remote.hurlReachTime = Math.max(
        0,
        (Number(remote.hurlReachTime) || 0) - dt
      );

    }
  }

  update(dt) {
    this.updateRemoteInterpolation(dt);
    this.syncSharedCoinVisuals();

    for (
      const resource
      of this.sharedResources.values()
    ) {
      resource.life = Math.max(
        0,
        resource.life - dt
      );
    }

    this.syncSharedResourceVisuals();

    this.sendAccumulator += dt;

    if (this.sendAccumulator >= this.sendInterval) {
      this.sendAccumulator %= this.sendInterval;
      this.sendLocalState();
    }
  }

  playersOnCurrentMap() {
    return [...this.remotePlayers.values()]
      .filter(remote => remote.mapId === currentMapId);
  }
}
