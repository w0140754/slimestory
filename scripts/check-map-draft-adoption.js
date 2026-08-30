"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const { adoptDraftPayload, loadStore, browserModuleSource } = require("../tools/map-draft-adoption.js");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slime-story-adopt-"));
const dataPath = path.join(temp, "content", "adopted-map-overrides.json");
const browserPath = path.join(temp, "public", "shared", "adopted-map-overrides.js");
const mapId = "prototypeIsland";
const map = JSON.parse(JSON.stringify(WORLD_CONTENT.maps[mapId]));
map.playerSpawns[0].x += 1;
map.environment.sceneryRocks[0].x += 7;
const payload = {
  editorBuild: "287-test",
  worldContentVersion: WORLD_CONTENT.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  mapId,
  map
};

const first = adoptDraftPayload(payload, { worldContent: WORLD_CONTENT, dataPath, browserPath });
assert.strictEqual(first.ok, true);
assert.strictEqual(first.changed, true);
assert(fs.existsSync(dataPath));
assert(fs.existsSync(browserPath));
const stored = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assert.strictEqual(stored.maps[mapId].playerSpawns[0].x, map.playerSpawns[0].x);
assert.strictEqual(stored.maps[mapId].environment.sceneryRocks[0].x, map.environment.sceneryRocks[0].x);
assert.strictEqual(stored.version, Number(WORLD_CONTENT.version) + 1);

// Simulate what the browser sees: generate the bootstrap directly from the
// canonical JSON store, then load world-content.js in a browser-like VM.
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(browserModuleSource(loadStore(dataPath)), sandbox, { filename: "adopted-map-overrides.js" });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "shared", "world-content.js"), "utf8"), sandbox, { filename: "world-content.js" });
assert.strictEqual(sandbox.WORLD_CONTENT.version, stored.version);
assert.strictEqual(sandbox.WORLD_CONTENT.maps[mapId].playerSpawns[0].x, map.playerSpawns[0].x);
assert.strictEqual(sandbox.WORLD_CONTENT.maps[mapId].environment.sceneryRocks[0].x, map.environment.sceneryRocks[0].x);

// Re-applying from an editor tab that already knows the newly assigned content
// version must remain clean/idempotent even before the multiplayer process is restarted.
const secondPayload = { ...payload, worldContentVersion: first.version };
const second = adoptDraftPayload(secondPayload, { worldContent: WORLD_CONTENT, dataPath, browserPath });
assert.strictEqual(second.changed, false);
assert.strictEqual(second.version, first.version);
assert.strictEqual(second.warnings.some(warning => /world content/i.test(warning)), false);
console.log("Map draft adoption OK: canonical JSON persisted, browser runtime resolves the same map, and idempotent re-apply stays version-clean.");
