"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43392;
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
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 5, woodWalls: 8, woodDoors: 2 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 144, y: 112, weaponIndex: -1 } }));
    await delay(80);

    // Two neighboring floors: v418 deliberately allows a wall on the shared edge.
    for (const x of [128, 144]) {
      const result = await place(socket, "woodFloor", x, 96);
      if (!result.success) throw new Error(`floor placement failed at ${x},96: ${JSON.stringify(result)}`);
    }
    let result = await place(socket, "woodWall", 128, 96, "east");
    if (!result.success) throw new Error(`internal floor-to-floor wall was rejected: ${JSON.stringify(result)}`);

    // Three floors in a row create a perimeter long enough for a centered door.
    for (const x of [128, 144, 160]) {
      const existing = x !== 160 && x <= 144;
      if (existing) continue;
      const floor = await place(socket, "woodFloor", x, 128);
      if (!floor.success) throw new Error(`door-run floor failed at ${x},128: ${JSON.stringify(floor)}`);
    }
    // Need the two missing floor cells at y=128.
    for (const x of [128, 144]) {
      const floor = await place(socket, "woodFloor", x, 128);
      if (!floor.success) throw new Error(`door-run floor failed at ${x},128: ${JSON.stringify(floor)}`);
    }

    result = await place(socket, "woodDoor", 144, 128, "south");
    if (result.success || result.reason !== "doorNeedsWalls") throw new Error(`unsupported door was accepted: ${JSON.stringify(result)}`);

    for (const x of [128, 160]) {
      const wall = await place(socket, "woodWall", x, 128, "south");
      if (!wall.success) throw new Error(`flanking wall failed at ${x},128: ${JSON.stringify(wall)}`);
    }
    result = await place(socket, "woodDoor", 144, 128, "south");
    if (!result.success) throw new Error(`door with two flanking walls was rejected: ${JSON.stringify(result)}`);

    socket.close();
    console.log("v392 retained WebSocket smoke passed: internal floor-to-floor wall accepted, unsupported door rejected, and door accepted after flanking walls exist.");
  } finally { server.kill("SIGTERM"); }
})().catch(error => { console.error(error); process.exitCode = 1; });
