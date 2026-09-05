"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const server = read("server.js");
const app = read("public", "client-app.js");
const game = read("public", "game.js");
const editor = read("public", "map-editor.js");
const enemies = read("public", "client-enemies.js");
const worldSource = read("public", "shared", "world-content.js");
const pkg = JSON.parse(read("package.json"));

assert(server.includes('const BUILD_VERSION = "6-11-380";'), "server build is not 6-11-380");
assert(read("public", "client-config.js").includes('const CLIENT_BUILD_VERSION = "6-11-380";'), "client build is not 6-11-380");
assert(pkg.version === "0.6.11.380", "package version is not 0.6.11.380");

for (const [file, marker] of [
  ["attack_potion_v2.png", "attack potion"],
  ["magic_potion_v2.png", "magic potion"]
]) {
  const bytes = fs.readFileSync(path.join(root, "public", "assets", file));
  assert(bytes.length > 32, `${marker} asset is empty`);
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${marker} asset is not PNG`);
  assert(bytes.readUInt32BE(16) === 16 && bytes.readUInt32BE(20) === 16, `${marker} asset must be 16x16`);
}
assert(enemies.includes('attackPotionImage.src = "assets/attack_potion_v2.png?v=347"'), "attack potion does not use supplied sprite");
assert(enemies.includes('magicPotionImage.src = "assets/magic_potion_v2.png?v=347"'), "magic potion does not use supplied sprite");

assert(game.includes("function sharedDefaultPlayerLoadTarget()"), "client global load-target resolver missing");
assert(app.includes("const initialPlayerLoadTarget = sharedDefaultPlayerLoadTarget();"), "startup does not resolve global load target");
assert(app.includes("activateMap(initialPlayerLoadTarget.mapId, initialPlayerLoadTarget.spawnId);"), "startup still hardcodes Spawn Clearing");
assert(server.includes("function defaultPlayerLoadTarget()"), "server global load-target resolver missing");
assert(server.includes("const initialLoad = defaultPlayerLoadState();"), "server connection still hardcodes Spawn Clearing");
assert(worldSource.includes("defaultPlayerLoad,"), "WORLD_CONTENT does not expose global loading target");
assert(editor.includes("global loading position") && editor.includes("which map opens"), "editor copy does not describe map-aware loading position");

// Prove one-map adoption persists the loading choice as top-level metadata
// without rewriting another authored map.
const world = require(path.join(root, "public", "shared", "world-content.js"));
const { adoptDraftPayload } = require(path.join(root, "tools", "map-draft-adoption.js"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slime330-load-"));
const dataPath = path.join(temp, "adopted.json");
const browserPath = path.join(temp, "adopted.js");
const mapId = "prototypeIslandWest";
const map = JSON.parse(JSON.stringify(world.maps[mapId]));
const chosen = map.playerSpawns?.[0];
assert(chosen?.id, "prototypeIslandWest needs a player spawn for regression test");
map.defaultPlayerSpawnId = chosen.id;
const untouchedId = "prototypeIsland";
const untouchedBefore = JSON.stringify(world.maps[untouchedId]);
const payload = {
  editorBuild: "330",
  worldContentVersion: world.version,
  schemaVersion: world.schemaVersion,
  mapId,
  map
};
const result = adoptDraftPayload(payload, { worldContent: world, dataPath, browserPath });
assert(result.ok && result.defaultPlayerLoad?.mapId === mapId && result.defaultPlayerLoad?.spawnId === chosen.id, "adoption did not persist global load target");
const stored = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assert(stored.defaultPlayerLoad?.mapId === mapId && stored.defaultPlayerLoad?.spawnId === chosen.id, "stored global load target is wrong");
assert(!Object.prototype.hasOwnProperty.call(stored.maps[mapId], "defaultPlayerSpawnId"), "transient per-map default marker leaked into canonical map data");
assert(JSON.stringify(world.maps[untouchedId]) === untouchedBefore, "choosing a load target mutated another authored map in memory");

console.log("Potion art + map-aware player loading checks passed.");
