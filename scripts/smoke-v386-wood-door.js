"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43386;
const server = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function waitForMessage(socket, type, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", onMessage); reject(new Error(`Timed out waiting for ${type}`)); }, timeoutMs);
    function onMessage(raw) {
      let message; try { message = JSON.parse(raw.toString()); } catch { return; }
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
    if (welcome.buildVersion !== "6-11-391") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 1, woodWalls: 1, woodDoors: 2 } } }));
    const restored = await restoredPending;
    if (restored.woodDoors !== 2) throw new Error("Wood Door resource did not restore");
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1, attackAimAngle: 0 } }));
    await delay(80);

    let pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodFloor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x: 128, y: 96 }));
    const floor = await pending;
    if (!floor.success) throw new Error("floor placement failed");

    const doorBroadcastPending = waitForMessage(socket, "structurePlaced", m => m.structure?.kind === "woodDoor");
    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodDoor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodDoor", x: 128, y: 96, edge: "east" }));
    const door = await pending;
    const doorBroadcast = await doorBroadcastPending;
    if (!door.success || door.totalWoodDoors !== 1) throw new Error("door placement/resource decrement failed");
    if (doorBroadcast.structure.axis !== "vertical" || doorBroadcast.structure.x !== 136 || doorBroadcast.structure.y !== 96) throw new Error("door was not normalized to floor edge");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "east" }));
    const conflict = await pending;
    if (conflict.success || conflict.reason !== "blocked") throw new Error("wall was allowed on occupied door boundary");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodDoor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodDoor", x: 176, y: 96, edge: "north" }));
    const orphan = await pending;
    if (orphan.success || orphan.reason !== "needsFloor") throw new Error("orphan door was not rejected");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);
    let destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === floor.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: floor.structureId }));
    let destroy = await destroyPending;
    if (destroy.success || destroy.reason !== "wallAttached") throw new Error("supporting floor was removable with door attached");

    const removedPending = waitForMessage(socket, "structureRemoved", m => m.structureId === door.structureId);
    destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === door.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: door.structureId }));
    destroy = await destroyPending;
    await removedPending;
    if (!destroy.success || destroy.kind !== "woodDoor") throw new Error("door could not be reclaimed");

    destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === floor.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: floor.structureId }));
    destroy = await destroyPending;
    if (!destroy.success) throw new Error("floor remained blocked after door removal");

    socket.close();
    console.log("v386 Wood Door WebSocket smoke passed: edge normalization, wall/door exclusivity, floor support protection, resource sync, and Pickaxe reclaim.");
  } finally { server.kill("SIGTERM"); }
})().catch(error => { console.error(error); process.exitCode = 1; });
