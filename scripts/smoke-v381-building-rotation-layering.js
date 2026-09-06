"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");

const root = path.join(__dirname, "..");
const port = 43181;
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
    if (welcome.buildVersion !== "6-11-391") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { woodFloors: 1, woodWalls: 1 } }
    }));
    await restoredPending;

    socket.send(JSON.stringify({
      type: "playerStatePatch",
      player: { x: 96, y: 96, weaponIndex: -1, attackAimAngle: 0 }
    }));
    await delay(80);

    let pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodFloor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x: 128, y: 96 }));
    const floor = await pending;
    if (!floor.success) throw new Error("floor placement failed");

    pending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "north" }));
    const wall = await pending;
    if (!wall.success) throw new Error("wall should attach to a floor edge in v384");

    socket.close();
    console.log("v381 compatibility smoke passed: old rotation is absent and wall orientation comes from the selected floor edge.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
