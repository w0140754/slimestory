const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const BUILD_VERSION = "6-11-122";
const ENEMY_KNOCKBACK_DAMAGE_THRESHOLD = 0.25;

const WORLD_CONTENT = require("./public/shared/world-content.js");
const COMBAT_BALANCE = require("./public/shared/combat-balance.js");

const ALLOWED_MAPS = new Set(
  Object.keys(WORLD_CONTENT.maps)
);

function mapWorldDimensions(mapId) {
  const dimensions =
    WORLD_CONTENT.maps[mapId]?.dimensions || null;

  return {
    width:
      Number.isFinite(dimensions?.width)
        ? dimensions.width
        : 640,
    height:
      Number.isFinite(dimensions?.height)
        ? dimensions.height
        : 400
  };
}


// -----------------------------------------------------------------------------
// GENERIC SERVER ENEMY RUNTIME METADATA
// -----------------------------------------------------------------------------
// Shared systems consume these properties instead of branching on individual
// monster species. AI implementations may still be species-specific.
const SERVER_ENEMY_RUNTIME_PROFILES = Object.freeze({
  slime: Object.freeze({
    bodyOffsetY: -6,
    meleeBodyRadius: 7,
    fireSpreadChance: 0.42,
    respawnSeconds: 30,
    coinDropChance: 0.45,
    hurlable: true,
    snareable: true,
    rainEffect: "none",
    patrolLeashRadius: 90,
    combatLeashRadius: 240,
    damageKnockback: Object.freeze({
      melee: 32,
      bowMelee: 12,
      basic: 18,
      arrow: 22,
      fireball: 24
    }),
    snapshotExtra(enemy) {
      return {
        variant: enemy.variant || "green",
        aggressiveOnSight: Boolean(enemy.aggressiveOnSight)
      };
    }
  }),
  goblin: Object.freeze({
    bodyOffsetY: -11,
    meleeBodyRadius: 7,
    fireSpreadChance: 0.42,
    respawnSeconds: 40,
    coinDropChance: 0.50,
    hurlable: true,
    snareable: true,
    rainEffect: "none",
    patrolLeashRadius: 120,
    combatLeashRadius: 260,
    damageKnockback: Object.freeze({
      melee: 28,
      bowMelee: 13,
      basic: 17,
      arrow: 20,
      fireball: 22
    }),
    onHurlGrab(enemy) {
      enemy.lungeTime = 0;
      enemy.lungeTargetId = null;
      enemy.attackHit = false;
      enemy.moving = false;
    },
    snapshotExtra(enemy) {
      return {
        moving: enemy.moving,
        walkTime: Number(
          enemy.walkTime.toFixed(3)
        ),
        lungeTime: Number(
          enemy.lungeTime.toFixed(3)
        ),
        lungeDirX: enemy.lungeDirX,
        lungeDirY: enemy.lungeDirY
      };
    },
    onKilled(enemy) {
      enemy.lungeTime = 0;
      enemy.moving = false;
    }
  }),
  ghost: Object.freeze({
    bodyOffsetY: -11,
    meleeBodyRadius: 8,
    fireSpreadChance: 0.38,
    respawnSeconds: 50,
    coinDropChance: 0,
    hurlable: false,
    snareable: false,
    rainEffect: "damage",
    patrolLeashRadius: 145,
    combatLeashRadius: 280,
    damageKnockback: Object.freeze({
      melee: 22,
      bowMelee: 10,
      basic: 14,
      arrow: 16,
      fireball: 18
    })
  }),
  bigGoldSlime: Object.freeze({
    bodyOffsetY: -10,
    meleeBodyRadius: 12,
    fireSpreadChance: 0.42,
    respawnSeconds: 300,
    coinDropChance: 1,
    resourceDrops: Object.freeze([
      Object.freeze({
        kind: "goldSlimeBubble",
        chance: 1
      })
    ]),
    hurlable: false,
    snareable: true,
    rainEffect: "none",
    patrolLeashRadius: 85,
    combatLeashRadius: 320,
    damageKnockback: Object.freeze({
      melee: 12,
      bowMelee: 5,
      basic: 8,
      arrow: 9,
      fireball: 10
    })
  })
});

function serverEnemyProfile(enemyOrType) {
  const type =
    typeof enemyOrType === "string"
      ? enemyOrType
      : enemyOrType?.type;

  return (
    SERVER_ENEMY_RUNTIME_PROFILES[type] ||
    null
  );
}

// -----------------------------------------------------------------------------
// SHARED STATUS EFFECTS
// -----------------------------------------------------------------------------
// Burn/Wet used to be written directly from several combat/environment paths.
// Keep the rules here so Fireball, rain, environmental fire, and future status
// skills all agree on duration, extinguishing, source attribution, and movement.
const STATUS_RULES = Object.freeze({
  enemyBurnDuration: 3.0,
  enemyWetDuration: 3.0,
  enemyWetSpeedMultiplier: 0.75,
  playerBurnDuration: 5.0,
  playerWetDuration: 3.0
});

function ensureServerEnemyStatusState(enemy) {
  if (!enemy) return enemy;

  enemy.burnTime = Math.max(0, Number(enemy.burnTime) || 0);
  enemy.burnTickTimer = Math.max(0, Number(enemy.burnTickTimer) || 0);
  enemy.burnTickInterval = Math.max(0.05, Number(enemy.burnTickInterval) || 0.5);
  enemy.wetTime = Math.max(0, Number(enemy.wetTime) || 0);
  enemy.wetDuration = Math.max(0.1, Number(enemy.wetDuration) || STATUS_RULES.enemyWetDuration);

  return enemy;
}

function serverEnemyIsWet(enemy) {
  ensureServerEnemyStatusState(enemy);
  return enemy.wetTime > 0;
}

function clearServerEnemyBurn(enemy) {
  if (!enemy) return false;
  ensureServerEnemyStatusState(enemy);

  const changed = enemy.burnTime > 0 || enemy.burnTickTimer > 0;
  enemy.burnTime = 0;
  enemy.burnTickTimer = 0;
  return changed;
}

function applyServerEnemyWet(enemy, duration = STATUS_RULES.enemyWetDuration) {
  if (!enemy?.alive) return false;
  ensureServerEnemyStatusState(enemy);

  clearServerEnemyBurn(enemy);
  enemy.wetTime = Math.max(
    enemy.wetTime,
    Math.max(0.1, Number(duration) || STATUS_RULES.enemyWetDuration)
  );
  return true;
}

function applyServerEnemyBurn(
  enemy,
  {
    duration = STATUS_RULES.enemyBurnDuration,
    sourcePlayerId = null,
    forceThroughWet = false,
    refresh = true
  } = {}
) {
  if (!enemy?.alive) return false;
  ensureServerEnemyStatusState(enemy);

  if (serverEnemyIsWet(enemy) && !forceThroughWet) {
    return false;
  }

  if (forceThroughWet) {
    enemy.wetTime = 0;
  }

  const burnDuration = Math.max(0.1, Number(duration) || STATUS_RULES.enemyBurnDuration);
  enemy.burnTime = refresh
    ? Math.max(enemy.burnTime, burnDuration)
    : burnDuration;
  enemy.burnTickTimer = enemy.burnTickInterval;

  if (sourcePlayerId && players.has(sourcePlayerId)) {
    setEnemyAggroTarget(enemy, sourcePlayerId, enemy.aggroDuration);
    enemy.lastDamagePlayerId = sourcePlayerId;
  }

  return true;
}

function clearServerPlayerBurn(target) {
  if (!target) return false;
  const changed = (Number(target.burnTime) || 0) > 0;
  target.burnTime = 0;
  return changed;
}

function applyServerPlayerWet(target, duration = STATUS_RULES.playerWetDuration) {
  if (!target || target.hp <= 0) return false;
  clearServerPlayerBurn(target);
  target.wetTime = Math.max(
    Number(target.wetTime) || 0,
    Math.max(0.1, Number(duration) || STATUS_RULES.playerWetDuration)
  );
  return true;
}

function applyServerPlayerBurn(
  target,
  {
    duration = STATUS_RULES.playerBurnDuration,
    forceThroughWet = false
  } = {}
) {
  if (!target || target.hp <= 0) return false;

  if ((Number(target.wetTime) || 0) > 0 && !forceThroughWet) {
    return false;
  }

  if (forceThroughWet) {
    target.wetTime = 0;
  }

  target.burnTime = Math.max(
    Number(target.burnTime) || 0,
    Math.max(0.1, Number(duration) || STATUS_RULES.playerBurnDuration)
  );
  return true;
}

function clearServerEnemyStatuses(enemy) {
  if (!enemy) return;
  ensureServerEnemyStatusState(enemy);
  clearServerEnemyBurn(enemy);
  enemy.wetTime = 0;
}

function ensureServerEnemyHurlState(enemy) {
  if (!enemy) return enemy;

  enemy.carriedBy =
    typeof enemy.carriedBy === "string"
      ? enemy.carriedBy
      : null;
  enemy.pickupTime = Math.max(0, Number(enemy.pickupTime) || 0);
  enemy.pickupDuration = Math.max(0.01, Number(enemy.pickupDuration) || 0.18);
  enemy.pickupDirX = Number(enemy.pickupDirX) || 0;
  enemy.pickupDirY = Number(enemy.pickupDirY) || 0;
  enemy.hurlTime = Math.max(0, Number(enemy.hurlTime) || 0);
  enemy.hurlDuration = Math.max(0.01, Number(enemy.hurlDuration) || 0.58);
  enemy.hurlVelocityX = Number(enemy.hurlVelocityX) || 0;
  enemy.hurlVelocityY = Number(enemy.hurlVelocityY) || 0;
  enemy.hurlThrownBy =
    typeof enemy.hurlThrownBy === "string"
      ? enemy.hurlThrownBy
      : null;

  return enemy;
}

function clearServerEnemyHurlState(enemy) {
  if (!enemy) return;
  ensureServerEnemyHurlState(enemy);
  enemy.carriedBy = null;
  enemy.pickupTime = 0;
  enemy.pickupDirX = 0;
  enemy.pickupDirY = 0;
  enemy.hurlTime = 0;
  enemy.hurlVelocityX = 0;
  enemy.hurlVelocityY = 0;
  enemy.hurlThrownBy = null;
}

function ensureServerEnemySnareState(enemy) {
  if (!enemy) return enemy;

  enemy.snareRootTime = Math.max(
    0,
    Number(enemy.snareRootTime) || 0
  );

  enemy.snareSlowTime = Math.max(
    0,
    Number(enemy.snareSlowTime) || 0
  );

  enemy.magicGrassSlowTime = Math.max(
    0,
    Number(enemy.magicGrassSlowTime) || 0
  );

  enemy.snareSlowMultiplier = Math.max(
    0.1,
    Math.min(
      1,
      Number(enemy.snareSlowMultiplier) || 0.45
    )
  );

  return enemy;
}

function clearServerEnemySnareState(enemy) {
  if (!enemy) return;
  ensureServerEnemySnareState(enemy);
  enemy.snareRootTime = 0;
  enemy.snareSlowTime = 0;
}

function serverEnemyIsSnareable(enemy) {
  const profile = serverEnemyProfile(enemy);

  return Boolean(
    enemy &&
    enemy.alive &&
    !enemy.carriedBy &&
    profile &&
    (
      typeof enemy.snareable === "boolean"
        ? enemy.snareable
        : profile.snareable !== false
    )
  );
}

function serverEnemyMovementMultiplier(enemy) {
  ensureServerEnemySnareState(enemy);
  ensureServerEnemyStatusState(enemy);

  if (enemy.snareRootTime > 0) return 0;

  let multiplier = 1;
  if (enemy.snareSlowTime > 0) {
    multiplier = Math.min(multiplier, enemy.snareSlowMultiplier);
  }
  if (enemy.magicGrassSlowTime > 0) {
    multiplier = Math.min(multiplier, 0.80);
  }
  if (enemy.wetTime > 0) {
    multiplier = Math.min(multiplier, STATUS_RULES.enemyWetSpeedMultiplier);
  }

  return multiplier;
}

function tickSharedEnemySnareStatuses(dt) {
  for (const enemy of allSharedEnemies()) {
    if (!enemy.alive) {
      clearServerEnemySnareState(enemy);
      continue;
    }

    ensureServerEnemySnareState(enemy);

    if (enemy.magicGrassSlowTime > 0) {
      enemy.magicGrassSlowTime = Math.max(
        0,
        enemy.magicGrassSlowTime - dt
      );
    }

    if (enemy.snareRootTime > 0) {
      enemy.snareRootTime = Math.max(
        0,
        enemy.snareRootTime - dt
      );
      continue;
    }

    if (enemy.snareSlowTime > 0) {
      enemy.snareSlowTime = Math.max(
        0,
        enemy.snareSlowTime - dt
      );
    }
  }
}

function serverEnemyIsHurlable(enemy) {
  const profile = serverEnemyProfile(enemy);
  return Boolean(
    enemy &&
    enemy.alive &&
    profile &&
    (
      typeof enemy.hurlable === "boolean"
        ? enemy.hurlable
        : profile.hurlable !== false
    )
  );
}

function allSharedEnemies() {
  return [...worldEntitiesById.values()];
}

function sharedEnemiesOnMap(mapId) {
  return worldEntitiesByMap.get(mapId) || [];
}

function serverEnemyBodyPoint(enemy) {
  const profile = serverEnemyProfile(enemy);

  return {
    x: enemy?.x || 0,
    y:
      (enemy?.y || 0) +
      (profile?.bodyOffsetY || 0)
  };
}

function allEnemySpawnDefinitions() {
  const definitions = [];

  for (
    const [mapId, mapDefinition]
    of Object.entries(WORLD_CONTENT.maps)
  ) {
    for (
      const spawn
      of mapDefinition.enemySpawns || []
    ) {
      definitions.push({
        ...spawn,
        mapId
      });
    }
  }

  return definitions;
}

function enemySpawnsOfType(type) {
  return allEnemySpawnDefinitions()
    .filter(spawn => spawn.type === type);
}

function validateWorldContent() {
  const ids = new Set();

  const supportedTypes = new Set(
    Object.keys(
      SERVER_ENEMY_RUNTIME_PROFILES
    )
  );

  for (const spawn of allEnemySpawnDefinitions()) {
    if (!spawn.id || ids.has(spawn.id)) {
      throw new Error(
        `Invalid or duplicate world entity id: ${spawn.id}`
      );
    }

    ids.add(spawn.id);

    if (!supportedTypes.has(spawn.type)) {
      throw new Error(
        `Unsupported enemy type in WORLD_CONTENT: ${spawn.type}`
      );
    }

    if (
      !Number.isFinite(spawn.x) ||
      !Number.isFinite(spawn.y)
    ) {
      throw new Error(
        `Invalid coordinates for world entity: ${spawn.id}`
      );
    }

    if (
      !Number.isFinite(spawn.level) ||
      spawn.level < 1
    ) {
      throw new Error(
        `Invalid enemy level for world entity: ${spawn.id}`
      );
    }
  }
}

validateWorldContent();

const players = new Map();

const HUNTER_SNARE_TRIGGER_RADIUS = 9;
const HUNTER_SNARE_ROOT_SECONDS = 0.65;
const HUNTER_SNARE_SLOW_SECONDS = 3.0;
const HUNTER_SNARE_SLOW_MULTIPLIER = 0.45;
const HUNTER_SNARE_MAX_ACTIVE = 3;
const HUNTER_SNARE_MAX_CHARGES = 3;
const HUNTER_SNARE_CHARGE_SECONDS = 15.0;
const hunterSnares = new Map();
let nextHunterSnareId = 1;

function hunterSnaresForOwner(ownerId) {
  return [...hunterSnares.values()]
    .filter(snare => snare.ownerId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function hunterSnareSnapshot() {
  return [...hunterSnares.values()].map(snare => ({
    id: snare.id,
    ownerId: snare.ownerId,
    mapId: snare.mapId,
    x: snare.x,
    y: snare.y
  }));
}

function removeHunterSnare(snareId, reason = "removed") {
  const snare = hunterSnares.get(snareId);
  if (!snare) return null;

  hunterSnares.delete(snareId);

  broadcast({
    type: "hunterSnareRemoved",
    snareId,
    ownerId: snare.ownerId,
    mapId: snare.mapId,
    reason
  });

  return snare;
}

function removeHunterSnaresForOwner(ownerId, mapId = null, reason = "ownerCleanup") {
  for (const snare of [...hunterSnares.values()]) {
    if (
      snare.ownerId !== ownerId ||
      (mapId && snare.mapId !== mapId)
    ) {
      continue;
    }

    removeHunterSnare(snare.id, reason);
  }
}

function broadcastHunterSnareChargeState(playerId) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  broadcast({
    type: "hunterSnareChargeState",
    ownerId: playerId,
    charges: Math.max(0, Math.floor(playerState.hunterSnareCharges || 0))
  });
}

function tickHunterSnareCharges(dt) {
  for (const [playerId, playerState] of players.entries()) {
    const charges = Math.max(
      0,
      Math.min(
        HUNTER_SNARE_MAX_CHARGES,
        Math.floor(Number(playerState.hunterSnareCharges) || 0)
      )
    );

    playerState.hunterSnareCharges = charges;

    // A trap sitting in the world still occupies one of the hunter's three
    // total trap slots. This prevents pre-placing three snares, waiting back
    // to three charges, and effectively entering combat with six traps.
    // Once a trap springs (or otherwise leaves the field), that slot becomes
    // eligible to recharge.
    const activeTrapCount = hunterSnaresForOwner(playerId).length;
    const maxBankedCharges = Math.max(
      0,
      HUNTER_SNARE_MAX_CHARGES - activeTrapCount
    );

    if (charges >= maxBankedCharges) {
      playerState.hunterSnareChargeTime = 0;
      continue;
    }

    const rechargeMultiplier =
      playerState.camouflaged ? 2 : 1;

    playerState.hunterSnareChargeTime = Math.max(
      0,
      Number(playerState.hunterSnareChargeTime) || 0
    ) + dt * rechargeMultiplier;

    let changed = false;
    while (
      playerState.hunterSnareChargeTime >= HUNTER_SNARE_CHARGE_SECONDS &&
      playerState.hunterSnareCharges < maxBankedCharges
    ) {
      playerState.hunterSnareChargeTime -= HUNTER_SNARE_CHARGE_SECONDS;
      playerState.hunterSnareCharges += 1;
      changed = true;
    }

    if (playerState.hunterSnareCharges >= maxBankedCharges) {
      playerState.hunterSnareChargeTime = 0;
    }

    if (changed) {
      broadcastHunterSnareChargeState(playerId);
    }
  }
}

function handleHunterSnarePlace(playerId, message) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) return;

  if ((playerState.hunterSnareCharges || 0) <= 0) {
    broadcast({
      type: "hunterSnarePlaceRejected",
      ownerId: playerId,
      reason: "noCharges",
      charges: 0
    });
    return;
  }

  const x = Number(message.x);
  const y = Number(message.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  // The setup is performed by the owning client (2.5s normally, 1.25s while
  // Camouflaged). The authoritative
  // server still validates that the completed trap lands at the player's feet.
  if (Math.hypot(x - playerState.x, y - playerState.y) > 14) {
    return;
  }

  playerState.hunterSnareCharges = Math.max(
    0,
    Math.floor(playerState.hunterSnareCharges || 0) - 1
  );

  // A placed trap occupies its charge slot while it remains on the field.
  // Recharge only becomes possible after a trap leaves the field.
  if (!Number.isFinite(playerState.hunterSnareChargeTime)) {
    playerState.hunterSnareChargeTime = 0;
  }

  broadcastHunterSnareChargeState(playerId);

  const existing = hunterSnaresForOwner(playerId);

  // A hunter may maintain three prepared traps. Setting a fourth retires the
  // oldest one rather than rejecting a completed setup action.
  if (existing.length >= HUNTER_SNARE_MAX_ACTIVE) {
    removeHunterSnare(existing[0].id, "replacedOldest");
  }

  const snare = {
    id: `snare:${nextHunterSnareId++}`,
    ownerId: playerId,
    mapId: playerState.mapId,
    x: playerState.x,
    y: playerState.y,
    createdAt: Date.now()
  };

  hunterSnares.set(snare.id, snare);

  broadcast({
    type: "hunterSnarePlaced",
    ...snare
  });
}

