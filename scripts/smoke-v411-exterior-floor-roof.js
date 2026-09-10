"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43411;
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
    if (welcome.buildVersion !== "6-11-468") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 3, woodWalls: 7 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1 } }));
    await delay(80);

    for (const x of [128, 144]) {
      const result = await place(socket, "woodFloor", x, 96);
      if (!result.success) throw new Error(`house floor placement failed at ${x}: ${JSON.stringify(result)}`);
    }
    const perimeter = [
      [128, 96, "north"], [128, 96, "south"], [128, 96, "west"],
      [144, 96, "north"], [144, 96, "south"], [144, 96, "east"]
    ];
    for (const [x, y, edge] of perimeter) {
      const result = await place(socket, "woodWall", x, y, edge);
      if (!result.success) throw new Error(`perimeter wall failed ${x},${y},${edge}: ${JSON.stringify(result)}`);
    }

    const porch = await place(socket, "woodFloor", 160, 96);
    if (!porch.success) throw new Error(`exterior floor placement failed: ${JSON.stringify(porch)}`);

    // v418 also allows editing a completed interior boundary. The topology
    // unit test continues to prove the porch remains outside the roof region;
    // this live test verifies that adding the porch does not block later edits.
    const interiorAttempt = await place(socket, "woodWall", 128, 96, "east");
    if (!interiorAttempt.success) {
      throw new Error(`completed house could not accept an internal partition after porch placement: ${JSON.stringify(interiorAttempt)}`);
    }

    socket.close();
    console.log("v411/v418 exterior-floor WebSocket smoke passed: exterior porch placement succeeds and the completed building remains editable afterward.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
