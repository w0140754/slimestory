"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MAP_DRAFT_FORMAT = require("../public/shared/map-draft-format.js");
const TERRAIN_RULES = require("../public/shared/terrain-rules.js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DATA_PATH = path.join(ROOT, "content", "adopted-map-overrides.json");
const DEFAULT_BROWSER_PATH = path.join(ROOT, "public", "shared", "adopted-map-overrides.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapSignature(map) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(map || null))
    .digest("hex")
    .slice(0, 16);
}

function loadStore(dataPath = DEFAULT_DATA_PATH, fallbackVersion = 14) {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root is not an object");
    if (!parsed.maps || typeof parsed.maps !== "object" || Array.isArray(parsed.maps)) parsed.maps = {};
    if (!Number.isFinite(Number(parsed.version))) parsed.version = fallbackVersion;
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") return { version: fallbackVersion, maps: {} };
    throw new Error(`Could not read adopted map store: ${error.message}`);
  }
}

function browserModuleSource(store) {
  const json = JSON.stringify(store, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");
  return `(function (root, factory) {\n  const data = factory();\n  if (typeof module !== "undefined" && module.exports) module.exports = data;\n  if (root) root.ADOPTED_MAP_OVERRIDES = data;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n  return Object.freeze(${json});\n});\n`;
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.renameSync(temporary, filePath);
}

function writeStore(store, dataPath = DEFAULT_DATA_PATH, browserPath = DEFAULT_BROWSER_PATH) {
  atomicWrite(dataPath, `${JSON.stringify(store, null, 2)}\n`);
  atomicWrite(browserPath, browserModuleSource(store));
}

function adoptDraftPayload(payload, options = {}) {
  const worldContent = options.worldContent || require("../public/shared/world-content.js");
  const dataPath = options.dataPath || DEFAULT_DATA_PATH;
  const browserPath = options.browserPath || DEFAULT_BROWSER_PATH;
  const store = loadStore(dataPath, Number(worldContent.version) || 14);

  // Validate against the latest canonical-on-disk state, not merely the
  // currently running Node process. Applying a draft increments the store
  // version immediately, while the multiplayer runtime intentionally stays on
  // its old snapshot until restart. Using the store here keeps repeated editor
  // applies coherent during that restart window.
  const validationWorldContent = {
    ...worldContent,
    version: Math.max(Number(worldContent.version) || 0, Number(store.version) || 0, 14),
    defaultPlayerLoad: store.defaultPlayerLoad || worldContent.defaultPlayerLoad || null,
    maps: {
      ...(worldContent.maps || {}),
      ...(store.maps || {})
    }
  };

  const result = MAP_DRAFT_FORMAT.validate(payload, validationWorldContent, TERRAIN_RULES);
  if (!result.ok) {
    const error = new Error(result.errors.join("\n"));
    error.validationErrors = result.errors.slice();
    error.validationWarnings = result.warnings.slice();
    throw error;
  }

  const mapId = result.mapId;
  const nextMap = clone(result.map);

  // The editor carries defaultPlayerSpawnId inside the one-map draft because
  // that is the most natural UI location. Canonically, however, there can be
  // only one game loading target, so persist it as top-level store metadata.
  // This avoids touching any unrelated authored data on other maps.
  const requestedDefaultSpawnId =
    typeof nextMap.defaultPlayerSpawnId === "string"
      ? nextMap.defaultPlayerSpawnId
      : "";
  delete nextMap.defaultPlayerSpawnId;

  const previousDefaultLoad = store.defaultPlayerLoad || null;
  let nextDefaultLoad = previousDefaultLoad;
  if (requestedDefaultSpawnId) {
    nextDefaultLoad = { mapId, spawnId: requestedDefaultSpawnId };
  } else if (previousDefaultLoad?.mapId === mapId) {
    nextDefaultLoad = null;
  }

  const currentMap = store.maps[mapId];
  const mapChanged = JSON.stringify(currentMap || null) !== JSON.stringify(nextMap);
  const defaultLoadChanged =
    JSON.stringify(previousDefaultLoad) !== JSON.stringify(nextDefaultLoad);
  const changed = mapChanged || defaultLoadChanged;

  if (changed) {
    if (mapChanged) store.maps[mapId] = nextMap;
    if (nextDefaultLoad) store.defaultPlayerLoad = nextDefaultLoad;
    else delete store.defaultPlayerLoad;
    const currentVersion = Math.max(Number(store.version) || 0, Number(worldContent.version) || 0, 14);
    store.version = currentVersion + 1;
    writeStore(store, dataPath, browserPath);
  }

  return {
    ok: true,
    changed,
    mapId,
    version: Number(store.version) || Number(worldContent.version) || 14,
    signature: mapSignature(store.maps[mapId] || nextMap),
    defaultPlayerLoad: store.defaultPlayerLoad || null,
    warnings: result.warnings.slice()
  };
}

module.exports = {
  DEFAULT_DATA_PATH,
  DEFAULT_BROWSER_PATH,
  loadStore,
  browserModuleSource,
  mapSignature,
  adoptDraftPayload
};