function tickHunterSnares() {
  for (const snare of [...hunterSnares.values()]) {
    const owner = players.get(snare.ownerId);

    if (
      !owner ||
      owner.mapId !== snare.mapId ||
      owner.hp <= 0
    ) {
      removeHunterSnare(
        snare.id,
        "ownerUnavailable"
      );
      continue;
    }

    let triggeredEnemy = null;

    for (const enemy of sharedEnemiesOnMap(snare.mapId)) {
      if (!serverEnemyIsSnareable(enemy)) continue;
      if (enemy.hurlTime > 0) continue;

      ensureServerEnemySnareState(enemy);

      const distance = Math.hypot(
        enemy.x - snare.x,
        enemy.y - snare.y
      );

      if (distance <= HUNTER_SNARE_TRIGGER_RADIUS) {
        triggeredEnemy = enemy;
        break;
      }
    }

    if (!triggeredEnemy) continue;

    ensureServerEnemySnareState(triggeredEnemy);
    triggeredEnemy.snareRootTime =
      HUNTER_SNARE_ROOT_SECONDS;
    triggeredEnemy.snareSlowTime =
      HUNTER_SNARE_SLOW_SECONDS;
    triggeredEnemy.snareSlowMultiplier =
      HUNTER_SNARE_SLOW_MULTIPLIER;

    const removed = removeHunterSnare(
      snare.id,
      "triggered"
    );

    broadcast({
      type: "hunterSnareTriggered",
      snareId: snare.id,
      ownerId: snare.ownerId,
      mapId: snare.mapId,
      x: removed?.x ?? snare.x,
      y: removed?.y ?? snare.y,
      enemyType: triggeredEnemy.type,
      enemyId: triggeredEnemy.id,
      rootSeconds: HUNTER_SNARE_ROOT_SECONDS,
      slowSeconds: HUNTER_SNARE_SLOW_SECONDS,
      slowMultiplier: HUNTER_SNARE_SLOW_MULTIPLIER
    });
  }
}

// PvP is deliberately opt-in. Both players must have it enabled before the
// server will accept any player-vs-player attack. Once combat begins, both
// participants are locked in PvP for a short window so nobody can attack and
// immediately toggle themselves safe.
const PVP_DAMAGE_MULTIPLIER = 0.50;
const PVP_COMBAT_LOCK_MS = 10_000;
const pvpAttackRateLimits = new Map();


// -----------------------------------------------------------------------------
// SHARED ENVIRONMENT
// -----------------------------------------------------------------------------
// The browser already owns the static art/layout for trees, grass, and flowers.
// On first connection it sends a deterministic catalog of those persistent
// entity IDs/positions. From then on this server owns all mutable state.
//
// This avoids duplicating the large existing map-layout code while still giving
// every connected player one authoritative environment for the session.
const sharedEnvironment = new Map();
const dirtyEnvironmentIds = new Set();

const sharedResources = new Map();
let nextSharedResourceId = 1;

let environmentSpreadTimer = 0;
const ENVIRONMENT_SPREAD_INTERVAL = 0.24;

// Regrowth uses one timestamp stored on the existing environment entity.
// There are no per-tree/per-grass setTimeout timers.
const TREE_REGROW_MIN_MS = 180_000;
const TREE_REGROW_MAX_MS = 240_000;
const GRASS_REGROW_MIN_MS = 90_000;
const GRASS_REGROW_MAX_MS = 120_000;

function randomRegrowTimestamp(
  minMs,
  maxMs
) {
  const delay =
    minMs +
    Math.floor(
      Math.random() *
      (maxMs - minMs + 1)
    );

  return Date.now() + delay;
}

function scheduleTreeRegrow(entity) {
  if (
    !entity ||
    entity.kind !== "tree" ||
    entity.regrowAt > 0
  ) {
    return false;
  }

  entity.regrowAt =
    randomRegrowTimestamp(
      TREE_REGROW_MIN_MS,
      TREE_REGROW_MAX_MS
    );

  return true;
}

function scheduleGrassRegrow(entity) {
  if (
    !entity ||
    entity.kind !== "grass" ||
    entity.regrowAt > 0
  ) {
    return false;
  }

  entity.regrowAt =
    randomRegrowTimestamp(
      GRASS_REGROW_MIN_MS,
      GRASS_REGROW_MAX_MS
    );

  return true;
}

function resetTreeToFresh(entity) {
  entity.hp = entity.maxHp;
  entity.isStump = false;

  entity.falling = false;
  entity.fallTime = 0;
  entity.fallDirection = 1;
  entity.lastHitPlayerId = null;

  entity.canopyBurnTime = 0;
  entity.canopyBurned = false;

  entity.regrowAt = 0;

  markEnvironmentDirty(entity);
}

function resetGrassToFresh(entity) {
  entity.cut = false;
  entity.burnt = false;
  entity.burnTime = 0;
  entity.regrowAt = 0;

  markEnvironmentDirty(entity);
}

function environmentEntitySnapshot(entity) {
  const common = {
    id: entity.id,
    mapId: entity.mapId,
    kind: entity.kind,
    x: entity.x,
    y: entity.y
  };

  if (entity.kind === "tree") {
    return {
      ...common,
      hp: entity.hp,
      maxHp: entity.maxHp,
      isStump: entity.isStump,
      falling: entity.falling,
      fallTime: Number(entity.fallTime.toFixed(3)),
      fallDuration: entity.fallDuration,
      fallDirection: entity.fallDirection,
      canopyBurnTime: Number(entity.canopyBurnTime.toFixed(3)),
      canopyBurnDuration: entity.canopyBurnDuration,
      canopyBurned: entity.canopyBurned,
      canopyVariant: entity.canopyVariant
    };
  }

  if (entity.kind === "grass") {
    return {
      ...common,
      cut: entity.cut,
      burnt: entity.burnt,
      burnTime: Number(entity.burnTime.toFixed(3)),
      burnDuration: entity.burnDuration
    };
  }

  return {
    ...common,
    cut: entity.cut,
    burnt: entity.burnt,
    burnTime: Number(entity.burnTime.toFixed(3)),
    burnDuration: entity.burnDuration,
    looted: entity.looted,
    flowerType: entity.flowerType
  };
}

function sharedEnvironmentSnapshot() {
  return [...sharedEnvironment.values()]
    .map(environmentEntitySnapshot);
}

function markEnvironmentDirty(entity) {
  if (entity?.id) {
    dirtyEnvironmentIds.add(entity.id);
  }
}

function flushEnvironmentPatches() {
  if (dirtyEnvironmentIds.size === 0) return;

  const entities = [];

  for (const entityId of dirtyEnvironmentIds) {
    const entity = sharedEnvironment.get(entityId);
    if (entity) {
      entities.push(environmentEntitySnapshot(entity));
    }
  }

  dirtyEnvironmentIds.clear();

  if (entities.length > 0) {
    broadcast({
      type: "environmentPatch",
      entities
    });
  }
}

function sanitizeEnvironmentCatalogEntity(mapId, source) {
  if (
    !source ||
    typeof source !== "object" ||
    !["tree", "grass", "flower"].includes(source.kind)
  ) {
    return null;
  }

  const id = String(source.id || "");
  const kind = source.kind;

  if (
    !id ||
    !id.startsWith(`${mapId}:${kind}:`)
  ) {
    return null;
  }

  const x = clampNumber(source.x, 0, 640, 0);
  const y = clampNumber(source.y, 0, 400, 0);

  if (kind === "tree") {
    return {
      id,
      mapId,
      kind,
      x,
      y,

      hp: 4,
      maxHp: 4,
      isStump: false,

      falling: false,
      fallTime: 0,
      fallDuration: 0.42,
      fallDirection: 1,
      lastHitPlayerId: null,

      canopyBurnTime: 0,
      canopyBurnDuration: 2.7,
      canopyBurned: false,

      regrowAt: 0,

      canopyVariant: clampInteger(
        source.canopyVariant,
        0,
        8,
        0
      )
    };
  }

  if (kind === "grass") {
    return {
      id,
      mapId,
      kind,
      x,
      y,

      cut: false,
      burnt: false,
      burnTime: 0,
      burnDuration: 1.05,
      regrowAt: 0
    };
  }

  return {
    id,
    mapId,
    kind,
    x,
    y,

    cut: false,
    burnt: false,
    burnTime: 0,
    burnDuration: 1.15,
    looted: false,

    flowerType:
      source.flowerType === "blue"
        ? "blue"
        : "white"
  };
}

function handleEnvironmentCatalog(
  playerId,
  message
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  const mapId = String(message.mapId || "");
  if (!ALLOWED_MAPS.has(mapId)) return;

  const entities =
    Array.isArray(message.entities)
      ? message.entities.slice(0, 500)
      : [];

  let addedAny = false;

  for (const source of entities) {
    const entity =
      sanitizeEnvironmentCatalogEntity(
        mapId,
        source
      );

    if (!entity) continue;

    // Existing authoritative state always wins over a reconnecting/default
    // client's catalog.
    if (!sharedEnvironment.has(entity.id)) {
      sharedEnvironment.set(
        entity.id,
        entity
      );

      addedAny = true;
    }
  }

  // Send the complete authority after registration. This also corrects random
  // canopy variants on later clients to the first registered version.
  broadcast({
    type: "environmentSnapshot",
    entities: sharedEnvironmentSnapshot()
  });

  if (addedAny) {
    console.log(
      `Environment catalog registered for ${mapId}: ${entities.length}`
    );
  }
}

function sharedResourceSnapshot() {
  return [...sharedResources.values()]
    .map(resource => ({
      id: resource.id,
      mapId: resource.mapId,
      kind: resource.kind,
      x: resource.x,
      y: resource.y,
      flowerType: resource.flowerType || null,
      life: Number(resource.life.toFixed(2))
    }));
}

function spawnSharedResource(
  mapId,
  kind,
  x,
  y,
  options = {}
) {
  if (!["wood", "flower", "goldSlimeBubble"].includes(kind)) {
    return null;
  }

  const resource = {
    id: `resource:${nextSharedResourceId++}`,
    mapId,
    kind,
    x,
    y,
    flowerType:
      kind === "flower" &&
      options.flowerType === "blue"
        ? "blue"
        : kind === "flower"
          ? "white"
          : null,
    life: 18.0
  };

  sharedResources.set(
    resource.id,
    resource
  );

  broadcast({
    type: "resourceSpawn",
    resource: {
      ...resource
    }
  });

  return resource;
}

function removeSharedResource(
  resourceId,
  reason = "expired"
) {
  if (!sharedResources.has(resourceId)) {
    return false;
  }

  sharedResources.delete(resourceId);

  broadcast({
    type: "resourceRemoved",
    resourceId,
    reason
  });

  return true;
}

function tickSharedResources(dt) {
  for (const resource of sharedResources.values()) {
    resource.life -= dt;

    if (resource.life <= 0) {
      removeSharedResource(
        resource.id,
        "expired"
      );
    }
  }
}

function handleResourcePickup(
  playerId,
  resourceId
) {
  const playerState = players.get(playerId);
  const resource =
    sharedResources.get(resourceId);

  if (!playerState || !resource) return;

  if (playerState.mapId !== resource.mapId) {
    return;
  }

  const distance = Math.hypot(
    playerState.x - resource.x,
    (playerState.y - 4) - resource.y
  );

  if (distance > 14) return;

  // Remove first so pickup races have exactly one winner.
  sharedResources.delete(resource.id);

  if (resource.kind === "wood") {
    playerState.wood += 1;
  } else if (resource.kind === "flower") {
    playerState.flowers += 1;
  } else if (resource.kind === "goldSlimeBubble") {
    playerState.goldSlimeBubbles += 1;
  }

  broadcast({
    type: "resourcePicked",
    resourceId: resource.id,
    resourceKind: resource.kind,
    collectorId: playerId,
    totalWood: playerState.wood,
    totalFlowers: playerState.flowers,
    totalGoldSlimeBubbles: playerState.goldSlimeBubbles
  });
}

const FIRST_BENCH_X = 216;
const FIRST_BENCH_Y = 101;

const CRAFT_RECIPES = Object.freeze({
  woodSword: Object.freeze({
    cost: 5,
    stateKey: "woodSwordCrafted",
    repeatable: false
  }),
  woodBow: Object.freeze({
    cost: 5,
    stateKey: "woodBowCrafted",
    repeatable: false
  }),
  shepherdStaff: Object.freeze({
    cost: 5,
    stateKey: "shepherdStaffCrafted",
    repeatable: false
  }),
  woodHelm: Object.freeze({
    cost: 3,
    stateKey: "woodHelmCrafted",
    repeatable: false
  }),
  woodChest: Object.freeze({
    cost: 5,
    stateKey: "woodChestCrafted",
    repeatable: false
  }),
  woodGreaves: Object.freeze({
    cost: 4,
    stateKey: "woodGreavesCrafted",
    repeatable: false
  }),
  arrows: Object.freeze({
    cost: 1,
    repeatable: true,
    resourceKey: "arrows",
    outputCount: 5
  })
});

function handleCraftRequest(
  playerId,
  socket,
  message
) {
  const playerState =
    players.get(playerId);

  const recipeId =
    typeof message.recipe === "string"
      ? message.recipe
      : "";

  const recipe =
    CRAFT_RECIPES[recipeId];

  if (
    !playerState ||
    !recipe
  ) {
    return;
  }

  const validBench =
    playerState.mapId === "spawn" &&
    Math.hypot(
      playerState.x - FIRST_BENCH_X,
      playerState.y - FIRST_BENCH_Y
    ) <= 30;

  if (!validBench) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "tooFar",
      totalWood: playerState.wood,
      totalArrows: playerState.arrows
    });
    return;
  }

  if (
    !recipe.repeatable &&
    recipe.stateKey &&
    playerState[recipe.stateKey]
  ) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "alreadyCrafted",
      totalWood: playerState.wood,
      totalArrows: playerState.arrows
    });
    return;
  }

  if (playerState.wood < recipe.cost) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "needWood",
      totalWood: playerState.wood,
      totalArrows: playerState.arrows
    });
    return;
  }

  playerState.wood -=
    recipe.cost;

  if (recipe.resourceKey === "arrows") {
    playerState.arrows +=
      Math.max(1, Number(recipe.outputCount) || 1);
  } else if (recipe.stateKey) {
    playerState[recipe.stateKey] = true;
  }

  sendJson(socket, {
    type: "craftResult",
    recipe: recipeId,
    success: true,
    totalWood: playerState.wood,
    totalArrows: playerState.arrows
  });
}

function handleArrowUse(playerId, socket) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  // Weapon selection is synced on the ordinary player-state cadence, so the
  // server only authoritatively owns the ammo count here. The client sends
  // this request only after a real bow projectile is created.
  const hasArrow = playerState.arrows > 0;

  if (hasArrow) {
    playerState.arrows -= 1;
  }

  sendJson(socket, {
    type: "arrowUseResult",
    success: hasArrow,
    totalArrows: playerState.arrows
  });
}

const FIRST_NPC_X = 190;
const FIRST_NPC_Y = 100;
const SHOP_PRICE = 1;

const SHOP_ITEM_IDS = new Set([
  "weapon_sword",
  "weapon_axe",
  "weapon_wand",
  "weapon_rainWand",
  "weapon_katana",
  "weapon_oldSword",
  "weapon_dreamcatcher",

  "hat_original",
  "hat_blueCap",
  "hat_wizard",
  "hat_jester",
  "hat_ninja",
  "hat_knight",
  "hat_bandana",
  "hat_ranger",

  "shirt_traveler",
  "shirt_jester",
  "shirt_ninja",
  "shirt_knight",
  "shirt_ranger",

  "pants_traveler",
  "pants_jester",
  "pants_ninja",
  "pants_knight",
  "pants_ranger"
]);

function handleShopPurchase(
  playerId,
  socket,
  message
) {
  const playerState =
    players.get(playerId);

  const itemId =
    typeof message.itemId === "string"
      ? message.itemId
      : "";

  if (
    !playerState ||
    !SHOP_ITEM_IDS.has(itemId)
  ) {
    return;
  }

  const validShop =
    playerState.mapId === "spawn" &&
    Math.hypot(
      playerState.x - FIRST_NPC_X,
      playerState.y - FIRST_NPC_Y
    ) <= 48;

  if (!validShop) {
    sendJson(socket, {
      type: "shopPurchaseResult",
      itemId,
      success: false,
      reason: "tooFar",
      totalCoins: playerState.coins
    });
    return;
  }

  // The Axe and Wood Sword remain tutorial-only items and are never sold.
  if (
    itemId === "weapon_axe" ||
    itemId === "weapon_sword" ||
    playerState.shopPurchases.includes(itemId)
  ) {
    sendJson(socket, {
      type: "shopPurchaseResult",
      itemId,
      success: false,
      reason: "alreadyOwned",
      totalCoins: playerState.coins
    });
    return;
  }

  if (playerState.coins < SHOP_PRICE) {
    sendJson(socket, {
      type: "shopPurchaseResult",
      itemId,
      success: false,
      reason: "needCoin",
      totalCoins: playerState.coins
    });
    return;
  }

  playerState.coins -=
    SHOP_PRICE;

  playerState.shopPurchases.push(
    itemId
  );

  sendJson(socket, {
    type: "shopPurchaseResult",
    itemId,
    success: true,
    totalCoins: playerState.coins
  });
}

const DEBUG_COIN_GRANT = 10;
const DEBUG_ARROW_GRANT = 99;

function handleDebugGrantCoins(
  playerId,
  socket
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  playerState.coins =
    (Number.isFinite(playerState.coins)
      ? playerState.coins
      : 0) + DEBUG_COIN_GRANT;

  sendJson(socket, {
    type: "debugCoinGrant",
    amount: DEBUG_COIN_GRANT,
    totalCoins: playerState.coins
  });
}

function handleDebugGrantArrows(
  playerId,
  socket
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  playerState.arrows =
    Math.max(0, Math.floor(Number(playerState.arrows) || 0)) +
    DEBUG_ARROW_GRANT;

  sendJson(socket, {
    type: "debugArrowGrant",
    amount: DEBUG_ARROW_GRANT,
    totalArrows: playerState.arrows
  });
}

function environmentEntitiesOnMap(
  mapId,
  kind = null
) {
  const result = [];

  for (const entity of sharedEnvironment.values()) {
    if (
      entity.mapId === mapId &&
      (!kind || entity.kind === kind)
    ) {
      result.push(entity);
    }
  }

  return result;
}

function environmentMeleeValid(
  playerState,
  entity,
  allowedWeapons,
  targetOffsetY,
  extraRange,
  halfArc = 0.9
) {
  if (!allowedWeapons.includes(playerState.weaponIndex)) {
    return false;
  }

  const dx =
    entity.x - playerState.x;

  const dy =
    (entity.y - targetOffsetY) -
    (playerState.y - 8);

  const distance =
    Math.hypot(dx, dy);

  const reach =
    playerState.weaponIndex === 4
      ? 27
      : 22;

  if (distance > reach + extraRange) {
    return false;
  }

  const targetAngle =
    Math.atan2(dy, dx);

  return (
    Math.abs(
      angleDifference(
        targetAngle,
        playerState.attackAimAngle
      )
    ) <= halfArc
  );
}

function igniteEnvironmentEntity(entity, sourcePlayerId = null) {
  if (!entity) return false;

  if (entity.kind === "tree") {
    if (
      entity.isStump ||
      entity.falling ||
      entity.canopyBurned ||
      entity.canopyBurnTime > 0
    ) {
      return false;
    }

    entity.canopyBurnTime =
      entity.canopyBurnDuration;
    entity.burnSourcePlayerId = sourcePlayerId || entity.burnSourcePlayerId || null;

    markEnvironmentDirty(entity);
    return true;
  }

  if (
    entity.cut ||
    entity.burnt ||
    entity.burnTime > 0
  ) {
    return false;
  }

  entity.burnTime =
    entity.burnDuration;
  entity.burnSourcePlayerId = sourcePlayerId || entity.burnSourcePlayerId || null;

  if (entity.kind === "flower") {
    // Fire-destroyed flowers never produce loot.
    entity.looted = true;
  }

  markEnvironmentDirty(entity);
  return true;
}

function extinguishEnvironmentEntity(entity) {
  if (!entity) return false;

  if (entity.kind === "tree") {
    if (entity.canopyBurnTime <= 0) {
      return false;
    }

    entity.canopyBurnTime = 0;
    entity.burnSourcePlayerId = null;
    markEnvironmentDirty(entity);
    return true;
  }

  if (entity.burnTime <= 0) {
    return false;
  }

  entity.burnTime = 0;
  entity.burnSourcePlayerId = null;
  markEnvironmentDirty(entity);
  return true;
}

function environmentEntityFirePoint(entity) {
  if (entity.kind === "tree") {
    return {
      x: entity.x,
      y: entity.y - 18,
      radius: 20,
      chance: 0.48
    };
  }

  if (entity.kind === "flower") {
    return {
      x: entity.x,
      y: entity.y - 8,
      radius: 16,
      chance: 0.60
    };
  }

  return {
    x: entity.x,
    y: entity.y - 5,
    radius: 17,
    chance: 0.58
  };
}

function igniteEnvironmentNear(
  mapId,
  x,
  y,
  radius,
  sourcePlayerId = null
) {
  let changed = false;

  for (
    const entity
    of environmentEntitiesOnMap(mapId)
  ) {
    let targetX = entity.x;
    let targetY = entity.y;

    if (entity.kind === "tree") {
      targetY -= 28;

      const dx = targetX - x;
      const dy = targetY - y;

      if (
        dx * dx + dy * dy <=
        (radius + 13) * (radius + 13)
      ) {
        changed =
          igniteEnvironmentEntity(entity, sourcePlayerId) ||
          changed;
      }

      continue;
    }

    targetY -=
      entity.kind === "flower"
        ? 8
        : 5;

    const dx = targetX - x;
    const dy = targetY - y;

    if (
      dx * dx + dy * dy <=
      radius * radius
    ) {
      changed =
        igniteEnvironmentEntity(entity, sourcePlayerId) ||
        changed;
    }
  }

  return changed;
}

