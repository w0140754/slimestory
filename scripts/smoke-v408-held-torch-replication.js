"use strict";

const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");
const root = path.join(__dirname, "..");
const port = 32408;
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

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const welcomePending = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const welcome = await welcomePending;
  if (welcome.buildVersion !== "6-11-468") throw new Error(`unexpected build ${welcome.buildVersion}`);
  return { socket, welcome };
}

(async () => {
  const sockets = [];
  try {
    await delay(500);
    const observer = await connect();
    sockets.push(observer.socket);
    const holder = await connect();
    sockets.push(holder.socket);

    // Make sure both clients are on the same authoritative map and have seen
    // one another before testing the durable held-item delta.
    const holderSeen = waitForMessage(observer.socket, "playerStateDelta", m => m.player?.heldBuildPiece === "torch");
    holder.socket.send(JSON.stringify({
      type: "playerStatePatch",
      player: { heldBuildPiece: "torch" }
    }));
    const held = await holderSeen;
    if (held.player.heldBuildPiece !== "torch") throw new Error("torch hold state did not replicate");

    const clearedSeen = waitForMessage(observer.socket, "playerStateDelta", m => Object.prototype.hasOwnProperty.call(m.player || {}, "heldBuildPiece") && m.player.heldBuildPiece === null);
    holder.socket.send(JSON.stringify({
      type: "playerStatePatch",
      player: { heldBuildPiece: null }
    }));
    await clearedSeen;

    console.log("v408 held-torch replication smoke passed: torch hold/unhold is a change-only player-state delta visible to other clients.");
  } finally {
    for (const socket of sockets) {
      try { socket.close(); } catch {}
    }
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
