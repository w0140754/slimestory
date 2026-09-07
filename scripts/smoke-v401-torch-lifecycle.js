"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const port = 32241;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", onMessage); reject(new Error(`Timed out waiting for ${type}`)); }, timeoutMs);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timeout); socket.off("message", onMessage); resolve(message);
    }
    socket.on("message", onMessage);
  });
}

(async () => {
  try {
    await delay(500);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcomePending = waitForMessage(socket, "welcome");
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const welcome = await welcomePending;
    if (welcome.buildVersion !== "6-11-406") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { wood: 1, greenJellyCubes: 1, torches: 0 } }
    }));
    const restored = await restoredPending;
    if (restored.wood !== 1 || restored.greenJellyCubes !== 1 || restored.torches !== 0) {
      throw new Error("torch ingredients did not restore");
    }

    const defaultMapId = WORLD_CONTENT.defaultPlayerLoad?.mapId;
    const craftingTable = WORLD_CONTENT.maps?.[defaultMapId]?.npcs?.find(npc => npc?.type === "craftingTable");
    if (!craftingTable) throw new Error("default crafting table missing");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: craftingTable.x, y: craftingTable.y } }));
    await delay(80);

    const craftPending = waitForMessage(socket, "craftResult", message => message.recipe === "torch");
    socket.send(JSON.stringify({ type: "craftRequest", recipe: "torch" }));
    const crafted = await craftPending;
    if (!crafted.success || crafted.totalWood !== 0 || crafted.totalGreenJellyCubes !== 0 || crafted.totalTorches !== 1) {
      throw new Error("authoritative torch craft failed");
    }

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 96, y: 96, weaponIndex: -1, attackAimAngle: 0 } }));
    await delay(80);

    const placePending = waitForMessage(socket, "structurePlaceResult", message => message.kind === "torch");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "torch", x: 128, y: 96 }));
    const placed = await placePending;
    if (!placed.success || !placed.structureId || placed.totalTorches !== 0) throw new Error("torch placement failed");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);

    const dropPending = waitForMessage(socket, "resourceSpawn", message => message.resource?.kind === "torch");
    const destroyPending = waitForMessage(socket, "structureDestroyResult", message => message.structureId === placed.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: placed.structureId }));
    const [drop, destroyed] = await Promise.all([dropPending, destroyPending]);
    if (!destroyed.success || destroyed.kind !== "torch") throw new Error("Pickaxe did not reclaim torch");

    const pickupPending = waitForMessage(socket, "resourcePicked", message => message.resourceId === drop.resource.id);
    socket.send(JSON.stringify({ type: "resourcePickup", resourceId: drop.resource.id }));
    const picked = await pickupPending;
    if (picked.resourceKind !== "torch" || picked.totalTorches !== 1) throw new Error("torch loot did not return to inventory");

    socket.close();
    console.log("v401 torch lifecycle WebSocket smoke passed: craft -> place -> Pickaxe -> loot -> pickup.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
