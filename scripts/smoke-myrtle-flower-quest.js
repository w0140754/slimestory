"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const authoredMaps = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "adopted-map-overrides.json"), "utf8"));
const myrtleNpc = authoredMaps.maps.waterfallGrove.npcs.find(npc => npc.type === "greenWitch");
if (!myrtleNpc) throw new Error("Myrtle is missing from the authored Waterfall Grove map");

const port = 32193;
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

async function connectAtMyrtle(level, resources = {}, stage = "none") {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcome = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  await welcome;
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId: "waterfallGrove", x: myrtleNpc.x, y: myrtleNpc.y, level }
  }));
  await delay(120);
  await sendAndWait(socket, {
    type: "persistentStateRestore",
    state: { resources, myrtleQuest: { stage } }
  }, "persistentStateRestored");
  return socket;
}

(async () => {
  try {
    await delay(500);

    const novice = await connectAtMyrtle(2);
    const noviceTalk = await sendAndWait(novice, { type: "myrtleQuestInteract", action: "talk" }, "myrtleQuestState");
    if (noviceTalk.stage !== "none" || noviceTalk.action) throw new Error("Myrtle exposed the quest below level 3");
    novice.close();

    const short = await connectAtMyrtle(3, { whiteFlowers: 10, blueFlowers: 9 });
    const accepted = await sendAndWait(short, { type: "myrtleQuestInteract", action: "accept" }, "myrtleQuestState");
    if (accepted.stage !== "active") throw new Error("level-3 player could not accept Myrtle's quest");
    const rejected = await sendAndWait(short, { type: "myrtleQuestInteract", action: "turnIn" }, "myrtleQuestState");
    if (rejected.stage !== "active" || rejected.rewardCoins || rejected.totalWhiteFlowers !== 10 || rejected.totalBlueFlowers !== 9) {
      throw new Error("Myrtle accepted an incomplete two-flower turn-in");
    }
    short.close();

    const ready = await connectAtMyrtle(3, { whiteFlowers: 12, blueFlowers: 14 }, "active");
    const completed = await sendAndWait(ready, { type: "myrtleQuestInteract", action: "turnIn" }, "myrtleQuestState");
    if (
      completed.stage !== "complete" ||
      completed.totalWhiteFlowers !== 2 ||
      completed.totalBlueFlowers !== 4 ||
      completed.rewardCoins !== 50 ||
      completed.rewardExp !== 10
    ) {
      throw new Error("Myrtle's completed turn-in did not consume and reward correctly");
    }
    const after = await sendAndWait(ready, { type: "myrtleQuestInteract", action: "talk" }, "myrtleQuestState");
    if (after.stage !== "complete" || after.action) throw new Error("completed Myrtle quest did not remain complete");
    ready.close();

    console.log("Myrtle flower quest WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
