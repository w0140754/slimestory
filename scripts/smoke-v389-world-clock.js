"use strict";
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const root = path.join(__dirname, "..");
const port = 43389;
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    function onMessage(raw) {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const pending = waitForMessage(socket, "welcome");
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, welcome: await pending };
}

(async () => {
  try {
    await delay(500);
    const first = await connect();
    if (first.welcome.buildVersion !== "6-11-427") throw new Error(`unexpected build ${first.welcome.buildVersion}`);
    const clock1 = first.welcome.worldClock;
    if (!clock1 || clock1.realMsPerGameMinute !== 500) throw new Error(`invalid world clock: ${JSON.stringify(clock1)}`);
    if (!Number.isFinite(clock1.gameMinutes) || clock1.gameMinutes < 480 || clock1.gameMinutes > 490) {
      throw new Error(`world clock should begin near 08:00, got ${clock1.gameMinutes}`);
    }

    await delay(650);
    const second = await connect();
    const clock2 = second.welcome.worldClock;
    if (!clock2 || clock2.gameMinutes <= clock1.gameMinutes) {
      throw new Error(`world clock did not advance between connections: ${clock1.gameMinutes} -> ${clock2?.gameMinutes}`);
    }
    const advanced = clock2.gameMinutes - clock1.gameMinutes;
    if (advanced < 0.8 || advanced > 3.5) throw new Error(`unexpected shared clock advance ${advanced}`);

    first.socket.close();
    second.socket.close();
    console.log("v389 world-clock WebSocket smoke passed: server starts near 08:00 and later clients receive the same advancing shared clock anchor without a clock heartbeat.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
