"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43388;
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

function expectNoPlayerMove(socket, playerId, timeoutMs = 260) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", onMessage); resolve(); }, timeoutMs);
    function onMessage(raw) {
      let message; try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === "playerMove" && message.id === playerId) {
        clearTimeout(timeout); socket.off("message", onMessage);
        reject(new Error(`unexpected playerMove while door should be closed: ${JSON.stringify(message.p)}`));
      }
    }
    socket.on("message", onMessage);
  });
}

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcomePending = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return { socket, welcome: await welcomePending };
}

(async () => {
  try {
    await delay(500);
    const first = await connect();
    if (first.welcome.buildVersion !== "6-11-413") throw new Error(`unexpected build ${first.welcome.buildVersion}`);
    const restoredPending = waitForMessage(first.socket, "persistentStateRestored");
    first.socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { woodFloors: 3, woodWalls: 2, woodDoors: 1 } } }));
    await restoredPending;

    const observer = await connect();
    if (observer.welcome.buildVersion !== "6-11-413") throw new Error(`unexpected observer build ${observer.welcome.buildVersion}`);

    // Free visible testing supply is server-authoritative and only usable at the crafting table.
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 226, y: 190, weaponIndex: -1 } }));
    await delay(80);
    let pending = waitForMessage(first.socket, "craftResult", m => m.recipe === "testWoodSupply");
    first.socket.send(JSON.stringify({ type: "craftRequest", recipe: "testWoodSupply" }));
    const wood = await pending;
    if (!wood.success || wood.totalWood !== 100) throw new Error(`Test Wood grant failed: ${JSON.stringify(wood)}`);

    // Build one vertical door boundary.
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1 } }));
    await delay(80);
    for (const y of [80, 96, 112]) {
      pending = waitForMessage(first.socket, "structurePlaceResult", m => m.kind === "woodFloor");
      first.socket.send(JSON.stringify({ type: "structurePlace", kind: "woodFloor", x: 128, y }));
      const floor = await pending;
      if (!floor.success) throw new Error(`floor placement failed at y=${y}`);
    }
    for (const y of [80, 112]) {
      pending = waitForMessage(first.socket, "structurePlaceResult", m => m.kind === "woodWall");
      first.socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y, edge: "east" }));
      const flank = await pending;
      if (!flank.success) throw new Error(`door flank wall failed at y=${y}`);
    }

    pending = waitForMessage(first.socket, "structurePlaceResult", m => m.kind === "woodDoor");
    first.socket.send(JSON.stringify({ type: "structurePlace", kind: "woodDoor", x: 128, y: 96, edge: "east" }));
    const door = await pending;
    if (!door.success) throw new Error("door placement failed");

    const id = first.welcome.id;
    // Move to the west side, then deliberately step toward the adjacent door.
    let movePending = waitForMessage(observer.socket, "playerMove", m => m.id === id && Number(m.p?.[0]) === 126);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 126, y: 96 } }));
    await movePending;

    movePending = waitForMessage(observer.socket, "playerMove", m => m.id === id && Number(m.p?.[0]) === 131);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 131, y: 96 } }));
    await movePending;

    movePending = waitForMessage(observer.socket, "playerMove", m => m.id === id && Number(m.p?.[0]) === 138);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 138, y: 96 } }));
    await movePending;

    // End just outside the east side while the short crossing window is still active.
    movePending = waitForMessage(observer.socket, "playerMove", m => m.id === id && Number(m.p?.[0]) === 141);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 141, y: 96 } }));
    await movePending;

    // Once the passage expires, merely being adjacent and moving parallel must NOT reopen it.
    await delay(620);
    const noMove = expectNoPlayerMove(observer.socket, id);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 141, y: 97 } }));
    await noMove;

    // Moving away from the closed boundary remains possible.
    movePending = waitForMessage(observer.socket, "playerMove", m => m.id === id && Number(m.p?.[0]) === 142);
    first.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 142, y: 96 } }));
    await movePending;

    first.socket.close();
    observer.socket.close();
    console.log("v388 WebSocket smoke passed: Test Wood grants exactly 100, deliberate adjacent stepping opens a player door passage, and idle adjacency/parallel movement does not reopen it.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
