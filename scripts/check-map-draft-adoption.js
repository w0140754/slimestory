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

// Re-applying from an editor tab that already knows the newly assigned content
// version must remain clean/idempotent even before the multiplayer process is restarted.
const secondPayload = { ...payload, worldContentVersion: first.version };
const second = adoptDraftPayload(secondPayload, { worldContent: WORLD_CONTENT, dataPath, browserPath });
assert.strictEqual(second.changed, false);
assert.strictEqual(second.version, first.version);
assert.strictEqual(second.warnings.some(warning => /world content/i.test(warning)), false);


const newMapId = "adoptionNewMapTest";
const newMapPayload = {
  editorBuild: "372-test",
  worldContentVersion: second.version,
  schemaVersion: WORLD_CONTENT.schemaVersion,
  createNewMap: true,
  mapId: newMapId,
  map: {
    name: "Adoption New Map Test",
    dimensions: { width: 320, height: 240 },
    playerSpawns: [{ id: "center", x: 160, y: 120 }],
    portals: [],
    environment: { trees: [], tallGrass: [], rocks: [], sceneryRocks: [], harvestFlowers: [], houses: [] },
    npcs: [],
    enemySpawns: [{ id: `${newMapId}:slime:1`, type: "slime", variant: "purple", level: 4, x: 185, y: 120 }],
    terrain: { cellSize: 8, defaultType: "grass", regions: [] },
    collision: { waterRects: [] }
  }
};
const created = adoptDraftPayload(newMapPayload, { worldContent: WORLD_CONTENT, dataPath, browserPath });
assert.strictEqual(created.ok, true);
assert.strictEqual(created.changed, true);
const storeWithNewMap = loadStore(dataPath);
assert(storeWithNewMap.maps[newMapId], "new map was not persisted into adopted-map-overrides.json");
assert.strictEqual(storeWithNewMap.maps[newMapId].enemySpawns[0].variant, "purple");
const newMapReapply = adoptDraftPayload({ ...newMapPayload, createNewMap: false, worldContentVersion: created.version }, { worldContent: WORLD_CONTENT, dataPath, browserPath });
assert.strictEqual(newMapReapply.changed, false, "a newly created map should re-apply cleanly after it exists in the canonical store");

console.log("Map draft adoption OK: existing maps remain idempotent and brand-new editor maps persist safely.");
