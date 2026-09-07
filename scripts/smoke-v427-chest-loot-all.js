"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43427;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SLIME_STORY_WORLD_SEED: "0" },
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
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcomePending = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const welcome = await welcomePending;
  if (welcome.buildVersion !== "6-11-427") throw new Error(`unexpected build ${welcome.buildVersion}`);
  return { socket, welcome };
}

async function patchPlayer(socket, player) {
  socket.send(JSON.stringify({ type: "playerStatePatch", player }));
  await delay(80);
}

async function place(socket, kind, x, y) {
  const pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === kind);
  socket.send(JSON.stringify({ type: "structurePlace", kind, x, y }));
  return pending;
}

(async () => {
  try {
    await delay(450);
    const owner = await connect();
    const restorePending = waitForMessage(owner.socket, "persistentStateRestored");
    owner.socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { wood: 20, stone: 7, woodFloors: 1, chests: 1 } }
    }));
    await restorePending;

    await patchPlayer(owner.socket, { x: 160, y: 208, weaponIndex: -1, attackAimAngle: 0 });
    const floor = await place(owner.socket, "woodFloor", 208, 208);
    if (!floor.success) throw new Error(`floor placement failed: ${JSON.stringify(floor)}`);
    const chestPlaced = await place(owner.socket, "chest", 208, 208);
    if (!chestPlaced.success || !chestPlaced.structureId) throw new Error(`chest placement failed: ${JSON.stringify(chestPlaced)}`);
    const chestId = chestPlaced.structureId;

    await patchPlayer(owner.socket, { x: 192, y: 208, weaponIndex: -1, attackAimAngle: 0.2 });
    const openPending = waitForMessage(owner.socket, "chestContextResult", m => m.chestId === chestId);
    owner.socket.send(JSON.stringify({ type: "chestContextOpen", chestId }));
    const opened = await openPending;
    if (!opened.success) throw new Error(`chest open failed: ${JSON.stringify(opened)}`);

    for (const [token, count] of [["resource:wood", 3], ["resource:stone", 2]]) {
      const storePending = waitForMessage(owner.socket, "chestStoreResult", m => m.chestId === chestId && m.token === token);
      owner.socket.send(JSON.stringify({ type: "chestStoreItem", chestId, token, count }));
      const stored = await storePending;
      if (!stored.success) throw new Error(`store failed: ${JSON.stringify(stored)}`);
    }

    const lootPending = waitForMessage(owner.socket, "chestTakeAllResult", m => m.chestId === chestId);
    owner.socket.send(JSON.stringify({ type: "chestTakeAll", chestId }));
    const looted = await lootPending;
    if (!looted.success || (looted.items || []).length !== 0) throw new Error(`loot all did not empty chest: ${JSON.stringify(looted)}`);
    const wood = (looted.transfers || []).find(t => t.token === "resource:wood");
    const stone = (looted.transfers || []).find(t => t.token === "resource:stone");
    if (!wood || wood.amount !== 3 || !stone || stone.amount !== 2) throw new Error(`loot all transfer payload wrong: ${JSON.stringify(looted)}`);
    if (wood.playerCount !== 20 || stone.playerCount !== 7) throw new Error(`loot all resource totals wrong: ${JSON.stringify(looted)}`);

    // Empty chests remain open/owned after Loot All; a second call is harmless.
    const emptyPending = waitForMessage(owner.socket, "chestTakeAllResult", m => m.chestId === chestId);
    owner.socket.send(JSON.stringify({ type: "chestTakeAll", chestId }));
    const empty = await emptyPending;
    if (!empty.success || (empty.transfers || []).length !== 0 || (empty.items || []).length !== 0) {
      throw new Error(`empty Loot All was not harmless: ${JSON.stringify(empty)}`);
    }

    owner.socket.close();
    console.log("v427 chest Loot All WebSocket smoke passed: mixed resource stacks transfer atomically, chest empties, totals restore, and empty repeat is harmless.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
