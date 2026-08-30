"use strict";

const assert = require("assert");
const vm = require("vm");
const WORLD_CONTENT = require("../public/shared/world-content.js");
const {
  browserRuntimeWorldContentSource,
  runtimeWorldContentUrl,
  injectRuntimeWorldContentUrl
} = require("../tools/runtime-world-content.js");


const cacheUrl20 = runtimeWorldContentUrl("test-build", 20);
const cacheUrl21 = runtimeWorldContentUrl("test-build", 21);
assert.strictEqual(
  cacheUrl20,
  "/shared/world-content-runtime.js?build=test-build&world=20"
);
assert.notStrictEqual(
  cacheUrl20,
  cacheUrl21,
  "world-content URL must change when the canonical world version changes"
);

const sampleHtml = '<script src="/shared/world-content-runtime.js?v=old"></script>';
const injectedHtml = injectRuntimeWorldContentUrl(sampleHtml, "test-build", 21);
assert.ok(
  injectedHtml.includes('/shared/world-content-runtime.js?build=test-build&world=21'),
  "HTML did not receive a world-versioned runtime-content URL"
);
assert.ok(!injectedHtml.includes('?v=old'), "old runtime-content cache key survived injection");

const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  browserRuntimeWorldContentSource(WORLD_CONTENT),
  sandbox,
  { filename: "world-content-runtime.js" }
);

assert.ok(sandbox.WORLD_CONTENT, "runtime script did not define WORLD_CONTENT");
assert.strictEqual(sandbox.WORLD_CONTENT.version, WORLD_CONTENT.version);
assert.strictEqual(sandbox.WORLD_CONTENT.schemaVersion, WORLD_CONTENT.schemaVersion);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sandbox.WORLD_CONTENT.maps)),
  JSON.parse(JSON.stringify(WORLD_CONTENT.maps)),
  "browser runtime world content diverged from server WORLD_CONTENT"
);

const map = sandbox.WORLD_CONTENT.maps.prototypeIsland;
assert.ok(map, "Prototype Island missing from runtime content");
assert.ok(Array.isArray(map.environment?.rocks), "Prototype Island rocks missing");
assert.ok(Array.isArray(map.terrain?.regions), "Prototype Island terrain missing");

console.log(
  `runtime world content roundtrip ok: v${sandbox.WORLD_CONTENT.version}, ` +
  `${map.environment.rocks.length} rocks, ${map.terrain.regions.length} terrain regions`
);
