// Slime Story replicated enemy runtime extraction.
// Loaded before game.js; installed onto OnlineClient immediately after the class
// declaration so the WebSocket router/transport stays in game.js while enemy
// reconciliation lives in its own module.

function installClientEnemyRuntime(OnlineClientClass) {
  Object.assign(OnlineClientClass.prototype, {
  findSharedEnemyByNetworkId(networkId, mapId = null) {
    const id = Number(networkId);
    if (!Number.isFinite(id)) return null;

    if (!this.enemyNetworkIndex) {
      this.enemyNetworkIndex = new Map();
    }

    const cached = this.enemyNetworkIndex.get(id);
    if (cached && (!mapId || cached.networkMapId === mapId)) {
      return cached;
    }

    // Snapshot registration should make this path rare. Keep a resilient scan
    // so a stale client world catalog can still recover after the server creates
    // a fallback enemy from an authoritative snapshot.
    for (const [candidateMapId, mapState] of Object.entries(mapStates || {})) {
      if (mapId && candidateMapId !== mapId) continue;
      if (!mapState) continue;

      for (const collectionName of Object.values(CLIENT_ENEMY_COLLECTIONS)) {
        const collection = mapState[collectionName];
        if (!Array.isArray(collection)) continue;

        const found = collection.find(enemy =>
          Number(enemy?.networkId) === id
        );

        if (found) {
          this.enemyNetworkIndex.set(id, found);
          return found;
        }
      }
    }

    return null;
  },

  applySharedEnemyWanderIntent(message) {
    const mapId = message.mapId;
    const groups = message.groups || {};
    const receivedAt = performance.now();

    for (const [enemyType, records] of Object.entries(groups)) {
      for (const record of records || []) {
        if (!Array.isArray(record) || record.length < 6) continue;

        const enemy = this.findSharedEnemyByNetworkId(
          record[0],
          mapId
        );

        if (!enemy) continue;

        const anchorX = Number(record[1]);
        const anchorY = Number(record[2]);
        const targetX = Number(record[3]);
        const targetY = Number(record[4]);
        const speed = Number(record[5]);
        const startDelayMs = Math.max(0, Number(record[7]) || 0);

        if (
          !Number.isFinite(anchorX) ||
          !Number.isFinite(anchorY) ||
          !Number.isFinite(targetX) ||
          !Number.isFinite(targetY)
        ) continue;

        const enteringPassive = enemy.networkMotionMode !== "passive";
        enemy.networkMotionMode = "passive";
        enemy.activeMotionHandoff = false;
        enemy.passiveWanderTargetX = targetX;
        enemy.passiveWanderTargetY = targetY;
        enemy.passiveWanderSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
        enemy.passiveAuthoritativeX = anchorX;
        enemy.passiveAuthoritativeY = anchorY;
        enemy.passivePathAnchorX = anchorX;
        enemy.passivePathAnchorY = anchorY;
        enemy.passiveIntentReceivedAt = receivedAt;
        enemy.passivePlanStartAt = receivedAt + startDelayMs;
        enemy.serverTargetX = anchorX;
        enemy.serverTargetY = anchorY;
        enemy.dir = record[6] === -1 ? -1 : 1;
        enemy.serverControlled = true;
        enemy.serverInitialized = true;

        // Entering passive mode immediately after a map-entry/respawn already
        // starts from an authoritative position. During ordinary active ->
        // passive transitions, keep the current rendered position and simply
        // begin following the shared destination; no positional snap is needed.
        if (enteringPassive && !Number.isFinite(enemy.x)) {
          enemy.x = anchorX;
          enemy.y = anchorY;
        }

        if (enemyType === "goblin") {
          enemy.moving = enemy.passiveWanderSpeed > 0.2;
        }
      }
    }
  },

  applySharedEnemyMotion(message) {
    const mapId = message.m || message.mapId;
    const receivedAt = performance.now();
    const flat = Array.isArray(message.r)
      ? message.r
      : (message.records || []).flat();

    // Compact V2 motion is a flat stride-3 stream:
    // [networkId, x, y, networkId, x, y, ...].
    for (let index = 0; index + 2 < flat.length; index += 3) {
      const enemy = this.findSharedEnemyByNetworkId(flat[index], mapId);
      if (!enemy) continue;

      const targetX = Number(flat[index + 1]);
      const targetY = Number(flat[index + 2]);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;

      const wasPassive = enemy.networkMotionMode === "passive";
      const previousX = Number(enemy.serverTargetX);
      const previousY = Number(enemy.serverTargetY);
      const previousAt = Number(enemy.serverMotionReceivedAt) || 0;

      let velocityX = 0;
      let velocityY = 0;

      if (
        !wasPassive &&
        Number.isFinite(previousX) &&
        Number.isFinite(previousY) &&
        previousAt > 0
      ) {
        const elapsed = Math.max(0.001, (receivedAt - previousAt) / 1000);
        if (elapsed <= 0.5) {
          velocityX = (targetX - previousX) / elapsed;
          velocityY = (targetY - previousY) / elapsed;

          // Defensive cap for discontinuities such as respawn/map corrections.
          const speed = Math.hypot(velocityX, velocityY);
          const maxSampleSpeed = 180;
          if (speed > maxSampleSpeed) {
            const scale = maxSampleSpeed / speed;
            velocityX *= scale;
            velocityY *= scale;
          }
        }
      }

      enemy.networkMotionMode = "active";
      enemy.activeMotionHandoff = wasPassive;
      enemy.passiveIntentReceivedAt = 0;
      enemy.passivePlanStartAt = 0;
      enemy.passiveWanderSpeed = 0;
      enemy.serverTargetX = targetX;
      enemy.serverTargetY = targetY;
      enemy.serverVelocityX = velocityX;
      enemy.serverVelocityY = velocityY;
      enemy.serverMotionReceivedAt = receivedAt;
      enemy.serverControlled = true;
      enemy.serverInitialized = true;

      if (Math.abs(velocityX) > 0.5) {
        enemy.dir = velocityX >= 0 ? 1 : -1;
      } else if (Number.isFinite(previousX) && Math.abs(targetX - previousX) > 0.25) {
        enemy.dir = targetX >= previousX ? 1 : -1;
      }

      // Goblin walk animation is presentation, not authoritative gameplay.
      // The lunge countdown/direction arrives separately via state deltas.
      if (enemy.type === "goblin" || Object.prototype.hasOwnProperty.call(enemy, "moving")) {
        enemy.moving = Math.hypot(velocityX, velocityY) > 1;
      }
    }
  },

  applySharedEnemyHealthDelta(message) {
    const mapId = message.m || message.mapId;
    const flat = Array.isArray(message.r) ? message.r : [];

    // Flat stride-2 health stream: [networkId, hp, networkId, hp, ...].
    // Direct enemyDamage/enemyHeal packets already update HP themselves, so
    // this channel is reserved for authoritative HP mutations without a combat
    // event (most notably batched Burn ticks and respawn correction).
    for (let index = 0; index + 1 < flat.length; index += 2) {
      const enemy = this.findSharedEnemyByNetworkId(flat[index], mapId);
      if (!enemy) continue;
      const hp = Number(flat[index + 1]);
      if (Number.isFinite(hp)) enemy.hp = Math.max(0, hp);
    }
  },

  applySharedEnemyStateDelta(message) {
    const mapId = message.m || message.mapId;
    const records = Array.isArray(message.r) ? message.r : [];
    const STATE = ENEMY_NET_PROTOCOL.STATE;
    const SCALE = ENEMY_NET_PROTOCOL.SCALE;

    const seconds = encodedMs =>
      Math.max(0, Number(encodedMs) || 0) / SCALE.SECONDS_MS;
    const unit = encoded =>
      (Number(encoded) || 0) / SCALE.UNIT_VECTOR;

    for (const record of records) {
      if (!Array.isArray(record) || record.length < 2) continue;

      const enemy = this.findSharedEnemyByNetworkId(record[0], mapId);
      if (!enemy) continue;

      const mask = Number(record[1]) || 0;
      let cursor = 2;

      if (mask & STATE.AGGRO_TARGET) {
        const targetId = record[cursor++];
        enemy.aggroTargetId = typeof targetId === "string" ? targetId : null;
      }

      if (mask & STATE.BURN) {
        const burnSeconds = seconds(record[cursor++]);
        const damagePerTick = Math.max(1, Math.round(Number(record[cursor++]) || 1));
        setReplicatedEnemyCountdown(enemy, "burnTime", burnSeconds);
        enemy.burnDamagePerTick = damagePerTick;
      }

      if (mask & STATE.CARRY) {
        const carrierId = record[cursor++];
        const pickupSeconds = seconds(record[cursor++]);
        enemy.carriedBy = typeof carrierId === "string" ? carrierId : null;
        setReplicatedEnemyCountdown(enemy, "pickupTime", pickupSeconds);
        enemy.pickupDirX = unit(record[cursor++]);
        enemy.pickupDirY = unit(record[cursor++]);
      }

      if (mask & STATE.HURL) {
        setReplicatedEnemyCountdown(
          enemy,
          "hurlTime",
          seconds(record[cursor++])
        );
      }

      if (mask & STATE.LUNGE) {
        enemy.lungeTime = seconds(record[cursor++]);
        enemy.lungeDirX = unit(record[cursor++]);
        enemy.lungeDirY = unit(record[cursor++]);
        if (Math.abs(enemy.lungeDirX) > 0.05) {
          enemy.dir = enemy.lungeDirX >= 0 ? 1 : -1;
        }
      }

      if (mask & STATE.RESPAWN) {
        const respawnHp = Math.max(0, Number(record[cursor++]) || 0);
        const wasAlive = Boolean(enemy.alive);

        if (!wasAlive) {
          if (Number.isFinite(enemy.serverTargetX)) {
            enemy.x = enemy.serverTargetX;
            enemy.passiveAuthoritativeX = enemy.serverTargetX;
            enemy.passivePathAnchorX = enemy.serverTargetX;
          }
          if (Number.isFinite(enemy.serverTargetY)) {
            enemy.y = enemy.serverTargetY;
            enemy.passiveAuthoritativeY = enemy.serverTargetY;
            enemy.passivePathAnchorY = enemy.serverTargetY;
          }

          enemy.passiveWanderTargetX = enemy.x;
          enemy.passiveWanderTargetY = enemy.y;
          enemy.passiveWanderSpeed = 0;
          enemy.activeMotionHandoff = false;
          enemy.passiveIntentReceivedAt = performance.now();
          enemy.passivePlanStartAt = enemy.passiveIntentReceivedAt;
          enemy.spawnAnimTime = ENEMY_SPAWN_ANIM_DURATION;
        }

        enemy.hp = respawnHp;
        enemy.alive = true;
        enemy.aggroTargetId = null;
        enemy.confusionTargetId = null;
        setReplicatedEnemyCountdown(enemy, "confusionTime", 0);
        setReplicatedEnemyCountdown(enemy, "burnTime", 0);
        setReplicatedEnemyCountdown(enemy, "respawnTime", 0);
        setReplicatedEnemyCountdown(enemy, "pickupTime", 0);
        setReplicatedEnemyCountdown(enemy, "hurlTime", 0);
        setReplicatedEnemyCountdown(enemy, "snareRootTime", 0);
        setReplicatedEnemyCountdown(enemy, "snareSlowTime", 0);
        enemy.wetTime = 0;
        enemy.carriedBy = null;
        enemy.lungeTime = 0;
        enemy.lungeDirX = 0;
        enemy.lungeDirY = 0;
      }
    }
  },

  applySharedEnemySnapshot(message) {
    const enemyType = message.enemyType;

    for (const state of message.enemies || []) {
      let enemy = this.findSharedEnemy(
        enemyType,
        state.id,
        state.mapId
      );

      // Resilient fallback for newly-added map enemies. Normally WORLD_CONTENT
      // pre-creates these objects, but if a browser ever has stale shared map
      // content cached, an authoritative server snapshot can still construct
      // the missing client entity instead of silently dropping it.
      if (!enemy) {
        const mapId = state.mapId || message.mapId;
        const collectionName = CLIENT_ENEMY_COLLECTIONS[enemyType];
        const mapState = mapStates[mapId];

        if (mapId && collectionName && mapState) {
          enemy = createClientEnemyFromWorldSpawn(
            mapId,
            {
              ...state,
              id: state.id,
              type: enemyType
            }
          );

          if (enemy) {
            if (!Array.isArray(mapState[collectionName])) {
              mapState[collectionName] = [];
            }

            mapState[collectionName].push(enemy);

            if (mapId === currentMapId) {
              loadActiveMapCollections(mapState);
            }
          }
        }
      }

      if (!enemy) continue;

      if (Number.isFinite(Number(state.networkId))) {
        enemy.networkId = Number(state.networkId);
        if (!this.enemyNetworkIndex) this.enemyNetworkIndex = new Map();
        this.enemyNetworkIndex.set(enemy.networkId, enemy);
      }

      const firstSnapshot =
        !enemy.serverInitialized;

      const wasAlive =
        Boolean(enemy.alive);

      const nextAlive =
        Boolean(state.alive);

      enemy.serverControlled = true;
      enemy.serverInitialized = true;

      enemy.serverTargetX =
        Number(state.x) || enemy.x;

      enemy.serverTargetY =
        Number(state.y) || enemy.y;

      if (enemy.networkMotionMode === "passive") {
        // A slow full-snapshot keyframe is only a correction anchor. Preserve
        // the current passive destination and speed so a keyframe can never
        // create its own visible stop-and-go cycle.
        enemy.passiveAuthoritativeX = enemy.serverTargetX;
        enemy.passiveAuthoritativeY = enemy.serverTargetY;
        enemy.passivePathAnchorX = enemy.serverTargetX;
        enemy.passivePathAnchorY = enemy.serverTargetY;
        if (!Number.isFinite(Number(enemy.passiveWanderTargetX))) {
          enemy.passiveWanderTargetX = enemy.serverTargetX;
        }
        if (!Number.isFinite(Number(enemy.passiveWanderTargetY))) {
          enemy.passiveWanderTargetY = enemy.serverTargetY;
        }
        enemy.passiveWanderSpeed = Math.max(
          0,
          Number(enemy.passiveWanderSpeed) || 0
        );
        const correctionAt = performance.now();
        const remainingDelay = Math.max(
          0,
          (Number(enemy.passivePlanStartAt) || correctionAt) - correctionAt
        );
        enemy.passiveIntentReceivedAt = correctionAt;
        enemy.passivePlanStartAt = correctionAt + remainingDelay;
      }

      const respawned =
        !wasAlive && nextAlive;

      const syncingMapEntry =
        pendingMapEnemySyncId === state.mapId;

      if (syncingMapEntry) {
        // This is an authoritative rebase after entering a map, not a monster
        // actually spawning in front of the player. Keep transition history
        // invisible and let the monster simply appear at its server position.
        enemy.spawnAnimTime = 0;
      } else if ((firstSnapshot && nextAlive) || respawned) {
        if (respawned) {
          enemy.passiveWanderTargetX = enemy.serverTargetX;
          enemy.passiveWanderTargetY = enemy.serverTargetY;
          enemy.passivePathAnchorX = enemy.serverTargetX;
          enemy.passivePathAnchorY = enemy.serverTargetY;
          enemy.passiveWanderSpeed = 0;
          enemy.activeMotionHandoff = false;
          enemy.passiveIntentReceivedAt = performance.now();
          enemy.passivePlanStartAt = enemy.passiveIntentReceivedAt;
        }
        enemy.spawnAnimTime = ENEMY_SPAWN_ANIM_DURATION;
      }

      if (!syncingMapEntry && wasAlive && !nextAlive) {
        spawnEnemyDeathEffect(enemy, enemyType, state.mapId);
      }

      const forcePositionRebase =
        syncingMapEntry ||
        firstSnapshot ||
        respawned ||
        currentMapId !== state.mapId;

      const snapPosition =
        forcePositionRebase ||
        (
          enemy.networkMotionMode !== "passive" &&
          shouldSnapNetworkPosition(
            enemy.x,
            enemy.y,
            enemy.serverTargetX,
            enemy.serverTargetY,
            false
          )
        );

      if (snapPosition) {
        enemy.x =
          enemy.serverTargetX;

        enemy.y =
          enemy.serverTargetY;
      }

      enemy.hp = Number.isFinite(state.hp)
        ? state.hp
        : enemy.hp;

      enemy.maxHp = Number.isFinite(state.maxHp)
        ? state.maxHp
        : enemy.maxHp;

      enemy.level = Number.isFinite(state.level)
        ? state.level
        : enemy.level;

      enemy.alive = nextAlive;
      enemy.dir = state.dir === -1 ? -1 : 1;
      enemy.aggroTargetId =
        typeof state.aggroTargetId === "string"
          ? state.aggroTargetId
          : null;
      enemy.confusionTime = Math.max(
        0,
        Number(state.confusionTime) || 0
      );
      enemy.confusionTargetId =
        typeof state.confusionTargetId === "string"
          ? state.confusionTargetId
          : null;
      enemy.burnTime = Math.max(
        0,
        Number(state.burnTime) || 0
      );
      enemy.burnDamagePerTick = Math.max(
        1,
        Math.round(Number(state.burnDamagePerTick) || 2)
      );
      enemy.wetTime = Math.max(
        0,
        Number(state.wetTime) || 0
      );
      enemy.wetDuration = Math.max(
        0.1,
        Number(state.wetDuration) || GAME_CONFIG.status.enemyWetDuration
      );

      ensureEnemyHurlState(enemy);
      enemy.carriedBy =
        typeof state.carriedBy === "string"
          ? state.carriedBy
          : null;
      enemy.pickupTime = Math.max(0, Number(state.pickupTime) || 0);
      enemy.pickupDuration = Math.max(0.01, Number(state.pickupDuration) || 0.18);
      enemy.pickupDirX = Number(state.pickupDirX) || 0;
      enemy.pickupDirY = Number(state.pickupDirY) || 0;
      enemy.hurlTime = Math.max(0, Number(state.hurlTime) || 0);
      enemy.hurlDuration = Math.max(0.01, Number(state.hurlDuration) || 0.58);
      enemy.snareRootTime = Math.max(
        0,
        Number(state.snareRootTime) || 0
      );
      enemy.snareSlowTime = Math.max(
        0,
        Number(state.snareSlowTime) || 0
      );
      enemy.snareSlowMultiplier = Math.max(
        0.1,
        Math.min(
          1,
          Number(state.snareSlowMultiplier) || 0.45
        )
      );

      enemy.respawnTime = Math.max(
        0,
        Number(state.respawnTime) || 0
      );

      // Convert authoritative remaining durations into local wall-clock
      // deadlines. This keeps visuals correct even if the browser tab is
      // throttled and lets the server avoid periodic countdown refreshes.
      applyReplicatedEnemyCountdownsFromState(enemy, state);

      const runtimeProfile =
        enemyProfileForType(enemyType);

      if (
        runtimeProfile?.applyNetworkSnapshot
      ) {
        runtimeProfile.applyNetworkSnapshot(
          enemy,
          state
        );
      }
    }
  },

  handleEnemyConfused(message) {
    const enemy =
      findClientWorldEnemy(
        message.enemyId,
        message.enemyType,
        message.mapId
      );

    if (!enemy || currentMapId !== message.mapId) return;

    setReplicatedEnemyCountdown(
      enemy,
      "confusionTime",
      Math.max(
        enemy.confusionTime || 0,
        Number(message.duration) || CAMOUFLAGE_CONFUSION_DURATION
      )
    );
    enemy.confusionTargetId =
      typeof message.attackerId === "string"
        ? message.attackerId
        : enemy.confusionTargetId;

    const profile =
      enemyProfile(enemy);

    // Keep the confusion punctuation around the target's head/body instead of
    // on the damage-number lane so the ambush hesitation reads clearly.
    const confusionY =
      enemy.y +
      (profile?.damageTextOffsetY ?? -31) +
      18;

    const confusionDuration =
      Math.max(
        0.7,
        Number(message.duration) || CAMOUFLAGE_CONFUSION_DURATION
      );

    spawnFloatingText(
      enemy.x - 11,
      confusionY + 2,
      "?",
      "#f1e6a8",
      confusionDuration,
      1,
      -0.75
    );

    spawnFloatingText(
      enemy.x,
      confusionY - 2,
      "?",
      "#fff2ad",
      confusionDuration,
      2,
      0
    );

    spawnFloatingText(
      enemy.x + 11,
      confusionY + 2,
      "?",
      "#f1e6a8",
      confusionDuration,
      1,
      0.75
    );
  },

  handleSharedEnemyDamage(message) {
    const enemy = this.findSharedEnemy(
      message.enemyType,
      message.enemyId,
      message.mapId
    );

    if (!enemy) return;

    enemy.hitFlash = Math.max(enemy.hitFlash, 0.12);
    enemy.shakeTime = Math.max(enemy.shakeTime, 0.14);

    if (Number.isFinite(message.hp)) {
      enemy.hp = message.hp;
    }

    // Authoritative state is global, but world-space combat text is local to
    // the map the event actually happened on.
    if (currentMapId !== message.mapId) return;

    const amount = Math.max(
      0,
      Number(message.amount) || 0
    );

    if (amount <= 0) return;

    const profile = enemyProfile(enemy);

    // Wand Mastery hit marks now come from the same authoritative event that
    // confirms damage. This prevents a predicted client-side claw mark from
    // appearing on a target the server ultimately rejected because its precise
    // position differed slightly from the locally reconstructed passive path.
    if (message.source === "wandMasteryMelee") {
      const body = enemyBodyPoint(enemy);
      const aimAngle = Number(message.aimAngle);
      const resolvedAngle = Number.isFinite(aimAngle)
        ? aimAngle
        : Math.atan2(body.y - (player.y - 8), body.x - player.x);
      spawnWandMasteryHitParticles(
        body.x,
        body.y,
        resolvedAngle,
        0,
        Math.cos(resolvedAngle) < 0
      );
    }

    spawnDamageNumber(
      enemy.x,
      enemy.y +
        (profile?.damageTextOffsetY ?? -31),
      message.critical ? `${amount}!` : amount,
      message.critical
        ? { critical: true, duration: 0.84 }
        : undefined
    );
  },

  handleSharedEnemyHeal(message) {
    const enemy = this.findSharedEnemy(
      message.enemyType,
      message.enemyId,
      message.mapId
    );

    if (!enemy) return;

    if (Number.isFinite(message.hp)) {
      enemy.hp = message.hp;
    }

    if (currentMapId !== message.mapId) return;

    const amount = Math.max(
      0,
      Number(message.amount) || 0
    );

    if (amount <= 0) return;

    const profile = enemyProfile(enemy);

    spawnFloatingText(
      enemy.x,
      enemy.y +
        (profile?.damageTextOffsetY ?? -31) - 1,
      `+${amount}`,
      "#89d9b8",
      0.85
    );
  },

  handleSharedEnemyKilled(message) {
    const enemy = findClientWorldEnemy(
      message.enemyId,
      message.enemyType,
      message.mapId
    );

    const profile =
      enemyProfileForType(
        message.enemyType
      );

    if (enemy) {
      if (enemy.alive) {
        spawnEnemyDeathEffect(enemy, message.enemyType, message.mapId);
      }

      enemy.hp = 0;
      enemy.alive = false;
      setReplicatedEnemyCountdown(enemy, "burnTime", 0);
      setReplicatedEnemyCountdown(
        enemy,
        "respawnTime",
        profile?.respawnSeconds ?? 30
      );

      if (profile?.onKilledLocal) {
        profile.onKilledLocal(enemy);
      }
    }

    if (
      message.killerId !== this.localPlayerId ||
      !profile
    ) {
      return;
    }

    awardExp(profile.expAward || 0);
  }
  });
}
