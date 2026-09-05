"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const authored = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "adopted-map-overrides.json"), "utf8"));
let myrtle = null;
for (const [mapId, map] of Object.entries(authored.maps || {})) {
  const npc = (map.npcs || []).find(candidate => candidate?.type === "greenWitch");
  if (npc) { myrtle = { mapId, npc }; break; }
}
if (!myrtle) throw new Error("Missing authored Myrtle NPC");

const port = 32195;
const server = spawn(process.execPath, ["server.js"], {
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
async function buy(socket, itemId) {
  return sendAndWait(
    socket,
    { type: "shopPurchase", vendor: "myrtle", itemId },
    "shopPurchaseResult",
    message => message.vendor === "myrtle" && message.itemId === itemId
  );
}

(async () => {
  try {
    await delay(500);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const welcome = waitForMessage(socket, "welcome");
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await welcome;

    socket.send(JSON.stringify({
      type: "playerState",
      player: { mapId: myrtle.mapId, x: myrtle.npc.x, y: myrtle.npc.y, level: 20 }
    }));
    await delay(120);
    await sendAndWait(socket, {
      type: "persistentStateRestore",
      state: { resources: { coins: 250 } }
    }, "persistentStateRestored");

    const arcanistOne = await buy(socket, "hat_arcanist");
    const arcanistTwo = await buy(socket, "hat_arcanist");
    const sapgemOne = await buy(socket, "weapon_sapgemWand");
    const sapgemTwo = await buy(socket, "weapon_sapgemWand");

    if (!arcanistOne.success || arcanistOne.price !== 25 || arcanistOne.totalCoins !== 225) {
      throw new Error("Myrtle Arcanist Hat purchase failed");
    }
    if (!arcanistTwo.success || arcanistTwo.totalCoins !== 200) {
      throw new Error("Myrtle repeat Arcanist Hat purchase failed");
    }
    if (!sapgemOne.success || sapgemOne.price !== 20 || sapgemOne.totalCoins !== 180) {
      throw new Error("Myrtle Sapgem purchase failed");
    }
    if (!sapgemTwo.success || sapgemTwo.totalCoins !== 160) {
      throw new Error("Myrtle repeat Sapgem purchase failed");
    }

    socket.close();
    console.log("Repeatable Myrtle shop WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