function extinguishEnvironmentNear(
  mapId,
  x,
  y,
  radius
) {
  let changed = false;

  for (
    const entity
    of environmentEntitiesOnMap(mapId)
  ) {
    const targetY =
      entity.y -
      (
        entity.kind === "tree"
          ? 18
          : entity.kind === "flower"
            ? 8
            : 5
      );

    const extra =
      entity.kind === "tree"
        ? 10
        : 0;

    const dx = entity.x - x;
    const dy = targetY - y;

    if (
      dx * dx + dy * dy <=
      (radius + extra) *
      (radius + extra)
    ) {
      changed =
        extinguishEnvironmentEntity(entity) ||
        changed;
    }
  }

  return changed;
}

function igniteServerLivingNear(
  mapId,
  x,
  y,
  radius,
  sourcePlayerId = null
) {
  for (
    const enemy
    of sharedEnemiesOnMap(mapId)
  ) {
    if (!enemy.alive) continue;

    const body = serverEnemyBodyPoint(enemy);

    if (
      Math.hypot(
        body.x - x,
        body.y - y
      ) > radius
    ) {
      continue;
    }

    // Wet enemies resist ordinary environmental ignition. If they do catch,
    // keep the original player attribution attached to the whole fire chain.
    applyServerEnemyBurn(enemy, {
      sourcePlayerId,
      duration: STATUS_RULES.enemyBurnDuration
    });
  }

  for (const playerState of players.values()) {
    if (
      playerState.mapId !== mapId ||
      playerState.hp <= 0 ||
      playerState.burnTime > 0
    ) {
      continue;
    }

    if (
      Math.hypot(
        playerState.x - x,
        (playerState.y - 8) - y
      ) > radius
    ) {
      continue;
    }

    if (!applyServerPlayerBurn(playerState)) {
      continue;
    }

    broadcast({
      type: "playerIgnited",
      targetId: playerState.id,
      mapId,
      burnTime: playerState.burnTime
    });
  }
}

function spreadSharedEnvironmentFire() {
  const sources = [];

  for (const entity of sharedEnvironment.values()) {
    const burning =
      entity.kind === "tree"
        ? entity.canopyBurnTime > 0 &&
          !entity.canopyBurned
        : entity.burnTime > 0 &&
          !entity.cut;

    if (!burning) continue;

    sources.push({
      mapId: entity.mapId,
      sourcePlayerId: entity.burnSourcePlayerId || null,
      ...environmentEntityFirePoint(entity)
    });
  }

  for (const enemy of allSharedEnemies()) {
    if (!enemy.alive || enemy.burnTime <= 0) {
      continue;
    }

    const profile = serverEnemyProfile(enemy);
    const body = serverEnemyBodyPoint(enemy);

    sources.push({
      mapId: enemy.mapId,
      sourcePlayerId: enemy.lastDamagePlayerId || enemy.aggroTargetId || null,
      x: body.x,
      y: body.y,
      radius: 13,
      chance:
        profile?.fireSpreadChance ?? 0.42
    });
  }

  for (const playerState of players.values()) {
    if (playerState.burnTime > 0) {
      sources.push({
        mapId: playerState.mapId,
        sourcePlayerId: playerState.id,
        x: playerState.x,
        y: playerState.y - 8,
        radius: 13,
        chance: 0.42
      });
    }
  }

  // Snapshot first: newly ignited vegetation waits for the next spread pulse.
  for (const source of sources) {
    if (Math.random() > source.chance) {
      continue;
    }

    igniteEnvironmentNear(
      source.mapId,
      source.x,
      source.y,
      source.radius,
      source.sourcePlayerId || null
    );

    igniteServerLivingNear(
      source.mapId,
      source.x,
      source.y,
      Math.max(
        11,
        source.radius - 1
      ),
      source.sourcePlayerId || null
    );
  }
}

function tickSharedEnvironment(dt) {
  const now = Date.now();

  for (const entity of sharedEnvironment.values()) {
    if (
      entity.kind === "tree" &&
      entity.falling
    ) {
      entity.fallTime -= dt;
      markEnvironmentDirty(entity);

      if (entity.fallTime <= 0) {
        entity.fallTime = 0;
        entity.falling = false;
        entity.isStump = true;
        scheduleTreeRegrow(entity);

        spawnSharedResource(
          entity.mapId,
          "wood",
          entity.x +
            entity.fallDirection * 14,
          entity.y - 1
        );

        if (entity.lastHitPlayerId) {
          broadcast({
            type: "environmentReward",
            targetId:
              entity.lastHitPlayerId,
            reward: "woodcuttingExp",
            amount: 1
          });
        }

        markEnvironmentDirty(entity);
      }
    }

    if (
      entity.kind === "tree" &&
      entity.canopyBurnTime > 0
    ) {
      entity.canopyBurnTime -= dt;
      markEnvironmentDirty(entity);

      if (entity.canopyBurnTime <= 0) {
        entity.canopyBurnTime = 0;
        entity.burnSourcePlayerId = null;
        entity.canopyBurned = true;
        scheduleTreeRegrow(entity);
        markEnvironmentDirty(entity);
      }
    }

    if (
      entity.kind !== "tree" &&
      entity.burnTime > 0
    ) {
      entity.burnTime -= dt;
      markEnvironmentDirty(entity);

      if (entity.burnTime <= 0) {
        entity.burnTime = 0;
        entity.burnSourcePlayerId = null;
        entity.cut = true;
        entity.burnt = true;

        if (entity.kind === "grass") {
          scheduleGrassRegrow(entity);
        }

        if (entity.kind === "flower") {
          entity.looted = true;
        }

        markEnvironmentDirty(entity);
      }
    }

    if (
      entity.kind === "tree" &&
      entity.regrowAt > 0 &&
      now >= entity.regrowAt
    ) {
      resetTreeToFresh(entity);
      continue;
    }

    if (
      entity.kind === "grass" &&
      entity.regrowAt > 0 &&
      now >= entity.regrowAt
    ) {
      resetGrassToFresh(entity);
    }
  }

  environmentSpreadTimer += dt;

  if (
    environmentSpreadTimer >=
    ENVIRONMENT_SPREAD_INTERVAL
  ) {
    environmentSpreadTimer = 0;
    spreadSharedEnvironmentFire();
  }
}

function handleEnvironmentAction(
  playerId,
  message
) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) return;

  const action = String(message.action || "");

  const payload =
    message.payload &&
    typeof message.payload === "object"
      ? message.payload
      : {};

  if (
    action === "igniteNear" ||
    action === "extinguishNear"
  ) {
    const x = clampNumber(
      payload.x,
      0,
      640,
      playerState.x
    );

    const y = clampNumber(
      payload.y,
      0,
      400,
      playerState.y
    );

    const maxDistance =
      action === "igniteNear"
        ? 285
        : 125;

    if (
      Math.hypot(
        x - playerState.x,
        y - playerState.y
      ) > maxDistance
    ) {
      return;
    }

    const radius = clampNumber(
      payload.radius,
      4,
      40,
      12
    );

    if (action === "igniteNear") {
      igniteEnvironmentNear(
        playerState.mapId,
        x,
        y,
        radius,
        playerId
      );
    } else {
      extinguishEnvironmentNear(
        playerState.mapId,
        x,
        y,
        radius
      );
    }

    return;
  }

  const entityId = String(message.entityId || "");
  const entity =
    sharedEnvironment.get(entityId);

  if (
    !entity ||
    entity.mapId !== playerState.mapId
  ) {
    return;
  }

  if (action === "hitTree") {
    if (
      entity.kind !== "tree" ||
      entity.isStump ||
      entity.falling ||
      !environmentMeleeValid(
        playerState,
        entity,
        [1],
        15,
        9,
        0.92
      )
    ) {
      return;
    }

    entity.hp = Math.max(
      0,
      entity.hp - 1
    );

    entity.lastHitPlayerId = playerId;
    scheduleTreeRegrow(entity);
    markEnvironmentDirty(entity);

    if (entity.hp <= 0) {
      entity.falling = true;
      entity.fallTime =
        entity.fallDuration;

      entity.fallDirection =
        playerState.x < entity.x
          ? 1
          : -1;

      markEnvironmentDirty(entity);
    }

    return;
  }

  if (action === "cutGrass") {
    if (
      entity.kind !== "grass" ||
      entity.cut ||
      !environmentMeleeValid(
        playerState,
        entity,
        [0, 4, 5],
        5,
        8,
        0.94
      )
    ) {
      return;
    }

    entity.cut = true;
    entity.burnTime = 0;
    scheduleGrassRegrow(entity);
    markEnvironmentDirty(entity);
    return;
  }

  if (action === "cutFlower") {
    if (
      entity.kind !== "flower" ||
      entity.cut ||
      !environmentMeleeValid(
        playerState,
        entity,
        [0, 4, 5],
        7,
        8,
        0.94
      )
    ) {
      return;
    }

    entity.cut = true;
    entity.burnTime = 0;

    if (!entity.looted) {
      entity.looted = true;

      spawnSharedResource(
        entity.mapId,
        "flower",
        entity.x + 5,
        entity.y - 1,
        {
          flowerType:
            entity.flowerType
        }
      );
    }

    markEnvironmentDirty(entity);
  }
}


// -----------------------------------------------------------------------------
// SHARED COIN DROPS
// -----------------------------------------------------------------------------
const sharedCoins = new Map();
let nextSharedCoinId = 1;

function sharedCoinSnapshot() {
  return [...sharedCoins.values()].map(coin => ({
    id: coin.id,
    mapId: coin.mapId,
    x: coin.x,
    y: coin.y,
    life: Number(coin.life.toFixed(2))
  }));
}

function spawnSharedCoin(mapId, x, y) {
  const coin = {
    id: `coin:${nextSharedCoinId++}`,
    mapId,
    x,
    y,
    life: 12.0
  };

  sharedCoins.set(coin.id, coin);

  broadcast({
    type: "coinSpawn",
    coin: {
      ...coin
    }
  });

  return coin;
}

function removeSharedCoin(coinId, reason = "expired") {
  if (!sharedCoins.has(coinId)) return false;

  sharedCoins.delete(coinId);

  broadcast({
    type: "coinRemoved",
    coinId,
    reason
  });

  return true;
}

function tickSharedCoins(dt) {
  for (const coin of sharedCoins.values()) {
    coin.life -= dt;

    if (coin.life <= 0) {
      removeSharedCoin(coin.id, "expired");
    }
  }
}

function handleCoinPickup(playerId, coinId) {
  const playerState = players.get(playerId);
  const coin = sharedCoins.get(coinId);

  if (!playerState || !coin) return;
  if (playerState.mapId !== coin.mapId) return;

  const distance = Math.hypot(
    playerState.x - coin.x,
    (playerState.y - 4) - coin.y
  );

  // Slightly more forgiving than the 9 px client pickup radius to account for
  // the normal 20 Hz player-state network delay.
  if (distance > 13) return;

  // Delete before broadcasting so two clients racing for the same coin cannot
  // both be approved.
  sharedCoins.delete(coin.id);

  playerState.coins =
    (Number.isFinite(playerState.coins) ? playerState.coins : 0) + 1;

  broadcast({
    type: "coinPicked",
    coinId: coin.id,
    collectorId: playerId,
    totalCoins: playerState.coins
  });
}


// -----------------------------------------------------------------------------
// SHARED GOBLINS + NATURAL GHOSTS
// -----------------------------------------------------------------------------
function makeServerGoblin(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    level = 3
  } = spawn;

  return {
    id,
    mapId,
    type: "goblin",
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
    leashRadius: 120,
    combatLeashRadius: 260,

    aggroTime: 0,
    aggroDuration: 5.0,
    aggroTargetId: null,
    confusionTime: 0,
    confusionTargetId: null,

    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0,
    wanderRadiusX: 24,
    wanderRadiusY: 18,

    maxHp: 90,
    hp: 90,
    alive: true,
    respawnTime: 0,

    moving: false,
    walkTime: phase,

    attackCooldown: 0.25 + Math.random() * 0.35,
    lungeTime: 0,
    lungeDuration: 0.20,
    lungeDirX: 0,
    lungeDirY: 0,
    lungeTargetId: null,
    attackHit: false,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    lastDamagePlayerId: null
  };
}

function makeServerGhost(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    level = 5
  } = spawn;

  return {
    id,
    mapId,
    type: "ghost",
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
    leashRadius: 145,
    combatLeashRadius: 280,

    aggroTime: 0,
    aggroDuration: 5.5,
    aggroTargetId: null,
    confusionTime: 0,
    confusionTargetId: null,
    outOfCombatTime: 0,

    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0.8 + Math.random() * 1.2,

    maxHp: 150,
    hp: 150,
    alive: true,
    respawnTime: 0,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    lastDamagePlayerId: null
  };
}

function makeServerBigGoldSlime(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    level = 4
  } = spawn;

  return {
    id,
    mapId,
    type: "bigGoldSlime",
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
    leashRadius: 85,
    patrolLeashRadius: 85,
    combatLeashRadius: 320,

    aggroTime: 0,
    aggroDuration: 12,
    aggroTargetId: null,
    confusionTime: 0,
    confusionTargetId: null,

    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0.9 + Math.random() * 1.4,

    maxHp: 420,
    hp: 420,
    alive: true,
    respawnTime: 0,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    lastDamagePlayerId: null
  };
}

const SERVER_ENEMY_FACTORIES = Object.freeze({
  slime: makeServerSlime,
  goblin: makeServerGoblin,
  ghost: makeServerGhost,
  bigGoldSlime: makeServerBigGoldSlime
});

const worldEntitiesByType = new Map(
  Object.entries(
    SERVER_ENEMY_FACTORIES
  ).map(([enemyType, factory]) => [
    enemyType,
    enemySpawnsOfType(enemyType)
      .map(spawn => {
        const enemy = ensureServerEnemySnareState(
          ensureServerEnemyHurlState(
            factory(spawn)
          )
        );

        if (typeof spawn.hurlable === "boolean") {
          enemy.hurlable = spawn.hurlable;
        }

        if (typeof spawn.snareable === "boolean") {
          enemy.snareable = spawn.snareable;
        }

        return enemy;
      })
  ])
);

const sharedSlimes =
  worldEntitiesByType.get("slime") || [];

const sharedGoblins =
  worldEntitiesByType.get("goblin") || [];

const sharedGhosts =
  worldEntitiesByType.get("ghost") || [];

const sharedBigGoldSlimes =
  worldEntitiesByType.get("bigGoldSlime") || [];

// One authoritative registry across maps and enemy species.
const worldEntitiesById = new Map();
const worldEntitiesByMap = new Map();

for (const entities of worldEntitiesByType.values()) {
  for (const entity of entities) {
    if (worldEntitiesById.has(entity.id)) {
      throw new Error(
        `Duplicate runtime entity id: ${entity.id}`
      );
    }

    worldEntitiesById.set(
      entity.id,
      entity
    );

    if (!worldEntitiesByMap.has(entity.mapId)) {
      worldEntitiesByMap.set(
        entity.mapId,
        []
      );
    }

    worldEntitiesByMap
      .get(entity.mapId)
      .push(entity);
  }
}

// Every registered enemy species uses the same shared-enemy snapshot/action
// protocol. Species-specific AI remains separate, but networking does not.
const sharedEnemyCollections =
  Object.fromEntries(
    [...worldEntitiesByType.entries()]
  );

const sharedEnemyActionRateLimits = new Map();
const playerEnemyContactCooldowns = new Map();

function sharedEnemySnapshot(enemyType) {
  const collection =
    sharedEnemyCollections[enemyType] || [];

  return collection.map(enemy => {
    ensureServerEnemyStatusState(enemy);

    return ({
    id: enemy.id,
    mapId: enemy.mapId,
    x: Number(enemy.x.toFixed(2)),
    y: Number(enemy.y.toFixed(2)),
    dir: enemy.dir,
    level: enemy.level,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    alive: enemy.alive,
    aggroTime: Number((enemy.aggroTime || 0).toFixed(2)),
    aggroTargetId: enemy.aggroTargetId || null,
    confusionTime: Number((enemy.confusionTime || 0).toFixed(2)),
    confusionTargetId: enemy.confusionTargetId || null,
    burnTime: Number(enemy.burnTime.toFixed(2)),
    respawnTime: Number(enemy.respawnTime.toFixed(2)),
    carriedBy: enemy.carriedBy || null,
    pickupTime: Number((enemy.pickupTime || 0).toFixed(3)),
    pickupDuration: enemy.pickupDuration || 0.18,
    pickupDirX: Number((enemy.pickupDirX || 0).toFixed(3)),
    pickupDirY: Number((enemy.pickupDirY || 0).toFixed(3)),
    hurlTime: Number((enemy.hurlTime || 0).toFixed(3)),
    hurlDuration: enemy.hurlDuration || 0.58,
    snareRootTime: Number((enemy.snareRootTime || 0).toFixed(3)),
    snareSlowTime: Number((enemy.snareSlowTime || 0).toFixed(3)),
    snareSlowMultiplier: Number((enemy.snareSlowMultiplier || 0.45).toFixed(3)),

    wetTime: Number((enemy.wetTime || 0).toFixed(2)),
    wetDuration: Number((enemy.wetDuration || STATUS_RULES.enemyWetDuration).toFixed(2)),

    ...(
      serverEnemyProfile(enemyType)
        ?.snapshotExtra?.(enemy) ||
      {}
    )
  });
  });
}

function broadcastSharedEnemySnapshots() {
  for (
    const enemyType
    of Object.keys(
      sharedEnemyCollections
    )
  ) {
    broadcast({
      type: "enemySnapshot",
      enemyType,
      enemies: sharedEnemySnapshot(enemyType)
    });
  }
}

function nearestVisiblePlayer(
  mapId,
  x,
  y,
  maxDistance = Infinity
) {
  let best = null;
  let bestDistance = Infinity;

  for (const playerState of players.values()) {
    if (
      playerState.mapId !== mapId ||
      playerState.shadowHidden ||
      playerState.hp <= 0
    ) {
      continue;
    }

    const distance = Math.hypot(
      playerState.x - x,
      playerState.y - y
    );

    if (playerState.camouflaged) {
      if (distance > CAMOUFLAGE_CLOSE_REVEAL_DISTANCE) {
        continue;
      }

      playerState.camouflaged = false;
      playerState.camouflageReadyUntil = 0;
    }

    if (
      distance < bestDistance &&
      distance <= maxDistance
    ) {
      best = playerState;
      bestDistance = distance;
    }
  }

  return best
    ? {
        player: best,
        distance: bestDistance
      }
    : null;
}

function visibleAggroPlayerById(
  playerId,
  mapId,
  observerX = null,
  observerY = null
) {
  if (!playerId) return null;

  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.mapId !== mapId ||
    playerState.shadowHidden ||
    playerState.hp <= 0
  ) {
    return null;
  }

  if (playerState.camouflaged) {
    if (
      !Number.isFinite(observerX) ||
      !Number.isFinite(observerY) ||
      Math.hypot(
        playerState.x - observerX,
        playerState.y - observerY
      ) > CAMOUFLAGE_CLOSE_REVEAL_DISTANCE
    ) {
      return null;
    }

    playerState.camouflaged = false;
    playerState.camouflageReadyUntil = 0;
  }

  return playerState;
}

function setEnemyAggroTarget(
  enemy,
  playerId,
  duration = enemy.aggroDuration ?? 4.5
) {
  enemy.aggroTargetId = playerId || null;
  enemy.aggroTime = Math.max(
    enemy.aggroTime || 0,
    duration
  );
}

function clearEnemyAggroTarget(enemy) {
  enemy.aggroTargetId = null;
  enemy.aggroTime = 0;
}

const CAMOUFLAGE_CONFUSION_DURATION = 1.25;
const CAMOUFLAGE_CLOSE_REVEAL_DISTANCE = 18;

function playerIsTargetedByPveEnemy(playerId) {
  if (!playerId) return false;

  for (const enemy of allSharedEnemies()) {
    if (!enemy?.alive) continue;

    if (
      enemy.aggroTargetId === playerId &&
      (Number(enemy.aggroTime) || 0) > 0
    ) {
      return true;
    }

    if (
      enemy.confusionTargetId === playerId &&
      (Number(enemy.confusionTime) || 0) > 0
    ) {
      return true;
    }
  }

  return false;
}

function camouflageOpeningIsValid(
  playerState,
  payload = {}
) {
  return Boolean(
    payload.camouflageOpening &&
    playerState &&
    Number.isFinite(playerState.camouflageReadyUntil) &&
    playerState.camouflageReadyUntil >= Date.now()
  );
}

