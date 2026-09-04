"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const authored = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "adopted-map-overrides.json"), "utf8"));
function findNpc(type) {
  for (const [mapId, map] of Object.entries(authored.maps || {})) {
    const npc = (map.npcs || []).find(candidate => candidate?.type === type);
    if (npc) return { mapId, npc };
  }
  throw new Error(`Missing authored NPC ${type}`);
}

const marnie = findNpc("shopkeeper");
const cam = findNpc("camoGuy");
const myrtle = findNpc("greenWitch");
const port = 32194;
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

async function moveTo(socket, target, level = 20) {
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId: target.mapId, x: target.npc.x, y: target.npc.y, level }
  }));
  await delay(120);
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

    await moveTo(socket, marnie, 20);
    await sendAndWait(socket, {
      type: "persistentStateRestore",
      state: { resources: { wood: 10, coins: 200, arrows: 0 } }
    }, "persistentStateRestored");

    const marnieTurnIn = await sendAndWait(
      socket,
      { type: "marnieQuestInteract", action: "turnInWood" },
      "marnieQuestResult"
    );
    if (!marnieTurnIn.success || marnieTurnIn.totalWood !== 0 || marnieTurnIn.goal !== 10) {
      throw new Error("Marnie did not consume 10 Wood and complete the Pickaxe handoff");
    }
    const marnieRepeat = await sendAndWait(
      socket,
      { type: "marnieQuestInteract", action: "turnInWood" },
      "marnieQuestResult"
    );
    if (!marnieRepeat.success || !marnieRepeat.alreadyComplete || marnieRepeat.totalWood !== 0) {
      throw new Error("Marnie Pickaxe quest did not remain complete");
    }

    await moveTo(socket, cam, 20);
    const arrows = await sendAndWait(
      socket,
      { type: "shopPurchase", vendor: "cam", itemId: "arrows" },
      "shopPurchaseResult",
      message => message.vendor === "cam" && message.itemId === "arrows"
    );
    if (!arrows.success || arrows.price !== 5 || arrows.totalCoins !== 195 || arrows.totalArrows !== 50) {
      throw new Error("Cam's repeatable Arrow purchase failed");
    }
    const ranger = await sendAndWait(
      socket,
      { type: "shopPurchase", vendor: "cam", itemId: "hat_ranger" },
      "shopPurchaseResult",
      message => message.vendor === "cam" && message.itemId === "hat_ranger"
    );
    if (!ranger.success || ranger.price !== 20 || ranger.totalCoins !== 175) {
      throw new Error("Cam's Ranger Hat purchase failed");
    }

    await moveTo(socket, myrtle, 20);
    const sapgem = await sendAndWait(
      socket,
      { type: "shopPurchase", vendor: "myrtle", itemId: "weapon_sapgemWand" },
      "shopPurchaseResult",
      message => message.vendor === "myrtle" && message.itemId === "weapon_sapgemWand"
    );
    if (!sapgem.success || sapgem.price !== 20 || sapgem.totalCoins !== 155) {
      throw new Error("Myrtle's Sapgem Wand purchase failed");
    }

    const wrongVendor = waitForMessage(socket, "shopPurchaseResult", () => true, 500)
      .then(() => { throw new Error("Myrtle accepted a Cam-only Ranger item"); })
      .catch(error => {
        if (/Timed out/.test(error.message)) return;
        throw error;
      });
    socket.send(JSON.stringify({ type: "shopPurchase", vendor: "myrtle", itemId: "hat_ranger" }));
    await wrongVendor;

    socket.close();
    console.log("Marnie Pickaxe handoff and Cam/Myrtle class-shop WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
