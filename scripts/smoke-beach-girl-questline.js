"use strict";

const { spawn } = require("child_process");
const WebSocket = require("ws");

const port = 32192;
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

async function connectAtBeach(level, beachQuest = null) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcome = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  await welcome;
  socket.send(JSON.stringify({
    type: "playerState",
    player: { mapId: "crabBeach", x: 578, y: 324, level }
  }));
  await delay(120);
  if (beachQuest) {
    await sendAndWait(socket, {
      type: "persistentStateRestore",
      state: { resources: {}, beachQuest }
    }, "persistentStateRestored");
  }
  return socket;
}

(async () => {
  try {
    await delay(500);

    const novice = await connectAtBeach(4);
    const noviceTalk = await sendAndWait(novice, { type: "beachQuestInteract", action: "talk" }, "beachQuestState");
    if (noviceTalk.action || noviceTalk.stage !== "none") throw new Error("under-level dialogue exposed a quest");
    novice.close();

    const first = await connectAtBeach(7, {
      stage: "firstActive",
      firstCrabKills: 10,
      secondCrabKills: 0,
      icedCoffee: 1
    });
    const firstTurnIn = await sendAndWait(first, { type: "beachQuestInteract", action: "turnInFirst" }, "beachQuestState");
    if (firstTurnIn.stage !== "firstComplete" || firstTurnIn.rewardCoins !== 20 || firstTurnIn.rewardExp !== 5) {
      throw new Error("first quest turn-in did not require/reward both completed objectives");
    }
    const secondAccept = await sendAndWait(first, { type: "beachQuestInteract", action: "acceptSecond" }, "beachQuestState");
    if (secondAccept.stage !== "secondActive") throw new Error("level-7 sequel did not unlock after first completion");
    first.close();

    const second = await connectAtBeach(7, {
      stage: "secondActive",
      firstCrabKills: 10,
      secondCrabKills: 25,
      icedCoffee: 0
    });
    const secondTurnIn = await sendAndWait(second, { type: "beachQuestInteract", action: "turnInSecond" }, "beachQuestState");
    if (secondTurnIn.stage !== "complete" || secondTurnIn.rewardCoins !== 50 || secondTurnIn.rewardExp !== 10) {
      throw new Error("25-crab revenge quest turn-in failed");
    }
    second.close();

    console.log("Beach Girl questline WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