function tryApplyCamouflageConfusion(
  enemy,
  playerState,
  playerId,
  payload = {}
) {
  if (!camouflageOpeningIsValid(playerState, payload)) {
    return false;
  }

  playerState.camouflaged = false;
  playerState.camouflageReadyUntil = 0;

  clearEnemyAggroTarget(enemy);
  enemy.confusionTime = CAMOUFLAGE_CONFUSION_DURATION;
  enemy.confusionTargetId = playerId;

  broadcast({
    type: "enemyConfused",
    enemyType: enemy.type,
    enemyId: enemy.id,
    mapId: enemy.mapId,
    duration: CAMOUFLAGE_CONFUSION_DURATION,
    attackerId: playerId
  });

  return true;
}

function tickEnemyConfusion(enemy, dt) {
  if (!enemy || enemy.confusionTime <= 0) {
    return false;
  }

  enemy.confusionTime = Math.max(
    0,
    enemy.confusionTime - dt
  );

  if (enemy.confusionTime > 0) {
    return true;
  }

  const targetId = enemy.confusionTargetId;
  enemy.confusionTargetId = null;

  const target = visibleAggroPlayerById(
    targetId,
    enemy.mapId,
    enemy.x,
    enemy.y
  );

  if (target) {
    setEnemyAggroTarget(
      enemy,
      target.id,
      enemy.aggroDuration
    );
  }

  return false;
}

function serverCircleRectCollision(
  cx,
  cy,
  radius,
  rx,
  ry,
  rw,
  rh
) {
  const closestX = Math.max(
    rx,
    Math.min(cx, rx + rw)
  );

  const closestY = Math.max(
    ry,
    Math.min(cy, ry + rh)
  );

  const dx = cx - closestX;
  const dy = cy - closestY;

  return dx * dx + dy * dy < radius * radius;
}

function buildGoblinTreeBases() {
  const treeBases = [];

  function add(x, y) {
    treeBases.push({ x, y });
  }

  for (let x = 12; x <= 628; x += 28) {
    add(x, 28);
    add(x, 394);
  }

  for (let x = 26; x <= 628; x += 28) {
    add(x, 52);
    add(x, 370);
  }

  for (let y = 78; y <= 322; y += 28) {
    if (y < 160 || y > 240) {
      add(14, y);
    }
    add(626, y);
  }

  for (let y = 92; y <= 322; y += 28) {
    if (y < 160 || y > 240) {
      add(40, y);
    }
    add(600, y);
  }

  [
    [120, 105], [148, 125],
    [116, 330], [150, 312],
    [530, 105], [555, 130],
    [545, 258], [575, 280],
    [220, 300], [245, 328],
    [355, 92], [385, 112]
  ].forEach(([x, y]) => add(x, y));

  return treeBases;
}

const goblinTreeBases = buildGoblinTreeBases();

function goblinPositionAllowed(
  goblin,
  x,
  y
) {
  if (
    !mapPointAllowed(
      goblin.mapId,
      x,
      y
    )
  ) {
    return false;
  }

  // Preserve the currently-tested Goblin Woods tree collision.
  if (goblin.mapId === "goblinWoods") {
    for (const tree of goblinTreeBases) {
      if (
        serverCircleRectCollision(
          x,
          y,
          4,
          tree.x - 5,
          tree.y - 8,
          10,
          8
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

function moveServerGoblin(
  goblin,
  moveX,
  moveY,
  speed,
  dt
) {
  const movementMultiplier =
    serverEnemyMovementMultiplier(goblin);

  const nextX =
    goblin.x + moveX * speed * movementMultiplier * dt;

  const nextY =
    goblin.y + moveY * speed * movementMultiplier * dt;

  if (goblinPositionAllowed(goblin, nextX, goblin.y)) {
    goblin.x = nextX;
  }

  if (goblinPositionAllowed(goblin, goblin.x, nextY)) {
    goblin.y = nextY;
  }
}

function chooseServerGoblinWanderTarget(goblin) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = Math.random() * Math.PI * 2;

    const radiusX =
      5 + Math.random() * goblin.wanderRadiusX;

    const radiusY =
      4 + Math.random() * goblin.wanderRadiusY;

    const x = Math.max(
      12,
      Math.min(
        628,
        goblin.homeX +
          Math.cos(angle) * radiusX
      )
    );

    const y = Math.max(
      18,
      Math.min(
        392,
        goblin.homeY +
          Math.sin(angle) * radiusY
      )
    );

    if (!goblinPositionAllowed(goblin, x, y)) {
      continue;
    }

    goblin.wanderTargetX = x;
    goblin.wanderTargetY = y;
    goblin.wanderDecisionTime =
      0.65 + Math.random() * 0.9;
    return;
  }

  goblin.wanderTargetX = goblin.homeX;
  goblin.wanderTargetY = goblin.homeY;
  goblin.wanderDecisionTime = 0.7;
}

function resetServerGoblin(goblin) {
  goblin.x = goblin.homeX;
  goblin.y = goblin.homeY;
  goblin.dir = 1;

  goblin.hp = goblin.maxHp;
  goblin.alive = true;
  goblin.respawnTime = 0;

  goblin.aggroTime = 0;
  goblin.aggroTargetId = null;
  goblin.confusionTime = 0;
  goblin.confusionTargetId = null;
  goblin.wanderTargetX = goblin.homeX;
  goblin.wanderTargetY = goblin.homeY;
  goblin.wanderDecisionTime = 0;
  goblin.pauseTime = 0;

  goblin.moving = false;
  goblin.attackCooldown =
    0.35 + Math.random() * 0.35;

  goblin.lungeTime = 0;
  goblin.lungeDirX = 0;
  goblin.lungeDirY = 0;
  goblin.lungeTargetId = null;
  goblin.attackHit = false;

  goblin.burnTime = 0;
  goblin.burnTickTimer = 0;

  goblin.knockbackX = 0;
  goblin.knockbackY = 0;

  goblin.tauntTime = 0;
  goblin.tauntOwnerId = null;
  clearServerEnemyHurlState(goblin);
  goblin.lastDamagePlayerId = null;
}

function resetServerGhost(ghost) {
  ghost.x = ghost.homeX;
  ghost.y = ghost.homeY;
  ghost.dir = 1;

  ghost.hp = ghost.maxHp;
  ghost.alive = true;
  ghost.respawnTime = 0;

  ghost.aggroTime = 0;
  ghost.aggroTargetId = null;
  ghost.confusionTime = 0;
  ghost.confusionTargetId = null;
  ghost.wanderAngle =
    Math.random() * Math.PI * 2;

  ghost.wanderTimer =
    0.8 + Math.random() * 1.2;

  ghost.burnTime = 0;
  ghost.burnTickTimer = 0;

  ghost.knockbackX = 0;
  ghost.knockbackY = 0;

  ghost.tauntTime = 0;
  ghost.tauntOwnerId = null;
  clearServerEnemyHurlState(ghost);
  ghost.lastDamagePlayerId = null;
}

const playerSelfDamageRateLimits = new Map();
const playerHealRateLimits = new Map();

function rateLimitPlayerEvent(
  store,
  playerId,
  key,
  minimumMs
) {
  const rateKey = `${playerId}:${key}`;
  const now = Date.now();
  const previous = store.get(rateKey) || 0;

  if (now - previous < minimumMs) {
    return true;
  }

  store.set(rateKey, now);
  return false;
}

function handleAuthoritativePlayerDeath(target) {
  if (!target || target.isDead) return;

  target.isDead = true;
  target.hp = 0;
  clearServerPlayerBurn(target);
  target.wetTime = 0;
  target.shadowHidden = false;
  target.camouflaged = false;
  target.camouflageReadyUntil = 0;
  target.focusFireCasting = false;
  target.hunterSnareSetting = false;
  target.attackTime = 0;
  target.bowDrawing = false;
  target.bowDrawAmount = 0;
  target.bowReleaseTime = 0;
  target.hurlReachTime = 0;

  focusFireDamageChains.delete(target.id);

  // Snares, clone/rain visuals, taunts, carried enemies, and enemy targeting
  // all end the instant the authoritative HP reaches zero.
  clearPlayerOwnedTransientWorldState(
    target.id,
    target.mapId
  );

  broadcastOwnerTransientCleanup(
    target.id,
    target.mapId
  );
}

function applyServerPlayerDamage(
  target,
  {
    amount,
    mapId = target.mapId,
    sourceType = "world",
    sourceId = null,
    knockbackX = 0,
    knockbackY = 0,
    contactCooldown = 0.5
  }
) {
  if (
    !target ||
    target.hp <= 0 ||
    target.mapId !== mapId
  ) {
    return 0;
  }

  const requestedDamage = Math.max(
    0,
    Math.round(Number(amount) || 0)
  );

  if (requestedDamage <= 0) {
    return 0;
  }

  const actualDamage = Math.min(
    target.hp,
    requestedDamage
  );

  target.hp = Math.max(
    0,
    target.hp - actualDamage
  );

  // Camouflage never prevents collision/contact damage. Being struck reveals
  // the player immediately on the authoritative server as well as the client.
  target.camouflaged = false;
  target.camouflageReadyUntil = 0;

  if (target.hp <= 0) {
    handleAuthoritativePlayerDeath(target);
  }

  broadcast({
    type: "playerDamage",
    targetId: target.id,
    mapId: target.mapId,
    amount: actualDamage,
    hp: target.hp,
    maxHp: target.maxHp,
    sourceType,
    sourceId,
    knockbackX,
    knockbackY,
    contactCooldown
  });

  return actualDamage;
}

function handlePlayerIgniteRequest(playerId, message) {
  const requester = players.get(playerId);
  if (!requester || requester.hp <= 0) return;

  const targetId = String(message?.targetId || playerId);
  const target = players.get(targetId);

  if (
    !target ||
    target.hp <= 0 ||
    target.mapId !== requester.mapId
  ) {
    return;
  }

  // Temporary rain-grass is client-generated, so the server cannot validate a
  // specific tuft. Keep the request bounded to nearby players on the same map.
  if (
    targetId !== playerId &&
    Math.hypot(target.x - requester.x, target.y - requester.y) > 220
  ) {
    return;
  }

  // Burning magic grass obeys the same Wet protection rule as other fire.
  // If Wet blocks the ignition, do not emit an ignition event at all.
  const ignited = applyServerPlayerBurn(target, {
    duration: STATUS_RULES.playerBurnDuration
  });

  if (!ignited) {
    return;
  }

  broadcast({
    type: "playerIgnited",
    targetId: target.id,
    mapId: target.mapId,
    burnTime: target.burnTime
  });
}

function applyServerPlayerHeal(
  target,
  {
    amount,
    mapId = target.mapId,
    sourceType = "world"
  }
) {
  if (
    !target ||
    target.hp <= 0 ||
    target.mapId !== mapId
  ) {
    return 0;
  }

  const requestedHeal = Math.max(
    0,
    Math.round(Number(amount) || 0)
  );

  if (requestedHeal <= 0) {
    return 0;
  }

  const actualHeal = Math.min(
    requestedHeal,
    target.maxHp - target.hp
  );

  if (actualHeal <= 0) {
    return 0;
  }

  target.hp += actualHeal;

  broadcast({
    type: "playerHeal",
    targetId: target.id,
    mapId: target.mapId,
    amount: actualHeal,
    hp: target.hp,
    maxHp: target.maxHp,
    sourceType
  });

  return actualHeal;
}

function broadcastEnemyHitPlayer(
  target,
  enemy,
  amount,
  nx,
  ny,
  knockbackMagnitude,
  contactCooldown
) {
  return applyServerPlayerDamage(
    target,
    {
      amount,
      mapId: enemy.mapId,
      sourceType: enemy.type,
      sourceId: enemy.id,
      knockbackX: nx * knockbackMagnitude,
      knockbackY: ny * knockbackMagnitude,
      contactCooldown
    }
  );
}

function isBowWeaponIndex(index) {
  return index === 6 || index === 7;
}

function pvpAttackRateLimited(
  attackerId,
  targetId,
  source,
  minimumMs
) {
  const key = `${attackerId}:${targetId}:${source}`;
  const now = Date.now();
  const previous = pvpAttackRateLimits.get(key) || 0;

  if (now - previous < minimumMs) {
    return true;
  }

  pvpAttackRateLimits.set(key, now);
  return false;
}

function pvpAimHitsTarget(
  attacker,
  target,
  aimAngle,
  maxDistance,
  halfArc
) {
  const dx = target.x - attacker.x;
  const dy = (target.y - 8) - (attacker.y - 8);
  const distance = Math.hypot(dx, dy);

  if (distance > maxDistance) {
    return false;
  }

  const cleanAim = Number(aimAngle);
  if (!Number.isFinite(cleanAim)) {
    return false;
  }

  const targetAngle = Math.atan2(dy, dx);

  return (
    Math.abs(
      angleDifference(
        targetAngle,
        cleanAim
      )
    ) <= halfArc
  );
}

function calculateServerPvpDamage(
  attacker,
  target,
  source,
  critical = false
) {
  const rawDamage = COMBAT_BALANCE.calculateDamage({
    source,
    weaponIndex: attacker.weaponIndex,
    playerLevel: attacker.level || 1,
    stats: attacker.stats || {},

    // Reuse the neutral physical/magic multiplier from slime while still
    // letting player level differences affect the first-pass PvP tuning.
    monsterType: "slime",
    monsterLevel: target.level || 1,
    critical
  });

  return Math.max(
    1,
    Math.round(
      rawDamage * PVP_DAMAGE_MULTIPLIER
    )
  );
}

function applyPvpCombatLock(attacker, target) {
  const until = Date.now() + PVP_COMBAT_LOCK_MS;

  attacker.pvpCombatUntil = Math.max(
    Number(attacker.pvpCombatUntil) || 0,
    until
  );

  target.pvpCombatUntil = Math.max(
    Number(target.pvpCombatUntil) || 0,
    until
  );

  broadcast({
    type: "pvpCombatLock",
    playerIds: [attacker.id, target.id],
    until
  });
}

function handlePvpToggle(
  playerId,
  socket,
  message
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  const enabled = Boolean(message.enabled);
  const now = Date.now();

  if (
    !enabled &&
    playerState.pvpEnabled &&
    now < (Number(playerState.pvpCombatUntil) || 0)
  ) {
    sendJson(socket, {
      type: "pvpToggleResult",
      ok: false,
      enabled: true,
      lockRemainingMs: Math.max(
        0,
        playerState.pvpCombatUntil - now
      )
    });
    return;
  }

  playerState.pvpEnabled = enabled;

  if (!enabled) {
    playerState.pvpCombatUntil = 0;
  }

  sendJson(socket, {
    type: "pvpToggleResult",
    ok: true,
    enabled: playerState.pvpEnabled,
    lockRemainingMs: Math.max(
      0,
      (Number(playerState.pvpCombatUntil) || 0) - now
    )
  });

  broadcast({
    type: "playerState",
    player: playerState
  });
}

function handlePvpAttack(
  attackerId,
  message
) {
  const attacker = players.get(attackerId);
  const target = players.get(
    String(message.targetId || "")
  );

  if (
    !attacker ||
    !target ||
    attacker.id === target.id ||
    attacker.hp <= 0 ||
    target.hp <= 0 ||
    attacker.mapId !== target.mapId ||
    !attacker.pvpEnabled ||
    !target.pvpEnabled ||
    target.shadowHidden
  ) {
    return;
  }

  const source = String(message.source || "");
  const payload =
    message.payload &&
    typeof message.payload === "object"
      ? message.payload
      : {};

  let minimumMs = 260;
  let knockback = 12;
  let valid = false;
  let arrowCharge = null;

  if (source === "melee") {
    // Melee weapons plus unmastered wand-type weapons use this path.
    if (![0, 1, 2, 3, 4, 5, 8].includes(attacker.weaponIndex)) {
      return;
    }

    const maxDistance =
      attacker.weaponIndex === 4 ? 36 : 32;

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      maxDistance,
      0.92
    );

    minimumMs = 260;
    knockback =
      attacker.weaponIndex === 1 ? 18 : 15;
  } else if (source === "wandMasteryMelee") {
    if (![2, 3, 8].includes(attacker.weaponIndex)) {
      return;
    }

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      46,
      0.54
    );

    minimumMs = 260;
    knockback = 15;
  } else if (source === "bowMelee") {
    if (!isBowWeaponIndex(attacker.weaponIndex)) {
      return;
    }

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      32,
      1.05
    );

    minimumMs = 300;
    knockback = 7;
  } else if (source === "arrow") {
    if (!isBowWeaponIndex(attacker.weaponIndex)) {
      return;
    }

    arrowCharge =
      arrowChargeProfileFromPayload(payload);

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      arrowCharge.maxDistance + 12,
      0.72
    );

    minimumMs = 180;
    knockback = 12;
  } else {
    // Magic/skills are deliberately not PvP-enabled in the first pass.
    return;
  }

  if (!valid) return;

  if (
    pvpAttackRateLimited(
      attacker.id,
      target.id,
      source,
      minimumMs
    )
  ) {
    return;
  }

  const critical = Boolean(payload.critical);
  const baseDamage = calculateServerPvpDamage(
    attacker,
    target,
    source,
    critical
  );

  const damage =
    source === "arrow"
      ? scaleArrowDamage(
          baseDamage,
          payload
        )
      : baseDamage;

  const aimAngle = Number(payload.aimAngle);
  const knockbackX =
    Math.cos(aimAngle) * knockback;
  const knockbackY =
    Math.sin(aimAngle) * knockback;

  const dealt = applyServerPlayerDamage(
    target,
    {
      amount: damage,
      mapId: target.mapId,
      sourceType: `pvp:${source}`,
      sourceId: attacker.id,
      knockbackX,
      knockbackY,
      contactCooldown: 0.18
    }
  );

  if (dealt > 0) {
    applyPvpCombatLock(attacker, target);
  }
}

function handlePlayerDamageRequest(
  playerId,
  message
) {
  const target = players.get(playerId);
  if (!target || target.hp <= 0) return;

  const source = String(message.source || "");
  const payload =
    message.payload &&
    typeof message.payload === "object"
      ? message.payload
      : {};

  let damage = 0;
  let knockbackX = 0;
  let knockbackY = 0;
  let contactCooldown = 0.5;
  let minimumMs = 400;

  if (source === "burn") {
    damage = 2;
    minimumMs = 450;
    contactCooldown = 0;
  } else {
    return;
  }

  if (
    rateLimitPlayerEvent(
      playerSelfDamageRateLimits,
      playerId,
      source,
      minimumMs
    )
  ) {
    return;
  }

  applyServerPlayerDamage(
    target,
    {
      amount: damage,
      sourceType: source,
      knockbackX,
      knockbackY,
      contactCooldown
    }
  );
}

function handlePlayerHealRequest(
  playerId,
  message
) {
  const target = players.get(playerId);
  if (!target || target.hp <= 0) return;

  if (
    rateLimitPlayerEvent(
      playerHealRateLimits,
      playerId,
      "rain",
      400
    )
  ) {
    return;
  }

  const power = Math.round(
    clampNumber(
      message.power,
      1,
      3,
      2
    )
  );

  applyServerPlayerHeal(
    target,
    {
      amount: power,
      sourceType: "rain"
    }
  );
}

function handlePlayerRespawn(
  playerId,
  message
) {
  const target = players.get(playerId);
  if (!target) return;

  // Only accept a respawn reset after the authoritative HP reached zero.
  if (target.hp > 0) return;

  target.hp = target.maxHp;
  target.isDead = false;
  target.mapId = "spawn";

  // Respawn is server-authoritative and always returns to the safe clearing.
  target.x = 172;
  target.y = 112;
  target.burnTime = 0;
  target.wetTime = 0;
  target.shadowHidden = false;
  target.camouflaged = false;
  target.camouflageReadyUntil = 0;
  target.focusFireCasting = false;
  target.hunterSnareSetting = false;
  target.attackTime = 0;
  target.bowDrawing = false;
  target.bowDrawAmount = 0;
  target.bowReleaseTime = 0;

  broadcast({
    type: "playerRespawn",
    player: target
  });
}

function playerContactAvailable(playerId) {
  const until =
    playerEnemyContactCooldowns.get(playerId) || 0;

  return Date.now() >= until;
}

function setPlayerContactCooldown(
  playerId,
  seconds
) {
  playerEnemyContactCooldowns.set(
    playerId,
    Date.now() + seconds * 1000
  );
}

function tickEnemyStatuses(enemy, dt) {
  ensureServerEnemyStatusState(enemy);

  if (!enemy.alive) {
    clearServerEnemyStatuses(enemy);
    return;
  }

  if (enemy.wetTime > 0) {
    enemy.wetTime = Math.max(0, enemy.wetTime - dt);
  }

  if (enemy.burnTime <= 0) {
    return;
  }

  enemy.burnTime -= dt;
  enemy.burnTickTimer -= dt;

  while (
    enemy.burnTickTimer <= 0 &&
    enemy.burnTime > 0 &&
    enemy.alive
  ) {
    const damage = 2;

    enemy.hp = Math.max(
      0,
      enemy.hp - damage
    );

    enemy.burnTickTimer +=
      enemy.burnTickInterval;

    broadcast({
      type: "enemyDamage",
      enemyType: enemy.type,
      enemyId: enemy.id,
      mapId: enemy.mapId,
      amount: damage,
      hp: enemy.hp,
      critical: false,
      source: "burn"
    });

    if (enemy.hp <= 0) {
      killSharedEnemy(
        enemy,
        enemy.lastDamagePlayerId
      );
      break;
    }
  }

  if (enemy.burnTime <= 0) {
    enemy.burnTime = 0;
    enemy.burnTickTimer = 0;
  }
}

