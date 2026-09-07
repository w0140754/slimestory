"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43414;
const server = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), SLIME_STORY_WORLD_SEED: "0" }, stdio: ["ignore", "pipe", "pipe"] });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 5000) {
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
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcomePending = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return { socket, welcome: await welcomePending };
}
async function moveToMap(socket, mapId, x, y, weaponIndex = -1) {
  const snapshot = waitForMessage(socket, "snapshot", m => m.mapId === mapId);
  socket.send(JSON.stringify({ type: "playerState", player: { mapId, x, y, level: 1, weaponIndex } }));
  await snapshot;
  await delay(80);
}

(async () => {
  try {
    await delay(500);
    const actor = await connect();
    const observer = await connect();
    if (actor.welcome.buildVersion !== "6-11-419" || actor.welcome.worldSeed !== 0) throw new Error("unexpected actor welcome");
    if (observer.welcome.buildVersion !== "6-11-419") throw new Error("unexpected observer welcome");

    const houseEntry = Object.entries(WORLD_CONTENT.maps).find(([, map]) => (map.structures || []).some(s => s.kind === "chest" && s.treasure));
    if (!houseEntry) throw new Error("seed-0 fixture missing generated treasure house");
    const [mapId, map] = houseEntry;
    const chest = map.structures.find(s => s.kind === "chest" && s.treasure);
    const wall = map.structures.find(s => s.kind === "woodWall" && s.featureType === "house");
    if (!wall) throw new Error("generated house wall missing");

    // Observer remains on default map and must not receive map-local house mutations.
    const observerMutations = [];
    observer.socket.on("message", raw => {
      try {
        const m = JSON.parse(raw.toString());
        if ((m.type === "structureState" || m.type === "structureRemoved") && m.mapId === mapId) observerMutations.push(m);
      } catch {}
    });

    const restoredPending = waitForMessage(actor.socket, "persistentStateRestored");
    actor.socket.send(JSON.stringify({ type: "persistentStateRestore", state: { resources: { chests: 0 } } }));
    const restored = await restoredPending;
    if (restored.chests !== 0) throw new Error("chest inventory restore mismatch");

    await moveToMap(actor.socket, "world_m1_p0", 384, 200, 11);
    const deltaPending = waitForMessage(actor.socket, "structureSnapshot", m => m.mapId === mapId);
    await moveToMap(actor.socket, mapId, chest.x - 16, chest.y, 11);
    const initialDelta = await deltaPending;
    if ((initialDelta.structures || []).some(s => s.id === chest.id)) throw new Error("generated chest should remain baseline, not full dynamic snapshot");

    actor.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: chest.x - 16, y: chest.y, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);

    const openStatePending = waitForMessage(actor.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === true);
    const treasurePending = waitForMessage(actor.socket, "treasureResult", m => m.chestId === chest.id && m.success);
    actor.socket.send(JSON.stringify({ type: "treasureOpen", chestId: chest.id }));
    await Promise.all([openStatePending, treasurePending]);

    const chestRemovedPending = waitForMessage(actor.socket, "structureRemoved", m => m.structureId === chest.id);
    const chestDropPending = waitForMessage(actor.socket, "resourceSpawn", m => m.resource?.kind === "chest");
    const chestDestroyPending = waitForMessage(actor.socket, "structureDestroyResult", m => m.structureId === chest.id);
    actor.socket.send(JSON.stringify({ type: "structureDestroy", structureId: chest.id }));
    const [removedMsg, drop, destroyed] = await Promise.all([chestRemovedPending, chestDropPending, chestDestroyPending]);
    if (!removedMsg || !destroyed.success || destroyed.kind !== "chest") throw new Error("generated opened chest was not harvestable");

    const pickupPending = waitForMessage(actor.socket, "resourcePicked", m => m.resourceId === drop.resource.id);
    actor.socket.send(JSON.stringify({ type: "resourcePickup", resourceId: drop.resource.id }));
    const picked = await pickupPending;
    if (picked.resourceKind !== "chest" || picked.totalChests !== 1) throw new Error("harvested chest did not enter inventory");

    const placePending = waitForMessage(actor.socket, "structurePlaceResult", m => m.kind === "chest");
    actor.socket.send(JSON.stringify({ type: "structurePlace", kind: "chest", x: chest.x, y: chest.y }));
    const placed = await placePending;
    if (!placed.success || !placed.structureId || placed.totalChests !== 0) throw new Error(`harvested chest could not be re-placed: ${JSON.stringify(placed)}`);

    const toggleStatePending = waitForMessage(actor.socket, "structureState", m => m.structureId === placed.structureId && m.state?.opened === true);
    actor.socket.send(JSON.stringify({ type: "chestToggle", chestId: placed.structureId }));
    await toggleStatePending;

    // Destroy one real generated house wall to prove generated buildings use the same salvage path.
    actor.socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: wall.x - 16, y: wall.y, weaponIndex: 11, attackAimAngle: 0 } }));
    await delay(80);
    const wallRemovedPending = waitForMessage(actor.socket, "structureRemoved", m => m.structureId === wall.id);
    const wallDropPending = waitForMessage(actor.socket, "resourceSpawn", m => m.resource?.kind === "woodWall");
    const wallDestroyPending = waitForMessage(actor.socket, "structureDestroyResult", m => m.structureId === wall.id);
    actor.socket.send(JSON.stringify({ type: "structureDestroy", structureId: wall.id }));
    const [wallRemoved, wallDrop, wallDestroyed] = await Promise.all([wallRemovedPending, wallDropPending, wallDestroyPending]);
    if (!wallRemoved || !wallDrop || !wallDestroyed.success) throw new Error("generated house wall was not harvestable");

    // Leave and re-enter: only compact generated-world mutations should be replayed.
    await moveToMap(actor.socket, "world_m1_p0", 384, 200, -1);
    const reentryDeltaPending = waitForMessage(actor.socket, "structureSnapshot", m => m.mapId === mapId);
    await moveToMap(actor.socket, mapId, 200, 200, -1);
    const reentry = await reentryDeltaPending;
    if (!(reentry.removedWorldStructureIds || []).includes(chest.id) || !(reentry.removedWorldStructureIds || []).includes(wall.id)) {
      throw new Error(`generated removals missing from map-entry delta: ${JSON.stringify(reentry.removedWorldStructureIds)}`);
    }
    if ((reentry.structures || []).some(s => s.worldGenerated)) throw new Error("generated baseline leaked into map-entry dynamic snapshot");

    await delay(200);
    if (observerMutations.length !== 0) throw new Error(`other-map observer received ${observerMutations.length} generated-world mutation(s)`);

    actor.socket.close(); observer.socket.close();
    console.log("v414 mutable generated-world WebSocket smoke passed: shared chest open -> harvest -> pickup -> re-place/toggle, generated house wall salvage, compact re-entry deltas, and zero cross-map mutation broadcasts.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
