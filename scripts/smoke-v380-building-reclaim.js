"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");

const port = 32199;
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
    if (welcome.buildVersion !== "6-11-380") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodWalls: 1 } } }));
    const restored = await restoredPending;
    if (restored.woodWalls !== 1) throw new Error("test wall did not restore into inventory");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 96, y: 96, weaponIndex: -1, attackAimAngle: 0 } }));
    await delay(80);

    const placePending = waitForMessage(socket, "structurePlaceResult", message => message.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96 }));
    const placed = await placePending;
    if (!placed.success || !placed.structureId || placed.totalWoodWalls !== 0) throw new Error("place wall step failed");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 108, y: 104, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);

    const dropPending = waitForMessage(socket, "resourceSpawn", message => message.resource?.kind === "woodWall");
    const destroyPending = waitForMessage(socket, "structureDestroyResult", message => message.structureId === placed.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: placed.structureId }));
    const [drop, destroyed] = await Promise.all([dropPending, destroyPending]);
    if (!destroyed.success || destroyed.kind !== "woodWall") throw new Error("Pickaxe did not destroy exact wall");
    if (!drop.resource?.id || drop.resource.kind !== "woodWall") throw new Error("destroyed wall did not become exact-piece ground loot");

    const pickupPending = waitForMessage(socket, "resourcePicked", message => message.resourceId === drop.resource.id);
    socket.send(JSON.stringify({ type: "resourcePickup", resourceId: drop.resource.id }));
    const picked = await pickupPending;
    if (picked.resourceKind !== "woodWall" || picked.totalWoodWalls !== 1) throw new Error("wall loot did not return to inventory");

    socket.close();
    console.log("v380 building reclaim WebSocket smoke passed: place wall -> equip/use Pickaxe -> ground drop -> pickup -> wall returns to inventory.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