function killSharedEnemy(
  enemy,
  killerId = null
) {
  if (!enemy.alive) return;

  enemy.hp = 0;
  enemy.alive = false;
  clearServerEnemyStatuses(enemy);
  enemy.knockbackX = 0;
  enemy.knockbackY = 0;
  clearServerEnemyHurlState(enemy);
  clearServerEnemySnareState(enemy);
  clearEnemyAggroTarget(enemy);
  enemy.confusionTime = 0;
  enemy.confusionTargetId = null;

  const profile =
    serverEnemyProfile(enemy);

  enemy.respawnTime =
    profile?.respawnSeconds ?? 30;

  if (profile?.onKilled) {
    profile.onKilled(enemy);
  }

  const pendingDrops = [];

  for (const drop of profile?.resourceDrops || []) {
    if (
      drop?.kind &&
      Math.random() < Math.max(0, Math.min(1, Number(drop.chance) || 0))
    ) {
      pendingDrops.push({
        kind: "resource",
        resourceKind: drop.kind
      });
    }
  }

  if (
    Math.random() <
    (profile?.coinDropChance || 0)
  ) {
    pendingDrops.push({ kind: "coin" });
  }

  const dropCount = pendingDrops.length;
  const dropRadius = dropCount > 1 ? 10 : 0;

  pendingDrops.forEach((drop, index) => {
    const angle =
      dropCount === 2
        ? index * Math.PI
        : -Math.PI / 2 +
          (Math.PI * 2 * index) /
            Math.max(1, dropCount);

    const dropX =
      enemy.x + Math.cos(angle) * dropRadius;

    const dropY =
      enemy.y - 2 + Math.sin(angle) * dropRadius * 0.55;

    if (drop.kind === "coin") {
      spawnSharedCoin(
        enemy.mapId,
        dropX,
        dropY
      );
      return;
    }

    spawnSharedResource(
      enemy.mapId,
      drop.resourceKind,
      dropX,
      dropY
    );
  });

  broadcast({
    type: "enemyKilled",
    enemyType: enemy.type,
    enemyId: enemy.id,
    mapId: enemy.mapId,
    killerId,
    x: enemy.x,
    y: enemy.y
  });
}

function tickSharedGhosts(dt) {
  for (const ghost of sharedGhosts) {
    if (!ghost.alive) {
      ghost.respawnTime -= dt;

      if (ghost.respawnTime <= 0) {
        resetServerGhost(ghost);
      }

      continue;
    }

    tickEnemyStatuses(ghost, dt);
    if (!ghost.alive) continue;

    ghost.tauntTime = Math.max(
      0,
      ghost.tauntTime - dt
    );
    releaseEnemyTauntOnContact(ghost);

    if (ghost.aggroTime > 0) {
      ghost.aggroTime = Math.max(
        0,
        ghost.aggroTime - dt
      );
    }

    const confused =
      tickEnemyConfusion(ghost, dt);

    let targetX = null;
    let targetY = null;
    let targetPlayer = null;

    if (confused) {
      clearEnemyAggroTarget(ghost);
    } else if (ghost.tauntTime > 0) {
      targetX = ghost.tauntX;
      targetY = ghost.tauntY;
      ghost.aggroTime = ghost.aggroDuration;
    } else {
      targetPlayer = visibleAggroPlayerById(
        ghost.aggroTargetId,
        ghost.mapId,
        ghost.x,
        ghost.y
      );

      if (targetPlayer) {
        const targetDistance = Math.hypot(
          targetPlayer.x - ghost.x,
          targetPlayer.y - ghost.y
        );

        // Staying close keeps the same target angry. Being farther away lets
        // the existing aggro timer run out instead of switching to whoever is
        // currently nearest.
        if (targetDistance <= ghost.detectionRadius) {
          ghost.aggroTime = ghost.aggroDuration;
        } else if (ghost.aggroTime <= 0) {
          ghost.aggroTargetId = null;
          targetPlayer = null;
        }
      } else if (ghost.aggroTargetId) {
        ghost.aggroTargetId = null;
      }

      // Only acquire a new proximity target when there is no valid remembered
      // target. Damage always replaces this target with the actual attacker.
      if (!targetPlayer) {
        const nearby = nearestVisiblePlayer(
          ghost.mapId,
          ghost.x,
          ghost.y,
          ghost.detectionRadius
        );

        if (nearby) {
          targetPlayer = nearby.player;
          setEnemyAggroTarget(
            ghost,
            targetPlayer.id,
            ghost.aggroDuration
          );
        }
      }

      if (targetPlayer) {
        targetX = targetPlayer.x;
        targetY = targetPlayer.y;
      }
    }

    const homeDx = ghost.homeX - ghost.x;
    const homeDy = ghost.homeY - ghost.y;

    const distanceFromHome = Math.hypot(
      homeDx,
      homeDy
    );

    let moveX = 0;
    let moveY = 0;
    let speed = ghost.speed;

    const ghostCombatActive =
      ghost.aggroTime > 0 ||
      ghost.tauntTime > 0 ||
      targetX !== null;

    const ghostActiveLeash =
      ghostCombatActive
        ? (ghost.combatLeashRadius || 280)
        : ghost.leashRadius;

    if (distanceFromHome >= ghostActiveLeash) {
      clearEnemyAggroTarget(ghost);
      targetPlayer = null;
      targetX = null;
      targetY = null;
    }

    if (confused) {
      moveX = 0;
      moveY = 0;
    } else if (
      ghost.aggroTime > 0 &&
      targetX !== null
    ) {
      const dx = targetX - ghost.x;
      const dy = targetY - ghost.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0.001) {
        moveX = dx / distance;
        moveY = dy / distance;
      }

      speed = ghost.chaseSpeed;
    } else if (
      distanceFromHome >
      ghost.leashRadius * 0.82
    ) {
      if (distanceFromHome > 0.001) {
        moveX = homeDx / distanceFromHome;
        moveY = homeDy / distanceFromHome;
      }

      speed = 14;
    } else {
      ghost.wanderTimer -= dt;

      if (ghost.wanderTimer <= 0) {
        ghost.wanderAngle +=
          (Math.random() - 0.5) * 1.8;

        ghost.wanderTimer =
          0.8 + Math.random() * 1.6;
      }

      moveX = Math.cos(ghost.wanderAngle);
      moveY =
        Math.sin(ghost.wanderAngle) * 0.65;
    }

    if (Math.abs(moveX) > 0.04) {
      ghost.dir = moveX >= 0 ? 1 : -1;
    }

    // Ghosts intentionally phase through terrain. Hunter's Snare defaults to
    // ignoring ghosts, but the generic movement modifier keeps this path
    // compatible with future floating enemies that may opt into snares.
    const snareMoveMultiplier =
      serverEnemyMovementMultiplier(ghost);
    ghost.x += moveX * speed * snareMoveMultiplier * dt;
    ghost.y += moveY * speed * snareMoveMultiplier * dt;

    ghost.x = Math.max(
      8,
      Math.min(632, ghost.x)
    );

    ghost.y = Math.max(
      24,
      Math.min(395, ghost.y)
    );

    ghost.x += ghost.knockbackX * dt;
    ghost.y += ghost.knockbackY * dt;
    ghost.knockbackX *= 0.82;
    ghost.knockbackY *= 0.82;

    const contact = confused
      ? null
      : nearestVisiblePlayer(
          ghost.mapId,
          ghost.x,
          ghost.y,
          8.5
        );

    if (
      contact &&
      playerContactAvailable(contact.player.id)
    ) {
      let dx =
        contact.player.x - ghost.x;

      let dy =
        (contact.player.y - 4) -
        (ghost.y - 7);

      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;

      const damage =
        14 + Math.floor(Math.random() * 5);

      setPlayerContactCooldown(
        contact.player.id,
        0.55
      );

      broadcastEnemyHitPlayer(
        contact.player,
        ghost,
        damage,
        dx,
        dy,
        96,
        0.55
      );
    }
  }
}

function tickSharedGoblins(dt) {
  for (const goblin of sharedGoblins) {
    if (!goblin.alive) {
      goblin.respawnTime -= dt;

      if (goblin.respawnTime <= 0) {
        resetServerGoblin(goblin);
      }

      continue;
    }

    goblin.attackCooldown = Math.max(
      0,
      goblin.attackCooldown - dt
    );

    goblin.aggroTime = Math.max(
      0,
      goblin.aggroTime - dt
    );

    goblin.tauntTime = Math.max(
      0,
      goblin.tauntTime - dt
    );
    releaseEnemyTauntOnContact(goblin);

    tickEnemyStatuses(goblin, dt);
    if (!goblin.alive) continue;

    if (tickServerEnemyHurl(goblin, dt)) {
      continue;
    }

    const confused =
      tickEnemyConfusion(goblin, dt);

    goblin.moving = false;

    if (confused) {
      goblin.lungeTime = 0;
      goblin.lungeTargetId = null;
      goblin.attackHit = false;
    } else if (goblin.lungeTime > 0) {
      goblin.lungeTime -= dt;
      goblin.moving = true;
      goblin.walkTime += dt * 1.8;

      moveServerGoblin(
        goblin,
        goblin.lungeDirX,
        goblin.lungeDirY,
        78,
        dt
      );

      const target =
        players.get(goblin.lungeTargetId);

      if (
        target &&
        target.mapId === goblin.mapId &&
        !target.shadowHidden
      ) {
        const hitDx =
          target.x - goblin.x;

        const hitDy =
          (target.y - 3) -
          (goblin.y - 5);

        const hitDistance =
          Math.hypot(hitDx, hitDy);

        if (
          !goblin.attackHit &&
          hitDistance < 9.5
        ) {
          goblin.attackHit = true;

          if (
            playerContactAvailable(target.id)
          ) {
            const damage =
              9 + Math.floor(Math.random() * 5);

            const length =
              Math.hypot(hitDx, hitDy) || 1;

            setPlayerContactCooldown(
              target.id,
              0.50
            );

            broadcastEnemyHitPlayer(
              target,
              goblin,
              damage,
              hitDx / length,
              hitDy / length,
              90,
              0.50
            );
          }
        }
      } else if (target?.shadowHidden) {
        goblin.lungeTime = 0;
        goblin.attackHit = false;
        goblin.attackCooldown = Math.max(
          goblin.attackCooldown,
          0.25
        );
      }

      if (goblin.lungeTime <= 0) {
        goblin.lungeTime = 0;
        goblin.attackCooldown =
          0.85 + Math.random() * 0.25;
        goblin.lungeTargetId = null;
      }
    } else {
      let targetX = null;
      let targetY = null;
      let targetPlayer = null;

      if (goblin.tauntTime > 0) {
        targetX = goblin.tauntX;
        targetY = goblin.tauntY;
        goblin.aggroTime = goblin.aggroDuration;
      } else {
        targetPlayer = visibleAggroPlayerById(
          goblin.aggroTargetId,
          goblin.mapId,
          goblin.x,
          goblin.y
        );

        if (targetPlayer) {
          const targetDistance = Math.hypot(
            targetPlayer.x - goblin.x,
            targetPlayer.y - goblin.y
          );

          if (targetDistance <= goblin.detectionRadius) {
            goblin.aggroTime = goblin.aggroDuration;
          } else if (goblin.aggroTime <= 0) {
            goblin.aggroTargetId = null;
            targetPlayer = null;
          }
        } else if (goblin.aggroTargetId) {
          goblin.aggroTargetId = null;
        }

        if (!targetPlayer) {
          const nearby = nearestVisiblePlayer(
            goblin.mapId,
            goblin.x,
            goblin.y,
            goblin.detectionRadius
          );

          if (nearby) {
            targetPlayer = nearby.player;
            setEnemyAggroTarget(
              goblin,
              targetPlayer.id,
              goblin.aggroDuration
            );
          }
        }

        if (targetPlayer) {
          targetX = targetPlayer.x;
          targetY = targetPlayer.y - 3;
        }
      }

      const distanceFromHome = Math.hypot(
        goblin.x - goblin.homeX,
        goblin.y - goblin.homeY
      );

      let targetDistance = Infinity;
      let targetDx = 0;
      let targetDy = 0;

      if (targetX !== null) {
        targetDx = targetX - goblin.x;
        targetDy =
          targetY - (goblin.y - 5);

        targetDistance = Math.hypot(
          targetDx,
          targetDy
        );
      }

      const pursuing =
        goblin.aggroTime > 0 &&
        distanceFromHome < (goblin.combatLeashRadius || 260) &&
        targetDistance > 1;

      if (
        pursuing &&
        targetPlayer &&
        targetDistance <= 20 &&
        goblin.attackCooldown <= 0
      ) {
        const length = targetDistance || 1;

        goblin.lungeDirX =
          targetDx / length;

        goblin.lungeDirY =
          targetDy / length;

        goblin.dir =
          goblin.lungeDirX >= 0 ? 1 : -1;

        goblin.lungeTime =
          goblin.lungeDuration;

        goblin.lungeTargetId =
          targetPlayer.id;

        goblin.attackHit = false;
      } else if (pursuing) {
        const moveX =
          targetDx / targetDistance;

        const moveY =
          targetDy / targetDistance;

        moveServerGoblin(
          goblin,
          moveX,
          moveY,
          goblin.chaseSpeed,
          dt
        );

        goblin.moving = true;
        goblin.walkTime += dt;

        if (Math.abs(moveX) > 0.05) {
          goblin.dir =
            moveX >= 0 ? 1 : -1;
        }
      } else {
        if (
          goblin.aggroTime > 0 &&
          distanceFromHome >= (goblin.combatLeashRadius || 260)
        ) {
          clearEnemyAggroTarget(goblin);
          targetPlayer = null;
        }

        if (
          goblin.aggroTime <= 0 &&
          distanceFromHome >= goblin.leashRadius
        ) {
          goblin.wanderTargetX = goblin.homeX;
          goblin.wanderTargetY = goblin.homeY;
          goblin.wanderDecisionTime = 0.45;
        }

        if (goblin.pauseTime > 0) {
          goblin.pauseTime = Math.max(
            0,
            goblin.pauseTime - dt
          );
        } else {
          goblin.wanderDecisionTime -= dt;

          let dx =
            goblin.wanderTargetX - goblin.x;

          let dy =
            goblin.wanderTargetY - goblin.y;

          let distance = Math.hypot(dx, dy);

          if (
            distance < 2 ||
            goblin.wanderDecisionTime <= 0
          ) {
            if (
              distance < 2 &&
              Math.random() < 0.42
            ) {
              goblin.pauseTime =
                0.18 + Math.random() * 0.35;
            }

            chooseServerGoblinWanderTarget(
              goblin
            );

            dx =
              goblin.wanderTargetX - goblin.x;

            dy =
              goblin.wanderTargetY - goblin.y;

            distance = Math.hypot(dx, dy);
          }

          if (distance > 0.001) {
            const moveX = dx / distance;
            const moveY = dy / distance;

            moveServerGoblin(
              goblin,
              moveX,
              moveY,
              goblin.speed,
              dt
            );

            goblin.moving = true;
            goblin.walkTime += dt;

            if (Math.abs(moveX) > 0.05) {
              goblin.dir =
                moveX >= 0 ? 1 : -1;
            }
          }
        }
      }
    }

    const knockNextX =
      goblin.x + goblin.knockbackX * dt;

    const knockNextY =
      goblin.y + goblin.knockbackY * dt;

    if (
      goblinPositionAllowed(
        goblin,
        knockNextX,
        goblin.y
      )
    ) {
      goblin.x = knockNextX;
    }

    if (
      goblinPositionAllowed(
        goblin,
        goblin.x,
        knockNextY
      )
    ) {
      goblin.y = knockNextY;
    }

    goblin.knockbackX *= 0.82;
    goblin.knockbackY *= 0.82;
  }
}

function sharedEnemyActionRateLimited(
  playerId,
  enemyId,
  action,
  minimumMs
) {
  const key =
    `${playerId}:${enemyId}:${action}`;

  const now = Date.now();

  const previous =
    sharedEnemyActionRateLimits.get(key) || 0;

  if (now - previous < minimumMs) {
    return true;
  }

  sharedEnemyActionRateLimits.set(key, now);
  return false;
}

function validateSharedEnemyMeleeHit(
  playerState,
  enemy,
  payload
) {
  if (![0, 1, 2, 3, 4, 8].includes(playerState.weaponIndex)) {
    return false;
  }

  const reach =
    playerState.weaponIndex === 4 ? 27 : 22;

  const profile = serverEnemyProfile(enemy);
  const targetOffsetY = profile?.bodyOffsetY ?? -11;
  const bodyRadius = profile?.meleeBodyRadius ?? 7;

  const dx =
    enemy.x - playerState.x;

  const dy =
    (enemy.y + targetOffsetY) -
    (playerState.y - 8);

  const distance = Math.hypot(dx, dy);

  if (distance > reach + bodyRadius) {
    return false;
  }

  const aimAngle = Number(payload.aimAngle);
  if (!Number.isFinite(aimAngle)) {
    return false;
  }

  const targetAngle = Math.atan2(dy, dx);

  return (
    Math.abs(
      angleDifference(
        targetAngle,
        aimAngle
      )
    ) <= 0.90
  );
}

function validateSharedEnemyWandMasteryHit(
  playerState,
  enemy,
  payload
) {
  if (![2, 3, 8].includes(playerState.weaponIndex)) {
    return false;
  }

  const profile = serverEnemyProfile(enemy);
  const targetOffsetY = profile?.bodyOffsetY ?? -11;
  const bodyRadius = profile?.meleeBodyRadius ?? 7;
  const dx = enemy.x - playerState.x;
  const dy =
    (enemy.y + targetOffsetY) -
    (playerState.y - 8);
  const distance = Math.hypot(dx, dy);

  if (distance > 38 + bodyRadius) {
    return false;
  }

  const aimAngle = Number(payload.aimAngle);
  if (!Number.isFinite(aimAngle)) {
    return false;
  }

  const targetAngle = Math.atan2(dy, dx);
  return Math.abs(angleDifference(targetAngle, aimAngle)) <= 0.54;
}

function validateSharedEnemyBowMeleeHit(
  playerState,
  enemy,
  payload
) {
  if (!isBowWeaponIndex(playerState.weaponIndex)) {
    return false;
  }

  const profile = serverEnemyProfile(enemy);
  const targetOffsetY = profile?.bodyOffsetY ?? -11;
  const bodyRadius = profile?.meleeBodyRadius ?? 7;

  const dx =
    enemy.x - playerState.x;
  const dy =
    (enemy.y + targetOffsetY) -
    (playerState.y - 8);
  const distance = Math.hypot(dx, dy);

  if (distance > 24 + bodyRadius) {
    return false;
  }

  const aimAngle = Number(payload.aimAngle);
  if (!Number.isFinite(aimAngle)) {
    return false;
  }

  const targetAngle = Math.atan2(dy, dx);

  return (
    Math.abs(
      angleDifference(
        targetAngle,
        aimAngle
      )
    ) <= 1.05
  );
}

function calculateServerPlayerDamage(
  playerState,
  enemy,
  source,
  critical = false,
  options = {}
) {
  return COMBAT_BALANCE.calculateDamage({
    source,
    weaponIndex:
      playerState.weaponIndex,
    playerLevel:
      playerState.level || 1,
    stats:
      playerState.stats || {},
    monsterType:
      enemy.type,
    monsterLevel:
      enemy.level || 1,
    critical,
    rainPower:
      options.rainPower ?? 2
  });
}

function arrowChargeProfileFromPayload(payload = {}) {
  // Bow charge is now binary: the client only sends an arrow after the full
  // one-second draw. Every fired arrow uses standard bow damage and range.
  return {
    drawAmount: 1,
    damageMultiplier: 1,
    rangeMultiplier: 1,
    maxDistance: 320
  };
}

function scaleArrowDamage(
  baseDamage,
  payload
) {
  return Math.max(
    1,
    Math.round(baseDamage)
  );
}

// Eleven uninterrupted Focus Fire hits total exactly 8.0 normal-arrow units.
// A perfect regular bow fits four shots into the same five-second barrage
// window, so a full Focus Fire channel is ~2x perfect regular-bow damage.
// The final three arrows all land at 135%, but the climb into them is now
// flatter so the barrage feels rewarding throughout instead of spiking only
// at the very end.
const FOCUS_FIRE_DAMAGE_CURVE = Object.freeze([
  0.30, 0.34, 0.38, 0.42, 0.46,
  0.55, 0.65, 0.85, 1.35, 1.35, 1.35
]);
const FOCUS_FIRE_CHAIN_WINDOW_MS = 1300;
const focusFireDamageChains = new Map();

