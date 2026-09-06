const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const PORT = 33482;
const URL = `ws://127.0.0.1:${PORT}/ws`;
const MAP_ID = "world_p0_p0";
const GRASS_ID = `${MAP_ID}:grass:test-permanent`;

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 4000) {
  const queuedIndex = (socket.__messageQueue || []).findIndex(message => message.type === type && predicate(message));
  if (queuedIndex >= 0) {
    return Promise.resolve(socket.__messageQueue.splice(queuedIndex, 1)[0]);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); reject(new Error(`timeout waiting for ${type}`)); }, timeoutMs);
    function onMessage(raw) {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timer); socket.off("message", onMessage);
      const index = (socket.__messageQueue || []).findIndex(item => item === message || (item.type === type && predicate(item)));
      if (index >= 0) socket.__messageQueue.splice(index, 1);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function connect() {
  const socket = new WebSocket(URL);
  socket.__messageQueue = [];
  socket.on("message", raw => {
    try { socket.__messageQueue.push(JSON.parse(String(raw))); } catch {}
  });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const welcome = await waitForMessage(socket, "welcome");
  if (welcome.buildVersion !== "6-11-390") throw new Error(`unexpected build ${welcome.buildVersion}`);
  return socket;
}

async function run() {
  const server = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; server.stderr.on("data", chunk => { stderr += String(chunk); });
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    const owner = await connect();
    owner.send(JSON.stringify({ type: "playerStatePatch", player: { mapId: MAP_ID, x: 96, y: 96, weaponIndex: 0, attackAimAngle: 0 } }));
    await new Promise(resolve => setTimeout(resolve, 80));

    owner.send(JSON.stringify({ type: "environmentCatalog", mapId: MAP_ID, entities: [{ id: GRASS_ID, kind: "grass", x: 112, y: 96, width: 13 }] }));
    await new Promise(resolve => setTimeout(resolve, 100));

    const cutPatch = waitForMessage(owner, "environmentPatch", m => m.mapId === MAP_ID && Array.isArray(m.entities) && m.entities.some(e => e.id === GRASS_ID && e.cut === true));
    owner.send(JSON.stringify({ type: "environmentAction", action: "cutGrass", entityId: GRASS_ID }));
    await cutPatch;

    // Re-registering the default catalog must not resurrect authoritative cut state.
    owner.send(JSON.stringify({ type: "environmentCatalog", mapId: MAP_ID, entities: [{ id: GRASS_ID, kind: "grass", x: 112, y: 96, width: 13 }] }));
    await new Promise(resolve => setTimeout(resolve, 80));

    const observer = await connect();
    const sparse = await waitForMessage(observer, "environmentSnapshot", m => m.mapId === MAP_ID && Array.isArray(m.entities) && m.entities.some(e => e.id === GRASS_ID));
    const grass = sparse.entities.find(e => e.id === GRASS_ID);
    if (!grass?.cut) throw new Error("cut grass resurrected for reconnecting player");

    owner.close(); observer.close();
    console.log("v382 permanent-grass WebSocket smoke passed: cut state survives catalog re-registration and reconnect snapshot.");
  } finally {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve)).catch(() => {});
    if (stderr && process.exitCode) process.stderr.write(stderr);
  }
}
run().catch(error => { console.error(error.stack || error); process.exit(1); });
