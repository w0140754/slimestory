"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const tempServer = path.join(root, ".v398-night-smoke-server.js");
const originalServer = fs.readFileSync(path.join(root, "server.js"), "utf8");
const patchedServer = originalServer
  .replace("const WORLD_CLOCK_START_GAME_MINUTES = 8 * 60;", "const WORLD_CLOCK_START_GAME_MINUTES = 20 * 60;")
  .replace("const NIGHT_SLIME_SPAWN_INTERVAL_SECONDS = 10;", "const NIGHT_SLIME_SPAWN_INTERVAL_SECONDS = 0.7;");
fs.writeFileSync(tempServer, patchedServer);

const port = 32298;
const server = spawn(process.execPath, [tempServer], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function connectAtSpawn() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcomePending = waitForMessage(socket, "welcome");
  const snapshotPending = waitForMessage(socket, "snapshot", m => m.mapId === WORLD_CONTENT.worldGrid.startMapId);
  const slimesPending = waitForMessage(socket, "enemySnapshot", m => m.mapId === WORLD_CONTENT.worldGrid.startMapId && m.enemyType === "slime");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    socket,
    welcome: await welcomePending,
    snapshot: await snapshotPending,
    slimes: await slimesPending
  };
}

async function moveToMap(socket, mapId, x, y) {
  const snapshotPending = waitForMessage(socket, "snapshot", message => message.mapId === mapId);
  const slimePending = waitForMessage(socket, "enemySnapshot", message => message.mapId === mapId && message.enemyType === "slime");
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId, x, y, level: 1, weaponIndex: -1 }
  }));
  await snapshotPending;
  return slimePending;
}

(async () => {
  const sockets = [];
  try {
    await delay(500);

    const primary = await connectAtSpawn();
    sockets.push(primary.socket);
    if (primary.welcome.buildVersion !== "6-11-424") throw new Error(`unexpected build ${primary.welcome.buildVersion}`);

    // Keep one player on Spawn so the night wave keeps advancing.
    await delay(1000);

    const observer1 = await connectAtSpawn();
    sockets.push(observer1.socket);
    const firstNight = (observer1.slimes.enemies || []).filter(enemy => String(enemy.id).startsWith("night_slime_") && enemy.alive);
    if (firstNight.length < 2) throw new Error(`expected initial night batch, saw ${firstNight.length}`);
    if (!firstNight.some(enemy => enemy.aggroTargetId)) {
      throw new Error("night slimes did not immediately acquire a Spawn player");
    }

    // The same observer can walk to an ordinary outer map. Night IDs must not
    // exist there, while normal runtime-generated coordinate mobs must.
    const outer = await moveToMap(observer1.socket, "world_p1_p0", 16, 200);
    const outerNightIds = (outer.enemies || []).filter(enemy => String(enemy.id).startsWith("night_slime_"));
    if (outerNightIds.length !== 0) throw new Error("night slimes leaked onto a non-Spawn map");
    if (!(outer.enemies || []).some(enemy => String(enemy.id).startsWith("runtime:world_p1_p0:slime:"))) {
      throw new Error("outer coordinate map did not expose runtime-generated normal slimes");
    }

    await delay(1700);

    const observer2 = await connectAtSpawn();
    sockets.push(observer2.socket);
    const laterNight = (observer2.slimes.enemies || []).filter(enemy => String(enemy.id).startsWith("night_slime_") && enemy.alive);
    if (laterNight.length <= firstNight.length) {
      throw new Error(`night population did not grow over time (${firstNight.length} -> ${laterNight.length})`);
    }
    if (laterNight.length > 8) throw new Error(`night population exceeded cap: ${laterNight.length}`);

    console.log(`v398 runtime/night smoke passed: Spawn-only night wave grew ${firstNight.length} -> ${laterNight.length}, stayed capped, aggroed immediately, and outer-map mobs were runtime-generated.`);
  } finally {
    for (const socket of sockets) {
      try { socket.close(); } catch {}
    }
    server.kill("SIGTERM");
    try { fs.unlinkSync(tempServer); } catch {}
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