function focusFireDamageMultiplier(
  playerId,
  enemy,
  payload = {}
) {
  if (!payload.focusFire) {
    focusFireDamageChains.delete(playerId);
    return 1;
  }

  const sequence = clampInteger(
    payload.focusFireShotSequence,
    1,
    32,
    1
  );

  const now = Date.now();
  const previous = focusFireDamageChains.get(playerId);
  const consecutive = Boolean(
    previous &&
    previous.enemyId === enemy.id &&
    sequence === previous.sequence + 1 &&
    now - previous.hitAt <= FOCUS_FIRE_CHAIN_WINDOW_MS
  );

  const count = consecutive
    ? previous.count + 1
    : 1;

  focusFireDamageChains.set(playerId, {
    enemyId: enemy.id,
    sequence,
    count,
    hitAt: now
  });

  const curveIndex = Math.max(
    0,
    Math.min(FOCUS_FIRE_DAMAGE_CURVE.length - 1, count - 1)
  );

  return FOCUS_FIRE_DAMAGE_CURVE[curveIndex];
}

function handleSharedEnemyDamageAction(
  playerId,
  enemy,
  payload
) {
  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.mapId !== enemy.mapId ||
    !enemy.alive ||
    enemy.carriedBy
  ) {
    return;
  }

  const source =
    String(payload.source || "");

  let damage = 0;
  let critical = false;
  let knockback = 0;
  let minimumMs = 180;

  // The prepared Camo opener is validated against server-held state. A client
  // cannot manufacture repeat criticals just by setting camouflageOpening.
  const camouflageCritical =
    camouflageOpeningIsValid(
      playerState,
      payload
    );

  if (source !== "arrow") {
    focusFireDamageChains.delete(playerId);
  }

  if (source === "melee") {
    if (
      !validateSharedEnemyMeleeHit(
        playerState,
        enemy,
        payload
      )
    ) {
      return;
    }

    minimumMs = 260;

    critical =
      Boolean(payload.critical) ||
      camouflageCritical;

    damage =
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "melee",
        critical
      );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.melee ?? 22;
  } else if (source === "wandMasteryMelee") {
    if (
      !validateSharedEnemyWandMasteryHit(
        playerState,
        enemy,
        payload
      )
    ) {
      return;
    }

    minimumMs = 260;
    critical = Boolean(payload.critical) || camouflageCritical;
    damage = calculateServerPlayerDamage(
      playerState,
      enemy,
      "melee",
      critical
    );
    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.melee ?? 22;
  } else if (source === "bowMelee") {
    if (
      !validateSharedEnemyBowMeleeHit(
        playerState,
        enemy,
        payload
      )
    ) {
      return;
    }

    minimumMs = 300;
    critical =
      Boolean(payload.critical) ||
      camouflageCritical;

    damage =
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "bowMelee",
        critical
      );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.bowMelee ?? 10;
  } else if (source === "basic") {
    if (
      ![2, 3, 8].includes(playerState.weaponIndex) ||
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 190
    ) {
      return;
    }

    critical = camouflageCritical;

    damage =
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "basic",
        critical
      );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.basic ?? 14;
  } else if (source === "arrow") {
    const arrowCharge =
      arrowChargeProfileFromPayload(payload);

    if (
      !isBowWeaponIndex(playerState.weaponIndex) ||
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > arrowCharge.maxDistance + 12
    ) {
      return;
    }

    critical = camouflageCritical;

    const focusMultiplier =
      focusFireDamageMultiplier(
        playerId,
        enemy,
        payload
      );

    damage = Math.max(
      1,
      Math.round(
        scaleArrowDamage(
          calculateServerPlayerDamage(
            playerState,
            enemy,
            "arrow",
            critical
          ),
          payload
        ) * focusMultiplier
      )
    );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.arrow ?? 16;
  } else if (source === "fireball") {
    if (
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 260
    ) {
      return;
    }

    critical = camouflageCritical;

    damage =
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "fireball",
        critical
      );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.fireball ?? 18;
  } else {
    return;
  }

  if (
    sharedEnemyActionRateLimited(
      playerId,
      enemy.id,
      `damage:${source}`,
      minimumMs
    )
  ) {
    return;
  }

  enemy.hp = Math.max(
    0,
    enemy.hp - damage
  );

  const camouflageConfused =
    tryApplyCamouflageConfusion(
      enemy,
      playerState,
      playerId,
      payload
    );

  if (!camouflageConfused) {
    setEnemyAggroTarget(
      enemy,
      playerId,
      enemy.aggroDuration
    );
  }
  enemy.lastDamagePlayerId = playerId;

  if (source === "fireball") {
    applyServerEnemyBurn(enemy, {
      duration: STATUS_RULES.enemyBurnDuration,
      sourcePlayerId: playerId
    });
  }

  let pushAngle = Number(payload.aimAngle);

  if (!Number.isFinite(pushAngle)) {
    pushAngle = Math.atan2(
      enemy.y - playerState.y,
      enemy.x - playerState.x
    );
  }

  const damageFraction =
    damage / Math.max(1, Number(enemy.maxHp) || damage);

  if (damageFraction >= ENEMY_KNOCKBACK_DAMAGE_THRESHOLD) {
    enemy.knockbackX =
      Math.cos(pushAngle) * knockback;

    enemy.knockbackY =
      Math.sin(pushAngle) * knockback;
  }

  broadcast({
    type: "enemyDamage",
    enemyType: enemy.type,
    enemyId: enemy.id,
    mapId: enemy.mapId,
    amount: damage,
    hp: enemy.hp,
    critical,
    source,
    attackerId: playerId
  });

  if (enemy.hp <= 0) {
    killSharedEnemy(enemy, playerId);
  }
}

function handleSharedEnemyAction(
  playerId,
  message
) {
  const enemy = getWorldEntity(
    message.enemyId,
    message.enemyType
  );

  if (!enemy) {
    return;
  }

  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) return;

  const action = String(message.action || "");

  const payload =
    message.payload &&
    typeof message.payload === "object"
      ? message.payload
      : {};

  if (action === "damage") {
    handleSharedEnemyDamageAction(
      playerId,
      enemy,
      payload
    );
    return;
  }

  if (
    action === "hurlGrab" ||
    action === "hurlThrow"
  ) {
    handleGenericEnemyHurlAction(
      playerId,
      enemy,
      action,
      payload
    );
    return;
  }

  if (
    playerState.mapId !== enemy.mapId
  ) {
    return;
  }

  if (enemy.carriedBy) {
    return;
  }

  if (
    sharedEnemyActionRateLimited(
      playerId,
      enemy.id,
      action,
      action === "rainDamage"
        ? 400
        : action === "magicGrassSlow" || action === "wet"
          ? 150
          : 250
    )
  ) {
    return;
  }

  if (action === "magicGrassSlow") {
    if (!enemy.alive) return;

    ensureServerEnemySnareState(enemy);
    enemy.magicGrassSlowTime = Math.max(
      enemy.magicGrassSlowTime,
      clampNumber(payload.duration, 0.15, 0.75, 0.50)
    );
    return;
  }

  if (action === "wet") {
    if (!enemy.alive) return;
    if (serverEnemyProfile(enemy)?.rainEffect === "damage") return;

    applyServerEnemyWet(
      enemy,
      clampNumber(payload.duration, 0.25, 8, STATUS_RULES.enemyWetDuration)
    );
    return;
  }

  if (action === "ignite") {
    if (!enemy.alive) return;

    // This action is reserved for direct contact with client-temporary magic
    // grass. Wet now blocks it the same way it blocks other fire sources.
    applyServerEnemyBurn(enemy, {
      duration: STATUS_RULES.enemyBurnDuration,
      sourcePlayerId: playerId
    });
    return;
  }

  if (action === "extinguish") {
    clearServerEnemyBurn(enemy);
    return;
  }

  if (action === "clearTaunt") {
    const cloneId =
      typeof payload.cloneId === "string"
        ? payload.cloneId.slice(0, 96)
        : null;

    if (
      enemy.tauntOwnerId === playerId &&
      (
        !cloneId ||
        !enemy.tauntCloneId ||
        enemy.tauntCloneId === cloneId
      )
    ) {
      if (cloneId) {
        enemy.releasedHallucinationId = cloneId;
      } else if (enemy.tauntCloneId) {
        enemy.releasedHallucinationId = enemy.tauntCloneId;
      }

      enemy.tauntTime = 0;
      enemy.tauntOwnerId = null;
      enemy.tauntCloneId = null;
    }
    return;
  }

  if (action === "taunt") {
    if (!enemy.alive || enemy.hurlTime > 0) return;

    const cloneId =
      typeof payload.cloneId === "string"
        ? payload.cloneId.slice(0, 96)
        : null;

    // Once an enemy reaches a specific Hallucination, later pulse messages
    // from that same clone can never force it back again.
    if (
      cloneId &&
      enemy.releasedHallucinationId === cloneId
    ) {
      return;
    }

    const tauntX = clampNumber(
      payload.x,
      0,
      640,
      enemy.x
    );

    const tauntY = clampNumber(
      payload.y,
      0,
      400,
      enemy.y
    );

    if (
      Math.hypot(
        enemy.x - tauntX,
        enemy.y - tauntY
      ) > 126
    ) {
      return;
    }

    const duration = clampNumber(
      payload.duration,
      0.5,
      6.0,
      4.8
    );

    enemy.tauntX = tauntX;
    enemy.tauntY = tauntY;
    enemy.tauntTime = duration;
    enemy.tauntOwnerId = playerId;
    enemy.tauntCloneId = cloneId;
    enemy.aggroTime = Math.max(
      enemy.aggroTime,
      duration
    );
    return;
  }

  const rainEffect =
    serverEnemyProfile(enemy)?.rainEffect;

  if (
    action === "rainDamage" &&
    rainEffect === "damage"
  ) {
    if (!enemy.alive) return;

    const rainPower = Math.round(
      clampNumber(payload.power, 1, 3, 2)
    );

    const damage =
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "rain",
        false,
        { rainPower }
      );

    enemy.hp = Math.max(
      0,
      enemy.hp - damage
    );

    clearServerEnemyBurn(enemy);

    setEnemyAggroTarget(
      enemy,
      playerId,
      enemy.aggroDuration
    );
    enemy.lastDamagePlayerId = playerId;

    broadcast({
      type: "enemyDamage",
      enemyType: enemy.type,
      enemyId: enemy.id,
      mapId: enemy.mapId,
      amount: damage,
      hp: enemy.hp,
      critical: false,
      source: "rain",
      attackerId: playerId
    });

    if (enemy.hp <= 0) {
      killSharedEnemy(enemy, playerId);
    }
  }

}

// -----------------------------------------------------------------------------
// SHARED SLIME WORLD
// -----------------------------------------------------------------------------
const MEADOW_POND = {
  x: 300,
  y: 258,
  width: 120,
  height: 58
};

function bigGoldSlimePositionAllowed(slime, x, y) {
  // Gold Slime Den now has true map dimensions instead of an inset invisible
  // leash. The elite can pursue anywhere the player can actually stand.
  return mapPointAllowed(slime.mapId, x, y, 10);
}

function moveServerBigGoldSlime(
  slime,
  moveX,
  moveY,
  speed,
  dt
) {
  const movementMultiplier =
    serverEnemyMovementMultiplier(slime);
  const nextX = slime.x + moveX * speed * movementMultiplier * dt;
  const nextY = slime.y + moveY * speed * movementMultiplier * dt;

  if (
    bigGoldSlimePositionAllowed(
      slime,
      nextX,
      slime.y
    )
  ) {
    slime.x = nextX;
  }

  if (
    bigGoldSlimePositionAllowed(
      slime,
      slime.x,
      nextY
    )
  ) {
    slime.y = nextY;
  }
}

function resetServerBigGoldSlime(slime) {
  slime.x = slime.homeX;
  slime.y = slime.homeY;
  slime.dir = 1;
  slime.hp = slime.maxHp;
  slime.alive = true;
  slime.respawnTime = 0;
  slime.aggroTime = 0;
  slime.aggroTargetId = null;
  slime.confusionTime = 0;
  slime.confusionTargetId = null;
  slime.outOfCombatTime = 0;
  slime.wanderAngle =
    Math.random() * Math.PI * 2;
  slime.wanderTimer =
    0.9 + Math.random() * 1.4;
  slime.burnTime = 0;
  slime.burnTickTimer = 0;
  slime.knockbackX = 0;
  slime.knockbackY = 0;
  slime.tauntTime = 0;
  slime.tauntOwnerId = null;
  clearServerEnemyHurlState(slime);
  slime.lastDamagePlayerId = null;
}

function releaseEnemyTauntOnContact(enemy, radius = 8.5) {
  if (!enemy || enemy.tauntTime <= 0) return false;

  if (
    Math.hypot(
      enemy.x - enemy.tauntX,
      enemy.y - enemy.tauntY
    ) > radius
  ) {
    return false;
  }

  if (enemy.tauntCloneId) {
    enemy.releasedHallucinationId = enemy.tauntCloneId;
  }

  enemy.tauntTime = 0;
  enemy.tauntOwnerId = null;
  enemy.tauntCloneId = null;
  return true;
}

function tickSharedBigGoldSlimes(dt) {
  for (const slime of sharedBigGoldSlimes) {
    if (!slime.alive) {
      slime.respawnTime -= dt;

      if (slime.respawnTime <= 0) {
        resetServerBigGoldSlime(slime);
      }

      continue;
    }

    tickEnemyStatuses(slime, dt);
    if (!slime.alive) continue;

    slime.tauntTime = Math.max(
      0,
      slime.tauntTime - dt
    );
    releaseEnemyTauntOnContact(slime);

    if (slime.aggroTime > 0) {
      slime.aggroTime = Math.max(
        0,
        slime.aggroTime - dt
      );
    }

    const confused =
      tickEnemyConfusion(slime, dt);

    let targetX = null;
    let targetY = null;
    let targetPlayer = null;

    if (confused) {
      clearEnemyAggroTarget(slime);
    } else if (slime.tauntTime > 0) {
      targetX = slime.tauntX;
      targetY = slime.tauntY;
      slime.aggroTime = slime.aggroDuration;
    } else {
      targetPlayer = visibleAggroPlayerById(
        slime.aggroTargetId,
        slime.mapId,
        slime.x,
        slime.y
      );

      if (!targetPlayer && slime.aggroTargetId) {
        clearEnemyAggroTarget(slime);
      }

      // This elite is aggressive on sight, but Camouflage still suppresses
      // acquisition unless the hunter gets very close.
      if (!targetPlayer) {
        const nearby = nearestVisiblePlayer(
          slime.mapId,
          slime.x,
          slime.y,
          slime.detectionRadius
        );

        if (nearby) {
          targetPlayer = nearby.player;
          setEnemyAggroTarget(
            slime,
            targetPlayer.id,
            slime.aggroDuration
          );
        }
      }

      if (targetPlayer) {
        targetX = targetPlayer.x;
        targetY = targetPlayer.y;
      }
    }

    const homeDx = slime.homeX - slime.x;
    const homeDy = slime.homeY - slime.y;
    const distanceFromHome =
      Math.hypot(homeDx, homeDy);

    const combatActive =
      slime.aggroTime > 0 ||
      slime.tauntTime > 0 ||
      targetX !== null;

    const activeLeash = combatActive
      ? slime.combatLeashRadius
      : slime.patrolLeashRadius;

    if (distanceFromHome >= activeLeash) {
      clearEnemyAggroTarget(slime);
      targetPlayer = null;
      targetX = null;
      targetY = null;
    }

    const stillInCombat =
      slime.aggroTime > 0 ||
      slime.tauntTime > 0 ||
      slime.confusionTime > 0 ||
      targetX !== null;

    if (stillInCombat) {
      slime.outOfCombatTime = 0;
    } else {
      slime.outOfCombatTime =
        (Number(slime.outOfCombatTime) || 0) + dt;

      // Elite reset: once the hunt has truly ended, restore the encounter so
      // the player cannot slowly chip it down across repeated disengages.
      if (
        slime.outOfCombatTime >= 4.0 &&
        slime.hp < slime.maxHp
      ) {
        slime.hp = slime.maxHp;
        slime.burnTime = 0;
        slime.burnTickTimer = 0;
        slime.lastDamagePlayerId = null;
        slime.outOfCombatTime = 0;
      }
    }

    if (
      Math.abs(slime.knockbackX) > 0.1 ||
      Math.abs(slime.knockbackY) > 0.1
    ) {
      moveServerBigGoldSlime(
        slime,
        slime.knockbackX,
        slime.knockbackY,
        1,
        dt
      );
      slime.knockbackX *= 0.80;
      slime.knockbackY *= 0.80;
    }

    let moveX = 0;
    let moveY = 0;
    let speed = slime.speed;

    if (confused) {
      moveX = 0;
      moveY = 0;
    } else if (
      targetX !== null &&
      targetY !== null &&
      distanceFromHome < slime.combatLeashRadius
    ) {
      const dx = targetX - slime.x;
      const dy = targetY - slime.y;
      const length = Math.hypot(dx, dy) || 1;
      moveX = dx / length;
      moveY = dy / length;
      const enraged =
        slime.hp <= slime.maxHp * 0.5;

      speed = enraged
        ? slime.chaseSpeed * 1.5
        : slime.chaseSpeed;
    } else if (
      distanceFromHome >
      slime.patrolLeashRadius * 0.78
    ) {
      const length = distanceFromHome || 1;
      moveX = homeDx / length;
      moveY = homeDy / length;
      speed = slime.speed;
    } else {
      slime.wanderTimer -= dt;

      if (slime.wanderTimer <= 0) {
        slime.wanderAngle +=
          (Math.random() - 0.5) * 1.5;
        slime.wanderTimer =
          0.9 + Math.random() * 1.5;
      }

      moveX = Math.cos(slime.wanderAngle);
      moveY = Math.sin(slime.wanderAngle) * 0.65;
    }

    if (Math.abs(moveX) > 0.04) {
      slime.dir = moveX >= 0 ? 1 : -1;
    }

    moveServerBigGoldSlime(
      slime,
      moveX,
      moveY,
      speed,
      dt
    );

    if (confused) continue;

    const contact = nearestVisiblePlayer(
      slime.mapId,
      slime.x,
      slime.y,
      13
    );

    if (
      contact &&
      playerContactAvailable(contact.player.id)
    ) {
      let dx = contact.player.x - slime.x;
      let dy =
        (contact.player.y - 4) -
        (slime.y - 8);
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;

      // Lethal to a fresh LV1 / 50 HP player, but survivable later if the
      // player has earned a larger health pool.
      const damage = 50;

      setPlayerContactCooldown(
        contact.player.id,
        0.62
      );

      broadcastEnemyHitPlayer(
        contact.player,
        slime,
        damage,
        dx,
        dy,
        108,
        0.62
      );
    }
  }
}

function makeServerSlime(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    wanderRadiusX = 26,
    wanderRadiusY = 18,
    level = 1,
    variant = "green",
    aggressiveOnSight = false,
    spawnOnlyWhileBigGoldDead = false
  } = spawn;

  // Conditional respawning should not suppress the initial map population.
  // Baby gold slimes begin alive; only later respawns pause while the boss is alive.
  const startsDormant = false;

  // Gold babies are den predators: unlike ordinary slimes they acquire nearby
  // living players without waiting to be struck first.
  const aggressiveByDefault =
    Boolean(aggressiveOnSight) ||
    variant === "goldBaby";

  const maxHp =
    variant === "purple"
      ? 80
      : variant === "blue"
        ? 56
        : variant === "goldBaby"
          ? 64
          : 40;

  return {
    id,
    mapId,
    type: "slime",
    level,
    variant,
    aggressiveOnSight: aggressiveByDefault,
    spawnOnlyWhileBigGoldDead: Boolean(spawnOnlyWhileBigGoldDead),

    x,
    y,
    homeX: x,
    homeY: y,

    dir: 1,
    phase,

    speed: variant === "goldBaby" ? 21 : 16,
    chaseSpeed: variant === "goldBaby" ? 30 : 22,
    patrolLeashRadius: 90,
    combatLeashRadius: 240,

    aggroTime: 0,
    aggroDuration: 4.5,
    aggroTargetId: null,
    confusionTime: 0,
    confusionTargetId: null,

    // Hallucination decoy. While active, the clone position has priority over
    // real players.
    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0,
    wanderRadiusX,
    wanderRadiusY,

    maxHp,
    hp: startsDormant ? 0 : maxHp,
    alive: !startsDormant,
    respawnTime: 0,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    // STR ability: Hurl.
    carriedBy: null,
    pickupTime: 0,
    pickupDuration: 0.18,
    pickupDirX: 0,
    pickupDirY: 0,
    hurlTime: 0,
    hurlDuration: 0.58,
    hurlVelocityX: 0,
    hurlVelocityY: 0,
    hurlThrownBy: null,

    lastDamagePlayerId: null
  };
}

function getWorldEntity(
  entityId,
  expectedType = null
) {
  const entity =
    worldEntitiesById.get(entityId) || null;

  if (
    entity &&
    expectedType &&
    entity.type !== expectedType
  ) {
    return null;
  }

  return entity;
}




function pointInsideRect(
  x,
  y,
  rect,
  padding = 0
) {
  return (
    x > rect.x - padding &&
    x < rect.x + rect.width + padding &&
    y > rect.y - padding &&
    y < rect.y + rect.height + padding
  );
}

