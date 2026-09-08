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
    if (actor.welcome.buildVersion !== "6-11-431" || actor.welcome.worldSeed !== 0) throw new Error("unexpected actor welcome");
    if (observer.welcome.buildVersion !== "6-11-431") throw new Error("unexpected observer welcome");

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
    const chestContextPending = waitForMessage(actor.socket, "chestContextResult", m => m.chestId === chest.id);
    actor.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const [, firstContext] = await Promise.all([openStatePending, chestContextPending]);
    if (!firstContext.success || !(firstContext.items || []).length) throw new Error(`generated treasure chest context failed: ${JSON.stringify(firstContext)}`);

    // A closed treasure chest with remaining loot cannot be reclaimed.
    const firstClosedState = waitForMessage(actor.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === false);
    const firstClosed = waitForMessage(actor.socket, "chestContextClosed", m => m.chestId === chest.id);
    actor.socket.send(JSON.stringify({ type: "chestContextClose", chestId: chest.id }));
    await Promise.all([firstClosedState, firstClosed]);
    const lootFirstPending = waitForMessage(actor.socket, "structureDestroyResult", m => m.structureId === chest.id);
    actor.socket.send(JSON.stringify({ type: "structureDestroy", structureId: chest.id }));
    const lootFirst = await lootFirstPending;
    if (lootFirst.success || lootFirst.reason !== "lootFirst") throw new Error(`treasure chest was reclaimable before being emptied: ${JSON.stringify(lootFirst)}`);

    // Reopen, transfer every visible stack, and prove the active lock itself
    // still prevents reclaim until the player closes the context.
    const reopenStatePending = waitForMessage(actor.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === true);
    const reopenPending = waitForMessage(actor.socket, "chestContextResult", m => m.chestId === chest.id && m.success);
    actor.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: chest.id }));
    const [, reopened] = await Promise.all([reopenStatePending, reopenPending]);
    for (const item of reopened.items || []) {
      const takePending = waitForMessage(actor.socket, "chestTakeResult", m => m.chestId === chest.id && m.token === item.token);
      actor.socket.send(JSON.stringify({ type: "chestTakeItem", chestId: chest.id, token: item.token }));
      const taken = await takePending;
      if (!taken.success || taken.amount !== item.count) throw new Error(`failed to transfer ${item.token}: ${JSON.stringify(taken)}`);
    }
    const inUsePending = waitForMessage(actor.socket, "structureDestroyResult", m => m.structureId === chest.id);
    actor.socket.send(JSON.stringify({ type: "structureDestroy", structureId: chest.id }));
    const inUse = await inUsePending;
    if (inUse.success || inUse.reason !== "inUse") throw new Error(`open chest lock did not block reclaim: ${JSON.stringify(inUse)}`);

    const finalClosedState = waitForMessage(actor.socket, "structureState", m => m.structureId === chest.id && m.state?.opened === false);
    const finalClosed = waitForMessage(actor.socket, "chestContextClosed", m => m.chestId === chest.id);
    actor.socket.send(JSON.stringify({ type: "chestContextClose", chestId: chest.id }));
    await Promise.all([finalClosedState, finalClosed]);

    const chestRemovedPending = waitForMessage(actor.socket, "structureRemoved", m => m.structureId === chest.id);
    const chestDropPending = waitForMessage(actor.socket, "resourceSpawn", m => m.resource?.kind === "chest");
    const chestDestroyPending = waitForMessage(actor.socket, "structureDestroyResult", m => m.structureId === chest.id);
    actor.socket.send(JSON.stringify({ type: "structureDestroy", structureId: chest.id }));
    const [removedMsg, drop, destroyed] = await Promise.all([chestRemovedPending, chestDropPending, chestDestroyPending]);
    if (!removedMsg || !destroyed.success || destroyed.kind !== "chest") throw new Error("emptied/closed generated chest was not harvestable");

    const pickupPending = waitForMessage(actor.socket, "resourcePicked", m => m.resourceId === drop.resource.id);
    actor.socket.send(JSON.stringify({ type: "resourcePickup", resourceId: drop.resource.id }));
    const picked = await pickupPending;
    if (picked.resourceKind !== "chest" || picked.totalChests !== 1) throw new Error("harvested chest did not enter inventory");

    const placePending = waitForMessage(actor.socket, "structurePlaceResult", m => m.kind === "chest");
    actor.socket.send(JSON.stringify({ type: "structurePlace", kind: "chest", x: chest.x, y: chest.y }));
    const placed = await placePending;
    if (!placed.success || !placed.structureId || placed.totalChests !== 0) throw new Error(`harvested chest could not be re-placed: ${JSON.stringify(placed)}`);

    const placedOpenState = waitForMessage(actor.socket, "structureState", m => m.structureId === placed.structureId && m.state?.opened === true);
    const placedContextPending = waitForMessage(actor.socket, "chestContextResult", m => m.chestId === placed.structureId);
    actor.socket.send(JSON.stringify({ type: "chestContextOpen", chestId: placed.structureId }));
    const [, placedContext] = await Promise.all([placedOpenState, placedContextPending]);
    if (!placedContext.success || (placedContext.items || []).length !== 0) throw new Error("ordinary placed chest should open as an empty context container");
    const placedCloseState = waitForMessage(actor.socket, "structureState", m => m.structureId === placed.structureId && m.state?.opened === false);
    actor.socket.send(JSON.stringify({ type: "chestContextClose", chestId: placed.structureId }));
    await placedCloseState;

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
    console.log("v414 mutable generated-world WebSocket smoke passed on v425: context loot/reclaim gating, pickup/re-place/context state, generated house wall salvage, compact re-entry deltas, and zero cross-map mutation broadcasts.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
