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
    if (welcome.buildVersion !== "6-11-390") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 2, woodWalls: 7, woodDoors: 1 } } }));
    await restoredPending;
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1 } }));
    await delay(80);

    for (const x of [128, 144]) {
      const result = await place(socket, "woodFloor", x, 96);
      if (!result.success) throw new Error(`floor placement failed at ${x}: ${JSON.stringify(result)}`);
    }

    // Enclose a 2x1 connected floor component. Its shared middle edge remains
    // empty, giving us a boundary that would normally accept a wall.
    const perimeter = [
      [128, 96, "north"], [128, 96, "south"], [128, 96, "west"],
      [144, 96, "north"], [144, 96, "south"], [144, 96, "east"]
    ];
    for (const [x, y, edge] of perimeter) {
      const result = await place(socket, "woodWall", x, y, edge);
      if (!result.success) throw new Error(`perimeter wall failed ${x},${y},${edge}: ${JSON.stringify(result)}`);
    }

    let result = await place(socket, "woodWall", 128, 96, "east");
    if (result.success || result.reason !== "roofed") {
      throw new Error(`roofed building accepted an interior wall: ${JSON.stringify(result)}`);
    }

    result = await place(socket, "woodDoor", 128, 96, "east");
    if (result.success || result.reason !== "roofed") {
      throw new Error(`roofed building accepted an interior door: ${JSON.stringify(result)}`);
    }

    socket.close();
    console.log("v390 roof-lock WebSocket smoke passed: completing a roofed 2x1 house locks later wall/door placement on its still-empty interior boundary.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
