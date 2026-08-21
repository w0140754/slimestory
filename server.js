const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const WORLD_CONTENT = require("./public/shared/world-content.js");

const ALLOWED_MAPS = new Set(
  Object.keys(WORLD_CONTENT.maps)
);

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

  const supportedTypes = new Set([
    "slime",
    "goblin",
    "ghost"
  ]);

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
  }
}

validateWorldContent();

const players = new Map();


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
      burnDuration: 1.05
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
  if (!["wood", "flower"].includes(kind)) {
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
  } else {
    playerState.flowers += 1;
  }

  broadcast({
    type: "resourcePicked",
    resourceId: resource.id,
    resourceKind: resource.kind,
    collectorId: playerId,
    totalWood: playerState.wood,
    totalFlowers: playerState.flowers
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

function igniteEnvironmentEntity(entity) {
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
    markEnvironmentDirty(entity);
    return true;
  }

  if (entity.burnTime <= 0) {
    return false;
  }

  entity.burnTime = 0;
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
  radius
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
          igniteEnvironmentEntity(entity) ||
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
        igniteEnvironmentEntity(entity) ||
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
  radius
) {
  for (const slime of sharedSlimes) {
    if (
      !slime.alive ||
      slime.mapId !== mapId ||
      slime.burnTime > 0
    ) {
      continue;
    }

    if (
      Math.hypot(
        slime.x - x,
        (slime.y - 6) - y
      ) <= radius
    ) {
      slime.burnTime = 3.0;
      slime.burnTickTimer =
        slime.burnTickInterval;
    }
  }

  for (const enemy of [
    ...sharedGoblins,
    ...sharedGhosts
  ]) {
    if (
      !enemy.alive ||
      enemy.mapId !== mapId ||
      enemy.burnTime > 0
    ) {
      continue;
    }

    if (
      Math.hypot(
        enemy.x - x,
        (enemy.y - 11) - y
      ) <= radius
    ) {
      enemy.burnTime = 3.0;
      enemy.burnTickTimer =
        enemy.burnTickInterval;
    }
  }

  for (const playerState of players.values()) {
    if (
      playerState.mapId !== mapId ||
      playerState.hp <= 0 ||
      playerState.wetTime > 0 ||
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

    playerState.burnTime = 5.0;

    broadcast({
      type: "playerIgnited",
      targetId: playerState.id,
      mapId,
      burnTime: 5.0
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
      ...environmentEntityFirePoint(entity)
    });
  }

  for (const slime of sharedSlimes) {
    if (slime.alive && slime.burnTime > 0) {
      sources.push({
        mapId: slime.mapId,
        x: slime.x,
        y: slime.y - 6,
        radius: 13,
        chance: 0.42
      });
    }
  }

  for (const enemy of [
    ...sharedGoblins,
    ...sharedGhosts
  ]) {
    if (enemy.alive && enemy.burnTime > 0) {
      sources.push({
        mapId: enemy.mapId,
        x: enemy.x,
        y: enemy.y - 11,
        radius: 13,
        chance:
          enemy.type === "ghost"
            ? 0.38
            : 0.42
      });
    }
  }

  for (const playerState of players.values()) {
    if (playerState.burnTime > 0) {
      sources.push({
        mapId: playerState.mapId,
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
      source.radius
    );

    igniteServerLivingNear(
      source.mapId,
      source.x,
      source.y,
      Math.max(
        11,
        source.radius - 1
      )
    );
  }
}

function tickSharedEnvironment(dt) {
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
        entity.canopyBurned = true;
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
        entity.cut = true;
        entity.burnt = true;

        if (entity.kind === "flower") {
          entity.looted = true;
        }

        markEnvironmentDirty(entity);
      }
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
  if (!playerState) return;

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
        radius
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
        [0, 4],
        5,
        8,
        0.94
      )
    ) {
      return;
    }

    entity.cut = true;
    entity.burnTime = 0;
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
        [0, 4],
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
    phase = 0
  } = spawn;

  return {
    id,
    mapId,
    type: "goblin",

    x,
    y,
    homeX: x,
    homeY: y,
    dir: 1,
    phase,

    speed: 19,
    chaseSpeed: 31,
    detectionRadius: 82,
    leashRadius: 110,

    aggroTime: 0,
    aggroDuration: 5.0,

    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0,
    wanderRadiusX: 24,
    wanderRadiusY: 18,

    maxHp: 60,
    hp: 60,
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

    lastDamagePlayerId: null
  };
}

function makeServerGhost(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0
  } = spawn;

  return {
    id,
    mapId,
    type: "ghost",

    x,
    y,
    homeX: x,
    homeY: y,
    dir: 1,
    phase,

    speed: 9,
    chaseSpeed: 27,
    detectionRadius: 96,
    leashRadius: 125,

    aggroTime: 0,
    aggroDuration: 5.5,

    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0.8 + Math.random() * 1.2,

    maxHp: 90,
    hp: 90,
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

    lastDamagePlayerId: null
  };
}

const sharedGoblins =
  enemySpawnsOfType("goblin")
    .map(makeServerGoblin);

const sharedGhosts =
  enemySpawnsOfType("ghost")
    .map(makeServerGhost);

