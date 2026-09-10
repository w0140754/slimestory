const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const BUILD_VERSION = "6-11-468";
const ENEMY_KNOCKBACK_DAMAGE_THRESHOLD = 0.25;

// v389 shared world clock. One full in-game day lasts 12 real minutes, which
// keeps night encounters quick to reach during development. Clients receive a
// single clock anchor on connect and advance it locally, so this adds no idle
// heartbeat traffic. Server restarts begin at 08:00 for predictable testing.
const WORLD_CLOCK_REAL_MS_PER_GAME_MINUTE = 500;
const WORLD_CLOCK_START_GAME_MINUTES = 8 * 60;
const WORLD_CLOCK_SERVER_STARTED_AT = Date.now();
const WORLD_CLOCK_MINUTES_PER_DAY = 24 * 60;
const WORLD_CLOCK_NIGHT_START_MINUTE = 20 * 60;
const WORLD_CLOCK_SUNRISE_MINUTE = 5 * 60;

// v414: every live server boot creates a fresh procedural world unless a seed
// is explicitly supplied (useful for regression/reproduction). The resolved
// WORLD_CONTENT object is still served verbatim to browsers, so random world
// generation adds no gameplay heartbeat or per-feature replication traffic.
const WORLD_GENERATION_SEED = (() => {
  const configured = Number(process.env.SLIME_STORY_WORLD_SEED);
  if (Number.isFinite(configured)) return Math.trunc(configured) >>> 0;
  return crypto.randomBytes(4).readUInt32LE(0) >>> 0;
})();
process.env.SLIME_STORY_WORLD_SEED = String(WORLD_GENERATION_SEED);

function serverWorldClockAbsoluteGameMinutes(now = Date.now()) {
  const elapsedRealMs = Math.max(0, now - WORLD_CLOCK_SERVER_STARTED_AT);
  return WORLD_CLOCK_START_GAME_MINUTES +
    elapsedRealMs / WORLD_CLOCK_REAL_MS_PER_GAME_MINUTE;
}

function normalizedServerWorldClockMinutes(now = Date.now()) {
  const absoluteMinutes = serverWorldClockAbsoluteGameMinutes(now);
  return ((absoluteMinutes % WORLD_CLOCK_MINUTES_PER_DAY) + WORLD_CLOCK_MINUTES_PER_DAY) % WORLD_CLOCK_MINUTES_PER_DAY;
}

function serverWorldIsNight(now = Date.now()) {
  const gameMinutes = normalizedServerWorldClockMinutes(now);
  return gameMinutes >= WORLD_CLOCK_NIGHT_START_MINUTE || gameMinutes < WORLD_CLOCK_SUNRISE_MINUTE;
}

function serverWorldClockSnapshot(now = Date.now()) {
  return {
    serverNowMs: now,
    gameMinutes: normalizedServerWorldClockMinutes(now),
    absoluteGameMinutes: serverWorldClockAbsoluteGameMinutes(now),
    realMsPerGameMinute: WORLD_CLOCK_REAL_MS_PER_GAME_MINUTE
  };
}

function serverMapRainIntensity(mapId, now = Date.now()) {
  if (WORLD_CONTENT?.maps?.[mapId]?.subterranean) return 0;
  return WEATHER_RULES.rainIntensity(
    WORLD_GENERATION_SEED,
    mapId,
    serverWorldClockAbsoluteGameMinutes(now)
  );
}

function serverMapIsRaining(mapId, now = Date.now()) {
  return serverMapRainIntensity(mapId, now) > 0.04;
}

const WORLD_CONTENT = require("./public/shared/world-content.js");
const TERRAIN_RULES = require("./public/shared/terrain-rules.js");
const COMBAT_BALANCE = require("./public/shared/combat-balance.js");
const WEATHER_RULES = require("./public/shared/weather-rules.js");
const ENEMY_NET_PROTOCOL = require("./public/shared/enemy-net-protocol.js");
const PLAYER_NET_PROTOCOL = require("./public/shared/player-net-protocol.js");
const STRUCTURE_GEOMETRY = require("./public/shared/structure-geometry.js");
const STRUCTURE_TOPOLOGY = require("./public/shared/structure-topology.js");
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
    enemyIgnitions: 0,
    playerIgnitions: 0,
    enemyDamageTicks: 0,
    playerDamageTicks: 0
  };
}

let fireDiagnostics = makeFireDiagnostics();

