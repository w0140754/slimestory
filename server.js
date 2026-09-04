const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const BUILD_VERSION = "6-11-373";
const ENEMY_KNOCKBACK_DAMAGE_THRESHOLD = 0.25;

const WORLD_CONTENT = require("./public/shared/world-content.js");
const TERRAIN_RULES = require("./public/shared/terrain-rules.js");
const COMBAT_BALANCE = require("./public/shared/combat-balance.js");
const RAIN_FIELD = require("./public/shared/rain-field.js");
const ABILITY_SCALING = require("./public/shared/ability-scaling.js");
const CAMOUFLAGE_RULES = require("./public/shared/camouflage-rules.js");
const ENEMY_NET_PROTOCOL = require("./public/shared/enemy-net-protocol.js");
const PLAYER_NET_PROTOCOL = require("./public/shared/player-net-protocol.js");
const {
  browserRuntimeWorldContentSource,
  injectRuntimeWorldContentUrl
} = require("./tools/runtime-world-content.js");

const ALLOWED_MAPS = new Set(
  Object.keys(WORLD_CONTENT.maps)
);

// -----------------------------------------------------------------------------
// LOCAL NETWORK / BANDWIDTH DIAGNOSTICS
// -----------------------------------------------------------------------------
// These counters are console-only: they do not create network traffic. The WS
// outbound figure is an estimate of bytes on the wire, including frame headers
// and a close approximation of permessage-deflate for messages >= 1 KB. HTTP
// bytes are counted after gzip/Brotli compression, so the combined OUT estimate
// is useful for comparing local builds even while Render is unavailable.
const NETWORK_DIAGNOSTICS_INTERVAL_MS = 15000;
const NETWORK_DIAGNOSTICS_TOP_TYPES = 6;
const WS_COMPRESSION_THRESHOLD = 1024;

function makeNetworkCounter() {
  return {
    wsOutWireBytes: 0,
    wsOutPayloadBytes: 0,
    wsOutDeliveries: 0,
    wsOutEvents: 0,
    wsOutEventPayloadBytes: 0,
    wsOutEventRecipients: 0,
    wsInPayloadBytes: 0,
    wsInMessages: 0,
    httpOutBytes: 0,
    byWsOutType: new Map(),
    byWsOutEventType: new Map(),
    byWsOutEnemyDamageSource: new Map(),
    byWsOutMap: new Map(),
    byWsInType: new Map(),
    byWsInEnemyActionSource: new Map(),
    byHttpPath: new Map()
  };
}

const networkTotals = makeNetworkCounter();
let networkPrevious = makeNetworkCounter();
let networkLastReportAt = Date.now();

// Fire-specific gameplay counters are intentionally console-only. They let us
// compare identical burn/spread tests between builds without adding packets.
function makeFireDiagnostics() {
  return {
    spreadPulses: 0,
    spreadSources: 0,
    environmentIgnitions: 0,
    rainGrassIgnitions: 0,
    enemyIgnitions: 0,
    playerIgnitions: 0,
    enemyDamageTicks: 0,
    playerDamageTicks: 0,
    legacyPlayerBurnDamageRequests: 0,
    legacyPlayerIgniteRequests: 0,
    legacyRainGrassStateReports: 0
  };
}

let fireDiagnostics = makeFireDiagnostics();

function makeRainDiagnostics() {
  return {
    fieldsCreated: 0, grassQueries: 0, grassCellChecks: 0, grassEnters: 0, grassExits: 0,
    enemyWetEnters: 0, enemyWetExits: 0, playerWetEnters: 0, playerWetExits: 0,
    cellIgnitions: 0, cellExtinguishes: 0, fieldDeltaEvents: 0, ghostDamageTicks: 0,
    legacyMagicGrassSlow: 0, legacyWet: 0, legacyRainDamage: 0
  };
}
let rainDiagnostics = makeRainDiagnostics();

function addMetric(map, key, bytes, count = 1, recipients = 0) {
  const label = String(key || "unknown");
  const current = map.get(label) || { bytes: 0, count: 0, recipients: 0 };
  current.bytes += Math.max(0, Number(bytes) || 0);
  current.count += Math.max(0, Number(count) || 0);
  current.recipients += Math.max(0, Number(recipients) || 0);
  map.set(label, current);
}

function websocketFrameOverhead(payloadBytes) {
  if (payloadBytes <= 125) return 2;
  if (payloadBytes <= 65535) return 4;
  return 10;
}

function encodedMessageType(encoded) {
  const match = /"type"\s*:\s*"([^"]+)"/.exec(encoded);
  return match?.[1] || "unknown";
}

function encodedMessageSource(encoded) {
  const match = /"source"\s*:\s*"([^"]+)"/.exec(encoded);
  return match?.[1] || "unknown";
}

function estimateWsWireBytes(socket, encoded) {
  const rawBytes = Buffer.byteLength(encoded);
  let payloadBytes = rawBytes;

  if (
    rawBytes >= WS_COMPRESSION_THRESHOLD &&
    String(socket?.extensions || "").includes("permessage-deflate")
  ) {
    try {
      // serverNoContextTakeover=true means each large message is independently
      // compressed, so a raw-deflate sample is a useful close wire estimate.
      payloadBytes = zlib.deflateRawSync(
        Buffer.from(encoded),
        { level: 4 }
      ).length;
    } catch {
      payloadBytes = rawBytes;
    }
  }

  return payloadBytes + websocketFrameOverhead(payloadBytes);
}

function recordWsOutbound(socket, encoded, type = null) {
  const payloadBytes = Buffer.byteLength(encoded);
  const wireBytes = estimateWsWireBytes(socket, encoded);
  const messageType = type || encodedMessageType(encoded);
  const playerState =
    typeof socket?.playerId === "string"
      ? players.get(socket.playerId)
      : null;
  const mapId = playerState?.mapId || "unassigned";

  networkTotals.wsOutPayloadBytes += payloadBytes;
  networkTotals.wsOutWireBytes += wireBytes;
  networkTotals.wsOutDeliveries += 1;
  addMetric(networkTotals.byWsOutType, messageType, wireBytes);
  if (messageType === "enemyDamage") {
    addMetric(
      networkTotals.byWsOutEnemyDamageSource,
      encodedMessageSource(encoded),
      wireBytes
    );
  }
  addMetric(networkTotals.byWsOutMap, mapId, wireBytes);
}

function recordWsLogicalOutbound(encoded, type = null, recipients = 1) {
  const recipientCount = Math.max(0, Number(recipients) || 0);
  if (!recipientCount) return;

  const payloadBytes = Buffer.byteLength(encoded);
  const messageType = type || encodedMessageType(encoded);

  networkTotals.wsOutEvents += 1;
  networkTotals.wsOutEventPayloadBytes += payloadBytes;
  networkTotals.wsOutEventRecipients += recipientCount;
  addMetric(
    networkTotals.byWsOutEventType,
    messageType,
    payloadBytes,
    1,
    recipientCount
  );
}

function recordWsInbound(raw, type = null, detail = null) {
  const payloadBytes = Buffer.isBuffer(raw)
    ? raw.length
    : Buffer.byteLength(String(raw || ""));

  const messageType = type || "unknown";
  networkTotals.wsInPayloadBytes += payloadBytes;
  networkTotals.wsInMessages += 1;
  addMetric(networkTotals.byWsInType, messageType, payloadBytes);

  if (messageType === "enemyAction" && detail) {
    addMetric(
      networkTotals.byWsInEnemyActionSource,
      detail,
      payloadBytes
    );
  }
}

function recordHttpOutbound(requestPath, bytes) {
  const count = Math.max(0, Number(bytes) || 0);
  if (!count) return;
  networkTotals.httpOutBytes += count;
  addMetric(networkTotals.byHttpPath, requestPath || "unknown", count);
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function projectedMbPerHour(bytes, elapsedMs) {
  if (!(elapsedMs > 0)) return 0;
  return bytes * (3600000 / elapsedMs) / (1024 * 1024);
}

function deltaMetricMap(current, previous) {
  const result = [];
  for (const [key, value] of current.entries()) {
    const old = previous.get(key) || { bytes: 0, count: 0, recipients: 0 };
    const bytes = value.bytes - old.bytes;
    const count = value.count - old.count;
    const recipients =
      (value.recipients || 0) - (old.recipients || 0);
    if (bytes > 0 || count > 0 || recipients > 0) {
      result.push({ key, bytes, count, recipients });
    }
  }
  return result.sort((a, b) => b.bytes - a.bytes);
}

function cloneMetricMap(source) {
  return new Map(
    [...source.entries()].map(([key, value]) => [key, { ...value }])
  );
}

function reportEnemyMotionDiagnostics(mapCounts) {
  if (typeof worldEntitiesById === "undefined") return;

  for (const [mapId, recipients] of Object.entries(mapCounts)) {
    let alive = 0;
    let precise = 0;
    let passive = 0;
    let nearestDistance = Infinity;
    const reasonCounts = new Map();

    const livingPlayers = [...players.values()].filter(player =>
      player.mapId === mapId && player.hp > 0
    );

    for (const enemy of worldEntitiesById.values()) {
      if (!enemy?.alive || enemy.mapId !== mapId) continue;
      alive += 1;

      for (const player of livingPlayers) {
        const dx = (Number(player.x) || 0) - (Number(enemy.x) || 0);
        const dy = (Number(player.y) || 0) - (Number(enemy.y) || 0);
        nearestDistance = Math.min(nearestDistance, Math.hypot(dx, dy));
      }

      const reasons = enemyPreciseMotionReasons(enemy);
      if (reasons.length) {
        precise += 1;
        for (const reason of reasons) {
          reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
        }
      } else {
        passive += 1;
      }
    }

    const reasonsText = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ") || "none";

    const nearestText = Number.isFinite(nearestDistance)
      ? `${nearestDistance.toFixed(1)}px`
      : "n/a";

    console.log(
      `[ENEMY NET] ${mapId} recipients=${recipients} alive=${alive} ` +
      `precise=${precise} passive=${passive} nearest=${nearestText} ` +
      `motion=${ENEMY_NETWORK_DELTA_HZ}Hz/compact state=bitmask+health | ` +
      `precise reasons: ${reasonsText}`
    );
  }
}

function reportPassiveEnemyNetworkDiagnostics(mapCounts) {
  // Only surface maps that currently have players; empty maps can continue
  // simulating server-side without cluttering the bandwidth report.
  const mapIds = Object.keys(mapCounts || {});

  for (const mapId of mapIds) {
    const diag = passiveEnemyNetworkDiagnostics.get(mapId);
    if (!diag) continue;

    const avgBatch =
      diag.sentEvents > 0
        ? diag.sentRecords / diag.sentEvents
        : 0;
    const promotionSamples = Math.max(0, Number(diag.promotionSamples) || 0);
    const avgPromotionAge =
      promotionSamples > 0
        ? diag.promotionSyncAgeMs / promotionSamples
        : 0;
    const avgPromotionDelta =
      promotionSamples > 0
        ? diag.promotionServerDelta / promotionSamples
        : 0;
    const avgEstimatedDrift =
      promotionSamples > 0
        ? diag.promotionEstimatedDrift / promotionSamples
        : 0;

    console.log(
      `[ENEMY PASSIVE TX] ${mapId} planTick=${ENEMY_PASSIVE_PLAN_TICK_MS}ms ` +
      `decisions=${diag.decisions} corrections=${diag.heartbeats} ` +
      `transitions=${diag.transitions} queued=${diag.queued} ` +
      `coalescedSameTick=${diag.coalesced} ` +
      `sent=${diag.sentRecords} rec/${diag.sentEvents} events ` +
      `(avg=${avgBatch.toFixed(1)}/event) | ` +
      `promote=${diag.promotions} demote=${diag.demotions} ` +
      `dropPending=${diag.droppedOnPromote} samples=${promotionSamples} ` +
      `planAge=${Math.round(avgPromotionAge)}ms avg ` +
      `estDrift=${avgEstimatedDrift.toFixed(1)}px avg/` +
      `${diag.promotionEstimatedDriftMax.toFixed(1)}px max ` +
      `serverTravel=${avgPromotionDelta.toFixed(1)}px avg/` +
      `${diag.promotionServerDeltaMax.toFixed(1)}px max`
    );
  }

  passiveEnemyNetworkDiagnostics.clear();
}

function reportNetworkDiagnostics() {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - networkLastReportAt);

  const wsOut = networkTotals.wsOutWireBytes - networkPrevious.wsOutWireBytes;
  const wsPayloadOut = networkTotals.wsOutPayloadBytes - networkPrevious.wsOutPayloadBytes;
  const httpOut = networkTotals.httpOutBytes - networkPrevious.httpOutBytes;
  const totalOut = wsOut + httpOut;
  const wsIn = networkTotals.wsInPayloadBytes - networkPrevious.wsInPayloadBytes;
  const deliveries = networkTotals.wsOutDeliveries - networkPrevious.wsOutDeliveries;
  const logicalEvents = networkTotals.wsOutEvents - networkPrevious.wsOutEvents;
  const logicalEventRecipients =
    networkTotals.wsOutEventRecipients - networkPrevious.wsOutEventRecipients;
  const inboundMessages = networkTotals.wsInMessages - networkPrevious.wsInMessages;
  const avgFanout = logicalEvents > 0
    ? logicalEventRecipients / logicalEvents
    : 0;

  const mapCounts = {};
  for (const player of players.values()) {
    const mapId = player.mapId || "unknown";
    mapCounts[mapId] = (mapCounts[mapId] || 0) + 1;
  }

  console.log(
    `[NET ${Math.round(elapsedMs / 1000)}s] clients=${players.size} ` +
    `maps=${JSON.stringify(mapCounts)} | ` +
    `OUT≈${formatBytes(totalOut)} ` +
    `(${projectedMbPerHour(totalOut, elapsedMs).toFixed(1)} MB/h) ` +
    `[WS≈${formatBytes(wsOut)} wire (${projectedMbPerHour(wsOut, elapsedMs).toFixed(1)} MB/h) / ${formatBytes(wsPayloadOut)} JSON, ` +
    `HTTP=${formatBytes(httpOut)}] | ` +
    `IN=${formatBytes(wsIn)} | ` +
    `${deliveries} WS deliveries / ${logicalEvents} logical events ` +
    `(fanout=${avgFanout.toFixed(2)}) / ${inboundMessages} inbound msgs`
  );

  const topOut = deltaMetricMap(
    networkTotals.byWsOutType,
    networkPrevious.byWsOutType
  ).slice(0, NETWORK_DIAGNOSTICS_TOP_TYPES);
  const outEventsByType = new Map(
    deltaMetricMap(
      networkTotals.byWsOutEventType,
      networkPrevious.byWsOutEventType
    ).map(item => [item.key, item])
  );

  if (topOut.length) {
    console.log(
      "[NET OUT top] " +
      topOut.map(item =>
        `${item.key}=${formatBytes(item.bytes)}/${item.count}`
      ).join(" | ")
    );

    console.log(
      "[NET OUT shape] " +
      topOut.map(item => {
        const event = outEventsByType.get(item.key);
        const events = event?.count || 0;
        const recipients = event?.recipients || 0;
        const fanout = events > 0 ? recipients / events : 0;
        const bytesPerDelivery = item.count > 0 ? item.bytes / item.count : 0;
        const payloadPerEvent = events > 0 ? event.bytes / events : 0;
        return (
          `${item.key}:ev=${events},del=${item.count},fan=${fanout.toFixed(2)},` +
          `${Math.round(bytesPerDelivery)}B/del,${Math.round(payloadPerEvent)}B/event`
        );
      }).join(" | ")
    );
  }

  const damageOut = deltaMetricMap(
    networkTotals.byWsOutEnemyDamageSource,
    networkPrevious.byWsOutEnemyDamageSource
  );

  if (damageOut.length) {
    console.log(
      "[NET DAMAGE OUT] " +
      damageOut.map(item =>
        `${item.key}=${formatBytes(item.bytes)}/${item.count}`
      ).join(" | ")
    );
  }

  const byMap = deltaMetricMap(
    networkTotals.byWsOutMap,
    networkPrevious.byWsOutMap
  ).slice(0, 8);

  if (byMap.length) {
    console.log(
      "[NET OUT maps] " +
      byMap.map(item => `${item.key}=${formatBytes(item.bytes)}/${item.count}`)
        .join(" | ")
    );
  }

  const topIn = deltaMetricMap(
    networkTotals.byWsInType,
    networkPrevious.byWsInType
  ).slice(0, NETWORK_DIAGNOSTICS_TOP_TYPES);

  if (topIn.length) {
    console.log(
      "[NET IN top] " +
      topIn.map(item => `${item.key}=${formatBytes(item.bytes)}/${item.count}`)
        .join(" | ")
    );
  }

  const enemyActionIn = deltaMetricMap(
    networkTotals.byWsInEnemyActionSource,
    networkPrevious.byWsInEnemyActionSource
  );

  if (enemyActionIn.length) {
    console.log(
      "[NET ENEMY ACTION IN] " +
      enemyActionIn.map(item =>
        `${item.key}=${formatBytes(item.bytes)}/${item.count}`
      ).join(" | ")
    );
  }

  const topHttp = deltaMetricMap(
    networkTotals.byHttpPath,
    networkPrevious.byHttpPath
  ).slice(0, 3);

  if (topHttp.length) {
    console.log(
      "[NET HTTP top] " +
      topHttp.map(item =>
        `${item.key}=${formatBytes(item.bytes)}/${item.count}`
      ).join(" | ")
    );
  }

  const sessionOut = networkTotals.wsOutWireBytes + networkTotals.httpOutBytes;
  const sessionFanout = networkTotals.wsOutEvents > 0
    ? networkTotals.wsOutEventRecipients / networkTotals.wsOutEvents
    : 0;
  console.log(
    `[NET session] OUT≈${formatBytes(sessionOut)} ` +
    `[WS≈${formatBytes(networkTotals.wsOutWireBytes)} wire / ${formatBytes(networkTotals.wsOutPayloadBytes)} JSON, HTTP=${formatBytes(networkTotals.httpOutBytes)}] ` +
    `events=${networkTotals.wsOutEvents} deliveries=${networkTotals.wsOutDeliveries} ` +
    `fanout=${sessionFanout.toFixed(2)}`
  );

  reportEnemyMotionDiagnostics(mapCounts);
  reportPassiveEnemyNetworkDiagnostics(mapCounts);

  console.log(
    `[FIRE ${Math.round(elapsedMs / 1000)}s] ` +
    `spread=${fireDiagnostics.spreadPulses} pulses/${fireDiagnostics.spreadSources} sources | ` +
    `ignite env=${fireDiagnostics.environmentIgnitions} grass=${fireDiagnostics.rainGrassIgnitions} ` +
    `mob=${fireDiagnostics.enemyIgnitions} player=${fireDiagnostics.playerIgnitions} | ` +
    `DoT mob=${fireDiagnostics.enemyDamageTicks} ticks player=${fireDiagnostics.playerDamageTicks} ticks | ` +
    `legacyIN selfDamage=${fireDiagnostics.legacyPlayerBurnDamageRequests} ` +
    `playerIgnite=${fireDiagnostics.legacyPlayerIgniteRequests} ` +
    `rainGrassState=${fireDiagnostics.legacyRainGrassStateReports}`
  );

  console.log(
    `[RAIN ${Math.round(elapsedMs / 1000)}s] ` +
    `fields=${rainDiagnostics.fieldsCreated} queries=${rainDiagnostics.grassQueries}/${rainDiagnostics.grassCellChecks} cellChecks | ` +
    `grass enter=${rainDiagnostics.grassEnters} exit=${rainDiagnostics.grassExits} | ` +
    `wet mob=${rainDiagnostics.enemyWetEnters}/${rainDiagnostics.enemyWetExits} player=${rainDiagnostics.playerWetEnters}/${rainDiagnostics.playerWetExits} | ` +
    `fieldFire ignite=${rainDiagnostics.cellIgnitions} extinguish=${rainDiagnostics.cellExtinguishes} deltas=${rainDiagnostics.fieldDeltaEvents} | ` +
    `ghostTicks=${rainDiagnostics.ghostDamageTicks} | ` +
    `legacyIN magicGrassSlow=${rainDiagnostics.legacyMagicGrassSlow} wet=${rainDiagnostics.legacyWet} rainDamage=${rainDiagnostics.legacyRainDamage}`
  );
  fireDiagnostics = makeFireDiagnostics();
  rainDiagnostics = makeRainDiagnostics();
  console.log("");

  networkPrevious = {
    wsOutWireBytes: networkTotals.wsOutWireBytes,
    wsOutPayloadBytes: networkTotals.wsOutPayloadBytes,
    wsOutDeliveries: networkTotals.wsOutDeliveries,
    wsOutEvents: networkTotals.wsOutEvents,
    wsOutEventPayloadBytes: networkTotals.wsOutEventPayloadBytes,
    wsOutEventRecipients: networkTotals.wsOutEventRecipients,
    wsInPayloadBytes: networkTotals.wsInPayloadBytes,
    wsInMessages: networkTotals.wsInMessages,
    httpOutBytes: networkTotals.httpOutBytes,
    byWsOutType: cloneMetricMap(networkTotals.byWsOutType),
    byWsOutEventType: cloneMetricMap(networkTotals.byWsOutEventType),
    byWsOutEnemyDamageSource: cloneMetricMap(networkTotals.byWsOutEnemyDamageSource),
    byWsOutMap: cloneMetricMap(networkTotals.byWsOutMap),
    byWsInType: cloneMetricMap(networkTotals.byWsInType),
    byWsInEnemyActionSource: cloneMetricMap(networkTotals.byWsInEnemyActionSource),
    byHttpPath: cloneMetricMap(networkTotals.byHttpPath)
  };
  networkLastReportAt = now;
}

setInterval(reportNetworkDiagnostics, NETWORK_DIAGNOSTICS_INTERVAL_MS).unref();

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

function worldContentPlayerSpawn(mapId, spawnId) {
  if (!ALLOWED_MAPS.has(mapId) || typeof spawnId !== "string" || !spawnId) return null;
  const spawns = WORLD_CONTENT.maps[mapId]?.playerSpawns;
  if (!Array.isArray(spawns)) return null;
  return spawns.find(spawn => spawn?.id === spawnId) || null;
}

function defaultPlayerLoadTarget() {
  const configured = WORLD_CONTENT.defaultPlayerLoad;
  if (
    configured &&
    ALLOWED_MAPS.has(configured.mapId) &&
    worldContentPlayerSpawn(configured.mapId, configured.spawnId)
  ) {
    return { mapId: configured.mapId, spawnId: configured.spawnId };
  }

  // Compatibility with v329's temporary per-map representation.
  for (const mapId of ALLOWED_MAPS) {
    const spawnId = typeof WORLD_CONTENT.maps[mapId]?.defaultPlayerSpawnId === "string"
      ? WORLD_CONTENT.maps[mapId].defaultPlayerSpawnId
      : "";
    if (worldContentPlayerSpawn(mapId, spawnId)) return { mapId, spawnId };
  }

  return { mapId: "spawn", spawnId: "center" };
}

function defaultPlayerLoadState() {
  const target = defaultPlayerLoadTarget();
  const dimensions = mapWorldDimensions(target.mapId);
  const spawn = worldContentPlayerSpawn(target.mapId, target.spawnId);
  return {
    mapId: target.mapId,
    x: spawn && Number.isFinite(Number(spawn.x)) ? Number(spawn.x) : dimensions.width / 2,
    y: spawn && Number.isFinite(Number(spawn.y)) ? Number(spawn.y) : dimensions.height / 2
  };
}


