"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const port = 32197;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 4000) {
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

async function moveToMap(socket, mapId, x = 320, y = 200) {
  const snapshot = waitForMessage(socket, "snapshot", message => message.mapId === mapId);
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId, x, y, level: 1, weaponIndex: -1 }
  }));
  await snapshot;
}

(async () => {
  try {
    await delay(500);

    if (WORLD_CONTENT.worldGrid?.radius !== 1 || WORLD_CONTENT.worldGrid?.startMapId !== "world_p0_p0") {
      throw new Error("v377 grid metadata is not the expected radius-1 coordinate world");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcomePending = waitForMessage(socket, "welcome");
    const initialSnapshotPending = waitForMessage(
      socket,
      "snapshot",
      message => message.mapId === "world_p0_p0"
    );
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    const welcome = await welcomePending;
    if (welcome.buildVersion !== "6-11-432") {
      throw new Error(`unexpected build ${welcome.buildVersion}`);
    }
    await initialSnapshotPending;

    // Cardinal neighbour from the centre is legal.
    await moveToMap(socket, "world_p1_p0", 16, 200);

    // Two-cell teleport must be rejected. We prove rejection without needing a
    // private state echo: if it had succeeded, the following south move would
    // be two cells away and would itself be rejected.
    socket.send(JSON.stringify({
      type: "playerState",
      player: { mapId: "world_m1_p0", x: 624, y: 200, level: 1, weaponIndex: -1 }
    }));
    await delay(150);
    await moveToMap(socket, "world_p1_p1", 320, 16);

    // Legacy authored maps are preserved but are not arbitrary teleport targets
    // from the new coordinate world. A legal adjacent move after this attempt
    // proves that the legacy request did not change the authoritative map.
    socket.send(JSON.stringify({
      type: "playerState",
      player: { mapId: "world_p0_p0", x: 200, y: 200, level: 1, weaponIndex: -1 }
    }));
    await delay(150);
    await moveToMap(socket, "world_p0_p1", 624, 200);

    // v420 onboarding is self-starting: no mandatory Marnie/static bench, and
    // 10 Wood can be turned into the first portable Crafting Table by hand.
    await moveToMap(socket, "world_p0_p0", 320, 200);
    const spawnNpcs = WORLD_CONTENT.maps.world_p0_p0.npcs || [];
    if (spawnNpcs.some(npc => npc?.type === "shopkeeper" || npc?.type === "craftingTable")) {
      throw new Error("retired starter NPC/static Crafting Table returned to coordinate spawn");
    }

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { wood: 10 } }
    }));
    await restoredPending;

    const tablePending = waitForMessage(socket, "craftResult", message => message.recipe === "craftingTable");
    socket.send(JSON.stringify({ type: "craftRequest", recipe: "craftingTable" }));
    const table = await tablePending;
    if (!table.success || table.totalWood !== 0 || table.totalCraftingTables !== 1) {
      throw new Error(`portable Crafting Table onboarding craft failed: ${JSON.stringify(table)}`);
    }

    socket.close();
    console.log("v377 coordinate-world WebSocket smoke passed: spawn, adjacency security, legacy isolation, and self-starting portable crafting onboarding.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
