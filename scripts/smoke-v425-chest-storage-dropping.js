"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const path = require("path");

const root = path.join(__dirname, "..");
const port = 43425;
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
  return { socket, welcome: await welcomePending };
}

async function move(socket, mapId, x, y) {
  const snapshot = waitForMessage(socket, "snapshot", message => message.mapId === mapId);
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId, x, y, level: 1, weaponIndex: -1 }
  }));
  await snapshot;
  await delay(60);
}

async function store(socket, chestId, token, count, expectedSuccess = true) {
  const pending = waitForMessage(socket, "chestStoreResult", m => m.chestId === chestId && m.token === token);
  socket.send(JSON.stringify({ type: "chestStoreItem", chestId, token, count }));
  const result = await pending;
  if (Boolean(result.success) !== Boolean(expectedSuccess)) {
    throw new Error(`unexpected store result for ${token}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function take(socket, chestId, token) {
  const pending = waitForMessage(socket, "chestTakeResult", m => m.chestId === chestId && m.token === token);
  socket.send(JSON.stringify({ type: "chestTakeItem", chestId, token }));
  const result = await pending;
  if (!result.success) throw new Error(`unexpected take failure for ${token}: ${JSON.stringify(result)}`);
  return result;
}

(async () => {
  try {
    await delay(450);
    const client = await connect();
    if (client.welcome.buildVersion !== "6-11-431") {
      throw new Error(`unexpected welcome build ${client.welcome.buildVersion}`);
    }

    const restoredPending = waitForMessage(client.socket, "persistentStateRestored");
    client.socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: {
        resources: {
          coins: 40,
          wood: 40,
          stone: 40,
          whiteFlowers: 40,
          blueFlowers: 40,
          healingPotions: 40,
          attackPotions: 40,
          magicPotions: 40
        }
      }
    }));
    await restoredPending;

    const entry = Object.entries(WORLD_CONTENT.maps)
      .find(([, map]) => (map.structures || []).some(s => s.kind === "chest" && s.treasure));
    if (!entry) throw new Error("seed-0 fixture missing treasure chest");
    const [mapId, map] = entry;
    const chest = map.structures.find(s => s.kind === "chest" && s.treasure);

    await move(client.socket, "world_m1_p0", 384, 200);
    await move(client.socket, mapId, chest.x, chest.y);

    const openPending = waitForMessage(client.socket, "chestContextResult", m => m.chestId === chest.id);
    client.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const opened = await openPending;
    if (!opened.success || opened.slotLimit !== 5) {
      throw new Error(`basic chest did not expose five slots: ${JSON.stringify(opened)}`);
    }

    // Empty the generated treasure first so capacity checks begin from a known state.
    for (const stack of [...(opened.items || [])]) {
      await take(client.socket, chest.id, stack.token);
    }

    const fiveTokens = [
      "resource:coins",
      "resource:wood",
      "resource:stone",
      "resource:whiteFlowers",
      "resource:blueFlowers"
    ];
    let latest;
    for (const token of fiveTokens) latest = await store(client.socket, chest.id, token, 1, true);
    if ((latest.items || []).length !== 5) {
      throw new Error(`five distinct stacks did not fill five slots: ${JSON.stringify(latest)}`);
    }

    const full = await store(client.socket, chest.id, "resource:healingPotions", 1, false);
    if (full.reason !== "full" || (full.items || []).length !== 5) {
      throw new Error(`sixth distinct stack was not rejected as full: ${JSON.stringify(full)}`);
    }

    // Matching stacks merge even when every slot is occupied.
    const merged = await store(client.socket, chest.id, "resource:wood", 2, true);
    const mergedWood = (merged.items || []).find(stack => stack.token === "resource:wood");
    if ((merged.items || []).length !== 5 || mergedWood?.count !== 3) {
      throw new Error(`full chest did not merge matching stack: ${JSON.stringify(merged)}`);
    }

    const takenWood = await take(client.socket, chest.id, "resource:wood");
    if (takenWood.amount !== 3 || (takenWood.items || []).length !== 4) {
      throw new Error(`merged chest stack did not transfer back out whole: ${JSON.stringify(takenWood)}`);
    }

    // Generic world drop: server removes the requested stack, creates one shared
    // inventoryItem, and restores it exactly once when picked back up.
    const spawnPending = waitForMessage(client.socket, "resourceSpawn", m =>
      m.resource?.kind === "inventoryItem" && m.resource?.itemToken === "resource:wood" && m.resource?.itemCount === 3
    );
    const dropPending = waitForMessage(client.socket, "inventoryDropResult", m => m.token === "resource:wood");
    client.socket.send(JSON.stringify({
      type: "inventoryDrop",
      token: "resource:wood",
      count: 3,
      x: chest.x,
      y: chest.y
    }));
    const [spawned, dropped] = await Promise.all([spawnPending, dropPending]);
    if (!dropped.success || dropped.amount !== 3 || !spawned.resource?.id) {
      throw new Error(`generic world drop failed: ${JSON.stringify({ spawned, dropped })}`);
    }

    const pickupPending = waitForMessage(client.socket, "resourcePicked", m =>
      m.resourceId === spawned.resource.id && m.itemToken === "resource:wood"
    );
    client.socket.send(JSON.stringify({ type: "resourcePickup", resourceId: spawned.resource.id }));
    const picked = await pickupPending;
    if (picked.itemCount !== 3 || !Number.isFinite(picked.playerCount)) {
      throw new Error(`generic world drop did not round-trip: ${JSON.stringify(picked)}`);
    }

    client.socket.close();
    console.log("v425 chest storage + world-drop WebSocket smoke passed: five stack slots, full rejection, same-stack merge, chest take, and authoritative world-drop pickup.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