const sharedEnemyCollections = {
  goblin: sharedGoblins,
  ghost: sharedGhosts
};

const sharedEnemyActionRateLimits = new Map();
const playerEnemyContactCooldowns = new Map();

function sharedEnemySnapshot(enemyType) {
  const collection =
    sharedEnemyCollections[enemyType] || [];

  return collection.map(enemy => ({
    id: enemy.id,
    mapId: enemy.mapId,
    x: Number(enemy.x.toFixed(2)),
    y: Number(enemy.y.toFixed(2)),
    dir: enemy.dir,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    alive: enemy.alive,
    burnTime: Number(enemy.burnTime.toFixed(2)),
    respawnTime: Number(enemy.respawnTime.toFixed(2)),

    ...(enemyType === "goblin"
      ? {
          moving: enemy.moving,
          walkTime: Number(
            enemy.walkTime.toFixed(3)
          ),
          lungeTime: Number(
            enemy.lungeTime.toFixed(3)
          ),
          lungeDirX: enemy.lungeDirX,
          lungeDirY: enemy.lungeDirY
        }
      : {})
  }));
}

function broadcastSharedEnemySnapshots() {
  for (const enemyType of ["goblin", "ghost"]) {
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
  const nextX =
    goblin.x + moveX * speed * dt;

  const nextY =
    goblin.y + moveY * speed * dt;

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
  ghost.wanderAngle =
    Math.random() * Math.PI * 2;

  ghost.wanderTimer =
    0.8 + Math.random() * 1.2;

  ghost.burnTime = 0;
  ghost.burnTickTimer = 0;

  ghost.knockbackX = 0;
  ghost.knockbackY = 0;

  ghost.tauntTime = 0;
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
  } else if (source === "graveGhost") {
    damage =
      9 + Math.floor(Math.random() * 5);

    minimumMs = 500;
    contactCooldown = 0.55;

    const nx = clampNumber(
      payload.nx,
      -1,
      1,
      0
    );

    const ny = clampNumber(
      payload.ny,
      -1,
      1,
      0
    );

    knockbackX = nx * 96;
    knockbackY = ny * 96;
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
  target.mapId = "spawn";

  target.x = clampNumber(
    message.x,
    0,
    640,
    320
  );

  target.y = clampNumber(
    message.y,
    0,
    400,
    200
  );

  target.burnTime = 0;
  target.shadowHidden = false;

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

function tickEnemyBurn(enemy, dt) {
  if (enemy.burnTime <= 0 || !enemy.alive) {
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
  enemy.burnTime = 0;
  enemy.burnTickTimer = 0;
  enemy.knockbackX = 0;
  enemy.knockbackY = 0;

  if (enemy.type === "goblin") {
    enemy.respawnTime = 4.0;
    enemy.lungeTime = 0;
    enemy.moving = false;

    if (Math.random() < 0.50) {
      spawnSharedCoin(
        enemy.mapId,
        enemy.x,
        enemy.y - 2
      );
    }
  } else {
    enemy.respawnTime = 6.0;
  }

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

    tickEnemyBurn(ghost, dt);
    if (!ghost.alive) continue;

    ghost.tauntTime = Math.max(
      0,
      ghost.tauntTime - dt
    );

    if (ghost.aggroTime > 0) {
      ghost.aggroTime = Math.max(
        0,
        ghost.aggroTime - dt
      );
    }

    let targetX = null;
    let targetY = null;
    let targetPlayer = null;

    if (ghost.tauntTime > 0) {
      targetX = ghost.tauntX;
      targetY = ghost.tauntY;
      ghost.aggroTime = ghost.aggroDuration;
    } else {
      const nearby = nearestVisiblePlayer(
        ghost.mapId,
        ghost.x,
        ghost.y,
        ghost.detectionRadius
      );

      if (nearby) {
        targetPlayer = nearby.player;
        ghost.aggroTime = ghost.aggroDuration;
      } else if (ghost.aggroTime > 0) {
        const anyTarget = nearestVisiblePlayer(
          ghost.mapId,
          ghost.x,
          ghost.y
        );

        if (anyTarget) {
          targetPlayer = anyTarget.player;
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

    if (
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

    // Ghosts intentionally phase through terrain.
    ghost.x += moveX * speed * dt;
    ghost.y += moveY * speed * dt;

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

    const contact = nearestVisiblePlayer(
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
        9 + Math.floor(Math.random() * 5);

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

    tickEnemyBurn(goblin, dt);
    if (!goblin.alive) continue;

    goblin.moving = false;

    if (goblin.lungeTime > 0) {
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
              6 + Math.floor(Math.random() * 5);

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
        const nearby = nearestVisiblePlayer(
          goblin.mapId,
          goblin.x,
          goblin.y,
          goblin.detectionRadius
        );

        if (nearby) {
          targetPlayer = nearby.player;
          goblin.aggroTime =
            goblin.aggroDuration;
        } else if (goblin.aggroTime > 0) {
          const anyTarget = nearestVisiblePlayer(
            goblin.mapId,
            goblin.x,
            goblin.y
          );

          if (anyTarget) {
            targetPlayer = anyTarget.player;
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
        distanceFromHome < goblin.leashRadius &&
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
          distanceFromHome >= goblin.leashRadius
        ) {
          goblin.aggroTime = 0;
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
  if (![0, 1, 4].includes(playerState.weaponIndex)) {
    return false;
  }

  const reach =
    playerState.weaponIndex === 4 ? 27 : 22;

  const targetOffsetY =
    enemy.type === "goblin" ? 11 : 11;

  const bodyRadius =
    enemy.type === "ghost" ? 8 : 7;

  const dx =
    enemy.x - playerState.x;

  const dy =
    (enemy.y - targetOffsetY) -
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

function handleSharedEnemyDamageAction(
  playerId,
  enemy,
  payload
) {
  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.mapId !== enemy.mapId ||
    !enemy.alive
  ) {
    return;
  }

  const source =
    String(payload.source || "");

  let damage = 0;
  let critical = false;
  let knockback = 0;
  let minimumMs = 180;

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

    const baseDamage =
      8 + Math.floor(Math.random() * 5);

    critical = Boolean(payload.critical);

    damage = critical
      ? Math.ceil(baseDamage * 1.75)
      : baseDamage;

    knockback =
      enemy.type === "goblin" ? 28 : 22;
  } else if (source === "basic") {
    if (
      ![2, 3].includes(playerState.weaponIndex) ||
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 190
    ) {
      return;
    }

    damage =
      5 + Math.floor(Math.random() * 3);

    knockback =
      enemy.type === "goblin" ? 17 : 14;
  } else if (source === "fireball") {
    if (
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 260
    ) {
      return;
    }

    damage =
      6 + Math.floor(Math.random() * 4);

    knockback =
      enemy.type === "goblin" ? 22 : 18;
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

  enemy.aggroTime = enemy.aggroDuration;
  enemy.lastDamagePlayerId = playerId;

  if (source === "fireball") {
    enemy.burnTime = 3.0;
    enemy.burnTickTimer =
      enemy.burnTickInterval;
  }

  let pushAngle = Number(payload.aimAngle);

  if (!Number.isFinite(pushAngle)) {
    pushAngle = Math.atan2(
      enemy.y - playerState.y,
      enemy.x - playerState.x
    );
  }

  enemy.knockbackX =
    Math.cos(pushAngle) * knockback;

  enemy.knockbackY =
    Math.sin(pushAngle) * knockback;

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
  if (!playerState) return;

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
    playerState.mapId !== enemy.mapId
  ) {
    return;
  }

  if (
    sharedEnemyActionRateLimited(
      playerId,
      enemy.id,
      action,
      action === "rainHeal" ||
      action === "rainDamage"
        ? 400
        : 250
    )
  ) {
    return;
  }

  if (action === "ignite") {
    if (!enemy.alive) return;

    enemy.burnTime = 3.0;
    enemy.burnTickTimer =
      enemy.burnTickInterval;

    enemy.aggroTime =
      enemy.aggroDuration;

    enemy.lastDamagePlayerId = playerId;
    return;
  }

  if (action === "extinguish") {
    enemy.burnTime = 0;
    enemy.burnTickTimer = 0;
    return;
  }

  if (action === "taunt") {
    if (!enemy.alive) return;

    enemy.tauntX = clampNumber(
      payload.x,
      0,
      640,
      enemy.x
    );

    enemy.tauntY = clampNumber(
      payload.y,
      0,
      400,
      enemy.y
    );

    enemy.tauntTime = 4.8;
    enemy.aggroTime = enemy.aggroDuration;
    return;
  }

  if (
    action === "rainHeal" &&
    enemy.type === "goblin"
  ) {
    if (!enemy.alive) return;

    const power = Math.round(
      clampNumber(payload.power, 1, 3, 2)
    );

    const before = enemy.hp;

    enemy.hp = Math.min(
      enemy.maxHp,
      enemy.hp + power
    );

    enemy.burnTime = 0;
    enemy.burnTickTimer = 0;

    const healed = enemy.hp - before;

    if (healed > 0) {
      broadcast({
        type: "enemyHeal",
        enemyType: enemy.type,
        enemyId: enemy.id,
        mapId: enemy.mapId,
        amount: healed,
        hp: enemy.hp
      });
    }

    return;
  }

  if (
    action === "rainDamage" &&
    enemy.type === "ghost"
  ) {
    if (!enemy.alive) return;

    const damage = Math.round(
      clampNumber(payload.power, 1, 3, 2)
    );

    enemy.hp = Math.max(
      0,
      enemy.hp - damage
    );

    enemy.burnTime = 0;
    enemy.burnTickTimer = 0;

    enemy.aggroTime = enemy.aggroDuration;
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

function makeServerSlime(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    wanderRadiusX = 26,
    wanderRadiusY = 18
  } = spawn;

  return {
    id,
    mapId,
    type: "slime",

    x,
    y,
    homeX: x,
    homeY: y,

    dir: 1,
    phase,

    speed: 16,
    chaseSpeed: 22,

    aggroTime: 0,

    // Jester Blink decoy. While active, the clone position has priority over
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

    maxHp: 40,
    hp: 40,
    alive: true,
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

const sharedSlimes =
  enemySpawnsOfType("slime")
    .map(makeServerSlime);

// One authoritative registry across maps and enemy species.
const worldEntitiesById = new Map();

const worldEntitiesByType = new Map([
  ["slime", sharedSlimes],
  ["goblin", sharedGoblins],
  ["ghost", sharedGhosts]
]);

const worldEntitiesByMap = new Map();

for (const [type, entities] of worldEntitiesByType) {
  for (const entity of entities) {
    if (worldEntitiesById.has(entity.id)) {
      throw new Error(
        `Duplicate runtime entity id: ${entity.id}`
      );
    }

    worldEntitiesById.set(entity.id, entity);

    if (!worldEntitiesByMap.has(entity.mapId)) {
      worldEntitiesByMap.set(entity.mapId, []);
    }

    worldEntitiesByMap
      .get(entity.mapId)
      .push(entity);
  }
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

const slimeActionRateLimits = new Map();

function slimeSnapshot() {
  return sharedSlimes.map(slime => ({
    id: slime.id,
    mapId: slime.mapId,
    type: slime.type,
    x: Number(slime.x.toFixed(2)),
    y: Number(slime.y.toFixed(2)),
    dir: slime.dir,
    hp: slime.hp,
    maxHp: slime.maxHp,
    alive: slime.alive,
    burnTime: Number(slime.burnTime.toFixed(2)),
    respawnTime: Number(slime.respawnTime.toFixed(2)),

    carriedBy: slime.carriedBy,
    pickupTime: Number(slime.pickupTime.toFixed(3)),
    pickupDuration: slime.pickupDuration,
    pickupDirX: Number(slime.pickupDirX.toFixed(3)),
    pickupDirY: Number(slime.pickupDirY.toFixed(3)),
    hurlTime: Number(slime.hurlTime.toFixed(3)),
    hurlDuration: slime.hurlDuration
  }));
}

function broadcastSlimeSnapshot() {
  broadcast({
    type: "slimeSnapshot",
    slimes: slimeSnapshot()
  });
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
  if (
    x < 10 ||
    x > 630 ||
    y < 18 ||
    y > 392
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
  const nextX = slime.x + moveX * speed * dt;
  const nextY = slime.y + moveY * speed * dt;

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

  slime.carriedBy = null;
  slime.pickupTime = 0;
  slime.pickupDirX = 0;
  slime.pickupDirY = 0;
  slime.hurlTime = 0;
  slime.hurlVelocityX = 0;
  slime.hurlVelocityY = 0;
  slime.hurlThrownBy = null;

  slime.lastDamagePlayerId = null;
}

function killServerSlime(slime, killerId = null) {
  if (!slime.alive) return;

  slime.hp = 0;
  slime.alive = false;
  slime.respawnTime = 2.0;
  slime.burnTime = 0;
  slime.burnTickTimer = 0;
  slime.knockbackX = 0;
  slime.knockbackY = 0;

  slime.carriedBy = null;
  slime.pickupTime = 0;
  slime.pickupDirX = 0;
  slime.pickupDirY = 0;
  slime.hurlTime = 0;
  slime.hurlVelocityX = 0;
  slime.hurlVelocityY = 0;
  slime.hurlThrownBy = null;

  const droppedCoin = Math.random() < 0.45;

  if (droppedCoin) {
    spawnSharedCoin(
      slime.mapId,
      slime.x,
      slime.y - 2
    );
  }

  broadcast({
    type: "slimeKilled",
    slimeId: slime.id,
    killerId,
    coinDrop: droppedCoin,
    mapId: slime.mapId,
    x: slime.x,
    y: slime.y
  });
}


function broadcastHurlSlimeDamage(
  slime,
  amount,
  attackerId,
  source = "hurl"
) {
  if (!slime.alive || amount <= 0) {
    return;
  }

  slime.hp = Math.max(
    0,
    slime.hp - amount
  );

  slime.lastDamagePlayerId =
    attackerId;

  slime.aggroTime =
    Math.max(
      slime.aggroTime,
      4.5
    );

  broadcast({
    type: "slimeDamage",
    slimeId: slime.id,
    amount,
    hp: slime.hp,
    critical: false,
    source,
    attackerId,
    mapId: slime.mapId
  });

  if (slime.hp <= 0) {
    killServerSlime(
      slime,
      attackerId
    );
  }
}

function broadcastHurlGoblinDamage(
  goblin,
  amount,
  attackerId,
  velocityX,
  velocityY
) {
  if (!goblin.alive || amount <= 0) {
    return;
  }

  goblin.hp = Math.max(
    0,
    goblin.hp - amount
  );

  goblin.lastDamagePlayerId =
    attackerId;

  goblin.aggroTime =
    goblin.aggroDuration;

  const speed =
    Math.hypot(
      velocityX,
      velocityY
    ) || 1;

  goblin.knockbackX =
    velocityX / speed * 58;

  goblin.knockbackY =
    velocityY / speed * 58;

  broadcast({
    type: "enemyDamage",
    enemyType: "goblin",
    enemyId: goblin.id,
    mapId: goblin.mapId,
    amount,
    hp: goblin.hp,
    critical: false,
    source: "hurl",
    attackerId
  });

  if (goblin.hp <= 0) {
    killSharedEnemy(
      goblin,
      attackerId
    );
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

  for (
    const entity
    of sharedEnvironment.values()
  ) {
    if (
      entity.mapId !== mapId ||
      entity.kind !== "tree" ||
      entity.isStump ||
      entity.falling
    ) {
      continue;
    }

    const distance = Math.hypot(
      entity.x - x,
      entity.y - y
    );

    if (
      distance <= 12 &&
      distance < bestDistance
    ) {
      bestTree = entity;
      bestDistance = distance;
    }
  }

  if (!bestTree) {
    return false;
  }

  bestTree.hp = Math.max(
    0,
    bestTree.hp - 1
  );

  bestTree.lastHitPlayerId =
    attackerId;

  markEnvironmentDirty(
    bestTree
  );

  if (bestTree.hp <= 0) {
    bestTree.falling = true;
    bestTree.fallTime =
      bestTree.fallDuration;

    bestTree.fallDirection =
      directionX >= 0
        ? 1
        : -1;

    markEnvironmentDirty(
      bestTree
    );
  }

  return true;
}

function finishServerSlimeHurl(
  slime,
  attackerId,
  landingDamage = true
) {
  if (!slime.alive) return;

  const velocityX =
    slime.hurlVelocityX;

  const velocityY =
    slime.hurlVelocityY;

  slime.carriedBy = null;
  slime.hurlTime = 0;
  slime.hurlVelocityX = 0;
  slime.hurlVelocityY = 0;
  slime.hurlThrownBy = null;

  const speed =
    Math.hypot(
      velocityX,
      velocityY
    ) || 1;

  slime.knockbackX =
    velocityX / speed * 24;

  slime.knockbackY =
    velocityY / speed * 24;

  if (landingDamage) {
    broadcastHurlSlimeDamage(
      slime,
      4 + Math.floor(Math.random() * 4),
      attackerId,
      "hurlLanding"
    );
  }
}

function tryHurlCollision(
  slime
) {
  const attackerId =
    slime.hurlThrownBy;

  const velocityX =
    slime.hurlVelocityX;

  const velocityY =
    slime.hurlVelocityY;

  for (const target of sharedSlimes) {
    if (
      target === slime ||
      !target.alive ||
      target.carriedBy ||
      target.hurlTime > 0 ||
      target.mapId !== slime.mapId
    ) {
      continue;
    }

    if (
      Math.hypot(
        target.x - slime.x,
        target.y - slime.y
      ) > 10
    ) {
      continue;
    }

    const speed =
      Math.hypot(
        velocityX,
        velocityY
      ) || 1;

    target.knockbackX =
      velocityX / speed * 58;

    target.knockbackY =
      velocityY / speed * 58;

    broadcastHurlSlimeDamage(
      target,
      8 + Math.floor(Math.random() * 5),
      attackerId,
      "hurl"
    );

    finishServerSlimeHurl(
      slime,
      attackerId,
      true
    );

    return true;
  }

  for (const goblin of sharedGoblins) {
    if (
      !goblin.alive ||
      goblin.mapId !== slime.mapId
    ) {
      continue;
    }

    if (
      Math.hypot(
        goblin.x - slime.x,
        goblin.y - slime.y
      ) > 11
    ) {
      continue;
    }

    broadcastHurlGoblinDamage(
      goblin,
      8 + Math.floor(Math.random() * 5),
      attackerId,
      velocityX,
      velocityY
    );

    finishServerSlimeHurl(
      slime,
      attackerId,
      true
    );

    return true;
  }

  if (
    damageTreeFromHurl(
      slime.mapId,
      slime.x,
      slime.y,
      attackerId,
      velocityX
    )
  ) {
    finishServerSlimeHurl(
      slime,
      attackerId,
      true
    );

    return true;
  }

  return false;
}

function tickServerSlimeHurl(
  slime,
  dt
) {
  if (slime.carriedBy) {
    const carrier =
      players.get(slime.carriedBy);

    if (
      !carrier ||
      carrier.hp <= 0 ||
      carrier.mapId !== slime.mapId
    ) {
      slime.carriedBy = null;
      slime.pickupTime = 0;
      slime.pickupDirX = 0;
      slime.pickupDirY = 0;
      slime.hurlThrownBy = null;
      return false;
    }

    slime.x = carrier.x;
    slime.y = carrier.y;

    slime.pickupTime = Math.max(
      0,
      slime.pickupTime - dt
    );

    slime.knockbackX = 0;
    slime.knockbackY = 0;
    slime.aggroTime = 0;
    slime.tauntTime = 0;

    return true;
  }

  if (slime.hurlTime <= 0) {
    return false;
  }

  slime.hurlTime =
    Math.max(
      0,
      slime.hurlTime - dt
    );

  const nextX =
    slime.x +
    slime.hurlVelocityX * dt;

  const nextY =
    slime.y +
    slime.hurlVelocityY * dt;

  if (
    !slimePositionAllowed(
      slime,
      nextX,
      nextY
    )
  ) {
    finishServerSlimeHurl(
      slime,
      slime.hurlThrownBy,
      true
    );

    return true;
  }

  slime.x = nextX;
  slime.y = nextY;

  if (tryHurlCollision(slime)) {
    return true;
  }

  if (slime.hurlTime <= 0) {
    finishServerSlimeHurl(
      slime,
      slime.hurlThrownBy,
      true
    );

    return true;
  }

  return true;
}

function handleSlimeHurlAction(
  playerId,
  slime,
  action,
  payload
) {
  const playerState =
    players.get(playerId);

  if (
    !playerState ||
    playerState.hp <= 0 ||
    playerState.mapId !== slime.mapId ||
    !slime.alive
  ) {
    return;
  }

  if (action === "hurlGrab") {
    if (
      slime.carriedBy ||
      slime.hurlTime > 0
    ) {
      return;
    }

    if (
      sharedSlimes.some(
        candidate =>
          candidate.carriedBy === playerId
      )
    ) {
      return;
    }

    const distance = Math.hypot(
      slime.x - playerState.x,
      slime.y - playerState.y
    );

    if (distance > 24) {
      return;
    }

    if (
      actionRateLimited(
        playerId,
        slime.id,
        "hurlGrab",
        300
      )
    ) {
      return;
    }

    const pickupDx =
      slime.x - playerState.x;
    const pickupDy =
      slime.y - playerState.y;
    const pickupLength =
      Math.hypot(pickupDx, pickupDy) || 1;

    slime.carriedBy = playerId;
    slime.pickupTime =
      slime.pickupDuration;
    slime.pickupDirX =
      pickupDx / pickupLength;
    slime.pickupDirY =
      pickupDy / pickupLength;
    slime.hurlTime = 0;
    slime.hurlVelocityX = 0;
    slime.hurlVelocityY = 0;
    slime.hurlThrownBy = null;
    slime.knockbackX = 0;
    slime.knockbackY = 0;
    slime.aggroTime = 0;
    slime.tauntTime = 0;

    return;
  }

  if (action === "hurlThrow") {
    if (
      slime.carriedBy !== playerId
    ) {
      return;
    }

    const aimAngle =
      Number(payload.aimAngle);

    if (!Number.isFinite(aimAngle)) {
      return;
    }

    if (
      actionRateLimited(
        playerId,
        slime.id,
        "hurlThrow",
        220
      )
    ) {
      return;
    }

    const throwSpeed = 126;

    slime.carriedBy = null;
    slime.pickupTime = 0;
    slime.pickupDirX = 0;
    slime.pickupDirY = 0;
    slime.hurlTime =
      slime.hurlDuration;

    slime.hurlVelocityX =
      Math.cos(aimAngle) *
      throwSpeed;

    slime.hurlVelocityY =
      Math.sin(aimAngle) *
      throwSpeed;

    slime.hurlThrownBy =
      playerId;

    slime.lastDamagePlayerId =
      playerId;

    slime.aggroTime = 0;
    slime.tauntTime = 0;
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
    4 + Math.floor(Math.random() * 4);

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

function tickSharedSlimes(dt) {
  for (const slime of sharedSlimes) {
    if (!slime.alive) {
      slime.respawnTime -= dt;

      if (slime.respawnTime <= 0) {
        resetServerSlime(slime);
      }

      continue;
    }

    if (slime.burnTime > 0) {
      slime.burnTime -= dt;
      slime.burnTickTimer -= dt;

      while (
        slime.burnTickTimer <= 0 &&
        slime.burnTime > 0 &&
        slime.alive
      ) {
        const damage = 2;
        slime.hp = Math.max(0, slime.hp - damage);
        slime.burnTickTimer += slime.burnTickInterval;

        broadcast({
          type: "slimeDamage",
          slimeId: slime.id,
          amount: damage,
          hp: slime.hp,
          critical: false,
          source: "burn",
          mapId: slime.mapId
        });

        if (slime.hp <= 0) {
          killServerSlime(
            slime,
            slime.lastDamagePlayerId
          );
          break;
        }
      }

      if (slime.burnTime <= 0) {
        slime.burnTime = 0;
        slime.burnTickTimer = 0;
      }
    }

    if (!slime.alive) continue;

    if (
      tickServerSlimeHurl(
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
      }
    }

    tryServerSlimeContact(slime);

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

    const distanceFromHome = Math.hypot(
      slime.x - slime.homeX,
      slime.y - slime.homeY
    );

    // The decoy has absolute priority while it exists.
    if (
      slime.tauntTime > 0 &&
      distanceFromHome < 90
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

      // Even if it reaches the clone, remain occupied by it until the clone
      // expires instead of immediately acquiring the player again.
      continue;
    }

    const target =
      nearestPlayerForSlime(slime);

    if (
      slime.aggroTime > 0 &&
      target &&
      target.distance > 1 &&
      distanceFromHome < 90
    ) {
      const dx =
        target.player.x - slime.x;

      const dy =
        target.player.y - slime.y;

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

    if (distanceFromHome >= 90) {
      slime.aggroTime = 0;
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

function actionRateLimited(playerId, slimeId, action, minimumMs) {
  const key = `${playerId}:${slimeId}:${action}`;
  const now = Date.now();
  const previous = slimeActionRateLimits.get(key) || 0;

  if (now - previous < minimumMs) {
    return true;
  }

  slimeActionRateLimits.set(key, now);
  return false;
}

function angleDifference(a, b) {
  let diff = a - b;

  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  return diff;
}

function validateMeleeSlimeHit(playerState, slime, payload) {
  const weaponIndex = playerState.weaponIndex;

  if (![0, 1, 4].includes(weaponIndex)) {
    return false;
  }

  const reach = weaponIndex === 4 ? 27 : 22;
  const originX = playerState.x;
  const originY = playerState.y - 8;
  const targetX = slime.x;
  const targetY = slime.y - 6;

  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.hypot(dx, dy);

  if (distance > reach + 7) return false;

  const aimAngle = Number(payload.aimAngle);
  if (!Number.isFinite(aimAngle)) return false;

  const targetAngle = Math.atan2(dy, dx);

  return (
    Math.abs(angleDifference(targetAngle, aimAngle))
    <= 0.90
  );
}

function handleSlimeDamageAction(playerId, slime, payload) {
  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.mapId !== slime.mapId
  ) {
    return;
  }

  if (
    !slime.alive ||
    slime.carriedBy
  ) {
    return;
  }

  const source = String(payload.source || "");
  let damage = 0;
  let critical = false;
  let knockback = 0;
  let minimumMs = 180;

  if (source === "melee") {
    if (!validateMeleeSlimeHit(playerState, slime, payload)) {
      return;
    }

    minimumMs = 260;

    const baseDamage =
      8 + Math.floor(Math.random() * 5);

    critical = Boolean(payload.critical);
    damage = critical
      ? Math.ceil(baseDamage * 1.75)
      : baseDamage;

    knockback = 32;
  } else if (source === "basic") {
    if (
      ![2, 3].includes(playerState.weaponIndex) ||
      Math.hypot(
        slime.x - playerState.x,
        slime.y - playerState.y
      ) > 190
    ) {
      return;
    }

    damage = 5 + Math.floor(Math.random() * 3);
    knockback = 18;
  } else if (source === "fireball") {
    if (
      Math.hypot(
        slime.x - playerState.x,
        slime.y - playerState.y
      ) > 260
    ) {
      return;
    }

    damage = 6 + Math.floor(Math.random() * 4);
    knockback = 24;
  } else {
    return;
  }

  if (
    actionRateLimited(
      playerId,
      slime.id,
      `damage:${source}`,
      minimumMs
    )
  ) {
    return;
  }

  slime.hp = Math.max(0, slime.hp - damage);
  slime.aggroTime = 4.5;
  slime.lastDamagePlayerId = playerId;

  if (source === "fireball") {
    slime.burnTime = 3.0;
    slime.burnTickTimer = slime.burnTickInterval;
  }

  let pushAngle = Number(payload.aimAngle);

  if (!Number.isFinite(pushAngle)) {
    pushAngle = Math.atan2(
      slime.y - playerState.y,
      slime.x - playerState.x
    );
  }

  slime.knockbackX = Math.cos(pushAngle) * knockback;
  slime.knockbackY = Math.sin(pushAngle) * knockback;

  broadcast({
    type: "slimeDamage",
    slimeId: slime.id,
    amount: damage,
    hp: slime.hp,
    critical,
    source,
    attackerId: playerId,
    mapId: slime.mapId
  });

  if (slime.hp <= 0) {
    killServerSlime(slime, playerId);
  }
}

function handleSlimeAction(playerId, message) {
  const slime = getWorldEntity(
    message.slimeId,
    "slime"
  );

  if (!slime) return;

  const playerState = players.get(playerId);
  if (!playerState) return;

  const action = String(message.action || "");
  const payload =
    message.payload && typeof message.payload === "object"
      ? message.payload
      : {};

  if (action === "damage") {
    handleSlimeDamageAction(playerId, slime, payload);
    return;
  }

  if (
    action === "hurlGrab" ||
    action === "hurlThrow"
  ) {
    handleSlimeHurlAction(
      playerId,
      slime,
      action,
      payload
    );

    return;
  }

  if (
    actionRateLimited(
      playerId,
      slime.id,
      action,
      action === "rainHeal" ? 400 : 250
    )
  ) {
    return;
  }

  if (action === "ignite") {
    if (
      !slime.alive ||
      slime.carriedBy
    ) {
      return;
    }

    slime.burnTime = 3.0;
    slime.burnTickTimer = slime.burnTickInterval;
    slime.aggroTime = 4.5;
    slime.lastDamagePlayerId = playerId;
    return;
  }

  if (action === "extinguish") {
    slime.burnTime = 0;
    slime.burnTickTimer = 0;
    return;
  }

  if (action === "taunt") {
    if (
      !slime.alive ||
      slime.carriedBy ||
      slime.hurlTime > 0 ||
      playerState.mapId !== slime.mapId
    ) {
      return;
    }

    const tauntX = clampNumber(
      payload.x,
      0,
      640,
      slime.x
    );

    const tauntY = clampNumber(
      payload.y,
      0,
      400,
      slime.y
    );

    // Re-check the clone/slime distance server-side. The client only sends
    // this for slimes inside the 120 px Jester taunt radius.
    if (
      Math.hypot(
        slime.x - tauntX,
        slime.y - tauntY
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

    slime.tauntX = tauntX;
    slime.tauntY = tauntY;
    slime.tauntTime = duration;
    slime.tauntOwnerId = playerId;

    slime.aggroTime = Math.max(
      slime.aggroTime,
      duration
    );

    return;
  }

  if (action === "rainHeal") {
    if (!slime.alive) return;

    const requestedPower = Math.round(
      clampNumber(payload.power, 1, 3, 2)
    );

    const before = slime.hp;
    slime.hp = Math.min(
      slime.maxHp,
      slime.hp + requestedPower
    );

    slime.burnTime = 0;
    slime.burnTickTimer = 0;

    const healed = slime.hp - before;

    if (healed > 0) {
      broadcast({
        type: "slimeHeal",
        slimeId: slime.id,
        amount: healed,
        hp: slime.hp,
        mapId: slime.mapId
      });
    }
  }
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

  tickSharedSlimes(dt);
  tickSharedGoblins(dt);
  tickSharedGhosts(dt);
  tickSharedEnvironment(dt);
  tickSharedResources(dt);
  tickSharedCoins(dt);
}, 1000 / 30);

setInterval(() => {
  flushEnvironmentPatches();
}, 1000 / 10);

setInterval(() => {
  broadcastSlimeSnapshot();
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
  return clampNumber(value, -220, 220, 0);
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

  if (effect === "fireball") {
    return {
      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y),
      vx: sanitizeVisualVelocity(payload.vx),
      vy: sanitizeVisualVelocity(payload.vy),

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
          : "wand",

      x: sanitizeVisualPoint(payload.x),
      y: sanitizeVisualPoint(payload.y)
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

      cloudLife: clampNumber(
        payload.cloudLife,
        4,
        24,
        12
      )
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
        0,
        5,
        0
      ),

      shirtIndex: clampInteger(
        payload.shirtIndex,
        0,
        3,
        0
      ),

      pantsIndex: clampInteger(
        payload.pantsIndex,
        0,
        3,
        0
      )
    };
  }

  return null;
}

function handleVisualEffect(
  playerId,
  socket,
  message
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  const effect = String(message.effect || "");

  const allowedEffects = new Set([
    "basicProjectile",
    "basicProjectileImpact",
    "fireball",
    "fireballImpact",
    "levelUp",
    "rainCast",
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
  const mapId = ALLOWED_MAPS.has(source.mapId)
    ? source.mapId
    : "spawn";

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

    maxHp: previous && Number.isFinite(previous.maxHp)
      ? previous.maxHp
      : 50,

    hp: previous && Number.isFinite(previous.hp)
      ? previous.hp
      : 50,

    x: clampNumber(source.x, 0, 640, 320),
    y: clampNumber(source.y, 0, 400, 200),

    hatIndex: clampInteger(source.hatIndex, 0, 5, 0),
    shirtIndex: clampInteger(source.shirtIndex, 0, 3, 0),
    pantsIndex: clampInteger(source.pantsIndex, 0, 3, 0),
    weaponIndex: clampInteger(source.weaponIndex, -1, 4, -1),

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
      players: players.size,
      sharedEntities: worldEntitiesById.size,
      sharedSlimes: sharedSlimes.length,
      sharedGoblins: sharedGoblins.length,
      sharedGhosts: sharedGhosts.length,
      sharedEnvironment: sharedEnvironment.size,
      sharedResources: sharedResources.size,
      sharedCoins: sharedCoins.size
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
      "Cache-Control": "no-cache"
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
    x: 320,
    y: 200,
    weaponIndex: -1
  });

  players.set(id, initialState);

  sendJson(socket, {
    type: "welcome",
    id,
    coins: initialState.coins,
    wood: initialState.wood,
    flowers: initialState.flowers,
    hp: initialState.hp,
    maxHp: initialState.maxHp
  });

  sendJson(socket, {
    type: "snapshot",
    players: [...players.values()]
  });

  sendJson(socket, {
    type: "slimeSnapshot",
    slimes: slimeSnapshot()
  });

  sendJson(socket, {
    type: "enemySnapshot",
    enemyType: "goblin",
    enemies: sharedEnemySnapshot("goblin")
  });

  sendJson(socket, {
    type: "enemySnapshot",
    enemyType: "ghost",
    enemies: sharedEnemySnapshot("ghost")
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
      const cleanState = sanitizePlayerState(
        id,
        message.player,
        players.get(id)
      );

      players.set(id, cleanState);

      broadcast({
        type: "playerState",
        player: cleanState
      }, socket);

      return;
    }

    if (message.type === "slimeAction") {
      handleSlimeAction(id, message);
      return;
    }

    if (message.type === "enemyAction") {
      handleSharedEnemyAction(id, message);
      return;
    }

    if (message.type === "playerDamageRequest") {
      handlePlayerDamageRequest(id, message);
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

    if (
      message.type === "coinPickup" &&
      typeof message.coinId === "string"
    ) {
      handleCoinPickup(id, message.coinId);
    }
  });

  socket.on("close", () => {
    players.delete(id);

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
