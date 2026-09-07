"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43397;
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
async function place(socket, kind, x, y, edge = null) {
  const pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === kind);
  socket.send(JSON.stringify({ type: "structurePlace", kind, x, y, ...(edge ? { edge } : {}) }));
  return pending;
}
(async () => {
  try {
    await delay(500);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcomePending = waitForMessage(socket, "welcome");
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const welcome = await welcomePending;
    if (welcome.buildVersion !== "6-11-419") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 2, woodWalls: 2, woodDoors: 1 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 144, y: 112, weaponIndex: -1 } }));
    await delay(80);

    for (const x of [128, 144]) {
      const result = await place(socket, "woodFloor", x, 128);
      if (!result.success) throw new Error(`floor failed: ${JSON.stringify(result)}`);
    }
    let result = await place(socket, "woodWall", 128, 128, "south");
    if (!result.success) throw new Error(`straight flank failed: ${JSON.stringify(result)}`);
    result = await place(socket, "woodWall", 144, 128, "east");
    if (!result.success) throw new Error(`rotated corner flank failed: ${JSON.stringify(result)}`);
    result = await place(socket, "woodDoor", 144, 128, "south");
    if (!result.success) throw new Error(`corner-supported door was rejected: ${JSON.stringify(result)}`);

    socket.close();
    console.log("v397 corner-door WebSocket smoke passed: one straight flank + one 90-degree corner wall supports a door.");
  } finally { server.kill("SIGTERM"); }
})().catch(error => { console.error(error); process.exitCode = 1; });