// -----------------------------------------------------------------------------
// SHARED ENEMY AGGRO RULES
// -----------------------------------------------------------------------------
// Acquisition and retention are deliberately separate. Species may differ in
// how they first acquire a player, but every enemy retains a valid target by the
// same shared engagement rule. Recent combat/contact keeps engagement alive;
// when the target has remained outside the close-contact radius with no combat
// pulse for the full memory window, aggro ends. Home position is never consulted
// while deciding whether combat should continue.
const ENEMY_AGGRO_PROVOKED = "provoked";
const ENEMY_AGGRO_PROXIMITY = "proximity";
const ENEMY_ENGAGEMENT_RADIUS = 120;
const ENEMY_ENGAGEMENT_MEMORY_SECONDS = 3.5;

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
  mushroom: Object.freeze({
    bodyOffsetY: -7,
    meleeBodyRadius: 7,
    fireSpreadChance: 0.42,
    respawnSeconds: 30,
    coinDropChance: 0.45,
    hurlable: true,
    snareable: true,
    rainEffect: "none",
    damageKnockback: Object.freeze({
      melee: 32,
      bowMelee: 12,
      basic: 18,
      arrow: 22,
      fireball: 24
    })
  }),
  crab: Object.freeze({
    bodyOffsetY: -6,
    // Water traversal is allowed for enemy species by default. Crab keeps the
    // default access and uniquely turns Wet into a movement advantage.
    wetSpeedMultiplier: 1.25,
    meleeBodyRadius: 8,
    fireSpreadChance: 0.42,
    respawnSeconds: 32,
    coinDropChance: 0.45,
    hurlable: true,
    snareable: true,
    rainEffect: "none",
    damageKnockback: Object.freeze({
      melee: 30,
      bowMelee: 12,
      basic: 17,
      arrow: 21,
      fireball: 23
    })
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
      // Walking/facing are presentation reconstructed from compact motion.
      // Only gameplay-relevant lunge state belongs in authoritative snapshots.
      return {
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
    patrolRadius: 85,
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

function serverEnemyCanEnterWater(enemyOrType) {
  const profile = serverEnemyProfile(enemyOrType);
  // Default-open prevents water from becoming a universal safe zone. Future
  // species opt out explicitly with canEnterWater: false.
  return profile?.canEnterWater !== false;
}

// -----------------------------------------------------------------------------
// SHARED STATUS EFFECTS
// -----------------------------------------------------------------------------
// Burn/Wet used to be written directly from several combat/environment paths.
// Keep the rules here so Fireball, rain, environmental fire, and future status
// skills all agree on duration, extinguishing, source attribution, and movement.
const STATUS_RULES = Object.freeze({
  // Mob Burn is a combat DoT. Fireball/spread can choose its own duration later
  // without changing environmental lifetime or player hazard rules.
  enemyBurnDuration: 3.0,
  enemyBurnTickInterval: 0.5,
  enemyBurnDamagePerTick: 2,
  fireballBurnPowerPerSecond: 20,
  enemyWetDuration: 3.0,
  enemyWetSpeedMultiplier: 0.75,

  // Player Burn is a separate hazard profile: six seconds, evaluated twice
  // per second, accumulating 1% max HP each half-second (~2% max HP/sec).
  // Fractional damage is accumulated server-side so a 50-HP player still
  // loses about 12% over a full Burn instead of being forced to lose 1 HP
  // every half-second. Burn-specific resistance can shorten this duration later.
  playerBurnDuration: 6.0,
  playerBurnTickInterval: 0.5,
  playerBurnMaxHpFractionPerTick: 0.01,
  playerWetDuration: 3.0,

  // Environment objects own their individual burnDuration. Spread itself is a
  // fixed server pulse and only newly-ignited state changes replicate.
  environmentSpreadInterval: 0.5
});

function ensureServerEnemyStatusState(enemy) {
  if (!enemy) return enemy;

  enemy.burnTime = Math.max(0, Number(enemy.burnTime) || 0);
  enemy.burnTickTimer = Math.max(0, Number(enemy.burnTickTimer) || 0);
  enemy.burnTickInterval = Math.max(0.05, Number(enemy.burnTickInterval) || STATUS_RULES.enemyBurnTickInterval);
  enemy.burnDamagePerTick = Math.max(
    1,
    Math.round(Number(enemy.burnDamagePerTick) || STATUS_RULES.enemyBurnDamagePerTick)
  );
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
  enemy.burnDamagePerTick = STATUS_RULES.enemyBurnDamagePerTick;
  return changed;
}

function applyServerEnemyWet(enemy, duration = STATUS_RULES.enemyWetDuration) {
  if (!enemy?.alive || enemy.returningHome) return false;
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
    damagePerTick = STATUS_RULES.enemyBurnDamagePerTick,
    sourcePlayerId = null,
    forceThroughWet = false,
    refresh = true
  } = {}
) {
  if (!enemy?.alive || enemy.returningHome) return false;
  ensureServerEnemyStatusState(enemy);

  if (serverEnemyIsWet(enemy) && !forceThroughWet) {
    return false;
  }

  if (forceThroughWet) {
    enemy.wetTime = 0;
  }

  const burnDuration = Math.max(0.1, Number(duration) || STATUS_RULES.enemyBurnDuration);
  const incomingDamagePerTick = Math.max(
    1,
    Math.round(Number(damagePerTick) || STATUS_RULES.enemyBurnDamagePerTick)
  );
  const wasBurning = enemy.burnTime > 0;
  if (wasBurning && !refresh) return false;

  enemy.burnTime = refresh
    ? Math.max(enemy.burnTime, burnDuration)
    : burnDuration;
  enemy.burnDamagePerTick = wasBurning && refresh
    ? Math.max(enemy.burnDamagePerTick, incomingDamagePerTick)
    : incomingDamagePerTick;
  if (!wasBurning) {
    enemy.burnTickTimer = enemy.burnTickInterval;
    fireDiagnostics.enemyIgnitions += 1;
  }

  if (sourcePlayerId && players.has(sourcePlayerId)) {
    setEnemyAggroTarget(enemy, sourcePlayerId);
    enemy.lastDamagePlayerId = sourcePlayerId;
  }

  return true;
}

function clearServerPlayerBurn(target) {
  if (!target) return false;
  const changed = (Number(target.burnTime) || 0) > 0;
  target.burnTime = 0;
  target.burnTickTimer = 0;
  target.burnDamageAccumulator = 0;
  target.burnSourcePlayerId = null;
  return changed;
}

function broadcastServerPlayerBurnState(target) {
  if (!target?.mapId) return;
  broadcastToMap(target.mapId, {
    type: "playerIgnited",
    targetId: target.id,
    mapId: target.mapId,
    burnTime: Math.max(0, Number(target.burnTime) || 0)
  });
}

function applyServerPlayerBurn(
  target,
  {
    duration = STATUS_RULES.playerBurnDuration,
    forceThroughWet = false,
    sourcePlayerId = null
  } = {}
) {
  if (!target || target.hp <= 0) return false;

  if ((Number(target.wetTime) || 0) > 0 && !forceThroughWet) {
    return false;
  }

  if (forceThroughWet) {
    target.wetTime = 0;
  }

  const previousBurnTime = Math.max(
    0,
    Number(target.burnTime) || 0
  );
  const incomingBurnDuration = Math.max(
    0.1,
    Number(duration) || STATUS_RULES.playerBurnDuration
  );
  const wasBurning = previousBurnTime > 0;
  const sourceOwnsRefresh =
    !wasBurning ||
    incomingBurnDuration > previousBurnTime + 0.01;

  target.burnTime = Math.max(
    previousBurnTime,
    incomingBurnDuration
  );
  if (!wasBurning) {
    target.burnTickTimer = STATUS_RULES.playerBurnTickInterval;
    target.burnDamageAccumulator = 0;
    fireDiagnostics.playerIgnitions += 1;
  }

  if (
    sourceOwnsRefresh &&
    sourcePlayerId &&
    players.has(sourcePlayerId)
  ) {
    target.burnSourcePlayerId = sourcePlayerId;
  } else if (!wasBurning) {
    target.burnSourcePlayerId = null;
  }

  return !wasBurning;
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

  enemy.magicGrassFieldActive = Boolean(enemy.magicGrassFieldActive);
  enemy.magicGrassSlowMultiplier = Math.max(
    0.1,
    Math.min(1, Number(enemy.magicGrassSlowMultiplier) || RAIN_FIELD.SPEED_MULTIPLIER)
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
    !enemy.returningHome &&
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
  if (enemy.magicGrassFieldActive) {
    multiplier = Math.min(multiplier, enemy.magicGrassSlowMultiplier);
  }
  if (enemy.wetTime > 0) {
    const wetMultiplier = Number(serverEnemyProfile(enemy)?.wetSpeedMultiplier);
    if (Number.isFinite(wetMultiplier) && wetMultiplier > 1) {
      // Crab-style Wet affinity is a bonus layered on top of any existing
      // snare/grass control, rather than erasing those debuffs.
      multiplier *= wetMultiplier;
    } else {
      multiplier = Math.min(
        multiplier,
        Number.isFinite(wetMultiplier)
          ? wetMultiplier
          : STATUS_RULES.enemyWetSpeedMultiplier
      );
    }
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
const persistentStateRestoredPlayers = new Set();

// Connection indexes are transport-only mirrors of authoritative player state.
// They let map-scoped broadcasts iterate only sockets that can actually receive
// the event instead of scanning every connected client for every packet.
const socketsByPlayerId = new Map();
const socketsByMap = new Map();

const HUNTER_SNARE_TRIGGER_RADIUS = 9;
const HUNTER_SNARE_ROOT_SECONDS = 0.65;
const HUNTER_SNARE_SLOW_SECONDS = 3.0;
const HUNTER_SNARE_SLOW_MULTIPLIER = 0.45;
const HUNTER_SNARE_MAX_ACTIVE = 3;
const HUNTER_SNARE_MAX_CHARGES = 3;
const HUNTER_SNARE_CHARGE_SECONDS = 15.0;
const HUNTER_SNARE_SETUP_SECONDS = 1.25;
const HUNTER_SNARE_SETUP_MOVE_TOLERANCE = 0.75;
const hunterSnares = new Map();
const hunterSnareSetups = new Map();
let nextHunterSnareId = 1;

function hunterSnaresForOwner(ownerId) {
  return [...hunterSnares.values()]
    .filter(snare => snare.ownerId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function hunterSnareSnapshot(mapId = null) {
  return [...hunterSnares.values()]
    .filter(snare => !mapId || snare.mapId === mapId)
    .map(snare => ({
      id: snare.id,
      ownerId: snare.ownerId,
      mapId: snare.mapId,
      x: snare.x,
      y: snare.y
    }));
}

function hunterSnareSetupSnapshot(mapId = null) {
  const now = Date.now();

  return [...hunterSnareSetups.values()]
    .filter(setup => !mapId || setup.mapId === mapId)
    .map(setup => ({
      ownerId: setup.ownerId,
      mapId: setup.mapId,
      x: setup.x,
      y: setup.y,
      duration: HUNTER_SNARE_SETUP_SECONDS,
      elapsed: Math.max(
        0,
        Math.min(
          HUNTER_SNARE_SETUP_SECONDS,
          (now - setup.startedAt) / 1000
        )
      )
    }));
}

function removeHunterSnare(snareId, reason = "removed") {
  const snare = hunterSnares.get(snareId);
  if (!snare) return null;

  hunterSnares.delete(snareId);

  broadcastToMap(snare.mapId, {
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

  sendToPlayer(playerId, {
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

    playerState.hunterSnareChargeTime = Math.max(
      0,
      Number(playerState.hunterSnareChargeTime) || 0
    ) + dt;

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

function rejectHunterSnareSetup(
  playerId,
  reason,
  playerState = players.get(playerId)
) {
  sendToPlayer(playerId, {
    type: "hunterSnareSetupRejected",
    ownerId: playerId,
    reason,
    charges: Math.max(
      0,
      Math.floor(playerState?.hunterSnareCharges || 0)
    )
  });
}

function cancelHunterSnareSetup(
  playerId,
  reason = "cancelled",
  broadcast = true
) {
  const setup = hunterSnareSetups.get(playerId);
  if (!setup) return null;

  hunterSnareSetups.delete(playerId);

  if (broadcast) {
    broadcastToMap(setup.mapId, {
      type: "hunterSnareSetupCancelled",
      ownerId: playerId,
      mapId: setup.mapId,
      reason,
      duration: HUNTER_SNARE_SETUP_SECONDS
    });
  }

  return setup;
}

function handleHunterSnareBegin(playerId) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) {
    rejectHunterSnareSetup(playerId, "unavailable", playerState);
    return;
  }

  if (hunterSnareSetups.has(playerId)) {
    rejectHunterSnareSetup(playerId, "alreadySetting", playerState);
    return;
  }

  if ((playerState.hunterSnareCharges || 0) <= 0) {
    rejectHunterSnareSetup(playerId, "noCharges", playerState);
    return;
  }

  const now = Date.now();
  const setup = {
    ownerId: playerId,
    mapId: playerState.mapId,
    x: playerState.x,
    y: playerState.y,
    startedAt: now,
    completesAt: now + HUNTER_SNARE_SETUP_SECONDS * 1000
  };

  hunterSnareSetups.set(playerId, setup);

  broadcastToMap(setup.mapId, {
    type: "hunterSnareSetupStarted",
    ownerId: playerId,
    mapId: setup.mapId,
    x: setup.x,
    y: setup.y,
    duration: HUNTER_SNARE_SETUP_SECONDS,
    elapsed: 0
  });
}

function handleHunterSnareCancel(playerId) {
  cancelHunterSnareSetup(
    playerId,
    "playerCancelled"
  );
}

function finishHunterSnareSetup(playerId) {
  const setup = hunterSnareSetups.get(playerId);
  if (!setup) return false;

  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.hp <= 0 ||
    playerState.mapId !== setup.mapId
  ) {
    cancelHunterSnareSetup(
      playerId,
      "ownerUnavailable"
    );
    return false;
  }

  if (
    Math.hypot(
      playerState.x - setup.x,
      playerState.y - setup.y
    ) > HUNTER_SNARE_SETUP_MOVE_TOLERANCE
  ) {
    cancelHunterSnareSetup(
      playerId,
      "movement"
    );
    return false;
  }

  if ((playerState.hunterSnareCharges || 0) <= 0) {
    cancelHunterSnareSetup(
      playerId,
      "noCharges"
    );
    rejectHunterSnareSetup(
      playerId,
      "noCharges",
      playerState
    );
    return false;
  }

  hunterSnareSetups.delete(playerId);

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
    mapId: setup.mapId,
    x: setup.x,
    y: setup.y,
    createdAt: Date.now()
  };

  hunterSnares.set(snare.id, snare);

  broadcastToMap(snare.mapId, {
    type: "hunterSnarePlaced",
    ...snare,
    setupDuration: HUNTER_SNARE_SETUP_SECONDS
  });

  return true;
}

function tickHunterSnareSetups() {
  const now = Date.now();

  for (const [playerId, setup] of hunterSnareSetups.entries()) {
    const playerState = players.get(playerId);

    if (
      !playerState ||
      playerState.hp <= 0 ||
      playerState.mapId !== setup.mapId
    ) {
      cancelHunterSnareSetup(
        playerId,
        "ownerUnavailable"
      );
      continue;
    }

    if (
      Math.hypot(
        playerState.x - setup.x,
        playerState.y - setup.y
      ) > HUNTER_SNARE_SETUP_MOVE_TOLERANCE
    ) {
      cancelHunterSnareSetup(
        playerId,
        "movement"
      );
      continue;
    }

    if (now >= setup.completesAt) {
      finishHunterSnareSetup(playerId);
    }
  }
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
    let triggeredPlayer = null;
    let bestDistance = HUNTER_SNARE_TRIGGER_RADIUS + 0.001;

    for (const enemy of sharedEnemiesOnMap(snare.mapId)) {
      if (!serverEnemyIsSnareable(enemy)) continue;
      if (enemy.hurlTime > 0) continue;

      ensureServerEnemySnareState(enemy);

      const distance = Math.hypot(
        enemy.x - snare.x,
        enemy.y - snare.y
      );

      if (distance <= bestDistance) {
        bestDistance = distance;
        triggeredEnemy = enemy;
        triggeredPlayer = null;
      }
    }

    // PvP players can spring the same physical trap. Camouflage does not make
    // the Ranger intangible: stepping onto a snare still catches them, and the
    // SNARED tell briefly gives away where the hidden player actually is.
    for (const target of players.values()) {
      if (
        target.id === owner.id ||
        target.mapId !== snare.mapId ||
        !pvpPlayersCanHarm(owner, target)
      ) {
        continue;
      }

      const distance = Math.hypot(
        target.x - snare.x,
        target.y - snare.y
      );

      if (distance <= bestDistance) {
        bestDistance = distance;
        triggeredEnemy = null;
        triggeredPlayer = target;
      }
    }

    if (!triggeredEnemy && !triggeredPlayer) continue;

    const removed = removeHunterSnare(
      snare.id,
      "triggered"
    );

    if (triggeredPlayer) {
      const now = Date.now();
      triggeredPlayer.pvpSnareRootUntil = Math.max(
        Number(triggeredPlayer.pvpSnareRootUntil) || 0,
        now + HUNTER_SNARE_ROOT_SECONDS * 1000
      );
      triggeredPlayer.pvpSnareSlowUntil = Math.max(
        Number(triggeredPlayer.pvpSnareSlowUntil) || 0,
        now + HUNTER_SNARE_SLOW_SECONDS * 1000
      );
      triggeredPlayer.pvpSnareSlowMultiplier =
        HUNTER_SNARE_SLOW_MULTIPLIER;

      applyPvpCombatLock(owner, triggeredPlayer);

      broadcastToMap(snare.mapId, {
        type: "hunterSnareTriggered",
        snareId: snare.id,
        ownerId: snare.ownerId,
        mapId: snare.mapId,
        x: removed?.x ?? snare.x,
        y: removed?.y ?? snare.y,
        targetPlayerId: triggeredPlayer.id,
        rootSeconds: HUNTER_SNARE_ROOT_SECONDS,
        slowSeconds: HUNTER_SNARE_SLOW_SECONDS,
        slowMultiplier: HUNTER_SNARE_SLOW_MULTIPLIER
      });
      continue;
    }

    ensureServerEnemySnareState(triggeredEnemy);
    triggeredEnemy.snareRootTime =
      HUNTER_SNARE_ROOT_SECONDS;
    triggeredEnemy.snareSlowTime =
      HUNTER_SNARE_SLOW_SECONDS;
    triggeredEnemy.snareSlowMultiplier =
      HUNTER_SNARE_SLOW_MULTIPLIER;

    broadcastToMap(snare.mapId, {
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
const PVP_PLAYER_BURN_DURATION = 3.0;
const PVP_FIREBALL_LANDING_RADIUS = 13;
const PVP_LOCK_REBROADCAST_GRACE_MS = 1_000;
const pvpAttackRateLimits = new Map();

function pvpPlayersCanHarm(attacker, target) {
  return Boolean(
    attacker &&
    target &&
    attacker.id !== target.id &&
    attacker.hp > 0 &&
    target.hp > 0 &&
    attacker.mapId === target.mapId &&
    attacker.pvpEnabled &&
    target.pvpEnabled
  );
}

function playerOwnedEffectMayAffectTarget(sourcePlayerId, target) {
  if (!target || target.hp <= 0) return false;
  if (!sourcePlayerId) return true;

  const source = players.get(sourcePlayerId);
  if (!source) return false;

  // Self-inflicted fire/status remains possible regardless of PvP toggle.
  if (source.id === target.id) return true;

  return pvpPlayersCanHarm(source, target);
}


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
// Secondary map index for persistent world objects. The authoritative entity
// objects still live in sharedEnvironment; this index only prevents every
// map-local query from scanning unrelated maps as the world gains more props.
const sharedEnvironmentByMap = new Map();
const dirtyEnvironmentIds = new Set();
// Moving rocks use their own compact 10 Hz correction stream rather than a
// full generic environmentEntitySnapshot every tick.
const dirtyRockMotionIds = new Set();
// Immutable tree positions used only by server-side Hurl collision. These are
// deliberately separate from sharedEnvironment because they have no mutable
// state to replicate.
const staticHurlTreesByMap = new Map();

const sharedResources = new Map();
let nextSharedResourceId = 1;

let environmentSpreadTimer = 0;
const ENVIRONMENT_SPREAD_INTERVAL = STATUS_RULES.environmentSpreadInterval;

// Regrowth uses one timestamp stored on the existing environment entity.
// There are no per-tree/per-grass setTimeout timers.
const TREE_REGROW_MIN_MS = 360_000;
const TREE_REGROW_MAX_MS = 540_000;
const GRASS_REGROW_MIN_MS = 180_000;
const GRASS_REGROW_MAX_MS = 300_000;
const FLOWER_REGROW_MIN_MS = 600_000;
const FLOWER_REGROW_MAX_MS = 900_000;
const ROCK_REGROW_MIN_MS = 720_000;
const ROCK_REGROW_MAX_MS = 1_080_000;
const RESOURCE_REGROW_CLEAR_RADIUS = 96;

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

function scheduleFlowerRegrow(entity) {
  if (
    !entity ||
    entity.kind !== "flower" ||
    entity.regrowAt > 0
  ) {
    return false;
  }

  entity.regrowAt =
    randomRegrowTimestamp(
      FLOWER_REGROW_MIN_MS,
      FLOWER_REGROW_MAX_MS
    );

  return true;
}

function scheduleRockRegrow(entity) {
  if (
    !entity ||
    entity.kind !== "rock" ||
    entity.regrowAt > 0
  ) {
    return false;
  }

  entity.regrowAt =
    randomRegrowTimestamp(
      ROCK_REGROW_MIN_MS,
      ROCK_REGROW_MAX_MS
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

function resetFlowerToFresh(entity) {
  entity.cut = false;
  entity.burnt = false;
  entity.burnTime = 0;
  entity.looted = false;
  entity.regrowAt = 0;

  markEnvironmentDirty(entity);
}

function livingPlayerNearEnvironmentHome(
  entity,
  radius = RESOURCE_REGROW_CLEAR_RADIUS
) {
  if (!entity) return false;

  const homeX = Number(entity.homeX ?? entity.x) || 0;
  const homeY = Number(entity.homeY ?? entity.y) || 0;
  const radiusSquared = radius * radius;

  for (const playerState of players.values()) {
    if (
      playerState.mapId !== entity.mapId ||
      playerState.hp <= 0
    ) {
      continue;
    }

    const dx = playerState.x - homeX;
    const dy = playerState.y - homeY;
    if (dx * dx + dy * dy <= radiusSquared) {
      return true;
    }
  }

  return false;
}

function livingPlayerNearRockHome(entity, radius = RESOURCE_REGROW_CLEAR_RADIUS) {
  return Boolean(
    entity?.kind === "rock" &&
    livingPlayerNearEnvironmentHome(entity, radius)
  );
}

function resetRockToFresh(entity) {
  entity.hp = entity.maxHp;
  entity.depleted = false;
  entity.regrowAt = 0;
  entity.x = entity.homeX;
  entity.y = entity.homeY;
  entity.carriedBy = null;
  entity.pickupTime = 0;
  entity.hurlTime = 0;
  entity.hurlVelocityX = 0;
  entity.hurlVelocityY = 0;
  entity.hurlThrownBy = null;
  entity.rollTime = 0;
  entity.rollVelocityX = 0;
  entity.rollVelocityY = 0;
  markEnvironmentDirty(entity, true);
}

function environmentMapBucket(mapId, create = false) {
  if (!mapId) return null;

  let bucket = sharedEnvironmentByMap.get(mapId) || null;

  if (!bucket && create) {
    bucket = new Map();
    sharedEnvironmentByMap.set(mapId, bucket);
  }

  return bucket;
}

function registerSharedEnvironmentEntity(entity) {
  if (!entity?.id || !entity.mapId) return false;
  if (sharedEnvironment.has(entity.id)) return false;

  sharedEnvironment.set(entity.id, entity);
  environmentMapBucket(entity.mapId, true).set(entity.id, entity);
  return true;
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

  if (entity.kind === "rock") {
    return {
      ...common,
      homeX: entity.homeX,
      homeY: entity.homeY,
      variant: entity.variant || "plain",
      hp: entity.hp,
      maxHp: entity.maxHp,
      depleted: Boolean(entity.depleted),
      carriedBy: entity.carriedBy || null,
      pickupTime: Number((entity.pickupTime || 0).toFixed(3)),
      pickupDuration: entity.pickupDuration || 0.18,
      pickupDirX: Number((entity.pickupDirX || 0).toFixed(3)),
      pickupDirY: Number((entity.pickupDirY || 0).toFixed(3)),
      hurlTime: Number((entity.hurlTime || 0).toFixed(3)),
      hurlDuration: entity.hurlDuration || 0.58,
      hurlVelocityX: Number((entity.hurlVelocityX || 0).toFixed(2)),
      hurlVelocityY: Number((entity.hurlVelocityY || 0).toFixed(2)),
      rollTime: Number((entity.rollTime || 0).toFixed(3)),
      rollDuration: entity.rollDuration || 0.24,
      rollVelocityX: Number((entity.rollVelocityX || 0).toFixed(2)),
      rollVelocityY: Number((entity.rollVelocityY || 0).toFixed(2))
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

function environmentEntityHasNonDefaultState(entity) {
  if (!entity) return false;
  if (entity.kind === "tree") {
    return entity.hp < entity.maxHp || entity.isStump || entity.falling ||
      entity.canopyBurnTime > 0 || entity.canopyBurned;
  }
  if (entity.kind === "grass") {
    return Boolean(entity.cut || entity.burnt || entity.burnTime > 0);
  }
  if (entity.kind === "rock") {
    return Boolean(
      entity.hp < entity.maxHp ||
      entity.depleted ||
      entity.carriedBy ||
      entity.hurlTime > 0 ||
      entity.rollTime > 0 ||
      Math.abs(entity.x - entity.homeX) > 0.01 ||
      Math.abs(entity.y - entity.homeY) > 0.01
    );
  }
  return Boolean(entity.cut || entity.burnt || entity.burnTime > 0 || entity.looted);
}

function sharedEnvironmentChangesSnapshot(mapId) {
  return environmentEntitiesOnMap(mapId)
    .filter(environmentEntityHasNonDefaultState)
    .map(environmentEntitySnapshot);
}

function markEnvironmentDirty(entity, fullState = false) {
  if (!entity?.id) return;

  if (entity.kind === "rock" && !fullState) {
    dirtyRockMotionIds.add(entity.id);
    return;
  }

  if (entity.kind === "rock") {
    dirtyRockMotionIds.delete(entity.id);
  }
  dirtyEnvironmentIds.add(entity.id);
}

function compactRockMotionSnapshot(rock) {
  return [
    rock.id,
    Number((Number(rock.x) || 0).toFixed(2)),
    Number((Number(rock.y) || 0).toFixed(2))
  ];
}

function flushRockMotionPatches() {
  if (dirtyRockMotionIds.size === 0) return;

  const byMap = new Map();

  for (const entityId of dirtyRockMotionIds) {
    const rock = sharedEnvironment.get(entityId);
    if (!rock || rock.kind !== "rock") continue;

    if (!byMap.has(rock.mapId)) byMap.set(rock.mapId, []);
    byMap.get(rock.mapId).push(compactRockMotionSnapshot(rock));
  }

  dirtyRockMotionIds.clear();

  for (const [mapId, rocks] of byMap.entries()) {
    if (!rocks.length) continue;
    broadcastToMap(mapId, {
      type: "rockMotion",
      mapId,
      rocks
    });
  }
}

function flushEnvironmentPatches() {
  if (dirtyEnvironmentIds.size > 0) {
    const byMap = new Map();

    for (const entityId of dirtyEnvironmentIds) {
      const entity = sharedEnvironment.get(entityId);
      if (!entity) continue;

      if (!byMap.has(entity.mapId)) {
        byMap.set(entity.mapId, []);
      }

      byMap.get(entity.mapId).push(
        environmentEntitySnapshot(entity)
      );
    }

    dirtyEnvironmentIds.clear();

    for (const [mapId, entities] of byMap.entries()) {
      if (entities.length === 0) continue;

      broadcastToMap(mapId, {
        type: "environmentPatch",
        mapId,
        entities
      });
    }
  }

  flushRockMotionPatches();
}

function sanitizeEnvironmentCatalogEntity(mapId, source) {
  if (
    !source ||
    typeof source !== "object" ||
    !["tree", "grass", "flower", "rock"].includes(source.kind)
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

  const dimensions = mapWorldDimensions(mapId);
  const x = clampNumber(source.x, 0, dimensions.width, 0);
  const y = clampNumber(source.y, 0, dimensions.height, 0);

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
      ),
      fireImmune: Boolean(source.fireImmune),
      nonInteractive: Boolean(source.nonInteractive)
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
      regrowAt: 0,
      width: clampNumber(source.width, 6, 40, 13)
    };
  }

  if (kind === "rock") {
    return {
      id,
      mapId,
      kind,
      x,
      y,
      homeX: x,
      homeY: y,
      variant:
        source.variant === "grass"
          ? "grass"
          : "plain",
      hp: 3,
      maxHp: 3,
      depleted: false,
      regrowAt: 0,
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
      rollTime: 0,
      rollDuration: 0.24,
      rollVelocityX: 0,
      rollVelocityY: 0
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
    regrowAt: 0,

    flowerType:
      source.flowerType === "blue"
        ? "blue"
        : "white"
  };
}

function registerStaticHurlTreeCatalog(mapId, sourceTrees) {
  if (!Array.isArray(sourceTrees)) return false;

  const dimensions = mapWorldDimensions(mapId);
  const existing = staticHurlTreesByMap.get(mapId) || [];
  const trees = existing.slice();
  const seen = new Set(
    trees.map(tree => `${Number(tree.x).toFixed(2)}:${Number(tree.y).toFixed(2)}`)
  );
  let added = 0;

  for (const source of sourceTrees.slice(0, 500)) {
    if (!Array.isArray(source) || source.length < 2) continue;

    const x = clampNumber(source[0], 0, dimensions.width, 0);
    const y = clampNumber(source[1], 0, dimensions.height, 0);
    const key = `${x.toFixed(2)}:${y.toFixed(2)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    trees.push({ x, y });
    added += 1;
  }

  if (added > 0 || !staticHurlTreesByMap.has(mapId)) {
    staticHurlTreesByMap.set(mapId, trees);
  }

  return added > 0;
}

function staticHurlTreesOnMap(mapId) {
  return staticHurlTreesByMap.get(mapId) || [];
}

function handleEnvironmentCatalog(
  playerId,
  message,
  socket = null
) {
  const playerState = players.get(playerId);
  if (!playerState) return;

  const mapId = String(message.mapId || "");
  if (!ALLOWED_MAPS.has(mapId)) return;

  const entities =
    Array.isArray(message.entities)
      ? message.entities.slice(0, 500)
      : [];

  const compactStaticTrees = Array.isArray(message.staticTrees)
    ? message.staticTrees
    : [];

  const staticCatalogAdded = registerStaticHurlTreeCatalog(
    mapId,
    compactStaticTrees
  );

  let addedAny = false;
  let mutableCatalogCount = 0;

  for (const source of entities) {
    // Immutable perimeter trees belong in staticTrees and never enter the
    // mutable authoritative environment registry.
    if (
      source?.kind === "tree" &&
      Boolean(source.fireImmune) &&
      Boolean(source.nonInteractive)
    ) {
      continue;
    }

    mutableCatalogCount += 1;

    const entity =
      sanitizeEnvironmentCatalogEntity(
        mapId,
        source
      );

    if (!entity) continue;

    // Existing authoritative state always wins over a reconnecting/default
    // client's catalog.
    if (registerSharedEnvironmentEntity(entity)) {
      addedAny = true;
    }
  }

  // The connection/map-entry path already sends the authoritative environment
  // for the player's current map. Only the very first catalog registration for
  // that current map needs a reply (the server had no state to send yet).
  // Off-map catalogs are registration-only: their state will be sent if/when
  // the player actually enters that map.
  if (
    socket &&
    addedAny &&
    playerState.mapId === mapId
  ) {
    sendJson(socket, {
      type: "environmentSnapshot",
      mapId,
      sparse: true,
      entities: sharedEnvironmentChangesSnapshot(mapId)
    });
  }

  if (addedAny || staticCatalogAdded) {
    console.log(
      `Environment catalog registered for ${mapId}: ${mutableCatalogCount} mutable + ${staticHurlTreesOnMap(mapId).length} static trees`
    );
  }
}

function sharedResourceSnapshot(mapId = null) {
  return [...sharedResources.values()]
    .filter(resource => !mapId || resource.mapId === mapId)
    .map(resource => ({
      id: resource.id,
      mapId: resource.mapId,
      kind: resource.kind,
      x: resource.x,
      y: resource.y,
      flowerType: resource.flowerType || null,
      ownerId: resource.ownerId || null,
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
  if (!["wood", "stone", "flower", "goldSlimeBubble", "icedCoffee"].includes(kind)) {
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
    ownerId: typeof options.ownerId === "string" ? options.ownerId : null,
    life: kind === "icedCoffee" ? 28.0 : 18.0
  };

  sharedResources.set(
    resource.id,
    resource
  );

  broadcastToMap(mapId, {
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

  const resource = sharedResources.get(resourceId);
  sharedResources.delete(resourceId);

  broadcastToMap(resource?.mapId, {
    type: "resourceRemoved",
    resourceId,
    mapId: resource?.mapId || null,
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

const SHARED_LOOT_PICKUP_RADIUS = 36;

function handleResourcePickup(
  playerId,
  resourceId
) {
  const playerState = players.get(playerId);
  const resource =
    sharedResources.get(resourceId);

  if (!playerState || !resource) return;

  if (resource.ownerId && resource.ownerId !== playerId) return;

  if (playerState.mapId !== resource.mapId) {
    return;
  }

  const distance = Math.hypot(
    playerState.x - resource.x,
    (playerState.y - 4) - resource.y
  );

  // The browser starts magnet pickup at 24 px. Keep a wider server grace
  // radius so ordinary movement replication delay does not reject a pickup
  // that was visibly in range on the collecting player's screen.
  if (distance > SHARED_LOOT_PICKUP_RADIUS) return;

  if (
    resource.kind === "icedCoffee" &&
    (playerState.beachQuestStage !== "firstActive" || playerState.beachQuestIcedCoffee >= 1)
  ) {
    return;
  }

  // Remove first so pickup races have exactly one winner.
  sharedResources.delete(resource.id);

  if (resource.kind === "wood") {
    playerState.wood += 1;
  } else if (resource.kind === "stone") {
    playerState.stone += 1;
  } else if (resource.kind === "flower") {
    if (resource.flowerType === "blue") playerState.blueFlowers += 1;
    else playerState.whiteFlowers += 1;
  } else if (resource.kind === "goldSlimeBubble") {
    playerState.goldSlimeBubbles += 1;
  } else if (resource.kind === "icedCoffee") {
    playerState.beachQuestIcedCoffee = 1;
  }

  broadcastToMap(resource.mapId, {
    type: "resourcePicked",
    resourceId: resource.id,
    resourceKind: resource.kind,
    mapId: resource.mapId,
    collectorId: playerId,
    totalWood: playerState.wood,
    totalStone: playerState.stone,
    flowerType: resource.flowerType === "blue" ? "blue" : "white",
    totalWhiteFlowers: playerState.whiteFlowers,
    totalBlueFlowers: playerState.blueFlowers,
    totalGoldSlimeBubbles: playerState.goldSlimeBubbles,
    beachQuestIcedCoffee: playerState.beachQuestIcedCoffee
  });
}

const FIRST_BENCH_X = 216;
const FIRST_BENCH_Y = 101;

const CRAFT_RECIPES = Object.freeze({
  woodSword: Object.freeze({ ingredients: Object.freeze({ wood: 8 }), stateKey: "woodSwordCrafted", repeatable: false }),
  woodBow: Object.freeze({ ingredients: Object.freeze({ wood: 8 }), stateKey: "woodBowCrafted", repeatable: false }),
  shepherdStaff: Object.freeze({ ingredients: Object.freeze({ wood: 10 }), stateKey: "shepherdStaffCrafted", repeatable: false }),
  woodHelm: Object.freeze({ ingredients: Object.freeze({ wood: 8, stone: 2 }), stateKey: "woodHelmCrafted", repeatable: false }),
  woodChest: Object.freeze({ ingredients: Object.freeze({ wood: 12, stone: 3 }), stateKey: "woodChestCrafted", repeatable: false }),
  woodGreaves: Object.freeze({ ingredients: Object.freeze({ wood: 10, stone: 2 }), stateKey: "woodGreavesCrafted", repeatable: false }),
  woodRing: Object.freeze({ ingredients: Object.freeze({ wood: 5 }), stateKey: "woodRingCrafted", repeatable: false }),
  arrows: Object.freeze({ repeatable: true, resourceKey: "arrows", outputCount: 50, ingredients: Object.freeze({ wood: 5, stone: 1 }) }),
  healingPotion: Object.freeze({ repeatable: true, resourceKey: "healingPotions", outputCount: 1, ingredients: Object.freeze({ whiteFlowers: 1, blueFlowers: 1 }) }),
  attackPotion: Object.freeze({ repeatable: true, resourceKey: "attackPotions", outputCount: 1, ingredients: Object.freeze({ whiteFlowers: 2 }) }),
  magicPotion: Object.freeze({ repeatable: true, resourceKey: "magicPotions", outputCount: 1, ingredients: Object.freeze({ blueFlowers: 2 }) })
});

function playerNearPlacedInteraction(playerState, type, minimumAuthorityRadius, cushion = 16) {
  if (!playerState || !type) return false;
  const placedNpcs = WORLD_CONTENT.maps[playerState.mapId]?.npcs;
  if (!Array.isArray(placedNpcs)) return false;

  return placedNpcs.some(npc => {
    if (npc?.type !== type) return false;
    const x = Number(npc.x);
    const y = Number(npc.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const interactionRadius = Math.max(8, Number(npc.interactionRadius) || 24);
    const authorityRadius = Math.max(minimumAuthorityRadius, interactionRadius + cushion);
    return Math.hypot(playerState.x - x, playerState.y - y) <= authorityRadius;
  });
}

const BEACH_QUEST_FIRST_CRAB_GOAL = 10;
const BEACH_QUEST_SECOND_CRAB_GOAL = 25;
const BEACH_QUEST_COFFEE_DROP_CHANCE = 0.15;

function beachQuestStage(playerState) {
  return ["none", "firstActive", "firstComplete", "secondActive", "complete"].includes(playerState?.beachQuestStage)
    ? playerState.beachQuestStage
    : "none";
}

function beachQuestStatePayload(playerState, rewardExp = 0, rewardCoins = 0) {
  const stage = beachQuestStage(playerState);
  const level = Math.max(1, Math.floor(Number(playerState?.level) || 1));
  const firstCrabKills = Math.max(0, Math.min(BEACH_QUEST_FIRST_CRAB_GOAL, Math.floor(Number(playerState?.beachQuestFirstCrabKills) || 0)));
  const secondCrabKills = Math.max(0, Math.min(BEACH_QUEST_SECOND_CRAB_GOAL, Math.floor(Number(playerState?.beachQuestSecondCrabKills) || 0)));
  const icedCoffee = Math.max(0, Math.min(1, Math.floor(Number(playerState?.beachQuestIcedCoffee) || 0)));
  let questName = "Crab Beach";
  let dialogue = "Beautiful water, isn't it? Just watch your ankles—the crabs here are bolder than they look.";
  let objectives = [];
  let action = null;
  let actionLabel = null;

  if (stage === "none" && level >= 5) {
    questName = "A Very Iced Emergency";
    dialogue = "I set my iced coffee down for one second, and a crab ran off with it! Help me find it—and thin out ten of those little thieves?";
    objectives = [
      { text: "Find the lost iced coffee", complete: false, icon: "coffee" },
      { text: `Defeat crabs 0 / ${BEACH_QUEST_FIRST_CRAB_GOAL}`, complete: false }
    ];
    action = "acceptFirst";
    actionLabel = "Accept Quest";
  } else if (stage === "firstActive") {
    questName = "A Very Iced Emergency";
    const ready = icedCoffee >= 1 && firstCrabKills >= BEACH_QUEST_FIRST_CRAB_GOAL;
    dialogue = ready
      ? "You found it! A little sandy, maybe, but still cold. And the beach is much safer now."
      : "The crabs sometimes drop whatever they've stolen. Please keep looking—the coffee and all ten crabs both matter!";
    objectives = [
      { text: `Lost iced coffee ${icedCoffee >= 1 ? "1 / 1" : "0 / 1"}`, complete: icedCoffee >= 1, icon: "coffee" },
      { text: `Defeat crabs ${firstCrabKills} / ${BEACH_QUEST_FIRST_CRAB_GOAL}`, complete: firstCrabKills >= BEACH_QUEST_FIRST_CRAB_GOAL }
    ];
    if (ready) {
      action = "turnInFirst";
      actionLabel = "Return Coffee";
    }
  } else if (stage === "firstComplete" && level >= 7) {
    questName = "Crab Revenge";
    dialogue = "You know what? Ten wasn't enough. They've been terrorizing every picnic on this beach. How about twenty-five more—for revenge?";
    objectives = [{ text: `Defeat crabs 0 / ${BEACH_QUEST_SECOND_CRAB_GOAL}`, complete: false }];
    action = "acceptSecond";
    actionLabel = "Accept Quest";
  } else if (stage === "firstComplete") {
    dialogue = "Thanks again for saving my coffee. Come back when you're a little stronger—these crabs haven't learned their lesson.";
  } else if (stage === "secondActive") {
    questName = "Crab Revenge";
    const ready = secondCrabKills >= BEACH_QUEST_SECOND_CRAB_GOAL;
    dialogue = ready
      ? "Twenty-five! That ought to make them think twice before raiding another beach bag."
      : "This is for every stolen drink, ruined towel, and pinched toe on the beach.";
    objectives = [{ text: `Defeat crabs ${secondCrabKills} / ${BEACH_QUEST_SECOND_CRAB_GOAL}`, complete: ready }];
    if (ready) {
      action = "turnInSecond";
      actionLabel = "Finish Quest";
    }
  } else if (stage === "complete") {
    dialogue = "The beach has never been this peaceful. I can finally enjoy my coffee without watching the sand for claws.";
  }

  return {
    type: "beachQuestState",
    questNpcType: "beachGirl",
    stage,
    questName,
    dialogue,
    objectives,
    action,
    actionLabel,
    firstCrabKills,
    secondCrabKills,
    icedCoffee,
    totalCoins: Math.max(0, Math.floor(Number(playerState?.coins) || 0)),
    rewardExp: Math.max(0, Math.floor(Number(rewardExp) || 0)),
    rewardCoins: Math.max(0, Math.floor(Number(rewardCoins) || 0))
  };
}

function handleBeachQuestInteract(playerId, socket, message) {
  const playerState = players.get(playerId);
  if (!playerState || !playerNearPlacedInteraction(playerState, "beachGirl", 48, 16)) return;
  const action = typeof message?.action === "string" ? message.action : "talk";
  const stage = beachQuestStage(playerState);
  let rewardExp = 0;
  let rewardCoins = 0;

  if (action === "acceptFirst" && stage === "none" && playerState.level >= 5) {
    playerState.beachQuestStage = "firstActive";
    playerState.beachQuestFirstCrabKills = 0;
    playerState.beachQuestIcedCoffee = 0;
  } else if (
    action === "turnInFirst" &&
    stage === "firstActive" &&
    playerState.beachQuestFirstCrabKills >= BEACH_QUEST_FIRST_CRAB_GOAL &&
    playerState.beachQuestIcedCoffee >= 1
  ) {
    playerState.beachQuestStage = "firstComplete";
    playerState.beachQuestIcedCoffee = 0;
    playerState.coins += 20;
    rewardExp = 5;
    rewardCoins = 20;
  } else if (action === "acceptSecond" && stage === "firstComplete" && playerState.level >= 7) {
    playerState.beachQuestStage = "secondActive";
    playerState.beachQuestSecondCrabKills = 0;
  } else if (
    action === "turnInSecond" &&
    stage === "secondActive" &&
    playerState.beachQuestSecondCrabKills >= BEACH_QUEST_SECOND_CRAB_GOAL
  ) {
    playerState.beachQuestStage = "complete";
    playerState.coins += 50;
    rewardExp = 10;
    rewardCoins = 50;
  }

  sendJson(socket, beachQuestStatePayload(playerState, rewardExp, rewardCoins));
}

const MYRTLE_QUEST_LEVEL = 3;
const MYRTLE_QUEST_FLOWER_GOAL = 10;

function myrtleQuestStage(playerState) {
  return ["none", "active", "complete"].includes(playerState?.myrtleQuestStage)
    ? playerState.myrtleQuestStage
    : "none";
}

function myrtleQuestStatePayload(playerState, rewardExp = 0, rewardCoins = 0) {
  const stage = myrtleQuestStage(playerState);
  const level = Math.max(1, Math.floor(Number(playerState?.level) || 1));
  const whiteFlowers = Math.max(0, Math.floor(Number(playerState?.whiteFlowers) || 0));
  const blueFlowers = Math.max(0, Math.floor(Number(playerState?.blueFlowers) || 0));
  const whiteProgress = Math.min(MYRTLE_QUEST_FLOWER_GOAL, whiteFlowers);
  const blueProgress = Math.min(MYRTLE_QUEST_FLOWER_GOAL, blueFlowers);
  const ready = whiteFlowers >= MYRTLE_QUEST_FLOWER_GOAL && blueFlowers >= MYRTLE_QUEST_FLOWER_GOAL;
  let questName = "Myrtle";
  let dialogue = "The waterfall remembers every spell cast beside it. Listen closely and you may hear it humming.";
  let objectives = [];
  let action = null;
  let actionLabel = null;

  if (stage === "none" && level >= MYRTLE_QUEST_LEVEL) {
    questName = "Petals for the Falls";
    dialogue = "The water is restless. Bring me ten white flowers and ten blue flowers, and we will leave it an offering together.";
    objectives = [
      { text: `White flowers ${whiteProgress} / ${MYRTLE_QUEST_FLOWER_GOAL}`, complete: whiteProgress >= MYRTLE_QUEST_FLOWER_GOAL, icon: "whiteFlower" },
      { text: `Blue flowers ${blueProgress} / ${MYRTLE_QUEST_FLOWER_GOAL}`, complete: blueProgress >= MYRTLE_QUEST_FLOWER_GOAL, icon: "blueFlower" }
    ];
    action = "accept";
    actionLabel = "Accept Quest";
  } else if (stage === "active") {
    questName = "Petals for the Falls";
    dialogue = ready
      ? "Perfect. The white petals will carry memory; the blue will carry dreams. Shall we give them to the falls?"
      : "Ten white and ten blue. Keep them separate—the waterfall notices these things.";
    objectives = [
      { text: `White flowers ${whiteProgress} / ${MYRTLE_QUEST_FLOWER_GOAL}`, complete: whiteProgress >= MYRTLE_QUEST_FLOWER_GOAL, icon: "whiteFlower" },
      { text: `Blue flowers ${blueProgress} / ${MYRTLE_QUEST_FLOWER_GOAL}`, complete: blueProgress >= MYRTLE_QUEST_FLOWER_GOAL, icon: "blueFlower" }
    ];
    if (ready) {
      action = "turnIn";
      actionLabel = "Give Flowers";
    }
  } else if (stage === "complete") {
    dialogue = "The falls are humming more gently now. Some gifts are remembered long after their petals are gone.";
  } else if (level < MYRTLE_QUEST_LEVEL) {
    dialogue = "The waterfall has something to ask of you—but its voice is still a little too strong. Return when you have more experience.";
  }

  return {
    type: "myrtleQuestState",
    questNpcType: "greenWitch",
    stage,
    questName,
    dialogue,
    objectives,
    action,
    actionLabel,
    totalWhiteFlowers: whiteFlowers,
    totalBlueFlowers: blueFlowers,
    totalCoins: Math.max(0, Math.floor(Number(playerState?.coins) || 0)),
    rewardExp: Math.max(0, Math.floor(Number(rewardExp) || 0)),
    rewardCoins: Math.max(0, Math.floor(Number(rewardCoins) || 0))
  };
}

function handleMyrtleQuestInteract(playerId, socket, message) {
  const playerState = players.get(playerId);
  if (!playerState || !playerNearPlacedInteraction(playerState, "greenWitch", 48, 16)) return;
  const action = typeof message?.action === "string" ? message.action : "talk";
  const stage = myrtleQuestStage(playerState);
  let rewardExp = 0;
  let rewardCoins = 0;

  if (action === "accept" && stage === "none" && playerState.level >= MYRTLE_QUEST_LEVEL) {
    playerState.myrtleQuestStage = "active";
  } else if (
    action === "turnIn" &&
    stage === "active" &&
    playerState.whiteFlowers >= MYRTLE_QUEST_FLOWER_GOAL &&
    playerState.blueFlowers >= MYRTLE_QUEST_FLOWER_GOAL
  ) {
    playerState.whiteFlowers -= MYRTLE_QUEST_FLOWER_GOAL;
    playerState.blueFlowers -= MYRTLE_QUEST_FLOWER_GOAL;
    playerState.myrtleQuestStage = "complete";
    playerState.coins += 50;
    rewardExp = 10;
    rewardCoins = 50;
  }

  sendJson(socket, myrtleQuestStatePayload(playerState, rewardExp, rewardCoins));
}

function pendingIcedCoffeeDropFor(playerId) {
  for (const resource of sharedResources.values()) {
    if (resource.kind === "icedCoffee" && resource.ownerId === playerId) return true;
  }
  return false;
}

function playerNearAuthorizedCraftingTable(playerState) {
  if (!playerState) return false;

  // Preserve the original Spawn Clearing crafting bench.
  if (
    playerState.mapId === "spawn" &&
    Math.hypot(
      playerState.x - FIRST_BENCH_X,
      playerState.y - FIRST_BENCH_Y
    ) <= 40
  ) {
    return true;
  }

  // Editor-authored crafting tables are authorized from their actual saved position.
  return playerNearPlacedInteraction(playerState, "craftingTable", 40, 12);
}

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
    playerNearAuthorizedCraftingTable(playerState);

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

  const ingredients = recipe.ingredients || { wood: recipe.cost };
  const missingIngredient = Object.entries(ingredients).find(
    ([key, amount]) => (Number(playerState[key]) || 0) < amount
  );
  if (missingIngredient) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "missingIngredients",
      totalWood: playerState.wood,
      totalStone: playerState.stone,
      totalWhiteFlowers: playerState.whiteFlowers,
      totalBlueFlowers: playerState.blueFlowers,
      totalArrows: playerState.arrows
    });
    return;
  }

  for (const [key, amount] of Object.entries(ingredients)) {
    playerState[key] = Math.max(0, (Number(playerState[key]) || 0) - amount);
  }

  if (recipe.resourceKey) {
    playerState[recipe.resourceKey] +=
      Math.max(1, Number(recipe.outputCount) || 1);
  } else if (recipe.stateKey) {
    playerState[recipe.stateKey] = true;
  }

  sendJson(socket, {
    type: "craftResult",
    recipe: recipeId,
    success: true,
    totalWood: playerState.wood,
    totalStone: playerState.stone,
    totalWhiteFlowers: playerState.whiteFlowers,
    totalBlueFlowers: playerState.blueFlowers,
    totalArrows: playerState.arrows,
    totalHealingPotions: playerState.healingPotions,
    totalAttackPotions: playerState.attackPotions,
    totalMagicPotions: playerState.magicPotions
  });
}

const HEALING_POTION_COOLDOWN_MS = 15000;
const BUFF_POTION_COOLDOWN_MS = 1000;
const POTION_BUFF_MS = 300000;

function consumableCooldownUntilForItem(playerState, item) {
  if (item === "healingPotion") return Number(playerState.consumableCooldownUntil) || 0;
  if (item === "attackPotion") return Number(playerState.attackPotionCooldownUntil) || 0;
  if (item === "magicPotion") return Number(playerState.magicPotionCooldownUntil) || 0;
  return 0;
}

function setConsumableCooldown(playerState, item, now) {
  if (item === "healingPotion") {
    // Legacy field name retained for save/network compatibility. It is now the
    // shared healing-potion-family cooldown for current and future HP potions.
    playerState.consumableCooldownUntil = now + HEALING_POTION_COOLDOWN_MS;
  } else if (item === "attackPotion") {
    playerState.attackPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
  } else if (item === "magicPotion") {
    playerState.magicPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
  }
}

function consumableStatePayload(playerState) {
  return {
    hp: playerState.hp,
    maxHp: playerState.maxHp,
    totalHealingPotions: playerState.healingPotions,
    totalAttackPotions: playerState.attackPotions,
    totalMagicPotions: playerState.magicPotions,
    consumableCooldownUntil: playerState.consumableCooldownUntil,
    attackPotionCooldownUntil: playerState.attackPotionCooldownUntil,
    magicPotionCooldownUntil: playerState.magicPotionCooldownUntil,
    attackPotionUntil: playerState.attackPotionUntil,
    magicPotionUntil: playerState.magicPotionUntil
  };
}

function handleConsumableUse(playerId, socket, message) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0) return;
  const item = String(message.item || "");
  const inventoryKey = { healingPotion: "healingPotions", attackPotion: "attackPotions", magicPotion: "magicPotions" }[item];
  const now = Date.now();
  let reason = "";
  if (!inventoryKey) reason = "invalid";
  else if (consumableCooldownUntilForItem(playerState, item) > now) reason = "cooldown";
  else if ((Number(playerState[inventoryKey]) || 0) <= 0) reason = "empty";
  else if (item === "healingPotion" && playerState.hp >= playerState.maxHp) reason = "fullHp";
  if (reason) {
    sendJson(socket, { type: "consumableUseResult", success: false, item, reason, ...consumableStatePayload(playerState) });
    return;
  }
  playerState[inventoryKey] -= 1;
  setConsumableCooldown(playerState, item, now);
  if (item === "healingPotion") playerState.hp = Math.min(playerState.maxHp, playerState.hp + 20);
  if (item === "attackPotion") playerState.attackPotionUntil = now + POTION_BUFF_MS;
  if (item === "magicPotion") playerState.magicPotionUntil = now + POTION_BUFF_MS;
  sendJson(socket, { type: "consumableUseResult", success: true, item, ...consumableStatePayload(playerState) });
  broadcastToMap(playerState.mapId, { type: "playerConsumableEffect", playerId, item }, socket);
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
const MARNIE_WOOD_GOAL = 10;

const SHOP_VENDOR_CATALOGS = Object.freeze({
  cam: Object.freeze({
    npcType: "camoGuy",
    items: Object.freeze({
      arrows: Object.freeze({ price: 5, repeatable: true, resourceKey: "arrows", outputCount: 50, level: 1 }),
      hat_ranger: Object.freeze({ price: 20, level: 10 }),
      shirt_ranger: Object.freeze({ price: 30, level: 10 }),
      pants_ranger: Object.freeze({ price: 25, level: 10 }),
      weapon_dreamcatcher: Object.freeze({ price: 60, level: 20 })
    })
  }),
  myrtle: Object.freeze({
    npcType: "greenWitch",
    items: Object.freeze({
      weapon_sapgemWand: Object.freeze({ price: 20, level: 10 }),
      weapon_lostKey: Object.freeze({ price: 35, level: 15 }),
      weapon_hugeSunflower: Object.freeze({ price: 60, level: 20 }),
      hat_jester: Object.freeze({ price: 30, level: 20 }),
      shirt_jester: Object.freeze({ price: 45, level: 20 }),
      pants_jester: Object.freeze({ price: 35, level: 20 })
    })
  })
});

const SHOP_ITEM_IDS = new Set(
  Object.values(SHOP_VENDOR_CATALOGS).flatMap(vendor => Object.keys(vendor.items)).filter(itemId => itemId !== "arrows")
);

// Keep historical purchase IDs valid in old character saves even though Marnie
// no longer sells them and most are intentionally unavailable for now.
const SHOP_PURCHASE_HISTORY_ITEM_IDS = new Set([
  "weapon_sword", "weapon_axe", "weapon_katana", "weapon_oldSword", "weapon_bow", "weapon_dreamcatcher",
  "weapon_shepherdStaff", "weapon_lostKey", "weapon_hugeSunflower", "weapon_sapgemWand", "weapon_pickaxe",
  "weapon_wand", "weapon_rainWand",
  "hat_original", "hat_blueCap", "hat_wizard", "hat_jester", "hat_ninja", "hat_knight", "hat_bandana", "hat_ranger", "hat_wood", "hat_arcanist", "hat_greencap",
  "shirt_traveler", "shirt_jester", "shirt_ninja", "shirt_knight", "shirt_ranger", "shirt_wood", "shirt_arcanist", "shirt_greencap",
  "pants_traveler", "pants_jester", "pants_ninja", "pants_knight", "pants_ranger", "pants_wood", "pants_arcanist", "pants_greencap"
]);

function playerNearMarnie(playerState) {
  if (!playerState) return false;
  if (playerState.mapId === "spawn" && Math.hypot(playerState.x - FIRST_NPC_X, playerState.y - FIRST_NPC_Y) <= 48) return true;
  return playerNearPlacedInteraction(playerState, "shopkeeper", 48, 16);
}

function handleMarnieQuestInteract(playerId, socket, message) {
  const playerState = players.get(playerId);
  if (!playerState || !playerNearMarnie(playerState)) return;
  if (message?.action !== "turnInWood") return;

  if (playerState.marniePickaxeReceived) {
    sendJson(socket, { type: "marnieQuestResult", success: true, alreadyComplete: true, totalWood: playerState.wood });
    return;
  }
  if ((Number(playerState.wood) || 0) < MARNIE_WOOD_GOAL) {
    sendJson(socket, { type: "marnieQuestResult", success: false, reason: "needWood", totalWood: playerState.wood, goal: MARNIE_WOOD_GOAL });
    return;
  }
  playerState.wood -= MARNIE_WOOD_GOAL;
  playerState.marniePickaxeReceived = true;
  sendJson(socket, { type: "marnieQuestResult", success: true, totalWood: playerState.wood, goal: MARNIE_WOOD_GOAL });
}

function handleShopPurchase(playerId, socket, message) {
  const playerState = players.get(playerId);
  const itemId = typeof message.itemId === "string" ? message.itemId : "";
  const vendorId = typeof message.vendor === "string" ? message.vendor : "";
  const vendor = SHOP_VENDOR_CATALOGS[vendorId];
  const item = vendor?.items?.[itemId];
  if (!playerState || !vendor || !item) return;

  const validShop = playerNearPlacedInteraction(playerState, vendor.npcType, 48, 16);
  if (!validShop) {
    sendJson(socket, { type: "shopPurchaseResult", itemId, vendor: vendorId, success: false, reason: "tooFar", totalCoins: playerState.coins, price: item.price });
    return;
  }

  const requiredLevel = Math.max(1, Number(item.level) || 1);
  if (playerState.level < requiredLevel) {
    sendJson(socket, { type: "shopPurchaseResult", itemId, vendor: vendorId, success: false, reason: "needLevel", level: requiredLevel, totalCoins: playerState.coins, price: item.price });
    return;
  }

  if (!item.repeatable && playerState.shopPurchases.includes(itemId)) {
    sendJson(socket, { type: "shopPurchaseResult", itemId, vendor: vendorId, success: false, reason: "alreadyOwned", totalCoins: playerState.coins, price: item.price });
    return;
  }

  const price = Math.max(1, Number(item.price) || 1);
  if (playerState.coins < price) {
    sendJson(socket, { type: "shopPurchaseResult", itemId, vendor: vendorId, success: false, reason: "needCoin", totalCoins: playerState.coins, price });
    return;
  }

  playerState.coins -= price;
  if (item.repeatable && item.resourceKey === "arrows") {
    playerState.arrows += Math.max(1, Number(item.outputCount) || 1);
  } else {
    playerState.shopPurchases.push(itemId);
  }

  sendJson(socket, {
    type: "shopPurchaseResult",
    itemId,
    vendor: vendorId,
    success: true,
    price,
    totalCoins: playerState.coins,
    totalArrows: playerState.arrows
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
  const bucket = environmentMapBucket(mapId);
  if (!bucket) return [];

  if (!kind) {
    return [...bucket.values()];
  }

  return [...bucket.values()]
    .filter(entity => entity.kind === kind);
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
      ? 31
      : 26;

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
  if (entity.kind === "rock") return false;

  if (entity.kind === "tree") {
    if (
      entity.fireImmune ||
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
    fireDiagnostics.environmentIgnitions += 1;
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
  fireDiagnostics.environmentIgnitions += 1;
  return true;
}

function extinguishEnvironmentEntity(entity) {
  if (!entity) return false;
  if (entity.kind === "rock") return false;

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
  sourcePlayerId = null,
  burnDamagePerTick = STATUS_RULES.enemyBurnDamagePerTick
) {
  let changed = false;

  for (
    const enemy
    of sharedEnemiesOnMap(mapId)
  ) {
    if (!enemy.alive) continue;

    // Environmental fire may ignite an unburned enemy, but it must not keep
    // refreshing an active Burn back to its full duration every spread pulse.
    // Once the current Burn expires, a still-present fire source can ignite it
    // again naturally on a later pulse.
    if ((Number(enemy.burnTime) || 0) > 0) continue;

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
    changed = applyServerEnemyBurn(enemy, {
      sourcePlayerId,
      duration: STATUS_RULES.enemyBurnDuration,
      damagePerTick: burnDamagePerTick
    }) || changed;
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

    if (
      !playerOwnedEffectMayAffectTarget(
        sourcePlayerId,
        playerState
      )
    ) {
      continue;
    }

    const pvpSource =
      sourcePlayerId &&
      sourcePlayerId !== playerState.id
        ? players.get(sourcePlayerId)
        : null;

    if (!applyServerPlayerBurn(
      playerState,
      {
        duration:
          pvpSource
            ? PVP_PLAYER_BURN_DURATION
            : STATUS_RULES.playerBurnDuration,
        sourcePlayerId: sourcePlayerId || null
      }
    )) {
      continue;
    }

    if (pvpSource) {
      applyPvpCombatLock(pvpSource, playerState);
    }

    changed = true;
    broadcastServerPlayerBurnState(playerState);
  }

  return changed;
}

function spreadSharedEnvironmentFire() {
  const sources = [];
  fireDiagnostics.spreadPulses += 1;

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

    ensureServerEnemyStatusState(enemy);

    const profile = serverEnemyProfile(enemy);
    const body = serverEnemyBodyPoint(enemy);

    sources.push({
      mapId: enemy.mapId,
      sourcePlayerId: enemy.lastDamagePlayerId || enemy.aggroTargetId || null,
      burnDamagePerTick: enemy.burnDamagePerTick,
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
        sourcePlayerId:
          playerState.burnSourcePlayerId ||
          null,
        x: playerState.x,
        y: playerState.y - 8,
        radius: 13,
        chance: 0.42
      });
    }
  }

  fireDiagnostics.spreadSources += sources.length;

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
      source.sourcePlayerId || null,
      source.burnDamagePerTick || STATUS_RULES.enemyBurnDamagePerTick
    );

    igniteServerRainGrassNear(
      source.mapId,
      source.x,
      source.y,
      source.radius,
      source.sourcePlayerId || null
    );

  }
}

function spawnRockStoneDrops(rock) {
  const offsets = [-4, 4];
  for (const offsetX of offsets) {
    spawnSharedResource(
      rock.mapId,
      "stone",
      rock.x + offsetX,
      rock.y - 1
    );
  }
}

function damageServerRock(
  rock,
  amount = 1,
  sourcePlayerId = null,
  source = "mining"
) {
  if (
    !rock ||
    rock.kind !== "rock" ||
    rock.depleted
  ) {
    return false;
  }

  const damage = Math.max(1, Math.floor(Number(amount) || 1));
  rock.hp = Math.max(0, (Number(rock.hp) || rock.maxHp || 3) - damage);

  if (rock.hp <= 0) {
    rock.hp = 0;
    rock.depleted = true;
    rock.carriedBy = null;
    rock.pickupTime = 0;
    rock.hurlTime = 0;
    rock.hurlVelocityX = 0;
    rock.hurlVelocityY = 0;
    rock.hurlThrownBy = null;
    rock.rollTime = 0;
    rock.rollVelocityX = 0;
    rock.rollVelocityY = 0;
    scheduleRockRegrow(rock);
    spawnRockStoneDrops(rock);

    if (source === "mining" && sourcePlayerId) {
      sendToPlayer(sourcePlayerId, {
        type: "environmentReward",
        targetId: sourcePlayerId,
        reward: "miningExp",
        amount: 1
      });
    }
  }

  markEnvironmentDirty(rock, true);
  return rock.depleted;
}

function ensureServerRockHurlState(rock) {
  if (!rock || rock.kind !== "rock") return rock;

  rock.carriedBy =
    typeof rock.carriedBy === "string"
      ? rock.carriedBy
      : null;
  rock.pickupTime = Math.max(0, Number(rock.pickupTime) || 0);
  rock.pickupDuration = Math.max(0.01, Number(rock.pickupDuration) || 0.18);
  rock.pickupDirX = Number(rock.pickupDirX) || 0;
  rock.pickupDirY = Number(rock.pickupDirY) || 0;
  rock.hurlTime = Math.max(0, Number(rock.hurlTime) || 0);
  rock.hurlDuration = Math.max(0.01, Number(rock.hurlDuration) || 0.58);
  rock.hurlVelocityX = Number(rock.hurlVelocityX) || 0;
  rock.hurlVelocityY = Number(rock.hurlVelocityY) || 0;
  rock.hurlThrownBy =
    typeof rock.hurlThrownBy === "string"
      ? rock.hurlThrownBy
      : null;
  rock.rollTime = Math.max(0, Number(rock.rollTime) || 0);
  rock.rollDuration = Math.max(0.01, Number(rock.rollDuration) || 0.24);
  rock.rollVelocityX = Number(rock.rollVelocityX) || 0;
  rock.rollVelocityY = Number(rock.rollVelocityY) || 0;
  return rock;
}

function broadcastRockState(rock, stateCode) {
  if (!rock || rock.kind !== "rock") return;

  dirtyRockMotionIds.delete(rock.id);

  let packet;

  if (stateCode === "c") {
    packet = [
      rock.id,
      "c",
      rock.carriedBy || null,
      Number((rock.pickupTime || 0).toFixed(3)),
      Number((rock.pickupDirX || 0).toFixed(2)),
      Number((rock.pickupDirY || 0).toFixed(2))
    ];
  } else if (stateCode === "t") {
    packet = [
      rock.id,
      "t",
      Number((rock.x || 0).toFixed(2)),
      Number((rock.y || 0).toFixed(2)),
      Number((rock.hurlDuration || 0.58).toFixed(3)),
      Number((rock.hurlVelocityX || 0).toFixed(2)),
      Number((rock.hurlVelocityY || 0).toFixed(2))
    ];
  } else if (stateCode === "r") {
    packet = [
      rock.id,
      "r",
      Number((rock.x || 0).toFixed(2)),
      Number((rock.y || 0).toFixed(2)),
      Number((rock.rollDuration || 0.24).toFixed(3)),
      Number((rock.rollVelocityX || 0).toFixed(2)),
      Number((rock.rollVelocityY || 0).toFixed(2))
    ];
  } else {
    packet = [
      rock.id,
      "i",
      Number((rock.x || 0).toFixed(2)),
      Number((rock.y || 0).toFixed(2))
    ];
  }

  broadcastToMap(rock.mapId, {
    type: "rockState",
    mapId: rock.mapId,
    rock: packet
  });
}

function clearServerRockHurlState(rock) {
  if (!rock || rock.kind !== "rock") return;
  rock.carriedBy = null;
  rock.pickupTime = 0;
  rock.pickupDirX = 0;
  rock.pickupDirY = 0;
  rock.hurlTime = 0;
  rock.hurlVelocityX = 0;
  rock.hurlVelocityY = 0;
  rock.hurlThrownBy = null;
  rock.rollTime = 0;
  rock.rollVelocityX = 0;
  rock.rollVelocityY = 0;
  broadcastRockState(rock, "i");
}

function playerCarriesAnyHurlObject(playerId) {
  if (!playerId) return false;

  if (
    allSharedEnemies().some(enemy =>
      enemy.carriedBy === playerId
    )
  ) {
    return true;
  }

  return environmentEntitiesOnMap(
    players.get(playerId)?.mapId,
    "rock"
  ).some(rock => rock.carriedBy === playerId);
}

function finishServerRockHurl(rock) {
  if (!rock || rock.kind !== "rock") return;
  clearServerRockHurlState(rock);
}

function startServerRockLandingRoll(rock) {
  if (!rock || rock.kind !== "rock") return;

  const velocityX = Number(rock.hurlVelocityX) || 0;
  const velocityY = Number(rock.hurlVelocityY) || 0;
  const speed = Math.hypot(velocityX, velocityY);

  rock.carriedBy = null;
  rock.pickupTime = 0;
  rock.hurlTime = 0;
  rock.hurlThrownBy = null;
  rock.hurlVelocityX = 0;
  rock.hurlVelocityY = 0;

  if (speed < 1) {
    rock.rollTime = 0;
    rock.rollVelocityX = 0;
    rock.rollVelocityY = 0;
    broadcastRockState(rock, "i");
    return;
  }

  const rollSpeed = 68;
  rock.rollTime = rock.rollDuration;
  rock.rollVelocityX = (velocityX / speed) * rollSpeed;
  rock.rollVelocityY = (velocityY / speed) * rollSpeed;
  broadcastRockState(rock, "r");
}

function rockRollHitsEnemy(rock, x, y) {
  return sharedEnemiesOnMap(rock.mapId).some(target =>
    target.alive &&
    !target.carriedBy &&
    Math.hypot(target.x - x, target.y - y) <= 9
  );
}

function tickServerRockRoll(rock, dt) {
  if ((Number(rock.rollTime) || 0) <= 0) return false;

  const duration = Math.max(0.01, Number(rock.rollDuration) || 0.24);
  const remainingFraction = Math.max(0, Math.min(1, rock.rollTime / duration));
  const velocityX = (Number(rock.rollVelocityX) || 0) * remainingFraction;
  const velocityY = (Number(rock.rollVelocityY) || 0) * remainingFraction;
  const nextX = rock.x + velocityX * dt;
  const nextY = rock.y + velocityY * dt;

  rock.rollTime = Math.max(0, rock.rollTime - dt);

  if (
    !mapPointAllowed(rock.mapId, nextX, nextY) ||
    hurlObjectHitsTree(rock.mapId, nextX, nextY) ||
    rockRollHitsEnemy(rock, nextX, nextY)
  ) {
    finishServerRockHurl(rock);
    return true;
  }

  rock.x = nextX;
  rock.y = nextY;
  markEnvironmentDirty(rock);

  if (rock.rollTime <= 0) {
    finishServerRockHurl(rock);
  }

  return true;
}

function tryRockHurlCollision(rock) {
  const attackerId = rock.hurlThrownBy;
  const velocityX = rock.hurlVelocityX;
  const velocityY = rock.hurlVelocityY;

  for (const target of sharedEnemiesOnMap(rock.mapId)) {
    if (
      !target.alive ||
      target.carriedBy ||
      target.hurlTime > 0
    ) {
      continue;
    }

    if (Math.hypot(target.x - rock.x, target.y - rock.y) > 11) {
      continue;
    }

    broadcastHurlEnemyDamage(
      target,
      8 + Math.floor(Math.random() * 5),
      attackerId,
      "hurlRock",
      velocityX,
      velocityY
    );

    if (damageServerRock(rock, 1, attackerId, "hurl")) {
      return true;
    }

    finishServerRockHurl(rock);
    return true;
  }

  if (
    hurlObjectHitsTree(
      rock.mapId,
      rock.x,
      rock.y
    )
  ) {
    // Trees are solid Hurl obstacles, not Hurl damage targets. The impact still
    // chips the thrown rock itself.
    if (damageServerRock(rock, 1, attackerId, "hurl")) {
      return true;
    }
    finishServerRockHurl(rock);
    return true;
  }

  return false;
}

function tickServerRockHurl(rock, dt) {
  ensureServerRockHurlState(rock);

  if (rock.carriedBy) {
    const carrier = players.get(rock.carriedBy);

    if (
      !carrier ||
      carrier.hp <= 0 ||
      carrier.mapId !== rock.mapId
    ) {
      clearServerRockHurlState(rock);
      return;
    }

    // Carried rocks piggyback visually on the already-replicated player
    // position. Keep the authoritative server coordinate current for a future
    // throw/disconnect, but send no rock motion packets while carried.
    rock.x = carrier.x;
    rock.y = carrier.y;
    rock.pickupTime = Math.max(0, rock.pickupTime - dt);
    return;
  }

  if (tickServerRockRoll(rock, dt)) return;
  if (rock.hurlTime <= 0) return;

  rock.hurlTime = Math.max(0, rock.hurlTime - dt);

  const nextX = rock.x + rock.hurlVelocityX * dt;
  const nextY = rock.y + rock.hurlVelocityY * dt;

  // The large black void is visual space, not legal Hurl space. Rocks land at
  // their last valid grass position when their center hits the island wall.
  if (!mapPointAllowed(rock.mapId, nextX, nextY)) {
    if (!damageServerRock(rock, 1, rock.hurlThrownBy, "hurl")) {
      finishServerRockHurl(rock);
    }
    return;
  }

  rock.x = nextX;
  rock.y = nextY;
  markEnvironmentDirty(rock);

  if (tryRockHurlCollision(rock)) return;

  if (rock.hurlTime <= 0) {
    if (damageServerRock(rock, 1, rock.hurlThrownBy, "hurl")) {
      return;
    }
    startServerRockLandingRoll(rock);
  }
}

function handleRockHurlAction(
  playerId,
  rock,
  action,
  payload
) {
  const playerState = players.get(playerId);

  if (
    !playerState ||
    playerState.hp <= 0 ||
    !rock ||
    rock.kind !== "rock" ||
    rock.depleted ||
    rock.mapId !== playerState.mapId
  ) {
    return;
  }

  ensureServerRockHurlState(rock);

  if (action === "hurlGrab") {
    if (rock.carriedBy || rock.hurlTime > 0 || rock.rollTime > 0) return;
    if (playerCarriesAnyHurlObject(playerId)) return;

    const distance = Math.hypot(
      rock.x - playerState.x,
      rock.y - playerState.y
    );

    if (distance > 24) return;

    if (
      sharedEnemyActionRateLimited(
        playerId,
        rock.id,
        "rockHurlGrab",
        300
      )
    ) {
      return;
    }

    const pickupDx = rock.x - playerState.x;
    const pickupDy = rock.y - playerState.y;
    const pickupLength = Math.hypot(pickupDx, pickupDy) || 1;

    rock.carriedBy = playerId;
    rock.pickupTime = rock.pickupDuration;
    rock.pickupDirX = pickupDx / pickupLength;
    rock.pickupDirY = pickupDy / pickupLength;
    rock.hurlTime = 0;
    rock.hurlVelocityX = 0;
    rock.hurlVelocityY = 0;
    rock.hurlThrownBy = null;
    rock.rollTime = 0;
    rock.rollVelocityX = 0;
    rock.rollVelocityY = 0;
    broadcastRockState(rock, "c");
    return;
  }

  if (action === "hurlThrow") {
    if (rock.carriedBy !== playerId) return;

    const aimAngle = Number(payload.aimAngle);
    if (!Number.isFinite(aimAngle)) return;

    if (
      sharedEnemyActionRateLimited(
        playerId,
        rock.id,
        "rockHurlThrow",
        220
      )
    ) {
      return;
    }

    const throwSpeed = 126;

    rock.x = playerState.x;
    rock.y = playerState.y;
    rock.carriedBy = null;
    rock.pickupTime = 0;
    rock.pickupDirX = 0;
    rock.pickupDirY = 0;
    rock.hurlTime = rock.hurlDuration;
    rock.hurlVelocityX = Math.cos(aimAngle) * throwSpeed;
    rock.hurlVelocityY = Math.sin(aimAngle) * throwSpeed;
    rock.hurlThrownBy = playerId;
    rock.rollTime = 0;
    rock.rollVelocityX = 0;
    rock.rollVelocityY = 0;
    broadcastRockState(rock, "t");
  }
}

function tickSharedEnvironment(dt) {
  const now = Date.now();

  for (const entity of sharedEnvironment.values()) {
    if (entity.kind === "rock") {
      if (
        entity.depleted &&
        entity.regrowAt > 0 &&
        now >= entity.regrowAt
      ) {
        if (!livingPlayerNearRockHome(entity)) {
          resetRockToFresh(entity);
        }
        continue;
      }

      if (!entity.depleted) {
        tickServerRockHurl(entity, dt);
      }
      continue;
    }

    if (
      entity.kind === "tree" &&
      entity.falling
    ) {
      entity.fallTime -= dt;

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
          sendToPlayer(entity.lastHitPlayerId, {
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
          scheduleFlowerRegrow(entity);
        }

        markEnvironmentDirty(entity);
      }
    }

    if (
      entity.kind === "tree" &&
      entity.regrowAt > 0 &&
      now >= entity.regrowAt
    ) {
      if (!livingPlayerNearEnvironmentHome(entity)) {
        resetTreeToFresh(entity);
      }
      continue;
    }

    if (
      entity.kind === "grass" &&
      entity.regrowAt > 0 &&
      now >= entity.regrowAt
    ) {
      resetGrassToFresh(entity);
      continue;
    }

    if (
      entity.kind === "flower" &&
      entity.regrowAt > 0 &&
      now >= entity.regrowAt
    ) {
      if (!livingPlayerNearEnvironmentHome(entity)) {
        resetFlowerToFresh(entity);
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
    spreadServerRainGrassFire();
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
    const dimensions = mapWorldDimensions(playerState.mapId);

    const x = clampNumber(
      payload.x,
      0,
      dimensions.width,
      playerState.x
    );

    const y = clampNumber(
      payload.y,
      0,
      dimensions.height,
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
      igniteServerRainGrassNear(
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
      extinguishServerRainGrassNear(
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

  if (
    entity.kind === "rock" &&
    (
      action === "hurlGrab" ||
      action === "hurlThrow"
    )
  ) {
    handleRockHurlAction(
      playerId,
      entity,
      action,
      payload
    );
    return;
  }

  if (action === "hitRock") {
    if (
      entity.kind !== "rock" ||
      entity.depleted ||
      entity.carriedBy ||
      entity.hurlTime > 0 ||
      entity.rollTime > 0 ||
      !environmentMeleeValid(
        playerState,
        entity,
        [11],
        8,
        7,
        0.92
      ) ||
      sharedEnemyActionRateLimited(
        playerId,
        entity.id,
        "mineRock",
        250
      )
    ) {
      return;
    }

    damageServerRock(entity, 1, playerId, "mining");
    return;
  }

  if (action === "hitTree") {
    if (
      entity.kind !== "tree" ||
      entity.nonInteractive ||
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
    scheduleFlowerRegrow(entity);

    if (!entity.looted) {
      entity.looted = true;

      spawnSharedResource(
        entity.mapId,
        "flower",
        entity.x + 3,
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

function sharedCoinSnapshot(mapId = null) {
  return [...sharedCoins.values()]
    .filter(coin => !mapId || coin.mapId === mapId)
    .map(coin => ({
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

  broadcastToMap(mapId, {
    type: "coinSpawn",
    coin: {
      ...coin
    }
  });

  return coin;
}

function removeSharedCoin(coinId, reason = "expired") {
  if (!sharedCoins.has(coinId)) return false;

  const coin = sharedCoins.get(coinId);
  sharedCoins.delete(coinId);

  broadcastToMap(coin?.mapId, {
    type: "coinRemoved",
    coinId,
    mapId: coin?.mapId || null,
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

  // Match the generous loot-magnet behavior. The extra authoritative grace
  // accounts for the player moving between their last replicated position and
  // the local pickup trigger.
  if (distance > SHARED_LOOT_PICKUP_RADIUS) return;

  // Delete before broadcasting so two clients racing for the same coin cannot
  // both be approved.
  sharedCoins.delete(coin.id);

  playerState.coins =
    (Number.isFinite(playerState.coins) ? playerState.coins : 0) + 1;

  broadcastToMap(coin.mapId, {
    type: "coinPicked",
    coinId: coin.id,
    mapId: coin.mapId,
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
    aggroMode: ENEMY_AGGRO_PROXIMITY,

    aggroTargetId: null,
    aggroEngagementTime: 0,
    confusionTime: 0,
    confusionTargetId: null,
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0,
    wanderStuckTime: 0,
    wanderRadiusX: 24,
    wanderRadiusY: 18,

    maxHp: 270,
    hp: 270,
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
    aggroMode: ENEMY_AGGRO_PROXIMITY,

    aggroTargetId: null,
    aggroEngagementTime: 0,
    confusionTime: 0,
    confusionTargetId: null,
    outOfCombatTime: 0,
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

    // Passive ghosts now use the same locked-destination "train track" rule
    // as other ordinary mobs. They still phase through terrain.
    wanderTargetX: x,
    wanderTargetY: y,
    pauseTime: 0,
    wanderStuckTime: 0,
    wanderRadiusX: 48,
    wanderRadiusY: 30,

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
    patrolRadius: 85,
    aggroMode: ENEMY_AGGRO_PROXIMITY,

    aggroTargetId: null,
    aggroEngagementTime: 0,
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
  mushroom: makeServerMushroom,
  crab: makeServerCrab,
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

const sharedMushrooms =
  worldEntitiesByType.get("mushroom") || [];

const sharedCrabs =
  worldEntitiesByType.get("crab") || [];

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

    // Compact, server-assigned identity for high-frequency replication. The
    // stable string id remains the gameplay/persistence identity; networkId is
    // only a dense transport handle learned from authoritative snapshots.
    entity.networkId = worldEntitiesById.size + 1;

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

function sharedEnemySnapshot(enemyType, mapId = null) {
  const collection =
    sharedEnemyCollections[enemyType] || [];

  return collection
    .filter(enemy => !mapId || enemy.mapId === mapId)
    .map(enemy => {
      ensureServerEnemyStatusState(enemy);

      return ({
    id: enemy.id,
    networkId: enemy.networkId,
    mapId: enemy.mapId,
    x: Number(enemy.x.toFixed(2)),
    y: Number(enemy.y.toFixed(2)),
    dir: enemy.dir,
    level: enemy.level,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    alive: enemy.alive,
    aggroTargetId: enemy.aggroTargetId || null,
    confusionTime: Number((enemy.confusionTime || 0).toFixed(2)),
    confusionTargetId: enemy.confusionTargetId || null,
    burnTime: Number(enemy.burnTime.toFixed(2)),
    burnDamagePerTick: enemy.burnDamagePerTick,
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

function sendSharedEnemySnapshotsToSocket(socket, mapId, includeSyncComplete = false) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  for (
    const enemyType
    of Object.keys(
      sharedEnemyCollections
    )
  ) {
    sendJson(socket, {
      type: "enemySnapshot",
      enemyType,
      mapId,
      enemies: sharedEnemySnapshot(enemyType, mapId)
    });
  }

  if (includeSyncComplete) {
    sendJson(socket, {
      type: "enemySnapshotSyncComplete",
      mapId
    });
  }
}

function passiveIntentSnapshotGroups(mapId) {
  const groups = {};
  let sentRecords = 0;

  for (const enemyType of Object.keys(sharedEnemyCollections)) {
    const states = sharedEnemySnapshot(enemyType, mapId);

    for (const state of states) {
      const enemy = worldEntitiesById.get(state.id);
      if (!enemy || !enemy.alive || enemy.mapId !== mapId) continue;
      if (enemyNeedsPreciseMotion(enemy)) continue;

      const motionCache = enemyMotionNetworkCache.get(state.id) || {
        velocityX: 0,
        velocityY: 0,
        passiveTargetX: Number(state.x) || 0,
        passiveTargetY: Number(state.y) || 0,
        passiveSpeed: 0,
        passiveDir: state.dir === -1 ? -1 : 1,
        passiveIntentKey: null,
        passiveAnchorX: Number(state.x) || 0,
        passiveAnchorY: Number(state.y) || 0,
        passiveSentTargetX: Number(state.x) || 0,
        passiveSentTargetY: Number(state.y) || 0,
        passiveSentSpeed: 0,
        passiveSentStartDelayMs: 0,
        passiveSentDir: state.dir === -1 ? -1 : 1,
        passiveSentIntentKey: null,
        observedX: Number(state.x) || 0,
        observedY: Number(state.y) || 0,
        observedAt: Date.now()
      };

      const descriptor = enemyPassiveIntentDescriptor(
        enemyType,
        enemy,
        state,
        motionCache
      );

      if (!groups[enemyType]) groups[enemyType] = [];
      groups[enemyType].push(descriptor.record);
      sentRecords += 1;
    }
  }

  return sentRecords > 0 ? groups : null;
}

function sendPassiveIntentSnapshotToSocket(socket, mapId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;

  const groups = passiveIntentSnapshotGroups(mapId);
  if (!groups) return false;

  sendJson(socket, {
    type: "enemyWanderIntent",
    mapId,
    groups
  });

  return true;
}

function broadcastSharedEnemySnapshots() {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    const playerId = client.playerId;
    const playerState =
      typeof playerId === "string"
        ? players.get(playerId)
        : null;
    const mapId = playerState?.mapId || "spawn";

    sendSharedEnemySnapshotsToSocket(client, mapId);
  }
}

// -----------------------------------------------------------------------------
// ENEMY NETWORK BANDWIDTH
// -----------------------------------------------------------------------------
// Full enemy snapshots are intentionally reserved for connect/map-entry and a
// slow correction keyframe. Normal play sends:
//   1) compact movement/animation records only when an enemy actually moves;
//   2) compact authoritative HP deltas only when no combat event carried HP;
//   3) compact low-frequency state transitions keyed by numeric network ID.
//
// Countdown-style transitions are replicated on meaningful start/extend/end;
// clients advance visual copies locally between authoritative updates.
// Precise combat motion is intentionally lower-rate than the server simulation.
// Clients interpolate + briefly extrapolate compact integer-pixel anchors.
const ENEMY_NETWORK_DELTA_HZ = 8;
const ENEMY_NETWORK_KEYFRAME_MS = 10000;
const ENEMY_MOTION_MIN_DISTANCE = 0.5;
const ENEMY_MOTION_HEARTBEAT_MS = 750;
const ENEMY_ACTIVE_MOVING_SPEED_EPSILON = 0.5;

// Passive enemies use long-lived, server-authoritative movement legs. Once a
// destination is chosen the AI is locked to that leg until it arrives (or a
// gameplay state such as aggro interrupts it). Networking therefore sends one
// enemyWanderIntent at the start of the leg and no movement refresh heartbeat.
// The 75 ms check below is only a cheap state/plan change detector; it does not
// re-plan movement and emits nothing while the locked leg is unchanged.
const ENEMY_PASSIVE_INTENT_CHECK_MS = 75;

// Safety valve for a genuinely obstructed passive leg. A destination may be
// abandoned only after the server has failed to make meaningful movement for
// this long; ordinary in-transit mobs never reconsider their destination.
const ENEMY_PASSIVE_STUCK_REPLAN_SECONDS = 1.0;

// Temporary, deliberately strict bridge between combat and passive wandering.
// A mob that has been engaged must return to its home position before becoming
// passive again. Returning mobs remain in the precise server stream and ignore
// player interaction until they arrive. This keeps the authority handoff clean
// while we validate the new planner; interruption can be added later.
const ENEMY_RETURN_HOME_ARRIVAL_DISTANCE = 1.5;
const ENEMY_RETURN_HOME_STUCK_SECONDS = 2.0;
const ENEMY_PASSIVE_PLAN_TICK_MS = Math.round(1000 / ENEMY_NETWORK_DELTA_HZ);
// Promote a passive enemy before it reaches melee/contact range so any visual
// drift can reconcile while the creature is still approaching the player.
const ENEMY_PRECISE_NEAR_PLAYER_DISTANCE = 72;
const ENEMY_PASSIVE_SPEED_EPSILON = 0.08;
const ENEMY_PASSIVE_TARGET_EPSILON = 0.75;
const ENEMY_PASSIVE_SPEED_CHANGE_EPSILON = 0.35;

// Enemy replication is split by semantic lifetime instead of sending generic
// object patches. Motion owns position, dedicated combat events own direct-hit
// HP and one-shot effects, enemyHealthDelta catches authoritative HP mutations
// that had no combat event (notably Burn ticks), and enemyStateDelta carries
// only low-frequency transitions that cannot be derived locally.
//
// Wet is intentionally absent here. Rain geometry is already authoritative and
// replicated, and clients derive continuous Wet + its 3s linger from that same
// geometry. Re-sending wetTime while the server continuously refreshed it was
// one of the largest sources of redundant state traffic in combat-heavy Rain.
const ENEMY_STATE = ENEMY_NET_PROTOCOL.STATE;
const ENEMY_NET_SCALE = ENEMY_NET_PROTOCOL.SCALE;
const ENEMY_BURN_EXTENSION_SYNC_MS = 250;

const enemyMotionNetworkCache = new Map();
const enemyStateNetworkCache = new Map();
const enemyHealthNetworkCache = new Map();
const pendingPassiveEnemyIntents = new Map();
const passiveEnemyNetworkDiagnostics = new Map();
let lastEnemyNetworkKeyframeAt = Date.now();

function sendEncodedToMap(mapId, encoded) {
  let recipients = 0;
  const type = encodedMessageType(encoded);
  const bucket = socketMapBucket(mapId);

  if (bucket) {
    for (const client of bucket) {
      if (client.readyState !== WebSocket.OPEN) continue;

      if (sendEncoded(client, encoded, type)) {
        recipients += 1;
      }
    }
  }

  recordWsLogicalOutbound(encoded, type, recipients);
  return recipients;
}

function mapHasNetworkRecipients(mapId) {
  const bucket = socketMapBucket(mapId);
  if (!bucket?.size) return false;
  for (const client of bucket) {
    if (client.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

function passiveDiagForMap(mapId) {
  let entry = passiveEnemyNetworkDiagnostics.get(mapId);
  if (!entry) {
    entry = {
      decisions: 0,
      heartbeats: 0,
      transitions: 0,
      queued: 0,
      coalesced: 0,
      sentRecords: 0,
      sentEvents: 0,
      promotions: 0,
      demotions: 0,
      droppedOnPromote: 0,
      promotionSamples: 0,
      promotionSyncAgeMs: 0,
      promotionServerDelta: 0,
      promotionServerDeltaMax: 0,
      promotionEstimatedDrift: 0,
      promotionEstimatedDriftMax: 0
    };
    passiveEnemyNetworkDiagnostics.set(mapId, entry);
  }
  return entry;
}

function pendingPassiveMap(mapId) {
  let pending = pendingPassiveEnemyIntents.get(mapId);
  if (!pending) {
    pending = new Map();
    pendingPassiveEnemyIntents.set(mapId, pending);
  }
  return pending;
}

function queuePassiveEnemyIntent(mapId, enemyType, enemyId, reason = "decision") {
  const pending = pendingPassiveMap(mapId);
  const hadPending = pending.has(enemyId);

  if (mapHasNetworkRecipients(mapId)) {
    const diag = passiveDiagForMap(mapId);
    if (hadPending) {
      diag.coalesced += 1;
    } else {
      diag.queued += 1;
    }

    if (reason === "decision") diag.decisions += 1;
    if (reason === "heartbeat") diag.heartbeats += 1;
    if (reason === "transition") diag.transitions += 1;
  }

  pending.set(enemyId, { enemyType, enemyId });
}

function discardPendingPassiveEnemyIntent(mapId, enemyId) {
  const pending = pendingPassiveEnemyIntents.get(mapId);
  if (!pending?.has(enemyId)) return false;
  pending.delete(enemyId);
  if (!pending.size) pendingPassiveEnemyIntents.delete(mapId);
  return true;
}

function passiveServerDeltaSinceLastSync(cache, currentX, currentY) {
  if (!cache || !Number.isFinite(cache.passiveAnchorX) || !Number.isFinite(cache.passiveAnchorY)) {
    return 0;
  }
  return Math.hypot(
    currentX - cache.passiveAnchorX,
    currentY - cache.passiveAnchorY
  );
}

function passiveEstimatedClientDrift(cache, currentX, currentY, now) {
  if (
    !cache ||
    !cache.passiveSentAt ||
    !Number.isFinite(cache.passiveAnchorX) ||
    !Number.isFinite(cache.passiveAnchorY) ||
    !Number.isFinite(cache.passiveSentTargetX) ||
    !Number.isFinite(cache.passiveSentTargetY)
  ) {
    return 0;
  }

  const anchorX = cache.passiveAnchorX;
  const anchorY = cache.passiveAnchorY;
  const targetX = cache.passiveSentTargetX;
  const targetY = cache.passiveSentTargetY;
  const speed = Math.max(0, Number(cache.passiveSentSpeed) || 0);
  const dx = targetX - anchorX;
  const dy = targetY - anchorY;
  const distance = Math.hypot(dx, dy);
  const startDelayMs = Math.max(0, Number(cache.passiveSentStartDelayMs) || 0);
  const elapsed = Math.max(
    0,
    now - cache.passiveSentAt - startDelayMs
  ) / 1000;

  let estimatedX = anchorX;
  let estimatedY = anchorY;

  if (distance > 0.001 && speed > 0) {
    const travelled = Math.min(distance, speed * elapsed);
    estimatedX = anchorX + (dx / distance) * travelled;
    estimatedY = anchorY + (dy / distance) * travelled;
  }

  return Math.hypot(
    currentX - estimatedX,
    currentY - estimatedY
  );
}

function flushPassiveEnemyIntents(mapId, now) {
  const pending = pendingPassiveEnemyIntents.get(mapId);
  if (!pending?.size) return false;

  const groups = {};
  let sentRecords = 0;

  for (const { enemyType, enemyId } of pending.values()) {
    const enemy = worldEntitiesById.get(enemyId);
    const motionCache = enemyMotionNetworkCache.get(enemyId);

    if (
      !enemy ||
      !enemy.alive ||
      enemy.mapId !== mapId ||
      enemyNeedsPreciseMotion(enemy) ||
      !motionCache
    ) {
      continue;
    }

    const state = {
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      dir: enemy.dir
    };
    const descriptor = enemyPassiveIntentDescriptor(
      enemyType,
      enemy,
      state,
      motionCache
    );

    if (!groups[enemyType]) groups[enemyType] = [];
    groups[enemyType].push(descriptor.record);
    sentRecords += 1;

    motionCache.record = enemyMotionRecord(state, enemy);
    motionCache.passiveSentAt = now;
    motionCache.passiveTargetX = descriptor.targetX;
    motionCache.passiveTargetY = descriptor.targetY;
    motionCache.passiveSpeed = descriptor.speed;
    motionCache.passiveDir = descriptor.dir;
    motionCache.passiveIntentKey = descriptor.intentKey;
    motionCache.passiveAnchorX = Number(enemy.x) || 0;
    motionCache.passiveAnchorY = Number(enemy.y) || 0;
    // Keep a separate copy of what was actually transmitted. The observed
    // passive target can change again before the next network tick, and using
    // an unsent target would make promotion-drift diagnostics lie.
    motionCache.passiveSentTargetX = descriptor.targetX;
    motionCache.passiveSentTargetY = descriptor.targetY;
    motionCache.passiveSentSpeed = descriptor.speed;
    motionCache.passiveSentStartDelayMs = descriptor.startDelayMs;
    motionCache.passiveSentDir = descriptor.dir;
    motionCache.passiveSentIntentKey = descriptor.intentKey;
    motionCache.sentAt = now;
  }

  pending.clear();
  pendingPassiveEnemyIntents.delete(mapId);

  if (!sentRecords) return false;

  const recipients = sendEncodedToMap(
    mapId,
    JSON.stringify({
      type: "enemyWanderIntent",
      mapId,
      groups
    })
  );

  if (recipients > 0) {
    const diag = passiveDiagForMap(mapId);
    diag.sentRecords += sentRecords;
    diag.sentEvents += 1;
  }
  return recipients > 0;
}

function enemyHasNearbyPlayer(enemy, maxDistance = ENEMY_PRECISE_NEAR_PLAYER_DISTANCE) {
  const maxDistanceSq = maxDistance * maxDistance;

  for (const playerState of players.values()) {
    if (!playerIsVisibleToEnemy(playerState, enemy.mapId, enemy.x, enemy.y)) {
      continue;
    }

    const dx = (Number(playerState.x) || 0) - (Number(enemy.x) || 0);
    const dy = (Number(playerState.y) || 0) - (Number(enemy.y) || 0);

    if (dx * dx + dy * dy <= maxDistanceSq) {
      return true;
    }
  }

  return false;
}

function enemyPreciseMotionReasons(enemy) {
  if (!enemy || !enemy.alive) return [];

  const reasons = [];

  // Keep this list exactly aligned with enemyNeedsPreciseMotion(). It is also
  // surfaced in the local diagnostics so we can see why passive networking is
  // (or is not) engaging on a real map instead of guessing from packet totals.
  if (enemy.type === "bigGoldSlime") reasons.push("boss");
  if (enemy.returningHome) reasons.push("returningHome");
  if (!enemy.returningHome && enemyHasNearbyPlayer(enemy)) reasons.push("nearby");
  if (enemy.aggroTargetId) reasons.push("aggroTarget");
  if ((Number(enemy.confusionTime) || 0) > 0 || enemy.confusionTargetId) reasons.push("confusion");
  if ((Number(enemy.tauntTime) || 0) > 0 || enemy.tauntOwnerId) reasons.push("redirect");
  if (enemy.carriedBy) reasons.push("carried");
  if ((Number(enemy.pickupTime) || 0) > 0) reasons.push("pickup");
  if ((Number(enemy.hurlTime) || 0) > 0) reasons.push("hurl");
  if ((Number(enemy.lungeTime) || 0) > 0) reasons.push("lunge");
  if ((Number(enemy.snareRootTime) || 0) > 0) reasons.push("snareRoot");
  if ((Number(enemy.snareSlowTime) || 0) > 0) reasons.push("snareSlow");
  // Wet and Magic Grass are derived speed modifiers. They do not promote a
  // passive enemy into the 10 Hz precise-motion stream; a changed effective
  // speed produces one new passive wander intent instead.
  if (
    Math.hypot(
      Number(enemy.knockbackX) || 0,
      Number(enemy.knockbackY) || 0
    ) > 0.25
  ) reasons.push("knockback");

  return reasons;
}

function enemyNeedsPreciseMotion(enemy) {
  return enemyPreciseMotionReasons(enemy).length > 0;
}

function enemyPassiveIntentDescriptor(enemyType, enemy, state, motionCache) {
  const currentX = Number(state.x) || 0;
  const currentY = Number(state.y) || 0;
  const velocityX = Number(motionCache?.velocityX) || 0;
  const velocityY = Number(motionCache?.velocityY) || 0;
  const sampledSpeed = Math.hypot(velocityX, velocityY);

  let targetX = currentX;
  let targetY = currentY;
  let speed = 0;
  let startDelayMs = 0;
  let intentKey = "idle";
  let stableTarget = false;

  if (
    enemyType === "slime" ||
    enemyType === "mushroom" ||
    enemyType === "crab" ||
    enemyType === "goblin" ||
    enemyType === "ghost"
  ) {
    targetX = Number(enemy?.wanderTargetX);
    targetY = Number(enemy?.wanderTargetY);

    if (!Number.isFinite(targetX)) targetX = currentX;
    if (!Number.isFinite(targetY)) targetY = currentY;

    const distanceToTarget = Math.hypot(
      targetX - currentX,
      targetY - currentY
    );
    const pauseSeconds = Math.max(0, Number(enemy?.pauseTime) || 0);
    // A newly-chosen target can intentionally begin with a short idle pause.
    // Send that pause as part of the plan instead of sending speed=0 now and a
    // second speed>0 packet a few hundred milliseconds later.
    startDelayMs = Math.round(Math.min(1.5, pauseSeconds) * 1000);
    const derivedMovementMultiplier = serverEnemyMovementMultiplier(enemy);
    speed = distanceToTarget > 1.25
      ? Math.max(0, Number(enemy?.speed) || sampledSpeed) * derivedMovementMultiplier
      : 0;
    stableTarget = true;
    intentKey = `target:${targetX.toFixed(1)}:${targetY.toFixed(1)}:${speed.toFixed(1)}`;
  } else {
    // Fallback for any future passive species without explicit wander targets.
    // Give the client a generous point along the sampled movement vector.
    if (sampledSpeed > ENEMY_PASSIVE_SPEED_EPSILON) {
      const ux = velocityX / sampledSpeed;
      const uy = velocityY / sampledSpeed;
      targetX = currentX + ux * 64;
      targetY = currentY + uy * 64;
      speed = sampledSpeed;
      intentKey = `vector:${(Math.round(ux * 20) / 20).toFixed(2)}:${(Math.round(uy * 20) / 20).toFixed(2)}`;
    }
  }

  return {
    record: [
      enemy.networkId,
      Number(currentX.toFixed(1)),
      Number(currentY.toFixed(1)),
      Number(Number(targetX).toFixed(1)),
      Number(Number(targetY).toFixed(1)),
      Number(Number(speed).toFixed(1)),
      state.dir === -1 ? -1 : 1,
      Math.max(0, Math.round(startDelayMs))
    ],
    targetX: Number(targetX),
    targetY: Number(targetY),
    speed: Number(speed),
    startDelayMs: Math.max(0, Math.round(startDelayMs)),
    dir: state.dir === -1 ? -1 : 1,
    intentKey,
    stableTarget
  };
}

function passiveIntentQueueReason(cache, descriptor, now) {
  if (!cache) return "decision";

  const targetDx = descriptor.targetX - (Number(cache.passiveTargetX) || 0);
  const targetDy = descriptor.targetY - (Number(cache.passiveTargetY) || 0);
  const targetChanged =
    descriptor.stableTarget &&
    targetDx * targetDx + targetDy * targetDy >=
      ENEMY_PASSIVE_TARGET_EPSILON * ENEMY_PASSIVE_TARGET_EPSILON;

  const intentChanged =
    descriptor.intentKey !== cache.passiveIntentKey;

  const speedChanged =
    Math.abs(descriptor.speed - (Number(cache.passiveSpeed) || 0)) >=
    ENEMY_PASSIVE_SPEED_CHANGE_EPSILON;

  // Facing is derived naturally from the path on the browser. A direction
  // flip by itself is not a new network plan and used to create needless
  // passive chatter near obstacles.
  if (targetChanged || intentChanged || speedChanged) {
    return "decision";
  }

  // Locked passive legs are silent until the AI actually changes state or
  // chooses a new destination. There is intentionally no passive heartbeat.
  return null;
}

function enemyMotionRecord(state, enemy) {
  // High-frequency motion contains only transport identity + authoritative
  // pixel anchors. Pixel-art rendering already resolves to whole pixels, while
  // client interpolation keeps motion sub-pixel smooth between anchors.
  return [
    enemy.networkId,
    Math.round(Number(state.x) || 0),
    Math.round(Number(state.y) || 0)
  ];
}

function motionRecordChanged(previous, current, now, movingChanged = false) {
  if (!previous) return false;

  const dx = current[1] - previous.record[1];
  const dy = current[2] - previous.record[2];
  const movedEnough =
    dx * dx + dy * dy >=
    ENEMY_MOTION_MIN_DISTANCE * ENEMY_MOTION_MIN_DISTANCE;

  // A final same-position anchor when motion stops is important because the
  // client otherwise has no way to know that short extrapolation should end.
  const heartbeatDue =
    now - previous.sentAt >= ENEMY_MOTION_HEARTBEAT_MS &&
    (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02);

  return movedEnough || movingChanged || heartbeatDue;
}

function quantizedUnit(value) {
  return Math.round((Number(value) || 0) * ENEMY_NET_SCALE.UNIT_VECTOR);
}

function countdownMs(value) {
  return Math.max(0, Math.round((Number(value) || 0) * ENEMY_NET_SCALE.SECONDS_MS));
}

function makeEnemyStateCache(state, now) {
  const burnTime = Math.max(0, Number(state.burnTime) || 0);
  return {
    observed: {
      alive: Boolean(state.alive),
      aggroTargetId: typeof state.aggroTargetId === "string" ? state.aggroTargetId : null,
      burnTime,
      burnDamagePerTick: Math.max(1, Math.round(Number(state.burnDamagePerTick) || 1)),
      carriedBy: typeof state.carriedBy === "string" ? state.carriedBy : null,
      pickupTime: Math.max(0, Number(state.pickupTime) || 0),
      pickupDirX: Number(state.pickupDirX) || 0,
      pickupDirY: Number(state.pickupDirY) || 0,
      hurlTime: Math.max(0, Number(state.hurlTime) || 0),
      lungeTime: Math.max(0, Number(state.lungeTime) || 0),
      lungeDirX: Number(state.lungeDirX) || 0,
      lungeDirY: Number(state.lungeDirY) || 0
    },
    burnSentExpiresAt: burnTime > 0 ? now + burnTime * 1000 : 0
  };
}

function compactStateRecordForEnemy(state, cacheEntry, now) {
  const previous = cacheEntry.observed;
  let mask = 0;
  const values = [];

  const currentAggro = typeof state.aggroTargetId === "string"
    ? state.aggroTargetId
    : null;
  if (currentAggro !== previous.aggroTargetId) {
    mask |= ENEMY_STATE.AGGRO_TARGET;
    values.push(currentAggro);
  }

  const currentBurn = Math.max(0, Number(state.burnTime) || 0);
  const currentBurnDamage = Math.max(
    1,
    Math.round(Number(state.burnDamagePerTick) || STATUS_RULES.enemyBurnDamagePerTick)
  );
  const burnStarted = currentBurn > 0 && previous.burnTime <= 0;
  const burnEnded = currentBurn <= 0 && previous.burnTime > 0;
  const burnDamageChanged = currentBurn > 0 && currentBurnDamage !== previous.burnDamagePerTick;
  const burnExpiresAt = currentBurn > 0 ? now + currentBurn * 1000 : 0;
  const burnMeaningfullyExtended =
    currentBurn > 0 &&
    previous.burnTime > 0 &&
    burnExpiresAt > cacheEntry.burnSentExpiresAt + ENEMY_BURN_EXTENSION_SYNC_MS;

  if (burnStarted || burnEnded || burnDamageChanged || burnMeaningfullyExtended) {
    mask |= ENEMY_STATE.BURN;
    values.push(countdownMs(currentBurn), currentBurnDamage);
    cacheEntry.burnSentExpiresAt = burnExpiresAt;
  }

  const currentCarrier = typeof state.carriedBy === "string" ? state.carriedBy : null;
  const currentPickup = Math.max(0, Number(state.pickupTime) || 0);
  const pickupStarted = currentPickup > 0 && previous.pickupTime <= 0;
  if (currentCarrier !== previous.carriedBy || pickupStarted) {
    mask |= ENEMY_STATE.CARRY;
    values.push(
      currentCarrier,
      countdownMs(currentPickup),
      quantizedUnit(state.pickupDirX),
      quantizedUnit(state.pickupDirY)
    );
  }

  const currentHurl = Math.max(0, Number(state.hurlTime) || 0);
  const hurlStarted = currentHurl > 0 && previous.hurlTime <= 0;
  const hurlEnded = currentHurl <= 0 && previous.hurlTime > 0;
  if (hurlStarted || hurlEnded) {
    mask |= ENEMY_STATE.HURL;
    values.push(countdownMs(currentHurl));
  }

  const currentLunge = Math.max(0, Number(state.lungeTime) || 0);
  const lungeStarted = currentLunge > 0 && previous.lungeTime <= 0;
  const lungeEnded = currentLunge <= 0 && previous.lungeTime > 0;
  if (lungeStarted || lungeEnded) {
    mask |= ENEMY_STATE.LUNGE;
    values.push(
      countdownMs(currentLunge),
      quantizedUnit(state.lungeDirX),
      quantizedUnit(state.lungeDirY)
    );
  }

  const currentAlive = Boolean(state.alive);
  // Death already has an enemyKilled event (with drops/XP semantics). Only the
  // false -> true transition belongs here so respawn is not duplicated.
  if (currentAlive && !previous.alive) {
    mask |= ENEMY_STATE.RESPAWN;
    values.push(Math.max(0, Math.round(Number(state.hp) || 0)));
    // RESPawn already carries the authoritative HP, so suppress a redundant
    // enemyHealthDelta for the same transition on this network tick.
    noteEnemyHealthReplicated(state.id, state.hp);
  }

  cacheEntry.observed = {
    alive: currentAlive,
    aggroTargetId: currentAggro,
    burnTime: currentBurn,
    burnDamagePerTick: currentBurnDamage,
    carriedBy: currentCarrier,
    pickupTime: currentPickup,
    pickupDirX: Number(state.pickupDirX) || 0,
    pickupDirY: Number(state.pickupDirY) || 0,
    hurlTime: currentHurl,
    lungeTime: currentLunge,
    lungeDirX: Number(state.lungeDirX) || 0,
    lungeDirY: Number(state.lungeDirY) || 0
  };

  if (!mask) return null;
  return [state.networkId, mask, ...values];
}

function compactHealthRecordForEnemy(state) {
  const hp = Math.max(0, Math.round(Number(state.hp) || 0));
  let cache = enemyHealthNetworkCache.get(state.id);

  if (!cache) {
    cache = { sentHp: hp };
    enemyHealthNetworkCache.set(state.id, cache);
    return null;
  }

  if (cache.sentHp === hp) return null;
  cache.sentHp = hp;
  return [state.networkId, hp];
}

function noteEnemyHealthReplicated(enemyId, hp) {
  if (typeof enemyId !== "string" || !Number.isFinite(Number(hp))) return;
  const cache = enemyHealthNetworkCache.get(enemyId);
  if (cache) cache.sentHp = Math.max(0, Math.round(Number(hp) || 0));
}

function noteEnemyHealthFromEvent(payload) {
  if (!payload || typeof payload.enemyId !== "string") return;

  if (payload.type === "enemyDamage" || payload.type === "enemyHeal") {
    noteEnemyHealthReplicated(payload.enemyId, payload.hp);
  } else if (payload.type === "enemyKilled") {
    noteEnemyHealthReplicated(payload.enemyId, 0);
  }
}

function broadcastSharedEnemyNetworkDeltas() {
  const now = Date.now();

  for (const mapId of ALLOWED_MAPS) {
    const motionRecords = [];
    const stateRecords = [];
    const healthRecords = [];

    for (const enemyType of Object.keys(sharedEnemyCollections)) {
      const states = sharedEnemySnapshot(enemyType, mapId);

      for (const state of states) {
        const enemy = worldEntitiesById.get(state.id);
        const motion = enemyMotionRecord(state, enemy);
        let motionCache = enemyMotionNetworkCache.get(state.id);

        if (!motionCache) {
          motionCache = {
            record: motion,
            sentAt: now,
            mode: enemyNeedsPreciseMotion(enemy) ? "active" : "passive",
            observedX: Number(state.x) || 0,
            observedY: Number(state.y) || 0,
            observedAt: now,
            velocityX: 0,
            velocityY: 0,
            passiveSentAt: 0,
            passiveQueuedAt: 0,
            passiveCheckedAt: now,
            passiveTargetX: Number(state.x) || 0,
            passiveTargetY: Number(state.y) || 0,
            passiveSpeed: 0,
            passiveDir: state.dir === -1 ? -1 : 1,
            passiveIntentKey: null,
            passiveAnchorX: Number(state.x) || 0,
            passiveAnchorY: Number(state.y) || 0,
            passiveSentTargetX: Number(state.x) || 0,
            passiveSentTargetY: Number(state.y) || 0,
            passiveSentSpeed: 0,
            passiveSentStartDelayMs: 0,
            passiveSentDir: state.dir === -1 ? -1 : 1,
            passiveSentIntentKey: null,
            alive: Boolean(state.alive),
            activeMoving: false
          };
          enemyMotionNetworkCache.set(state.id, motionCache);
        } else {
          const observedElapsed = Math.max(
            0.001,
            (now - (motionCache.observedAt || now)) / 1000
          );
          const currentX = Number(state.x) || 0;
          const currentY = Number(state.y) || 0;
          const rawVelocityX =
            (currentX - (Number(motionCache.observedX) || 0)) /
            observedElapsed;
          const rawVelocityY =
            (currentY - (Number(motionCache.observedY) || 0)) /
            observedElapsed;

          motionCache.velocityX =
            Math.abs(rawVelocityX) >= ENEMY_PASSIVE_SPEED_EPSILON
              ? rawVelocityX
              : 0;
          motionCache.velocityY =
            Math.abs(rawVelocityY) >= ENEMY_PASSIVE_SPEED_EPSILON
              ? rawVelocityY
              : 0;
          motionCache.observedX = currentX;
          motionCache.observedY = currentY;
          motionCache.observedAt = now;

          const activeMoving =
            Math.hypot(rawVelocityX, rawVelocityY) >=
            ENEMY_ACTIVE_MOVING_SPEED_EPSILON;
          const activeMovingChanged =
            Boolean(motionCache.activeMoving) !== activeMoving;

          const precise = enemyNeedsPreciseMotion(enemy);
          const nextMode = precise ? "active" : "passive";
          const modeChanged = motionCache.mode !== nextMode;
          const wasNetworkAlive = Boolean(motionCache.alive);
          const nextNetworkAlive = Boolean(state.alive);
          const aliveChanged = wasNetworkAlive !== nextNetworkAlive;
          const respawned = !wasNetworkAlive && nextNetworkAlive;
          motionCache.alive = nextNetworkAlive;

          if (respawned) {
            // A respawn is a teleport/discontinuity, not real movement. Without
            // resetting the passive velocity sample here, the death-position ->
            // spawn-position jump becomes a gigantic wander velocity for one
            // intent interval and clients briefly extrapolate the mob far off
            // screen before the next anchor corrects it.
            motionCache.velocityX = 0;
            motionCache.velocityY = 0;
            motionCache.observedX = currentX;
            motionCache.observedY = currentY;
            motionCache.observedAt = now;
          }

          if (precise) {
            if (modeChanged) {
              const hasRecipients = mapHasNetworkRecipients(mapId);
              const diag = hasRecipients ? passiveDiagForMap(mapId) : null;
              if (diag) diag.promotions += 1;

              const droppedPending =
                discardPendingPassiveEnemyIntent(mapId, state.id);
              if (diag && droppedPending) {
                diag.droppedOnPromote += 1;
              }

              if (diag && motionCache.passiveSentAt > 0) {
                const syncAge = Math.max(0, now - motionCache.passiveSentAt);
                const serverDelta = passiveServerDeltaSinceLastSync(
                  motionCache,
                  currentX,
                  currentY
                );
                const estimatedDrift = passiveEstimatedClientDrift(
                  motionCache,
                  currentX,
                  currentY,
                  now
                );
                diag.promotionSamples += 1;
                diag.promotionSyncAgeMs += syncAge;
                diag.promotionServerDelta += serverDelta;
                diag.promotionServerDeltaMax = Math.max(
                  diag.promotionServerDeltaMax,
                  serverDelta
                );
                diag.promotionEstimatedDrift += estimatedDrift;
                diag.promotionEstimatedDriftMax = Math.max(
                  diag.promotionEstimatedDriftMax,
                  estimatedDrift
                );
              }
            }

            if (
              modeChanged ||
              aliveChanged ||
              motionRecordChanged(
                motionCache,
                motion,
                now,
                activeMovingChanged
              )
            ) {
              motionRecords.push(...motion);
              motionCache.record = motion;
              motionCache.sentAt = now;
            }
            motionCache.activeMoving = activeMoving;
          } else if (state.alive) {
            if (modeChanged && mapHasNetworkRecipients(mapId)) {
              passiveDiagForMap(mapId).demotions += 1;
            }

            const passiveCheckDue =
              modeChanged ||
              aliveChanged ||
              now - (motionCache.passiveCheckedAt || 0) >=
                ENEMY_PASSIVE_INTENT_CHECK_MS;

            if (passiveCheckDue) {
              motionCache.passiveCheckedAt = now;
              const descriptor = enemyPassiveIntentDescriptor(
                enemyType,
                enemy,
                state,
                motionCache
              );

              const queueReason =
                modeChanged || aliveChanged
                  ? "transition"
                  : passiveIntentQueueReason(motionCache, descriptor, now);

              if (queueReason) {
                queuePassiveEnemyIntent(
                  mapId,
                  enemyType,
                  state.id,
                  queueReason
                );

                // These fields track the latest observed/queued passive plan.
                // The separate passiveSent* fields track exactly what the browser
                // has actually received, so promotion diagnostics remain honest.
                motionCache.passiveQueuedAt = now;
                motionCache.passiveTargetX = descriptor.targetX;
                motionCache.passiveTargetY = descriptor.targetY;
                motionCache.passiveSpeed = descriptor.speed;
                motionCache.passiveDir = descriptor.dir;
                motionCache.passiveIntentKey = descriptor.intentKey;

              }
            }
          }

          motionCache.mode = nextMode;
        }

        let stateCache = enemyStateNetworkCache.get(state.id);
        if (!stateCache) {
          stateCache = makeEnemyStateCache(state, now);
          enemyStateNetworkCache.set(state.id, stateCache);
        } else {
          const record = compactStateRecordForEnemy(state, stateCache, now);
          if (record) stateRecords.push(record);
        }

        const healthRecord = compactHealthRecordForEnemy(state);
        if (healthRecord) healthRecords.push(...healthRecord);
      }
    }

    if (motionRecords.length > 0) {
      sendEncodedToMap(
        mapId,
        JSON.stringify({
          type: "enemyMotion",
          m: mapId,
          r: motionRecords
        })
      );
    }

    // Flush once after scanning the whole map. This batches decisions that
    // happened during the same 10 Hz network tick, but never delays a genuine
    // wander plan into a later tick on purpose.
    flushPassiveEnemyIntents(mapId, now);

    if (healthRecords.length > 0) {
      sendEncodedToMap(
        mapId,
        JSON.stringify({
          type: "enemyHealthDelta",
          m: mapId,
          r: healthRecords
        })
      );
    }

    if (stateRecords.length > 0) {
      sendEncodedToMap(
        mapId,
        JSON.stringify({
          type: "enemyStateDelta",
          m: mapId,
          r: stateRecords
        })
      );
    }
  }

  if (now - lastEnemyNetworkKeyframeAt >= ENEMY_NETWORK_KEYFRAME_MS) {
    broadcastSharedEnemySnapshots();
    lastEnemyNetworkKeyframeAt = now;
  }
}

function playerIsVisibleToEnemy(playerState, mapId, observerX, observerY) {
  if (
    !playerState ||
    playerState.mapId !== mapId ||
    playerState.shadowHidden ||
    playerState.hp <= 0
  ) {
    return false;
  }

  if (!playerState.camouflaged) return true;

  const closeEnough =
    Number.isFinite(observerX) &&
    Number.isFinite(observerY) &&
    Math.hypot(
      playerState.x - observerX,
      playerState.y - observerY
    ) <= CAMOUFLAGE_CLOSE_REVEAL_DISTANCE;

  if (!closeEnough) return false;

  revealServerCamouflage(playerState, "detected");
  return true;
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
    if (!playerIsVisibleToEnemy(playerState, mapId, x, y)) {
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

function visibleAggroPlayerById(
  playerId,
  mapId,
  observerX = null,
  observerY = null
) {
  if (!playerId) return null;

  const playerState = players.get(playerId);

  if (!playerIsVisibleToEnemy(playerState, mapId, observerX, observerY)) {
    return null;
  }

  return playerState;
}

function refreshEnemyEngagement(enemy, playerId = null) {
  if (!enemy?.alive || enemy.returningHome || !enemy.aggroTargetId) return false;
  if (playerId && enemy.aggroTargetId !== playerId) return false;

  enemy.aggroEngagementTime = ENEMY_ENGAGEMENT_MEMORY_SECONDS;
  return true;
}

function setEnemyAggroTarget(enemy, playerId) {
  if (!enemy || enemy.returningHome) return;

  const nextTargetId = playerId || null;
  enemy.aggroTargetId = nextTargetId;

  if (nextTargetId) {
    enemy.wasEngaged = true;
    refreshEnemyEngagement(enemy, nextTargetId);
  } else {
    enemy.aggroEngagementTime = 0;
  }
}

function clearEnemyAggroTarget(enemy) {
  if (!enemy) return;
  enemy.aggroTargetId = null;
  enemy.aggroEngagementTime = 0;
}

function enemyUsesProximityAggro(enemy) {
  return enemy?.aggroMode === ENEMY_AGGRO_PROXIMITY;
}

function resolveEnemyAggroTarget(
  enemy,
  dt = 0,
  { allowAcquire = true } = {}
) {
  if (!enemy?.alive || enemy.returningHome) return null;

  let target = visibleAggroPlayerById(
    enemy.aggroTargetId,
    enemy.mapId,
    enemy.x,
    enemy.y
  );

  if (!target && enemy.aggroTargetId) {
    // Death, map changes, disconnects, Shadow Hide, and Camouflage invalidate
    // the target immediately. Distance-based escape is handled separately.
    clearEnemyAggroTarget(enemy);
  }

  if (target) {
    const targetDistance = Math.hypot(
      target.x - enemy.x,
      target.y - enemy.y
    );

    if (targetDistance <= ENEMY_ENGAGEMENT_RADIUS) {
      refreshEnemyEngagement(enemy, target.id);
    } else {
      enemy.aggroEngagementTime = Math.max(
        0,
        (Number(enemy.aggroEngagementTime) || 0) - Math.max(0, Number(dt) || 0)
      );

      if (enemy.aggroEngagementTime <= 0) {
        clearEnemyAggroTarget(enemy);
        target = null;
      }
    }
  }

  if (!target && allowAcquire && enemyUsesProximityAggro(enemy)) {
    const nearby = nearestVisiblePlayer(
      enemy.mapId,
      enemy.x,
      enemy.y,
      Math.max(0, Number(enemy.detectionRadius) || 0)
    );

    if (nearby) {
      target = nearby.player;
      setEnemyAggroTarget(enemy, target.id);
    }
  }

  return target;
}

function chooseServerGhostWanderTarget(ghost) {
  const candidates = [];
  const dimensions = mapWorldDimensions(ghost.mapId);
  const maxWanderX = Math.max(10, dimensions.width - 10);
  const maxWanderY = Math.max(24, dimensions.height - 5);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radiusX = (ghost.wanderRadiusX || 48) * (0.72 + Math.random() * 0.28);
    const radiusY = (ghost.wanderRadiusY || 30) * (0.72 + Math.random() * 0.28);
    const x = Math.max(
      10,
      Math.min(maxWanderX, ghost.homeX + Math.cos(angle) * radiusX)
    );
    const y = Math.max(
      24,
      Math.min(maxWanderY, ghost.homeY + Math.sin(angle) * radiusY)
    );
    candidates.push({
      x,
      y,
      distance: Math.hypot(x - ghost.x, y - ghost.y)
    });
  }

  candidates.sort((a, b) => b.distance - a.distance);
  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const chosen = pool[Math.floor(Math.random() * pool.length)] || {
    x: ghost.homeX,
    y: ghost.homeY
  };

  ghost.wanderTargetX = chosen.x;
  ghost.wanderTargetY = chosen.y;
  ghost.wanderStuckTime = 0;
}

function chooseServerEnemyPassiveTarget(enemy) {
  if (!enemy) return;
  if (enemy.type === "slime") {
    chooseServerSlimeWanderTarget(enemy);
  } else if (enemy.type === "mushroom") {
    enemy.wanderTargetX = enemy.homeX;
    enemy.wanderTargetY = enemy.homeY;
    enemy.wanderStuckTime = 0;
  } else if (enemy.type === "crab") {
    chooseServerCrabWanderTarget(enemy);
  } else if (enemy.type === "goblin") {
    chooseServerGoblinWanderTarget(enemy);
  } else if (enemy.type === "ghost") {
    chooseServerGhostWanderTarget(enemy);
  }
}

function beginEnemyReturningHome(enemy) {
  if (
    !enemy ||
    !enemy.alive ||
    enemy.type === "bigGoldSlime" ||
    enemy.returningHome
  ) {
    return false;
  }

  enemy.returningHome = true;
  enemy.returnStuckTime = 0;
  enemy.wasEngaged = false;
  clearEnemyAggroTarget(enemy);

  enemy.tauntTime = 0;
  enemy.tauntOwnerId = null;
  enemy.tauntCloneId = null;
  enemy.confusionTime = 0;
  enemy.confusionTargetId = null;
  enemy.knockbackX = 0;
  enemy.knockbackY = 0;
  clearServerEnemyStatuses(enemy);
  clearServerEnemySnareState(enemy);
  enemy.magicGrassFieldActive = false;

  if (enemy.type === "goblin") {
    enemy.lungeTime = 0;
    enemy.lungeTargetId = null;
    enemy.attackHit = false;
    enemy.moving = true;
  }

  return true;
}

function finishEnemyReturningHome(enemy) {
  enemy.x = enemy.homeX;
  enemy.y = enemy.homeY;
  enemy.returningHome = false;
  enemy.returnStuckTime = 0;
  enemy.wasEngaged = false;
  enemy.pauseTime = 0.80 + Math.random() * 0.70;
  enemy.wanderTargetX = enemy.homeX;
  enemy.wanderTargetY = enemy.homeY;
  enemy.wanderStuckTime = 0;

  // Pick the next locked passive leg immediately. The passive transition packet
  // can therefore carry both the home anchor and the post-return pause instead
  // of requiring a second "start moving" packet a moment later.
  chooseServerEnemyPassiveTarget(enemy);

  if (enemy.type === "goblin") {
    enemy.moving = false;
  }
}

function tickEnemyReturningHome(enemy, dt) {
  if (!enemy?.returningHome) return false;

  const dx = enemy.homeX - enemy.x;
  const dy = enemy.homeY - enemy.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= ENEMY_RETURN_HOME_ARRIVAL_DISTANCE) {
    finishEnemyReturningHome(enemy);
    return true;
  }

  const moveX = dx / distance;
  const moveY = dy / distance;
  const speed = Math.max(
    Number(enemy.chaseSpeed) || 0,
    Number(enemy.speed) || 0,
    12
  );
  const beforeX = enemy.x;
  const beforeY = enemy.y;

  if (enemy.type === "slime" || enemy.type === "mushroom" || enemy.type === "crab") {
    moveServerSlime(enemy, moveX, moveY, speed, dt);
  } else if (enemy.type === "goblin") {
    // Goblins phase through decorative trees during all movement states. They
    // still respect authored terrain/void while water remains traversable by
    // default through the enemy capability rule.
    const nextX = enemy.x + moveX * speed * dt;
    const nextY = enemy.y + moveY * speed * dt;
    if (enemyMapPointAllowed(enemy, nextX, enemy.y)) enemy.x = nextX;
    if (enemyMapPointAllowed(enemy, enemy.x, nextY)) enemy.y = nextY;
    enemy.moving = true;
    enemy.walkTime += dt;
  } else if (enemy.type === "ghost") {
    // Ghosts already phase through terrain. Keep the return deterministic.
    enemy.x += moveX * speed * dt;
    enemy.y += moveY * speed * dt;
  }

  if (Math.abs(moveX) > 0.04) {
    enemy.dir = moveX >= 0 ? 1 : -1;
  }

  const progressed = Math.hypot(enemy.x - beforeX, enemy.y - beforeY);
  if (progressed < 0.02) {
    enemy.returnStuckTime = (Number(enemy.returnStuckTime) || 0) + dt;
  } else {
    enemy.returnStuckTime = 0;
  }

  // A return should never create an immortal permanently-stuck mob. This is a
  // rare safety fallback for pathological collision geometry during the first
  // strict-state test. The normal path remains fully server simulated.
  if (enemy.returnStuckTime >= ENEMY_RETURN_HOME_STUCK_SECONDS) {
    finishEnemyReturningHome(enemy);
  }

  return true;
}

const CAMOUFLAGE_CONFUSION_DURATION = CAMOUFLAGE_RULES.CONFUSION_DURATION;
const CAMOUFLAGE_CLOSE_REVEAL_DISTANCE = CAMOUFLAGE_RULES.CLOSE_REVEAL_DISTANCE;
const serverCamouflageStates = new Map();

function makeServerCamouflageState(playerState = null) {
  const now = Date.now();
  return {
    phase: "exposed",
    buildStartedAt: 0,
    buildCoverId: null,
    sourceCoverId: null,
    graceUntil: 0,
    openerReadyUntil: 0,
    lastMovementAt: now,
    mapId: playerState?.mapId || null
  };
}

function serverCamouflageStateFor(playerState) {
  if (!playerState?.id) return null;
  let state = serverCamouflageStates.get(playerState.id);
  if (!state) {
    state = makeServerCamouflageState(playerState);
    serverCamouflageStates.set(playerState.id, state);
  }
  return state;
}

function playerHasCamouflageUnlocked(playerState) {
  return Boolean(
    playerState &&
    playerState.classId === "precision" &&
    (Number(playerState.abilities?.camouflage) || 0) > 0
  );
}

function serverCamouflageCoverAt(mapId, x, y) {
  if (!mapId) return null;

  for (const entity of environmentEntitiesOnMap(mapId)) {
    if (entity.kind === "tree") {
      if (
        entity.isStump ||
        entity.falling ||
        entity.canopyBurned ||
        (Number(entity.canopyBurnTime) || 0) > 0
      ) {
        continue;
      }

      if (
        CAMOUFLAGE_RULES.pointInTreeCover(
          x,
          y,
          entity.x,
          entity.y
        )
      ) {
        return {
          id: CAMOUFLAGE_RULES.treeCoverId(
            mapId,
            entity.id,
            entity.x,
            entity.y
          ),
          type: "tree"
        };
      }
      continue;
    }

    if (entity.kind !== "grass") continue;
    if (
      entity.cut ||
      entity.burnt ||
      (Number(entity.burnTime) || 0) > 0
    ) {
      continue;
    }

    if (
      CAMOUFLAGE_RULES.pointInGrassCover(
        x,
        y,
        entity.x,
        entity.y,
        entity.width || 13
      )
    ) {
      return {
        id: CAMOUFLAGE_RULES.grassCoverId(
          mapId,
          entity.id,
          entity.x,
          entity.y
        ),
        type: "grass"
      };
    }
  }

  for (const tree of staticHurlTreesOnMap(mapId)) {
    if (
      CAMOUFLAGE_RULES.pointInTreeCover(
        x,
        y,
        tree.x,
        tree.y
      )
    ) {
      return {
        id: CAMOUFLAGE_RULES.treeCoverId(
          mapId,
          null,
          tree.x,
          tree.y
        ),
        type: "tree"
      };
    }
  }

  // Rain-created Magic Grass is shared cover too. The server reconstructs the
  // same deterministic cells as every client, so no extra cover packets are
  // needed. A cell qualifies independently once grown and stops qualifying
  // while burning, once consumed, or when its natural lifetime ends.
  const nowMs = Date.now();
  for (const field of activeServerRainFields.values()) {
    if (field.mapId !== mapId || nowMs >= field.expiresAtMs) continue;

    for (const cell of field.cells) {
      const bit = RAIN_FIELD.cellBit(cell.index);
      if (field.burntMask & bit) continue;
      if ((Number(field.burnExpiresAtMs[cell.index]) || 0) > 0) continue;
      if (!RAIN_FIELD.cellIsGrown(cell, field.startedAtMs, nowMs)) continue;
      if (
        nowMs < field.startedAtMs +
          (cell.growDelay + CAMOUFLAGE_RULES.RAIN_GRASS_COVER_MATURITY_DELAY) * 1000
      ) {
        continue;
      }
      if (!RAIN_FIELD.cellIsNaturallyAlive(cell, field.startedAtMs, nowMs)) continue;

      if (
        CAMOUFLAGE_RULES.pointInGrassCover(
          x,
          y,
          cell.x,
          cell.y,
          cell.width || 13
        )
      ) {
        return {
          id: CAMOUFLAGE_RULES.rainGrassCoverId(
            mapId,
            field.ownerId,
            field.patchId,
            cell.index
          ),
          type: CAMOUFLAGE_RULES.RAIN_GRASS_KIND
        };
      }
    }
  }

  return null;
}

function playerIsTargetedByPveEnemy(playerId) {
  if (!playerId) return false;

  for (const enemy of allSharedEnemies()) {
    if (!enemy?.alive) continue;

    if (enemy.aggroTargetId === playerId) {
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

function enemyIsCloseEnoughToRevealCamouflage(playerState) {
  if (!playerState) return false;

  for (const enemy of allSharedEnemies()) {
    if (!enemy?.alive || enemy.mapId !== playerState.mapId) continue;
    if (
      Math.hypot(
        (Number(enemy.x) || 0) - playerState.x,
        (Number(enemy.y) || 0) - playerState.y
      ) <= CAMOUFLAGE_CLOSE_REVEAL_DISTANCE
    ) {
      return true;
    }
  }

  return false;
}

function broadcastServerCamouflageState(playerState, state, reason = "state") {
  if (!playerState || !state) return;
  broadcastToMap(playerState.mapId, {
    type: "camouflageState",
    playerId: playerState.id,
    mapId: playerState.mapId,
    camouflaged: Boolean(playerState.camouflaged),
    sourceCoverId: state.sourceCoverId || null,
    reason
  });
}

function resetServerCamouflageState(playerState, reason = "reset", broadcast = false) {
  if (!playerState?.id) return;
  const state = serverCamouflageStateFor(playerState);
  const wasCamouflaged = Boolean(playerState.camouflaged || state.phase === "camouflaged");

  playerState.camouflaged = false;
  state.phase = "exposed";
  state.buildStartedAt = 0;
  state.buildCoverId = null;
  state.sourceCoverId = null;
  state.graceUntil = 0;
  state.openerReadyUntil = 0;
  state.lastMovementAt = Date.now();
  state.mapId = playerState.mapId;

  if (broadcast && wasCamouflaged) {
    broadcastServerCamouflageState(playerState, state, reason);
  }
}

function revealServerCamouflage(playerState, reason = "reveal", options = {}) {
  if (!playerState?.id) return false;
  const state = serverCamouflageStateFor(playerState);
  const wasCamouflaged = Boolean(playerState.camouflaged || state.phase === "camouflaged");

  playerState.camouflaged = false;
  state.phase = "exposed";
  state.buildStartedAt = 0;
  state.buildCoverId = null;
  state.sourceCoverId = null;
  state.graceUntil = 0;
  if (!options.keepOpener) state.openerReadyUntil = 0;

  if (wasCamouflaged) {
    broadcastServerCamouflageState(playerState, state, reason);
  }
  return wasCamouflaged;
}

function enterServerCamouflage(playerState, state, cover, now = Date.now()) {
  if (!playerState || !state || !cover) return false;
  if (playerState.camouflaged && state.phase === "camouflaged") return true;

  playerState.camouflaged = true;
  state.phase = "camouflaged";
  state.buildStartedAt = 0;
  state.buildCoverId = null;
  state.sourceCoverId = cover.id;
  state.graceUntil = now + CAMOUFLAGE_RULES.GRACE_DURATION * 1000;
  state.openerReadyUntil = 0;
  broadcastServerCamouflageState(playerState, state, "entered");
  return true;
}

function noteServerCamouflagePlayerUpdate(previousState, nextState) {
  if (!nextState?.id) return;
  const state = serverCamouflageStateFor(nextState);
  const now = Date.now();

  if (state.mapId !== nextState.mapId) {
    resetServerCamouflageState(nextState, "map", false);
    state.mapId = nextState.mapId;
    return;
  }

  if (!previousState) return;

  const moved =
    Math.hypot(
      (Number(nextState.x) || 0) - (Number(previousState.x) || 0),
      (Number(nextState.y) || 0) - (Number(previousState.y) || 0)
    ) > 0.01 ||
    Math.abs(
      (Number(nextState.walkTime) || 0) - (Number(previousState.walkTime) || 0)
    ) > 0.001;

  if (moved) {
    state.lastMovementAt = now;
    if (state.phase === "building") {
      state.phase = "exposed";
      state.buildStartedAt = 0;
      state.buildCoverId = null;
    }
  }
}

function serverPlayerCanBuildCamouflage(playerState, state, now) {
  if (
    !playerHasCamouflageUnlocked(playerState) ||
    playerState.hp <= 0 ||
    playerState.shadowHidden ||
    playerIsTargetedByPveEnemy(playerState.id) ||
    hunterSnareSetups.has(playerState.id)
  ) {
    return false;
  }

  if (
    (Number(playerState.attackTime) || 0) > 0 ||
    playerState.bowDrawing ||
    playerState.focusFireCasting ||
    playerState.fireballAiming ||
    playerState.rainCloudCasting
  ) {
    return false;
  }

  // A motion packet resets lastMovementAt. Waiting one network frame prevents
  // the server from starting a cover timer on the exact frame movement stops.
  return now - state.lastMovementAt >= 75;
}

function updateServerCamouflagePlayer(playerState, now = Date.now()) {
  if (!playerState?.id) return;
  const state = serverCamouflageStateFor(playerState);

  if (
    !playerHasCamouflageUnlocked(playerState) ||
    playerState.hp <= 0 ||
    playerState.shadowHidden
  ) {
    revealServerCamouflage(playerState, "unavailable");
    state.phase = "exposed";
    state.buildStartedAt = 0;
    state.buildCoverId = null;
    return;
  }

  const cover = serverCamouflageCoverAt(
    playerState.mapId,
    playerState.x,
    playerState.y
  );


  if (playerState.camouflaged || state.phase === "camouflaged") {
    if (
      playerIsTargetedByPveEnemy(playerState.id) ||
      enemyIsCloseEnoughToRevealCamouflage(playerState)
    ) {
      revealServerCamouflage(playerState, "detected");
      return;
    }

    if (cover) {
      state.graceUntil = now + CAMOUFLAGE_RULES.GRACE_DURATION * 1000;
      return;
    }

    if (now >= state.graceUntil) {
      revealServerCamouflage(playerState, "leftCover");
    }
    return;
  }

  if (!serverPlayerCanBuildCamouflage(playerState, state, now)) {
    state.phase = "exposed";
    state.buildStartedAt = 0;
    state.buildCoverId = null;
    return;
  }

  if (!cover) {
    state.phase = "exposed";
    state.buildStartedAt = 0;
    state.buildCoverId = null;
    return;
  }

  if (state.phase !== "building" || state.buildCoverId !== cover.id) {
    state.phase = "building";
    state.buildStartedAt = now;
    state.buildCoverId = cover.id;
    return;
  }

  if (now - state.buildStartedAt >= CAMOUFLAGE_RULES.BUILD_DURATION * 1000) {
    enterServerCamouflage(playerState, state, cover, now);
  }
}

function tickServerCamouflage() {
  const now = Date.now();
  for (const playerState of players.values()) {
    updateServerCamouflagePlayer(playerState, now);
  }
}

function handleCamouflageBreak(playerId) {
  const playerState = players.get(playerId);
  if (!playerState) return false;

  // Resolve a just-finished build before validating the attack break. This
  // avoids a 30 Hz tick-boundary race when the client commits at exactly 1s.
  updateServerCamouflagePlayer(playerState, Date.now());
  const state = serverCamouflageStateFor(playerState);
  if (!playerState.camouflaged || state.phase !== "camouflaged") return false;

  state.openerReadyUntil = Date.now() + CAMOUFLAGE_RULES.OPENER_WINDOW_MS;
  revealServerCamouflage(playerState, "attack", { keepOpener: true });
  return true;
}

function camouflageOpeningIsValid(playerState, payload = {}) {
  if (!playerState?.id) return false;
  const state = serverCamouflageStateFor(playerState);
  // The opener token is granted only by the authoritative camouflageBreak
  // transition. Damage packets do not get to mint or extend it.
  return state.openerReadyUntil >= Date.now();
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

  const state = serverCamouflageStateFor(playerState);
  state.openerReadyUntil = 0;

  clearEnemyAggroTarget(enemy);
  enemy.confusionTime = CAMOUFLAGE_CONFUSION_DURATION;
  enemy.confusionTargetId = playerId;

  broadcastToMap(enemy.mapId, {
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
      target.id
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

// Goblins intentionally phase through decorative trees. Their movement still
// respects authored terrain and map bounds; water access is species-capability driven.
function goblinPositionAllowed(
  goblin,
  x,
  y
) {
  return enemyMapPointAllowed(
    goblin,
    x,
    y
  );
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
  const candidates = [];
  const dimensions = mapWorldDimensions(goblin.mapId);
  const maxWanderX = Math.max(12, dimensions.width - 12);
  const maxWanderY = Math.max(18, dimensions.height - 8);

  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = Math.random() * Math.PI * 2;

    const radiusX =
      goblin.wanderRadiusX * (0.72 + Math.random() * 0.28);

    const radiusY =
      goblin.wanderRadiusY * (0.72 + Math.random() * 0.28);

    const x = Math.max(
      12,
      Math.min(
        maxWanderX,
        goblin.homeX +
          Math.cos(angle) * radiusX
      )
    );

    const y = Math.max(
      18,
      Math.min(
        maxWanderY,
        goblin.homeY +
          Math.sin(angle) * radiusY
      )
    );

    if (!goblinPositionAllowed(goblin, x, y)) {
      continue;
    }

    candidates.push({
      x,
      y,
      distance: Math.hypot(x - goblin.x, y - goblin.y)
    });
  }

  // Keep the existing home territory, but prefer one of the longer valid legs
  // inside it. This makes each MoveStart useful for longer without expanding
  // the mob's designed roaming footprint.
  candidates.sort((a, b) => b.distance - a.distance);
  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  if (chosen) {
    goblin.wanderTargetX = chosen.x;
    goblin.wanderTargetY = chosen.y;
  } else {
    goblin.wanderTargetX = goblin.homeX;
    goblin.wanderTargetY = goblin.homeY;
  }

  goblin.wanderDecisionTime = 0;
  goblin.wanderStuckTime = 0;
}

function resetServerGoblin(goblin) {
  goblin.x = goblin.homeX;
  goblin.y = goblin.homeY;
  goblin.dir = 1;

  goblin.hp = goblin.maxHp;
  goblin.alive = true;
  goblin.respawnTime = 0;

  goblin.aggroTargetId = null;
  goblin.aggroEngagementTime = 0;
  goblin.confusionTime = 0;
  goblin.confusionTargetId = null;
  goblin.wasEngaged = false;
  goblin.returningHome = false;
  goblin.returnStuckTime = 0;
  goblin.wanderTargetX = goblin.homeX;
  goblin.wanderTargetY = goblin.homeY;
  goblin.wanderDecisionTime = 0;
  goblin.pauseTime = 0;
  goblin.wanderStuckTime = 0;

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

  ghost.aggroTargetId = null;
  ghost.aggroEngagementTime = 0;
  ghost.confusionTime = 0;
  ghost.confusionTargetId = null;
  ghost.wasEngaged = false;
  ghost.returningHome = false;
  ghost.returnStuckTime = 0;
  ghost.wanderTargetX = ghost.homeX;
  ghost.wanderTargetY = ghost.homeY;
  ghost.pauseTime = 0;
  ghost.wanderStuckTime = 0;

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
  resetServerPlayerPresentationState(target);
  resetServerCamouflageState(target, "death", true);

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
    damageType = "physical",
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

  const rawDamage = Math.max(
    0,
    Math.round(Number(amount) || 0)
  );

  if (rawDamage <= 0) {
    return 0;
  }

  const equippedProtection = {
    hatIndex: target.hatIndex,
    shirtIndex: target.shirtIndex,
    pantsIndex: target.pantsIndex,
    charmIndex: target.charmIndex
  };
  const armor = COMBAT_BALANCE.playerArmorFromGear(equippedProtection);
  const resist = COMBAT_BALANCE.playerResistFromGear(equippedProtection);

  const requestedDamage = COMBAT_BALANCE.mitigatePlayerDamage(
    rawDamage,
    { armor, resist },
    damageType
  );

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
  if (actualDamage > 0) {
    revealServerCamouflage(target, "hit");
    cancelHunterSnareSetup(
      target.id,
      "hit"
    );
  }

  if (target.hp <= 0) {
    handleAuthoritativePlayerDeath(target);
  }

  broadcastToMap(target.mapId, {
    type: "playerDamage",
    targetId: target.id,
    mapId: target.mapId,
    amount: actualDamage,
    hp: target.hp,
    maxHp: target.maxHp,
    sourceType,
    sourceId,
    damageType,
    armor,
    resist,
    knockbackX,
    knockbackY,
    contactCooldown
  });

  return actualDamage;
}

function handlePlayerIgniteRequest(playerId, message) {
  fireDiagnostics.legacyPlayerIgniteRequests += 1;
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

  if (
    target.id !== requester.id &&
    !pvpPlayersCanHarm(requester, target)
  ) {
    return;
  }

  // Burning magic grass obeys the same Wet protection rule as other fire.
  // Player-attributed fire uses the shorter PvP burn window against opponents.
  const ignited = applyServerPlayerBurn(target, {
    duration:
      target.id === requester.id
        ? STATUS_RULES.playerBurnDuration
        : PVP_PLAYER_BURN_DURATION,
    sourcePlayerId: requester.id
  });

  if (!ignited) {
    return;
  }

  if (target.id !== requester.id) {
    applyPvpCombatLock(requester, target);
  }

  broadcastToMap(target.mapId, {
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

  broadcastToMap(target.mapId, {
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
  const dealt = applyServerPlayerDamage(
    target,
    {
      amount,
      mapId: enemy.mapId,
      sourceType: enemy.type,
      sourceId: enemy.id,
      damageType: "physical",
      knockbackX: nx * knockbackMagnitude,
      knockbackY: ny * knockbackMagnitude,
      contactCooldown
    }
  );

  if (dealt > 0) {
    refreshEnemyEngagement(enemy, target?.id || null);
  }

  return dealt;
}

function isBowWeaponIndex(index) {
  return index === 6 || index === 7;
}

function weaponAttackRateLimitMs(weaponIndex) {
  if (isBowWeaponIndex(weaponIndex)) return 260;
  const cooldown = typeof COMBAT_BALANCE.weaponAttackCooldown === "function"
    ? COMBAT_BALANCE.weaponAttackCooldown(weaponIndex)
    : COMBAT_BALANCE.isWandWeaponIndex(weaponIndex)
      ? COMBAT_BALANCE.wandAttackCooldown(weaponIndex)
      : 0.75;
  // Leave a small transport/frame grace while still enforcing the equipped
  // non-bow weapon's Slow / Normal / Quick cadence authoritatively.
  return Math.max(260, Math.round(cooldown * 1000) - 80);
}

// Compatibility alias for older wand-specific call sites while the cadence
// table is now shared by all non-bow weapons/tools.
function wandAttackRateLimitMs(weaponIndex) {
  return weaponAttackRateLimitMs(weaponIndex);
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
    classId: attacker.classId || null,

    // Reuse the neutral physical/magic multiplier from slime while still
    // letting player level differences affect the first-pass PvP tuning.
    monsterType: "slime",
    monsterLevel: target.level || 1,
    critical,
    abilityLevel: serverCombatAbilityLevel(attacker, source)
  });
  const now = Date.now();
  const physicalSources = new Set(["melee", "basic", "arrow"]);
  const potionMultiplier = physicalSources.has(source)
    ? ((Number(attacker.attackPotionUntil) || 0) > now ? 1.15 : 1)
    : ((Number(attacker.magicPotionUntil) || 0) > now ? 1.15 : 1);

  return Math.max(
    1,
    Math.round(
      rawDamage * PVP_DAMAGE_MULTIPLIER * potionMultiplier
    )
  );
}

function applyPvpCombatLock(attacker, target) {
  if (!attacker || !target || attacker.mapId !== target.mapId) return;

  const now = Date.now();
  const until = now + PVP_COMBAT_LOCK_MS;
  const previousUntil = Math.max(
    Number(attacker.pvpCombatUntil) || 0,
    Number(target.pvpCombatUntil) || 0
  );

  attacker.pvpCombatUntil = Math.max(
    Number(attacker.pvpCombatUntil) || 0,
    until
  );

  target.pvpCombatUntil = Math.max(
    Number(target.pvpCombatUntil) || 0,
    until
  );

  // Continuous Rain/Burn may refresh the lock many times per second. Broadcast
  // only when the visible client deadline meaningfully advances.
  if (
    previousUntil > now &&
    until - previousUntil < PVP_LOCK_REBROADCAST_GRACE_MS
  ) {
    return;
  }

  broadcastToMap(attacker.mapId, {
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

  broadcastToMap(playerState.mapId, {
    type: "playerState",
    player: publicPlayerState(playerState)
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
    !pvpPlayersCanHarm(attacker, target) ||
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
    if (![0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12].includes(attacker.weaponIndex)) {
      return;
    }

    const maxDistance =
      attacker.weaponIndex === 4 ? 40 : 36;

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      maxDistance,
      0.92
    );

    minimumMs = weaponAttackRateLimitMs(attacker.weaponIndex);
    knockback =
      attacker.weaponIndex === 1 ? 18 : 15;
  } else if (source === "wandMasteryMelee") {
    if (
      (Number(attacker.abilities?.wandMastery) || 0) <= 0 ||
      ![2, 3, 8, 9, 10, 12].includes(attacker.weaponIndex)
    ) {
      return;
    }

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      57,
      0.56
    );

    minimumMs = weaponAttackRateLimitMs(attacker.weaponIndex);
    knockback = 15;
  } else if (source === "bowMelee") {
    if (!isBowWeaponIndex(attacker.weaponIndex)) {
      return;
    }

    valid = pvpAimHitsTarget(
      attacker,
      target,
      payload.aimAngle,
      36,
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

    const projectileX = Number(payload.projectileX);
    const projectileY = Number(payload.projectileY);
    const hasProjectileHitPoint =
      Number.isFinite(projectileX) &&
      Number.isFinite(projectileY);

    if (hasProjectileHitPoint) {
      const targetDistance = Math.hypot(
        target.x - projectileX,
        (target.y - 8) - projectileY
      );
      const travelDistance = Math.hypot(
        projectileX - attacker.x,
        projectileY - (attacker.y - 8)
      );

      valid =
        targetDistance <= 12 &&
        travelDistance <= arrowCharge.maxDistance + 20;
    } else {
      valid = pvpAimHitsTarget(
        attacker,
        target,
        payload.aimAngle,
        arrowCharge.maxDistance + 12,
        0.72
      );
    }

    minimumMs = 180;
    knockback = 12;
  } else if (source === "fireball") {
    if (
      (Number(attacker.abilities?.fireball) || 0) <= 0 ||
      !COMBAT_BALANCE.isWandWeaponIndex(attacker.weaponIndex)
    ) {
      return;
    }

    const impactX = Number(payload.impactX);
    const impactY = Number(payload.impactY);

    if (
      !Number.isFinite(impactX) ||
      !Number.isFinite(impactY) ||
      Math.hypot(
        impactX - attacker.x,
        impactY - (attacker.y - 8)
      ) > 220
    ) {
      return;
    }

    valid =
      Math.hypot(
        target.x - impactX,
        (target.y - 8) - impactY
      ) <= PVP_FIREBALL_LANDING_RADIUS + 6;

    minimumMs = 3000;
    knockback = 18;
  } else {
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
      ? Math.max(
          1,
          Math.round(
            scaleArrowDamage(
              baseDamage,
              payload
            ) * focusFireDamageMultiplier(
              attacker.id,
              target,
              payload
            )
          )
        )
      : source === "wandMasteryMelee"
        ? Math.max(
            1,
            Math.round(
              baseDamage * wandMasteryTargetDamageMultiplier(
                payload,
                Number(attacker.abilities?.wandMastery) || 1
              )
            )
          )
        : baseDamage;

  const aimAngle = Number(payload.aimAngle);
  const knockbackX =
    Math.cos(aimAngle) * knockback;
  const knockbackY =
    Math.sin(aimAngle) * knockback;

  const applyValidatedPvpHit = () => {
    const currentAttacker = players.get(attackerId);
    const currentTarget = players.get(target.id);

    if (
      !currentAttacker ||
      !currentTarget ||
      !pvpPlayersCanHarm(
        currentAttacker,
        currentTarget
      )
    ) {
      return;
    }

    const dealt = applyServerPlayerDamage(
      currentTarget,
      {
        amount: damage,
        mapId: currentTarget.mapId,
        sourceType: `pvp:${source}`,
        sourceId: currentAttacker.id,
        damageType:
          COMBAT_BALANCE.profileForAttack(source, currentAttacker.weaponIndex)?.damageType ||
          "physical",
        knockbackX,
        knockbackY,
        contactCooldown: 0.18
      }
    );

    if (dealt > 0) {
      if (source === "fireball") {
        applyServerPlayerBurn(
          currentTarget,
          {
            duration: PVP_PLAYER_BURN_DURATION,
            sourcePlayerId: currentAttacker.id
          }
        );

        if ((Number(currentTarget.burnTime) || 0) > 0) {
          broadcastServerPlayerBurnState(currentTarget);
        }
      }

      applyPvpCombatLock(currentAttacker, currentTarget);
    }
  };

  const impactDelayMs =
    source === "wandMasteryMelee"
      ? clampNumber(payload.impactDelayMs, 0, 180, 0)
      : 0;

  if (impactDelayMs > 0) {
    setTimeout(applyValidatedPvpHit, impactDelayMs);
    return;
  }

  applyValidatedPvpHit();
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
    // v253+ clients never request their own Burn ticks. Count and ignore any
    // stale-client request rather than letting it double-apply percentage Burn.
    fireDiagnostics.legacyPlayerBurnDamageRequests += 1;
    return;
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
      damageType: "magic",
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

  const deathMapId = target.mapId;

  // Respawn changes maps outside the normal playerState map-transition path.
  // Tell observers on the death map immediately so a backgrounded tab cannot
  // retain the dead player's ghost indefinitely after that player respawns.
  if (deathMapId) {
    leavePlayerMap(playerId, deathMapId);
  }

  target.hp = target.maxHp;
  target.isDead = false;
  target.mapId = "spawn";

  // Respawn is server-authoritative and always returns to the safe clearing.
  target.x = 172;
  target.y = 112;
  target.burnTime = 0;
  target.burnTickTimer = 0;
  target.burnDamageAccumulator = 0;
  target.burnSourcePlayerId = null;
  target.wetTime = 0;
  resetServerPlayerPresentationState(target);
  resetServerCamouflageState(target, "respawn", false);

  const socket = socketsByPlayerId.get(playerId);
  if (socket) {
    movePlayerSocketToMap(socket, target.mapId);
  }

  broadcastToMap(target.mapId, {
    type: "playerRespawn",
    player: publicPlayerState(target)
  });
}

function tickServerPlayerBurns(dt) {
  for (const target of players.values()) {
    if (target.hp <= 0) {
      clearServerPlayerBurn(target);
      continue;
    }

    if ((Number(target.burnTime) || 0) <= 0) continue;

    target.burnTime = Math.max(0, Number(target.burnTime) - dt);
    target.burnTickTimer =
      Math.max(0, Number(target.burnTickTimer) || STATUS_RULES.playerBurnTickInterval) - dt;

    while (
      target.burnTickTimer <= 0 &&
      target.burnTime > 0 &&
      target.hp > 0
    ) {
      // Player Burn is percentage-based, but HP is intentionally integer.
      // Accumulate the fractional 1%-of-max-HP half-second slices and only
      // emit an authoritative damage event once at least 1 HP is owed.
      target.burnDamageAccumulator = Math.max(
        0,
        Number(target.burnDamageAccumulator) || 0
      ) + Math.max(1, Number(target.maxHp) || 1) *
        STATUS_RULES.playerBurnMaxHpFractionPerTick;

      const burnSourcePlayerId =
        target.burnSourcePlayerId || null;
      const burnSource =
        burnSourcePlayerId &&
        burnSourcePlayerId !== target.id
          ? players.get(burnSourcePlayerId)
          : null;

      if (
        burnSource &&
        !pvpPlayersCanHarm(burnSource, target)
      ) {
        clearServerPlayerBurn(target);
        broadcastServerPlayerBurnState(target);
        break;
      }

      const wholeDamage = Math.floor(target.burnDamageAccumulator + 1e-9);
      if (wholeDamage > 0) {
        target.burnDamageAccumulator -= wholeDamage;
        applyServerPlayerDamage(target, {
          amount: wholeDamage,
          sourceType:
            burnSource
              ? "pvp:burn"
              : "burn",
          sourceId:
            burnSource
              ? burnSource.id
              : null,
          // Burn Resistance will eventually be its own status rule. Ordinary
          // armor/magic resistance should not distort the promised % max-HP rate.
          damageType: "burn",
          contactCooldown: 0
        });

        if (burnSource) {
          applyPvpCombatLock(burnSource, target);
        }
      }

      fireDiagnostics.playerDamageTicks += 1;
      target.burnTickTimer += STATUS_RULES.playerBurnTickInterval;
    }

    if (target.burnTime <= 0) {
      target.burnTime = 0;
      target.burnTickTimer = 0;
      target.burnDamageAccumulator = 0;
      target.burnSourcePlayerId = null;
    }
  }
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
    const wasWet = enemy.wetTime > 0;
    enemy.wetTime = Math.max(0, enemy.wetTime - dt);
    if (wasWet && enemy.wetTime <= 0) rainDiagnostics.enemyWetExits += 1;
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
    const damage = Math.max(
      1,
      Math.round(Number(enemy.burnDamagePerTick) || STATUS_RULES.enemyBurnDamagePerTick)
    );

    enemy.hp = Math.max(
      0,
      enemy.hp - damage
    );

    refreshEnemyEngagement(enemy, enemy.lastDamagePlayerId);

    enemy.burnTickTimer +=
      enemy.burnTickInterval;
    fireDiagnostics.enemyDamageTicks += 1;

    // Deliberately no per-enemy enemyDamage packet here. The compact 8 Hz
    // enemyHealthDelta batches authoritative Burn HP changes for the map while
    // clients simulate the tiny burn number locally.

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
    enemy.burnDamagePerTick = STATUS_RULES.enemyBurnDamagePerTick;
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
  enemy.returningHome = false;
  enemy.wasEngaged = false;
  enemy.returnStuckTime = 0;

  const profile =
    serverEnemyProfile(enemy);

  enemy.respawnTime =
    profile?.respawnSeconds ?? 30;

  if (profile?.onKilled) {
    profile.onKilled(enemy);
  }

  const killer = typeof killerId === "string" ? players.get(killerId) : null;
  if (enemy.type === "crab" && killer) {
    if (killer.beachQuestStage === "firstActive") {
      killer.beachQuestFirstCrabKills = Math.min(
        BEACH_QUEST_FIRST_CRAB_GOAL,
        Math.max(0, Math.floor(Number(killer.beachQuestFirstCrabKills) || 0)) + 1
      );
      if (
        killer.beachQuestIcedCoffee < 1 &&
        !pendingIcedCoffeeDropFor(killerId) &&
        Math.random() < BEACH_QUEST_COFFEE_DROP_CHANCE
      ) {
        spawnSharedResource(enemy.mapId, "icedCoffee", enemy.x, enemy.y - 2, { ownerId: killerId });
      }
    } else if (killer.beachQuestStage === "secondActive") {
      killer.beachQuestSecondCrabKills = Math.min(
        BEACH_QUEST_SECOND_CRAB_GOAL,
        Math.max(0, Math.floor(Number(killer.beachQuestSecondCrabKills) || 0)) + 1
      );
    }

    if (killer.beachQuestStage === "firstActive" || killer.beachQuestStage === "secondActive") {
      sendToPlayer(killerId, {
        type: "beachQuestProgress",
        stage: killer.beachQuestStage,
        firstCrabKills: killer.beachQuestFirstCrabKills,
        secondCrabKills: killer.beachQuestSecondCrabKills,
        icedCoffee: killer.beachQuestIcedCoffee
      });
    }
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

  broadcastToMap(enemy.mapId, {
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

    // RETURNING_HOME is deliberately isolated from combat/status AI in this
    // first state-machine pass. It stays server-authoritative until home.
    if (ghost.returningHome) {
      tickEnemyReturningHome(ghost, dt);
      continue;
    }

    tickEnemyStatuses(ghost, dt);
    if (!ghost.alive) continue;

    ghost.tauntTime = Math.max(
      0,
      ghost.tauntTime - dt
    );
    releaseEnemyTauntOnContact(ghost);

    if (ghost.tauntTime > 0) {
      ghost.wasEngaged = true;
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
    } else {
      targetPlayer = resolveEnemyAggroTarget(ghost, dt);

      if (targetPlayer) {
        targetX = targetPlayer.x;
        targetY = targetPlayer.y;
      }
    }

    if (
      !confused &&
      ghost.wasEngaged &&
      ghost.tauntTime <= 0 &&
      !targetPlayer &&
      !ghost.aggroTargetId
    ) {
      beginEnemyReturningHome(ghost);
      tickEnemyReturningHome(ghost, dt);
      continue;
    }

    let moveX = 0;
    let moveY = 0;
    let speed = ghost.speed;

    if (confused) {
      moveX = 0;
      moveY = 0;
    } else if (
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
    } else if (ghost.pauseTime > 0) {
      ghost.pauseTime = Math.max(0, ghost.pauseTime - dt);
    } else {
      let dx = ghost.wanderTargetX - ghost.x;
      let dy = ghost.wanderTargetY - ghost.y;
      let distance = Math.hypot(dx, dy);

      if (distance < 2) {
        ghost.pauseTime = 0.90 + Math.random() * 1.10;
        chooseServerGhostWanderTarget(ghost);
        dx = ghost.wanderTargetX - ghost.x;
        dy = ghost.wanderTargetY - ghost.y;
        distance = Math.hypot(dx, dy);
      }

      if (distance > 0.001) {
        moveX = dx / distance;
        moveY = dy / distance;
      }
    }

    if (Math.abs(moveX) > 0.04) {
      ghost.dir = moveX >= 0 ? 1 : -1;
    }

    const beforeX = ghost.x;
    const beforeY = ghost.y;

    // Ghosts intentionally phase through terrain.
    const snareMoveMultiplier =
      serverEnemyMovementMultiplier(ghost);
    ghost.x += moveX * speed * snareMoveMultiplier * dt;
    ghost.y += moveY * speed * snareMoveMultiplier * dt;

    const ghostDimensions = mapWorldDimensions(ghost.mapId);
    ghost.x = Math.max(
      8,
      Math.min(Math.max(8, ghostDimensions.width - 8), ghost.x)
    );

    ghost.y = Math.max(
      24,
      Math.min(Math.max(24, ghostDimensions.height - 5), ghost.y)
    );

    if (
      !confused &&
      !ghost.aggroTargetId &&
      ghost.tauntTime <= 0 &&
      ghost.pauseTime <= 0 &&
      Math.hypot(
        ghost.wanderTargetX - ghost.x,
        ghost.wanderTargetY - ghost.y
      ) > 2
    ) {
      const progress = Math.hypot(ghost.x - beforeX, ghost.y - beforeY);
      ghost.wanderStuckTime = progress < 0.02
        ? ghost.wanderStuckTime + dt
        : 0;
      if (ghost.wanderStuckTime >= ENEMY_PASSIVE_STUCK_REPLAN_SECONDS) {
        chooseServerGhostWanderTarget(ghost);
      }
    } else {
      ghost.wanderStuckTime = 0;
    }

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

    if (goblin.returningHome) {
      tickEnemyReturningHome(goblin, dt);
      continue;
    }

    goblin.attackCooldown = Math.max(
      0,
      goblin.attackCooldown - dt
    );

    goblin.tauntTime = Math.max(
      0,
      goblin.tauntTime - dt
    );
    releaseEnemyTauntOnContact(goblin);

    if (goblin.tauntTime > 0) {
      goblin.wasEngaged = true;
    }

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
      } else {
        targetPlayer = resolveEnemyAggroTarget(goblin, dt);

        if (targetPlayer) {
          targetX = targetPlayer.x;
          targetY = targetPlayer.y - 3;
        }
      }

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
        targetX !== null &&
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
        // Once an engaged goblin loses its target, do not drop directly into
        // passive wandering from an arbitrary combat coordinate. The strict
        // return state owns the trip home and remains precisely replicated.
        if (
          !confused &&
          goblin.wasEngaged &&
          goblin.tauntTime <= 0 &&
          !targetPlayer &&
          !goblin.aggroTargetId
        ) {
          beginEnemyReturningHome(goblin);
          tickEnemyReturningHome(goblin, dt);
          continue;
        }

        if (goblin.pauseTime > 0) {
          goblin.pauseTime = Math.max(
            0,
            goblin.pauseTime - dt
          );
          goblin.wanderStuckTime = 0;
        } else {
          let dx =
            goblin.wanderTargetX - goblin.x;

          let dy =
            goblin.wanderTargetY - goblin.y;

          let distance = Math.hypot(dx, dy);

          // Train Track Rule: arrival (or a true stuck watchdog) is the only
          // passive reason to choose another destination. There is no timer
          // that makes an in-transit goblin change its mind.
          if (distance < 2) {
            goblin.pauseTime =
              0.80 + Math.random() * 1.00;

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
            const beforeX = goblin.x;
            const beforeY = goblin.y;

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

            const progress = Math.hypot(
              goblin.x - beforeX,
              goblin.y - beforeY
            );
            goblin.wanderStuckTime = progress < 0.02
              ? goblin.wanderStuckTime + dt
              : 0;

            if (
              goblin.wanderStuckTime >=
              ENEMY_PASSIVE_STUCK_REPLAN_SECONDS
            ) {
              chooseServerGoblinWanderTarget(goblin);
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
  if (![0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12].includes(playerState.weaponIndex)) {
    return false;
  }

  const reach =
    playerState.weaponIndex === 4 ? 31 : 26;

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
  if (![2, 3, 8, 9, 10, 12].includes(playerState.weaponIndex)) {
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

  // Passive enemies are reconstructed from server path plans on the client, so
  // their rendered body can be a few pixels ahead/behind the authoritative
  // simulation at the instant of a melee swing. Give Wand Mastery a small
  // reconciliation grace rather than rejecting a hit that visibly connected.
  const reconciliationRangeGrace = 8;
  if (distance > 45 + bodyRadius + reconciliationRangeGrace) {
    return false;
  }

  const aimAngle = Number(payload.aimAngle);
  if (!Number.isFinite(aimAngle)) {
    return false;
  }

  const targetAngle = Math.atan2(dy, dx);
  const reconciliationAngleGrace = 0.08;
  return (
    Math.abs(angleDifference(targetAngle, aimAngle)) <=
    0.56 + reconciliationAngleGrace
  );
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

  if (distance > 28 + bodyRadius) {
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

function serverCombatAbilityLevel(playerState, source) {
  if (source === "fireball") {
    return Math.max(0, Number(playerState?.abilities?.fireball) || 0);
  }
  if (source === "rain") {
    return Math.max(0, Number(playerState?.abilities?.rainCloud) || 0);
  }
  if (source === "wandMasteryMelee") {
    return Math.max(0, Number(playerState?.abilities?.wandMastery) || 0);
  }
  return 1;
}

function calculateServerPlayerDamage(
  playerState,
  enemy,
  source,
  critical = false,
  options = {}
) {
  const baseDamage = COMBAT_BALANCE.calculateDamage({
    source,
    weaponIndex:
      playerState.weaponIndex,
    playerLevel:
      playerState.level || 1,
    stats:
      playerState.stats || {},
    classId:
      playerState.classId || null,
    monsterType:
      enemy.type,
    monsterLevel:
      enemy.level || 1,
    critical,
    rainPower:
      options.rainPower ?? 2,
    abilityLevel:
      options.abilityLevel ?? serverCombatAbilityLevel(playerState, source)
  });
  const now = Date.now();
  const physicalSources = new Set(["melee", "basic", "arrow"]);
  const multiplier = physicalSources.has(source)
    ? ((Number(playerState.attackPotionUntil) || 0) > now ? 1.15 : 1)
    : ((Number(playerState.magicPotionUntil) || 0) > now ? 1.15 : 1);
  return Math.max(1, Math.round(baseDamage * multiplier));
}

const FIREBALL_SPLASH_BURN_RADIUS = 30;
const FIREBALL_SPLASH_MAX_TOTAL_TARGETS = 5;

function applyServerFireballSplashBurn(playerId, mapId, payload) {
  const playerState = players.get(playerId);
  if (!playerState || playerState.hp <= 0 || playerState.mapId !== mapId) return 0;
  if ((Number(playerState.abilities?.fireball) || 0) <= 0) return 0;
  if (!COMBAT_BALANCE.isWandWeaponIndex(playerState.weaponIndex)) return 0;

  const impactX = Number(payload.x);
  const impactY = Number(payload.y);
  if (!Number.isFinite(impactX) || !Number.isFinite(impactY)) return 0;

  // Fireball's selected landing point is at most 150px away, but the caster
  // can keep moving while the projectile is airborne. This is validation grace,
  // not the blast radius.
  if (Math.hypot(impactX - playerState.x, impactY - playerState.y) > 220) return 0;

  if (sharedEnemyActionRateLimited(playerId, "fireballSplash", "impact", 3000)) {
    return 0;
  }

  const primaryEnemyId = typeof payload.primaryEnemyId === "string"
    ? payload.primaryEnemyId
    : null;
  const maxSplashTargets = primaryEnemyId
    ? FIREBALL_SPLASH_MAX_TOTAL_TARGETS - 1
    : FIREBALL_SPLASH_MAX_TOTAL_TARGETS;

  const candidates = [];
  for (const enemy of allSharedEnemies()) {
    if (!enemy.alive || enemy.mapId !== mapId || enemy.returningHome || enemy.carriedBy) continue;
    if (primaryEnemyId && enemy.id === primaryEnemyId) continue;

    const profile = serverEnemyProfile(enemy);
    const bodyX = enemy.x;
    const bodyY = enemy.y + (profile?.bodyOffsetY ?? -11);
    const distance = Math.hypot(bodyX - impactX, bodyY - impactY);
    if (distance > FIREBALL_SPLASH_BURN_RADIUS) continue;
    candidates.push({ enemy, distance });
  }

  candidates.sort((a, b) => a.distance - b.distance);

  let applied = 0;
  for (const { enemy } of candidates) {
    if (applied >= maxSplashTargets) break;

    const burnDamagePerTick = Math.max(
      1,
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "fireballBurnTick",
        false,
        { abilityLevel: 1 }
      )
    );

    const ignited = applyServerEnemyBurn(enemy, {
      duration: STATUS_RULES.enemyBurnDuration,
      damagePerTick: burnDamagePerTick,
      sourcePlayerId: playerId,
      refresh: false
    });

    if (ignited) applied += 1;
  }

  return applied;
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

function wandMasteryMaxTargetsForLevel(level) {
  const cleanLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (cleanLevel >= 20) return 3;
  if (cleanLevel >= 10) return 2;
  return 1;
}

function wandMasteryTargetDamageMultiplier(payload = {}, masteryLevel = 1) {
  const rawCount = Number(payload.targetCount);
  const maxTargets = wandMasteryMaxTargetsForLevel(masteryLevel);
  const count = Math.max(
    1,
    Math.min(maxTargets, Math.round(Number.isFinite(rawCount) ? rawCount : 1))
  );

  if (count <= 1) return 1;
  if (count === 2) return 0.75;
  return 0.60;
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

  // Camouflage's prepared opener is reserved for the brief Confusion/reacquire
  // delay after a successful ambush. It no longer modifies attack damage.

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

    minimumMs = weaponAttackRateLimitMs(playerState.weaponIndex);

    critical = Boolean(payload.critical);

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
    if ((Number(playerState.abilities?.wandMastery) || 0) <= 0) {
      return;
    }

    if (
      !validateSharedEnemyWandMasteryHit(
        playerState,
        enemy,
        payload
      )
    ) {
      return;
    }

    minimumMs = weaponAttackRateLimitMs(playerState.weaponIndex);
    critical = Boolean(payload.critical);
    damage = Math.max(
      1,
      Math.round(
        calculateServerPlayerDamage(
          playerState,
          enemy,
          "wandMasteryMelee",
          critical
        ) * wandMasteryTargetDamageMultiplier(
          payload,
          Number(playerState.abilities?.wandMastery) || 1
        )
      )
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
    critical = Boolean(payload.critical);

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
      ![2, 3, 8, 9, 10, 12].includes(playerState.weaponIndex) ||
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 190
    ) {
      return;
    }

    minimumMs = weaponAttackRateLimitMs(playerState.weaponIndex);

    critical = false;

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

    critical = false;

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
      (Number(playerState.abilities?.fireball) || 0) <= 0 ||
      !COMBAT_BALANCE.isWandWeaponIndex(playerState.weaponIndex)
    ) {
      return;
    }

    if (
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 260
    ) {
      return;
    }

    critical = false;

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

  const applyValidatedDamage = () => {
    if (!enemy.alive || enemy.carriedBy || enemy.returningHome) return;

    const currentPlayerState = players.get(playerId);
    if (!currentPlayerState || currentPlayerState.hp <= 0) return;

    enemy.hp = Math.max(
      0,
      enemy.hp - damage
    );
    enemy.wasEngaged = true;

    const camouflageConfused =
      tryApplyCamouflageConfusion(
        enemy,
        currentPlayerState,
        playerId,
        payload
      );

    if (!camouflageConfused) {
      setEnemyAggroTarget(
        enemy,
        playerId
      );
    }
    enemy.lastDamagePlayerId = playerId;

    if (source === "fireball") {
      // Fireball impact and On-Fire both use the same Magic Power -> spell
      // Power -> resistance/level/mastery damage pipeline. The impact uses the
      // Fireball skill's current Power (up to 200). Burn is 20 Power/sec and
      // ticks twice per second, so each authoritative Burn tick is calculated
      // exactly like a spell hit at 10 Power (minimum 1 damage per tick).
      const burnDamagePerTick = Math.max(
        1,
        calculateServerPlayerDamage(
          currentPlayerState,
          enemy,
          "fireballBurnTick",
          false,
          { abilityLevel: 1 }
        )
      );

      applyServerEnemyBurn(enemy, {
        duration: STATUS_RULES.enemyBurnDuration,
        damagePerTick: burnDamagePerTick,
        sourcePlayerId: playerId
      });
    }

    let pushAngle = Number(payload.aimAngle);

    if (!Number.isFinite(pushAngle)) {
      pushAngle = Math.atan2(
        enemy.y - currentPlayerState.y,
        enemy.x - currentPlayerState.x
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

    broadcastToMap(enemy.mapId, {
      type: "enemyDamage",
      enemyType: enemy.type,
      enemyId: enemy.id,
      mapId: enemy.mapId,
      amount: damage,
      hp: enemy.hp,
      critical,
      source,
      element: COMBAT_BALANCE.elementForAttack(source, currentPlayerState.weaponIndex),
      attackerId: playerId,
      aimAngle: Number.isFinite(pushAngle) ? pushAngle : null
    });

    if (enemy.hp <= 0) {
      killSharedEnemy(enemy, playerId);
    }
  };

  const impactDelayMs =
    source === "wandMasteryMelee"
      ? clampNumber(payload.impactDelayMs, 0, 180, 0)
      : 0;

  if (impactDelayMs > 0) {
    setTimeout(applyValidatedDamage, impactDelayMs);
    return;
  }

  applyValidatedDamage();
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

  // Temporary strict reset state: while returning home the server owns the
  // entire transit and ignores player attempts to damage, taunt, snare, burn,
  // wet, or hurl the enemy. Interruption will be layered on after this state
  // machine proves visually/network-stable.
  if (enemy.returningHome) return;

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

  if (action === "magicGrassSlow") { rainDiagnostics.legacyMagicGrassSlow += 1; return; }
  if (action === "wet") { rainDiagnostics.legacyWet += 1; return; }
  if (action === "rainDamage") { rainDiagnostics.legacyRainDamage += 1; return; }

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

  if (action === "clearRedirect" || action === "clearTaunt") {
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

  if (action === "redirect" || action === "taunt") {
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

    const dimensions = mapWorldDimensions(enemy.mapId);

    const tauntX = clampNumber(
      payload.x,
      0,
      dimensions.width,
      enemy.x
    );

    const tauntY = clampNumber(
      payload.y,
      0,
      dimensions.height,
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
    enemy.wasEngaged = true;
    return;
  }


}

// -----------------------------------------------------------------------------
// SHARED SLIME WORLD
// -----------------------------------------------------------------------------
function bigGoldSlimePositionAllowed(slime, x, y) {
  // Gold Slime Den now has true map dimensions instead of an inset invisible
  // restriction. The elite can pursue anywhere the player can actually stand.
  return enemyMapPointAllowed(slime, x, y, 10);
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
  slime.aggroTargetId = null;
  slime.aggroEngagementTime = 0;
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
    } else {
      targetPlayer = resolveEnemyAggroTarget(slime, dt);

      if (targetPlayer) {
        targetX = targetPlayer.x;
        targetY = targetPlayer.y;
      }
    }

    const homeDx = slime.homeX - slime.x;
    const homeDy = slime.homeY - slime.y;
    const distanceFromHome =
      Math.hypot(homeDx, homeDy);

    const stillInCombat =
      Boolean(slime.aggroTargetId) ||
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
      targetY !== null
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
      slime.patrolRadius * 0.78
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
    detectionRadius: 72,
    aggroMode: aggressiveByDefault
      ? ENEMY_AGGRO_PROXIMITY
      : ENEMY_AGGRO_PROVOKED,

    aggroTargetId: null,
    aggroEngagementTime: 0,
    confusionTime: 0,
    confusionTargetId: null,
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

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
    wanderStuckTime: 0,
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


function makeServerCrab(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    level = 2
  } = spawn;

  return {
    id,
    mapId,
    type: "crab",
    level,

    x,
    y,
    homeX: x,
    homeY: y,
    dir: 1,
    phase,

    // Crabs prefer long horizontal legs and only make small vertical changes.
    speed: 15,
    chaseSpeed: 42,
    detectionRadius: 76,
    aggroMode: ENEMY_AGGRO_PROVOKED,

    aggroTargetId: null,
    aggroEngagementTime: 0,
    confusionTime: 0,
    confusionTargetId: null,
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0.45 + Math.random() * 0.55,
    wanderStuckTime: 0,
    wanderRadiusX: 38,
    wanderRadiusY: 9,

    maxHp: 120,
    hp: 120,
    alive: true,
    respawnTime: 0,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    lastDamagePlayerId: null
  };
}

function resetServerCrab(crab) {
  crab.x = crab.homeX;
  crab.y = crab.homeY;
  crab.dir = 1;
  crab.wanderTargetX = crab.homeX;
  crab.wanderTargetY = crab.homeY;
  crab.pauseTime = 0.45 + Math.random() * 0.55;
  crab.wanderStuckTime = 0;
  crab.aggroTargetId = null;
  crab.aggroEngagementTime = 0;
  crab.confusionTime = 0;
  crab.confusionTargetId = null;
  crab.wasEngaged = false;
  crab.returningHome = false;
  crab.returnStuckTime = 0;
  crab.tauntTime = 0;
  crab.tauntX = crab.homeX;
  crab.tauntY = crab.homeY;
  crab.tauntOwnerId = null;
  crab.tauntCloneId = null;
  crab.hp = crab.maxHp;
  crab.alive = true;
  crab.respawnTime = 0;
  crab.burnTime = 0;
  crab.burnTickTimer = 0;
  crab.knockbackX = 0;
  crab.knockbackY = 0;
  clearEnemyAggroTarget(crab);
  clearServerEnemyHurlState(crab);
  clearServerEnemyStatuses(crab);
  clearServerEnemySnareState(crab);
  crab.lastDamagePlayerId = null;
}

function chooseServerCrabWanderTarget(crab) {
  const candidates = [];
  const dimensions = mapWorldDimensions(crab.mapId);
  const maxX = Math.max(14, dimensions.width - 14);
  const maxY = Math.max(18, dimensions.height - 8);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const direction = Math.random() < 0.5 ? -1 : 1;
    const horizontal = (crab.wanderRadiusX || 38) * (0.62 + Math.random() * 0.38) * direction;
    const vertical = (Math.random() - 0.5) * 2 * (crab.wanderRadiusY || 9);
    const x = Math.max(14, Math.min(maxX, crab.homeX + horizontal));
    const y = Math.max(18, Math.min(maxY, crab.homeY + vertical));
    if (!slimePositionAllowed(crab, x, y)) continue;
    candidates.push({ x, y, distance: Math.hypot(x - crab.x, y - crab.y) });
  }

  candidates.sort((a, b) => b.distance - a.distance);
  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  crab.wanderTargetX = chosen?.x ?? crab.homeX;
  crab.wanderTargetY = chosen?.y ?? crab.homeY;
  crab.wanderStuckTime = 0;
}

function crabMovementVector(dx, dy) {
  // Preserve the recognizable sideways scuttle without preventing the crab
  // from eventually reaching players above/below it.
  const horizontal = dx;
  const vertical = dy * 0.42;
  const length = Math.hypot(horizontal, vertical) || 1;
  return { x: horizontal / length, y: vertical / length };
}

function tryServerCrabContact(crab) {
  if (!crab?.alive || crab.carriedBy || crab.hurlTime > 0) return;

  const target = nearestVisiblePlayer(crab.mapId, crab.x, crab.y, 10);
  if (!target || target.distance > 10 || !playerContactAvailable(target.player.id)) return;

  let dx = target.player.x - crab.x;
  let dy = (target.player.y - 3) - (crab.y - 4);
  const distance = Math.hypot(dx, dy);
  if (distance >= 8.2) return;

  if (distance < 0.001) {
    dx = -crab.dir;
    dy = 0;
  } else {
    dx /= distance;
    dy /= distance;
  }

  setPlayerContactCooldown(target.player.id, 0.48);
  broadcastEnemyHitPlayer(
    target.player,
    crab,
    9 + Math.floor(Math.random() * 5),
    dx,
    dy,
    76,
    0.48
  );
}

function tickSharedCrabs(dt) {
  for (const crab of sharedCrabs) {
    if (!crab.alive) {
      crab.respawnTime -= dt;
      if (crab.respawnTime <= 0) resetServerCrab(crab);
      continue;
    }

    if (crab.returningHome) {
      tickEnemyReturningHome(crab, dt);
      continue;
    }

    tickEnemyStatuses(crab, dt);
    if (!crab.alive) continue;
    if (tickServerEnemyHurl(crab, dt)) continue;

    if (crab.tauntTime > 0) {
      crab.tauntTime = Math.max(0, crab.tauntTime - dt);
      if (crab.tauntTime <= 0) {
        crab.tauntOwnerId = null;
        crab.tauntCloneId = null;
      } else {
        crab.wasEngaged = true;
        releaseEnemyTauntOnContact(crab);
      }
    }

    const confused = tickEnemyConfusion(crab, dt);
    if (!confused) tryServerCrabContact(crab);

    if (Math.abs(crab.knockbackX) > 0.1 || Math.abs(crab.knockbackY) > 0.1) {
      const nextX = crab.x + crab.knockbackX * dt;
      const nextY = crab.y + crab.knockbackY * dt;
      if (slimePositionAllowed(crab, nextX, crab.y)) crab.x = nextX;
      if (slimePositionAllowed(crab, crab.x, nextY)) crab.y = nextY;
      crab.knockbackX *= 0.82;
      crab.knockbackY *= 0.82;
    }

    if (confused) continue;

    if (crab.tauntTime > 0) {
      const dx = crab.tauntX - crab.x;
      const dy = crab.tauntY - crab.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const move = crabMovementVector(dx, dy);
        moveServerSlime(crab, move.x, move.y, crab.chaseSpeed, dt);
        if (Math.abs(move.x) > 0.05) crab.dir = move.x >= 0 ? 1 : -1;
      }
      continue;
    }

    const targetPlayer = resolveEnemyAggroTarget(crab, dt);
    if (targetPlayer) {
      const dx = targetPlayer.x - crab.x;
      const dy = targetPlayer.y - crab.y;
      if (Math.hypot(dx, dy) > 1) {
        const move = crabMovementVector(dx, dy);
        moveServerSlime(crab, move.x, move.y, crab.chaseSpeed, dt);
        if (Math.abs(move.x) > 0.05) crab.dir = move.x >= 0 ? 1 : -1;
      }
      continue;
    }

    if (crab.wasEngaged && !crab.aggroTargetId) {
      beginEnemyReturningHome(crab);
      tickEnemyReturningHome(crab, dt);
      continue;
    }

    if (crab.pauseTime > 0) {
      crab.pauseTime = Math.max(0, crab.pauseTime - dt);
      crab.wanderStuckTime = 0;
      continue;
    }

    let dx = crab.wanderTargetX - crab.x;
    let dy = crab.wanderTargetY - crab.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 2) {
      crab.pauseTime = 0.45 + Math.random() * 0.75;
      chooseServerCrabWanderTarget(crab);
      dx = crab.wanderTargetX - crab.x;
      dy = crab.wanderTargetY - crab.y;
      distance = Math.hypot(dx, dy);
    }

    if (distance > 0.001) {
      const move = crabMovementVector(dx, dy);
      const beforeX = crab.x;
      const beforeY = crab.y;
      moveServerSlime(crab, move.x, move.y, crab.speed, dt);
      if (Math.abs(move.x) > 0.05) crab.dir = move.x >= 0 ? 1 : -1;
      const progress = Math.hypot(crab.x - beforeX, crab.y - beforeY);
      crab.wanderStuckTime = progress < 0.02 ? crab.wanderStuckTime + dt : 0;
      if (crab.wanderStuckTime >= ENEMY_PASSIVE_STUCK_REPLAN_SECONDS) {
        chooseServerCrabWanderTarget(crab);
      }
    }
  }
}

function makeServerMushroom(spawn) {
  const {
    id,
    mapId,
    x,
    y,
    phase = 0,
    level = 1
  } = spawn;

  return {
    id,
    mapId,
    type: "mushroom",
    level,

    x,
    y,
    homeX: x,
    homeY: y,
    dir: 1,
    phase,

    speed: 16,
    chaseSpeed: 22,
    detectionRadius: 72,
    aggroMode: ENEMY_AGGRO_PROVOKED,

    aggroTargetId: null,
    aggroEngagementTime: 0,
    confusionTime: 0,
    confusionTargetId: null,
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

    tauntTime: 0,
    tauntX: x,
    tauntY: y,
    tauntOwnerId: null,

    // Sleeping mushrooms do not choose passive wander legs. These home-locked
    // fields let the shared passive network planner emit a stable idle intent.
    wanderTargetX: x,
    wanderTargetY: y,
    wanderDecisionTime: 0,
    pauseTime: 0,
    wanderStuckTime: 0,

    maxHp: 40,
    hp: 40,
    alive: true,
    respawnTime: 0,

    burnTime: 0,
    burnTickTimer: 0,
    burnTickInterval: 0.5,

    knockbackX: 0,
    knockbackY: 0,

    lastDamagePlayerId: null
  };
}

function resetServerMushroom(mushroom) {
  mushroom.x = mushroom.homeX;
  mushroom.y = mushroom.homeY;
  mushroom.dir = 1;

  mushroom.wanderTargetX = mushroom.homeX;
  mushroom.wanderTargetY = mushroom.homeY;
  mushroom.wanderDecisionTime = 0;
  mushroom.pauseTime = 0;
  mushroom.wanderStuckTime = 0;

  mushroom.aggroTargetId = null;
  mushroom.aggroEngagementTime = 0;
  mushroom.confusionTime = 0;
  mushroom.confusionTargetId = null;
  mushroom.wasEngaged = false;
  mushroom.returningHome = false;
  mushroom.returnStuckTime = 0;

  mushroom.tauntTime = 0;
  mushroom.tauntX = mushroom.homeX;
  mushroom.tauntY = mushroom.homeY;
  mushroom.tauntOwnerId = null;
  mushroom.tauntCloneId = null;

  mushroom.hp = mushroom.maxHp;
  mushroom.alive = true;
  mushroom.respawnTime = 0;

  mushroom.burnTime = 0;
  mushroom.burnTickTimer = 0;

  mushroom.knockbackX = 0;
  mushroom.knockbackY = 0;
  clearEnemyAggroTarget(mushroom);
  clearServerEnemyHurlState(mushroom);
  clearServerEnemyStatuses(mushroom);
  clearServerEnemySnareState(mushroom);

  mushroom.lastDamagePlayerId = null;
}

function tryServerMushroomContact(mushroom) {
  // A sleeping mushroom is harmless until something has actually provoked or
  // redirected it. Merely walking over an idle spawn does not wake/contact-hit.
  if (
    !mushroom?.alive ||
    mushroom.carriedBy ||
    mushroom.hurlTime > 0 ||
    (
      !mushroom.aggroTargetId &&
      (Number(mushroom.tauntTime) || 0) <= 0
    )
  ) {
    return;
  }

  const target = nearestVisiblePlayer(
    mushroom.mapId,
    mushroom.x,
    mushroom.y,
    9
  );

  if (
    !target ||
    target.distance > 9 ||
    !playerContactAvailable(target.player.id)
  ) {
    return;
  }

  let dx =
    target.player.x - mushroom.x;
  let dy =
    (target.player.y - 3) -
    (mushroom.y - 4);
  const distance = Math.hypot(dx, dy);

  if (distance >= 7.0) return;

  if (distance < 0.001) {
    dx = -mushroom.dir;
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
    mushroom,
    damage,
    dx,
    dy,
    78,
    0.42
  );
}

function tickSharedMushrooms(dt) {
  for (const mushroom of sharedMushrooms) {
    if (!mushroom.alive) {
      mushroom.respawnTime -= dt;

      if (mushroom.respawnTime <= 0) {
        resetServerMushroom(mushroom);
      }

      continue;
    }

    if (mushroom.returningHome) {
      tickEnemyReturningHome(
        mushroom,
        dt
      );
      continue;
    }

    tickEnemyStatuses(mushroom, dt);
    if (!mushroom.alive) continue;

    if (
      tickServerEnemyHurl(
        mushroom,
        dt
      )
    ) {
      continue;
    }

    if (mushroom.tauntTime > 0) {
      mushroom.tauntTime = Math.max(
        0,
        mushroom.tauntTime - dt
      );

      if (mushroom.tauntTime <= 0) {
        mushroom.tauntOwnerId = null;
        mushroom.tauntCloneId = null;
      } else {
        mushroom.wasEngaged = true;
        releaseEnemyTauntOnContact(
          mushroom
        );
      }
    }

    const confused =
      tickEnemyConfusion(
        mushroom,
        dt
      );

    if (
      Math.abs(mushroom.knockbackX) > 0.1 ||
      Math.abs(mushroom.knockbackY) > 0.1
    ) {
      const nextX =
        mushroom.x +
        mushroom.knockbackX * dt;
      const nextY =
        mushroom.y +
        mushroom.knockbackY * dt;

      if (
        slimePositionAllowed(
          mushroom,
          nextX,
          mushroom.y
        )
      ) {
        mushroom.x = nextX;
      }

      if (
        slimePositionAllowed(
          mushroom,
          mushroom.x,
          nextY
        )
      ) {
        mushroom.y = nextY;
      }

      mushroom.knockbackX *= 0.82;
      mushroom.knockbackY *= 0.82;
    }

    if (confused) {
      continue;
    }

    if (mushroom.tauntTime > 0) {
      tryServerMushroomContact(
        mushroom
      );

      const dx =
        mushroom.tauntX - mushroom.x;
      const dy =
        mushroom.tauntY - mushroom.y;
      const distance =
        Math.hypot(dx, dy);

      if (distance > 1) {
        const moveX = dx / distance;
        const moveY = dy / distance;

        moveServerSlime(
          mushroom,
          moveX,
          moveY,
          mushroom.chaseSpeed,
          dt
        );

        if (Math.abs(moveX) > 0.05) {
          mushroom.dir =
            moveX >= 0 ? 1 : -1;
        }
      }

      continue;
    }

    const targetPlayer =
      resolveEnemyAggroTarget(
        mushroom,
        dt
      );

    if (targetPlayer) {
      tryServerMushroomContact(
        mushroom
      );

      const dx =
        targetPlayer.x - mushroom.x;
      const dy =
        targetPlayer.y - mushroom.y;
      const distance =
        Math.hypot(dx, dy);

      if (distance > 1) {
        const moveX = dx / distance;
        const moveY = dy / distance;

        moveServerSlime(
          mushroom,
          moveX,
          moveY,
          mushroom.chaseSpeed,
          dt
        );

        if (Math.abs(moveX) > 0.05) {
          mushroom.dir =
            moveX >= 0 ? 1 : -1;
        }
      }

      continue;
    }

    if (
      mushroom.wasEngaged &&
      !mushroom.aggroTargetId
    ) {
      beginEnemyReturningHome(
        mushroom
      );
      tickEnemyReturningHome(
        mushroom,
        dt
      );
      continue;
    }

    // Passive state: deliberately no wander target choice or movement. The
    // creature stays planted at its authored map-editor spawn and sleeps.
    mushroom.wanderTargetX =
      mushroom.homeX;
    mushroom.wanderTargetY =
      mushroom.homeY;
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
  padding = 0,
  { allowWater = false } = {}
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

  const terrainOccupancy = TERRAIN_RULES.circleCanOccupy(
    definition,
    x,
    y,
    padding,
    { allowWater }
  );

  if (terrainOccupancy !== null) {
    if (!terrainOccupancy) return false;
  } else {
    // Legacy maps keep their existing collision contract until they are
    // deliberately migrated to first-class terrain data.
    const walkableRects =
      definition.collision?.walkableRects || [];

    if (
      walkableRects.length > 0 &&
      !walkableRects.some(rect =>
        pointInsideRect(x, y, rect, 0)
      )
    ) {
      return false;
    }

    if (!allowWater) {
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
    }
  }

  return true;
}

function enemyMapPointAllowed(enemy, x, y, padding = 0) {
  return mapPointAllowed(
    enemy.mapId,
    x,
    y,
    padding,
    { allowWater: serverEnemyCanEnterWater(enemy) }
  );
}

function slimePositionAllowed(
  slime,
  x,
  y
) {
  return enemyMapPointAllowed(
    slime,
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
  const candidates = [];
  const dimensions = mapWorldDimensions(slime.mapId);
  const maxWanderX = Math.max(12, dimensions.width - 12);
  const maxWanderY = Math.max(18, dimensions.height - 8);

  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radiusX = slime.wanderRadiusX * (0.72 + Math.random() * 0.28);
    const radiusY = slime.wanderRadiusY * (0.72 + Math.random() * 0.28);

    const x = Math.max(
      12,
      Math.min(maxWanderX, slime.homeX + Math.cos(angle) * radiusX)
    );

    const y = Math.max(
      18,
      Math.min(maxWanderY, slime.homeY + Math.sin(angle) * radiusY)
    );

    if (!slimePositionAllowed(slime, x, y)) continue;

    candidates.push({
      x,
      y,
      distance: Math.hypot(x - slime.x, y - slime.y)
    });
  }

  // Prefer a longer leg without enlarging the existing wander radius. Picking
  // randomly from the farthest few candidates avoids repetitive ping-pong while
  // substantially reducing how often passive AI needs a new destination.
  candidates.sort((a, b) => b.distance - a.distance);
  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  if (chosen) {
    slime.wanderTargetX = chosen.x;
    slime.wanderTargetY = chosen.y;
  } else {
    slime.wanderTargetX = slime.homeX;
    slime.wanderTargetY = slime.homeY;
  }

  slime.wanderDecisionTime = 0;
  slime.wanderStuckTime = 0;
}

function resetServerSlime(slime) {
  slime.x = slime.homeX;
  slime.y = slime.homeY;
  slime.dir = 1;

  slime.wanderTargetX = slime.homeX;
  slime.wanderTargetY = slime.homeY;
  slime.wanderDecisionTime = 0;
  slime.pauseTime = 0;
  slime.wanderStuckTime = 0;

  slime.aggroTargetId = null;
  slime.aggroEngagementTime = 0;
  slime.confusionTime = 0;
  slime.confusionTargetId = null;
  slime.wasEngaged = false;
  slime.returningHome = false;
  slime.returnStuckTime = 0;

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
    attackerId
  );

  const speed = Math.hypot(velocityX, velocityY) || 1;
  if (Math.abs(velocityX) + Math.abs(velocityY) > 0.01) {
    enemy.knockbackX = velocityX / speed * 58;
    enemy.knockbackY = velocityY / speed * 58;
  }

  broadcastToMap(enemy.mapId, {
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

function hurlObjectHitsTree(mapId, x, y, radius = 12) {
  // Mutable/choppable trees remain authoritative environment entities.
  for (const entity of environmentEntitiesOnMap(mapId, "tree")) {
    if (
      entity.isStump ||
      entity.falling
    ) {
      continue;
    }

    if (Math.hypot(entity.x - x, entity.y - y) <= radius) {
      return true;
    }
  }

  // Decorative fire-immune trees are immutable collision points only. They
  // never enter sharedEnvironment and therefore can never generate patches.
  for (const tree of staticHurlTreesOnMap(mapId)) {
    if (Math.hypot(tree.x - x, tree.y - y) <= radius) {
      return true;
    }
  }

  return false;
}

function serverEnemyPositionAllowedForHurl(enemy, x, y) {
  if (enemy.type === "slime" || enemy.type === "mushroom" || enemy.type === "crab") {
    return slimePositionAllowed(enemy, x, y);
  }

  if (enemy.type === "goblin") {
    return goblinPositionAllowed(enemy, x, y);
  }

  return enemyMapPointAllowed(enemy, x, y);
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
      (enemy.type === "slime" || enemy.type === "mushroom" || enemy.type === "crab")
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
    hurlObjectHitsTree(
      enemy.mapId,
      enemy.x,
      enemy.y
    )
  ) {
    // The thrown monster can smack into a tree and take its landing hit, but
    // the tree itself is never chopped/damaged by Hurl.
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

    if (playerCarriesAnyHurlObject(playerId)) {
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
  // Hallucination redirects the slime's movement/aggro destination only. It
  // must not make the slime physically harmless to real players it happens
  // to overlap while chasing the clone. Carry/Hurl transit still suppresses
  // ordinary touch damage because those are non-contact control states.
  if (
    slime.carriedBy ||
    slime.hurlTime > 0
  ) {
    return;
  }

  const target = nearestVisiblePlayer(slime.mapId, slime.x, slime.y, 9);

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

    if (slime.returningHome) {
      tickEnemyReturningHome(slime, dt);
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
        slime.wasEngaged = true;
        releaseEnemyTauntOnContact(slime);
      }
    }

    const confused =
      tickEnemyConfusion(slime, dt);

    if (!confused) {
      tryServerSlimeContact(slime);
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

    // The decoy has absolute priority while it exists.
    if (slime.tauntTime > 0) {
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

      continue;
    }

    let targetPlayer = resolveEnemyAggroTarget(slime, dt);

    const targetDistance = targetPlayer
      ? Math.hypot(
          targetPlayer.x - slime.x,
          targetPlayer.y - slime.y
        )
      : Infinity;

    if (
      targetPlayer &&
      targetDistance > 1
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

    if (
      slime.wasEngaged &&
      slime.tauntTime <= 0 &&
      !targetPlayer &&
      !slime.aggroTargetId
    ) {
      beginEnemyReturningHome(slime);
      tickEnemyReturningHome(slime, dt);
      continue;
    }

    if (slime.pauseTime > 0) {
      slime.pauseTime = Math.max(
        0,
        slime.pauseTime - dt
      );
      slime.wanderStuckTime = 0;
      continue;
    }

    let dx = slime.wanderTargetX - slime.x;
    let dy = slime.wanderTargetY - slime.y;
    let distance = Math.hypot(dx, dy);

    // Train Track Rule: passive slimes keep the destination they chose until
    // they arrive. The old short wanderDecisionTime expiry is intentionally
    // gone; only arrival or the true stuck watchdog can choose a new leg.
    if (distance < 2) {
      slime.pauseTime = 0.80 + Math.random() * 1.20;

      chooseServerSlimeWanderTarget(slime);

      dx = slime.wanderTargetX - slime.x;
      dy = slime.wanderTargetY - slime.y;
      distance = Math.hypot(dx, dy);
    }

    if (distance > 0.001) {
      const moveX = dx / distance;
      const moveY = dy / distance;
      const beforeX = slime.x;
      const beforeY = slime.y;

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

      const progress = Math.hypot(
        slime.x - beforeX,
        slime.y - beforeY
      );
      slime.wanderStuckTime = progress < 0.02
        ? slime.wanderStuckTime + dt
        : 0;

      if (
        slime.wanderStuckTime >=
        ENEMY_PASSIVE_STUCK_REPLAN_SECONDS
      ) {
        chooseServerSlimeWanderTarget(slime);
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





function serverPointTouchesWater(mapId, x, y, radius = 3) {
  const definition = WORLD_CONTENT.maps[mapId] || {};
  if (TERRAIN_RULES.terrainDefinition(definition)) {
    return TERRAIN_RULES.circleTouchesType(
      definition,
      x,
      y,
      Math.max(0, Number(radius) || 0),
      "water"
    );
  }

  for (const rect of definition.collision?.waterRects || []) {
    if (pointInsideRect(x, y, rect, Math.max(0, Number(radius) || 0))) {
      return true;
    }
  }
  return false;
}

function refreshServerWaterWetness() {
  for (const target of players.values()) {
    if (
      target.hp > 0 &&
      serverPointTouchesWater(target.mapId, target.x, target.y, 4)
    ) {
      applyServerPlayerWet(target, STATUS_RULES.playerWetDuration);
    }
  }

  for (const enemy of allSharedEnemies()) {
    if (
      !enemy.alive ||
      enemy.returningHome ||
      !serverEnemyCanEnterWater(enemy) ||
      !serverPointTouchesWater(enemy.mapId, enemy.x, enemy.y, 4)
    ) {
      continue;
    }

    const wasWet = enemy.wetTime > 0;
    applyServerEnemyWet(enemy, STATUS_RULES.enemyWetDuration);
    if (!wasWet && enemy.wetTime > 0) {
      rainDiagnostics.enemyWetEnters += 1;
    }
  }
}

// 30 Hz authoritative enemy simulation. Normal enemy replication is a compact
// 10 Hz precise combat stream plus event-driven passive wander plans; full snapshots are map-entry/keyframe only.
let previousSlimeTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(
    0.05,
    (now - previousSlimeTick) / 1000
  );

  previousSlimeTick = now;

  tickSharedEnemySnareStatuses(dt);
  tickServerPlayerBurns(dt);
  refreshServerWaterWetness();
  tickServerPlayerWetTimers(dt);
  tickServerPlayerPresentation(dt);
  tickServerCamouflage();
  tickHunterSnareSetups();
  tickHunterSnareCharges(dt);
  tickServerHallucinations(dt);
  tickServerRainClouds(dt);
  tickServerRainGrassMembership();
  tickSharedSlimes(dt);
  tickSharedMushrooms(dt);
  tickSharedCrabs(dt);
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
  broadcastSharedEnemyNetworkDeltas();
}, 1000 / ENEMY_NETWORK_DELTA_HZ);

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
// COMPACT PLAYER ACTION / AIM REPLICATION
// -----------------------------------------------------------------------------
function serverPlayerDirectionFromCode(code) {
  switch (Number(code)) {
    case PLAYER_NET_PROTOCOL.DIRECTION.RIGHT: return "right";
    case PLAYER_NET_PROTOCOL.DIRECTION.UP: return "up";
    case PLAYER_NET_PROTOCOL.DIRECTION.DOWN: return "down";
    default: return "left";
  }
}

function handlePlayerAim(playerId, message) {
  const target = players.get(playerId);
  if (!target || target.hp <= 0) return;
  const q = clampInteger(message?.a, 0, PLAYER_NET_PROTOCOL.AIM_STEPS - 1, 0);
  target.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(q);
  broadcastToMap(target.mapId, { type: "playerAim", id: target.id, a: q }, socketsByPlayerId.get(playerId));
}

function handlePlayerAction(playerId, message) {
  const target = players.get(playerId);
  if (!target || target.hp <= 0 || !Array.isArray(message?.a)) return;
  const data = message.a;
  const code = clampInteger(data[0], 1, 32, 0);
  const A = PLAYER_NET_PROTOCOL.ACTION;
  let outgoing = null;

  if (code === A.ATTACK) {
    const duration = clampNumber((Number(data[1]) || 300) / 1000, 0.05, 1, 0.30);
    const dirCode = clampInteger(data[2], 0, 3, 0);
    const handCode = data[3] === 1 ? 1 : 0;
    const aimQ = clampInteger(data[4], 0, PLAYER_NET_PROTOCOL.AIM_STEPS - 1, PLAYER_NET_PROTOCOL.encodeAim(target.attackAimAngle));
    target.attackDuration = duration;
    target.attackTime = duration;
    target.attackDirection = serverPlayerDirectionFromCode(dirCode);
    target.attackHand = handCode ? "right" : "left";
    target.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(aimQ);
    outgoing = [code, Math.round(duration * 1000), dirCode, handCode, aimQ];
  } else if (code === A.BOW_DRAW) {
    const active = data[1] === 1;
    const duration = clampNumber((Number(data[2]) || 1000) / 1000, 0.05, 3, 1.0);
    target.bowDrawing = active;
    target.bowDrawDuration = duration;
    if (active) { target.bowDrawAmount = 0; target.bowReleaseTime = 0; }
    outgoing = [code, active ? 1 : 0, Math.round(duration * 1000)];
  } else if (code === A.BOW_RELEASE) {
    const duration = clampNumber((Number(data[1]) || 120) / 1000, 0.03, 0.5, 0.12);
    const drawQ = clampInteger(data[2], 0, 255, 0);
    const aimQ = clampInteger(data[3], 0, PLAYER_NET_PROTOCOL.AIM_STEPS - 1, PLAYER_NET_PROTOCOL.encodeAim(target.attackAimAngle));
    target.bowDrawing = false;
    target.bowReleaseDuration = duration;
    target.bowReleaseTime = duration;
    target.bowDrawAmount = drawQ / 255;
    target.attackAimAngle = PLAYER_NET_PROTOCOL.decodeAim(aimQ);
    outgoing = [code, Math.round(duration * 1000), drawQ, aimQ];
  } else if (code === A.FOCUS_FIRE) {
    const active = data[1] === 1;
    target.focusFireCasting = active;
    outgoing = [code, active ? 1 : 0];
  } else if (code === A.FIREBALL_AIM) {
    const active = data[1] === 1;
    target.fireballAiming = active;
    target.fireballAimTime = 0;
    outgoing = [code, active ? 1 : 0];
  } else if (code === A.RAIN_CAST) {
    const active = data[1] === 1;
    const duration = clampNumber((Number(data[2]) || 500) / 1000, 0.05, 2, 0.50);
    target.rainCloudCasting = active;
    target.rainCloudCastDuration = duration;
    target.rainCloudCastTime = 0;
    outgoing = [code, active ? 1 : 0, Math.round(duration * 1000)];
  } else if (code === A.SHADOW_HIDE) {
    const active = data[1] === 1;
    target.shadowHidden = active;
    if (active) target.shadowHideRevealTime = 0;
    outgoing = [code, active ? 1 : 0];
  } else if (code === A.SHADOW_REVEAL) {
    const duration = clampNumber((Number(data[1]) || 160) / 1000, 0.03, 1, 0.16);
    target.shadowHideRevealTime = duration;
    outgoing = [code, Math.round(duration * 1000)];
  } else if (code === A.HURL_REACH) {
    const duration = clampNumber((Number(data[1]) || 180) / 1000, 0.05, 0.5, 0.18);
    const dx = clampNumber((Number(data[2]) || 0) / 1000, -1, 1, 0);
    const dy = clampNumber((Number(data[3]) || 0) / 1000, -1, 1, 0);
    target.hurlReachDuration = duration;
    target.hurlReachTime = duration;
    target.hurlReachDirX = dx;
    target.hurlReachDirY = dy;
    outgoing = [code, Math.round(duration * 1000), Math.round(dx * 1000), Math.round(dy * 1000)];
  }

  if (outgoing) {
    broadcastToMap(target.mapId, { type: "playerAction", id: target.id, a: outgoing }, socketsByPlayerId.get(playerId));
  }
}

function resetServerPlayerPresentationState(target) {
  if (!target) return;
  target.attackTime = 0;
  target.bowDrawing = false;
  target.bowDrawAmount = 0;
  target.bowReleaseTime = 0;
  target.focusFireCasting = false;
  target.fireballAiming = false;
  target.fireballAimTime = 0;
  target.rainCloudCasting = false;
  target.rainCloudCastTime = 0;
  target.shadowHidden = false;
  target.shadowHideRevealTime = 0;
  target.hurlReachTime = 0;
}

function tickServerPlayerPresentation(dt) {
  for (const target of players.values()) {
    target.attackTime = Math.max(0, (Number(target.attackTime) || 0) - dt);
    target.shadowHideRevealTime = Math.max(0, (Number(target.shadowHideRevealTime) || 0) - dt);
    target.hurlReachTime = Math.max(0, (Number(target.hurlReachTime) || 0) - dt);
    if (target.bowDrawing) {
      target.bowDrawAmount = Math.min(1, (Number(target.bowDrawAmount) || 0) + dt / Math.max(0.05, Number(target.bowDrawDuration) || 1));
      target.bowReleaseTime = 0;
    } else if ((Number(target.bowReleaseTime) || 0) > 0) {
      target.bowReleaseTime = Math.max(0, target.bowReleaseTime - dt);
      target.bowDrawAmount = Math.max(0, (Number(target.bowDrawAmount) || 0) - dt / 0.09);
    }
    if (target.fireballAiming) target.fireballAimTime = Math.max(0, (Number(target.fireballAimTime) || 0) + dt);
    else target.fireballAimTime = 0;
    if (target.rainCloudCasting) {
      target.rainCloudCastTime = Math.min(Math.max(0.05, Number(target.rainCloudCastDuration) || 0.50), Math.max(0, Number(target.rainCloudCastTime) || 0) + dt);
    } else target.rainCloudCastTime = 0;
  }
}

// -----------------------------------------------------------------------------
// MAP-SCOPED COMBAT / ABILITY VISUAL EVENTS
// -----------------------------------------------------------------------------
// Presentation-only events. Authoritative gameplay still uses the existing
// player/enemy HP, status, AI, and drop paths.
function sanitizeVisualPoint(value, mapId, axis = "x", fallback = 0) {
  const dimensions = mapWorldDimensions(mapId);
  const mapExtent = axis === "y"
    ? Number(dimensions.height) || 400
    : Number(dimensions.width) || 640;
  return clampNumber(value, -32, Math.max(32, mapExtent) + 32, fallback);
}

function sanitizeVisualVelocity(value) {
  return clampNumber(value, -320, 320, 0);
}

// -----------------------------------------------------------------------------
// SERVER-CLOCKED HALLUCINATION
// -----------------------------------------------------------------------------
// The decoy's gameplay clock lives on the server so backgrounding the caster
// cannot pause its redirect lifetime while other players continue to see the map.
const SERVER_HALLUCINATION_DURATION = 2.0;
const SERVER_HALLUCINATION_REDIRECT_RADIUS = 120;
const SERVER_HALLUCINATION_CONTACT_RADIUS = 8.5;
const SERVER_HALLUCINATION_RETURN_LOCKOUT_MS = 350;
const activeServerHallucinations = new Map();

function clearServerHallucinationRedirects(clone) {
  if (!clone) return;
  for (const enemy of allSharedEnemies()) {
    if (
      enemy.mapId === clone.mapId &&
      enemy.tauntOwnerId === clone.ownerId &&
      (!clone.cloneId || enemy.tauntCloneId === clone.cloneId)
    ) {
      enemy.tauntTime = 0;
      enemy.tauntOwnerId = null;
      enemy.tauntCloneId = null;
    }
  }
}

function removeServerHallucinationForOwner(ownerId, mapId = null) {
  const clone = activeServerHallucinations.get(ownerId);
  if (!clone) return false;
  if (mapId && clone.mapId !== mapId) return false;
  activeServerHallucinations.delete(ownerId);
  clearServerHallucinationRedirects(clone);
  return true;
}

function startServerHallucination(ownerId, mapId, payload) {
  removeServerHallucinationForOwner(ownerId);
  const cloneId = typeof payload.cloneId === "string" && payload.cloneId
    ? payload.cloneId.slice(0, 96)
    : `hallucination:${ownerId}:${Date.now().toString(36)}`;

  const startedAtMs = Date.now();
  const owner = players.get(ownerId);
  const abilityLevel = Math.max(1, Number(owner?.abilities?.jesterBlink) || 1);
  const duration = ABILITY_SCALING.hallucinationDecoyDurationAtLevel(abilityLevel);
  const clone = {
    ownerId,
    mapId,
    cloneId,
    x: sanitizeVisualPoint(payload.startX, mapId, "x"),
    y: sanitizeVisualPoint(payload.startY, mapId, "y"),
    startedAtMs,
    hatIndex: clampInteger(payload.hatIndex, -1, 10, -1),
    shirtIndex: clampInteger(payload.shirtIndex, -1, 7, -1),
    pantsIndex: clampInteger(payload.pantsIndex, -1, 7, -1),
    duration,
    expiresAtMs: startedAtMs + duration * 1000,
    redirectedEnemyIds: new Set(),
    releasedEnemyIds: new Set()
  };

  activeServerHallucinations.set(ownerId, clone);

  // Redirect is a one-shot snapshot at cast time, not a pulsing taunt aura.
  // Only enemies that are already actively targeting this caster are eligible.
  // Passive enemies, enemies targeting somebody else, and enemies that aggro
  // after the Hallucination was cast are deliberately left alone.
  for (const enemy of allSharedEnemies()) {
    if (!enemy.alive || enemy.mapId !== mapId) continue;
    if (enemy.returningHome || enemy.hurlTime > 0 || enemy.carriedBy) continue;
    if (enemy.aggroTargetId !== ownerId) continue;
    if (Math.hypot(enemy.x - clone.x, enemy.y - clone.y) > SERVER_HALLUCINATION_REDIRECT_RADIUS) continue;

    enemy.tauntX = clone.x;
    enemy.tauntY = clone.y;
    enemy.tauntTime = duration;
    enemy.tauntOwnerId = ownerId;
    enemy.tauntCloneId = clone.cloneId;
    clone.redirectedEnemyIds.add(enemy.id);
  }

  return clone;
}

function completeServerHallucinationReturn(ownerId, mapId, payload) {
  const clone = activeServerHallucinations.get(ownerId);
  const owner = players.get(ownerId);
  const nowMs = Date.now();

  if (!clone || !owner || owner.hp <= 0) return false;
  if (clone.mapId !== mapId || owner.mapId !== mapId) return false;
  if (nowMs >= clone.expiresAtMs) return false;
  if (nowMs - (Number(clone.startedAtMs) || 0) < SERVER_HALLUCINATION_RETURN_LOCKOUT_MS) return false;
  if (payload.cloneId && payload.cloneId !== clone.cloneId) return false;

  // The clone position is server-owned. Never trust a client-supplied return
  // destination; snap the authoritative player record to the active illusion.
  payload.endX = clone.x;
  payload.endY = clone.y;
  payload.cloneId = clone.cloneId;
  owner.x = clone.x;
  owner.y = clone.y;

  activeServerHallucinations.delete(ownerId);
  clearServerHallucinationRedirects(clone);
  return true;
}

function tickServerHallucinations(dt) {
  const nowMs = Date.now();

  for (const [ownerId, clone] of activeServerHallucinations) {
    const owner = players.get(ownerId);
    if (
      !owner ||
      owner.hp <= 0 ||
      owner.mapId !== clone.mapId ||
      nowMs >= clone.expiresAtMs
    ) {
      activeServerHallucinations.delete(ownerId);
      clearServerHallucinationRedirects(clone);
      continue;
    }

    // Redirect was assigned once when the clone was created. From here the
    // server only watches those originally redirected enemies for contact.
    // There is intentionally no repeating redirect/taunt pulse.
    for (const enemy of allSharedEnemies()) {
      if (!clone.redirectedEnemyIds?.has(enemy.id)) continue;
      if (!enemy.alive || enemy.mapId !== clone.mapId) continue;
      if (clone.releasedEnemyIds.has(enemy.id)) continue;

      if (Math.hypot(enemy.x - clone.x, enemy.y - clone.y) <= SERVER_HALLUCINATION_CONTACT_RADIUS) {
        clone.releasedEnemyIds.add(enemy.id);
        enemy.releasedHallucinationId = clone.cloneId;
        if (
          enemy.tauntOwnerId === ownerId &&
          enemy.tauntCloneId === clone.cloneId
        ) {
          enemy.tauntTime = 0;
          enemy.tauntOwnerId = null;
          enemy.tauntCloneId = null;
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// SERVER-AUTHORITATIVE RAIN CLOUD + MAGIC GRASS FIELD
// -----------------------------------------------------------------------------
// One Rain Cloud creates one deterministic 20-cell field. Growth/expiry are
// time-derived and cost zero packets. Server owns Wet, grass slow, ghost rain
// damage, field fire, and rain extinguishing. Only field ignition/extinguish
// state changes replicate.
const SERVER_RAIN_CLOUD_ORBIT_MAX_RADIUS = 28;
const SERVER_RAIN_CLOUD_ORBIT_EXPAND_TIME = 7.0;
const SERVER_RAIN_CLOUD_ORBIT_ANGULAR_SPEED = 0.72;
const SERVER_RAIN_CLOUD_MOVE_SPEED = 22;
const SERVER_RAIN_CLOUD_RADIUS = 24;
const SERVER_RAIN_CLOUD_EFFECT_INTERVAL = 0.50;
const SERVER_RAIN_GHOST_DAMAGE_INTERVAL = 0.50;
const SERVER_RAIN_GHOST_POWER = 2;
const activeServerRainClouds = new Map();
const activeServerRainFields = new Map();
let serverRainPatchSequence = 0;
function serverRainFieldKey(ownerId, patchId) { return `${String(ownerId)}|${Number(patchId) || 0}`; }
function createServerRainField(ownerId, mapId, patchId, centerX, centerY, startedAtMs = Date.now()) {
  const dimensions = mapWorldDimensions(mapId);
  const owner = players.get(ownerId);
  const abilityLevel = Math.max(1, Number(owner?.abilities?.rainCloud) || 1);
  removeServerRainGrassForOwner(ownerId);
  const cells = RAIN_FIELD.generateCells({ ownerId, patchId, centerX, centerY, worldWidth: dimensions.width, worldHeight: dimensions.height });
  const field = { ownerId: String(ownerId), mapId, patchId: Number(patchId)||0, centerX, centerY, startedAtMs, abilityLevel,
    grassSlowMultiplier: ABILITY_SCALING.rainCloudGrassSpeedMultiplierAtLevel(abilityLevel),
    expiresAtMs: RAIN_FIELD.fieldExpiresAtMs(startedAtMs), cells, burningMask:0, burntMask:0,
    burnExpiresAtMs:Array(RAIN_FIELD.CELL_COUNT).fill(0), burnSourcePlayerIds:Array(RAIN_FIELD.CELL_COUNT).fill(null) };
  activeServerRainFields.set(serverRainFieldKey(ownerId,patchId),field); rainDiagnostics.fieldsCreated += 1; return field;
}
function removeServerRainGrassForOwner(ownerId, mapId = null) {
  const normalized=String(ownerId); for (const [key,field] of activeServerRainFields) if (field.ownerId===normalized && (!mapId||field.mapId===mapId)) activeServerRainFields.delete(key);
}
function serverRainFieldCellAvailable(field,cell,nowMs=Date.now()) {
  if(!field||!cell) return false; const bit=RAIN_FIELD.cellBit(cell.index); if(field.burntMask & bit) return false;
  const mapDefinition=WORLD_CONTENT.maps[field.mapId]||{};
  if(TERRAIN_RULES.canGrowMagicGrassAt(mapDefinition,cell.x,cell.y)===false)return false;
  return RAIN_FIELD.cellIsGrown(cell,field.startedAtMs,nowMs)&&RAIN_FIELD.cellIsNaturallyAlive(cell,field.startedAtMs,nowMs);
}
function serverRainFieldCellBurning(field,index,nowMs=Date.now()) {
  if(!field) return false; const bit=RAIN_FIELD.cellBit(index); return Boolean(field.burningMask&bit) && (Number(field.burnExpiresAtMs[index])||0)>nowMs;
}
function broadcastServerRainFieldDelta(field,{burningAddedMask=0,extinguishedMask=0,burnEnds=[]}={}) {
  if(!field?.mapId||(!burningAddedMask&&!extinguishedMask)) return false;
  broadcastToMap(field.mapId,{type:"rainFieldDelta",ownerId:field.ownerId,patchId:field.patchId,burningAddedMask:burningAddedMask>>>0,extinguishedMask:extinguishedMask>>>0,burnEnds});
  rainDiagnostics.fieldDeltaEvents += 1; return true;
}
function settleServerRainFields(nowMs=Date.now()) {
  for(const [key,field] of activeServerRainFields){
    if(nowMs>=field.expiresAtMs){activeServerRainFields.delete(key);continue;}
    for(let i=0;i<RAIN_FIELD.CELL_COUNT;i+=1){const bit=RAIN_FIELD.cellBit(i); if(!(field.burningMask&bit))continue;
      const end=Number(field.burnExpiresAtMs[i])||0; if(end>0&&nowMs>=end){field.burningMask=(field.burningMask&~bit)>>>0;field.burntMask=(field.burntMask|bit)>>>0;field.burnExpiresAtMs[i]=0;field.burnSourcePlayerIds[i]=null;}}
  }
}
function igniteServerRainFieldCell(field,index,sourcePlayerId=null,nowMs=Date.now()) {
  const cell=field?.cells?.[index]; if(!serverRainFieldCellAvailable(field,cell,nowMs)||serverRainFieldCellBurning(field,index,nowMs))return false;
  const bit=RAIN_FIELD.cellBit(index); field.burningMask=(field.burningMask|bit)>>>0; field.burnExpiresAtMs[index]=nowMs+RAIN_FIELD.BURN_DURATION*1000;
  field.burnSourcePlayerIds[index]=sourcePlayerId||field.ownerId||null; fireDiagnostics.rainGrassIgnitions+=1; rainDiagnostics.cellIgnitions+=1; return true;
}
function igniteServerRainGrassNear(mapId,x,y,radius,sourcePlayerId=null,{chance=1,maxIgnitions=Infinity}={}) {
  const now=Date.now(); settleServerRainFields(now); let total=0; const radiusSq=radius*radius; const changes=[];
  for(const field of activeServerRainFields.values()){if(field.mapId!==mapId)continue; const fdx=field.centerX-x,fdy=field.centerY-y,broad=Math.max(RAIN_FIELD.FIELD_RADIUS_X,RAIN_FIELD.FIELD_RADIUS_Y)+radius+16;
    if(fdx*fdx+fdy*fdy>broad*broad)continue; let mask=0; const ends=[];
    for(const cell of field.cells){if(total>=maxIgnitions)break;if(!serverRainFieldCellAvailable(field,cell,now)||serverRainFieldCellBurning(field,cell.index,now))continue;
      const dx=cell.x-x,dy=(cell.y-5)-y;if(dx*dx+dy*dy>radiusSq||Math.random()>chance)continue;
      if(igniteServerRainFieldCell(field,cell.index,sourcePlayerId,now)){mask|=RAIN_FIELD.cellBit(cell.index);ends.push([cell.index,RAIN_FIELD.BURN_DURATION]);total+=1;}}
    if(mask)changes.push([field,mask,ends]); if(total>=maxIgnitions)break;}
  for(const [field,mask,ends] of changes) broadcastServerRainFieldDelta(field,{burningAddedMask:mask,burnEnds:ends}); return total>0;
}
function extinguishServerRainGrassNear(mapId,x,y,radius){const now=Date.now();settleServerRainFields(now);const r2=radius*radius;let changed=false;
  for(const field of activeServerRainFields.values()){if(field.mapId!==mapId||!field.burningMask)continue;let mask=0;for(const cell of field.cells){if(!serverRainFieldCellBurning(field,cell.index,now))continue;
    const dx=cell.x-x,dy=(cell.y-5)-y;if(dx*dx+dy*dy>r2)continue;const bit=RAIN_FIELD.cellBit(cell.index);field.burningMask=(field.burningMask&~bit)>>>0;field.burnExpiresAtMs[cell.index]=0;field.burnSourcePlayerIds[cell.index]=null;mask|=bit;changed=true;rainDiagnostics.cellExtinguishes+=1;}
    if(mask)broadcastServerRainFieldDelta(field,{extinguishedMask:mask});} return changed;}
function burningServerRainGrassNear(mapId,x,y,radius){const now=Date.now(),r2=radius*radius;settleServerRainFields(now);for(const field of activeServerRainFields.values()){if(field.mapId!==mapId||!field.burningMask)continue;
  for(const cell of field.cells){if(!serverRainFieldCellBurning(field,cell.index,now))continue;const dx=cell.x-x,dy=(cell.y-5)-y;if(dx*dx+dy*dy<=r2)return true;}}return false;}
function serverRainGrassSlowMultiplierAtPoint(mapId,x,y,entityRadius=7,now=Date.now()){rainDiagnostics.grassQueries+=1;let multiplier=1;for(const field of activeServerRainFields.values()){if(field.mapId!==mapId)continue;
  const broad=Math.max(RAIN_FIELD.FIELD_RADIUS_X,RAIN_FIELD.FIELD_RADIUS_Y)+entityRadius+16,fdx=field.centerX-x,fdy=field.centerY-y;if(fdx*fdx+fdy*fdy>broad*broad)continue;
  for(const cell of field.cells){rainDiagnostics.grassCellChecks+=1;if(!serverRainFieldCellAvailable(field,cell,now))continue;const r=RAIN_FIELD.combinedHitRadius(cell,entityRadius),dx=x-cell.x,dy=y-cell.y;if(dx*dx+dy*dy<=r*r){multiplier=Math.min(multiplier,Math.max(.1,Math.min(1,Number(field.grassSlowMultiplier)||RAIN_FIELD.SPEED_MULTIPLIER)));break;}}}return multiplier;}
function pointIsInServerRainGrass(mapId,x,y,entityRadius=7,now=Date.now()){return serverRainGrassSlowMultiplierAtPoint(mapId,x,y,entityRadius,now)<1;}
function updateEnemyRainGrassDerivedState(enemy,now=Date.now()){if(!enemy?.alive)return false;const multiplier=serverRainGrassSlowMultiplierAtPoint(enemy.mapId,Number(enemy.x)||0,Number(enemy.y)||0,7,now);const active=multiplier<1;
  if(Boolean(enemy.magicGrassFieldActive)!==active){if(active)rainDiagnostics.grassEnters+=1;else rainDiagnostics.grassExits+=1;enemy.magicGrassFieldActive=active;}enemy.magicGrassSlowMultiplier=active?multiplier:RAIN_FIELD.SPEED_MULTIPLIER;return active;}
function tickServerRainGrassMembership(){const now=Date.now();settleServerRainFields(now);for(const enemy of allSharedEnemies()){if(!enemy.alive){enemy.magicGrassFieldActive=false;continue;}updateEnemyRainGrassDerivedState(enemy,now);}}
function spreadServerRainGrassFire(){const now=Date.now();settleServerRainFields(now);const sources=[];for(const field of activeServerRainFields.values())for(const cell of field.cells)if(serverRainFieldCellBurning(field,cell.index,now))sources.push({field,cell});
  fireDiagnostics.spreadSources+=sources.length;for(const {field,cell} of sources){const sourceId=field.burnSourcePlayerIds[cell.index]||field.ownerId;igniteServerLivingNear(field.mapId,cell.x,cell.y-5,14,sourceId);
    if(Math.random()>RAIN_FIELD.FIRE_CHAIN_CHANCE)continue;igniteEnvironmentNear(field.mapId,cell.x,cell.y-5,RAIN_FIELD.FIRE_CHAIN_RADIUS,sourceId);igniteServerRainGrassNear(field.mapId,cell.x,cell.y-5,RAIN_FIELD.FIRE_CHAIN_RADIUS,sourceId,{chance:1,maxIgnitions:RAIN_FIELD.FIRE_CHAIN_MAX_IGNITIONS});}}
function removeServerRainCloudForOwner(ownerId,mapId=null){const cloud=activeServerRainClouds.get(ownerId);if(!cloud)return false;if(mapId&&cloud.mapId!==mapId)return false;activeServerRainClouds.delete(ownerId);return true;}
function resolveServerRainCloudTarget(ownerId, mapId, requestedX, requestedY) {
  const dimensions = mapWorldDimensions(mapId);
  const owner = players.get(ownerId);
  const originX = Number(owner?.x);
  const originY = Number(owner?.y) - 8;
  const fallbackX = Number.isFinite(originX) ? originX : dimensions.width / 2;
  const fallbackY = Number.isFinite(originY) ? originY : dimensions.height / 2;

  let targetX = clampNumber(requestedX, 6, dimensions.width - 6, fallbackX);
  let targetY = clampNumber(requestedY, 10, dimensions.height - 4, fallbackY);

  // Rain Cloud's authored range is 80px. Enforce it here as well as on the
  // client so the server remains authoritative about the final summon point.
  const dx = targetX - fallbackX;
  const dy = targetY - fallbackY;
  const distance = Math.hypot(dx, dy);
  if (distance > 80) {
    const scale = 80 / distance;
    targetX = fallbackX + dx * scale;
    targetY = fallbackY + dy * scale;
  }

  const mapDefinition = WORLD_CONTENT.maps[mapId] || {};
  if (TERRAIN_RULES.terrainDefinition(mapDefinition)) {
    const resolved = TERRAIN_RULES.clampSegmentToNonVoid(
      mapDefinition,
      Number.isFinite(Number(owner?.x)) ? Number(owner.x) : fallbackX,
      Number.isFinite(Number(owner?.y)) ? Number(owner.y) : fallbackY,
      targetX,
      targetY
    );
    targetX = resolved.x;
    targetY = resolved.y;
  }

  return { x: targetX, y: targetY };
}

function startServerRainCloud(ownerId, mapId, payload) {
  const life = clampNumber(payload.cloudLife, 4, 24, 12);
  const target = resolveServerRainCloudTarget(
    ownerId,
    mapId,
    payload.targetX,
    payload.targetY
  );
  const x = target.x;
  const y = target.y;
  const orbitAngle = clampNumber(payload.orbitAngle, -Math.PI * 4, Math.PI * 4, 0);
  const patchId = clampInteger(payload.patchId, 1, 1000000000, ++serverRainPatchSequence);
  const startedAtMs = Date.now();
  const cloud = {
    ownerId, mapId, x, y, targetX: x, targetY: y, orbitCenterX: x, orbitCenterY: y,
    orbitAngle, orbitElapsed: 0, orbitRadius: 0, moveSpeed: SERVER_RAIN_CLOUD_MOVE_SPEED,
    life, startedAtMs, expiresAtMs: startedAtMs + life * 1000, effectPulseTimer: 0,
    ghostDamageTimer: 0, radius: SERVER_RAIN_CLOUD_RADIUS, patchId
  };
  activeServerRainClouds.set(ownerId, cloud);
  createServerRainField(ownerId, mapId, patchId, x, y, startedAtMs);
  return cloud;
}
function broadcastServerPlayerWetState(target){
  if(!target?.mapId)return;
  broadcastToMap(target.mapId,{type:"playerWetState",id:target.id,wetTime:Math.max(0,Number(target.wetTime)||0)});
}
function applyServerPlayerWet(target,duration=STATUS_RULES.playerWetDuration){if(!target||target.hp<=0)return false;const wasWet=(Number(target.wetTime)||0)>0;clearServerPlayerBurn(target);target.wetTime=Math.max(Number(target.wetTime)||0,Math.max(.1,Number(duration)||STATUS_RULES.playerWetDuration));if(!wasWet){rainDiagnostics.playerWetEnters+=1;broadcastServerPlayerWetState(target);}return !wasWet;}
function clearServerPlayerWet(target){if(!target||(Number(target.wetTime)||0)<=0)return false;target.wetTime=0;rainDiagnostics.playerWetExits+=1;broadcastServerPlayerWetState(target);return true;}
function tickServerPlayerWetTimers(dt){for(const target of players.values()){if((Number(target.wetTime)||0)<=0)continue;target.wetTime=Math.max(0,target.wetTime-dt);if(target.wetTime<=0){rainDiagnostics.playerWetExits+=1;broadcastServerPlayerWetState(target);}}}
function serverRainCloudAffectsPoint(cloud,x,y,inset=0){const r=Math.max(1,cloud.radius-inset),dx=x-cloud.x,dy=y-cloud.y;return dx*dx+dy*dy<=r*r;}
function applyServerRainCloudToLiving(cloud,owner,damageTick){for(const enemy of allSharedEnemies()){if(!enemy.alive||enemy.returningHome||enemy.mapId!==cloud.mapId)continue;const profile=serverEnemyProfile(enemy),body=serverEnemyBodyPoint(enemy),inset=profile?.rainRadiusInset??2;if(!serverRainCloudAffectsPoint(cloud,body.x,body.y,inset))continue;
  const burning=burningServerRainGrassNear(cloud.mapId,body.x,body.y,14);if(profile?.rainEffect==="damage"){if(!burning)clearServerEnemyBurn(enemy);if(!damageTick)continue;if(!owner||owner.hp<=0||(Number(owner.abilities?.rainCloud)||0)<=0||!COMBAT_BALANCE.isWandWeaponIndex(owner.weaponIndex))continue;
    const damage=calculateServerPlayerDamage(owner,enemy,"rain",false,{rainPower:SERVER_RAIN_GHOST_POWER});enemy.hp=Math.max(0,enemy.hp-damage);setEnemyAggroTarget(enemy,owner.id);enemy.lastDamagePlayerId=owner.id;broadcastToMap(enemy.mapId,{type:"enemyDamage",enemyType:enemy.type,enemyId:enemy.id,mapId:enemy.mapId,amount:damage,hp:enemy.hp,critical:false,source:"rain",element:COMBAT_BALANCE.elementForAttack("rain",owner.weaponIndex),attackerId:owner.id});rainDiagnostics.ghostDamageTicks+=1;if(enemy.hp<=0)killSharedEnemy(enemy,owner.id);continue;}
  if(burning){if(enemy.wetTime>0){enemy.wetTime=0;rainDiagnostics.enemyWetExits+=1;}continue;}const wasWet=enemy.wetTime>0;applyServerEnemyWet(enemy,STATUS_RULES.enemyWetDuration);if(!wasWet&&enemy.wetTime>0)rainDiagnostics.enemyWetEnters+=1;}}
function tickServerRainClouds(dt){const now=Date.now();settleServerRainFields(now);for(const [ownerId,cloud] of activeServerRainClouds){const owner=players.get(ownerId);if(!owner||owner.hp<=0||owner.mapId!==cloud.mapId||now>=cloud.expiresAtMs){activeServerRainClouds.delete(ownerId);continue;}
  cloud.orbitElapsed=Math.max(0,(now-cloud.startedAtMs)/1000);cloud.orbitAngle+=SERVER_RAIN_CLOUD_ORBIT_ANGULAR_SPEED*dt;const progress=Math.max(0,Math.min(1,cloud.orbitElapsed/SERVER_RAIN_CLOUD_ORBIT_EXPAND_TIME)),eased=progress*progress*(3-2*progress);cloud.orbitRadius=SERVER_RAIN_CLOUD_ORBIT_MAX_RADIUS*eased;const d=mapWorldDimensions(cloud.mapId);let orbitTargetX=clampNumber(cloud.orbitCenterX+Math.cos(cloud.orbitAngle)*cloud.orbitRadius,6,d.width-6,cloud.x);let orbitTargetY=clampNumber(cloud.orbitCenterY+Math.sin(cloud.orbitAngle)*cloud.orbitRadius*.72,10,d.height-4,cloud.y);const mapDefinition=WORLD_CONTENT.maps[cloud.mapId]||{};if(TERRAIN_RULES.terrainDefinition(mapDefinition)){const resolved=TERRAIN_RULES.clampSegmentToNonVoid(mapDefinition,cloud.x,cloud.y,orbitTargetX,orbitTargetY);orbitTargetX=resolved.x;orbitTargetY=resolved.y;}cloud.targetX=orbitTargetX;cloud.targetY=orbitTargetY;const dx=cloud.targetX-cloud.x,dy=cloud.targetY-cloud.y,dist=Math.hypot(dx,dy);if(dist>.25){const step=Math.min(dist,cloud.moveSpeed*dt);cloud.x+=dx/dist*step;cloud.y+=dy/dist*step;}else{cloud.x=cloud.targetX;cloud.y=cloud.targetY;}
  cloud.effectPulseTimer-=dt;if(cloud.effectPulseTimer<=0){cloud.effectPulseTimer+=SERVER_RAIN_CLOUD_EFFECT_INTERVAL;extinguishEnvironmentNear(cloud.mapId,cloud.x,cloud.y,cloud.radius);extinguishServerRainGrassNear(cloud.mapId,cloud.x,cloud.y,cloud.radius);}cloud.ghostDamageTimer-=dt;const damageTick=cloud.ghostDamageTimer<=0;if(damageTick)cloud.ghostDamageTimer+=SERVER_RAIN_GHOST_DAMAGE_INTERVAL;applyServerRainCloudToLiving(cloud,owner,damageTick);
  for (const target of players.values()) {
    if (
      target.mapId !== cloud.mapId ||
      target.hp <= 0 ||
      !serverRainCloudAffectsPoint(
        cloud,
        target.x,
        target.y - 8,
        1
      )
    ) {
      continue;
    }

    const isOwner = target.id === ownerId;

    // Your own Rain Cloud still wets you. Against another player, Wet/slow is
    // a PvP status and therefore requires mutual opt-in just like direct hits.
    if (
      !isOwner &&
      (!owner || !pvpPlayersCanHarm(owner, target))
    ) {
      continue;
    }

    const burning = burningServerRainGrassNear(
      cloud.mapId,
      target.x,
      target.y - 8,
      12
    );

    if (burning) {
      clearServerPlayerWet(target);
      continue;
    }

    const hadBurn = (Number(target.burnTime) || 0) > 0;
    applyServerPlayerWet(
      target,
      STATUS_RULES.playerWetDuration
    );

    if (!isOwner && owner) {
      applyPvpCombatLock(owner, target);
    }

    if (hadBurn && target.burnTime <= 0) {
      broadcastServerPlayerBurnState(target);
    }
  }
}}

function transientAbilitySnapshotForMap(
  mapId,
  excludeOwnerId = null
) {
  const nowMs = Date.now();
  const excluded = excludeOwnerId ? String(excludeOwnerId) : null;

  const rainClouds = [];
  for (const [ownerId, cloud] of activeServerRainClouds) {
    if (
      cloud.mapId !== mapId ||
      (excluded && ownerId === excluded) ||
      nowMs >= cloud.expiresAtMs
    ) {
      continue;
    }

    rainClouds.push({
      ownerId,
      x: cloud.x,
      y: cloud.y,
      orbitCenterX: cloud.orbitCenterX,
      orbitCenterY: cloud.orbitCenterY,
      orbitAngle: cloud.orbitAngle,
      orbitElapsed: cloud.orbitElapsed,
      orbitRadius: cloud.orbitRadius,
      totalLife: cloud.life,
      remainingLife: Math.max(0, (cloud.expiresAtMs - nowMs) / 1000),
      patchId: cloud.patchId
    });
  }

  const hallucinations = [];
  for (const [ownerId, clone] of activeServerHallucinations) {
    if (
      clone.mapId !== mapId ||
      (excluded && ownerId === excluded) ||
      nowMs >= clone.expiresAtMs
    ) {
      continue;
    }

    hallucinations.push({
      ownerId,
      cloneId: clone.cloneId,
      x: clone.x,
      y: clone.y,
      remainingLife: Math.max(0, (clone.expiresAtMs - nowMs) / 1000),
      duration: Math.max(0.05, Number(clone.duration) || SERVER_HALLUCINATION_DURATION),
      hatIndex: clone.hatIndex,
      shirtIndex: clone.shirtIndex,
      pantsIndex: clone.pantsIndex
    });
  }

  const rainFields = [];
  settleServerRainFields(nowMs);
  for (const field of activeServerRainFields.values()) {
    if (field.mapId !== mapId || (excluded && field.ownerId === excluded) || nowMs >= field.expiresAtMs) continue;
    const burnEnds = [];
    for (let index = 0; index < RAIN_FIELD.CELL_COUNT; index += 1) if (serverRainFieldCellBurning(field,index,nowMs)) burnEnds.push([index,Math.max(0,(field.burnExpiresAtMs[index]-nowMs)/1000)]);
    rainFields.push({ownerId:field.ownerId,patchId:field.patchId,centerX:field.centerX,centerY:field.centerY,age:Math.max(0,(nowMs-field.startedAtMs)/1000),burningMask:field.burningMask>>>0,burntMask:field.burntMask>>>0,burnEnds});
  }

  return { rainClouds, hallucinations, rainFields };
}

function sanitizeVisualEffectPayload(
  effect,
  payload = {},
  mapId = null
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

      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),
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
      startX: sanitizeVisualPoint(payload.startX, mapId, "x"),
      startY: sanitizeVisualPoint(payload.startY, mapId, "y"),
      targetX: sanitizeVisualPoint(payload.targetX, mapId, "x"),
      targetY: sanitizeVisualPoint(payload.targetY, mapId, "y"),
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
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),
      vx: sanitizeVisualVelocity(payload.vx),
      vy: sanitizeVisualVelocity(payload.vy),
      airborne: Boolean(payload.airborne),
      startX: sanitizeVisualPoint(payload.startX, mapId, "x"),
      startY: sanitizeVisualPoint(payload.startY, mapId, "y"),
      targetX: sanitizeVisualPoint(payload.targetX, mapId, "x"),
      targetY: sanitizeVisualPoint(payload.targetY, mapId, "y"),
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
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),
      primaryEnemyId: typeof payload.primaryEnemyId === "string"
        ? payload.primaryEnemyId.slice(0, 96)
        : null
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

      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y")
    };
  }

  if (effect === "wandMasteryHit") {
    return {
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),
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
      ),
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y")
    };
  }

  if (effect === "rainCast") {
    return {
      startX: sanitizeVisualPoint(payload.startX, mapId, "x"),
      startY: sanitizeVisualPoint(payload.startY, mapId, "y"),
      targetX: sanitizeVisualPoint(payload.targetX, mapId, "x"),
      targetY: sanitizeVisualPoint(payload.targetY, mapId, "y"),

      followPlayer: Boolean(payload.followPlayer),
      retarget: Boolean(payload.retarget),
      instant: Boolean(payload.instant),

      cloudLife: clampNumber(
        payload.cloudLife,
        4,
        24,
        12
      ),
      orbitAngle: clampNumber(
        payload.orbitAngle,
        -Math.PI * 4,
        Math.PI * 4,
        0
      ),
      patchId: clampInteger(
        payload.patchId,
        0,
        1000000000,
        0
      )
    };
  }



  if (effect === "shadowSmoke") {
    return {
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),

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
      startX: sanitizeVisualPoint(payload.startX, mapId, "x"),
      startY: sanitizeVisualPoint(payload.startY, mapId, "y"),
      endX: sanitizeVisualPoint(payload.endX, mapId, "x"),
      endY: sanitizeVisualPoint(payload.endY, mapId, "y"),
      cloneId: typeof payload.cloneId === "string"
        ? payload.cloneId.slice(0, 96)
        : "",

      hatIndex: clampInteger(
        payload.hatIndex,
        -1,
        10,
        -1
      ),

      shirtIndex: clampInteger(
        payload.shirtIndex,
        -1,
        7,
        -1
      ),

      pantsIndex: clampInteger(
        payload.pantsIndex,
        -1,
        7,
        -1
      )
    };
  }

  if (effect === "jesterReturn") {
    return {
      startX: sanitizeVisualPoint(payload.startX, mapId, "x"),
      startY: sanitizeVisualPoint(payload.startY, mapId, "y"),
      endX: sanitizeVisualPoint(payload.endX, mapId, "x"),
      endY: sanitizeVisualPoint(payload.endY, mapId, "y"),
      cloneId: typeof payload.cloneId === "string"
        ? payload.cloneId.slice(0, 96)
        : ""
    };
  }

  return null;
}

function clearPlayerOwnedTransientWorldState(
  playerId,
  mapId = null
) {
  removeServerRainCloudForOwner(playerId, mapId);
  removeServerRainGrassForOwner(playerId, mapId);
  removeServerHallucinationForOwner(playerId, mapId);

  cancelHunterSnareSetup(
    playerId,
    "ownerCleanup"
  );

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

  for (const rock of environmentEntitiesOnMap(mapId, "rock")) {
    if (rock.carriedBy === playerId) {
      clearServerRockHurlState(rock);
    }
  }
}

function broadcastOwnerTransientCleanup(
  playerId,
  mapId,
  excludeSocket = null
) {
  if (!mapId) return;

  broadcastToMap(
    mapId,
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
    "shadowSmoke",
    "jesterBlink",
    "jesterReturn"
  ]);

  if (!allowedEffects.has(effect)) return;

  const payload =
    sanitizeVisualEffectPayload(
      effect,
      message.payload,
      playerState.mapId
    );

  if (!payload) return;

  if (effect === "jesterBlink") {
    const clone = startServerHallucination(playerId, playerState.mapId, payload);
    payload.duration = Math.max(0.05, Number(clone?.duration) || SERVER_HALLUCINATION_DURATION);
  }

  if (effect === "jesterReturn") {
    if (!completeServerHallucinationReturn(playerId, playerState.mapId, payload)) {
      return;
    }
  }

  if (effect === "fireballImpact") {
    applyServerFireballSplashBurn(playerId, playerState.mapId, payload);
  }

  if (effect === "rainCast") {
    if (payload.retarget) {
      const activeCloud = activeServerRainClouds.get(playerId);
      if (activeCloud && activeCloud.mapId === playerState.mapId) {
        const resolved = resolveServerRainCloudTarget(
          playerId,
          playerState.mapId,
          payload.targetX,
          payload.targetY
        );
        activeCloud.orbitCenterX = resolved.x;
        activeCloud.orbitCenterY = resolved.y;
        payload.targetX = resolved.x;
        payload.targetY = resolved.y;
      }
    } else {
      const cloud = startServerRainCloud(playerId, playerState.mapId, payload);
      payload.targetX = cloud.orbitCenterX;
      payload.targetY = cloud.orbitCenterY;
    }
  }


  // The source client already rendered the local copy.
  broadcastToMap(
    playerState.mapId,
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

    stone: previous && Number.isFinite(previous.stone)
      ? previous.stone
      : 0,

    whiteFlowers: previous && Number.isFinite(previous.whiteFlowers) ? previous.whiteFlowers : 0,
    blueFlowers: previous && Number.isFinite(previous.blueFlowers) ? previous.blueFlowers : 0,
    healingPotions: previous && Number.isFinite(previous.healingPotions) ? previous.healingPotions : 0,
    attackPotions: previous && Number.isFinite(previous.attackPotions) ? previous.attackPotions : 0,
    magicPotions: previous && Number.isFinite(previous.magicPotions) ? previous.magicPotions : 0,
    consumableCooldownUntil: previous && Number.isFinite(previous.consumableCooldownUntil) ? previous.consumableCooldownUntil : 0,
    attackPotionCooldownUntil: previous && Number.isFinite(previous.attackPotionCooldownUntil) ? previous.attackPotionCooldownUntil : 0,
    magicPotionCooldownUntil: previous && Number.isFinite(previous.magicPotionCooldownUntil) ? previous.magicPotionCooldownUntil : 0,
    attackPotionUntil: previous && Number.isFinite(previous.attackPotionUntil) ? previous.attackPotionUntil : 0,
    magicPotionUntil: previous && Number.isFinite(previous.magicPotionUntil) ? previous.magicPotionUntil : 0,

    goldSlimeBubbles:
      previous && Number.isFinite(previous.goldSlimeBubbles)
        ? previous.goldSlimeBubbles
        : 0,

    arrows: previous && Number.isFinite(previous.arrows)
      ? previous.arrows
      : 0,

    beachQuestStage: previous
      ? beachQuestStage(previous)
      : "none",

    beachQuestFirstCrabKills: previous
      ? Math.max(0, Math.min(BEACH_QUEST_FIRST_CRAB_GOAL, Math.floor(Number(previous.beachQuestFirstCrabKills) || 0)))
      : 0,

    beachQuestSecondCrabKills: previous
      ? Math.max(0, Math.min(BEACH_QUEST_SECOND_CRAB_GOAL, Math.floor(Number(previous.beachQuestSecondCrabKills) || 0)))
      : 0,

    beachQuestIcedCoffee: previous
      ? Math.max(0, Math.min(1, Math.floor(Number(previous.beachQuestIcedCoffee) || 0)))
      : 0,

    myrtleQuestStage: previous
      ? myrtleQuestStage(previous)
      : "none",

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

    woodRingCrafted:
      previous
        ? Boolean(previous.woodRingCrafted)
        : false,

    marniePickaxeReceived:
      previous
        ? Boolean(previous.marniePickaxeReceived)
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

    hatIndex: clampInteger(source.hatIndex, -1, 10, -1),
    shirtIndex: clampInteger(source.shirtIndex, -1, 7, -1),
    pantsIndex: clampInteger(source.pantsIndex, -1, 7, -1),
    charmIndex: clampInteger(source.charmIndex, -1, 0, -1),
    weaponIndex: clampInteger(source.weaponIndex, -1, 12, -1),

    // Progression remains client-owned for now, but server damage uses these
    // sanitized values instead of trusting a client-supplied damage number.
    level: clampInteger(
      source.level,
      1,
      99,
      previous?.level || 1
    ),

    classId:
      ["might", "arcana", "precision", "guile"].includes(source.classId)
        ? source.classId
        : previous?.classId || null,

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

    // Combat-relevant learned skill levels. They are not broadcast to other
    // players; the authoritative damage formula only needs them server-side.
    abilities: {
      wandMastery: clampInteger(
        source.abilities?.wandMastery,
        0,
        COMBAT_BALANCE.abilityProfiles.wandMasteryMelee.maxLevel,
        previous?.abilities?.wandMastery || 0
      ),
      fireball: clampInteger(
        source.abilities?.fireball,
        0,
        COMBAT_BALANCE.abilityProfiles.fireball.maxLevel,
        previous?.abilities?.fireball || 0
      ),
      rainCloud: clampInteger(
        source.abilities?.rainCloud,
        0,
        ABILITY_SCALING.rainCloud.maxLevel,
        previous?.abilities?.rainCloud || 0
      ),
      jesterBlink: clampInteger(
        source.abilities?.jesterBlink,
        0,
        ABILITY_SCALING.hallucination.maxLevel,
        previous?.abilities?.jesterBlink || 0
      ),
      camouflage: clampInteger(
        source.abilities?.camouflage,
        0,
        1,
        previous?.abilities?.camouflage || 0
      )
    },

    walkTime: clampNumber(source.walkTime, 0, 1000000, 0),
    firstRaisedLeg:
      source.firstRaisedLeg === "right" ? "right" : "left",

    // Transient combat/presentation state is server-owned once a session exists.
    // Compact playerAction/playerAim messages mutate it; the 30 Hz server tick
    // advances clocks. Generic state patches and safety heartbeats cannot stream
    // or overwrite presentation timers.
    attackTime: previous ? Math.max(0, Number(previous.attackTime) || 0) : 0,
    attackDuration: previous ? clampNumber(previous.attackDuration, 0.05, 1, 0.30) : clampNumber(source.attackDuration, 0.05, 1, 0.30),
    attackDirection: previous ? (["left", "right", "up", "down"].includes(previous.attackDirection) ? previous.attackDirection : "left") : (["left", "right", "up", "down"].includes(source.attackDirection) ? source.attackDirection : "left"),
    attackHand: previous ? (previous.attackHand === "right" ? "right" : "left") : (source.attackHand === "right" ? "right" : "left"),
    attackAimAngle: previous ? clampNumber(previous.attackAimAngle, -Math.PI * 4, Math.PI * 4, 0) : clampNumber(source.attackAimAngle, -Math.PI * 4, Math.PI * 4, 0),

    bowDrawing: previous ? Boolean(previous.bowDrawing) : false,
    bowDrawAmount: previous ? clampNumber(previous.bowDrawAmount, 0, 1, 0) : 0,
    bowDrawDuration: previous ? clampNumber(previous.bowDrawDuration, 0.05, 3, 1.0) : clampNumber(source.bowDrawDuration, 0.05, 3, 1.0),
    bowReleaseTime: previous ? clampNumber(previous.bowReleaseTime, 0, 0.5, 0) : 0,
    bowReleaseDuration: previous ? clampNumber(previous.bowReleaseDuration, 0.03, 0.5, 0.12) : clampNumber(source.bowReleaseDuration, 0.03, 0.5, 0.12),

    focusFireCasting: previous ? Boolean(previous.focusFireCasting) : false,
    fireballAiming: previous ? Boolean(previous.fireballAiming) : false,
    fireballAimTime: previous ? Math.max(0, Number(previous.fireballAimTime) || 0) : 0,
    rainCloudCasting: previous ? Boolean(previous.rainCloudCasting) : false,
    rainCloudCastTime: previous ? Math.max(0, Number(previous.rainCloudCastTime) || 0) : 0,
    rainCloudCastDuration: previous ? clampNumber(previous.rainCloudCastDuration, 0.05, 2, 0.50) : clampNumber(source.rainCloudCastDuration, 0.05, 2, 0.50),

    // Camouflage is server-owned. Ordinary client state packets cannot enter,
    // extend, or leave it; dedicated server state tracks cover and opener use.
    camouflaged: previous ? Boolean(previous.camouflaged) : false,

    // Hunter's Snare setup is owned by hunterSnareSetups. Client state packets
    // cannot start, accelerate, complete, or cancel the setup countdown.
    shadowHidden: previous ? Boolean(previous.shadowHidden) : false,
    shadowHideRevealTime: previous ? clampNumber(previous.shadowHideRevealTime, 0, 1, 0) : 0,

    wetTime: previous
      ? Math.max(0, Number(previous.wetTime) || 0)
      : 0,
    // Burn is server-clocked in v253. A client's 10 Hz state stream may not
    // shorten/extend the authoritative hazard timer.
    burnTime: previous
      ? Math.max(0, Number(previous.burnTime) || 0)
      : 0,
    burnTickTimer: previous
      ? Math.max(0, Number(previous.burnTickTimer) || 0)
      : 0,
    burnDamageAccumulator: previous
      ? Math.max(0, Number(previous.burnDamageAccumulator) || 0)
      : 0,
    burnSourcePlayerId:
      previous && typeof previous.burnSourcePlayerId === "string"
        ? previous.burnSourcePlayerId
        : null,

    // Presentation-only Hurl whiff/reach state. These fields are sanitized
    // and rebroadcast so nearby players can see the failed-grab animation.
    hurlReachTime: previous ? clampNumber(previous.hurlReachTime, 0, 0.5, 0) : 0,
    hurlReachDuration: previous ? clampNumber(previous.hurlReachDuration, 0.05, 0.5, 0.18) : clampNumber(source.hurlReachDuration, 0.05, 0.5, 0.18),
    hurlReachDirX: previous ? clampNumber(previous.hurlReachDirX, -1, 1, 0) : 0,
    hurlReachDirY: previous ? clampNumber(previous.hurlReachDirY, -1, 1, 0) : 0
  };
}

function publicPlayerState(playerState) {
  if (!playerState) return null;

  // Only properties another browser can actually render/use belong on the
  // outbound presence stream. Inventory, crafting progress, shop purchases,
  // combat stats, server-only camouflage windows, etc. remain server-side.
  return {
    id: playerState.id,
    mapId: playerState.mapId,
    x: playerState.x,
    y: playerState.y,
    hp: playerState.hp,
    maxHp: playerState.maxHp,
    isDead: playerState.isDead,
    pvpEnabled: playerState.pvpEnabled,
    pvpCombatUntil: playerState.pvpCombatUntil,

    hatIndex: playerState.hatIndex,
    shirtIndex: playerState.shirtIndex,
    pantsIndex: playerState.pantsIndex,
    charmIndex: playerState.charmIndex,
    weaponIndex: playerState.weaponIndex,

    walkTime: playerState.walkTime,
    firstRaisedLeg: playerState.firstRaisedLeg,

    attackTime: playerState.attackTime,
    attackDuration: playerState.attackDuration,
    attackDirection: playerState.attackDirection,
    attackHand: playerState.attackHand,
    attackAimAngle: playerState.attackAimAngle,

    bowDrawing: playerState.bowDrawing,
    bowDrawAmount: playerState.bowDrawAmount,
    bowDrawDuration: playerState.bowDrawDuration,
    bowReleaseTime: playerState.bowReleaseTime,
    bowReleaseDuration: playerState.bowReleaseDuration,
    focusFireCasting: playerState.focusFireCasting,
    fireballAiming: playerState.fireballAiming,
    fireballAimTime: playerState.fireballAimTime,
    rainCloudCasting: playerState.rainCloudCasting,
    rainCloudCastTime: playerState.rainCloudCastTime,
    rainCloudCastDuration: playerState.rainCloudCastDuration,
    camouflaged: playerState.camouflaged,

    shadowHidden: playerState.shadowHidden,
    shadowHideRevealTime: playerState.shadowHideRevealTime,
    wetTime: playerState.wetTime,
    burnTime: playerState.burnTime,

    hurlReachTime: playerState.hurlReachTime,
    hurlReachDuration: playerState.hurlReachDuration,
    hurlReachDirX: playerState.hurlReachDirX,
    hurlReachDirY: playerState.hurlReachDirY
  };
}

function publicPlayerDelta(previousState, nextState) {
  const before = publicPlayerState(previousState) || {};
  const after = publicPlayerState(nextState) || {};
  const delta = {
    id: after.id,
    mapId: after.mapId
  };

  for (const [key, value] of Object.entries(after)) {
    if (key === "id" || key === "mapId") continue;

    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      delta[key] = value;
    }
  }

  return delta;
}

const PLAYER_MOVEMENT_DELTA_FIELDS = new Set(["x", "y", "walkTime", "firstRaisedLeg"]);

const PLAYER_TRANSIENT_DELTA_FIELDS = new Set([
  "attackTime", "attackDuration", "attackDirection", "attackHand", "attackAimAngle",
  "bowDrawing", "bowDrawAmount", "bowDrawDuration", "bowReleaseTime", "bowReleaseDuration",
  "focusFireCasting", "fireballAiming", "fireballAimTime",
  "rainCloudCasting", "rainCloudCastTime", "rainCloudCastDuration",
  "shadowHidden", "shadowHideRevealTime", "wetTime", "burnTime",
  "hurlReachTime", "hurlReachDuration", "hurlReachDirX", "hurlReachDirY"
]);

function compactPlayerMovementPacket(delta) {
  const hasMovement = [...PLAYER_MOVEMENT_DELTA_FIELDS]
    .some(field => Object.prototype.hasOwnProperty.call(delta, field));
  if (!hasMovement) return null;
  return {
    type: "playerMove",
    id: delta.id,
    p: [
      Number.isFinite(delta.x) ? Number(delta.x.toFixed(2)) : null,
      Number.isFinite(delta.y) ? Number(delta.y.toFixed(2)) : null,
      Number.isFinite(delta.walkTime) ? Number(delta.walkTime.toFixed(3)) : null,
      Object.prototype.hasOwnProperty.call(delta, "firstRaisedLeg")
        ? (delta.firstRaisedLeg === "right" ? 1 : 0)
        : null
    ]
  };
}

function playerStateDeltaWithoutMovement(delta) {
  const stateDelta = { id: delta.id, mapId: delta.mapId };
  for (const [key, value] of Object.entries(delta)) {
    if (key === "id" || key === "mapId" || PLAYER_MOVEMENT_DELTA_FIELDS.has(key) || PLAYER_TRANSIENT_DELTA_FIELDS.has(key)) continue;
    stateDelta[key] = value;
  }
  return stateDelta;
}

function mergedIncrementalPlayerSource(previousState, patch = {}) {
  if (!previousState) return patch;

  return {
    ...previousState,
    ...patch,
    // Partial updates may contain only one progression stat. Preserve the rest
    // instead of letting the sanitizer fall back to zero/default values.
    stats: {
      ...(previousState.stats || {}),
      ...(patch.stats || {})
    },
    // Incremental updates are never allowed to move between maps. Portal/map
    // transitions continue to use the full playerState path so destination
    // scene sync remains atomic and authoritative.
    mapId: previousState.mapId
  };
}

function applyIncrementalPlayerUpdate(id, socket, patch) {
  const previousState = players.get(id);
  if (!previousState || !patch || typeof patch !== "object") return;

  const cleanState = sanitizePlayerState(
    id,
    mergedIncrementalPlayerSource(previousState, patch),
    previousState
  );

  players.set(id, cleanState);
  noteServerCamouflagePlayerUpdate(previousState, cleanState);

  broadcastPublicPlayerDelta(
    previousState,
    cleanState,
    socket
  );
}

function socketMapBucket(mapId, create = false) {
  if (!mapId) return null;

  let bucket = socketsByMap.get(mapId) || null;

  if (!bucket && create) {
    bucket = new Set();
    socketsByMap.set(mapId, bucket);
  }

  return bucket;
}

function movePlayerSocketToMap(socket, mapId) {
  if (!socket || !mapId) return;

  const previousMapId = socket.replicationMapId || null;
  if (previousMapId === mapId) {
    socketMapBucket(mapId, true).add(socket);
    return;
  }

  if (previousMapId) {
    const previousBucket = socketMapBucket(previousMapId);
    previousBucket?.delete(socket);
    if (previousBucket?.size === 0) {
      socketsByMap.delete(previousMapId);
    }
  }

  socket.replicationMapId = mapId;
  socketMapBucket(mapId, true).add(socket);
}

function registerPlayerSocket(socket, playerId, mapId) {
  if (!socket || !playerId) return;

  socket.playerId = playerId;
  socketsByPlayerId.set(playerId, socket);
  movePlayerSocketToMap(socket, mapId);
}

function unregisterPlayerSocket(socket) {
  if (!socket) return;

  const playerId = socket.playerId;
  if (playerId && socketsByPlayerId.get(playerId) === socket) {
    socketsByPlayerId.delete(playerId);
  }

  const mapId = socket.replicationMapId || null;
  if (mapId) {
    const bucket = socketMapBucket(mapId);
    bucket?.delete(socket);
    if (bucket?.size === 0) {
      socketsByMap.delete(mapId);
    }
  }

  socket.replicationMapId = null;
}

function sendEncoded(socket, encoded, type = null) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  recordWsOutbound(socket, encoded, type);
  socket.send(encoded);
  return true;
}

function sendJson(socket, payload) {
  const encoded = JSON.stringify(payload);
  const type = payload?.type || null;
  if (sendEncoded(socket, encoded, type)) {
    recordWsLogicalOutbound(encoded, type, 1);
  }
}

function broadcast(payload, exceptSocket = null) {
  const encoded = JSON.stringify(payload);
  const type = payload?.type || null;
  let recipients = 0;

  for (const client of wss.clients) {
    if (
      client !== exceptSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      if (sendEncoded(client, encoded, type)) {
        recipients += 1;
      }
    }
  }

  recordWsLogicalOutbound(encoded, type, recipients);
}

function broadcastToMap(mapId, payload, exceptSocket = null) {
  if (!mapId) return;

  // Direct combat/lifecycle events already carry the authoritative HP result.
  // Mark that value as replicated so the compact health scanner does not echo
  // the same HP again on the next 8 Hz enemy-network tick.
  noteEnemyHealthFromEvent(payload);

  const encoded = JSON.stringify(payload);
  const type = payload?.type || null;
  const bucket = socketMapBucket(mapId);
  let recipients = 0;

  if (bucket) {
    for (const client of bucket) {
      if (
        client === exceptSocket ||
        client.readyState !== WebSocket.OPEN
      ) {
        continue;
      }

      if (sendEncoded(client, encoded, type)) {
        recipients += 1;
      }
    }
  }

  recordWsLogicalOutbound(encoded, type, recipients);
}

function sendToPlayer(playerId, payload) {
  if (!playerId) return;

  const client = socketsByPlayerId.get(playerId);
  if (client?.readyState === WebSocket.OPEN) {
    sendJson(client, payload);
  }
}

function playersSnapshotForMap(mapId, excludePlayerId = null) {
  return [...players.values()]
    .filter(playerState =>
      playerState.mapId === mapId &&
      playerState.id !== excludePlayerId
    )
    .map(publicPlayerState);
}

function broadcastPublicPlayerDelta(
  previousState,
  cleanState,
  exceptSocket = null
) {
  if (!cleanState) return;

  const delta = publicPlayerDelta(previousState, cleanState);
  if (Object.keys(delta).length <= 2) return;

  const movementPacket = compactPlayerMovementPacket(delta);
  if (movementPacket) {
    broadcastToMap(cleanState.mapId, movementPacket, exceptSocket);
  }

  const stateDelta = playerStateDeltaWithoutMovement(delta);
  if (Object.keys(stateDelta).length > 2) {
    broadcastToMap(
      cleanState.mapId,
      { type: "playerStateDelta", player: stateDelta },
      exceptSocket
    );
  }
}

function sendMapSceneSync(
  socket,
  mapId,
  excludePlayerId = null,
  options = {}
) {
  const syncCompleteLast = Boolean(options.syncCompleteLast);

  sendJson(socket, {
    type: "snapshot",
    mapId,
    players: playersSnapshotForMap(mapId, excludePlayerId)
  });

  sendSharedEnemySnapshotsToSocket(
    socket,
    mapId,
    false
  );

  // Map entry reveal should happen only after the browser has both the
  // authoritative enemy positions and the current passive wander plans. That
  // prevents the first post-entry plan packet from causing a visible little zip.
  sendPassiveIntentSnapshotToSocket(socket, mapId);

  if (!syncCompleteLast) {
    sendJson(socket, {
      type: "enemySnapshotSyncComplete",
      mapId
    });
  }

  sendJson(socket, {
    type: "hunterSnareSnapshot",
    mapId,
    snares: hunterSnareSnapshot(mapId),
    setups: hunterSnareSetupSnapshot(mapId)
  });

  sendJson(socket, {
    type: "coinSnapshot",
    mapId,
    coins: sharedCoinSnapshot(mapId)
  });

  sendJson(socket, {
    type: "environmentSnapshot",
    mapId,
    sparse: true,
    entities: sharedEnvironmentChangesSnapshot(mapId)
  });

  sendJson(socket, {
    type: "resourceSnapshot",
    mapId,
    resources: sharedResourceSnapshot(mapId)
  });

  sendJson(socket, {
    type: "transientAbilitySnapshot",
    mapId,
    ...transientAbilitySnapshotForMap(mapId, excludePlayerId)
  });

  if (syncCompleteLast) {
    sendJson(socket, {
      type: "enemySnapshotSyncComplete",
      mapId
    });
  }
}

function leavePlayerMap(
  playerId,
  mapId,
  exceptSocket = null
) {
  if (!playerId || !mapId) return;

  clearPlayerOwnedTransientWorldState(playerId, mapId);
  broadcastOwnerTransientCleanup(
    playerId,
    mapId,
    exceptSocket
  );
  broadcastToMap(
    mapId,
    { type: "playerLeft", id: playerId },
    exceptSocket
  );
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

function staticContentEncoding(req, filePath, stat) {
  if (!stat || stat.size < 1024) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (![".html", ".js", ".css", ".json", ".svg"].includes(ext)) return null;
  const accepted = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/.test(accepted)) return "br";
  if (/\bgzip\b/.test(accepted)) return "gzip";
  return null;
}

function loopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" ||
    (typeof address === "string" && address.startsWith("::ffff:127."));
}

function localEditorWriteAllowed(req, requestUrl) {
  const hostname = String(requestUrl.hostname || "").toLowerCase();
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return localHost && loopbackAddress(req.socket?.remoteAddress) && req.headers["x-slime-story-editor"] === "1";
}

function readJsonRequest(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > limit) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

async function handleLocalMapDraftAdoption(req, res, requestUrl) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!localEditorWriteAllowed(req, requestUrl)) {
    res.writeHead(403);
    res.end(JSON.stringify({
      ok: false,
      error: "Applying drafts is restricted to the local Slime Story development server."
    }));
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== requestUrl.host) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: "Editor request origin was rejected." }));
        return;
      }
    } catch {
      res.writeHead(403);
      res.end(JSON.stringify({ ok: false, error: "Editor request origin was invalid." }));
      return;
    }
  }

  try {
    const payload = await readJsonRequest(req);
    const { adoptDraftPayload } = require("./tools/map-draft-adoption.js");
    const result = adoptDraftPayload(payload, { worldContent: WORLD_CONTENT });
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(error.validationErrors ? 400 : 500);
    res.end(JSON.stringify({
      ok: false,
      error: error.message,
      errors: error.validationErrors || undefined,
      warnings: error.validationWarnings || undefined
    }));
  }
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

  if (requestUrl.pathname === "/dev/map-editor/adopt" && req.method === "POST") {
    handleLocalMapDraftAdoption(req, res, requestUrl);
    return;
  }

  // v288: browsers no longer reconstruct canonical map content from a base
  // source file plus a second adopted-map source. Serve the exact resolved
  // WORLD_CONTENT object already used by this Node process instead. After an
  // editor Apply, restarting Node refreshes this snapshot from the canonical
  // adopted-map JSON and client/server cannot disagree about which map won.
  if (requestUrl.pathname === "/shared/world-content-runtime.js" && (req.method === "GET" || req.method === "HEAD")) {
    try {
      const source = browserRuntimeWorldContentSource(WORLD_CONTENT);
      const headers = {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Slime-Story-Build-Version": BUILD_VERSION,
        "X-Slime-Story-World-Content-Version": String(WORLD_CONTENT.version)
      };
      res.writeHead(200, headers);
      if (req.method === "HEAD") {
        res.end();
      } else {
        recordHttpOutbound(requestUrl.pathname, Buffer.byteLength(source));
        res.end(source);
      }
    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(`Could not load runtime world content: ${error.message}`);
    }
    return;
  }

  // The browser and Node now read the same canonical adopted-map JSON store.
  // v286 wrote a generated JS mirror and then served that static file; this
  // dynamic route removes that second source of truth and prevents a stale
  // browser mirror from hiding a successfully applied editor change.
  if (requestUrl.pathname === "/shared/adopted-map-overrides.js" && (req.method === "GET" || req.method === "HEAD")) {
    try {
      const { loadStore, browserModuleSource } = require("./tools/map-draft-adoption.js");
      const store = loadStore(undefined, Number(WORLD_CONTENT.version) || 14);
      const source = browserModuleSource(store);
      const headers = {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Slime-Story-World-Content-Version": String(store.version || WORLD_CONTENT.version)
      };
      res.writeHead(200, headers);
      if (req.method === "HEAD") {
        res.end();
      } else {
        recordHttpOutbound(requestUrl.pathname, Buffer.byteLength(source));
        res.end(source);
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(`Could not load adopted map content: ${error.message}`);
    }
    return;
  }

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8"
    });

    const healthBody = JSON.stringify({
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
    });
    recordHttpOutbound("/health", Buffer.byteLength(healthBody));
    res.end(healthBody);
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

    // v289: HTML is rendered with a world-versioned runtime-content URL.
    // A newly restarted server therefore serves (for example) ?world=21 instead
    // of ?world=20, forcing the browser to request the new canonical map even
    // when the tab or its script cache survived the restart.
    if (path.extname(filePath).toLowerCase() === ".html") {
      fs.readFile(filePath, "utf8", (readError, htmlSource) => {
        if (readError) {
          res.writeHead(500, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
          });
          res.end("Could not load page.");
          return;
        }

        const source = injectRuntimeWorldContentUrl(
          htmlSource,
          BUILD_VERSION,
          WORLD_CONTENT.version
        );
        const headers = {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "X-Slime-Story-Build-Version": BUILD_VERSION,
          "X-Slime-Story-World-Content-Version": String(WORLD_CONTENT.version)
        };

        res.writeHead(200, headers);
        if (req.method === "HEAD") {
          res.end();
          return;
        }

        recordHttpOutbound(requestUrl.pathname, Buffer.byteLength(source));
        res.end(source);
      });
      return;
    }

    const etag =
      `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

    const responseHeaders = {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-cache",
      "ETag": etag,
      "Last-Modified": stat.mtime.toUTCString(),
      "Vary": "Accept-Encoding"
    };

    const contentEncoding = staticContentEncoding(req, filePath, stat);
    if (contentEncoding) responseHeaders["Content-Encoding"] = contentEncoding;

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, responseHeaders);
      res.end();
      return;
    }

    res.writeHead(200, responseHeaders);
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const source = fs.createReadStream(filePath);
    if (contentEncoding === "br") {
      const compressor = zlib.createBrotliCompress({
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
      });
      let sentBytes = 0;
      compressor.on("data", chunk => { sentBytes += chunk.length; });
      compressor.on("end", () =>
        recordHttpOutbound(requestUrl.pathname, sentBytes)
      );
      source.pipe(compressor).pipe(res);
      return;
    }
    if (contentEncoding === "gzip") {
      const compressor = zlib.createGzip({ level: 6 });
      let sentBytes = 0;
      compressor.on("data", chunk => { sentBytes += chunk.length; });
      compressor.on("end", () =>
        recordHttpOutbound(requestUrl.pathname, sentBytes)
      );
      source.pipe(compressor).pipe(res);
      return;
    }
    let sentBytes = 0;
    source.on("data", chunk => { sentBytes += chunk.length; });
    source.on("end", () =>
      recordHttpOutbound(requestUrl.pathname, sentBytes)
    );
    source.pipe(res);
  });
});

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    threshold: 1024,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    concurrencyLimit: 4,
    zlibDeflateOptions: { level: 4 }
  }
});

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

function applyFullPlayerStateUpdate(
  playerId,
  socket,
  source
) {
  const previousState = players.get(playerId);

  const cleanState = sanitizePlayerState(
    playerId,
    source,
    previousState
  );

  const mapChanged = Boolean(
    previousState &&
    previousState.mapId !== cleanState.mapId
  );

  if (mapChanged && previousState?.mapId) {
    resetServerCamouflageState(previousState, "map", true);
    resetServerPlayerPresentationState(cleanState);
    cleanState.camouflaged = false;
    leavePlayerMap(
      playerId,
      previousState.mapId,
      socket
    );
  }

  players.set(playerId, cleanState);
  noteServerCamouflagePlayerUpdate(previousState, cleanState);

  if (mapChanged) {
    movePlayerSocketToMap(socket, cleanState.mapId);

    // Send the whole destination-map scene while the client's existing
    // transition is still covered. The sync-complete marker comes last so
    // stale off-map coins/resources/environment cannot pop after reveal.
    sendMapSceneSync(
      socket,
      cleanState.mapId,
      playerId,
      { syncCompleteLast: true }
    );

    broadcastToMap(
      cleanState.mapId,
      {
        type: "playerState",
        player: publicPlayerState(cleanState)
      },
      socket
    );
    return;
  }

  broadcastPublicPlayerDelta(
    previousState,
    cleanState,
    socket
  );
}

function handlePersistentStateRestore(playerId, socket, message) {
  const playerState = players.get(playerId);
  if (!playerState || persistentStateRestoredPlayers.has(playerId)) return;

  persistentStateRestoredPlayers.add(playerId);

  const state = message?.state && typeof message.state === "object"
    ? message.state
    : {};
  const resources = state.resources && typeof state.resources === "object"
    ? state.resources
    : {};

  // Browser persistence is only a prototype convenience layer. Clamp every
  // value before promoting it back into otherwise server-owned session state.
  playerState.coins = clampInteger(resources.coins, 0, 999999, 0);
  playerState.wood = clampInteger(resources.wood, 0, 999999, 0);
  playerState.stone = clampInteger(resources.stone, 0, 999999, 0);
  playerState.whiteFlowers = clampInteger(resources.whiteFlowers ?? resources.flowers, 0, 999999, 0);
  playerState.blueFlowers = clampInteger(resources.blueFlowers, 0, 999999, 0);
  playerState.healingPotions = clampInteger(resources.healingPotions, 0, 999999, 0);
  playerState.attackPotions = clampInteger(resources.attackPotions, 0, 999999, 0);
  playerState.magicPotions = clampInteger(resources.magicPotions, 0, 999999, 0);
  const now = Date.now();
  const buffs = state.buffs && typeof state.buffs === "object" ? state.buffs : {};
  playerState.attackPotionUntil = now + Math.min(POTION_BUFF_MS, clampInteger(buffs.attackRemainingMs, 0, POTION_BUFF_MS, 0));
  playerState.magicPotionUntil = now + Math.min(POTION_BUFF_MS, clampInteger(buffs.magicRemainingMs, 0, POTION_BUFF_MS, 0));
  playerState.consumableCooldownUntil = now + Math.min(HEALING_POTION_COOLDOWN_MS, clampInteger(
    buffs.healingPotionCooldownRemainingMs ?? buffs.consumableCooldownRemainingMs,
    0,
    HEALING_POTION_COOLDOWN_MS,
    0
  ));
  playerState.attackPotionCooldownUntil = now + Math.min(BUFF_POTION_COOLDOWN_MS, clampInteger(buffs.attackPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  playerState.magicPotionCooldownUntil = now + Math.min(BUFF_POTION_COOLDOWN_MS, clampInteger(buffs.magicPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  playerState.goldSlimeBubbles = clampInteger(resources.goldSlimeBubbles, 0, 999999, 0);
  playerState.arrows = clampInteger(resources.arrows, 0, 999999, 0);

  const story = state.story && typeof state.story === "object"
    ? state.story
    : {};
  playerState.woodSwordCrafted = Boolean(story.woodSwordCrafted);
  playerState.woodBowCrafted = Boolean(story.woodBowCrafted);
  playerState.shepherdStaffCrafted = Boolean(story.shepherdStaffCrafted);
  playerState.woodHelmCrafted = Boolean(story.woodHelmCrafted);
  playerState.woodChestCrafted = Boolean(story.woodChestCrafted);
  playerState.woodGreavesCrafted = Boolean(story.woodGreavesCrafted);
  playerState.woodRingCrafted = Boolean(story.woodRingCrafted);
  playerState.marniePickaxeReceived = Boolean(story.marniePickaxeReceived);

  const beachQuest = state.beachQuest && typeof state.beachQuest === "object"
    ? state.beachQuest
    : {};
  playerState.beachQuestStage = ["none", "firstActive", "firstComplete", "secondActive", "complete"].includes(beachQuest.stage)
    ? beachQuest.stage
    : "none";
  playerState.beachQuestFirstCrabKills = clampInteger(beachQuest.firstCrabKills, 0, BEACH_QUEST_FIRST_CRAB_GOAL, 0);
  playerState.beachQuestSecondCrabKills = clampInteger(beachQuest.secondCrabKills, 0, BEACH_QUEST_SECOND_CRAB_GOAL, 0);
  playerState.beachQuestIcedCoffee = clampInteger(beachQuest.icedCoffee, 0, 1, 0);

  const myrtleQuest = state.myrtleQuest && typeof state.myrtleQuest === "object"
    ? state.myrtleQuest
    : {};
  playerState.myrtleQuestStage = ["none", "active", "complete"].includes(myrtleQuest.stage)
    ? myrtleQuest.stage
    : "none";

  const purchases = Array.isArray(state.shopPurchases)
    ? state.shopPurchases
    : [];
  playerState.shopPurchases = Array.from(new Set(
    purchases
      .filter(itemId => typeof itemId === "string" && SHOP_PURCHASE_HISTORY_ITEM_IDS.has(itemId) && itemId !== "weapon_axe")
      .slice(0, SHOP_PURCHASE_HISTORY_ITEM_IDS.size)
  ));

  sendJson(socket, {
    type: "persistentStateRestored",
    coins: playerState.coins,
    wood: playerState.wood,
    stone: playerState.stone,
    whiteFlowers: playerState.whiteFlowers,
    blueFlowers: playerState.blueFlowers,
    healingPotions: playerState.healingPotions,
    attackPotions: playerState.attackPotions,
    magicPotions: playerState.magicPotions,
    consumableCooldownUntil: playerState.consumableCooldownUntil,
    attackPotionCooldownUntil: playerState.attackPotionCooldownUntil,
    magicPotionCooldownUntil: playerState.magicPotionCooldownUntil,
    attackPotionUntil: playerState.attackPotionUntil,
    magicPotionUntil: playerState.magicPotionUntil,
    goldSlimeBubbles: playerState.goldSlimeBubbles,
    arrows: playerState.arrows,
    beachQuestStage: playerState.beachQuestStage,
    beachQuestFirstCrabKills: playerState.beachQuestFirstCrabKills,
    beachQuestSecondCrabKills: playerState.beachQuestSecondCrabKills,
    beachQuestIcedCoffee: playerState.beachQuestIcedCoffee,
    myrtleQuestStage: playerState.myrtleQuestStage,
    marniePickaxeReceived: Boolean(playerState.marniePickaxeReceived)
  });
}

function handleClientMessage(playerId, socket, message) {
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "playerMotion": {
      if (!Array.isArray(message.p)) return;
      const previousState = players.get(playerId);
      if (!previousState) return;

      applyIncrementalPlayerUpdate(playerId, socket, {
        x: message.p[0],
        y: message.p[1],
        walkTime: message.p[2],
        firstRaisedLeg: message.p[3] === 1 ? "right" : "left"
      });
      return;
    }

    case "playerStatePatch":
      if (message.player && typeof message.player === "object") {
        applyIncrementalPlayerUpdate(playerId, socket, message.player);
      }
      return;

    case "playerAction":
      handlePlayerAction(playerId, message);
      return;

    case "playerAim":
      handlePlayerAim(playerId, message);
      return;

    case "playerState":
      if (message.player && typeof message.player === "object") {
        applyFullPlayerStateUpdate(playerId, socket, message.player);
      }
      return;

    case "enemyAction":
      handleSharedEnemyAction(playerId, message);
      return;

    case "camouflageBreak":
      handleCamouflageBreak(playerId);
      return;

    case "hunterSnareBegin":
      handleHunterSnareBegin(playerId);
      return;

    case "hunterSnareCancel":
      handleHunterSnareCancel(playerId);
      return;

    // v263 and older clients used a client-timed placement packet. Ignore it
    // rather than letting an old browser bypass the authoritative setup.
    case "hunterSnarePlace":
      return;

    case "playerDamageRequest":
      handlePlayerDamageRequest(playerId, message);
      return;

    case "playerIgniteRequest":
      handlePlayerIgniteRequest(playerId, message);
      return;

    case "pvpToggle":
      handlePvpToggle(playerId, socket, message);
      return;

    case "pvpAttack":
      handlePvpAttack(playerId, message);
      return;

    case "playerHealRequest":
      handlePlayerHealRequest(playerId, message);
      return;

    case "playerRespawn":
      handlePlayerRespawn(playerId, message);
      return;

    case "visualEffect":
      handleVisualEffect(playerId, socket, message);
      return;

    case "environmentCatalog":
      handleEnvironmentCatalog(playerId, message, socket);
      return;

    case "environmentAction":
      handleEnvironmentAction(playerId, message);
      return;

    case "resourcePickup":
      if (typeof message.resourceId === "string") {
        handleResourcePickup(playerId, message.resourceId);
      }
      return;

    case "beachQuestInteract":
      handleBeachQuestInteract(playerId, socket, message);
      return;

    case "myrtleQuestInteract":
      handleMyrtleQuestInteract(playerId, socket, message);
      return;

    case "persistentStateRestore":
      handlePersistentStateRestore(playerId, socket, message);
      return;

    case "arrowUse":
      handleArrowUse(playerId, socket);
      return;

    case "craftRequest":
      handleCraftRequest(playerId, socket, message);
      return;

    case "consumableUse":
      handleConsumableUse(playerId, socket, message);
      return;

    case "marnieQuestInteract":
      handleMarnieQuestInteract(playerId, socket, message);
      return;

    case "shopPurchase":
      handleShopPurchase(playerId, socket, message);
      return;

    case "debugGrantCoins":
      handleDebugGrantCoins(playerId, socket);
      return;

    case "debugGrantArrows":
      handleDebugGrantArrows(playerId, socket);
      return;

    case "coinPickup":
      if (typeof message.coinId === "string") {
        handleCoinPickup(playerId, message.coinId);
      }
      return;

    default:
      return;
  }
}

wss.on("connection", socket => {
  const id = crypto.randomUUID();
  const initialLoad = defaultPlayerLoadState();

  const initialState = sanitizePlayerState(id, {
    mapId: initialLoad.mapId,
    x: initialLoad.x,
    y: initialLoad.y,
    weaponIndex: -1
  });

  players.set(id, initialState);
  registerPlayerSocket(socket, id, initialState.mapId);

  sendJson(socket, {
    type: "welcome",
    id,
    buildVersion: BUILD_VERSION,
    coins: initialState.coins,
    wood: initialState.wood,
    stone: initialState.stone,
    whiteFlowers: initialState.whiteFlowers,
    blueFlowers: initialState.blueFlowers,
    healingPotions: initialState.healingPotions,
    attackPotions: initialState.attackPotions,
    magicPotions: initialState.magicPotions,
    consumableCooldownUntil: initialState.consumableCooldownUntil,
    attackPotionCooldownUntil: initialState.attackPotionCooldownUntil,
    magicPotionCooldownUntil: initialState.magicPotionCooldownUntil,
    attackPotionUntil: initialState.attackPotionUntil,
    magicPotionUntil: initialState.magicPotionUntil,
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

  sendMapSceneSync(
    socket,
    initialState.mapId,
    id,
    { syncCompleteLast: false }
  );

  broadcastToMap(
    initialState.mapId,
    {
      type: "playerState",
      player: publicPlayerState(initialState)
    },
    socket
  );

  broadcastPresence();

  socket.on("message", raw => {
    if (raw.length > 131072) return;

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      recordWsInbound(raw, "invalidJson");
      return;
    }

    recordWsInbound(
      raw,
      message?.type || "unknown",
      message?.type === "enemyAction"
        ? (message?.payload?.source || message?.action || "unknown")
        : null
    );

    handleClientMessage(id, socket, message);
  });

  socket.on("close", () => {
    focusFireDamageChains.delete(id);
    persistentStateRestoredPlayers.delete(id);

    const previousState =
      players.get(id);

    if (previousState?.mapId) {
      leavePlayerMap(
        id,
        previousState.mapId,
        socket
      );
    }

    players.delete(id);
    serverCamouflageStates.delete(id);

    for (const key of [...pvpAttackRateLimits.keys()]) {
      if (key.startsWith(`${id}:`) || key.includes(`:${id}:`)) {
        pvpAttackRateLimits.delete(key);
      }
    }

    unregisterPlayerSocket(socket);
    broadcastPresence();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Slime Story Online ${BUILD_VERSION} listening on port ${PORT}`);
  console.log(
    `[NET] bandwidth diagnostics enabled every ${NETWORK_DIAGNOSTICS_INTERVAL_MS / 1000}s ` +
    `(OUT is an estimated host-egress figure; HTTP is measured after compression).`
  );
});
