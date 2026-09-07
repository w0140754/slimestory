"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43424;
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
  const snapshot = waitForMessage(socket, "snapshot", m => m.mapId === mapId);
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId, x, y, level: 1, weaponIndex: -1 }
  }));
  await snapshot;
  await delay(60);
}

(async () => {
  try {
    await delay(450);
    const a = await connect();
    const b = await connect();
    if (a.welcome.buildVersion !== "6-11-427" || b.welcome.buildVersion !== "6-11-427") {
      throw new Error("unexpected v424 welcome");
    }

    const entry = Object.entries(WORLD_CONTENT.maps)
      .find(([, map]) => (map.structures || []).some(s => s.kind === "chest" && s.treasure));
    if (!entry) throw new Error("seed-0 fixture missing treasure chest");
    const [mapId, map] = entry;
    const chest = map.structures.find(s => s.kind === "chest" && s.treasure);

    await move(a.socket, "world_m1_p0", 384, 200);
    await move(a.socket, mapId, chest.x, chest.y);
    await move(b.socket, "world_m1_p0", 384, 200);
    await move(b.socket, mapId, chest.x, chest.y);

    // A owns the context; both clients see the physical chest open.
    const aGrantPending = waitForMessage(a.socket, "chestContextResult", m => m.chestId === chest.id);
    const bSeesOpenPending = waitForMessage(b.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === true);
    a.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const [aGrant] = await Promise.all([aGrantPending, bSeesOpenPending]);
    if (!aGrant.success || !(aGrant.items || []).length) throw new Error(`player A was not granted treasure context: ${JSON.stringify(aGrant)}`);

    // B can see the chest but cannot acquire or take from A's lock.
    const busyPending = waitForMessage(b.socket, "chestContextResult", m => m.chestId === chest.id);
    b.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const busy = await busyPending;
    if (busy.success || busy.reason !== "busy") throw new Error(`second player bypassed chest lock: ${JSON.stringify(busy)}`);

    const deniedTakePending = waitForMessage(b.socket, "chestTakeResult", m => m.chestId === chest.id);
    b.socket.send(JSON.stringify({ type: "chestTakeItem", chestId: chest.id, token: "resource:coins" }));
    const deniedTake = await deniedTakePending;
    if (deniedTake.success || deniedTake.reason !== "notOwner") throw new Error(`second player bypassed loot ownership: ${JSON.stringify(deniedTake)}`);

    // Once A closes, the world sprite closes and B can immediately own it.
    const bSeesClosedPending = waitForMessage(b.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === false);
    const aClosedPending = waitForMessage(a.socket, "chestContextClosed", m => m.chestId === chest.id);
    a.socket.send(JSON.stringify({ type: "chestContextClose", chestId: chest.id }));
    await Promise.all([bSeesClosedPending, aClosedPending]);

    const bGrantPending = waitForMessage(b.socket, "chestContextResult", m => m.chestId === chest.id);
    const aSeesReopenPending = waitForMessage(a.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === true);
    b.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const [bGrant] = await Promise.all([bGrantPending, aSeesReopenPending]);
    if (!bGrant.success) throw new Error(`lock did not transfer to player B: ${JSON.stringify(bGrant)}`);

    // Disconnecting the owner must release the lock and close the shared sprite.
    const disconnectClosePending = waitForMessage(a.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === false);
    b.socket.close();
    await disconnectClosePending;

    a.socket.close();
    console.log("v424 exclusive chest WebSocket smoke passed: single owner, busy/notOwner rejection, shared open/closed sprite, lock transfer, and disconnect release.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
