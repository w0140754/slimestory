"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43426;
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
  if (welcome.buildVersion !== "6-11-471") throw new Error(`unexpected build ${welcome.buildVersion}`);
  return { socket, welcome };
}

async function patchPlayer(socket, player) {
  socket.send(JSON.stringify({ type: "playerStatePatch", player }));
  await delay(90);
}

async function place(socket, kind, x, y) {
  const pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === kind);
  socket.send(JSON.stringify({ type: "structurePlace", kind, x, y }));
  return pending;
}

async function craft(socket, recipe) {
  const pending = waitForMessage(socket, "craftResult", m => m.recipe === recipe);
  socket.send(JSON.stringify({ type: "craftRequest", recipe }));
  return pending;
}

(async () => {
  try {
    await delay(450);
    const owner = await connect();

    const restorePending = waitForMessage(owner.socket, "persistentStateRestored");
    owner.socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { wood: 30, woodFloors: 1, chests: 1 } }
    }));
    await restorePending;

    // Repeatability regression: a second Crafting Table must be an ordinary
    // successful craft, never an already-crafted/one-time result.
    const firstCraft = await craft(owner.socket, "craftingTable");
    const secondCraft = await craft(owner.socket, "craftingTable");
    if (!firstCraft.success || firstCraft.totalCraftingTables !== 1) {
      throw new Error(`first Crafting Table craft failed: ${JSON.stringify(firstCraft)}`);
    }
    if (!secondCraft.success || secondCraft.totalCraftingTables !== 2 || secondCraft.reason === "alreadyCrafted") {
      throw new Error(`second Crafting Table was not repeatable: ${JSON.stringify(secondCraft)}`);
    }

    // Put a player-built chest directly across the default 200,200 spawn footprint.
    const floor = await place(owner.socket, "woodFloor", 208, 208);
    if (!floor.success) throw new Error(`spawn-area floor failed: ${JSON.stringify(floor)}`);
    await patchPlayer(owner.socket, { x: 160, y: 208, weaponIndex: -1, attackAimAngle: 0 });
    const chestPlaced = await place(owner.socket, "chest", 208, 208);
    if (!chestPlaced.success || !chestPlaced.structureId) {
      throw new Error(`spawn-area chest failed: ${JSON.stringify(chestPlaced)}`);
    }
    const chestId = chestPlaced.structureId;

    // A new connection must be shifted away from the solid chest instead of
    // appearing at 200,200 inside its collision footprint.
    const observerSpawnPending = waitForMessage(owner.socket, "playerState", m => m.player?.id && m.player.id !== owner.welcome.id);
    const observer = await connect();
    const observerSpawn = await observerSpawnPending;
    if (Math.abs(Number(observerSpawn.player.x) - 200) < 0.01 && Math.abs(Number(observerSpawn.player.y) - 200) < 0.01) {
      throw new Error(`observer spawned inside blocked default tile: ${JSON.stringify(observerSpawn.player)}`);
    }

    // Store an item in this NON-treasure/player-built chest, close it, then try
    // to reclaim it. v425 only protected treasure chests and could delete this item.
    await patchPlayer(owner.socket, { x: 192, y: 208, weaponIndex: -1, attackAimAngle: 0.46 });
    const openPending = waitForMessage(owner.socket, "chestContextResult", m => m.chestId === chestId);
    owner.socket.send(JSON.stringify({ type: "chestContextOpen", chestId }));
    const opened = await openPending;
    if (!opened.success) throw new Error(`player-built chest did not open: ${JSON.stringify(opened)}`);

    const storePending = waitForMessage(owner.socket, "chestStoreResult", m => m.chestId === chestId && m.token === "resource:wood");
    owner.socket.send(JSON.stringify({ type: "chestStoreItem", chestId, token: "resource:wood", count: 1 }));
    const stored = await storePending;
    if (!stored.success || !(stored.items || []).some(s => s.token === "resource:wood" && s.count === 1)) {
      throw new Error(`chest storage failed: ${JSON.stringify(stored)}`);
    }

    const closePending = waitForMessage(owner.socket, "chestContextClosed", m => m.chestId === chestId);
    owner.socket.send(JSON.stringify({ type: "chestContextClose", chestId }));
    await closePending;

    await patchPlayer(owner.socket, { x: 192, y: 208, weaponIndex: 11, attackAimAngle: 0.46 });
    const destroyPending = waitForMessage(owner.socket, "structureDestroyResult", m => m.structureId === chestId);
    owner.socket.send(JSON.stringify({ type: "structureDestroy", structureId: chestId }));
    const blocked = await destroyPending;
    if (blocked.success || blocked.reason !== "lootFirst") {
      throw new Error(`non-empty player-built chest was reclaimable: ${JSON.stringify(blocked)}`);
    }

    observer.socket.close();
    owner.socket.close();
    console.log("v426 interaction/safety WebSocket smoke passed: second Crafting Table succeeds, blocked spawn shifts, and non-empty player-built chests cannot be reclaimed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