function makeRainDiagnostics() {
  return {
    enemyWetEnters: 0,
    enemyWetExits: 0,
    playerWetEnters: 0,
    playerWetExits: 0
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
    `ignite env=${fireDiagnostics.environmentIgnitions} ` +
    `mob=${fireDiagnostics.enemyIgnitions} player=${fireDiagnostics.playerIgnitions} | ` +
    `DoT mob=${fireDiagnostics.enemyDamageTicks} ticks player=${fireDiagnostics.playerDamageTicks} ticks`
  );

  console.log(
    `[RAIN ${Math.round(elapsedMs / 1000)}s] ` +
    `wet mob=${rainDiagnostics.enemyWetEnters}/${rainDiagnostics.enemyWetExits} ` +
    `player=${rainDiagnostics.playerWetEnters}/${rainDiagnostics.playerWetExits}`
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

  const mapId = WORLD_CONTENT.worldGrid?.startMapId;
  if (ALLOWED_MAPS.has(mapId) && worldContentPlayerSpawn(mapId, "center")) {
    return { mapId, spawnId: "center" };
  }

  throw new Error("WORLD_CONTENT has no valid coordinate-world start spawn.");
}

function defaultPlayerLoadState() {
  const target = defaultPlayerLoadTarget();
  const dimensions = mapWorldDimensions(target.mapId);
  const spawn = worldContentPlayerSpawn(target.mapId, target.spawnId);
  const rawX = spawn && Number.isFinite(Number(spawn.x)) ? Number(spawn.x) : dimensions.width / 2;
  const rawY = spawn && Number.isFinite(Number(spawn.y)) ? Number(spawn.y) : dimensions.height / 2;
  const safe = resolveSafePlayerSpawn(target.mapId, rawX, rawY);
  return { mapId: target.mapId, x: safe.x, y: safe.y };
}

function worldGridMetaForMap(mapId) {
  const grid = WORLD_CONTENT.maps?.[mapId]?.grid;
  if (!grid || !Number.isFinite(Number(grid.x)) || !Number.isFinite(Number(grid.y))) return null;
  return {
    x: Number(grid.x),
    y: Number(grid.y),
    distance: Math.max(0, Number(grid.distance) || 0)
  };
}

function playerMapTransitionAllowed(previousMapId, requestedMapId) {
  if (!previousMapId || previousMapId === requestedMapId) return true;

  const previousDefinition = WORLD_CONTENT.maps?.[previousMapId] || null;
  const requestedDefinition = WORLD_CONTENT.maps?.[requestedMapId] || null;
  const verticalLink = Boolean(
    previousDefinition &&
    requestedDefinition &&
    (
      previousDefinition.undergroundMapId === requestedMapId ||
      previousDefinition.surfaceMapId === requestedMapId ||
      requestedDefinition.undergroundMapId === previousMapId ||
      requestedDefinition.surfaceMapId === previousMapId
    )
  );
  if (verticalLink) return true;

  const previousGrid = worldGridMetaForMap(previousMapId);
  const requestedGrid = worldGridMetaForMap(requestedMapId);
  return Boolean(
    previousGrid &&
    requestedGrid &&
    Math.abs(requestedGrid.x - previousGrid.x) +
      Math.abs(requestedGrid.y - previousGrid.y) === 1
  );
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
// v418: darkness reduces practical enemy awareness instead of waking the
// entire map. Ordinary mobs only notice nearby players at night; night-only
// slimes remain more alert, but they no longer acquire every player globally.
// Wider disengage radii keep the existing sticky target behavior without
// producing rapid active/passive network churn.
const NIGHT_HOSTILE_DETECTION_RADIUS = 64;
const NIGHT_HOSTILE_DISENGAGE_RADIUS = 96;
const NIGHT_ONLY_DETECTION_RADIUS = 104;
const NIGHT_ONLY_DISENGAGE_RADIUS = 144;

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
    damageKnockback: Object.freeze({
      melee: 32,
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
    damageKnockback: Object.freeze({
      melee: 32,
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
    damageKnockback: Object.freeze({
      melee: 30,
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
    damageKnockback: Object.freeze({
      melee: 28,
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
    damageKnockback: Object.freeze({
      melee: 22,
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
    patrolRadius: 85,
    damageKnockback: Object.freeze({
      melee: 12,
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
// effects all agree on duration, extinguishing, source attribution, and movement.
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

function serverEnemyMovementMultiplier(enemy) {
  ensureServerEnemyStatusState(enemy);

  let multiplier = 1;
  if (enemy.wetTime > 0) {
    const wetMultiplier = Number(serverEnemyProfile(enemy)?.wetSpeedMultiplier);
    if (Number.isFinite(wetMultiplier) && wetMultiplier > 1) {
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

function runtimeEnemySpawnPoint(mapId) {
  const definition = WORLD_CONTENT.maps?.[mapId] || {};
  const dimensions = mapWorldDimensions(mapId);
  const minEdge = 42;
  const protectedPoints = [
    ...(definition.playerSpawns || []).map(spawn => ({
      x: Number(spawn.x) || 0,
      y: Number(spawn.y) || 0,
      radius: 54
    })),
    ...(definition.npcs || []).map(npc => ({
      x: Number(npc.x) || 0,
      y: Number(npc.y) || 0,
      radius: 34
    }))
  ];
  const environment = definition.environment || {};
  const blockers = [
    ...(environment.trees || []).map(entity => ({ x: entity.x, y: entity.y, radius: 20 })),
    ...(environment.rocks || []).map(entity => ({ x: entity.x, y: entity.y, radius: 17 })),
    ...(environment.sceneryRocks || []).map(entity => ({ x: entity.x, y: entity.y, radius: 17 })),
    ...(environment.houses || []).map(entity => ({ x: entity.x, y: entity.y, radius: 34 })),
    ...(definition.features || [])
      .filter(feature => ["house", "ruin"].includes(feature?.type))
      .map(feature => ({ x: feature.x, y: feature.y, radius: Math.max(34, Number(feature.radius) || 48) }))
  ];

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const x = minEdge + Math.random() * Math.max(1, dimensions.width - minEdge * 2);
    const y = minEdge + Math.random() * Math.max(1, dimensions.height - minEdge * 2);
    if (protectedPoints.some(point => Math.hypot(x - point.x, y - point.y) < point.radius)) continue;
    if (blockers.some(point => Math.hypot(x - Number(point.x || 0), y - Number(point.y || 0)) < point.radius)) continue;
    if (
      TERRAIN_RULES.terrainDefinition(definition) &&
      !TERRAIN_RULES.circleCanOccupy(definition, x, y, 5, { allowWater: false })
    ) continue;
    return { x: Math.round(x), y: Math.round(y) };
  }

  return {
    x: Math.max(minEdge, Math.min(dimensions.width - minEdge, dimensions.width * 0.25)),
    y: Math.max(minEdge, Math.min(dimensions.height - minEdge, dimensions.height * 0.25))
  };
}

function generateRuntimeEnemyDefinitions() {
  const definitions = [];

  for (const [mapId, mapDefinition] of Object.entries(WORLD_CONTENT.maps || {})) {
    const generation = mapDefinition?.enemyGeneration;
    if (!generation || !mapDefinition?.grid) continue;

    const level = Math.max(1, Math.floor(Number(generation.level) || 1));
    const slimeCount = Math.max(0, Math.floor(Number(generation.slimeCount) || 0));
    const mushroomCount = Math.max(0, Math.floor(Number(generation.mushroomCount) || 0));
    const purpleChance = Math.max(0, Math.min(1, Number(generation.purpleSlimeChance) || 0));

    for (let index = 0; index < slimeCount; index += 1) {
      const point = runtimeEnemySpawnPoint(mapId);
      definitions.push({
        id: `runtime:${mapId}:slime:${index + 1}`,
        type: "slime",
        mapId,
        level,
        x: point.x,
        y: point.y,
        phase: Math.random() * Math.PI * 2,
        wanderRadiusX: 18 + Math.floor(Math.random() * 14),
        wanderRadiusY: 12 + Math.floor(Math.random() * 10),
        ...(Math.random() < purpleChance ? { variant: "purple" } : {}),
        runtimeGenerated: true
      });
    }

    for (let index = 0; index < mushroomCount; index += 1) {
      const point = runtimeEnemySpawnPoint(mapId);
      definitions.push({
        id: `runtime:${mapId}:mushroom:${index + 1}`,
        type: "mushroom",
        mapId,
        level,
        x: point.x,
        y: point.y,
        phase: Math.random() * Math.PI * 2,
        runtimeGenerated: true
      });
    }
  }

  return definitions;
}

const GENERATED_NORMAL_ENEMY_SPAWNS = generateRuntimeEnemyDefinitions();

function allEnemySpawnDefinitions() {
  return GENERATED_NORMAL_ENEMY_SPAWNS;
}

const NIGHT_SLIME_MAP_ID =
  WORLD_CONTENT.worldGrid?.startMapId ||
  WORLD_CONTENT.defaultPlayerLoad?.mapId ||
  "world_p0_p0";
const NIGHT_SLIME_CAP = 8;
const NIGHT_SLIME_INITIAL_COUNT = 2;
const NIGHT_SLIME_SPAWN_INTERVAL_SECONDS = 10;

function nightSlimeSpawnDefinitions() {
  const spawns = [];
  const dimensions = mapWorldDimensions(NIGHT_SLIME_MAP_ID);
  for (let index = 0; index < NIGHT_SLIME_CAP; index += 1) {
    spawns.push({
      id: `night_slime_${NIGHT_SLIME_MAP_ID}_${index + 1}`,
      type: "slime",
      mapId: NIGHT_SLIME_MAP_ID,
      x: dimensions.width / 2,
      y: dimensions.height / 2,
      phase: index * 0.7,
      level: 1,
      variant: "green",
      aggressiveOnSight: true,
      nightOnly: true,
      nightPoolIndex: index
    });
  }
  return spawns;
}

const GENERATED_NIGHT_SLIME_SPAWNS = nightSlimeSpawnDefinitions();

function enemySpawnsOfType(type) {
  const generated = allEnemySpawnDefinitions()
    .filter(spawn => spawn.type === type);
  return type === "slime"
    ? generated.concat(GENERATED_NIGHT_SLIME_SPAWNS)
    : generated;
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

// Player-owned environmental/status effects may affect the owner, but never
// another player. Player-vs-player combat was retired with the old PvP UI.
function playerOwnedEffectMayAffectTarget(sourcePlayerId, target) {
  if (!target || target.hp <= 0) return false;
  if (!sourcePlayerId) return true;
  return String(sourcePlayerId) === String(target.id);
}


// -----------------------------------------------------------------------------
// PLAYER-BUILT STRUCTURES (v379)
// -----------------------------------------------------------------------------
// Structures are server-authoritative, change-only state. They do not tick and
// produce zero traffic while nobody is building. Map entry gets one compact
// snapshot, then only placement events are broadcast.
const sharedStructures = new Map();
const sharedStructuresByMap = new Map();
let nextSharedStructureId = 1;
let structureNavRevision = 0;
const combinedStructuresCache = new Map();
const BUILD_GRID_SIZE = 16;
const BUILD_FLOOR_KINDS = Object.freeze(new Set(["woodFloor", "stoneFloor"]));
const BUILD_WALL_KINDS = Object.freeze(new Set(["woodWall", "stoneWall"]));
const BUILD_PLACE_RANGE = 96;
const DOOR_ADJACENT_DISTANCE = 10;
const DOOR_SERVER_OPEN_DISTANCE = 14;
const DOOR_SERVER_OPEN_TANGENTIAL_DISTANCE = 12;
const DOOR_PASSAGE_MS = 500;
const playerDoorPassages = new Map();

function serverRefreshDoorPassageFromNearbyPlayer(structure, now = Date.now()) {
  if (structure?.kind !== "woodDoor" || !structure?.id) return false;

  for (const [playerId, playerState] of players.entries()) {
    if (
      playerState?.mapId !== structure.mapId ||
      playerState.hp <= 0 ||
      serverDoorPerpendicularDistance(structure, playerState.x, playerState.y) > DOOR_SERVER_OPEN_DISTANCE ||
      serverDoorTangentialDistance(structure, playerState.x, playerState.y) > DOOR_SERVER_OPEN_TANGENTIAL_DISTANCE
    ) continue;

    // v399: the client already shows the door open as the player reaches the
    // doorway. Mirror that approach state authoritatively so enemies waiting
    // on the opposite side can use the opening immediately, without waiting
    // for the player's centre point to enter/cross the door collider.
    playerDoorPassages.set(playerId, { doorId: structure.id, expiresAt: now + DOOR_PASSAGE_MS });
    return true;
  }

  return false;
}

function serverDoorCurrentlyOpen(structure, now = Date.now()) {
  if (structure?.kind !== "woodDoor" || !structure?.id) return false;
  if (serverRefreshDoorPassageFromNearbyPlayer(structure, now)) return true;
  for (const [playerId, passage] of playerDoorPassages.entries()) {
    if (!passage) {
      playerDoorPassages.delete(playerId);
      continue;
    }

    if (passage.doorId !== structure.id) {
      if (passage.expiresAt < now) playerDoorPassages.delete(playerId);
      continue;
    }

    if (passage.expiresAt >= now) return true;

    // v398: once a player has opened a door, do not let its short passage
    // timer close the collider on top of a player or mob that is still in the
    // doorway. Hold it open until the doorway is physically clear.
    if (serverDoorOccupied(structure)) {
      passage.expiresAt = now + DOOR_PASSAGE_MS;
      return true;
    }

    playerDoorPassages.delete(playerId);
  }
  return false;
}

// v414 mutable procedural structures. WORLD_CONTENT remains the immutable
// seeded baseline; only map-local differences are retained here. That lets a
// generated house/stone patch behave exactly like player-built structure
// pieces without rebroadcasting or serializing the whole baseline map.
const removedWorldStructureIdsByMap = new Map();
const worldStructureStatesByMap = new Map();

function removedWorldStructureIdsForMap(mapId) {
  return removedWorldStructureIdsByMap.get(mapId) || new Set();
}

function worldStructureStatesForMap(mapId) {
  return worldStructureStatesByMap.get(mapId) || new Map();
}

function worldGeneratedStructureDefinitionById(mapId, structureId) {
  const structures = WORLD_CONTENT.maps?.[mapId]?.structures;
  if (!Array.isArray(structures)) return null;
  return structures.find(structure => structure?.id === structureId) || null;
}

function worldGeneratedStructuresOnMap(mapId) {
  const structures = WORLD_CONTENT.maps?.[mapId]?.structures;
  if (!Array.isArray(structures)) return [];
  const removed = removedWorldStructureIdsForMap(mapId);
  const states = worldStructureStatesForMap(mapId);
  return structures
    .filter(structure => structure?.id && !removed.has(structure.id))
    .map(structure => {
      const state = states.get(structure.id);
      return state ? { ...structure, ...state } : structure;
    });
}

function setWorldGeneratedStructureState(mapId, structureId, patch) {
  if (!worldGeneratedStructureDefinitionById(mapId, structureId)) return null;
  if (removedWorldStructureIdsForMap(mapId).has(structureId)) return null;
  let states = worldStructureStatesByMap.get(mapId);
  if (!states) {
    states = new Map();
    worldStructureStatesByMap.set(mapId, states);
  }
  const next = { ...(states.get(structureId) || {}), ...(patch || {}) };
  states.set(structureId, next);
  structureNavRevision += 1;
  return next;
}

function removeWorldGeneratedStructure(mapId, structureId) {
  const structure = worldGeneratedStructuresOnMap(mapId).find(item => item?.id === structureId);
  if (!structure) return null;
  let removed = removedWorldStructureIdsByMap.get(mapId);
  if (!removed) {
    removed = new Set();
    removedWorldStructureIdsByMap.set(mapId, removed);
  }
  removed.add(structureId);
  worldStructureStatesByMap.get(mapId)?.delete(structureId);
  structureNavRevision += 1;
  return structure;
}

function worldStructureMutationSnapshot(mapId) {
  const states = worldStructureStatesForMap(mapId);
  return {
    removedWorldStructureIds: [...removedWorldStructureIdsForMap(mapId)],
    worldStructureStates: [...states.entries()].map(([id, state]) => ({ id, ...state }))
  };
}

function dynamicStructuresOnMap(mapId) {
  return Array.from(sharedStructuresByMap.get(mapId)?.values() || []);
}

function structuresOnMap(mapId) {
  const cached = combinedStructuresCache.get(mapId);
  if (cached?.revision === structureNavRevision) return cached.structures;
  const worldStructures = worldGeneratedStructuresOnMap(mapId);
  const dynamicStructures = dynamicStructuresOnMap(mapId);
  const structures = dynamicStructures.length > 0
    ? worldStructures.concat(dynamicStructures)
    : worldStructures;
  combinedStructuresCache.set(mapId, { revision: structureNavRevision, structures });
  return structures;
}

function structureSnapshot(mapId) {
  // Only player-made structures cross as full records. Procedural baseline
  // geometry is already in WORLD_CONTENT; its tiny mutation list is included
  // separately by sendMapSceneSync when a player enters this map.
  return dynamicStructuresOnMap(mapId).map(structure => ({
    id: structure.id,
    mapId: structure.mapId,
    kind: structure.kind,
    x: structure.x,
    y: structure.y,
    ...((BUILD_WALL_KINDS.has(structure.kind) || ["woodDoor", "caveDoor"].includes(structure.kind)) ? { axis: structure.axis } : {}),
    ...(structure.kind === "torch" && structure.supportId ? {
      supportId: structure.supportId,
      mountType: structure.mountType,
      ...(structure.mountAxis ? { mountAxis: structure.mountAxis } : {}),
      ...(structure.mountSide ? { mountSide: structure.mountSide } : {})
    } : {}),
    ...(structure.kind === "chest" ? {
      opened: Boolean(structure.opened),
      treasure: Boolean(structure.treasure)
    } : {}),
    ...(["dugPit", "shaftOpening"].includes(structure.kind) ? {
      targetMapId: typeof structure.targetMapId === "string" ? structure.targetMapId : null,
      breakthrough: Boolean(structure.breakthrough),
      ropePlaced: Boolean(structure.ropePlaced)
    } : {})
  }));
}

function structureRect(structure) {
  if (STRUCTURE_GEOMETRY.isBoundaryStructure(structure)) {
    return STRUCTURE_GEOMETRY.collisionRect(structure, 2);
  }
  if (structure?.kind === "stoneCube") {
    return STRUCTURE_GEOMETRY.stoneCubeFootprintRect(structure);
  }
  if (structure?.kind === "chest" || structure?.kind === "craftingTable") {
    return { x: Number(structure.x) - 7, y: Number(structure.y) - 8, width: 14, height: 8 };
  }
  return { x: structure.x - 8, y: structure.y - 8, width: 16, height: 16 };
}

function circleRectHit(x, y, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function serverDoorOccupied(structure) {
  if (structure?.kind !== "woodDoor") return false;
  const rect = structureRect(structure);

  for (const playerState of players.values()) {
    if (
      playerState?.mapId === structure.mapId &&
      playerState.hp > 0 &&
      circleRectHit(playerState.x, playerState.y, 4.5, rect)
    ) {
      return true;
    }
  }

  for (const enemy of allSharedEnemies()) {
    if (
      enemy?.mapId === structure.mapId &&
      enemy.alive &&
      circleRectHit(enemy.x, enemy.y, 5, rect)
    ) {
      return true;
    }
  }

  return false;
}

function serverPointHitsStructureWall(
  mapId,
  x,
  y,
  radius = 4,
  { includeDoors = true } = {}
) {
  for (const structure of structuresOnMap(mapId)) {
    if (!BUILD_WALL_KINDS.has(structure.kind) && !["stoneCube", "dugPit"].includes(structure.kind) && !(includeDoors && structure.kind === "woodDoor")) continue;
    if (structure.kind === "dugPit" && structure.ropePlaced) continue;
    if (structure.kind === "woodDoor" && serverDoorCurrentlyOpen(structure)) continue;
    if (circleRectHit(x, y, radius, structureRect(structure))) return true;
  }
  return false;
}

function serverSegmentRectIntersectionT(x1, y1, x2, y2, rect, padding = 0) {
  const minX = Number(rect.x) - padding;
  const maxX = Number(rect.x) + Number(rect.width) + padding;
  const minY = Number(rect.y) - padding;
  const maxY = Number(rect.y) + Number(rect.height) + padding;
  const dx = Number(x2) - Number(x1);
  const dy = Number(y2) - Number(y1);
  let tMin = 0;
  let tMax = 1;

  for (const [start, delta, low, high] of [
    [Number(x1), dx, minX, maxX],
    [Number(y1), dy, minY, maxY]
  ]) {
    if (Math.abs(delta) < 0.000001) {
      if (start < low || start > high) return null;
      continue;
    }
    let a = (low - start) / delta;
    let b = (high - start) / delta;
    if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a);
    tMax = Math.min(tMax, b);
    if (tMin > tMax) return null;
  }

  return tMin >= 0 && tMin <= 1 ? tMin : null;
}

function serverWoodWallImpact(
  mapId,
  fromX,
  fromY,
  toX,
  toY,
  padding = 0,
  { allowEndpoint = false, ignoreStructureId = null, ignoreDoors = false } = {}
) {
  let best = null;
  for (const structure of structuresOnMap(mapId)) {
    const blocks = BUILD_WALL_KINDS.has(structure?.kind) ||
      structure?.kind === "stoneCube" ||
      (structure?.kind === "woodDoor" && !ignoreDoors && !serverDoorCurrentlyOpen(structure));
    if (!blocks) continue;
    if (ignoreStructureId && structure.id === ignoreStructureId) continue;
    const t = serverSegmentRectIntersectionT(
      fromX,
      fromY,
      toX,
      toY,
      structureRect(structure),
      padding
    );
    if (t === null || t <= 0.001 || (!allowEndpoint && t >= 0.999)) continue;
    if (!best || t < best.t) best = { t, structure };
  }
  if (!best) return null;
  return {
    t: best.t,
    x: Number(fromX) + (Number(toX) - Number(fromX)) * Math.max(0, best.t - 0.01),
    y: Number(fromY) + (Number(toY) - Number(fromY)) * Math.max(0, best.t - 0.01),
    structure: best.structure
  };
}

function serverLineOfEffectClear(
  mapId,
  fromX,
  fromY,
  toX,
  toY,
  padding = 0,
  options = {}
) {
  return !serverWoodWallImpact(mapId, fromX, fromY, toX, toY, padding, options);
}

function serverDoorPerpendicularDistance(structure, x, y) {
  return structure?.axis === "vertical"
    ? Math.abs(Number(x) - Number(structure.x))
    : Math.abs(Number(y) - Number(structure.y));
}

function serverDoorTangentialDistance(structure, x, y) {
  return structure?.axis === "vertical"
    ? Math.abs(Number(y) - Number(structure.y))
    : Math.abs(Number(x) - Number(structure.x));
}

function serverDoorAllowsPlayerStep(playerId, structure, fromX, fromY, toX, toY, radius = 4) {
  if (structure?.kind !== "woodDoor") return false;
  const now = Date.now();
  const tangential = Math.min(
    serverDoorTangentialDistance(structure, fromX, fromY),
    serverDoorTangentialDistance(structure, toX, toY)
  );
  if (tangential > 8 + radius + 2) return false;

  // v418: automatic doors are always traversable by players through their
  // actual doorway channel. Adjacent wall pieces still block side-stepping
  // around the opening, but the door collider itself can no longer close onto
  // or reject a diagonal player step and leave somebody wedged in the frame.
  playerDoorPassages.set(playerId, { doorId: structure.id, expiresAt: now + DOOR_PASSAGE_MS });
  return true;
}

function serverSurfaceRopeAllowsPlayerStep(structure, fromX, fromY, toX, toY, radius = 4) {
  if (!structure?.ropePlaced || structure?.kind !== "dugPit" || !structure?.breakthrough) return false;
  const rect = structureRect(structure);
  if (circleRectHit(fromX, fromY, radius, rect)) return true;

  // v463 mirrors the client one-way Rope entrance: players may enter a roped
  // excavation only from its north/top lip while moving downward and aligned
  // with the Rope. Side/south approaches remain blocked authoritatively.
  const enteringFromNorth = Number(fromY) <= Number(rect.y) - radius + 1;
  const movingDown = Number(toY) > Number(fromY) + 0.01;
  const alignedToRope = Math.abs(Number(toX) - Number(structure.x)) <= 5.5;
  return enteringFromNorth && movingDown && alignedToRope;
}

function serverPlayerStepHitsStructureWall(playerId, mapId, fromX, fromY, toX, toY, radius = 4) {
  for (const structure of structuresOnMap(mapId)) {
    if (!["woodWall", "stoneWall", "stoneCube", "dugPit", "woodDoor", "chest", "craftingTable"].includes(structure.kind)) continue;
    if (!circleRectHit(toX, toY, radius, structureRect(structure))) continue;
    if (
      structure.kind === "dugPit" &&
      serverSurfaceRopeAllowsPlayerStep(structure, fromX, fromY, toX, toY, radius)
    ) continue;
    if (
      structure.kind === "woodDoor" &&
      serverDoorAllowsPlayerStep(playerId, structure, fromX, fromY, toX, toY, radius)
    ) continue;
    return true;
  }
  return false;
}

// v426: joining/respawning on top of a solid structure can trap the player
// before they have a chance to move. Only resolve spawn/entry discontinuities;
// ordinary movement remains collision-clamped rather than teleporting players.
function playerSpawnPointBlocked(mapId, x, y, radius = 4) {
  const definition = WORLD_CONTENT.maps?.[mapId] || null;
  if (
    definition &&
    TERRAIN_RULES.circleCanOccupy(definition, x, y, radius, { allowWater: true }) === false
  ) return true;
  return structuresOnMap(mapId).some(structure =>
    ["woodWall", "stoneWall", "stoneCube", "dugPit", "chest", "craftingTable"].includes(structure?.kind) &&
    !(structure.kind === "dugPit" && structure.ropePlaced) &&
    circleRectHit(x, y, radius, structureRect(structure))
  );
}

function resolveSafePlayerSpawn(mapId, x, y) {
  const dimensions = mapWorldDimensions(mapId);
  const originX = clampNumber(x, 8, dimensions.width - 8, dimensions.width / 2);
  const originY = clampNumber(y, 15, dimensions.height - 1, dimensions.height / 2);
  if (!playerSpawnPointBlocked(mapId, originX, originY)) return { x: originX, y: originY };

  const step = BUILD_GRID_SIZE;
  for (let ring = 1; ring <= 5; ring += 1) {
    const offsets = [];
    // Cardinal neighbours first, then the rest of the square ring.
    offsets.push([0, ring], [ring, 0], [0, -ring], [-ring, 0]);
    for (let ox = -ring; ox <= ring; ox += 1) {
      for (let oy = -ring; oy <= ring; oy += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
        if ((ox === 0 && Math.abs(oy) === ring) || (oy === 0 && Math.abs(ox) === ring)) continue;
        offsets.push([ox, oy]);
      }
    }
    for (const [ox, oy] of offsets) {
      const candidateX = clampNumber(originX + ox * step, 8, dimensions.width - 8, originX);
      const candidateY = clampNumber(originY + oy * step, 15, dimensions.height - 1, originY);
      if (!playerSpawnPointBlocked(mapId, candidateX, candidateY)) return { x: candidateX, y: candidateY };
    }
  }
  return { x: originX, y: originY };
}

// A shaft needs more than one open sample at its ceiling. The player arrives
// at the Rope's base and must have at least one open step away from it.
function undergroundShaftHasUsableLanding(mapId, x, y) {
  const baseY = Number(y) + BUILD_GRID_SIZE;
  if (playerSpawnPointBlocked(mapId, Number(x), Number(y), 4)) return false;
  if (playerSpawnPointBlocked(mapId, Number(x), baseY, 4)) return false;
  return [
    [Number(x), baseY + BUILD_GRID_SIZE],
    [Number(x) + BUILD_GRID_SIZE, baseY],
    [Number(x) - BUILD_GRID_SIZE, baseY]
  ].some(([candidateX, candidateY]) => !playerSpawnPointBlocked(mapId, candidateX, candidateY, 4));
}

function floorStructureAt(mapId, x, y) {
  return structuresOnMap(mapId).find(structure =>
    BUILD_FLOOR_KINDS.has(structure.kind) &&
    Math.abs(Number(structure.x) - x) < 1 &&
    Math.abs(Number(structure.y) - y) < 1
  ) || null;
}

function torchSupportById(mapId, supportId) {
  if (typeof supportId !== "string" || !supportId) return null;
  const support = structuresOnMap(mapId).find(structure => structure?.id === supportId) || null;
  if (!support || support.mapId && support.mapId !== mapId) return null;
  return (BUILD_FLOOR_KINDS.has(support.kind) || BUILD_WALL_KINDS.has(support.kind)) ? support : null;
}

function attachedTorchForSupport(mapId, supportId) {
  if (typeof supportId !== "string" || !supportId) return null;
  return structuresOnMap(mapId).find(structure =>
    structure?.kind === "torch" && structure?.supportId === supportId
  ) || null;
}

function normalizedWallFromFloorEdge(floorX, floorY, edge) {
  if (edge === "north") return { x: floorX, y: floorY - 8, axis: "horizontal" };
  if (edge === "south") return { x: floorX, y: floorY + 8, axis: "horizontal" };
  if (edge === "east") return { x: floorX + 8, y: floorY, axis: "vertical" };
  if (edge === "west") return { x: floorX - 8, y: floorY, axis: "vertical" };
  return null;
}

function wallMatchesBoundary(structure, wall) {
  return (BUILD_WALL_KINDS.has(structure?.kind) || ["woodDoor", "caveDoor"].includes(structure?.kind)) &&
    structure.axis === wall.axis &&
    Math.abs(Number(structure.x) - wall.x) < 1 &&
    Math.abs(Number(structure.y) - wall.y) < 1;
}

function wallTouchesFloor(structure, floorX, floorY) {
  if (!(BUILD_WALL_KINDS.has(structure?.kind) || ["woodDoor", "caveDoor"].includes(structure?.kind))) return false;
  const candidates = [
    normalizedWallFromFloorEdge(floorX, floorY, "north"),
    normalizedWallFromFloorEdge(floorX, floorY, "east"),
    normalizedWallFromFloorEdge(floorX, floorY, "south"),
    normalizedWallFromFloorEdge(floorX, floorY, "west")
  ];
  return candidates.some(wall => wallMatchesBoundary(structure, wall));
}

function floorsSupportingBoundary(mapId, structure) {
  if (!(BUILD_WALL_KINDS.has(structure?.kind) || ["woodDoor", "caveDoor"].includes(structure?.kind))) return [];
  const x = Number(structure.x);
  const y = Number(structure.y);
  const candidates = structure.axis === "vertical"
    ? [[x - 8, y], [x + 8, y]]
    : [[x, y - 8], [x, y + 8]];
  return candidates
    .map(([floorX, floorY]) => floorStructureAt(mapId, floorX, floorY))
    .filter(Boolean);
}

function floorRemovalWouldOrphanBoundary(mapId, floor) {
  if (!BUILD_FLOOR_KINDS.has(floor?.kind)) return false;
  return structuresOnMap(mapId).some(structure => {
    if (!wallTouchesFloor(structure, floor.x, floor.y)) return false;
    return !floorsSupportingBoundary(mapId, structure).some(otherFloor => otherFloor.id !== floor.id);
  });
}

function floorRemovalWouldOrphanObject(mapId, floor) {
  if (!BUILD_FLOOR_KINDS.has(floor?.kind)) return false;
  return structuresOnMap(mapId).some(structure =>
    structure?.kind === "chest" &&
    Math.abs(Number(structure.x) - Number(floor.x)) < 1 &&
    Math.abs(Number(structure.y) - Number(floor.y)) < 1
  );
}

function doorHasFlankingWalls(mapId, wall) {
  if (!wall) return false;
  const structures = structuresOnMap(mapId);
  const endpoints = wall.axis === "horizontal"
    ? [
        { x: wall.x - 8, y: wall.y, side: -1 },
        { x: wall.x + 8, y: wall.y, side: 1 }
      ]
    : [
        { x: wall.x, y: wall.y - 8, side: -1 },
        { x: wall.x, y: wall.y + 8, side: 1 }
      ];

  const endpointHasWallSupport = endpoint => structures.some(structure => {
    if (!BUILD_WALL_KINDS.has(structure?.kind)) return false;
    const axis = structure.axis === "vertical" ? "vertical" : "horizontal";

    // Straight wall continuation beside the door.
    if (axis === wall.axis) {
      const expectedX = wall.axis === "horizontal"
        ? wall.x + endpoint.side * BUILD_GRID_SIZE
        : wall.x;
      const expectedY = wall.axis === "vertical"
        ? wall.y + endpoint.side * BUILD_GRID_SIZE
        : wall.y;
      return Math.abs(Number(structure.x) - expectedX) < 1 &&
        Math.abs(Number(structure.y) - expectedY) < 1;
    }

    // v397: a perpendicular wall meeting the same endpoint is also valid.
    // This lets a door sit directly beside a 90-degree exterior corner.
    if (wall.axis === "horizontal") {
      return Math.abs(Number(structure.x) - endpoint.x) < 1 &&
        Math.abs(Math.abs(Number(structure.y) - endpoint.y) - 8) < 1;
    }
    return Math.abs(Number(structure.y) - endpoint.y) < 1 &&
      Math.abs(Math.abs(Number(structure.x) - endpoint.x) - 8) < 1;
  });

  return endpoints.every(endpointHasWallSupport);
}

function wallSupportsDoor(door, wall) {
  if (!["woodDoor", "caveDoor"].includes(door?.kind) || !BUILD_WALL_KINDS.has(wall?.kind)) return false;
  const doorAxis = door.axis === "vertical" ? "vertical" : "horizontal";
  const wallAxis = wall.axis === "vertical" ? "vertical" : "horizontal";
  const endpoints = doorAxis === "horizontal"
    ? [
        { x: Number(door.x) - 8, y: Number(door.y), side: -1 },
        { x: Number(door.x) + 8, y: Number(door.y), side: 1 }
      ]
    : [
        { x: Number(door.x), y: Number(door.y) - 8, side: -1 },
        { x: Number(door.x), y: Number(door.y) + 8, side: 1 }
      ];

  return endpoints.some(endpoint => {
    if (wallAxis === doorAxis) {
      const expectedX = doorAxis === "horizontal"
        ? Number(door.x) + endpoint.side * BUILD_GRID_SIZE
        : Number(door.x);
      const expectedY = doorAxis === "vertical"
        ? Number(door.y) + endpoint.side * BUILD_GRID_SIZE
        : Number(door.y);
      return Math.abs(Number(wall.x) - expectedX) < 1 &&
        Math.abs(Number(wall.y) - expectedY) < 1;
    }

    if (doorAxis === "horizontal") {
      return Math.abs(Number(wall.x) - endpoint.x) < 1 &&
        Math.abs(Math.abs(Number(wall.y) - endpoint.y) - 8) < 1;
    }
    return Math.abs(Number(wall.y) - endpoint.y) < 1 &&
      Math.abs(Math.abs(Number(wall.x) - endpoint.x) - 8) < 1;
  });
}

function buildFloorKey(x, y) {
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

function roofedFloorKeysOnMap(mapId) {
  // v411: roofs are derived from surface/boundary topology. Connected floors
  // do not cross a wall or door, so exterior porch/deck tiles cannot merge
  // into (and invalidate) an already enclosed interior.
  return STRUCTURE_TOPOLOGY.roofedFloorKeys(structuresOnMap(mapId), BUILD_GRID_SIZE);
}

function structurePlacementBlocked(mapId, kind, x, y, wall = null) {
  const dimensions = mapWorldDimensions(mapId);
  const edgeKind = BUILD_WALL_KINDS.has(kind) || ["woodDoor", "caveDoor"].includes(kind);
  const testX = edgeKind && wall ? wall.x : x;
  const testY = edgeKind && wall ? wall.y : y;
  if (BUILD_FLOOR_KINDS.has(kind)) {
    if (x < 32 || y < 32 || x > dimensions.width - 32 || y > dimensions.height - 32) return true;
  } else if (kind === "torch") {
    if (x < 16 || y < 16 || x > dimensions.width - 16 || y > dimensions.height - 16) return true;
  } else if (testX < 24 || testY < 24 || testX > dimensions.width - 24 || testY > dimensions.height - 24) {
    return true;
  }

  if (BUILD_FLOOR_KINDS.has(kind)) {
    if (floorStructureAt(mapId, x, y)) return true;
  } else if (kind === "torch") {
    if (structuresOnMap(mapId).some(structure => Math.hypot(Number(structure.x) - x, Number(structure.y) - y) < 10)) return true;
  } else if (edgeKind) {
    if (!wall || structuresOnMap(mapId).some(structure => wallMatchesBoundary(structure, wall))) return true;
  }

  for (const entity of environmentEntitiesOnMap(mapId)) {
    if (entity.removed || entity.depleted || entity.cut) continue;
    if (Math.hypot(entity.x - testX, entity.y - testY) < (edgeKind ? 10 : 18)) return true;
  }
  for (const npc of WORLD_CONTENT.maps[mapId]?.npcs || []) {
    if (Math.hypot(Number(npc.x) - testX, Number(npc.y) - testY) < (edgeKind ? 14 : 26)) return true;
  }
  const testRect = edgeKind && wall
    ? structureRect({ kind, x: wall.x, y: wall.y, axis: wall.axis })
    : null;
  // v425: floor tiles are non-solid and may be placed under a player. Treating
  // the builder (or anyone standing nearby) as an obstruction created a fake
  // dead tile at the spawn point. Walls, doors and objects still respect live
  // player occupancy exactly as before.
  if (!BUILD_FLOOR_KINDS.has(kind)) {
    for (const playerState of players.values()) {
      if (playerState.mapId !== mapId || playerState.hp <= 0) continue;
      if (testRect ? circleRectHit(playerState.x, playerState.y, 4, testRect) : Math.hypot(playerState.x - x, playerState.y - y) < 12) return true;
    }
  }
  return false;
}

function handleStructurePlaceRequest(playerId, socket, message) {
  const playerState = players.get(playerId);

  if (message?.kind === "dirt") {
    if (!playerState || playerState.hp <= 0 || (Number(playerState.dirt) || 0) <= 0) return;
    const dimensions = mapWorldDimensions(playerState.mapId);
    const x = Math.round(clampNumber(message.x, 0, dimensions.width, playerState.x) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const y = Math.round(clampNumber(message.y, 0, dimensions.height, playerState.y) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const excavation = structuresOnMap(playerState.mapId).find(structure =>
      ["dugPit", "dugDirt"].includes(structure?.kind) && !structure?.ropePlaced &&
      Math.abs(Number(structure.x) - x) < 1 && Math.abs(Number(structure.y) - y) < 1
    );
    if (!excavation || Math.hypot(x - playerState.x, y - playerState.y) > BUILD_PLACE_RANGE) {
      sendJson(socket, { type: "structurePlaceResult", success: false, reason: "blocked", kind: "dirt", totalDirt: playerState.dirt });
      return;
    }
    const targetMapId = excavation.targetMapId;
    const removed = removeAnyStructure(excavation.id, playerState.mapId);
    if (!removed) return;
    broadcastToMap(playerState.mapId, { type: "structureRemoved", structureId: removed.id, mapId: playerState.mapId, reason: "filled" });
    if (removed.kind === "dugPit" && targetMapId) {
      const shaft = structuresOnMap(targetMapId).find(structure =>
        structure?.kind === "shaftOpening" && structure?.targetMapId === playerState.mapId &&
        Math.abs(Number(structure.x) - x) < 1 && Math.abs(Number(structure.y) - y) < 1
      );
      if (shaft) {
        removeAnyStructure(shaft.id, targetMapId);
        broadcastToMap(targetMapId, { type: "structureRemoved", structureId: shaft.id, mapId: targetMapId, reason: "filled" });
      }
    }
    playerState.dirt -= 1;
    sendJson(socket, { type: "structurePlaceResult", success: true, kind: "dirt", structureId: removed.id, totalDirt: playerState.dirt });
    return;
  }

  if (message?.kind === "rope") {
    if (!playerState || playerState.hp <= 0 || (Number(playerState.ropes) || 0) <= 0) return;
    const dimensions = mapWorldDimensions(playerState.mapId);
    const x = Math.round(clampNumber(message.x, 0, dimensions.width, playerState.x) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const y = Math.round(clampNumber(message.y, 0, dimensions.height, playerState.y) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const pit = structuresOnMap(playerState.mapId).find(structure =>
      structure?.kind === "dugPit" && structure?.breakthrough && !structure?.ropePlaced && structure?.targetMapId &&
      Math.abs(Number(structure.x) - x) < 1 && Math.abs(Number(structure.y) - y) < 1
    );
    const northPit = pit && structuresOnMap(playerState.mapId).some(structure =>
      structure?.kind === "dugPit" && structure?.breakthrough &&
      Math.abs(Number(structure.x) - x) < 1 &&
      Math.abs(Number(structure.y) - (y - BUILD_GRID_SIZE)) < 1
    );
    if (!pit || northPit || Math.hypot(x - playerState.x, y - playerState.y) > BUILD_PLACE_RANGE) {
      sendJson(socket, { type: "structurePlaceResult", success: false, reason: "blocked", kind: "rope", totalRopes: playerState.ropes });
      return;
    }
    const matchingShaft = structuresOnMap(pit.targetMapId).find(structure =>
      structure?.kind === "shaftOpening" && structure?.targetMapId === playerState.mapId &&
      Math.abs(Number(structure.x) - x) < 1 && Math.abs(Number(structure.y) - y) < 1
    ) || null;
    playerState.ropes -= 1;
    pit.ropePlaced = true;
    broadcastStructureState(pit, { ropePlaced: true });
    if (matchingShaft) {
      matchingShaft.ropePlaced = true;
      broadcastStructureState(matchingShaft, { ropePlaced: true });
    }
    sendJson(socket, { type: "structurePlaceResult", success: true, kind: "rope", structureId: pit.id, totalRopes: playerState.ropes });
    return;
  }

  const kind = message?.kind === "woodFloor" ? "woodFloor" : message?.kind === "stoneFloor" ? "stoneFloor" : message?.kind === "woodWall" ? "woodWall" : message?.kind === "stoneWall" ? "stoneWall" : message?.kind === "stoneCube" ? "stoneCube" : message?.kind === "caveDoor" ? "caveDoor" : message?.kind === "woodDoor" ? "woodDoor" : message?.kind === "torch" ? "torch" : message?.kind === "chest" ? "chest" : message?.kind === "craftingTable" ? "craftingTable" : null;
  if (!playerState || playerState.hp <= 0 || !kind || !worldGridMetaForMap(playerState.mapId)) return;

  const resourceKey = kind === "woodFloor" ? "woodFloors" : kind === "stoneFloor" ? "stoneFloors" : kind === "woodWall" ? "woodWalls" : kind === "stoneWall" ? "stoneWalls" : kind === "stoneCube" ? "stoneCubes" : kind === "caveDoor" ? "stoneArches" : kind === "woodDoor" ? "woodDoors" : kind === "chest" ? "chests" : kind === "craftingTable" ? "craftingTables" : "torches";
  const dimensions = mapWorldDimensions(playerState.mapId);
  const floorX = Math.round(clampNumber(message.x, 0, dimensions.width, playerState.x) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const floorY = Math.round(clampNumber(message.y, 0, dimensions.height, playerState.y) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const edge = typeof message?.edge === "string" ? message.edge : null;
  const wall = (BUILD_WALL_KINDS.has(kind) || ["woodDoor", "caveDoor"].includes(kind)) ? normalizedWallFromFloorEdge(floorX, floorY, edge) : null;
  const requestedSupportId = kind === "torch" && typeof message?.supportId === "string" ? message.supportId : null;
  const torchSupport = kind === "torch" && requestedSupportId
    ? torchSupportById(playerState.mapId, requestedSupportId)
    : null;
  const placementX = torchSupport ? Number(torchSupport.x) : (wall?.x ?? floorX);
  const placementY = torchSupport ? Number(torchSupport.y) : (wall?.y ?? floorY);
  let reason = null;

  if ((Number(playerState[resourceKey]) || 0) <= 0) reason = "noneOwned";
  else if ((BUILD_WALL_KINDS.has(kind) || ["woodDoor", "caveDoor"].includes(kind)) && (!wall || !floorStructureAt(playerState.mapId, floorX, floorY))) reason = "needsFloor";
  else if (kind === "chest" && !floorStructureAt(playerState.mapId, floorX, floorY)) reason = "needsFloor";
  else if (["chest", "craftingTable", "stoneCube"].includes(kind) && structuresOnMap(playerState.mapId).some(structure =>
    STRUCTURE_TOPOLOGY.layerOf(structure) === STRUCTURE_TOPOLOGY.LAYERS.OBJECT &&
    Math.abs(Number(structure.x) - floorX) < 1 &&
    Math.abs(Number(structure.y) - floorY) < 1
  )) reason = "objectOccupied";
  else if (["woodDoor", "caveDoor"].includes(kind) && !doorHasFlankingWalls(playerState.mapId, wall)) reason = "doorNeedsWalls";
  else if (kind === "torch" && requestedSupportId && !torchSupport) reason = "invalidSupport";
  else if (kind === "torch" && torchSupport && attachedTorchForSupport(playerState.mapId, torchSupport.id)) reason = "supportOccupied";
  else if (Math.hypot(placementX - playerState.x, placementY - playerState.y) > BUILD_PLACE_RANGE) reason = "tooFar";
  else if (kind === "torch" && torchSupport) {
    // v406: a torch mounted to a valid player-built support is allowed to share
    // that support's space. The support already passed world/NPC placement
    // rules when it was built, so only attachment occupancy matters here.
  } else if (structurePlacementBlocked(playerState.mapId, kind, floorX, floorY, wall)) reason = "blocked";

  if (reason) {
    sendJson(socket, { type: "structurePlaceResult", success: false, reason, kind, totalWoodFloors: playerState.woodFloors,
      totalStoneFloors: playerState.stoneFloors, totalWoodWalls: playerState.woodWalls, totalStoneWalls: playerState.stoneWalls, totalStoneCubes: playerState.stoneCubes, totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes, totalWoodDoors: playerState.woodDoors, totalTorches: playerState.torches, totalChests: playerState.chests, totalCraftingTables: playerState.craftingTables });
    return;
  }

  playerState[resourceKey] -= 1;
  const structure = {
    id: `build:${nextSharedStructureId++}`,
    mapId: playerState.mapId,
    kind,
    x: placementX,
    y: placementY,
    ...((BUILD_WALL_KINDS.has(kind) || ["woodDoor", "caveDoor"].includes(kind)) ? { axis: wall.axis } : {}),
    ...(kind === "chest" ? { opened: false, treasure: false } : {}),
    ...(kind === "torch" ? (
      torchSupport
        ? {
            supportId: torchSupport.id,
            mountType: BUILD_WALL_KINDS.has(torchSupport.kind) ? "wall" : "floor",
            ...(BUILD_WALL_KINDS.has(torchSupport.kind) ? {
              mountAxis: STRUCTURE_GEOMETRY.axisOf(torchSupport),
              mountSide: STRUCTURE_GEOMETRY.sideOfBoundary(
                torchSupport,
                playerState.x,
                playerState.y
              )
            } : {})
          }
        : { mountType: "ground" }
    ) : {}),
    ownerId: playerId
  };
  sharedStructures.set(structure.id, structure);
  if (!sharedStructuresByMap.has(structure.mapId)) sharedStructuresByMap.set(structure.mapId, new Map());
  sharedStructuresByMap.get(structure.mapId).set(structure.id, structure);
  structureNavRevision += 1;

  broadcastToMap(structure.mapId, { type: "structurePlaced", structure });
  sendJson(socket, { type: "structurePlaceResult", success: true, kind, structureId: structure.id, totalWoodFloors: playerState.woodFloors,
      totalStoneFloors: playerState.stoneFloors, totalWoodWalls: playerState.woodWalls, totalStoneWalls: playerState.stoneWalls, totalStoneCubes: playerState.stoneCubes, totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes, totalWoodDoors: playerState.woodDoors, totalTorches: playerState.torches, totalChests: playerState.chests, totalCraftingTables: playerState.craftingTables });
}

function removeSharedStructure(structureId) {
  const structure = sharedStructures.get(structureId);
  if (!structure) return null;
  sharedStructures.delete(structureId);
  const bucket = sharedStructuresByMap.get(structure.mapId);
  bucket?.delete(structureId);
  if (bucket && bucket.size === 0) sharedStructuresByMap.delete(structure.mapId);
  structureNavRevision += 1;
  for (const [playerId, passage] of playerDoorPassages.entries()) {
    if (passage?.doorId === structureId) playerDoorPassages.delete(playerId);
  }
  return structure;
}

function removeAnyStructure(structureId, mapId = null) {
  const dynamic = sharedStructures.get(structureId);
  if (dynamic) return removeSharedStructure(structureId);
  const candidateMapId = mapId || Array.from(ALLOWED_MAPS).find(id =>
    worldGeneratedStructureDefinitionById(id, structureId)
  );
  return candidateMapId ? removeWorldGeneratedStructure(candidateMapId, structureId) : null;
}

function structureById(mapId, structureId) {
  return structuresOnMap(mapId).find(structure => structure?.id === structureId) || null;
}

function broadcastStructureState(structure, state) {
  if (!structure?.mapId || !structure?.id) return;
  broadcastToMap(structure.mapId, {
    type: "structureState",
    mapId: structure.mapId,
    structureId: structure.id,
    state: { ...(state || {}) }
  });
}

function broadcastRemovedStructureAsLoot(removed, reason = "mined") {
  if (!removed) return;
  broadcastToMap(removed.mapId, {
    type: "structureRemoved",
    structureId: removed.id,
    mapId: removed.mapId,
    reason
  });

  // Return the exact placed piece as ordinary shared loot. This remains
  // change-only state: there are no structure timers or idle-map heartbeats.
  spawnSharedResource(
    removed.mapId,
    removed.kind,
    removed.x,
    removed.y,
    { life: 30.0 }
  );
}

function removeDoorsOrphanedByWall(removedWall) {
  if (!BUILD_WALL_KINDS.has(removedWall?.kind)) return [];
  const candidates = structuresOnMap(removedWall.mapId).filter(structure =>
    ["woodDoor", "caveDoor"].includes(structure?.kind) && wallSupportsDoor(structure, removedWall)
  );
  const removedDoors = [];
  for (const door of candidates) {
    // If another valid wall still supports the same endpoint, the door remains.
    if (doorHasFlankingWalls(removedWall.mapId, door)) continue;
    const removedDoor = removeAnyStructure(door.id, removedWall.mapId);
    if (!removedDoor) continue;
    removedDoors.push(removedDoor);
    broadcastRemovedStructureAsLoot(removedDoor, "supportRemoved");
  }
  return removedDoors;
}

function handleStructureDestroyRequest(playerId, socket, message) {
  const playerState = players.get(playerId);
  const structureId = typeof message?.structureId === "string" ? message.structureId : "";
  if (!playerState || playerState.hp <= 0 || !structureId) return;
  const structure = structureById(playerState.mapId, structureId);
  if (!structure) return;

  let reason = null;
  if (playerState.weaponIndex !== 11) reason = "needPickaxe";
  else if (structure.kind === "chest" && chestLockOwner(structure.id)) reason = "inUse";
  else if (structure.kind === "chest" && chestHasLoot(structure)) reason = "lootFirst";

  if (reason) {
    sendJson(socket, { type: "structureDestroyResult", success: false, reason, structureId });
    return;
  }

  if (structure.kind === "dugPit") {
    if (!environmentMeleeValid(playerState, structure, [11], 0, 10, 0.92)) {
      sendJson(socket, { type: "structureDestroyResult", success: false, reason: "tooFar", structureId });
      return;
    }
    if (!structure.ropePlaced) {
      sendJson(socket, { type: "structureDestroyResult", success: false, reason: "useDirt", structureId });
      return;
    }
    structure.ropePlaced = false;
    broadcastStructureState(structure, { ropePlaced: false });
    const shaft = structuresOnMap(structure.targetMapId).find(candidate =>
      candidate?.kind === "shaftOpening" && candidate?.targetMapId === structure.mapId &&
      Math.abs(Number(candidate.x) - Number(structure.x)) < 1 &&
      Math.abs(Number(candidate.y) - Number(structure.y)) < 1
    );
    if (shaft) {
      shaft.ropePlaced = false;
      broadcastStructureState(shaft, { ropePlaced: false });
    }
    playerState.ropes += 1;
    sendJson(socket, { type: "structureDestroyResult", success: true, structureId, kind: "rope", attachmentRemoved: true, totalRopes: playerState.ropes });
    return;
  }

  if (structure.kind === "dugDirt") {
    if (!environmentMeleeValid(playerState, structure, [11], 0, 10, 0.92)) {
      sendJson(socket, { type: "structureDestroyResult", success: false, reason: "tooFar", structureId });
      return;
    }
    // Repeated Pickaxe hits do not undo a shallow excavation. Restoring the
    // grass is an intentional Dirt placement action, consistent with holes.
    sendJson(socket, { type: "structureDestroyResult", success: false, reason: "useDirt", structureId });
    return;
  }

  // v406/v414: mounted torches are a protective attachment layer even when
  // their supporting floor/wall came from procedural world generation.
  if (BUILD_FLOOR_KINDS.has(structure.kind) || BUILD_WALL_KINDS.has(structure.kind)) {
    const attachedTorch = attachedTorchForSupport(structure.mapId, structure.id);
    if (attachedTorch) {
      if (!environmentMeleeValid(playerState, structure, [11], 0, 10, 0.92)) {
        sendJson(socket, { type: "structureDestroyResult", success: false, reason: "tooFar", structureId });
        return;
      }
      const removedTorch = removeAnyStructure(attachedTorch.id, structure.mapId);
      if (!removedTorch) return;
      broadcastRemovedStructureAsLoot(removedTorch, "supportPickaxeFirst");
      sendJson(socket, {
        type: "structureDestroyResult",
        success: true,
        structureId: removedTorch.id,
        kind: removedTorch.kind,
        supportId: structure.id,
        attachmentRemoved: true
      });
      return;
    }
  }

  if (BUILD_FLOOR_KINDS.has(structure.kind) && floorRemovalWouldOrphanBoundary(structure.mapId, structure)) reason = "wallAttached";
  else if (BUILD_FLOOR_KINDS.has(structure.kind) && floorRemovalWouldOrphanObject(structure.mapId, structure)) reason = "objectAttached";
  else if (!environmentMeleeValid(playerState, structure, [11], 0, 10, 0.92)) reason = "tooFar";
  if (reason) {
    sendJson(socket, { type: "structureDestroyResult", success: false, reason, structureId });
    return;
  }

  const removed = removeAnyStructure(structureId, structure.mapId);
  if (!removed) return;
  if (removed.kind === "chest") {
    releaseChestContextByChestId(removed.id, "removed");
    chestInventoryById.delete(removed.id);
  }

  broadcastRemovedStructureAsLoot(removed, "mined");
  if (BUILD_WALL_KINDS.has(removed.kind)) removeDoorsOrphanedByWall(removed);

  sendJson(socket, {
    type: "structureDestroyResult",
    success: true,
    structureId: removed.id,
    kind: removed.kind
  });
}

function addRuntimeWorldStructure(structure) {
  if (!structure?.id || !structure?.mapId) return false;
  sharedStructures.set(structure.id, structure);
  if (!sharedStructuresByMap.has(structure.mapId)) sharedStructuresByMap.set(structure.mapId, new Map());
  sharedStructuresByMap.get(structure.mapId).set(structure.id, structure);
  structureNavRevision += 1;
  broadcastToMap(structure.mapId, { type: "structurePlaced", structure });
  return true;
}

function handleGroundDigAction(playerId, playerState, payload) {
  const surfaceDefinition = WORLD_CONTENT.maps?.[playerState.mapId] || null;
  const undergroundMapId = typeof surfaceDefinition?.undergroundMapId === "string"
    ? surfaceDefinition.undergroundMapId
    : null;
  const undergroundDefinition = undergroundMapId ? WORLD_CONTENT.maps?.[undergroundMapId] : null;
  if (!undergroundMapId || !undergroundDefinition || playerState.weaponIndex !== 11) return false;

  const x = Math.round(clampNumber(payload?.x, 16, mapWorldDimensions(playerState.mapId).width - 16, playerState.x) / 16) * 16;
  const y = Math.round(clampNumber(payload?.y, 24, mapWorldDimensions(playerState.mapId).height - 16, playerState.y) / 16) * 16;
  const target = { x, y, kind: "ground" };
  // v460: never let a player excavate the 16x16 ground cell their own
  // collision circle currently occupies. Creating a breakthrough underneath
  // yourself can otherwise strand the player inside the newly solid pit.
  if (circleRectHit(playerState.x, playerState.y, 4.5, { x: x - 8, y: y - 8, width: 16, height: 16 })) return false;
  if (!environmentMeleeValid(playerState, target, [11], 0, 10, 0.92)) return false;
  if (TERRAIN_RULES.circleCanOccupy(surfaceDefinition, x, y, 5, { allowWater: false }) !== true) return false;

  if (structuresOnMap(playerState.mapId).some(structure =>
    Math.hypot(Number(structure.x) - x, Number(structure.y) - y) < 10
  )) return false;

  for (const entity of environmentEntitiesOnMap(playerState.mapId)) {
    if (!["tree", "rock"].includes(entity?.kind)) continue;
    if (Math.hypot(Number(entity.x) - x, Number(entity.y) - y) < 12) return false;
  }

  const breakthrough = TERRAIN_RULES.circleCanOccupy(
    undergroundDefinition,
    x,
    y,
    4,
    { allowWater: false }
  ) === true && undergroundShaftHasUsableLanding(undergroundMapId, x, y);

  const pit = {
    id: `dig:${nextSharedStructureId++}`,
    mapId: playerState.mapId,
    kind: breakthrough ? "dugPit" : "dugDirt",
    x,
    y,
    breakthrough,
    targetMapId: breakthrough ? undergroundMapId : null,
    ...(breakthrough ? { ropePlaced: false } : {}),
    ownerId: playerId
  };
  addRuntimeWorldStructure(pit);

  if (breakthrough) {
    // A real hole displaces exactly one reusable Dirt block. Drop it toward
    // the digger so it remains reachable beside the new solid-edged pit.
    const dirtDx = Number(playerState.x) - x;
    const dirtDy = Number(playerState.y) - y;
    const dirtDistance = Math.hypot(dirtDx, dirtDy) || 1;
    spawnSharedResource(playerState.mapId, "inventoryItem", x + dirtDx / dirtDistance * 10, y + dirtDy / dirtDistance * 10, {
      itemToken: "resource:dirt",
      itemCount: 1,
      ownerId: playerId,
      life: 300
    });
  }

  if (breakthrough) {
    addRuntimeWorldStructure({
      id: `shaft:${nextSharedStructureId++}`,
      mapId: undergroundMapId,
      kind: "shaftOpening",
      x,
      y,
      breakthrough: true,
      ropePlaced: false,
      targetMapId: playerState.mapId,
      ownerId: playerId
    });
  }

  return true;
}

// -----------------------------------------------------------------------------
// SHARED ENVIRONMENT
// -----------------------------------------------------------------------------
// WORLD_CONTENT is the single deterministic definition of trees, grass, rocks,
// and harvest flowers on both server and client. The server builds its mutable
// authoritative environment directly at startup; clients never upload a copy
// of the world catalog during connection anymore.
const sharedEnvironment = new Map();
// Secondary map index for persistent world objects. The authoritative entity
// objects still live in sharedEnvironment; this index only prevents every
// map-local query from scanning unrelated maps as the world gains more props.
const sharedEnvironmentByMap = new Map();
const dirtyEnvironmentIds = new Set();
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
// v379 trees do not respawn where they were chopped. The deterministic tree
// slot disappears after a short stump period and can very rarely establish at
// a different location much later. No per-tree timers or network heartbeats.
const TREE_STUMP_VISIBLE_MS = 5000;
const TREE_RESEED_MIN_MS = 1_200_000;
const TREE_RESEED_MAX_MS = 2_400_000;
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

function scheduleTreeReseed(entity) {
  if (!entity || entity.kind !== "tree" || entity.reseedAt > 0) return false;
  entity.reseedAt = randomRegrowTimestamp(TREE_RESEED_MIN_MS, TREE_RESEED_MAX_MS);
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
  entity.removed = false;

  entity.falling = false;
  entity.fallTime = 0;
  entity.fallDirection = 1;
  entity.lastHitPlayerId = null;

  entity.canopyBurnTime = 0;
  entity.canopyBurned = false;

  entity.regrowAt = 0;
  entity.removeAt = 0;
  entity.reseedAt = 0;

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
  markEnvironmentDirty(entity);
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
      removed: Boolean(entity.removed),
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
      depleted: Boolean(entity.depleted)
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
    return entity.hp < entity.maxHp || entity.isStump || entity.removed || entity.falling ||
      entity.canopyBurnTime > 0 || entity.canopyBurned;
  }
  if (entity.kind === "grass") {
    return Boolean(entity.cut || entity.burnt || entity.burnTime > 0);
  }
  if (entity.kind === "rock") {
    return Boolean(entity.hp < entity.maxHp || entity.depleted);
  }
  return Boolean(entity.cut || entity.burnt || entity.burnTime > 0 || entity.looted);
}

function sharedEnvironmentChangesSnapshot(mapId) {
  return environmentEntitiesOnMap(mapId)
    .filter(environmentEntityHasNonDefaultState)
    .map(environmentEntitySnapshot);
}

function markEnvironmentDirty(entity) {
  if (!entity?.id) return;
  dirtyEnvironmentIds.add(entity.id);
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

}

function serverEnvironmentEntityFromDefinition(
  mapId,
  kind,
  canonical
) {
  if (
    !canonical ||
    typeof canonical !== "object" ||
    !["tree", "grass", "flower", "rock"].includes(kind)
  ) {
    return null;
  }

  const id = String(canonical.id || "");
  if (!id) return null;

  const dimensions = mapWorldDimensions(mapId);
  const x = clampNumber(canonical.x, 0, dimensions.width, 0);
  const y = clampNumber(canonical.y, 0, dimensions.height, 0);

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
      removed: false,

      falling: false,
      fallTime: 0,
      fallDuration: 0.42,
      fallDirection: 1,
      lastHitPlayerId: null,

      canopyBurnTime: 0,
      canopyBurnDuration: 2.7,
      canopyBurned: false,

      regrowAt: 0,
      removeAt: 0,
      reseedAt: 0,

      canopyVariant: clampInteger(
        canonical.canopyVariant,
        0,
        8,
        0
      ),
      fireImmune: Boolean(canonical.fireImmune),
      nonInteractive: Boolean(canonical.nonInteractive)
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
      width: clampNumber(canonical.width, 6, 40, 13)
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
        canonical.variant === "grass"
          ? "grass"
          : "plain",
      hp: 3,
      maxHp: 3,
      depleted: false,
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
    regrowAt: 0,

    flowerType:
      canonical.type === "blue"
        ? "blue"
        : "white"
  };
}

function staticHurlTreesOnMap(mapId) {
  return staticHurlTreesByMap.get(mapId) || [];
}

function initializeSharedEnvironmentFromWorldContent() {
  let mutableCount = 0;
  let staticTreeCount = 0;

  for (const [mapId, mapDefinition] of Object.entries(WORLD_CONTENT.maps || {})) {
    const environment = mapDefinition?.environment || {};
    const staticTrees = [];

    for (const definition of environment.trees || []) {
      if (
        Boolean(definition?.fireImmune) &&
        Boolean(definition?.nonInteractive)
      ) {
        staticTrees.push({
          x: clampNumber(definition.x, 0, mapWorldDimensions(mapId).width, 0),
          y: clampNumber(definition.y, 0, mapWorldDimensions(mapId).height, 0)
        });
        staticTreeCount += 1;
        continue;
      }

      const entity =
        serverEnvironmentEntityFromDefinition(
          mapId,
          "tree",
          definition
        );
      if (entity && registerSharedEnvironmentEntity(entity)) {
        mutableCount += 1;
      }
    }

    for (const definition of environment.tallGrass || []) {
      const entity =
        serverEnvironmentEntityFromDefinition(
          mapId,
          "grass",
          definition
        );
      if (entity && registerSharedEnvironmentEntity(entity)) {
        mutableCount += 1;
      }
    }

    for (const definition of environment.rocks || []) {
      const entity =
        serverEnvironmentEntityFromDefinition(
          mapId,
          "rock",
          definition
        );
      if (entity && registerSharedEnvironmentEntity(entity)) {
        mutableCount += 1;
      }
    }

    for (const definition of environment.harvestFlowers || []) {
      const entity =
        serverEnvironmentEntityFromDefinition(
          mapId,
          "flower",
          definition
        );
      if (entity && registerSharedEnvironmentEntity(entity)) {
        mutableCount += 1;
      }
    }

    staticHurlTreesByMap.set(mapId, staticTrees);
  }

  console.log(
    `[WORLD] initialized ${mutableCount} mutable environment entities + ` +
    `${staticTreeCount} immutable tree collision points from WORLD_CONTENT`
  );
}

initializeSharedEnvironmentFromWorldContent();

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
      itemToken: resource.kind === "inventoryItem" ? resource.itemToken || null : null,
      itemCount: resource.kind === "inventoryItem" ? Math.max(1, Math.floor(Number(resource.itemCount) || 1)) : null,
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
  if (!["wood", "stone", "flower", "goldSlimeBubble", "greenJellyCube", "icedCoffee", "woodFloor", "stoneFloor", "woodWall", "stoneWall", "stoneCube", "caveDoor", "woodDoor", "torch", "chest", "craftingTable", "inventoryItem"].includes(kind)) {
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
    itemToken: kind === "inventoryItem" && typeof options.itemToken === "string" ? options.itemToken : null,
    itemCount: kind === "inventoryItem" ? Math.max(1, Math.floor(Number(options.itemCount) || 1)) : null,
    ownerId: typeof options.ownerId === "string" ? options.ownerId : null,
    life: Number.isFinite(Number(options.life)) ? Math.max(1, Number(options.life)) : kind === "icedCoffee" ? 28.0 : kind === "inventoryItem" ? 300.0 : 18.0
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

// v425 generic inventory-transfer vocabulary. Resource tokens are authoritative
// server-owned counters; equipment tokens keep the project's existing browser-
// owned equipment-count model while the shared chest/world container itself is
// still server authoritative.
const INVENTORY_TRANSFER_RESOURCE_KEYS = new Set([
  "coins", "wood", "stone", "dirt", "whiteFlowers", "blueFlowers",
  "healingPotions", "attackPotions", "magicPotions",
  "goldSlimeBubbles", "greenJellyCubes", "arrows",
  "woodFloors", "stoneFloors", "woodWalls", "stoneWalls", "stoneCubes", "stoneArches", "ropes", "woodDoors",
  "torches", "chests", "craftingTables"
]);

function inventoryTransferTokenParts(token) {
  const clean = typeof token === "string" ? token : "";
  if (clean.startsWith("resource:")) {
    const id = clean.slice(9);
    return INVENTORY_TRANSFER_RESOURCE_KEYS.has(id) ? { type: "resource", id, token: clean } : null;
  }
  if (clean.startsWith("item:")) {
    const id = clean.slice(5);
    const validEquipment = TRANSFERABLE_EQUIPMENT_ITEM_IDS.has(id) || id === "charm_woodRing";
    return validEquipment ? { type: "item", id, token: clean } : null;
  }
  return null;
}

function transferResourcePlayerCount(playerState, token) {
  const parts = inventoryTransferTokenParts(token);
  return parts?.type === "resource" ? Math.max(0, Math.floor(Number(playerState?.[parts.id]) || 0)) : null;
}

function handleInventoryDropRequest(playerId, socket, message) {
  const playerState = players.get(playerId);
  const parts = inventoryTransferTokenParts(message?.token);
  if (!playerState || playerState.hp <= 0 || !parts) return;
  const requested = Math.max(1, Math.min(999999, Math.floor(Number(message?.count) || 1)));
  let amount = requested;
  if (parts.type === "resource") {
    amount = Math.min(requested, Math.max(0, Math.floor(Number(playerState[parts.id]) || 0)));
    if (amount <= 0) { sendJson(socket, { type: "inventoryDropResult", success: false, token: parts.token, reason: "empty", playerCount: 0 }); return; }
    playerState[parts.id] -= amount;
  }
  const dimensions = mapWorldDimensions(playerState.mapId);
  let x = clampNumber(message?.x, 8, dimensions.width - 8, playerState.x);
  let y = clampNumber(message?.y, 8, dimensions.height - 8, playerState.y - 4);
  const dx = x - playerState.x; const dy = y - playerState.y; const distance = Math.hypot(dx, dy);
  if (distance > 48 && distance > 0.001) { x = playerState.x + dx / distance * 48; y = playerState.y + dy / distance * 48; }
  const resource = spawnSharedResource(playerState.mapId, "inventoryItem", x, y, { itemToken: parts.token, itemCount: amount, life: 300 });
  if (!resource) {
    if (parts.type === "resource") playerState[parts.id] += amount;
    sendJson(socket, { type: "inventoryDropResult", success: false, token: parts.token, reason: "spawnFailed", playerCount: transferResourcePlayerCount(playerState, parts.token) });
    return;
  }
  sendJson(socket, { type: "inventoryDropResult", success: true, token: parts.token, amount, resourceId: resource.id, playerCount: transferResourcePlayerCount(playerState, parts.token) });
}

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

  const inventoryDropParts = resource.kind === "inventoryItem" ? inventoryTransferTokenParts(resource.itemToken) : null;
  if (resource.kind === "inventoryItem" && !inventoryDropParts) return;

  // Remove first so pickup races have exactly one winner.
  sharedResources.delete(resource.id);

  if (resource.kind === "inventoryItem" && inventoryDropParts?.type === "resource") {
    playerState[inventoryDropParts.id] = Math.max(0, Math.floor(Number(playerState[inventoryDropParts.id]) || 0)) + Math.max(1, Math.floor(Number(resource.itemCount) || 1));
  } else if (resource.kind === "wood") {
    playerState.wood += 1;
  } else if (resource.kind === "stone") {
    playerState.stone += 1;
  } else if (resource.kind === "flower") {
    if (resource.flowerType === "blue") playerState.blueFlowers += 1;
    else playerState.whiteFlowers += 1;
  } else if (resource.kind === "goldSlimeBubble") {
    playerState.goldSlimeBubbles += 1;
  } else if (resource.kind === "greenJellyCube") {
    playerState.greenJellyCubes += 1;
  } else if (resource.kind === "icedCoffee") {
    playerState.beachQuestIcedCoffee = 1;
  } else if (resource.kind === "woodFloor") {
    playerState.woodFloors += 1;
  } else if (resource.kind === "stoneFloor") {
    playerState.stoneFloors += 1;
  } else if (resource.kind === "woodWall") {
    playerState.woodWalls += 1;
  } else if (resource.kind === "stoneWall") {
    playerState.stoneWalls += 1;
  } else if (resource.kind === "stoneCube") {
    playerState.stoneCubes += 1;
  } else if (resource.kind === "caveDoor") {
    playerState.stoneArches += 1;
  } else if (resource.kind === "woodDoor") {
    playerState.woodDoors += 1;
  } else if (resource.kind === "torch") {
    playerState.torches += 1;
  } else if (resource.kind === "chest") {
    playerState.chests += 1;
  } else if (resource.kind === "craftingTable") {
    playerState.craftingTables += 1;
  }

  broadcastToMap(resource.mapId, {
    type: "resourcePicked",
    resourceId: resource.id,
    resourceKind: resource.kind,
    mapId: resource.mapId,
    collectorId: playerId,
    itemToken: resource.kind === "inventoryItem" ? resource.itemToken || null : null,
    itemCount: resource.kind === "inventoryItem" ? Math.max(1, Math.floor(Number(resource.itemCount) || 1)) : null,
    playerCount: resource.kind === "inventoryItem" ? transferResourcePlayerCount(playerState, resource.itemToken) : null,
    totalWood: playerState.wood,
    totalStone: playerState.stone,
    flowerType: resource.flowerType === "blue" ? "blue" : "white",
    totalWhiteFlowers: playerState.whiteFlowers,
    totalBlueFlowers: playerState.blueFlowers,
    totalGoldSlimeBubbles: playerState.goldSlimeBubbles,
    totalGreenJellyCubes: playerState.greenJellyCubes,
    totalWoodFloors: playerState.woodFloors,
    totalStoneFloors: playerState.stoneFloors,
    totalWoodWalls: playerState.woodWalls,
    totalStoneWalls: playerState.stoneWalls,
    totalStoneCubes: playerState.stoneCubes,
    totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes,
    totalWoodDoors: playerState.woodDoors,
    totalTorches: playerState.torches,
    totalChests: playerState.chests,
    totalCraftingTables: playerState.craftingTables,
    beachQuestIcedCoffee: playerState.beachQuestIcedCoffee
  });
}

const CRAFT_RECIPES = Object.freeze({
  recoveryPickaxe: Object.freeze({ station: "hand", ingredients: Object.freeze({}) }),
  craftingTable: Object.freeze({ resourceKey: "craftingTables", outputCount: 1, station: "hand", ingredients: Object.freeze({ wood: 10 }) }),
  rope: Object.freeze({ resourceKey: "ropes", outputCount: 1, station: "hand", ingredients: Object.freeze({}) }),
  woodSword: Object.freeze({ ingredients: Object.freeze({ wood: 8 }) }),
  woodBow: Object.freeze({ ingredients: Object.freeze({ wood: 8 }) }),
  shepherdStaff: Object.freeze({ ingredients: Object.freeze({ wood: 10 }) }),
  // v416: Tiger Paw must exist in the authoritative recipe table too. In v415
  // the client knew this recipe but the server silently ignored it, leaving the
  // crafting button stuck in its pending/WORKING state forever.
  tigerPaw: Object.freeze({ ingredients: Object.freeze({ wood: 8, stone: 2 }) }),
  woodHelm: Object.freeze({ ingredients: Object.freeze({ wood: 8, stone: 2 }) }),
  woodChest: Object.freeze({ ingredients: Object.freeze({ wood: 12, stone: 3 }) }),
  woodGreaves: Object.freeze({ ingredients: Object.freeze({ wood: 10, stone: 2 }) }),
  woodRing: Object.freeze({ ingredients: Object.freeze({ wood: 5 }) }),
  woodFloor: Object.freeze({ resourceKey: "woodFloors", outputCount: 4, ingredients: Object.freeze({ wood: 2 }) }),
  stoneFloor: Object.freeze({ resourceKey: "stoneFloors", outputCount: 4, ingredients: Object.freeze({ stone: 2 }) }),
  woodWall: Object.freeze({ resourceKey: "woodWalls", outputCount: 2, ingredients: Object.freeze({ wood: 3 }) }),
  stoneWall: Object.freeze({ resourceKey: "stoneWalls", outputCount: 1, ingredients: Object.freeze({ stone: 1 }) }),
  stoneCube: Object.freeze({ resourceKey: "stoneCubes", outputCount: 1, ingredients: Object.freeze({ stone: 1 }) }),
  woodDoor: Object.freeze({ resourceKey: "woodDoors", outputCount: 1, ingredients: Object.freeze({ wood: 4 }) }),
  torch: Object.freeze({ resourceKey: "torches", outputCount: 1, ingredients: Object.freeze({ wood: 1, greenJellyCubes: 1 }) }),
  testWoodSupply: Object.freeze({ resourceKey: "wood", outputCount: 100, station: "hand", ingredients: Object.freeze({}) }),
  arrows: Object.freeze({ resourceKey: "arrows", outputCount: 50, ingredients: Object.freeze({ wood: 5, stone: 1 }) }),
  healingPotion: Object.freeze({ resourceKey: "healingPotions", outputCount: 1, ingredients: Object.freeze({ whiteFlowers: 1, blueFlowers: 1 }) }),
  attackPotion: Object.freeze({ resourceKey: "attackPotions", outputCount: 1, ingredients: Object.freeze({ whiteFlowers: 2 }) }),
  magicPotion: Object.freeze({ resourceKey: "magicPotions", outputCount: 1, ingredients: Object.freeze({ blueFlowers: 2 }) })
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

function treasureRewardHash(text) {
  let hash = 2166136261 >>> 0;
  for (const char of String(text || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

// v425: chests are short-range, server-authoritative context containers with
// five generic stack slots. Only one player can own a chest context at a time.
const CHEST_CONTEXT_RANGE = 22;
const CHEST_SLOT_LIMIT = 5;
const chestContextLocks = new Map(); // chestId -> { playerId, mapId }
const chestContextByPlayer = new Map(); // playerId -> chestId
const chestInventoryById = new Map(); // chestId -> [{ token, count }]

function updateChestStructureState(structure, patch) {
  if (!structure?.id || !structure?.mapId || structure.kind !== "chest") return null;
  const cleanPatch = patch && typeof patch === "object" ? { ...patch } : {};
  const dynamic = sharedStructures.get(structure.id);
  let nextState;
  if (dynamic) { Object.assign(dynamic, cleanPatch); nextState = { ...cleanPatch }; }
  else { const state = setWorldGeneratedStructureState(structure.mapId, structure.id, cleanPatch); if (!state) return null; nextState = { ...cleanPatch }; }
  broadcastStructureState(structure, nextState); return nextState;
}

function playerNearChest(playerState, chest) {
  if (!playerState || !chest || chest.kind !== "chest" || playerState.hp <= 0) return false;
  if (playerState.mapId !== chest.mapId) return false;
  return Math.hypot(Number(playerState.x) - Number(chest.x), Number(playerState.y) - Number(chest.y)) <= CHEST_CONTEXT_RANGE;
}

function initialChestInventory(chest) {
  if (!chest?.treasure) return [];
  const hash = treasureRewardHash(`${WORLD_CONTENT.worldSeed}:${chest.id}`);
  const stacks = [
    { token: "resource:coins", count: 12 + (hash % 14) },
    { token: "resource:stone", count: 1 + ((hash >>> 8) % 3) }
  ];
  const wood = ((hash >>> 16) % 100) < 45 ? 1 + ((hash >>> 24) % 2) : 0;
  if (wood > 0) stacks.push({ token: "resource:wood", count: wood });
  return stacks;
}

function normalizeChestStacks(value) {
  const source = Array.isArray(value) ? value : value && typeof value === "object" ? Object.entries(value).map(([id, count]) => ({ token: `resource:${id}`, count })) : [];
  const merged = [];
  for (const raw of source) {
    const parts = inventoryTransferTokenParts(raw?.token);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!parts || count <= 0) continue;
    const existing = merged.find(stack => stack.token === parts.token);
    if (existing) existing.count += count;
    else if (merged.length < CHEST_SLOT_LIMIT) merged.push({ token: parts.token, count });
  }
  return merged;
}

function chestInventoryFor(chest) {
  if (!chest?.id) return [];
  let inventory = chestInventoryById.get(chest.id);
  if (!inventory) inventory = initialChestInventory(chest);
  inventory = normalizeChestStacks(inventory); chestInventoryById.set(chest.id, inventory); return inventory;
}
function chestInventoryPayload(chest) { return chestInventoryFor(chest).map(stack => ({ token: stack.token, count: stack.count })); }
function chestHasLoot(chest) { return chestInventoryFor(chest).some(stack => stack.count > 0); }
function chestLockOwner(chestId) { return chestContextLocks.get(chestId)?.playerId || null; }

function releaseChestContextForPlayer(playerId, reason = "closed", notify = true) {
  const chestId = chestContextByPlayer.get(playerId); if (!chestId) return false;
  const lock = chestContextLocks.get(chestId); chestContextByPlayer.delete(playerId);
  if (!lock || lock.playerId !== playerId) return false; chestContextLocks.delete(chestId);
  const chest = structureById(lock.mapId, chestId); if (chest?.kind === "chest") updateChestStructureState(chest, { opened: false });
  if (notify) { const socket = socketsByPlayerId.get(playerId); if (socket) sendJson(socket, { type: "chestContextClosed", chestId, reason }); }
  return true;
}
function releaseChestContextByChestId(chestId, reason = "removed") { const lock = chestContextLocks.get(chestId); return lock ? releaseChestContextForPlayer(lock.playerId, reason, true) : false; }
function validatePlayerChestContext(playerId) {
  const chestId = chestContextByPlayer.get(playerId); if (!chestId) return;
  const lock = chestContextLocks.get(chestId); const playerState = players.get(playerId); const chest = lock ? structureById(lock.mapId, chestId) : null;
  if (!lock || lock.playerId !== playerId || !playerNearChest(playerState, chest)) releaseChestContextForPlayer(playerId, "range", true);
}
function chestContextValidation(playerId, socket, chestId, failureType) {
  const playerState = players.get(playerId); const lock = chestContextLocks.get(chestId); const chest = playerState ? structureById(playerState.mapId, chestId) : null;
  if (!playerState || !lock || lock.playerId !== playerId || chestContextByPlayer.get(playerId) !== chestId) { sendJson(socket, { type: failureType, success: false, chestId, reason: "notOwner" }); return null; }
  if (!chest || !playerNearChest(playerState, chest)) { releaseChestContextForPlayer(playerId, "range", false); sendJson(socket, { type: "chestContextClosed", chestId, reason: "range" }); return null; }
  return { playerState, chest };
}

function handleChestContextOpen(playerId, socket, message) {
  const playerState = players.get(playerId); const chestId = typeof message?.chestId === "string" ? message.chestId : ""; if (!playerState || !chestId) return;
  const chest = structureById(playerState.mapId, chestId);
  if (!chest || chest.kind !== "chest" || !playerNearChest(playerState, chest)) { sendJson(socket, { type: "chestContextResult", success: false, chestId, reason: "range" }); return; }
  const previousChestId = chestContextByPlayer.get(playerId); if (previousChestId && previousChestId !== chestId) releaseChestContextForPlayer(playerId, "switch", false);
  const existingLock = chestContextLocks.get(chestId);
  if (existingLock && existingLock.playerId !== playerId) { const ownerState = players.get(existingLock.playerId); const ownerChest = structureById(existingLock.mapId, chestId); if (!playerNearChest(ownerState, ownerChest)) releaseChestContextForPlayer(existingLock.playerId, "range", true); }
  const lockAfterValidation = chestContextLocks.get(chestId); if (lockAfterValidation && lockAfterValidation.playerId !== playerId) { sendJson(socket, { type: "chestContextResult", success: false, chestId, reason: "busy" }); return; }
  chestContextLocks.set(chestId, { playerId, mapId: chest.mapId }); chestContextByPlayer.set(playerId, chestId); updateChestStructureState(chest, { opened: true });
  sendJson(socket, { type: "chestContextResult", success: true, chestId, slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(chest) });
}
function handleChestContextClose(playerId, socket, message) {
  const requestedId = typeof message?.chestId === "string" ? message.chestId : ""; const activeId = chestContextByPlayer.get(playerId) || "";
  if (!activeId || (requestedId && requestedId !== activeId)) return; releaseChestContextForPlayer(playerId, "closed", false); sendJson(socket, { type: "chestContextClosed", chestId: activeId, reason: "closed" });
}
function handleChestTakeItem(playerId, socket, message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : "";
  const parts = inventoryTransferTokenParts(message?.token); if (!chestId || !parts) return;
  const context = chestContextValidation(playerId, socket, chestId, "chestTakeResult"); if (!context) return;
  const inventory = chestInventoryFor(context.chest); const index = inventory.findIndex(stack => stack.token === parts.token);
  if (index < 0 || inventory[index].count <= 0) { sendJson(socket, { type: "chestTakeResult", success: false, chestId, token: parts.token, reason: "empty", slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(context.chest) }); return; }
  const amount = inventory[index].count; inventory.splice(index, 1);
  if (parts.type === "resource") context.playerState[parts.id] = Math.max(0, Math.floor(Number(context.playerState[parts.id]) || 0)) + amount;
  sendJson(socket, { type: "chestTakeResult", success: true, chestId, token: parts.token, amount, slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(context.chest), playerCount: transferResourcePlayerCount(context.playerState, parts.token) });
}
function handleChestStoreItem(playerId, socket, message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : ""; const parts = inventoryTransferTokenParts(message?.token); if (!chestId || !parts) return;
  const context = chestContextValidation(playerId, socket, chestId, "chestStoreResult"); if (!context) return;
  const requested = Math.max(1, Math.min(999999, Math.floor(Number(message?.count) || 1))); const inventory = chestInventoryFor(context.chest); const existing = inventory.find(stack => stack.token === parts.token);
  if (!existing && inventory.length >= CHEST_SLOT_LIMIT) { sendJson(socket, { type: "chestStoreResult", success: false, chestId, token: parts.token, reason: "full", slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(context.chest), playerCount: transferResourcePlayerCount(context.playerState, parts.token) }); return; }
  let amount = requested;
  if (parts.type === "resource") { amount = Math.min(requested, Math.max(0, Math.floor(Number(context.playerState[parts.id]) || 0))); if (amount <= 0) { sendJson(socket, { type: "chestStoreResult", success: false, chestId, token: parts.token, reason: "empty", slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(context.chest), playerCount: 0 }); return; } context.playerState[parts.id] -= amount; }
  if (existing) existing.count += amount; else inventory.push({ token: parts.token, count: amount });
  sendJson(socket, { type: "chestStoreResult", success: true, chestId, token: parts.token, amount, slotLimit: CHEST_SLOT_LIMIT, items: chestInventoryPayload(context.chest), playerCount: transferResourcePlayerCount(context.playerState, parts.token) });
}

function handleChestTakeAll(playerId, socket, message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : "";
  if (!chestId) return;
  const context = chestContextValidation(playerId, socket, chestId, "chestTakeAllResult");
  if (!context) return;

  const inventory = chestInventoryFor(context.chest);
  const transfers = [];
  for (const stack of inventory) {
    const parts = inventoryTransferTokenParts(stack?.token);
    const amount = Math.max(0, Math.floor(Number(stack?.count) || 0));
    if (!parts || amount <= 0) continue;
    if (parts.type === "resource") {
      context.playerState[parts.id] = Math.max(0, Math.floor(Number(context.playerState[parts.id]) || 0)) + amount;
    }
    transfers.push({
      token: parts.token,
      amount,
      playerCount: transferResourcePlayerCount(context.playerState, parts.token)
    });
  }

  inventory.splice(0, inventory.length);
  sendJson(socket, {
    type: "chestTakeAllResult",
    success: true,
    chestId,
    slotLimit: CHEST_SLOT_LIMIT,
    items: chestInventoryPayload(context.chest),
    transfers
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
  return structuresOnMap(playerState.mapId).some(structure =>
    structure?.kind === "craftingTable" &&
    Math.hypot(Number(structure.x) - Number(playerState.x), Number(structure.y) - Number(playerState.y)) <= 40
  );
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

  if (!playerState) {
    return;
  }

  // Never leave a connected client waiting forever if its recipe table and the
  // server recipe table somehow get out of sync. v415 exposed exactly this
  // failure mode with Tiger Paw.
  if (!recipe) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "invalidRecipe",
      totalWood: playerState.wood,
      totalStone: playerState.stone,
      totalArrows: playerState.arrows,
      totalWoodFloors: playerState.woodFloors,
      totalStoneFloors: playerState.stoneFloors,
      totalWoodWalls: playerState.woodWalls,
      totalStoneWalls: playerState.stoneWalls,
      totalStoneCubes: playerState.stoneCubes,
      totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes,
      totalWoodDoors: playerState.woodDoors,
      totalGreenJellyCubes: playerState.greenJellyCubes,
      totalTorches: playerState.torches,
      totalChests: playerState.chests,
      totalCraftingTables: playerState.craftingTables
    });
    return;
  }

  const validBench = recipe.station === "hand" || playerNearAuthorizedCraftingTable(playerState);

  if (!validBench) {
    sendJson(socket, {
      type: "craftResult",
      recipe: recipeId,
      success: false,
      reason: "tooFar",
      totalWood: playerState.wood,
      totalArrows: playerState.arrows,
      totalWoodFloors: playerState.woodFloors,
      totalStoneFloors: playerState.stoneFloors,
      totalWoodWalls: playerState.woodWalls,
      totalStoneWalls: playerState.stoneWalls,
      totalStoneCubes: playerState.stoneCubes,
      totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes,
      totalWoodDoors: playerState.woodDoors,
      totalGreenJellyCubes: playerState.greenJellyCubes,
      totalTorches: playerState.torches,
      totalChests: playerState.chests,
      totalCraftingTables: playerState.craftingTables
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
      totalArrows: playerState.arrows,
      totalWoodFloors: playerState.woodFloors,
      totalStoneFloors: playerState.stoneFloors,
      totalWoodWalls: playerState.woodWalls,
      totalStoneWalls: playerState.stoneWalls,
      totalStoneCubes: playerState.stoneCubes,
      totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes,
      totalWoodDoors: playerState.woodDoors,
      totalGreenJellyCubes: playerState.greenJellyCubes,
      totalTorches: playerState.torches,
      totalChests: playerState.chests,
      totalCraftingTables: playerState.craftingTables
    });
    return;
  }

  for (const [key, amount] of Object.entries(ingredients)) {
    playerState[key] = Math.max(0, (Number(playerState[key]) || 0) - amount);
  }

  if (recipe.resourceKey) {
    playerState[recipe.resourceKey] +=
      Math.max(1, Number(recipe.outputCount) || 1);
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
    totalMagicPotions: playerState.magicPotions,
    totalWoodFloors: playerState.woodFloors,
    totalStoneFloors: playerState.stoneFloors,
    totalWoodWalls: playerState.woodWalls,
    totalStoneWalls: playerState.stoneWalls,
    totalStoneCubes: playerState.stoneCubes,
    totalStoneArches: playerState.stoneArches, totalRopes: playerState.ropes,
    totalWoodDoors: playerState.woodDoors,
    totalGreenJellyCubes: playerState.greenJellyCubes,
    totalTorches: playerState.torches,
    totalChests: playerState.chests,
    totalCraftingTables: playerState.craftingTables
  });
}

const HEALING_POTION_COOLDOWN_MS = 15000;
const BUFF_POTION_COOLDOWN_MS = 1000;
const POTION_BUFF_MS = 300000;

function potionCooldownUntilForItem(playerState, item) {
  if (item === "healingPotion") return Number(playerState.healingPotionCooldownUntil) || 0;
  if (item === "attackPotion") return Number(playerState.attackPotionCooldownUntil) || 0;
  if (item === "magicPotion") return Number(playerState.magicPotionCooldownUntil) || 0;
  return 0;
}

function setPotionCooldown(playerState, item, now) {
  if (item === "healingPotion") {
    playerState.healingPotionCooldownUntil = now + HEALING_POTION_COOLDOWN_MS;
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
    healingPotionCooldownUntil: playerState.healingPotionCooldownUntil,
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
  else if (potionCooldownUntilForItem(playerState, item) > now) reason = "cooldown";
  else if ((Number(playerState[inventoryKey]) || 0) <= 0) reason = "empty";
  else if (item === "healingPotion" && playerState.hp >= playerState.maxHp) reason = "fullHp";
  if (reason) {
    sendJson(socket, { type: "consumableUseResult", success: false, item, reason, ...consumableStatePayload(playerState) });
    return;
  }
  playerState[inventoryKey] -= 1;
  setPotionCooldown(playerState, item, now);
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

const TIGER_PAW_WEAPON_INDEX = 13;

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
      hat_arcanist: Object.freeze({ price: 25, level: 10 }),
      shirt_arcanist: Object.freeze({ price: 40, level: 10 }),
      pants_arcanist: Object.freeze({ price: 30, level: 10 }),
      hat_jester: Object.freeze({ price: 30, level: 20 }),
      shirt_jester: Object.freeze({ price: 45, level: 20 }),
      pants_jester: Object.freeze({ price: 35, level: 20 })
    })
  })
});

// Equipment tokens allowed in shared inventory/chest transfers. Vendor
// availability is defined separately by SHOP_VENDOR_CATALOGS.
const TRANSFERABLE_EQUIPMENT_ITEM_IDS = new Set([
  "weapon_sword", "weapon_axe", "weapon_bow", "weapon_dreamcatcher",
  "weapon_shepherdStaff", "weapon_lostKey", "weapon_hugeSunflower", "weapon_sapgemWand", "weapon_pickaxe", "weapon_tigerPaw",
  "hat_original", "hat_blueCap", "hat_wizard", "hat_jester", "hat_ninja", "hat_knight", "hat_bandana", "hat_ranger", "hat_wood", "hat_arcanist", "hat_greencap",
  "shirt_traveler", "shirt_jester", "shirt_ninja", "shirt_knight", "shirt_ranger", "shirt_wood", "shirt_arcanist", "shirt_greencap",
  "pants_traveler", "pants_jester", "pants_ninja", "pants_knight", "pants_ranger", "pants_wood", "pants_arcanist", "pants_greencap"
]);

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

  const price = Math.max(1, Number(item.price) || 1);
  if (playerState.coins < price) {
    sendJson(socket, { type: "shopPurchaseResult", itemId, vendor: vendorId, success: false, reason: "needCoin", totalCoins: playerState.coins, price });
    return;
  }

  playerState.coins -= price;
  if (item.repeatable && item.resourceKey === "arrows") {
    playerState.arrows += Math.max(1, Number(item.outputCount) || 1);
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

  const reach = 26;

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
    ) <= halfArc &&
    serverLineOfEffectClear(
      playerState.mapId,
      playerState.x,
      playerState.y - 8,
      entity.x,
      entity.y - targetOffsetY,
      1,
      {
        ignoreStructureId:
          (BUILD_WALL_KINDS.has(entity?.kind) || ["woodDoor", "caveDoor"].includes(entity?.kind) || entity?.kind === "stoneCube")
            ? entity.id
            : null
      }
    )
  );
}

function igniteEnvironmentEntity(entity, sourcePlayerId = null) {
  if (!entity) return false;
  if (entity.kind === "rock") return false;

  if (entity.kind === "tree") {
    if (
      entity.fireImmune ||
      entity.removed ||
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

    if (!applyServerPlayerBurn(
      playerState,
      {
        duration: STATUS_RULES.playerBurnDuration,
        sourcePlayerId: sourcePlayerId || null
      }
    )) {
      continue;
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
    scheduleRockRegrow(rock);
    spawnRockStoneDrops(rock);

  }

  markEnvironmentDirty(rock, true);
  return rock.depleted;
}

function playerCarriesHurlEnemy(playerId) {
  return Boolean(
    playerId &&
    allSharedEnemies().some(enemy => enemy.carriedBy === playerId)
  );
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
        entity.removeAt = now + TREE_STUMP_VISIBLE_MS;
        scheduleTreeReseed(entity);

        spawnSharedResource(
          entity.mapId,
          "wood",
          entity.x +
            entity.fallDirection * 14,
          entity.y - 1
        );

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

        if (entity.kind === "flower") {
          entity.looted = true;
          scheduleFlowerRegrow(entity);
        }

        markEnvironmentDirty(entity);
      }
    }

    if (entity.kind === "tree" && entity.isStump && entity.removeAt > 0 && now >= entity.removeAt) {
      entity.isStump = false;
      entity.removed = true;
      entity.removeAt = 0;
      markEnvironmentDirty(entity);
      continue;
    }

    // Rare tree establishment happens only when the map is active, so sleeping
    // maps never generate background network work. Reuse the persistent tree
    // slot but move it to a new suitable point instead of respawning in place.
    if (
      entity.kind === "tree" &&
      entity.removed &&
      entity.reseedAt > 0 &&
      now >= entity.reseedAt &&
      mapHasNetworkRecipients(entity.mapId)
    ) {
      const dimensions = mapWorldDimensions(entity.mapId);
      let placed = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = 40 + Math.random() * Math.max(1, dimensions.width - 80);
        const y = 40 + Math.random() * Math.max(1, dimensions.height - 80);
        const crowded = environmentEntitiesOnMap(entity.mapId, "tree").some(other =>
          other !== entity && !other.removed && Math.hypot(other.x - x, other.y - y) < 34
        );
        if (crowded || serverPointHitsStructureWall(entity.mapId, x, y, 10)) continue;
        entity.x = Math.round(x);
        entity.y = Math.round(y);
        entity.homeX = entity.x;
        entity.homeY = entity.y;
        placed = true;
        break;
      }
      if (placed) resetTreeToFresh(entity);
      else entity.reseedAt = randomRegrowTimestamp(TREE_RESEED_MIN_MS, TREE_RESEED_MAX_MS);
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

  if (action === "digGround") {
    handleGroundDigAction(playerId, playerState, payload);
    return;
  }

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

  if (action === "hitRock") {
    if (
      entity.kind !== "rock" ||
      entity.depleted ||
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
      entity.removed ||
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
        [0],
        5,
        8,
        0.94
      )
    ) {
      return;
    }

    entity.cut = true;
    entity.burnTime = 0;
    entity.regrowAt = 0;
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
        [0],
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
        const enemy = ensureServerEnemyHurlState(
          factory(spawn)
        );

        if (typeof spawn.hurlable === "boolean") {
          enemy.hurlable = spawn.hurlable;
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
    const mapId = playerState?.mapId || WORLD_CONTENT.worldGrid?.startMapId;

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

// v378 grid-world enemy lifecycle:
//   active = a player socket is physically on the map -> full AI + replication
//   warm   = a cardinal neighbour of an active grid map -> frozen mob snapshot
//   cold   = farther away -> reset ordinary mob state once and retain no churn
// This keeps map transitions consistent without making every discovered map an
// always-on simulation or generating outbound enemy traffic for empty maps.
const gridEnemyMapLifecycle = new Map();

function gridMapCardinalDistance(mapA, mapB) {
  const a = worldGridMetaForMap(mapA);
  const b = worldGridMetaForMap(mapB);
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function occupiedGridMapIds() {
  const active = [];
  for (const mapId of ALLOWED_MAPS) {
    if (worldGridMetaForMap(mapId) && mapHasNetworkRecipients(mapId)) {
      active.push(mapId);
    }
  }
  return active;
}

function gridEnemyMapTier(mapId, activeMapIds = occupiedGridMapIds()) {
  if (!worldGridMetaForMap(mapId)) return "cold";
  if (activeMapIds.includes(mapId)) return "active";
  if (activeMapIds.some(activeMapId => gridMapCardinalDistance(mapId, activeMapId) === 1)) {
    return "warm";
  }
  return "cold";
}

function clearEnemyReplicationCachesForMap(mapId) {
  for (const enemy of allSharedEnemies()) {
    if (enemy.mapId !== mapId) continue;
    enemyMotionNetworkCache.delete(enemy.id);
    enemyStateNetworkCache.delete(enemy.id);
    enemyHealthNetworkCache.delete(enemy.id);
  }
  pendingPassiveEnemyIntents.delete(mapId);
}

function resetGridEnemiesOnMap(mapId) {
  for (const enemy of allSharedEnemies()) {
    if (enemy.mapId !== mapId) continue;
    if (enemy.type === "slime") resetServerSlime(enemy);
    else if (enemy.type === "mushroom") resetServerMushroom(enemy);
    else if (enemy.type === "crab") resetServerCrab(enemy);
    else if (enemy.type === "goblin") resetServerGoblin(enemy);
    else if (enemy.type === "ghost") resetServerGhost(enemy);
    else if (enemy.type === "bigGoldSlime") resetServerBigGoldSlime(enemy);
  }
  clearEnemyReplicationCachesForMap(mapId);
}

function refreshGridEnemyMapLifecycle() {
  const activeMapIds = occupiedGridMapIds();
  for (const mapId of ALLOWED_MAPS) {
    if (!worldGridMetaForMap(mapId)) continue;
    const nextTier = gridEnemyMapTier(mapId, activeMapIds);
    const previousTier = gridEnemyMapLifecycle.get(mapId);

    // Initial server construction already begins at clean spawn state, so only
    // reset on an actual warm/active -> cold transition.
    if (nextTier === "cold" && previousTier && previousTier !== "cold") {
      resetGridEnemiesOnMap(mapId);
    }

    gridEnemyMapLifecycle.set(mapId, nextTier);
  }
}

function enemyMapSimulationActive(mapId) {
  return Boolean(worldGridMetaForMap(mapId) && mapHasNetworkRecipients(mapId));
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
  if (enemy.nightEntering) reasons.push("nightEntering");
  if (enemy.nightFleeing) reasons.push("nightFleeing");
  if (enemy.returningHome) reasons.push("returningHome");
  if (!enemy.returningHome && enemyHasNearbyPlayer(enemy)) reasons.push("nearby");
  if (enemy.aggroTargetId) reasons.push("aggroTarget");
  if (enemy.carriedBy) reasons.push("carried");
  if ((Number(enemy.pickupTime) || 0) > 0) reasons.push("pickup");
  if ((Number(enemy.hurlTime) || 0) > 0) reasons.push("hurl");
  if ((Number(enemy.lungeTime) || 0) > 0) reasons.push("lunge");
  // Wet is a derived speed modifier. It does not promote a passive enemy into
  // the 10 Hz precise-motion stream; a changed effective speed produces one
  // new passive wander intent instead.
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

  if (payload.type === "enemyDamage") {
    noteEnemyHealthReplicated(payload.enemyId, payload.hp);
  } else if (payload.type === "enemyKilled") {
    noteEnemyHealthReplicated(payload.enemyId, 0);
  }
}

function broadcastSharedEnemyNetworkDeltas() {
  const now = Date.now();

  for (const mapId of ALLOWED_MAPS) {
    // No player on the map means there is nobody to receive enemy deltas.
    // Skip snapshot construction/serialization entirely instead of producing
    // zero-recipient traffic records for sleeping grid cells.
    if (!mapHasNetworkRecipients(mapId)) {
      pendingPassiveEnemyIntents.delete(mapId);
      continue;
    }

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

function playerIsVisibleToEnemy(playerState, mapId) {
  return Boolean(
    playerState &&
    playerState.mapId === mapId &&
    playerState.hp > 0
  );
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

  const nightNow = serverWorldIsNight();
  const relentlessNightAggro = Boolean(
    enemy.nightOnly &&
    nightNow &&
    !enemy.nightEntering &&
    !enemy.nightFleeing
  );
  const ordinaryNightHostile = Boolean(
    nightNow &&
    !enemy.nightOnly
  );

  let target = visibleAggroPlayerById(
    enemy.aggroTargetId,
    enemy.mapId,
    enemy.x,
    enemy.y
  );

  if (!target && enemy.aggroTargetId) {
    // Death, map changes, and disconnects invalidate the target immediately.
    // Distance-based escape is handled separately.
    clearEnemyAggroTarget(enemy);
  }

  if (target) {
    const targetDistance = Math.hypot(
      target.x - enemy.x,
      target.y - enemy.y
    );

    const retentionRadius = relentlessNightAggro
      ? NIGHT_ONLY_DISENGAGE_RADIUS
      : ordinaryNightHostile
        ? NIGHT_HOSTILE_DISENGAGE_RADIUS
        : ENEMY_ENGAGEMENT_RADIUS;

    if (targetDistance <= retentionRadius) {
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

  if (
    !target &&
    allowAcquire &&
    (enemyUsesProximityAggro(enemy) || relentlessNightAggro || ordinaryNightHostile)
  ) {
    const acquireRadius = relentlessNightAggro
      ? NIGHT_ONLY_DETECTION_RADIUS
      : ordinaryNightHostile
        ? NIGHT_HOSTILE_DETECTION_RADIUS
        : Math.max(0, Number(enemy.detectionRadius) || 0);
    const nearby = nearestVisiblePlayer(
      enemy.mapId,
      enemy.x,
      enemy.y,
      acquireRadius
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

  enemy.knockbackX = 0;
  enemy.knockbackY = 0;
  clearServerEnemyStatuses(enemy);

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

  clearServerEnemyHurlState(ghost);
  ghost.lastDamagePlayerId = null;
}

function handleAuthoritativePlayerDeath(target) {
  if (!target || target.isDead) return;

  target.isDead = true;
  target.hp = 0;
  clearServerPlayerBurn(target);
  target.wetTime = 0;
  resetServerPlayerPresentationState(target);
  releaseChestContextForPlayer(target.id, "death", true);

  // Rain visuals, carried enemies, and enemy targeting
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
  const cooldown = COMBAT_BALANCE.weaponAttackCooldown(weaponIndex);
  // Leave a small transport/frame grace while still enforcing the equipped
  // non-bow weapon's Slow / Normal / Quick cadence authoritatively.
  return Math.max(260, Math.round(cooldown * 1000) - 80);
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
  releaseChestContextForPlayer(playerId, "respawn", true);

  // Respawn changes maps outside the normal playerState map-transition path.
  // Tell observers on the death map immediately so a backgrounded tab cannot
  // retain the dead player's ghost indefinitely after that player respawns.
  if (deathMapId) {
    leavePlayerMap(playerId, deathMapId);
  }

  target.hp = target.maxHp;
  target.isDead = false;
  const respawnLoad = defaultPlayerLoadState();
  target.mapId = respawnLoad.mapId;

  // Respawn is server-authoritative and returns to the coordinate-world center.
  target.x = respawnLoad.x;
  target.y = respawnLoad.y;
  target.burnTime = 0;
  target.burnTickTimer = 0;
  target.burnDamageAccumulator = 0;
  target.burnSourcePlayerId = null;
  target.wetTime = 0;
  resetServerPlayerPresentationState(target);

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

      const wholeDamage = Math.floor(target.burnDamageAccumulator + 1e-9);
      if (wholeDamage > 0) {
        target.burnDamageAccumulator -= wholeDamage;
        applyServerPlayerDamage(target, {
          amount: wholeDamage,
          sourceType: "burn",
          sourceId: burnSourcePlayerId,
          // Burn Resistance will eventually be its own status rule. Ordinary
          // armor/magic resistance should not distort the promised % max-HP rate.
          damageType: "burn",
          contactCooldown: 0
        });
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
  clearEnemyAggroTarget(enemy);
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

  // v401: ordinary green Slimes (including the Spawn night wave) have a 30%
  // chance to drop the craft material used for portable/placeable torches.
  if (
    enemy.type === "slime" &&
    (enemy.variant || "green") === "green" &&
    Math.random() < 0.30
  ) {
    pendingDrops.push({
      kind: "resource",
      resourceKind: "greenJellyCube"
    });
  }

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
    if (!enemyMapSimulationActive(ghost.mapId)) continue;
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

    const targetPlayer = resolveEnemyAggroTarget(ghost, dt);
    const targetX = targetPlayer ? targetPlayer.x : null;
    const targetY = targetPlayer ? targetPlayer.y : null;

    if (
      ghost.wasEngaged &&
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

    if (
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
    const movementMultiplier = serverEnemyMovementMultiplier(ghost);
    ghost.x += moveX * speed * movementMultiplier * dt;
    ghost.y += moveY * speed * movementMultiplier * dt;

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
      !ghost.aggroTargetId &&
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
    if (!enemyMapSimulationActive(goblin.mapId)) continue;
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

    tickEnemyStatuses(goblin, dt);
    if (!goblin.alive) continue;

    if (tickServerEnemyHurl(goblin, dt)) {
      continue;
    }

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
        target.mapId === goblin.mapId
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
      }

      if (goblin.lungeTime <= 0) {
        goblin.lungeTime = 0;
        goblin.attackCooldown =
          0.85 + Math.random() * 0.25;
        goblin.lungeTargetId = null;
      }
    } else {
      const targetPlayer = resolveEnemyAggroTarget(goblin, dt);
      const targetX = targetPlayer ? targetPlayer.x : null;
      const targetY = targetPlayer ? targetPlayer.y - 3 : null;

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
        goblin.attackCooldown <= 0 &&
        serverLineOfEffectClear(
          goblin.mapId,
          goblin.x,
          goblin.y - 5,
          targetPlayer.x,
          targetPlayer.y - 3,
          2
        )
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
        const move = enemyStructureChaseVector(goblin, targetX, targetY);

        moveServerGoblin(
          goblin,
          move.x,
          move.y,
          goblin.chaseSpeed,
          dt
        );

        goblin.moving = true;
        goblin.walkTime += dt;

        if (Math.abs(move.x) > 0.05) {
          goblin.dir =
            move.x >= 0 ? 1 : -1;
        }
      } else {
        // Once an engaged goblin loses its target, do not drop directly into
        // passive wandering from an arbitrary combat coordinate. The strict
        // return state owns the trip home and remains precisely replicated.
        if (
          goblin.wasEngaged &&
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
  if (![0, 1, 8, 9, 10, 11, 12].includes(playerState.weaponIndex)) {
    return false;
  }

  const reach = 26;

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
    ) <= 0.90 &&
    serverLineOfEffectClear(
      playerState.mapId,
      playerState.x,
      playerState.y - 8,
      enemy.x,
      enemy.y + targetOffsetY,
      1
    )
  );
}

function calculateServerPlayerDamage(
  playerState,
  enemy,
  source,
  critical = false
) {
  const baseDamage = COMBAT_BALANCE.calculateDamage({
    source,
    weaponIndex: playerState.weaponIndex,
    playerLevel: playerState.level || 1,
    monsterType: enemy.type,
    monsterLevel: enemy.level || 1,
    critical
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
  if (playerState.weaponIndex !== 2) return 0;

  const impactX = Number(payload.x);
  const impactY = Number(payload.y);
  if (!Number.isFinite(impactX) || !Number.isFinite(impactY)) return 0;

  // Fireball's selected landing point is at most 150px away, but the caster
  // can keep moving while the projectile is airborne. This is validation grace,
  // not the blast radius.
  if (Math.hypot(impactX - playerState.x, impactY - playerState.y) > 220) return 0;
  if (!serverLineOfEffectClear(
    mapId,
    playerState.x,
    playerState.y - 8,
    impactX,
    impactY,
    1
  )) return 0;

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
    const splashStartX = impactX + (bodyX - impactX) * 0.12;
    const splashStartY = impactY + (bodyY - impactY) * 0.12;
    if (!serverLineOfEffectClear(mapId, splashStartX, splashStartY, bodyX, bodyY, 0.5)) continue;
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
        false
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
  } else if (source === "basic") {
    if (
      ![2, 3, 8, 9, 10, 12].includes(playerState.weaponIndex) ||
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 190 ||
      !serverLineOfEffectClear(
        playerState.mapId,
        playerState.x,
        playerState.y - 8,
        enemy.x,
        enemy.y + (serverEnemyProfile(enemy)?.bodyOffsetY ?? -11),
        1
      )
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
      ) > arrowCharge.maxDistance + 12 ||
      !serverLineOfEffectClear(
        playerState.mapId,
        playerState.x,
        playerState.y - 8,
        enemy.x,
        enemy.y + (serverEnemyProfile(enemy)?.bodyOffsetY ?? -11),
        0.4
      )
    ) {
      return;
    }

    critical = false;

    damage = scaleArrowDamage(
      calculateServerPlayerDamage(
        playerState,
        enemy,
        "arrow",
        critical
      ),
      payload
    );

    knockback =
      serverEnemyProfile(enemy)?.damageKnockback?.arrow ?? 16;
  } else if (source === "fireball") {
    if (playerState.weaponIndex !== 2) {
      return;
    }

    if (
      Math.hypot(
        enemy.x - playerState.x,
        enemy.y - playerState.y
      ) > 260 ||
      !serverLineOfEffectClear(
        playerState.mapId,
        playerState.x,
        playerState.y - 8,
        enemy.x,
        enemy.y + (serverEnemyProfile(enemy)?.bodyOffsetY ?? -11),
        1
      )
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

    setEnemyAggroTarget(
      enemy,
      playerId
    );
    enemy.lastDamagePlayerId = playerId;

    if (source === "fireball") {
      // Fireball impact and On-Fire both use the same equipment-power damage
      // pipeline. Burn ticks twice per second at a fixed fraction of Magic Power.
      const burnDamagePerTick = Math.max(
        1,
        calculateServerPlayerDamage(
          currentPlayerState,
          enemy,
          "fireballBurnTick",
          false
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
  slime.outOfCombatTime = 0;
  slime.wanderAngle =
    Math.random() * Math.PI * 2;
  slime.wanderTimer =
    0.9 + Math.random() * 1.4;
  slime.burnTime = 0;
  slime.burnTickTimer = 0;
  slime.knockbackX = 0;
  slime.knockbackY = 0;
  clearServerEnemyHurlState(slime);
  slime.lastDamagePlayerId = null;
}


function tickSharedBigGoldSlimes(dt) {
  for (const slime of sharedBigGoldSlimes) {
    if (!enemyMapSimulationActive(slime.mapId)) continue;
    if (!slime.alive) {
      slime.respawnTime -= dt;

      if (slime.respawnTime <= 0) {
        resetServerBigGoldSlime(slime);
      }

      continue;
    }

    tickEnemyStatuses(slime, dt);
    if (!slime.alive) continue;

    const targetPlayer = resolveEnemyAggroTarget(slime, dt);
    const targetX = targetPlayer ? targetPlayer.x : null;
    const targetY = targetPlayer ? targetPlayer.y : null;

    const homeDx = slime.homeX - slime.x;
    const homeDy = slime.homeY - slime.y;
    const distanceFromHome =
      Math.hypot(homeDx, homeDy);

    const stillInCombat =
      Boolean(slime.aggroTargetId) ||
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

    if (
      targetX !== null &&
      targetY !== null
    ) {
      const move = enemyStructureChaseVector(slime, targetX, targetY);
      moveX = move.x;
      moveY = move.y;
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
    spawnOnlyWhileBigGoldDead = false,
    nightOnly = false,
    nightPoolIndex = 0
  } = spawn;

  // Runtime-generated night slimes are registered up front so clients can learn
  // their compact network ids, but they remain dormant until NIGHT begins.
  const startsDormant = Boolean(nightOnly);

  // Gold babies are den predators: unlike ordinary slimes they acquire nearby
  // living players without waiting to be struck first.
  const aggressiveByDefault =
    Boolean(aggressiveOnSight) ||
    Boolean(nightOnly) ||
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
    nightOnly: Boolean(nightOnly),
    nightPoolIndex: Math.max(0, Math.floor(Number(nightPoolIndex) || 0)),
    nightEntering: false,
    nightFleeing: false,
    nightEntryTargetX: x,
    nightEntryTargetY: y,
    nightExitTargetX: x,
    nightExitTargetY: y,

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
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,

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

    // Tiger Paw carry/throw state.
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
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,


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
  crab.wasEngaged = false;
  crab.returningHome = false;
  crab.returnStuckTime = 0;
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
    if (!enemyMapSimulationActive(crab.mapId)) continue;
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

    tryServerCrabContact(crab);

    if (Math.abs(crab.knockbackX) > 0.1 || Math.abs(crab.knockbackY) > 0.1) {
      const nextX = crab.x + crab.knockbackX * dt;
      const nextY = crab.y + crab.knockbackY * dt;
      if (slimePositionAllowed(crab, nextX, crab.y)) crab.x = nextX;
      if (slimePositionAllowed(crab, crab.x, nextY)) crab.y = nextY;
      crab.knockbackX *= 0.82;
      crab.knockbackY *= 0.82;
    }

    const targetPlayer = resolveEnemyAggroTarget(crab, dt);
    if (targetPlayer) {
      const dx = targetPlayer.x - crab.x;
      const dy = targetPlayer.y - crab.y;
      if (Math.hypot(dx, dy) > 1) {
        const nav = enemyStructureChaseVector(crab, targetPlayer.x, targetPlayer.y);
        const move = crabMovementVector(nav.x, nav.y);
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
    wasEngaged: false,
    returningHome: false,
    returnStuckTime: 0,


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
  mushroom.wasEngaged = false;
  mushroom.returningHome = false;
  mushroom.returnStuckTime = 0;


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

  mushroom.lastDamagePlayerId = null;
}

function tryServerMushroomContact(mushroom) {
  // A sleeping mushroom is harmless until something has actually provoked it.
  // Merely walking over an idle spawn does not wake/contact-hit.
  if (
    !mushroom?.alive ||
    mushroom.carriedBy ||
    mushroom.hurlTime > 0 ||
    !mushroom.aggroTargetId
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
    if (!enemyMapSimulationActive(mushroom.mapId)) continue;
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
        const move = enemyStructureChaseVector(
          mushroom,
          targetPlayer.x,
          targetPlayer.y
        );

        moveServerSlime(
          mushroom,
          move.x,
          move.y,
          mushroom.chaseSpeed,
          dt
        );

        if (Math.abs(move.x) > 0.05) {
          mushroom.dir =
            move.x >= 0 ? 1 : -1;
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
    // creature stays planted at its deterministic world spawn and sleeps.
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




function mapPointAllowed(
  mapId,
  x,
  y,
  padding = 0,
  { allowWater = false, ignoreStructureDoors = false } = {}
) {
  const dimensions = mapWorldDimensions(mapId);

  if (
    x < 10 ||
    x > dimensions.width - 10 ||
    y < 18 ||
    y > dimensions.height - 8
  ) {
    return false;
  }

  const definition = WORLD_CONTENT.maps[mapId] || {};
  if (TERRAIN_RULES.circleCanOccupy(definition, x, y, padding, { allowWater }) !== true) {
    return false;
  }

  if (serverPointHitsStructureWall(
    mapId,
    x,
    y,
    Math.max(4, padding),
    { includeDoors: !ignoreStructureDoors }
  )) return false;

  return true;
}

function enemyMapPointAllowed(enemy, x, y, padding = 0, { navigationPlanning = false } = {}) {
  return mapPointAllowed(
    enemy.mapId,
    x,
    y,
    padding,
    {
      allowWater: serverEnemyCanEnterWater(enemy),
      // v397: AI may PLAN through a doorway so it walks to the opening, but
      // actual movement still treats a closed door as solid. A player opening
      // the door grants the brief shared passage window and the enemy can enter.
      ignoreStructureDoors: Boolean(navigationPlanning)
    }
  );
}

function enemyStructureNavigationPadding(enemy) {
  if (enemy?.type === "bigGoldSlime") return 10;
  if (enemy?.type === "goblin") return 4;
  return 6;
}

function enemyStructurePath(
  enemy,
  targetX,
  targetY,
  padding = enemyStructureNavigationPadding(enemy),
  { ignoreDoors = true } = {}
) {
  if (!enemy || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
  const mapId = enemy.mapId;
  if (!structuresOnMap(mapId).some(structure => BUILD_WALL_KINDS.has(structure?.kind))) return null;

  const grid = BUILD_GRID_SIZE;
  const snap = value => Math.round(Number(value) / grid) * grid;
  const start = { x: snap(enemy.x), y: snap(enemy.y) };
  const goal = { x: snap(targetX), y: snap(targetY) };
  const goalKey = `${goal.x},${goal.y}`;
  const cacheKey = `${goalKey}:${structureNavRevision}:${padding}:${ignoreDoors ? "door-plan" : "solid-door"}`;
  const now = Date.now();
  const cached = enemy._structureNav;

  if (
    cached?.key === cacheKey &&
    cached.expiresAt > now &&
    Array.isArray(cached.path)
  ) {
    return cached.path.length > 0 ? cached.path : null;
  }

  const minX = Math.min(start.x, goal.x) - 160;
  const maxX = Math.max(start.x, goal.x) + 160;
  const minY = Math.min(start.y, goal.y) - 160;
  const maxY = Math.max(start.y, goal.y) + 160;
  const keyFor = (x, y) => `${x},${y}`;
  const heuristic = (x, y) => Math.abs(goal.x - x) + Math.abs(goal.y - y);
  const open = [{ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) }];
  const bestG = new Map([[keyFor(start.x, start.y), 0]]);
  const parent = new Map();
  const nodes = new Map([[keyFor(start.x, start.y), start]]);
  let foundKey = null;
  let visited = 0;

  while (open.length > 0 && visited < 420) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const current = open.shift();
    const currentKey = keyFor(current.x, current.y);
    if (current.g !== bestG.get(currentKey)) continue;
    visited += 1;

    if (currentKey === goalKey) {
      foundKey = currentKey;
      break;
    }

    for (const [dx, dy] of [[grid, 0], [-grid, 0], [0, grid], [0, -grid]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (!enemyMapPointAllowed(enemy, nx, ny, padding, { navigationPlanning: ignoreDoors })) continue;
      if (!serverLineOfEffectClear(
        mapId,
        current.x,
        current.y,
        nx,
        ny,
        Math.max(1, padding - 2),
        { ignoreDoors }
      )) continue;

      const nextKey = keyFor(nx, ny);
      const nextG = current.g + grid;
      if (nextG >= (bestG.get(nextKey) ?? Infinity)) continue;
      bestG.set(nextKey, nextG);
      parent.set(nextKey, currentKey);
      nodes.set(nextKey, { x: nx, y: ny });
      open.push({ x: nx, y: ny, g: nextG, f: nextG + heuristic(nx, ny) });
    }
  }

  if (!foundKey) {
    enemy._structureNav = { key: cacheKey, expiresAt: now + 350, path: [] };
    return null;
  }

  const path = [];
  let cursor = foundKey;
  while (cursor && cursor !== keyFor(start.x, start.y)) {
    const node = nodes.get(cursor);
    if (!node) break;
    path.push(node);
    cursor = parent.get(cursor);
  }
  path.reverse();

  enemy._structureNav = {
    key: cacheKey,
    expiresAt: now + 750,
    path
  };
  return path;
}

function enemyStructureApproachSeed(enemy) {
  const text = String(enemy?.id || enemy?.type || "enemy");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function enemyOrganicStructureApproachTarget(enemy, targetX, targetY, padding) {
  if (!enemy || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
  const now = Date.now();
  const snapSize = BUILD_GRID_SIZE * 2;
  const targetKey = `${enemy.mapId}:${Math.round(targetX / snapSize)},${Math.round(targetY / snapSize)}:${structureNavRevision}`;
  const cached = enemy._structureApproach;

  if (cached?.key === targetKey && cached.expiresAt > now) {
    if (cached.mode !== "flank") return null;
    if (Math.hypot(Number(cached.x) - enemy.x, Number(cached.y) - enemy.y) <= 10) {
      enemy._structureApproach = {
        key: targetKey,
        mode: "direct",
        expiresAt: now + 900 + Math.random() * 700
      };
      return null;
    }
    return { x: cached.x, y: cached.y };
  }

  const nearbyStructure = structuresOnMap(enemy.mapId).some(structure =>
    (BUILD_WALL_KINDS.has(structure?.kind) || structure?.kind === "woodDoor") &&
    Math.hypot(Number(structure.x) - targetX, Number(structure.y) - targetY) <= 112
  );
  if (!nearbyStructure) {
    enemy._structureApproach = { key: targetKey, mode: "direct", expiresAt: now + 1800 };
    return null;
  }

  // Roughly one third of enemies keep pressing the obvious route while the
  // others periodically investigate a side/rear approach. The decision lives
  // only on the authoritative server and changes every few seconds, so this
  // produces organic movement without any extra network message type or tick.
  if (Math.random() < 0.34) {
    enemy._structureApproach = {
      key: targetKey,
      mode: "direct",
      expiresAt: now + 1400 + Math.random() * 1800
    };
    return null;
  }

  const seed = enemyStructureApproachSeed(enemy);
  const radii = [48, 64, 80];
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];
  const candidates = [];
  for (const radius of radii) {
    for (let index = 0; index < directions.length; index += 1) {
      const direction = directions[(index + seed) % directions.length];
      const scale = direction[0] !== 0 && direction[1] !== 0 ? 0.72 : 1;
      const x = targetX + direction[0] * radius * scale;
      const y = targetY + direction[1] * radius * scale;
      if (!enemyMapPointAllowed(enemy, x, y, padding, { navigationPlanning: false })) continue;

      // A flank point should actually be on the far side of some structure
      // from the player. Otherwise it is just a noisy offset inside the room.
      if (serverLineOfEffectClear(
        enemy.mapId,
        targetX,
        targetY,
        x,
        y,
        Math.max(1, padding - 2)
      )) continue;

      candidates.push({ x, y });
    }
  }

  if (!candidates.length) {
    enemy._structureApproach = {
      key: targetKey,
      mode: "direct",
      expiresAt: now + 1200 + Math.random() * 1200
    };
    return null;
  }

  const choice = candidates[(seed + Math.floor(Math.random() * candidates.length)) % candidates.length];
  enemy._structureApproach = {
    key: targetKey,
    mode: "flank",
    x: choice.x,
    y: choice.y,
    expiresAt: now + 2600 + Math.random() * 3000
  };
  return choice;
}

function enemyStructureChaseVector(enemy, targetX, targetY) {
  const dx = Number(targetX) - Number(enemy.x);
  const dy = Number(targetY) - Number(enemy.y);
  const directDistance = Math.hypot(dx, dy);
  if (directDistance <= 0.001) return { x: 0, y: 0, waypointX: targetX, waypointY: targetY };

  const padding = enemyStructureNavigationPadding(enemy);
  if (serverLineOfEffectClear(
    enemy.mapId,
    enemy.x,
    enemy.y,
    targetX,
    targetY,
    Math.max(1, padding - 2)
  )) {
    enemy._structureNav = null;
    return { x: dx / directDistance, y: dy / directDistance, waypointX: targetX, waypointY: targetY };
  }

  const organicTarget = enemyOrganicStructureApproachTarget(enemy, targetX, targetY, padding);
  const navTargetX = organicTarget?.x ?? targetX;
  const navTargetY = organicTarget?.y ?? targetY;
  const ignoreDoorsForPlan = !organicTarget;

  const navDx = navTargetX - enemy.x;
  const navDy = navTargetY - enemy.y;
  const navDistance = Math.hypot(navDx, navDy);
  if (
    organicTarget &&
    navDistance > 0.001 &&
    serverLineOfEffectClear(
      enemy.mapId,
      enemy.x,
      enemy.y,
      navTargetX,
      navTargetY,
      Math.max(1, padding - 2)
    )
  ) {
    return {
      x: navDx / navDistance,
      y: navDy / navDistance,
      waypointX: navTargetX,
      waypointY: navTargetY
    };
  }

  let path = enemyStructurePath(
    enemy,
    navTargetX,
    navTargetY,
    padding,
    { ignoreDoors: ignoreDoorsForPlan }
  );
  if (!path?.length) {
    // A speculative flank that cannot be reached immediately falls back to the
    // normal doorway-aware chase rather than freezing the enemy in place.
    if (organicTarget) {
      enemy._structureApproach = {
        key: enemy._structureApproach?.key,
        mode: "direct",
        expiresAt: Date.now() + 900
      };
      const fallback = enemyStructurePath(enemy, targetX, targetY, padding, { ignoreDoors: true });
      if (!fallback?.length) return { x: 0, y: 0, waypointX: enemy.x, waypointY: enemy.y };
      path = fallback;
    } else {
      return { x: 0, y: 0, waypointX: enemy.x, waypointY: enemy.y };
    }
  }

  // Smooth the grid path by using the farthest cached waypoint still visible.
  // Flanking paths keep closed doors solid so a side-route actually goes
  // around the house instead of silently converging on the front door again.
  let waypoint = path[0];
  for (let i = 1; i < path.length; i++) {
    const candidate = path[i];
    if (!serverLineOfEffectClear(
      enemy.mapId,
      enemy.x,
      enemy.y,
      candidate.x,
      candidate.y,
      Math.max(1, padding - 2),
      { ignoreDoors: ignoreDoorsForPlan }
    )) break;
    waypoint = candidate;
  }

  const waypointDx = waypoint.x - enemy.x;
  const waypointDy = waypoint.y - enemy.y;
  const waypointDistance = Math.hypot(waypointDx, waypointDy) || 1;
  return {
    x: waypointDx / waypointDistance,
    y: waypointDy / waypointDistance,
    waypointX: waypoint.x,
    waypointY: waypoint.y
  };
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
  slime.wasEngaged = false;
  slime.returningHome = false;
  slime.returnStuckTime = 0;


  slime.hp = slime.nightOnly ? 0 : slime.maxHp;
  slime.alive = !slime.nightOnly;
  slime.respawnTime = 0;
  slime.nightEntering = false;
  slime.nightFleeing = false;
  slime.nightFleeTime = 0;

  slime.burnTime = 0;
  slime.burnTickTimer = 0;

  slime.knockbackX = 0;
  slime.knockbackY = 0;
  clearEnemyAggroTarget(slime);

  clearServerEnemyHurlState(slime);

  slime.lastDamagePlayerId = null;
}

function chooseNightSlimeEdgeEntry(slime) {
  const dimensions = mapWorldDimensions(slime.mapId);
  const index = Math.max(0, Math.floor(Number(slime.nightPoolIndex) || 0));
  const baseSide = index % 4;

  for (let attempt = 0; attempt < 32; attempt++) {
    const side = (baseSide + attempt + Math.floor(Math.random() * 4)) % 4;
    const horizontal = side === 0 || side === 2;
    const along = horizontal
      ? 26 + Math.random() * Math.max(1, dimensions.height - 52)
      : 26 + Math.random() * Math.max(1, dimensions.width - 52);
    let insideX;
    let insideY;
    let outsideX;
    let outsideY;

    if (side === 0) { // west
      insideX = 12; insideY = along; outsideX = -10; outsideY = along;
    } else if (side === 1) { // north
      insideX = along; insideY = 20; outsideX = along; outsideY = -10;
    } else if (side === 2) { // east
      insideX = dimensions.width - 12; insideY = along; outsideX = dimensions.width + 10; outsideY = along;
    } else { // south
      insideX = along; insideY = dimensions.height - 10; outsideX = along; outsideY = dimensions.height + 10;
    }

    if (enemyMapPointAllowed(slime, insideX, insideY, 6, { navigationPlanning: true })) {
      return { insideX, insideY, outsideX, outsideY, side };
    }
  }

  return {
    insideX: 12,
    insideY: Math.max(26, Math.min(dimensions.height - 26, dimensions.height / 2)),
    outsideX: -10,
    outsideY: Math.max(26, Math.min(dimensions.height - 26, dimensions.height / 2)),
    side: 0
  };
}

function activateNightSlime(slime) {
  const entry = chooseNightSlimeEdgeEntry(slime);
  slime.homeX = entry.insideX;
  slime.homeY = entry.insideY;
  slime.x = entry.outsideX;
  slime.y = entry.outsideY;
  slime.dir = entry.insideX >= entry.outsideX ? 1 : -1;
  slime.wanderTargetX = entry.insideX;
  slime.wanderTargetY = entry.insideY;
  slime.pauseTime = 0;
  slime.wanderStuckTime = 0;
  slime.hp = slime.maxHp;
  slime.alive = true;
  slime.respawnTime = 0;
  slime.nightEntering = true;
  slime.nightFleeing = false;
  slime.nightFleeTime = 0;
  slime.nightEntryTargetX = entry.insideX;
  slime.nightEntryTargetY = entry.insideY;
  slime.aggroTargetId = null;
  slime.aggroEngagementTime = 0;
  slime.wasEngaged = false;
  slime.returningHome = false;
  slime.burnTime = 0;
  slime.burnTickTimer = 0;
  slime.knockbackX = 0;
  slime.knockbackY = 0;
  clearEnemyAggroTarget(slime);
  clearServerEnemyHurlState(slime);
}

function chooseNightSlimeExit(slime) {
  const dimensions = mapWorldDimensions(slime.mapId);
  const candidates = [
    { insideX: 12, insideY: Math.max(20, Math.min(dimensions.height - 10, slime.y)), outsideX: -12, outsideY: Math.max(20, Math.min(dimensions.height - 10, slime.y)) },
    { insideX: dimensions.width - 12, insideY: Math.max(20, Math.min(dimensions.height - 10, slime.y)), outsideX: dimensions.width + 12, outsideY: Math.max(20, Math.min(dimensions.height - 10, slime.y)) },
    { insideX: Math.max(12, Math.min(dimensions.width - 12, slime.x)), insideY: 20, outsideX: Math.max(12, Math.min(dimensions.width - 12, slime.x)), outsideY: -12 },
    { insideX: Math.max(12, Math.min(dimensions.width - 12, slime.x)), insideY: dimensions.height - 10, outsideX: Math.max(12, Math.min(dimensions.width - 12, slime.x)), outsideY: dimensions.height + 12 }
  ].filter(candidate => enemyMapPointAllowed(
    slime,
    candidate.insideX,
    candidate.insideY,
    6,
    { navigationPlanning: true }
  ));

  const pool = candidates.length ? candidates : [{
    insideX: 12, insideY: Math.max(20, Math.min(dimensions.height - 10, slime.y)),
    outsideX: -12, outsideY: Math.max(20, Math.min(dimensions.height - 10, slime.y))
  }];
  pool.sort((a, b) =>
    Math.hypot(a.insideX - slime.x, a.insideY - slime.y) -
    Math.hypot(b.insideX - slime.x, b.insideY - slime.y)
  );
  return pool[0];
}

function beginNightSlimeFlee(slime) {
  const exit = chooseNightSlimeExit(slime);
  slime.nightEntering = false;
  slime.nightFleeing = true;
  slime.nightFleeTime = 0;
  slime.nightExitInsideX = exit.insideX;
  slime.nightExitInsideY = exit.insideY;
  slime.nightExitTargetX = exit.outsideX;
  slime.nightExitTargetY = exit.outsideY;
  slime.returningHome = false;
  slime.wasEngaged = false;
  clearEnemyAggroTarget(slime);
  clearServerEnemyHurlState(slime);
}

function despawnNightSlime(slime) {
  if (!slime?.nightOnly || !slime.alive) return;
  slime.hp = 0;
  slime.alive = false;
  slime.respawnTime = 0;
  slime.nightEntering = false;
  slime.nightFleeing = false;
  slime.nightFleeTime = 0;
  clearEnemyAggroTarget(slime);
  clearServerEnemyStatuses(slime);
  clearServerEnemyHurlState(slime);
  broadcastToMap(slime.mapId, {
    type: "enemyKilled",
    enemyType: slime.type,
    enemyId: slime.id,
    mapId: slime.mapId,
    killerId: null,
    x: slime.x,
    y: slime.y,
    despawn: true
  });
}

let nightSlimeWaveNightActive = false;
let nightSlimeWaveSpawnTimer = 0;
let nightSlimeWaveHadOccupants = false;

function nightSlimePool() {
  return sharedSlimes.filter(slime =>
    slime?.nightOnly &&
    slime.mapId === NIGHT_SLIME_MAP_ID
  );
}

function activeNightSlimeCount() {
  return nightSlimePool().filter(slime => slime.alive).length;
}

function activateNextNightSlime() {
  if (activeNightSlimeCount() >= NIGHT_SLIME_CAP) return false;
  const candidate = nightSlimePool().find(slime =>
    !slime.alive &&
    (Number(slime.respawnTime) || 0) <= 0
  );
  if (!candidate) return false;
  activateNightSlime(candidate);
  return true;
}

function forceNightSlimeAggro(slime) {
  if (!slime?.alive || slime.nightEntering || slime.nightFleeing) return false;
  const nearest = nearestVisiblePlayer(
    slime.mapId,
    slime.x,
    slime.y,
    Infinity
  );
  if (!nearest) {
    clearEnemyAggroTarget(slime);
    return false;
  }
  setEnemyAggroTarget(slime, nearest.player.id);
  return true;
}

function tickNightSlimeLifecycle(dt) {
  const night = serverWorldIsNight();
  const spawnMapOccupied = mapHasNetworkRecipients(NIGHT_SLIME_MAP_ID);
  const pool = nightSlimePool();

  if (night) {
    if (!nightSlimeWaveNightActive) {
      nightSlimeWaveNightActive = true;
      nightSlimeWaveSpawnTimer = 0;
      nightSlimeWaveHadOccupants = false;
    }

    for (const slime of pool) {
      if (!slime.alive && (Number(slime.respawnTime) || 0) > 0) {
        slime.respawnTime = Math.max(0, slime.respawnTime - dt);
      }
    }

    if (spawnMapOccupied) {
      if (!nightSlimeWaveHadOccupants) {
        nightSlimeWaveHadOccupants = true;
        const needed = Math.max(
          0,
          NIGHT_SLIME_INITIAL_COUNT - activeNightSlimeCount()
        );
        for (let index = 0; index < needed; index += 1) {
          if (!activateNextNightSlime()) break;
        }
        nightSlimeWaveSpawnTimer = 0;
      } else {
        nightSlimeWaveSpawnTimer += dt;
        while (nightSlimeWaveSpawnTimer >= NIGHT_SLIME_SPAWN_INTERVAL_SECONDS) {
          nightSlimeWaveSpawnTimer -= NIGHT_SLIME_SPAWN_INTERVAL_SECONDS;
          if (!activateNextNightSlime()) {
            nightSlimeWaveSpawnTimer = Math.min(
              nightSlimeWaveSpawnTimer,
              NIGHT_SLIME_SPAWN_INTERVAL_SECONDS
            );
            break;
          }
        }
      }
    } else {
      // Do not simulate or create a hidden wave on an empty spawn map. Keep at
      // most one interval banked so a player arriving mid-night sees activity
      // promptly without a burst of many deferred spawns.
      nightSlimeWaveHadOccupants = false;
      nightSlimeWaveSpawnTimer = Math.min(
        NIGHT_SLIME_SPAWN_INTERVAL_SECONDS,
        nightSlimeWaveSpawnTimer + dt
      );
    }

    for (const slime of pool) {
      if (!slime.alive || !slime.nightEntering) continue;

      const dx = slime.nightEntryTargetX - slime.x;
      const dy = slime.nightEntryTargetY - slime.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= 0.5) {
        slime.x = slime.nightEntryTargetX;
        slime.y = slime.nightEntryTargetY;
        slime.nightEntering = false;
        forceNightSlimeAggro(slime);
        continue;
      }

      const step = Math.min(distance, slime.chaseSpeed * 1.15 * dt);
      slime.x += dx / distance * step;
      slime.y += dy / distance * step;
      if (Math.abs(dx) > 0.05) slime.dir = dx >= 0 ? 1 : -1;
    }

    return;
  }

  nightSlimeWaveNightActive = false;
  nightSlimeWaveSpawnTimer = 0;
  nightSlimeWaveHadOccupants = false;

  // Sunrise starts at 05:00, exactly when the client lighting enters DAWN.
  for (const slime of pool) {
    slime.respawnTime = 0;
    if (!slime.alive) continue;

    // Empty spawn maps can clean up immediately; occupied spawn maps get the
    // visible retreat behavior.
    if (!spawnMapOccupied) {
      despawnNightSlime(slime);
      continue;
    }

    // A slime that has not crossed onto the map yet simply disappears at dawn.
    if (slime.nightEntering) {
      despawnNightSlime(slime);
      continue;
    }

    if (!slime.nightFleeing) beginNightSlimeFlee(slime);
    slime.nightFleeTime = (Number(slime.nightFleeTime) || 0) + dt;

    const insideDx = slime.nightExitInsideX - slime.x;
    const insideDy = slime.nightExitInsideY - slime.y;
    const insideDistance = Math.hypot(insideDx, insideDy);

    if (insideDistance > 5) {
      const move = enemyStructureChaseVector(
        slime,
        slime.nightExitInsideX,
        slime.nightExitInsideY
      );
      moveServerSlime(slime, move.x, move.y, slime.chaseSpeed * 1.25, dt);
      if (Math.abs(move.x) > 0.05) slime.dir = move.x >= 0 ? 1 : -1;
    } else {
      const dx = slime.nightExitTargetX - slime.x;
      const dy = slime.nightExitTargetY - slime.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= 0.5) {
        despawnNightSlime(slime);
        continue;
      }

      const step = Math.min(distance, slime.chaseSpeed * 1.35 * dt);
      slime.x += dx / distance * step;
      slime.y += dy / distance * step;
      if (Math.abs(dx) > 0.05) slime.dir = dx >= 0 ? 1 : -1;
    }

    // If a closed structure makes the dawn route impossible, clean up after a
    // generous visible retreat window rather than leaving a stranded night mob.
    if (slime.nightFleeTime >= 8) despawnNightSlime(slime);
  }
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
    // v415: Hurl belongs to Tiger Paw and targets mobs only.
    if (playerState.weaponIndex !== TIGER_PAW_WEAPON_INDEX) return;
    if (enemy.carriedBy || enemy.hurlTime > 0) return;

    if (playerCarriesHurlEnemy(playerId)) {
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
  }
}

function tryServerSlimeContact(slime) {
  // Carry/Hurl transit suppresses ordinary touch damage while the mob is in transit.
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
    if (!enemyMapSimulationActive(slime.mapId)) continue;
    if (
      slime.nightOnly &&
      (
        !serverWorldIsNight() ||
        slime.nightEntering ||
        slime.nightFleeing ||
        !slime.alive
      )
    ) continue;
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
      if (slime.nightOnly && serverWorldIsNight()) {
        slime.returningHome = false;
        slime.returnStuckTime = 0;
        slime.wasEngaged = false;
        slime.homeX = slime.x;
        slime.homeY = slime.y;
        chooseServerSlimeWanderTarget(slime);
      } else {
        tickEnemyReturningHome(slime, dt);
        continue;
      }
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

    tryServerSlimeContact(slime);

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
      const move = enemyStructureChaseVector(
        slime,
        targetPlayer.x,
        targetPlayer.y
      );

      moveServerSlime(
        slime,
        move.x,
        move.y,
        slime.chaseSpeed,
        dt
      );

      if (Math.abs(move.x) > 0.05) {
        slime.dir =
          move.x >= 0 ? 1 : -1;
      }

      continue;
    }

    if (
      slime.wasEngaged &&
      !targetPlayer &&
      !slime.aggroTargetId
    ) {
      // Night-wave slimes enter from the map edge, so their spawn/home point
      // is not a meaningful territory anchor. If no valid player is currently
      // targetable (disconnect, death, hide, etc.), keep them roaming from
      // their present position instead of visibly marching back to the edge.
      // They will reacquire any visible player on the next AI tick, and dawn
      // still uses the dedicated edge-retreat lifecycle above.
      if (slime.nightOnly && serverWorldIsNight()) {
        slime.wasEngaged = false;
        slime.returningHome = false;
        slime.returnStuckTime = 0;
        slime.homeX = slime.x;
        slime.homeY = slime.y;
        chooseServerSlimeWanderTarget(slime);
      } else {
        beginEnemyReturningHome(slime);
        tickEnemyReturningHome(slime, dt);
        continue;
      }
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
  return TERRAIN_RULES.circleTouchesType(
    definition,
    x,
    y,
    Math.max(0, Number(radius) || 0),
    "water"
  );
}

function serverPointUnderAutomaticRoof(mapId, x, y) {
  if (!mapId || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return false;
  const floorX = Math.round(Number(x) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const floorY = Math.round(Number(y) / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  if (Math.abs(Number(x) - floorX) > 8 || Math.abs(Number(y) - floorY) > 8) return false;
  return roofedFloorKeysOnMap(mapId).has(buildFloorKey(floorX, floorY));
}

let mapWeatherWetRefreshTimer = 0;
const MAP_WEATHER_WET_REFRESH_SECONDS = 0.6;

function refreshServerMapWeatherWetness(dt, now = Date.now()) {
  mapWeatherWetRefreshTimer -= Math.max(0, Number(dt) || 0);
  if (mapWeatherWetRefreshTimer > 0) return;
  mapWeatherWetRefreshTimer += MAP_WEATHER_WET_REFRESH_SECONDS;

  const rainingMaps = new Set();
  for (const target of players.values()) {
    if (target.hp <= 0) continue;
    if (!rainingMaps.has(target.mapId) && serverMapIsRaining(target.mapId, now)) {
      rainingMaps.add(target.mapId);
    }
  }
  if (rainingMaps.size === 0) return;

  for (const target of players.values()) {
    if (
      target.hp > 0 &&
      rainingMaps.has(target.mapId) &&
      !serverPointUnderAutomaticRoof(target.mapId, target.x, target.y)
    ) {
      applyServerPlayerWet(target, STATUS_RULES.playerWetDuration);
    }
  }

  for (const enemy of allSharedEnemies()) {
    if (
      !enemyMapSimulationActive(enemy.mapId) ||
      !enemy.alive ||
      enemy.returningHome ||
      !rainingMaps.has(enemy.mapId) ||
      serverPointUnderAutomaticRoof(enemy.mapId, enemy.x, enemy.y)
    ) {
      continue;
    }
    const wasWet = enemy.wetTime > 0;
    applyServerEnemyWet(enemy, STATUS_RULES.enemyWetDuration);
    if (!wasWet && enemy.wetTime > 0) rainDiagnostics.enemyWetEnters += 1;
  }

  // Rain extinguishes mutable vegetation/flowers on occupied rainy maps. This
  // only dirties entities that were actually burning; there is no weather
  // heartbeat or map-wide replication stream.
  for (const mapId of rainingMaps) {
    for (const entity of environmentEntitiesOnMap(mapId)) {
      if (entity.kind === "tree") {
        if (entity.canopyBurnTime > 0) extinguishEnvironmentEntity(entity);
      } else if (entity.burnTime > 0) {
        extinguishEnvironmentEntity(entity);
      }
    }
  }
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
    if (!enemyMapSimulationActive(enemy.mapId)) continue;
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

  refreshGridEnemyMapLifecycle();
  tickNightSlimeLifecycle(dt);
  tickServerPlayerBurns(dt);
  refreshServerWaterWetness();
  refreshServerMapWeatherWetness(dt, now);
  tickServerPlayerWetTimers(dt);
  tickServerPlayerPresentation(dt);
  tickSharedSlimes(dt);
  tickSharedMushrooms(dt);
  tickSharedCrabs(dt);
  tickSharedGoblins(dt);
  tickSharedGhosts(dt);
  tickSharedBigGoldSlimes(dt);
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
  target.hurlReachTime = 0;
}

function tickServerPlayerPresentation(dt) {
  for (const target of players.values()) {
    target.attackTime = Math.max(0, (Number(target.attackTime) || 0) - dt);
    target.hurlReachTime = Math.max(0, (Number(target.hurlReachTime) || 0) - dt);
    if (target.bowDrawing) {
      target.bowDrawAmount = Math.min(1, (Number(target.bowDrawAmount) || 0) + dt / Math.max(0.05, Number(target.bowDrawDuration) || 1));
      target.bowReleaseTime = 0;
    } else if ((Number(target.bowReleaseTime) || 0) > 0) {
      target.bowReleaseTime = Math.max(0, target.bowReleaseTime - dt);
      target.bowDrawAmount = Math.max(0, (Number(target.bowDrawAmount) || 0) - dt / 0.09);
    }
  }
}

// -----------------------------------------------------------------------------
// MAP-SCOPED COMBAT / ACTION VISUAL EVENTS
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
// SERVER-AUTHORITATIVE PLAYER WET STATUS
// -----------------------------------------------------------------------------
// Weather and water still own Wet status. The retired Rain Cloud / magic-grass
// ability backend was removed in v442 after its final cast entry point vanished.
function broadcastServerPlayerWetState(target) {
  if (!target?.mapId) return;
  broadcastToMap(target.mapId, {
    type: "playerWetState",
    id: target.id,
    wetTime: Math.max(0, Number(target.wetTime) || 0)
  });
}

function applyServerPlayerWet(
  target,
  duration = STATUS_RULES.playerWetDuration
) {
  if (!target || target.hp <= 0) return false;
  const wasWet = (Number(target.wetTime) || 0) > 0;
  clearServerPlayerBurn(target);
  target.wetTime = Math.max(
    Number(target.wetTime) || 0,
    Math.max(0.1, Number(duration) || STATUS_RULES.playerWetDuration)
  );
  if (!wasWet) {
    rainDiagnostics.playerWetEnters += 1;
    broadcastServerPlayerWetState(target);
  }
  return !wasWet;
}

function clearServerPlayerWet(target) {
  if (!target || (Number(target.wetTime) || 0) <= 0) return false;
  target.wetTime = 0;
  rainDiagnostics.playerWetExits += 1;
  broadcastServerPlayerWetState(target);
  return true;
}

function tickServerPlayerWetTimers(dt) {
  for (const target of players.values()) {
    if ((Number(target.wetTime) || 0) <= 0) continue;
    target.wetTime = Math.max(0, target.wetTime - dt);
    if (target.wetTime <= 0) {
      rainDiagnostics.playerWetExits += 1;
      broadcastServerPlayerWetState(target);
    }
  }
}

function sanitizeVisualEffectPayload(
  effect,
  payload = {},
  mapId = null
) {
  if (effect === "basicProjectile") {
    return {
      projectileType:
        payload.projectileType === "shepherdStaff"
          ? "shepherdStaff"
          : payload.projectileType === "arrow"
            ? "arrow"
            : "wand",
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y"),
      vx: sanitizeVisualVelocity(payload.vx),
      vy: sanitizeVisualVelocity(payload.vy),
      life: clampNumber(payload.life, 0.1, 2.0, 1.2)
    };
  }

  if (effect === "basicProjectileImpact") {
    return {
      projectileType:
        payload.projectileType === "shepherdStaff"
          ? "shepherdStaff"
          : payload.projectileType === "arrow"
            ? "arrow"
            : "wand",
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y")
    };
  }


  if (effect === "levelUp") {
    return {
      level: clampInteger(payload.level, 1, 999, 1),
      x: sanitizeVisualPoint(payload.x, mapId, "x"),
      y: sanitizeVisualPoint(payload.y, mapId, "y")
    };
  }


  return null;
}

function clearPlayerOwnedTransientWorldState(
  playerId,
  mapId = null
) {
  for (const enemy of allSharedEnemies()) {
    if (mapId && enemy.mapId !== mapId) continue;

    if (enemy.aggroTargetId === playerId) {
      clearEnemyAggroTarget(enemy);
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
    "levelUp"
  ]);

  if (!allowedEffects.has(effect)) return;

  const payload = sanitizeVisualEffectPayload(
    effect,
    message.payload,
    playerState.mapId
  );
  if (!payload) return;


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
  const defaultMapId = WORLD_CONTENT.worldGrid?.startMapId || defaultPlayerLoadTarget().mapId;
  let requestedMapId = ALLOWED_MAPS.has(source.mapId)
    ? source.mapId
    : defaultMapId;

  const authoritativeDead = Boolean(previous && previous.hp <= 0);

  // Full state packets are the map-transition path, but in the coordinate
  // world the destination must be one cardinal neighbour. This prevents a
  // modified client from teleporting across the world grid.
  if (
    previous?.mapId &&
    requestedMapId !== previous.mapId &&
    !playerMapTransitionAllowed(previous.mapId, requestedMapId)
  ) {
    requestedMapId = previous.mapId;
  }

  // Dead players stay exactly where they fell until the explicit Respawn path.
  const mapId = authoritativeDead && previous?.mapId
    ? previous.mapId
    : requestedMapId;

  const sanitizedLevel = clampInteger(
    source.level,
    1,
    99,
    previous?.level || 1
  );
  const sanitizedWeaponIndexRaw = clampInteger(source.weaponIndex, -1, TIGER_PAW_WEAPON_INDEX, -1);
  const sanitizedWeaponIndex = [2, 3, 4, 5].includes(sanitizedWeaponIndexRaw) ? -1 : sanitizedWeaponIndexRaw;
  const sanitizedHeldBuildPiece = ["woodFloor", "stoneFloor", "woodWall", "stoneWall", "stoneCube", "caveDoor", "woodDoor", "torch", "rope", "dirt", "chest", "craftingTable"].includes(source.heldBuildPiece)
    ? source.heldBuildPiece
    : null;
  const dimensions = mapWorldDimensions(mapId);
  let sanitizedX = authoritativeDead && previous && Number.isFinite(previous.x)
    ? previous.x
    : clampNumber(source.x, 0, dimensions.width, dimensions.width / 2);
  let sanitizedY = authoritativeDead && previous && Number.isFinite(previous.y)
    ? previous.y
    : clampNumber(source.y, 0, dimensions.height, dimensions.height / 2);
  if (!authoritativeDead && previous?.mapId === mapId) {
    const startX = previous.x;
    const startY = previous.y;
    if (serverPlayerStepHitsStructureWall(id, mapId, startX, startY, sanitizedX, startY, 4)) sanitizedX = startX;
    if (serverPlayerStepHitsStructureWall(id, mapId, sanitizedX, startY, sanitizedX, sanitizedY, 4)) sanitizedY = startY;
  } else if (!authoritativeDead) {
    const safe = resolveSafePlayerSpawn(mapId, sanitizedX, sanitizedY);
    sanitizedX = safe.x;
    sanitizedY = safe.y;
  }

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

    dirt: previous && Number.isFinite(previous.dirt)
      ? previous.dirt
      : 0,

    whiteFlowers: previous && Number.isFinite(previous.whiteFlowers) ? previous.whiteFlowers : 0,
    blueFlowers: previous && Number.isFinite(previous.blueFlowers) ? previous.blueFlowers : 0,
    healingPotions: previous && Number.isFinite(previous.healingPotions) ? previous.healingPotions : 0,
    attackPotions: previous && Number.isFinite(previous.attackPotions) ? previous.attackPotions : 0,
    magicPotions: previous && Number.isFinite(previous.magicPotions) ? previous.magicPotions : 0,
    healingPotionCooldownUntil: previous && Number.isFinite(previous.healingPotionCooldownUntil) ? previous.healingPotionCooldownUntil : 0,
    attackPotionCooldownUntil: previous && Number.isFinite(previous.attackPotionCooldownUntil) ? previous.attackPotionCooldownUntil : 0,
    magicPotionCooldownUntil: previous && Number.isFinite(previous.magicPotionCooldownUntil) ? previous.magicPotionCooldownUntil : 0,
    attackPotionUntil: previous && Number.isFinite(previous.attackPotionUntil) ? previous.attackPotionUntil : 0,
    magicPotionUntil: previous && Number.isFinite(previous.magicPotionUntil) ? previous.magicPotionUntil : 0,

    goldSlimeBubbles:
      previous && Number.isFinite(previous.goldSlimeBubbles)
        ? previous.goldSlimeBubbles
        : 0,

    greenJellyCubes:
      previous && Number.isFinite(previous.greenJellyCubes)
        ? previous.greenJellyCubes
        : 0,

    arrows: previous && Number.isFinite(previous.arrows)
      ? previous.arrows
      : 0,

    woodFloors: previous && Number.isFinite(previous.woodFloors)
      ? previous.woodFloors
      : 0,

    stoneFloors: previous && Number.isFinite(previous.stoneFloors)
      ? previous.stoneFloors
      : 0,

    woodWalls: previous && Number.isFinite(previous.woodWalls)
      ? previous.woodWalls
      : 0,

    stoneWalls: previous && Number.isFinite(previous.stoneWalls)
      ? previous.stoneWalls
      : 0,

    stoneCubes: previous && Number.isFinite(previous.stoneCubes)
      ? previous.stoneCubes
      : 0,

    stoneArches: previous && Number.isFinite(previous.stoneArches)
      ? previous.stoneArches
      : 0,

    ropes: previous && Number.isFinite(previous.ropes)
      ? previous.ropes
      : 3,

    woodDoors: previous && Number.isFinite(previous.woodDoors)
      ? previous.woodDoors
      : 0,

    torches: previous && Number.isFinite(previous.torches)
      ? previous.torches
      : 0,

    chests: previous && Number.isFinite(previous.chests)
      ? previous.chests
      : 0,

    craftingTables: previous && Number.isFinite(previous.craftingTables)
      ? previous.craftingTables
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



    maxHp: previous && Number.isFinite(previous.maxHp)
      ? previous.maxHp
      : 50,

    hp: previous && Number.isFinite(previous.hp)
      ? previous.hp
      : 50,

    isDead: authoritativeDead,


    x: sanitizedX,
    y: sanitizedY,

    hatIndex: clampInteger(source.hatIndex, -1, 10, -1),
    shirtIndex: clampInteger(source.shirtIndex, -1, 7, -1),
    pantsIndex: clampInteger(source.pantsIndex, -1, 7, -1),
    charmIndex: clampInteger(source.charmIndex, -1, 0, -1),
    weaponIndex: sanitizedWeaponIndex,
    heldBuildPiece: sanitizedHeldBuildPiece,

    // Level is the only progression input used by combat.
    level: sanitizedLevel,

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
  // inventory, crafting progress, and shop purchases remain server-side.
  return {
    id: playerState.id,
    mapId: playerState.mapId,
    x: playerState.x,
    y: playerState.y,
    hp: playerState.hp,
    maxHp: playerState.maxHp,
    isDead: playerState.isDead,

    hatIndex: playerState.hatIndex,
    shirtIndex: playerState.shirtIndex,
    pantsIndex: playerState.pantsIndex,
    charmIndex: playerState.charmIndex,
    weaponIndex: playerState.weaponIndex,
    heldBuildPiece: playerState.heldBuildPiece || null,

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
  "wetTime", "burnTime",
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
  validatePlayerChestContext(id);

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
    type: "structureSnapshot",
    mapId,
    structures: structureSnapshot(mapId),
    ...worldStructureMutationSnapshot(mapId)
  });

  sendJson(socket, {
    type: "resourceSnapshot",
    mapId,
    resources: sharedResourceSnapshot(mapId)
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

  // Serve the exact resolved WORLD_CONTENT object used by this Node process so
  // the browser and authoritative server always share the same coordinate world.
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
      worldSeed: WORLD_CONTENT.worldSeed,
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
          `${WORLD_CONTENT.version}-${WORLD_CONTENT.worldSeed}`
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
    releaseChestContextForPlayer(playerId, "map", true);
    resetServerPlayerPresentationState(cleanState);
    leavePlayerMap(
      playerId,
      previousState.mapId,
      socket
    );
  }

  players.set(playerId, cleanState);
  if (!mapChanged) validatePlayerChestContext(playerId);

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
  playerState.dirt = clampInteger(resources.dirt, 0, 999999, 0);
  playerState.whiteFlowers = clampInteger(resources.whiteFlowers ?? resources.flowers, 0, 999999, 0);
  playerState.blueFlowers = clampInteger(resources.blueFlowers, 0, 999999, 0);
  playerState.healingPotions = clampInteger(resources.healingPotions, 0, 999999, 0);
  playerState.attackPotions = clampInteger(resources.attackPotions, 0, 999999, 0);
  playerState.magicPotions = clampInteger(resources.magicPotions, 0, 999999, 0);
  const now = Date.now();
  const buffs = state.buffs && typeof state.buffs === "object" ? state.buffs : {};
  playerState.attackPotionUntil = now + Math.min(POTION_BUFF_MS, clampInteger(buffs.attackRemainingMs, 0, POTION_BUFF_MS, 0));
  playerState.magicPotionUntil = now + Math.min(POTION_BUFF_MS, clampInteger(buffs.magicRemainingMs, 0, POTION_BUFF_MS, 0));
  playerState.healingPotionCooldownUntil = now + Math.min(HEALING_POTION_COOLDOWN_MS, clampInteger(
    buffs.healingPotionCooldownRemainingMs,
    0,
    HEALING_POTION_COOLDOWN_MS,
    0
  ));
  playerState.attackPotionCooldownUntil = now + Math.min(BUFF_POTION_COOLDOWN_MS, clampInteger(buffs.attackPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  playerState.magicPotionCooldownUntil = now + Math.min(BUFF_POTION_COOLDOWN_MS, clampInteger(buffs.magicPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  playerState.goldSlimeBubbles = clampInteger(resources.goldSlimeBubbles, 0, 999999, 0);
  playerState.greenJellyCubes = clampInteger(resources.greenJellyCubes, 0, 999999, 0);
  playerState.arrows = clampInteger(resources.arrows, 0, 999999, 0);
  playerState.woodFloors = clampInteger(resources.woodFloors, 0, 999999, 0);
  playerState.stoneFloors = clampInteger(resources.stoneFloors, 0, 999999, 0);
  playerState.woodWalls = clampInteger(resources.woodWalls, 0, 999999, 0);
  playerState.stoneWalls = clampInteger(resources.stoneWalls, 0, 999999, 0);
  playerState.stoneCubes = clampInteger(resources.stoneCubes ?? resources.stoneShortWalls, 0, 999999, 0);
  playerState.stoneArches = clampInteger(resources.stoneArches, 0, 999999, 0);
  playerState.ropes = clampInteger(resources.ropes, 0, 999999, 3);
  playerState.woodDoors = clampInteger(resources.woodDoors, 0, 999999, 0);
  playerState.torches = clampInteger(resources.torches, 0, 999999, 0);
  playerState.chests = clampInteger(resources.chests, 0, 999999, 0);
  playerState.craftingTables = clampInteger(resources.craftingTables, 0, 999999, 0);
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

  sendJson(socket, {
    type: "persistentStateRestored",
    coins: playerState.coins,
    wood: playerState.wood,
    stone: playerState.stone,
    dirt: playerState.dirt,
    whiteFlowers: playerState.whiteFlowers,
    blueFlowers: playerState.blueFlowers,
    healingPotions: playerState.healingPotions,
    attackPotions: playerState.attackPotions,
    magicPotions: playerState.magicPotions,
    healingPotionCooldownUntil: playerState.healingPotionCooldownUntil,
    attackPotionCooldownUntil: playerState.attackPotionCooldownUntil,
    magicPotionCooldownUntil: playerState.magicPotionCooldownUntil,
    attackPotionUntil: playerState.attackPotionUntil,
    magicPotionUntil: playerState.magicPotionUntil,
    goldSlimeBubbles: playerState.goldSlimeBubbles,
    greenJellyCubes: playerState.greenJellyCubes,
    arrows: playerState.arrows,
    woodFloors: playerState.woodFloors,
    stoneFloors: playerState.stoneFloors,
    woodWalls: playerState.woodWalls,
    stoneWalls: playerState.stoneWalls,
    stoneCubes: playerState.stoneCubes,
    stoneArches: playerState.stoneArches,
    ropes: playerState.ropes,
    woodDoors: playerState.woodDoors,
    torches: playerState.torches,
    chests: playerState.chests,
    craftingTables: playerState.craftingTables,
    beachQuestStage: playerState.beachQuestStage,
    beachQuestFirstCrabKills: playerState.beachQuestFirstCrabKills,
    beachQuestSecondCrabKills: playerState.beachQuestSecondCrabKills,
    beachQuestIcedCoffee: playerState.beachQuestIcedCoffee,
    myrtleQuestStage: playerState.myrtleQuestStage
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

    case "playerRespawn":
      handlePlayerRespawn(playerId, message);
      return;

    case "visualEffect":
      handleVisualEffect(playerId, socket, message);
      return;

    case "environmentAction":
      handleEnvironmentAction(playerId, message);
      return;

    case "resourcePickup":
      if (typeof message.resourceId === "string") {
        handleResourcePickup(playerId, message.resourceId);
      }
      return;

    case "inventoryDrop":
      handleInventoryDropRequest(playerId, socket, message);
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

    case "chestContextOpen":
      handleChestContextOpen(playerId, socket, message);
      return;
    case "chestContextClose":
      handleChestContextClose(playerId, socket, message);
      return;
    case "chestTakeItem":
      handleChestTakeItem(playerId, socket, message);
      return;
    case "chestTakeAll":
      handleChestTakeAll(playerId, socket, message);
      return;
    case "chestStoreItem":
      handleChestStoreItem(playerId, socket, message);
      return;

    case "structurePlace":
      handleStructurePlaceRequest(playerId, socket, message);
      return;

    case "structureDestroy":
      handleStructureDestroyRequest(playerId, socket, message);
      return;

    case "consumableUse":
      handleConsumableUse(playerId, socket, message);
      return;

    case "shopPurchase":
      handleShopPurchase(playerId, socket, message);
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

  const worldClock = serverWorldClockSnapshot();

  sendJson(socket, {
    type: "welcome",
    id,
    buildVersion: BUILD_VERSION,
    worldClock,
    coins: initialState.coins,
    wood: initialState.wood,
    stone: initialState.stone,
    dirt: initialState.dirt,
    whiteFlowers: initialState.whiteFlowers,
    blueFlowers: initialState.blueFlowers,
    healingPotions: initialState.healingPotions,
    attackPotions: initialState.attackPotions,
    magicPotions: initialState.magicPotions,
    healingPotionCooldownUntil: initialState.healingPotionCooldownUntil,
    attackPotionCooldownUntil: initialState.attackPotionCooldownUntil,
    magicPotionCooldownUntil: initialState.magicPotionCooldownUntil,
    attackPotionUntil: initialState.attackPotionUntil,
    magicPotionUntil: initialState.magicPotionUntil,
    goldSlimeBubbles: initialState.goldSlimeBubbles,
    arrows: initialState.arrows,
    hp: initialState.hp,
    maxHp: initialState.maxHp,
    worldContentVersion:
      WORLD_CONTENT.version,
    worldSeed: WORLD_CONTENT.worldSeed,
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
    persistentStateRestoredPlayers.delete(id);
    playerDoorPassages.delete(id);

    const previousState =
      players.get(id);

    releaseChestContextForPlayer(id, "disconnect", false);

    if (previousState?.mapId) {
      leavePlayerMap(
        id,
        previousState.mapId,
        socket
      );
    }

    players.delete(id);


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
