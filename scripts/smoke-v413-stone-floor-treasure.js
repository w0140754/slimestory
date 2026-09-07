"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43413;
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

async function moveToMap(socket, mapId, x, y) {
  const snapshot = waitForMessage(socket, "snapshot", message => message.mapId === mapId);
  socket.send(JSON.stringify({ type: "playerState", player: { mapId, x, y, level: 1, weaponIndex: -1 } }));
  await snapshot;
}

(async () => {
  try {
    await delay(500);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcomePending = waitForMessage(socket, "welcome");
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const welcome = await welcomePending;
    if (welcome.buildVersion !== "6-11-413" || welcome.worldContentVersion !== 413) throw new Error("unexpected v413 server/world marker");

    const restoredPending = waitForMessage(socket, "persistentStateRestored");
    socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { stone: 10, woodWalls: 1 } } }));
    await restoredPending;

    const bench = WORLD_CONTENT.maps.world_p0_p0.npcs.find(npc => npc.type === "craftingTable");
    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: bench.x, y: bench.y, weaponIndex: -1 } }));
    await delay(80);
    const craftPending = waitForMessage(socket, "craftResult", m => m.recipe === "stoneFloor");
    socket.send(JSON.stringify({ type: "craftRequest", recipe: "stoneFloor" }));
    const craft = await craftPending;
    if (!craft.success || craft.totalStoneFloors !== 4 || craft.totalStone !== 8) throw new Error(`Stone Floor craft failed: ${JSON.stringify(craft)}`);

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 112, y: 96, weaponIndex: -1 } }));
    await delay(80);
    const floorPending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "stoneFloor");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "stoneFloor", x: 128, y: 96 }));
    const floor = await floorPending;
    if (!floor.success || floor.totalStoneFloors !== 3) throw new Error(`Stone Floor placement failed: ${JSON.stringify(floor)}`);

    const wallPending = waitForMessage(socket, "structurePlaceResult", m => m.kind === "woodWall");
    socket.send(JSON.stringify({ type: "structurePlace", kind: "woodWall", x: 128, y: 96, edge: "east" }));
    const wall = await wallPending;
    if (!wall.success) throw new Error(`Stone Floor did not support normal wall placement: ${JSON.stringify(wall)}`);

    const houseEntry = Object.entries(WORLD_CONTENT.maps).find(([, map]) => (map.npcs || []).some(npc => npc.type === "treasureChest"));
    if (!houseEntry) throw new Error("deterministic v413 world has no treasure house");
    const [houseMapId, houseMap] = houseEntry;
    const chest = houseMap.npcs.find(npc => npc.type === "treasureChest");
    if (houseMap.grid.x !== -1 || houseMap.grid.y !== -1) throw new Error(`unexpected current treasure corner ${houseMapId}`);

    await moveToMap(socket, "world_m1_p0", 384, 200);
    const staticSnapshotPending = waitForMessage(socket, "structureSnapshot", m => m.mapId === houseMapId);
    await moveToMap(socket, houseMapId, chest.x, chest.y);
    const staticSnapshot = await staticSnapshotPending;
    if ((staticSnapshot.structures || []).some(item => item.worldGenerated || String(item.id || "").includes(":house:"))) {
      throw new Error("world-generated house leaked into websocket structure snapshot");
    }

    const treasurePending = waitForMessage(socket, "treasureResult", m => m.chestId === chest.id);
    socket.send(JSON.stringify({ type: "treasureOpen", chestId: chest.id }));
    const treasure = await treasurePending;
    if (!treasure.success || treasure.rewardCoins < 12 || treasure.rewardStone < 1) throw new Error(`treasure reward failed: ${JSON.stringify(treasure)}`);

    const repeatPending = waitForMessage(socket, "treasureResult", m => m.chestId === chest.id);
    socket.send(JSON.stringify({ type: "treasureOpen", chestId: chest.id }));
    const repeat = await repeatPending;
    if (repeat.success || repeat.reason !== "alreadyOpened") throw new Error("treasure chest could be looted twice in one character session");

    socket.close();
    console.log("v413 WebSocket smoke passed: Stone Floor craft/place/wall support + private one-shot treasure, while generated house geometry stays out of structure snapshots.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
