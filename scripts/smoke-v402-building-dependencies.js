"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const PLAYER_NET_PROTOCOL = require("../public/shared/player-net-protocol.js");
const root = path.join(__dirname, "..");
const port = 32402;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 5000) {
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

async function place(socket, kind, x, y, edge = null) {
  const pending = waitForMessage(socket, "structurePlaceResult", message => message.kind === kind);
  socket.send(JSON.stringify({ type: "structurePlace", kind, x, y, ...(edge ? { edge } : {}) }));
  return pending;
}

async function destroy(socket, structureId) {
  const pending = waitForMessage(socket, "structureDestroyResult", message => message.structureId === structureId);
  socket.send(JSON.stringify({ type: "structureDestroy", structureId }));
  return pending;
}

async function setAim(socket, angle) {
  socket.send(JSON.stringify({ type: "playerAim", a: PLAYER_NET_PROTOCOL.encodeAim(angle) }));
  await delay(40);
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
    if (welcome.buildVersion !== "6-11-410") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { woodFloors: 12, woodWalls: 12, woodDoors: 4 } }
    }));
    await restoredPending;

    // Shared-wall floor reclaim: place a wall on floor A, then add floor B on
    // its opposite side. B must be reclaimable because A still supports wall.
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1 } }));
    await delay(80);
    const floorA = await place(socket, "woodFloor", 128, 96);
    if (!floorA.success) throw new Error(`floor A placement failed: ${JSON.stringify(floorA)}`);
    const sharedWall = await place(socket, "woodWall", 128, 96, "east");
    if (!sharedWall.success) throw new Error(`shared wall placement failed: ${JSON.stringify(sharedWall)}`);
    const floorB = await place(socket, "woodFloor", 144, 96);
    if (!floorB.success) throw new Error(`floor B placement failed: ${JSON.stringify(floorB)}`);

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { y: 80, weaponIndex: 11, attackAimAngle: Math.PI / 2 } }));
    await delay(60);
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 144, weaponIndex: 11 } }));
    await delay(80);
    await setAim(socket, Math.PI / 2);
    const floorBRemoved = await destroy(socket, floorB.structureId);
    if (!floorBRemoved.success) throw new Error(`shared-wall floor should be removable: ${JSON.stringify(floorBRemoved)}`);

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 128, weaponIndex: 11 } }));
    await delay(80);
    await setAim(socket, Math.PI / 2);
    const floorABlocked = await destroy(socket, floorA.structureId);
    if (floorABlocked.success || floorABlocked.reason !== "wallAttached") {
      throw new Error(`last supporting floor should remain protected: ${JSON.stringify(floorABlocked)}`);
    }

    // Door dependency: create a valid three-floor south wall run, then remove
    // one of the two flanking walls. The now-unsupported door should be removed
    // automatically and returned as loot too.
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 144, y: 112, weaponIndex: -1 } }));
    await delay(80);
    for (const x of [128, 144, 160]) {
      const floor = await place(socket, "woodFloor", x, 128);
      if (!floor.success) throw new Error(`door floor failed at ${x}: ${JSON.stringify(floor)}`);
    }
    const leftWall = await place(socket, "woodWall", 128, 128, "south");
    const rightWall = await place(socket, "woodWall", 160, 128, "south");
    if (!leftWall.success || !rightWall.success) throw new Error("door flank wall placement failed");
    const door = await place(socket, "woodDoor", 144, 128, "south");
    if (!door.success) throw new Error(`door placement failed: ${JSON.stringify(door)}`);

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 128, y: 112, weaponIndex: 11 } }));
    await delay(80);
    await setAim(socket, Math.PI / 2);
    const autoDoorRemoved = waitForMessage(socket, "structureRemoved", message =>
      message.structureId === door.structureId && message.reason === "supportRemoved"
    );
    const autoDoorDrop = waitForMessage(socket, "resourceSpawn", message => message.resource?.kind === "woodDoor");
    const wallRemoved = await destroy(socket, leftWall.structureId);
    if (!wallRemoved.success) throw new Error(`flank wall destroy failed: ${JSON.stringify(wallRemoved)}`);
    await Promise.all([autoDoorRemoved, autoDoorDrop]);

    socket.close();
    console.log("v402 building dependency smoke passed: shared-wall floor reclaim works, final floor support stays protected, and removing a required door wall auto-removes/drops the door.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
