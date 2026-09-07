"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const root = path.join(__dirname, "..");
const tempServer = path.join(root, ".v407-night-hostile-smoke-server.js");
const originalServer = fs.readFileSync(path.join(root, "server.js"), "utf8");
const patchedServer = originalServer.replace(
  "const WORLD_CLOCK_START_GAME_MINUTES = 8 * 60;",
  "const WORLD_CLOCK_START_GAME_MINUTES = 22 * 60;"
);
fs.writeFileSync(tempServer, patchedServer);

const port = 32307;
const server = spawn(process.execPath, [tempServer], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 6000) {
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
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const welcome = await welcomePending;
  await snapshotPending;
  return { socket, welcome };
}

async function moveAndGetSlimes(socket, mapId, x, y) {
  const snapshotPending = waitForMessage(socket, "snapshot", m => m.mapId === mapId);
  const slimesPending = waitForMessage(socket, "enemySnapshot", m => m.mapId === mapId && m.enemyType === "slime");
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId, x, y, level: 1, weaponIndex: -1 }
  }));
  await snapshotPending;
  return slimesPending;
}

(async () => {
  const sockets = [];
  try {
    await delay(500);
    const hunter = await connectAtSpawn();
    sockets.push(hunter.socket);
    if (hunter.welcome.buildVersion !== "6-11-407") throw new Error(`unexpected build ${hunter.welcome.buildVersion}`);

    const outerMap = "world_p1_p0";
    const initial = await moveAndGetSlimes(hunter.socket, outerMap, 16, 200);
    const ordinary = (initial.enemies || []).filter(enemy =>
      enemy.alive && String(enemy.id).startsWith(`runtime:${outerMap}:slime:`)
    );
    if (!ordinary.length) throw new Error("no ordinary runtime slime available for night hostility smoke");

    const target = ordinary[0];
    // Put the player well inside the 208 px night detection radius, but not in
    // contact range, so acquisition—not collision damage—is what promotes it.
    const px = Math.max(12, Math.min(388, Number(target.x) + 150));
    const py = Math.max(12, Math.min(388, Number(target.y)));
    hunter.socket.send(JSON.stringify({
      type: "playerState",
      player: { mapId: outerMap, x: px, y: py, level: 1, weaponIndex: -1 }
    }));

    await delay(900);

    const observer = await connectAtSpawn();
    sockets.push(observer.socket);
    const observed = await moveAndGetSlimes(observer.socket, outerMap, 16, 200);
    const observedTarget = (observed.enemies || []).find(enemy => enemy.id === target.id);
    if (!observedTarget) throw new Error("target runtime slime missing from observer snapshot");
    if (!observedTarget.aggroTargetId) {
      throw new Error("ordinary runtime slime did not acquire a nearby player at night");
    }

    console.log(`v407 night-hostility smoke passed: ordinary outer-map slime acquired a player from bounded night detection (target=${target.id}).`);
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
