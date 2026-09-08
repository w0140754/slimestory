"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");

const root = path.join(__dirname, "..");
const port = 43383;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
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
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

(async () => {
  try {
    await delay(500);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcomePending = waitForMessage(socket, "welcome");
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    const welcome = await welcomePending;
    if (welcome.buildVersion !== "6-11-430") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { woodFloors: 2, woodWalls: 3 } }
    }));
    await restoredPending;

    socket.send(JSON.stringify({
      type: "playerStatePatch",
      player: { x: 96, y: 96, weaponIndex: -1, attackAimAngle: 0 }
    }));
    await delay(80);

    let pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodFloor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x: 128, y: 96 }));
    let result = await pending;
    if (!result.success) throw new Error("floor placement failed");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "south" }));
    result = await pending;
    if (!result.success) throw new Error("v384 edge wall should attach to the floor instead of occupying its cell");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 160, y: 96, edge: "north" }));
    result = await pending;
    if (result.success || result.reason !== "needsFloor") throw new Error("wall without a support floor should be rejected");

    socket.close();
    console.log("v383 compatibility smoke passed: temporary full-cell walls are retired and v384 walls require a floor edge.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