function mapPointAllowed(
  mapId,
  x,
  y,
  padding = 0
) {
  const dimensions =
    mapWorldDimensions(mapId);

  if (
    x < 10 ||
    x > dimensions.width - 10 ||
    y < 18 ||
    y > dimensions.height - 8
  ) {
    return false;
  }

  const definition =
    WORLD_CONTENT.maps[mapId] || {};

  const waterRects =
    definition.collision?.waterRects || [];

  for (const rect of waterRects) {
    if (
      pointInsideRect(
        x,
        y,
        rect,
        padding
      )
    ) {
      return false;
    }
  }

  return true;
}

function slimePositionAllowed(
  slime,
  x,
  y
) {
  return mapPointAllowed(
    slime.mapId,
    x,
    y,
    6
  );
}

function moveServerSlime(slime, moveX, moveY, speed, dt) {
  const movementMultiplier =
    serverEnemyMovementMultiplier(slime);
  const nextX = slime.x + moveX * speed * movementMultiplier * dt;
  const nextY = slime.y + moveY * speed * movementMultiplier * dt;

  if (slimePositionAllowed(slime, nextX, slime.y)) {
    slime.x = nextX;
  }

  if (slimePositionAllowed(slime, slime.x, nextY)) {
    slime.y = nextY;
  }
}

function chooseServerSlimeWanderTarget(slime) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radiusX = 5 + Math.random() * slime.wanderRadiusX;
    const radiusY = 4 + Math.random() * slime.wanderRadiusY;

    const x = Math.max(
      12,
      Math.min(628, slime.homeX + Math.cos(angle) * radiusX)
    );

    const y = Math.max(
      18,
      Math.min(392, slime.homeY + Math.sin(angle) * radiusY)
    );

    if (!slimePositionAllowed(slime, x, y)) continue;

    slime.wanderTargetX = x;
    slime.wanderTargetY = y;
    slime.wanderDecisionTime = 0.8 + Math.random();
    return;
  }

  slime.wanderTargetX = slime.homeX;
  slime.wanderTargetY = slime.homeY;
  slime.wanderDecisionTime = 0.8;
}

function nearestPlayerForSlime(slime) {
  let best = null;
  let bestDistance = Infinity;

  for (const playerState of players.values()) {
    if (
      playerState.mapId !== slime.mapId ||
      playerState.shadowHidden ||
      playerState.hp <= 0
    ) {
      continue;
    }

    const distance = Math.hypot(
      playerState.x - slime.x,
      playerState.y - slime.y
    );

    if (playerState.camouflaged) {
      if (distance > CAMOUFLAGE_CLOSE_REVEAL_DISTANCE) {
        continue;
      }

      playerState.camouflaged = false;
      playerState.camouflageReadyUntil = 0;
    }

    if (distance < bestDistance) {
      best = playerState;
      bestDistance = distance;
    }
  }

  return best
    ? { player: best, distance: bestDistance }
    : null;
}

function resetServerSlime(slime) {
  slime.x = slime.homeX;
  slime.y = slime.homeY;
  slime.dir = 1;

  slime.wanderTargetX = slime.homeX;
  slime.wanderTargetY = slime.homeY;
  slime.wanderDecisionTime = 0;
  slime.pauseTime = 0;

  slime.aggroTime = 0;
  slime.aggroTargetId = null;
  slime.confusionTime = 0;
  slime.confusionTargetId = null;

  slime.tauntTime = 0;
  slime.tauntX = slime.homeX;
  slime.tauntY = slime.homeY;
  slime.tauntOwnerId = null;

  slime.hp = slime.maxHp;
  slime.alive = true;
  slime.respawnTime = 0;

  slime.burnTime = 0;
  slime.burnTickTimer = 0;

  slime.knockbackX = 0;
  slime.knockbackY = 0;
  clearEnemyAggroTarget(slime);

  clearServerEnemyHurlState(slime);

  slime.lastDamagePlayerId = null;
}



function broadcastHurlEnemyDamage(
  enemy,
  amount,
  attackerId,
  source = "hurl",
  velocityX = 0,
  velocityY = 0
) {
  if (!enemy?.alive || amount <= 0) return;

  enemy.hp = Math.max(0, enemy.hp - amount);
  enemy.lastDamagePlayerId = attackerId;

  setEnemyAggroTarget(
    enemy,
    attackerId,
    enemy.aggroDuration
  );

  const speed = Math.hypot(velocityX, velocityY) || 1;
  if (Math.abs(velocityX) + Math.abs(velocityY) > 0.01) {
    enemy.knockbackX = velocityX / speed * 58;
    enemy.knockbackY = velocityY / speed * 58;
  }

  broadcast({
    type: "enemyDamage",
    enemyType: enemy.type,
    enemyId: enemy.id,
    mapId: enemy.mapId,
    amount,
    hp: enemy.hp,
    critical: false,
    source,
    attackerId
  });

  if (enemy.hp <= 0) {
    killSharedEnemy(enemy, attackerId);
  }
}

function damageTreeFromHurl(
  mapId,
  x,
  y,
  attackerId,
  directionX
) {
  let bestTree = null;
  let bestDistance = Infinity;

  for (const entity of sharedEnvironment.values()) {
    if (
      entity.mapId !== mapId ||
      entity.kind !== "tree" ||
      entity.isStump ||
      entity.falling
    ) {
      continue;
    }

    const distance = Math.hypot(entity.x - x, entity.y - y);

    if (distance <= 12 && distance < bestDistance) {
      bestTree = entity;
      bestDistance = distance;
    }
  }

  if (!bestTree) return false;

  bestTree.hp = Math.max(0, bestTree.hp - 1);
  bestTree.lastHitPlayerId = attackerId;
  scheduleTreeRegrow(bestTree);
  markEnvironmentDirty(bestTree);

  if (bestTree.hp <= 0) {
    bestTree.falling = true;
    bestTree.fallTime = bestTree.fallDuration;
    bestTree.fallDirection = directionX >= 0 ? 1 : -1;
    markEnvironmentDirty(bestTree);
  }

  return true;
}

function serverEnemyPositionAllowedForHurl(enemy, x, y) {
  if (enemy.type === "slime") {
    return slimePositionAllowed(enemy, x, y);
  }

  if (enemy.type === "goblin") {
    return goblinPositionAllowed(enemy, x, y);
  }

  return mapPointAllowed(enemy.mapId, x, y);
}

function finishServerEnemyHurl(
  enemy,
  attackerId,
  landingDamage = true
) {
  if (!enemy?.alive) return;

  const velocityX = enemy.hurlVelocityX;
  const velocityY = enemy.hurlVelocityY;

  clearServerEnemyHurlState(enemy);

  const speed = Math.hypot(velocityX, velocityY) || 1;
  enemy.knockbackX = velocityX / speed * 24;
  enemy.knockbackY = velocityY / speed * 24;

  if (landingDamage) {
    const landingDamageAmount =
      enemy.type === "slime"
        ? 4 + Math.floor(Math.random() * 4)
        : 6 + Math.floor(Math.random() * 4);

    broadcastHurlEnemyDamage(
      enemy,
      landingDamageAmount,
      attackerId,
      "hurlLanding"
    );
  }
}

function tryHurlCollision(enemy) {
  const attackerId = enemy.hurlThrownBy;
  const velocityX = enemy.hurlVelocityX;
  const velocityY = enemy.hurlVelocityY;

  for (const target of sharedEnemiesOnMap(enemy.mapId)) {
    if (
      target === enemy ||
      !target.alive ||
      target.carriedBy ||
      target.hurlTime > 0
    ) {
      continue;
    }

    if (Math.hypot(target.x - enemy.x, target.y - enemy.y) > 11) {
      continue;
    }

    broadcastHurlEnemyDamage(
      target,
      8 + Math.floor(Math.random() * 5),
      attackerId,
      "hurl",
      velocityX,
      velocityY
    );

    finishServerEnemyHurl(enemy, attackerId, true);
    return true;
  }

  if (
    damageTreeFromHurl(
      enemy.mapId,
      enemy.x,
      enemy.y,
      attackerId,
      velocityX
    )
  ) {
    finishServerEnemyHurl(enemy, attackerId, true);
    return true;
  }

  return false;
}

function tickServerEnemyHurl(enemy, dt) {
  ensureServerEnemyHurlState(enemy);

  if (enemy.carriedBy) {
    const carrier = players.get(enemy.carriedBy);

    if (
      !carrier ||
      carrier.hp <= 0 ||
      carrier.mapId !== enemy.mapId
    ) {
      clearServerEnemyHurlState(enemy);
      return false;
    }

    enemy.x = carrier.x;
    enemy.y = carrier.y;
    enemy.pickupTime = Math.max(0, enemy.pickupTime - dt);
    enemy.knockbackX = 0;
    enemy.knockbackY = 0;
    clearEnemyAggroTarget(enemy);
    enemy.tauntTime = 0;
    return true;
  }

  if (enemy.hurlTime <= 0) return false;

  enemy.hurlTime = Math.max(0, enemy.hurlTime - dt);

  const nextX = enemy.x + enemy.hurlVelocityX * dt;
  const nextY = enemy.y + enemy.hurlVelocityY * dt;

  if (!serverEnemyPositionAllowedForHurl(enemy, nextX, nextY)) {
    finishServerEnemyHurl(enemy, enemy.hurlThrownBy, true);
    return true;
  }

  enemy.x = nextX;
  enemy.y = nextY;

  if (tryHurlCollision(enemy)) return true;

  if (enemy.hurlTime <= 0) {
    finishServerEnemyHurl(enemy, enemy.hurlThrownBy, true);
  }

  return true;
}

function handleGenericEnemyHurlAction(
  playerId,
  enemy,
  action,
  payload
) {
  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.hp <= 0 ||
    playerState.mapId !== enemy.mapId ||
    !serverEnemyIsHurlable(enemy)
  ) {
    return;
  }

  ensureServerEnemyHurlState(enemy);

  if (action === "hurlGrab") {
    if (enemy.carriedBy || enemy.hurlTime > 0) return;

    if (
      allSharedEnemies().some(candidate =>
        candidate.carriedBy === playerId
      )
    ) {
      return;
    }

    const distance = Math.hypot(
      enemy.x - playerState.x,
      enemy.y - playerState.y
    );

    if (distance > 24) return;

    if (
      sharedEnemyActionRateLimited(
        playerId,
        enemy.id,
        "hurlGrab",
        300
      )
    ) {
      return;
    }

    const pickupDx = enemy.x - playerState.x;
    const pickupDy = enemy.y - playerState.y;
    const pickupLength = Math.hypot(pickupDx, pickupDy) || 1;

    enemy.carriedBy = playerId;
    enemy.pickupTime = enemy.pickupDuration;
    enemy.pickupDirX = pickupDx / pickupLength;
    enemy.pickupDirY = pickupDy / pickupLength;
    enemy.hurlTime = 0;
    enemy.hurlVelocityX = 0;
    enemy.hurlVelocityY = 0;
    enemy.hurlThrownBy = null;
    enemy.knockbackX = 0;
    enemy.knockbackY = 0;
    clearEnemyAggroTarget(enemy);
    enemy.tauntTime = 0;

    serverEnemyProfile(enemy)?.onHurlGrab?.(enemy);
    return;
  }

  if (action === "hurlThrow") {
    if (enemy.carriedBy !== playerId) return;

    const aimAngle = Number(payload.aimAngle);
    if (!Number.isFinite(aimAngle)) return;

    if (
      sharedEnemyActionRateLimited(
        playerId,
        enemy.id,
        "hurlThrow",
        220
      )
    ) {
      return;
    }

    const throwSpeed = 126;

    enemy.carriedBy = null;
    enemy.pickupTime = 0;
    enemy.pickupDirX = 0;
    enemy.pickupDirY = 0;
    enemy.hurlTime = enemy.hurlDuration;
    enemy.hurlVelocityX = Math.cos(aimAngle) * throwSpeed;
    enemy.hurlVelocityY = Math.sin(aimAngle) * throwSpeed;
    enemy.hurlThrownBy = playerId;
    enemy.lastDamagePlayerId = playerId;
    clearEnemyAggroTarget(enemy);
    enemy.tauntTime = 0;
  }
}

function tryServerSlimeContact(slime) {
  if (
    slime.tauntTime > 0 ||
    slime.carriedBy ||
    slime.hurlTime > 0
  ) {
    return;
  }

  const target = nearestPlayerForSlime(slime);

  if (
    !target ||
    target.distance > 9 ||
    !playerContactAvailable(target.player.id)
  ) {
    return;
  }

  let dx =
    target.player.x - slime.x;

  let dy =
    (target.player.y - 3) -
    (slime.y - 4);

  const distance = Math.hypot(dx, dy);

  if (distance >= 7.0) {
    return;
  }

  if (distance < 0.001) {
    dx = -slime.dir;
    dy = 0;
  } else {
    dx /= distance;
    dy /= distance;
  }

  const damage =
    slime.variant === "purple"
      ? 8 + Math.floor(Math.random() * 3)
      : slime.variant === "goldBaby"
        ? 7 + Math.floor(Math.random() * 4)
        : slime.variant === "blue"
          ? 6 + Math.floor(Math.random() * 3)
          : 4 + Math.floor(Math.random() * 4);

  setPlayerContactCooldown(
    target.player.id,
    0.42
  );

  broadcastEnemyHitPlayer(
    target.player,
    slime,
    damage,
    dx,
    dy,
    78,
    0.42
  );
}

function bigGoldSlimeAliveOnMap(mapId) {
  return sharedBigGoldSlimes.some(bigGold =>
    bigGold.mapId === mapId && bigGold.alive
  );
}

function tickSharedSlimes(dt) {
  for (const slime of sharedSlimes) {
    if (!slime.alive) {
      // Baby gold slimes only enter/re-enter the den during the long window
      // where the Big Gold Slime is dead. Their timer freezes while the elite
      // is alive, but any babies already alive are deliberately left alone.
      if (
        slime.spawnOnlyWhileBigGoldDead &&
        bigGoldSlimeAliveOnMap(slime.mapId)
      ) {
        continue;
      }

      slime.respawnTime -= dt;

      if (slime.respawnTime <= 0) {
        resetServerSlime(slime);
      }

      continue;
    }

    tickEnemyStatuses(slime, dt);
    if (!slime.alive) continue;

    if (
      tickServerEnemyHurl(
        slime,
        dt
      )
    ) {
      continue;
    }

    if (slime.tauntTime > 0) {
      slime.tauntTime = Math.max(
        0,
        slime.tauntTime - dt
      );

      if (slime.tauntTime <= 0) {
        slime.tauntOwnerId = null;
        slime.tauntCloneId = null;
      } else {
        releaseEnemyTauntOnContact(slime);
      }
    }

    const confused =
      tickEnemyConfusion(slime, dt);

    if (
      !confused &&
      slime.aggressiveOnSight &&
      slime.tauntTime <= 0
    ) {
      const nearest = nearestPlayerForSlime(slime);

      if (
        nearest &&
        nearest.distance <= 72
      ) {
        setEnemyAggroTarget(
          slime,
          nearest.player.id,
          slime.aggroDuration
        );
      }
    }

    if (!confused) {
      tryServerSlimeContact(slime);
    }

    if (slime.aggroTime > 0) {
      slime.aggroTime = Math.max(
        0,
        slime.aggroTime - dt
      );
    }

    if (
      Math.abs(slime.knockbackX) > 0.1 ||
      Math.abs(slime.knockbackY) > 0.1
    ) {
      const nextX =
        slime.x + slime.knockbackX * dt;

      const nextY =
        slime.y + slime.knockbackY * dt;

      if (
        slimePositionAllowed(
          slime,
          nextX,
          slime.y
        )
      ) {
        slime.x = nextX;
      }

      if (
        slimePositionAllowed(
          slime,
          slime.x,
          nextY
        )
      ) {
        slime.y = nextY;
      }

      slime.knockbackX *= 0.82;
      slime.knockbackY *= 0.82;
    }

    if (confused) {
      continue;
    }

    const distanceFromHome = Math.hypot(
      slime.x - slime.homeX,
      slime.y - slime.homeY
    );

    // The decoy has absolute priority while it exists.
    if (
      slime.tauntTime > 0 &&
      distanceFromHome < (slime.combatLeashRadius || 240)
    ) {
      const dx =
        slime.tauntX - slime.x;

      const dy =
        slime.tauntY - slime.y;

      const distance =
        Math.hypot(dx, dy);

      if (distance > 1) {
        const moveX = dx / distance;
        const moveY = dy / distance;

        moveServerSlime(
          slime,
          moveX,
          moveY,
          slime.chaseSpeed,
          dt
        );

        if (Math.abs(moveX) > 0.05) {
          slime.dir =
            moveX >= 0 ? 1 : -1;
        }
      }

      // Contact with the Hallucination clears its forced taunt above; until then,
      // the illusion retains priority over ordinary player aggro.
      continue;
    }

    let targetPlayer = visibleAggroPlayerById(
      slime.aggroTargetId,
      slime.mapId,
      slime.x,
      slime.y
    );

    if (!targetPlayer && slime.aggroTargetId) {
      // The remembered attacker died, hid, disconnected, or changed maps.
      clearEnemyAggroTarget(slime);
    }

    const targetDistance = targetPlayer
      ? Math.hypot(
          targetPlayer.x - slime.x,
          targetPlayer.y - slime.y
        )
      : Infinity;

    if (slime.aggroTime <= 0 && targetPlayer) {
      slime.aggroTargetId = null;
      targetPlayer = null;
    }

    if (
      slime.aggroTime > 0 &&
      targetPlayer &&
      targetDistance > 1 &&
      distanceFromHome < (slime.combatLeashRadius || 240)
    ) {
      const dx =
        targetPlayer.x - slime.x;

      const dy =
        targetPlayer.y - slime.y;

      const length =
        Math.hypot(dx, dy) || 1;

      const moveX = dx / length;
      const moveY = dy / length;

      moveServerSlime(
        slime,
        moveX,
        moveY,
        slime.chaseSpeed,
        dt
      );

      if (Math.abs(moveX) > 0.05) {
        slime.dir =
          moveX >= 0 ? 1 : -1;
      }

      continue;
    }

    if (distanceFromHome >= (slime.combatLeashRadius || 240)) {
      clearEnemyAggroTarget(slime);
    }

    if (slime.pauseTime > 0) {
      slime.pauseTime = Math.max(
        0,
        slime.pauseTime - dt
      );
      continue;
    }

    slime.wanderDecisionTime -= dt;

    let dx = slime.wanderTargetX - slime.x;
    let dy = slime.wanderTargetY - slime.y;
    let distance = Math.hypot(dx, dy);

    if (
      distance < 2 ||
      slime.wanderDecisionTime <= 0
    ) {
      if (distance < 2 && Math.random() < 0.45) {
        slime.pauseTime = 0.20 + Math.random() * 0.35;
      }

      chooseServerSlimeWanderTarget(slime);

      dx = slime.wanderTargetX - slime.x;
      dy = slime.wanderTargetY - slime.y;
      distance = Math.hypot(dx, dy);
    }

    if (distance > 0.001) {
      const moveX = dx / distance;
      const moveY = dy / distance;

      moveServerSlime(
        slime,
        moveX,
        moveY,
        slime.speed,
        dt
      );

      if (Math.abs(moveX) > 0.05) {
        slime.dir = moveX >= 0 ? 1 : -1;
      }
    }
  }
}


function angleDifference(a, b) {
  let diff = a - b;

  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  return diff;
}





// 30 Hz authoritative slime simulation, 15 Hz network snapshots.
let previousSlimeTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(
    0.05,
    (now - previousSlimeTick) / 1000
  );

  previousSlimeTick = now;

  tickSharedEnemySnareStatuses(dt);
  tickHunterSnareCharges(dt);
  tickSharedSlimes(dt);
  tickSharedGoblins(dt);
  tickSharedGhosts(dt);
  tickSharedBigGoldSlimes(dt);
  tickHunterSnares();
  tickSharedEnvironment(dt);
  tickSharedResources(dt);
  tickSharedCoins(dt);
}, 1000 / 30);

setInterval(() => {
  flushEnvironmentPatches();
}, 1000 / 10);

setInterval(() => {
  broadcastSharedEnemySnapshots();
}, 1000 / 15);

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInteger(value, min, max, fallback = 0) {
  return Math.round(
    clampNumber(value, min, max, fallback)
  );
}


// -----------------------------------------------------------------------------
// MAP-SCOPED COMBAT / ABILITY VISUAL EVENTS
// -----------------------------------------------------------------------------
// Presentation-only events. Authoritative gameplay still uses the existing
// player/enemy HP, status, AI, and drop paths.
function sanitizeVisualPoint(value, fallback = 0) {
  return clampNumber(value, -32, 672, fallback);
}

function sanitizeVisualVelocity(value) {
  return clampNumber(value, -320, 320, 0);
}

