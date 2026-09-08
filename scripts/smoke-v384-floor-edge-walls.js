"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43384;
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
    if (welcome.buildVersion !== "6-11-429") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 2, woodWalls: 3 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1, attackAimAngle: 0 } }));
    await delay(80);

    const floorIds = [];
    for (const x of [128, 144]) {
      const pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodFloor");
      socket.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x, y: 96 }));
      const result = await pending;
      if (!result.success || !result.structureId) throw new Error(`floor placement failed at ${x}`);
      floorIds.push(result.structureId);
    }

    // v418 restores internal floor-to-floor boundaries so rooms/partitions can be built.
    let pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "east" }));
    const interior = await pending;
    if (!interior.success) throw new Error(`internal floor-to-floor wall was rejected: ${JSON.stringify(interior)}`);
    const interiorWallId = interior.structureId;

    const wallBroadcastPending = waitForMessage(socket, "structurePlaced", m => m.structure?.kind === "woodWall");
    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "west" }));
    const wallResult = await pending;
    const wallBroadcast = await wallBroadcastPending;
    if (!wallResult.success) throw new Error("west perimeter wall placement failed");
    if (wallBroadcast.structure.axis !== "vertical" || wallBroadcast.structure.x !== 120 || wallBroadcast.structure.y !== 96) throw new Error("wall was not normalized to its vertical perimeter boundary");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "west" }));
    const duplicate = await pending;
    if (duplicate.success || duplicate.reason !== "blocked") throw new Error("same perimeter boundary was double-placed");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 176, y: 96, edge: "north" }));
    const orphan = await pending;
    if (orphan.success || orphan.reason !== "needsFloor") throw new Error("wall without floor was not rejected");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);
    let destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === floorIds[0]);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: floorIds[0] }));
    let destroy = await destroyPending;
    if (destroy.success || destroy.reason !== "wallAttached") throw new Error("floor with attached wall was removable");

    destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === wallResult.structureId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: wallResult.structureId }));
    destroy = await destroyPending;
    if (!destroy.success) throw new Error("attached wall could not be removed first");

    destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === interiorWallId);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: interiorWallId }));
    destroy = await destroyPending;
    if (!destroy.success) throw new Error("internal attached wall could not be removed");

    destroyPending = waitForMessage(socket, "structureDestroyResult", m => m.structureId === floorIds[0]);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: floorIds[0] }));
    destroy = await destroyPending;
    if (!destroy.success) throw new Error("floor remained blocked after all attached walls were removed");

    socket.close();
    console.log("v384 retained compatibility smoke passed under v418 rules: internal edges accept walls, boundaries normalize/dedupe, floor support is enforced, and attached walls must be removed before floors.");
  } finally { server.kill("SIGTERM"); }
})().catch(error => { console.error(error); process.exitCode = 1; });
