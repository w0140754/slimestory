"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const port = 32216;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port), SLIME_STORY_WORLD_SEED: "0" },
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
      const message = JSON.parse(raw.toString());
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
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await waitForMessage(socket, "welcome");

    await sendAndWait(socket, {
      type: "persistentStateRestore",
      state: { resources: { wood: 12, stone: 3 } }
    }, "persistentStateRestored");

    const mapId = WORLD_CONTENT.defaultPlayerLoad?.mapId;
    const bench = WORLD_CONTENT.maps?.[mapId]?.npcs?.find(npc => npc?.type === "craftingTable");
    if (!bench) throw new Error("default crafting table missing");

    socket.send(JSON.stringify({ type: "playerStatePatch", player: { x: bench.x, y: bench.y } }));
    await delay(100);

    const tigerPaw = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "tigerPaw" },
      "craftResult",
      message => message.recipe === "tigerPaw"
    );
    if (!tigerPaw.success || tigerPaw.totalWood !== 4 || tigerPaw.totalStone !== 1) {
      throw new Error(`Tiger Paw craft failed: ${JSON.stringify(tigerPaw)}`);
    }

    // Defensive protocol regression: even an unknown recipe must get a result
    // rather than leaving the client in a permanent pending/WORKING state.
    const invalid = await sendAndWait(
      socket,
      { type: "craftRequest", recipe: "doesNotExist" },
      "craftResult",
      message => message.recipe === "doesNotExist"
    );
    if (invalid.success || invalid.reason !== "invalidRecipe") {
      throw new Error(`invalid recipe did not fail cleanly: ${JSON.stringify(invalid)}`);
    }

    socket.close();
    console.log("v416 Tiger Paw crafting WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