function sanitizeVisualEffectPayload(
  effect,
  payload = {}
) {
  if (effect === "basicProjectile") {
    return {
      projectileType:
        payload.projectileType === "rainWand"
          ? "rainWand"
          : payload.projectileType === "shepherdStaff"
            ? "shepherdStaff"
            : payload.projectileType === "arrow"
              ? "arrow"
              : "wand",

      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),
      vx: sanitizeVisualVelocity(payload.vx),
      vy: sanitizeVisualVelocity(payload.vy),

      life: clampNumber(
        payload.life,
        0.1,
        2.0,
        1.2
      )
    };
  }

  if (effect === "focusFireArc") {
    return {
      startX: sanitizeVisualPoint(payload.startX),
      startY: sanitizeVisualPoint(payload.startY),
      targetX: sanitizeVisualPoint(payload.targetX),
      targetY: sanitizeVisualPoint(payload.targetY),
      duration: clampNumber(
        payload.duration,
        0.18,
        0.9,
        0.4
      )
    };
  }

  if (effect === "fireball") {
    return {
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),
      vx: sanitizeVisualVelocity(payload.vx),
      vy: sanitizeVisualVelocity(payload.vy),
      airborne: Boolean(payload.airborne),
      startX: sanitizeVisualPoint(payload.startX),
      startY: sanitizeVisualPoint(payload.startY),
      targetX: sanitizeVisualPoint(payload.targetX),
      targetY: sanitizeVisualPoint(payload.targetY),
      duration: clampNumber(
        payload.duration,
        0.18,
        0.9,
        0.4
      ),
      arcHeight: clampNumber(
        payload.arcHeight,
        0,
        60,
        20
      ),

      life: clampNumber(
        payload.life,
        0.1,
        2.5,
        1.65
      )
    };
  }

  if (effect === "fireballImpact") {
    return {
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y)
    };
  }

  if (effect === "basicProjectileImpact") {
    return {
      projectileType:
        payload.projectileType === "rainWand"
          ? "rainWand"
          : payload.projectileType === "shepherdStaff"
            ? "shepherdStaff"
            : payload.projectileType === "arrow"
              ? "arrow"
              : "wand",

      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y)
    };
  }

  if (effect === "wandMasteryHit") {
    return {
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),
      angle: clampNumber(payload.angle, -20, 20, 0)
    };
  }

  if (effect === "levelUp") {
    return {
      level: clampInteger(
        payload.level,
        1,
        999,
        1
      )
    };
  }

  if (effect === "rainCast") {
    return {
      startX: sanitizeVisualPoint(payload.startX),
      startY: sanitizeVisualPoint(payload.startY),
      targetX: sanitizeVisualPoint(payload.targetX),
      targetY: sanitizeVisualPoint(payload.targetY),

      followPlayer: Boolean(payload.followPlayer),
      retarget: Boolean(payload.retarget),
      instant: Boolean(payload.instant),

      cloudLife: clampNumber(
        payload.cloudLife,
        4,
        24,
        12
      )
    };
  }


  if (effect === "rainGrassSpawn") {
    const grassId = typeof payload.grassId === "string"
      ? payload.grassId.slice(0, 96)
      : "";

    if (!grassId) return null;

    return {
      grassId,
      patchId: clampInteger(payload.patchId, 0, 1000000000, 0),
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),
      width: clampNumber(payload.width, 8, 18, 12),
      phase: clampNumber(payload.phase, -20, 20, 0),
      tempLife: clampNumber(payload.tempLife, 0.1, 40, 30),
      burnDuration: clampNumber(payload.burnDuration, 0.1, 6, 3)
    };
  }

  if (effect === "rainGrassState") {
    const grassId = typeof payload.grassId === "string"
      ? payload.grassId.slice(0, 96)
      : "";
    const grassOwnerId = typeof payload.grassOwnerId === "string"
      ? payload.grassOwnerId.slice(0, 96)
      : "";
    const state = payload.state === "extinguished"
      ? "extinguished"
      : payload.state === "burning"
        ? "burning"
        : "";

    if (!grassId || !grassOwnerId || !state) return null;

    return {
      grassOwnerId,
      grassId,
      state,
      burnTime: clampNumber(payload.burnTime, 0, 6, 0)
    };
  }

  if (effect === "shadowSmoke") {
    return {
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),

      count: clampInteger(
        payload.count,
        6,
        60,
        18
      ),

      scale: clampNumber(
        payload.scale,
        0.6,
        2.0,
        1
      )
    };
  }

  if (effect === "jesterBlink") {
    return {
      startX: sanitizeVisualPoint(payload.startX),
      startY: sanitizeVisualPoint(payload.startY),
      endX: sanitizeVisualPoint(payload.endX),
      endY: sanitizeVisualPoint(payload.endY),

      hatIndex: clampInteger(
        payload.hatIndex,
        -1,
        7,
        -1
      ),

      shirtIndex: clampInteger(
        payload.shirtIndex,
        -1,
        4,
        -1
      ),

      pantsIndex: clampInteger(
        payload.pantsIndex,
        -1,
        4,
        -1
      )
    };
  }

  return null;
}

function clearPlayerOwnedTransientWorldState(
  playerId,
  mapId = null
) {
  removeHunterSnaresForOwner(
    playerId,
    mapId,
    "ownerCleanup"
  );

  for (const enemy of allSharedEnemies()) {
    if (mapId && enemy.mapId !== mapId) {
      continue;
    }

    // Death/map-leave makes the owner cease to exist as a combat target.
    if (enemy.aggroTargetId === playerId) {
      clearEnemyAggroTarget(enemy);
    }

    if (enemy.confusionTargetId === playerId) {
      enemy.confusionTime = 0;
      enemy.confusionTargetId = null;
    }

    if (enemy.tauntOwnerId === playerId) {
      enemy.tauntTime = 0;
      enemy.tauntOwnerId = null;
      enemy.tauntCloneId = null;
    }

    if (enemy.carriedBy === playerId) {
      clearServerEnemyHurlState(enemy);
    }
  }
}

function broadcastOwnerTransientCleanup(
  playerId,
  mapId,
  excludeSocket = null
) {
  if (!mapId) return;

  broadcast(
    {
      type: "visualEffect",
      senderId: playerId,
      mapId,
      effect: "ownerTransientCleanup",
      payload: {}
    },
    excludeSocket
  );
}

function handleVisualEffect(
  playerId,
  socket,
  message
) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) return;

  const effect = String(message.effect || "");

  const allowedEffects = new Set([
    "basicProjectile",
    "basicProjectileImpact",
    "wandMasteryHit",
    "focusFireArc",
    "fireball",
    "fireballImpact",
    "levelUp",
    "rainCast",
    "rainGrassSpawn",
    "rainGrassState",
    "shadowSmoke",
    "jesterBlink"
  ]);

  if (!allowedEffects.has(effect)) return;

  const payload =
    sanitizeVisualEffectPayload(
      effect,
      message.payload
    );

  if (!payload) return;

  // The source client already rendered the local copy.
  broadcast(
    {
      type: "visualEffect",
      senderId: playerId,
      mapId: playerState.mapId,
      effect,
      payload
    },
    socket
  );
}

function sanitizePlayerState(id, source = {}, previous = null) {
  const requestedMapId = ALLOWED_MAPS.has(source.mapId)
    ? source.mapId
    : "spawn";

  const authoritativeDead =
    Boolean(previous && previous.hp <= 0);

  // Dead players stay exactly where they fell until the client presses the
  // explicit Respawn button. Their ordinary movement packets must not move
  // them or transfer them through portals while dead.
  const mapId =
    authoritativeDead && previous?.mapId
      ? previous.mapId
      : requestedMapId;

  const camouflageRequested =
    !authoritativeDead &&
    Boolean(source.camouflaged) &&
    !playerIsTargetedByPveEnemy(id);

  const camouflageReadyUntil =
    camouflageRequested
      // Long enough for a maximum-range committed arrow + ordinary latency
      // to arrive after the client has already revealed itself on release.
      ? Date.now() + 2500
      : Math.max(
          0,
          Number(previous?.camouflageReadyUntil) || 0
        );

  return {
    id,
    mapId,

    // Session resources + HP are server-owned. Ordinary client movement/state
    // updates cannot overwrite them.
    coins: previous && Number.isFinite(previous.coins)
      ? previous.coins
      : 0,

    wood: previous && Number.isFinite(previous.wood)
      ? previous.wood
      : 0,

    flowers: previous && Number.isFinite(previous.flowers)
      ? previous.flowers
      : 0,

    goldSlimeBubbles:
      previous && Number.isFinite(previous.goldSlimeBubbles)
        ? previous.goldSlimeBubbles
        : 0,

    arrows: previous && Number.isFinite(previous.arrows)
      ? previous.arrows
      : 0,

    hunterSnareCharges:
      previous && Number.isFinite(previous.hunterSnareCharges)
        ? Math.max(
            0,
            Math.min(
              HUNTER_SNARE_MAX_CHARGES,
              Math.floor(previous.hunterSnareCharges)
            )
          )
        : HUNTER_SNARE_MAX_CHARGES,

    hunterSnareChargeTime:
      previous && Number.isFinite(previous.hunterSnareChargeTime)
        ? Math.max(0, previous.hunterSnareChargeTime)
        : 0,

    // Session-only first crafting progression. Wood is server-owned, so the
    // bench recipe must be validated/spent here rather than only on the client.
    woodSwordCrafted:
      previous
        ? Boolean(previous.woodSwordCrafted)
        : false,

    woodBowCrafted:
      previous
        ? Boolean(previous.woodBowCrafted)
        : false,

    shepherdStaffCrafted:
      previous
        ? Boolean(previous.shepherdStaffCrafted)
        : false,

    woodHelmCrafted:
      previous
        ? Boolean(previous.woodHelmCrafted)
        : false,

    woodChestCrafted:
      previous
        ? Boolean(previous.woodChestCrafted)
        : false,

    woodGreavesCrafted:
      previous
        ? Boolean(previous.woodGreavesCrafted)
        : false,

    shopPurchases:
      previous &&
      Array.isArray(previous.shopPurchases)
        ? previous.shopPurchases
        : [],

    maxHp: previous && Number.isFinite(previous.maxHp)
      ? previous.maxHp
      : 50,

    hp: previous && Number.isFinite(previous.hp)
      ? previous.hp
      : 50,

    isDead: authoritativeDead,

    // PvP permission and combat-lock time are server-owned. Normal movement
    // packets cannot enable/disable PvP or clear an active lock.
    pvpEnabled:
      previous
        ? Boolean(previous.pvpEnabled)
        : false,

    pvpCombatUntil:
      previous && Number.isFinite(previous.pvpCombatUntil)
        ? previous.pvpCombatUntil
        : 0,

    x:
      authoritativeDead && previous && Number.isFinite(previous.x)
        ? previous.x
        : clampNumber(
            source.x,
            0,
            mapWorldDimensions(mapId).width,
            mapWorldDimensions(mapId).width / 2
          ),
    y:
      authoritativeDead && previous && Number.isFinite(previous.y)
        ? previous.y
        : clampNumber(
            source.y,
            0,
            mapWorldDimensions(mapId).height,
            mapWorldDimensions(mapId).height / 2
          ),

    hatIndex: clampInteger(source.hatIndex, -1, 8, -1),
    shirtIndex: clampInteger(source.shirtIndex, -1, 5, -1),
    pantsIndex: clampInteger(source.pantsIndex, -1, 5, -1),
    weaponIndex: clampInteger(source.weaponIndex, -1, 8, -1),

    // Progression remains client-owned for now, but server damage uses these
    // sanitized values instead of trusting a client-supplied damage number.
    level: clampInteger(
      source.level,
      1,
      99,
      previous?.level || 1
    ),

    stats: {
      strength: clampInteger(
        source.stats?.strength,
        0,
        10,
        previous?.stats?.strength || 0
      ),

      dex: clampInteger(
        source.stats?.dex,
        0,
        10,
        previous?.stats?.dex || 0
      ),

      luck: clampInteger(
        source.stats?.luck,
        0,
        10,
        previous?.stats?.luck || 0
      ),

      int: clampInteger(
        source.stats?.int,
        0,
        10,
        previous?.stats?.int || 0
      )
    },

    walkTime: clampNumber(source.walkTime, 0, 1000000, 0),
    firstRaisedLeg:
      source.firstRaisedLeg === "right" ? "right" : "left",

    attackTime: clampNumber(source.attackTime, 0, 1, 0),
    attackDuration: clampNumber(source.attackDuration, 0.05, 1, 0.30),
    attackDirection:
      ["left", "right", "up", "down"].includes(source.attackDirection)
        ? source.attackDirection
        : "left",
    attackHand:
      source.attackHand === "right" ? "right" : "left",

    attackAimAngle:
      clampNumber(
        source.attackAimAngle,
        -Math.PI * 4,
        Math.PI * 4,
        0
      ),

    // Presentation-only bow prototype state.
    bowDrawing:
      Boolean(source.bowDrawing),

    bowDrawAmount:
      clampNumber(
        source.bowDrawAmount,
        0,
        1,
        0
      ),

    bowReleaseTime:
      clampNumber(
        source.bowReleaseTime,
        0,
        0.25,
        0
      ),

    focusFireCasting:
      Boolean(source.focusFireCasting),

    fireballAiming:
      Boolean(source.fireballAiming),
    fireballAimTime:
      clampNumber(source.fireballAimTime, 0, 1000000, 0),

    rainCloudCasting:
      Boolean(source.rainCloudCasting),
    rainCloudCastTime:
      clampNumber(source.rainCloudCastTime, 0, 1, 0),
    rainCloudCastDuration:
      clampNumber(source.rainCloudCastDuration, 0.05, 1, 0.50),

    camouflaged: camouflageRequested,
    camouflageReadyUntil,

    hunterSnareSetting:
      Boolean(source.hunterSnareSetting),
    hunterSnareSetTime:
      clampNumber(source.hunterSnareSetTime, 0, 3, 0),
    hunterSnareSetDuration:
      clampNumber(source.hunterSnareSetDuration, 0.5, 3, 2.5),

    shadowHidden: Boolean(source.shadowHidden),
    shadowHideRevealTime:
      clampNumber(source.shadowHideRevealTime, 0, 1, 0),

    wetTime: clampNumber(source.wetTime, 0, 10, 0),
    burnTime: clampNumber(source.burnTime, 0, 10, 0),

    // Presentation-only Hurl whiff/reach state. These fields are sanitized
    // and rebroadcast so nearby players can see the failed-grab animation.
    hurlReachTime:
      clampNumber(source.hurlReachTime, 0, 0.5, 0),

    hurlReachDuration:
      clampNumber(source.hurlReachDuration, 0.05, 0.5, 0.18),

    hurlReachDirX:
      clampNumber(source.hurlReachDirX, -1, 1, 0),

    hurlReachDirY:
      clampNumber(source.hurlReachDirY, -1, 1, 0)
  };
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast(payload, exceptSocket = null) {
  const encoded = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (
      client !== exceptSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(encoded);
    }
  }
}

function broadcastPresence() {
  broadcast({
    type: "presence",
    count: players.size
  });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function safePublicPath(requestPath) {
  let pathname;

  try {
    pathname = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, normalized);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return fullPath;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
      ok: true,
      buildVersion: BUILD_VERSION,
      players: players.size,
      sharedEntities: worldEntitiesById.size,
      sharedSlimes: sharedSlimes.length,
      sharedGoblins: sharedGoblins.length,
      sharedGhosts: sharedGhosts.length,
      sharedEnvironment: sharedEnvironment.size,
      sharedResources: sharedResources.size,
      sharedCoins: sharedCoins.size,
      worldContentVersion: WORLD_CONTENT.version,
      combatBalanceVersion:
        COMBAT_BALANCE.version
    }));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  const filePath = safePublicPath(requestUrl.pathname);

  if (!filePath) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),

      // index.html and shared/world-content.js must always come from the same
      // build. `no-cache` still permits browser storage; `no-store` avoids
      // stale shared map/enemy registries across localhost / Render updates.
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", socket => {
  const id = crypto.randomUUID();

  const initialState = sanitizePlayerState(id, {
    mapId: "spawn",
    x: 172,
    y: 112,
    weaponIndex: -1
  });

  players.set(id, initialState);

  sendJson(socket, {
    type: "welcome",
    id,
    buildVersion: BUILD_VERSION,
    coins: initialState.coins,
    wood: initialState.wood,
    flowers: initialState.flowers,
    goldSlimeBubbles: initialState.goldSlimeBubbles,
    arrows: initialState.arrows,
    hunterSnareCharges: initialState.hunterSnareCharges,
    hp: initialState.hp,
    maxHp: initialState.maxHp,
    pvpEnabled: initialState.pvpEnabled,
    pvpCombatUntil: initialState.pvpCombatUntil,
    worldContentVersion:
      WORLD_CONTENT.version,
    combatBalanceVersion:
      COMBAT_BALANCE.version
  });

  sendJson(socket, {
    type: "snapshot",
    players: [...players.values()]
  });

  for (const enemyType of Object.keys(sharedEnemyCollections)) {
    sendJson(socket, {
      type: "enemySnapshot",
      enemyType,
      enemies: sharedEnemySnapshot(enemyType)
    });
  }

  sendJson(socket, {
    type: "hunterSnareSnapshot",
    snares: hunterSnareSnapshot()
  });

  sendJson(socket, {
    type: "coinSnapshot",
    coins: sharedCoinSnapshot()
  });

  sendJson(socket, {
    type: "environmentSnapshot",
    entities: sharedEnvironmentSnapshot()
  });

  sendJson(socket, {
    type: "resourceSnapshot",
    resources: sharedResourceSnapshot()
  });

  broadcast({
    type: "playerState",
    player: initialState
  }, socket);

  broadcastPresence();

  socket.on("message", raw => {
    if (raw.length > 131072) return;

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (
      message.type === "playerState" &&
      message.player &&
      typeof message.player === "object"
    ) {
      const previousState =
        players.get(id);

      const cleanState = sanitizePlayerState(
        id,
        message.player,
        previousState
      );

      const mapChanged =
        Boolean(
          previousState &&
          previousState.mapId !==
            cleanState.mapId
        );

      if (mapChanged) {
        clearPlayerOwnedTransientWorldState(
          id,
          previousState.mapId
        );

        broadcastOwnerTransientCleanup(
          id,
          previousState.mapId,
          socket
        );
      }

      players.set(id, cleanState);

      broadcast({
        type: "playerState",
        player: cleanState
      }, socket);

      return;
    }

    if (message.type === "enemyAction") {
      handleSharedEnemyAction(id, message);
      return;
    }

    if (message.type === "hunterSnarePlace") {
      handleHunterSnarePlace(id, message);
      return;
    }

    if (message.type === "playerDamageRequest") {
      handlePlayerDamageRequest(id, message);
      return;
    }

    if (message.type === "playerIgniteRequest") {
      handlePlayerIgniteRequest(id, message);
      return;
    }

    if (message.type === "pvpToggle") {
      handlePvpToggle(id, socket, message);
      return;
    }

    if (message.type === "pvpAttack") {
      handlePvpAttack(id, message);
      return;
    }

    if (message.type === "playerHealRequest") {
      handlePlayerHealRequest(id, message);
      return;
    }

    if (message.type === "playerRespawn") {
      handlePlayerRespawn(id, message);
      return;
    }

    if (message.type === "visualEffect") {
      handleVisualEffect(id, socket, message);
      return;
    }

    if (message.type === "environmentCatalog") {
      handleEnvironmentCatalog(id, message);
      return;
    }

    if (message.type === "environmentAction") {
      handleEnvironmentAction(id, message);
      return;
    }

    if (
      message.type === "resourcePickup" &&
      typeof message.resourceId === "string"
    ) {
      handleResourcePickup(
        id,
        message.resourceId
      );
      return;
    }

    if (message.type === "arrowUse") {
      handleArrowUse(
        id,
        socket
      );
      return;
    }

    if (message.type === "craftRequest") {
      handleCraftRequest(
        id,
        socket,
        message
      );
      return;
    }

    if (message.type === "shopPurchase") {
      handleShopPurchase(
        id,
        socket,
        message
      );
      return;
    }

    if (message.type === "debugGrantCoins") {
      handleDebugGrantCoins(
        id,
        socket
      );
      return;
    }

    if (message.type === "debugGrantArrows") {
      handleDebugGrantArrows(
        id,
        socket
      );
      return;
    }

    if (
      message.type === "coinPickup" &&
      typeof message.coinId === "string"
    ) {
      handleCoinPickup(id, message.coinId);
    }
  });

  socket.on("close", () => {
    focusFireDamageChains.delete(id);

    const previousState =
      players.get(id);

    if (previousState) {
      clearPlayerOwnedTransientWorldState(
        id,
        previousState.mapId
      );

      broadcastOwnerTransientCleanup(
        id,
        previousState.mapId,
        socket
      );
    }

    players.delete(id);

    for (const key of [...pvpAttackRateLimits.keys()]) {
      if (key.startsWith(`${id}:`) || key.includes(`:${id}:`)) {
        pvpAttackRateLimits.delete(key);
      }
    }

    broadcast({
      type: "playerLeft",
      id
    });

    broadcastPresence();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Slime Story Online listening on port ${PORT}`);
});
