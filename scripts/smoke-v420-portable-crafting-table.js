"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");

const root = path.join(__dirname, "..");
const port = 32420;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SLIME_STORY_WORLD_SEED: "0" },
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

async function sendAndWait(socket, payload, type, predicate) {
  const pending = waitForMessage(socket, type, predicate);
  socket.send(JSON.stringify(payload));
  return pending;
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
    if (welcome.buildVersion !== "6-11-432") throw new Error(`unexpected build ${welcome.buildVersion}`);

    const supply = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "testWoodSupply" },
      "craftResult",
      message => message.recipe === "testWoodSupply"
    );
    if (!supply.success || supply.totalWood !== 100) throw new Error(`test Wood supply failed: ${JSON.stringify(supply)}`);

    const beforeTable = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "woodFloor" },
      "craftResult",
      message => message.recipe === "woodFloor"
    );
    if (beforeTable.success || beforeTable.reason !== "tooFar") {
      throw new Error(`advanced recipe worked without Crafting Table: ${JSON.stringify(beforeTable)}`);
    }

    const tableCraft = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "craftingTable" },
      "craftResult",
      message => message.recipe === "craftingTable"
    );
    if (!tableCraft.success || tableCraft.totalWood !== 90 || tableCraft.totalCraftingTables !== 1) {
      throw new Error(`hand Crafting Table recipe failed: ${JSON.stringify(tableCraft)}`);
    }

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 96, y: 96, weaponIndex: 0 } }));
    await delay(100);
    const placed = await sendAndWait(
      socket,
      { type: "structurePlace", kind: "craftingTable", x: 112, y: 96 },
      "structurePlaceResult",
      message => message.kind === "craftingTable"
    );
    if (!placed.success || !placed.structureId || placed.totalCraftingTables !== 0) {
      throw new Error(`portable table placement failed: ${JSON.stringify(placed)}`);
    }

    const nearCraft = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "woodFloor" },
      "craftResult",
      message => message.recipe === "woodFloor"
    );
    if (!nearCraft.success || nearCraft.totalWood !== 88 || nearCraft.totalWoodFloors !== 4) {
      throw new Error(`table-range recipe failed: ${JSON.stringify(nearCraft)}`);
    }

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 200, y: 200 } }));
    await delay(100);
    const farCraft = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "woodFloor" },
      "craftResult",
      message => message.recipe === "woodFloor"
    );
    if (farCraft.success || farCraft.reason !== "tooFar" || farCraft.totalWoodFloors !== 4) {
      throw new Error(`table recipe remained available out of range: ${JSON.stringify(farCraft)}`);
    }

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: 96, y: 96, weaponIndex: 11 } }));
    await delay(100);
    const dropPending = waitForMessage(socket, "resourceSpawn", message => message.resource?.kind === "craftingTable");
    const destroyed = await sendAndWait(
      socket,
      { type: "structureDestroy", structureId: placed.structureId },
      "structureDestroyResult",
      message => message.structureId === placed.structureId
    );
    if (!destroyed.success || destroyed.kind !== "craftingTable") {
      throw new Error(`Pickaxe failed to reclaim table: ${JSON.stringify(destroyed)}`);
    }
    const drop = await dropPending;

    const picked = await sendAndWait(
      socket,
      { type: "resourcePickup", resourceId: drop.resource.id },
      "resourcePicked",
      message => message.resourceId === drop.resource.id
    );
    if (picked.resourceKind !== "craftingTable" || picked.totalCraftingTables !== 1) {
      throw new Error(`reclaimed table did not return to inventory: ${JSON.stringify(picked)}`);
    }

    socket.close();
    console.log("v420 portable Crafting Table WebSocket smoke passed: no-table gate -> hand craft -> place -> proximity craft -> range loss -> Pickaxe reclaim/pickup.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
