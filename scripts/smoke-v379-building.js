"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");

const port = 32198;
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

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcome = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const message = await welcome;
  if (message.buildVersion !== "6-11-380") throw new Error(`unexpected build ${message.buildVersion}`);
  return socket;
}

(async () => {
  try {
    await delay(500);
    const owner = await connect();
    const restoredPending = waitForMessage(owner, "persistentStateRestored");
    owner.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 1, woodWalls: 1 } } }));
    await restoredPending;

    owner.send(JSON.stringify({ type: "playerStatePatch", player: { x: 96, y: 96, weaponIndex: -1, attackAimAngle: 0 } }));
    await delay(80);

    const floorPlaced = waitForMessage(owner, "structurePlaceResult", message => message.kind === "woodFloor");
    owner.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x: 128, y: 96 }));
    const floor = await floorPlaced;
    if (!floor.success || floor.totalWoodFloors !== 0) throw new Error("Wood Floor placement failed");

    const wallPlaced = waitForMessage(owner, "structurePlaceResult", message => message.kind === "woodWall");
    owner.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 160, y: 96 }));
    const wall = await wallPlaced;
    if (!wall.success || wall.totalWoodWalls !== 0) throw new Error("Wood Wall placement failed");

    const observer = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const snapshotPending = waitForMessage(observer, "structureSnapshot", message => Array.isArray(message.structures) && message.structures.length >= 2);
    await new Promise((resolve, reject) => { observer.once("open", resolve); observer.once("error", reject); });
    const snapshot = await snapshotPending;
    const kinds = new Set(snapshot.structures.map(item => item.kind));
    if (!kinds.has("woodFloor") || !kinds.has("woodWall")) throw new Error("new player did not receive placed structure snapshot");

    observer.close(); owner.close();
    console.log("v379 building WebSocket smoke passed: floor/wall placement and map-entry structure snapshot.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
