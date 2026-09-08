"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43390;
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
    if (welcome.buildVersion !== "6-11-431") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 6, woodWalls: 12, woodDoors: 1 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 104, weaponIndex: -1 } }));
    await delay(80);

    for (const y of [96, 112]) {
      for (const x of [128, 144, 160]) {
        const result = await place(socket, "woodFloor", x, y);
        if (!result.success) throw new Error(`floor placement failed at ${x},${y}: ${JSON.stringify(result)}`);
      }
    }

    // Fully enclose the 3x2 surface so automatic roof topology is already
    // complete before any interior partition is added.
    const perimeter = [
      [128, 96, "north"], [144, 96, "north"], [160, 96, "north"],
      [128, 112, "south"], [144, 112, "south"], [160, 112, "south"],
      [128, 96, "west"], [128, 112, "west"],
      [160, 96, "east"], [160, 112, "east"]
    ];
    for (const [x, y, edge] of perimeter) {
      const result = await place(socket, "woodWall", x, y, edge);
      if (!result.success) throw new Error(`perimeter wall failed ${x},${y},${edge}: ${JSON.stringify(result)}`);
    }

    // v418: roof completion no longer freezes the building. Put two internal
    // wall pieces on the shared row boundary, then a supported door between
    // them. All three boundaries are between two existing floor tiles.
    for (const x of [128, 160]) {
      const result = await place(socket, "woodWall", x, 96, "south");
      if (!result.success) throw new Error(`roofed interior wall was rejected at ${x}: ${JSON.stringify(result)}`);
    }
    const door = await place(socket, "woodDoor", 144, 96, "south");
    if (!door.success) throw new Error(`roofed interior door was rejected: ${JSON.stringify(door)}`);

    socket.close();
    console.log("v390/v418 WebSocket smoke passed: a completed roof remains editable and accepts supported internal floor-to-floor walls and doors.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
