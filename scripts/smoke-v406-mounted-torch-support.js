"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const PLAYER_NET_PROTOCOL = require("../public/shared/player-net-protocol.js");
const root = path.join(__dirname, "..");
const port = 32406;
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

async function place(socket, kind, x, y, options = {}, expectSuccess = true) {
  const placedEvent = expectSuccess
    ? waitForMessage(socket, "structurePlaced", message =>
        message.structure?.kind === kind &&
        (!options.supportId || message.structure?.supportId === options.supportId)
      )
    : null;
  const resultEvent = waitForMessage(socket, "structurePlaceResult", message => message.kind === kind);
  socket.send(JSON.stringify({ type: "structurePlace", kind, x, y, ...options }));
  const result = await resultEvent;
  if (!result.success) return { result, structure: null };
  const placed = placedEvent ? await placedEvent : null;
  return { result, structure: placed?.structure || null };
}

async function setPlayer(socket, patch) {
  socket.send(JSON.stringify({ type: "playerStatePatch", player: patch }));
  await delay(70);
}

async function setAim(socket, angle) {
  socket.send(JSON.stringify({ type: "playerAim", a: PLAYER_NET_PROTOCOL.encodeAim(angle) }));
  await delay(40);
}

async function destroySupportExpectTorchFirst(socket, supportId, expectedTorchId) {
  const removed = waitForMessage(socket, "structureRemoved", message =>
    message.structureId === expectedTorchId && message.reason === "supportPickaxeFirst"
  );
  const drop = waitForMessage(socket, "resourceSpawn", message => message.resource?.kind === "torch");
  const result = waitForMessage(socket, "structureDestroyResult", message =>
    message.attachmentRemoved === true && message.supportId === supportId
  );
  socket.send(JSON.stringify({ type: "structureDestroy", structureId: supportId }));
  const [removedMessage, dropMessage, resultMessage] = await Promise.all([removed, drop, result]);
  if (!resultMessage.success || resultMessage.kind !== "torch" || resultMessage.structureId !== expectedTorchId) {
    throw new Error(`attachment-first destroy returned wrong result: ${JSON.stringify(resultMessage)}`);
  }
  return { removedMessage, dropMessage, resultMessage };
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
    if (welcome.buildVersion !== "6-11-419") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({
      type: "persistentStateRestore",
      state: { resources: { woodFloors: 8, woodWalls: 8, torches: 6 } }
    }));
    await restoredPending;

    // Floor mount: one torch attaches to the exact floor support. Pickaxing the
    // floor removes/drops only the torch first, then the second swing removes
    // the still-present floor.
    await setPlayer(socket, { x: 112, y: 96, weaponIndex: -1, attackAimAngle: 0 });
    const floor = await place(socket, "woodFloor", 128, 96);
    if (!floor.result.success || !floor.structure?.id) throw new Error(`floor placement failed: ${JSON.stringify(floor.result)}`);
    const floorTorch = await place(socket, "torch", 128, 96, { supportId: floor.structure.id });
    if (!floorTorch.result.success || floorTorch.structure?.mountType !== "floor") {
      throw new Error(`floor torch mount failed: ${JSON.stringify(floorTorch)}`);
    }

    await setPlayer(socket, { x: 112, y: 96, weaponIndex: 11, attackAimAngle: 0 });
    await setAim(socket, 0);
    await destroySupportExpectTorchFirst(socket, floor.structure.id, floorTorch.structure.id);

    const floorDestroyResult = waitForMessage(socket, "structureDestroyResult", message => message.structureId === floor.structure.id);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: floor.structure.id }));
    const floorRemoved = await floorDestroyResult;
    if (!floorRemoved.success || floorRemoved.kind !== "woodFloor") throw new Error("floor did not survive first swing then remove on second");

    // Wall mount: same attachment-first rule, with side metadata derived from
    // the placing player's side of the wall for lighting occlusion.
    await setPlayer(socket, { x: 144, y: 128, weaponIndex: -1, attackAimAngle: 0 });
    const wallFloor = await place(socket, "woodFloor", 160, 128);
    if (!wallFloor.result.success) throw new Error("wall support floor placement failed");
    const wall = await place(socket, "woodWall", 160, 128, { edge: "west" });
    if (!wall.result.success || wall.structure?.axis !== "vertical") throw new Error(`wall placement failed: ${JSON.stringify(wall.result)}`);
    const wallTorch = await place(socket, "torch", wall.structure.x, wall.structure.y, { supportId: wall.structure.id });
    if (!wallTorch.result.success || wallTorch.structure?.mountType !== "wall" || wallTorch.structure?.mountAxis !== "vertical") {
      throw new Error(`wall torch mount failed: ${JSON.stringify(wallTorch)}`);
    }
    if (!['west', 'east'].includes(wallTorch.structure.mountSide)) throw new Error("wall torch side metadata missing");

    // A second torch on the same support is rejected instead of stacking.
    const duplicate = await place(socket, "torch", wall.structure.x, wall.structure.y, { supportId: wall.structure.id }, false);
    if (duplicate.result.success || duplicate.result.reason !== "supportOccupied") {
      throw new Error(`duplicate wall torch should be rejected: ${JSON.stringify(duplicate.result)}`);
    }

    await setPlayer(socket, { x: 144, y: 128, weaponIndex: 11, attackAimAngle: 0 });
    await setAim(socket, 0);
    await destroySupportExpectTorchFirst(socket, wall.structure.id, wallTorch.structure.id);

    const wallDestroyResult = waitForMessage(socket, "structureDestroyResult", message => message.structureId === wall.structure.id);
    socket.send(JSON.stringify({ type: "structureDestroy", structureId: wall.structure.id }));
    const wallRemoved = await wallDestroyResult;
    if (!wallRemoved.success || wallRemoved.kind !== "woodWall") throw new Error("wall did not survive first swing then remove on second");

    socket.close();
    console.log("v406 mounted torch WebSocket smoke passed: floor/wall mount metadata, duplicate prevention, and attachment-first Pickaxe reclaim all work.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
