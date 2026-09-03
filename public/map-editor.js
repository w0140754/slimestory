(() => {
  "use strict";

  const BUILD = "363";
  const canvas = document.getElementById("mapCanvas");
  const viewport = document.getElementById("viewport");
  const ctx = canvas.getContext("2d", { alpha: true });

  const mapSelect = document.getElementById("mapSelect");
  const brushSizeSelect = document.getElementById("brushSize");
  const terrainTools = Array.from(document.querySelectorAll(".terrain-tool"));
  const paletteTools = Array.from(document.querySelectorAll(".palette-tool"));
  const selectModeButton = document.getElementById("selectModeButton");
  const terrainModeButton = document.getElementById("terrainModeButton");
  const terrainSection = document.getElementById("terrainSection");
  const undoButton = document.getElementById("undoButton");
  const redoButton = document.getElementById("redoButton");
  const resetButton = document.getElementById("resetButton");
  const fitMapButton = document.getElementById("fitMapButton");
  const importButton = document.getElementById("importButton");
  const importFileInput = document.getElementById("importFileInput");
  const exportButton = document.getElementById("exportButton");
  const applyButton = document.getElementById("applyButton");
  const modeBadge = document.getElementById("modeBadge");

  const inspectorEmpty = document.getElementById("inspectorEmpty");
  const inspectorContent = document.getElementById("inspectorContent");
  const selectionType = document.getElementById("selectionType");
  const selectionId = document.getElementById("selectionId");
  const propertyFields = document.getElementById("propertyFields");
  const duplicateButton = document.getElementById("duplicateButton");
  const deleteButton = document.getElementById("deleteButton");

  const layers = {
    terrain: document.getElementById("layerTerrain"),
    objects: document.getElementById("layerObjects"),
    entities: document.getElementById("layerEntities"),
    portals: document.getElementById("layerPortals"),
    grid: document.getElementById("layerGrid")
  };

  const statusMap = document.getElementById("statusMap");
  const statusPointer = document.getElementById("statusPointer");
  const statusTerrain = document.getElementById("statusTerrain");
  const statusZoom = document.getElementById("statusZoom");
  const statusDirty = document.getElementById("statusDirty");

  if (!window.WORLD_CONTENT || !window.TERRAIN_RULES || !window.TERRAIN_PRESENTATION || !window.MAP_DRAFT_FORMAT) {
    throw new Error("Map editor dependencies failed to load.");
  }

  const editableMapIds = Object.keys(WORLD_CONTENT.maps).filter(id => {
    const definition = WORLD_CONTENT.maps[id];
    return Boolean(definition?.terrain && definition?.dimensions);
  });

  if (editableMapIds.length === 0) {
    throw new Error("No terrain-driven maps are available to edit.");
  }

  const clone = value => JSON.parse(JSON.stringify(value));
  const drafts = new Map();
  let mapId = editableMapIds.includes("prototypeIsland") ? "prototypeIsland" : editableMapIds[0];
  let draft = null;
  let activeTerrain = "grass";
  let brushSize = 1;
  let editorMode = "select"; // select | paint | place
  let placeKind = null;
  let selectionKey = null;
  let camera = { x: 0, y: 0, zoom: 1 };
  let cssWidth = 1;
  let cssHeight = 1;
  let pointerWorld = null;
  let pointerDown = false;
  let panning = false;
  let spaceHeld = false;
  let panOrigin = null;
  let strokeBefore = null;
  let lastPaintCell = null;
  let dragState = null;
  let framePending = false;
  let waterAnimationTimer = null;
  let canonicalWorldContentVersion = Number(WORLD_CONTENT.version) || 14;

  const editorRedHouseImage = new Image();
  editorRedHouseImage.src = "./assets/house_red.png";
  const editorRockPlainImage = new Image();
  editorRockPlainImage.src = "./assets/rock_plain.png";
  const editorRockGrassImage = new Image();
  editorRockGrassImage.src = "./assets/rock_grass.png";
  const editorSceneryRockImage = new Image();
  editorSceneryRockImage.src = "./assets/scenery_grassy_rock_v2.png";
  const editorShopkeeperNpcImage = new Image();
  editorShopkeeperNpcImage.src = "./assets/shopkeeper_npc_v1.png?v=347";
  const editorHunterNpcImage = new Image();
  editorHunterNpcImage.src = "./assets/hunter_npc_v1.png?v=347";
  const editorJesterNpcImage = new Image();
  editorJesterNpcImage.src = "./assets/jester_npc_v1.png?v=347";
  const editorWoodBenchImage = new Image();
  editorWoodBenchImage.src = "./assets/wood_bench_v2.png?v=347";
  const editorClassResetCrystalImage = new Image();
  editorClassResetCrystalImage.src = "./assets/class_reset_crystal.png?v=347";

  const HOUSE_WIDTH = 64;
  const HOUSE_HEIGHT = 64;
  const HOUSE_COLLISION_WIDTH = 48;
  const HOUSE_COLLISION_HEIGHT = 30;
  editorRedHouseImage.addEventListener("load", () => requestRender());
  editorShopkeeperNpcImage.addEventListener("load", () => requestRender());
  editorHunterNpcImage.addEventListener("load", () => requestRender());
  editorJesterNpcImage.addEventListener("load", () => requestRender());
  editorWoodBenchImage.addEventListener("load", () => requestRender());
  editorClassResetCrystalImage.addEventListener("load", () => requestRender());

  for (const id of editableMapIds) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = WORLD_CONTENT.maps[id].name || id;
    mapSelect.append(option);
  }
  mapSelect.value = mapId;

  function sourceMapDefinition(id = mapId) {
    return WORLD_CONTENT.maps[id];
  }

  function ensureMapCollections(map) {
    if (!map.environment) map.environment = {};
    for (const key of ["trees", "tallGrass", "rocks", "sceneryRocks", "harvestFlowers", "houses"]) {
      if (!Array.isArray(map.environment[key])) map.environment[key] = [];
    }
    if (!Array.isArray(map.npcs)) map.npcs = [];
    if (!Array.isArray(map.enemySpawns)) map.enemySpawns = [];
    if (!Array.isArray(map.playerSpawns)) map.playerSpawns = [];
    if (!Array.isArray(map.portals)) map.portals = [];
  }

  function terrainCellsFromMap(map) {
    const cellSize = TERRAIN_RULES.cellSize(map);
    const width = Number(map.dimensions.width);
    const height = Number(map.dimensions.height);
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const cells = new Array(cols * rows);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        cells[row * cols + col] = TERRAIN_RULES.terrainTypeAt(map, x, y) || "void";
      }
    }

    return { cellSize, width, height, cols, rows, cells };
  }

  function captureState(targetDraft = draft) {
    return {
      cells: targetDraft.cells.slice(),
      map: clone(targetDraft.map)
    };
  }

  function stateSignature(state) {
    return JSON.stringify(state);
  }

  function createDraft(id) {
    const source = clone(sourceMapDefinition(id));
    ensureMapCollections(source);

    const configuredLoad = WORLD_CONTENT.defaultPlayerLoad;
    if (
      configuredLoad?.mapId === id &&
      source.playerSpawns.some(spawn => spawn?.id === configuredLoad.spawnId)
    ) {
      source.defaultPlayerSpawnId = configuredLoad.spawnId;
    }

    const terrain = terrainCellsFromMap(source);
    const sourceState = {
      cells: terrain.cells.slice(),
      map: clone(source)
    };

    return {
      mapId: id,
      cellSize: terrain.cellSize,
      width: terrain.width,
      height: terrain.height,
      cols: terrain.cols,
      rows: terrain.rows,
      cells: terrain.cells,
      map: source,
      sourceState,
      sourceSignature: stateSignature(sourceState),
      undo: [],
      redo: [],
      dirty: false,
      importedFrom: null
    };
  }

  function getDraft(id) {
    if (!drafts.has(id)) drafts.set(id, createDraft(id));
    return drafts.get(id);
  }

  function refreshDirty() {
    draft.dirty = stateSignature(captureState()) !== draft.sourceSignature;
  }

  function restoreState(state) {
    draft.cells = state.cells.slice();
    draft.map = clone(state.map);
    ensureMapCollections(draft.map);
    refreshDirty();
    if (selectionKey && !resolveSelection()) selectionKey = null;
    updateUI();
    requestRender();
  }

  function pushHistory(label, before) {
    const after = captureState();
    if (stateSignature(before) === stateSignature(after)) {
      refreshDirty();
      updateUI();
      return false;
    }
    draft.undo.push({ label, before, after });
    if (draft.undo.length > 100) draft.undo.shift();
    draft.redo.length = 0;
    refreshDirty();
    updateUI();
    requestRender();
    return true;
  }

  function undo() {
    const entry = draft.undo.pop();
    if (!entry) return;
    draft.redo.push(entry);
    restoreState(entry.before);
  }

  function redo() {
    const entry = draft.redo.pop();
    if (!entry) return;
    draft.undo.push(entry);
    restoreState(entry.after);
  }

  function typeAtWorld(x, y) {
    if (!draft || x < 0 || y < 0 || x >= draft.width || y >= draft.height) return "void";
    const col = Math.floor(x / draft.cellSize);
    const row = Math.floor(y / draft.cellSize);
    if (col < 0 || row < 0 || col >= draft.cols || row >= draft.rows) return "void";
    return draft.cells[row * draft.cols + col] || "void";
  }

  function setMap(id, fit = true) {
    mapId = id;
    mapSelect.value = id;
    draft = getDraft(id);
    selectionKey = null;
    lastPaintCell = null;
    strokeBefore = null;
    dragState = null;
    pointerWorld = null;
    if (fit) fitMap();
    updateUI();
    requestRender();
  }

  function clampZoom(value) {
    return Math.max(0.35, Math.min(5, value));
  }

  function fitMap() {
    if (!draft) return;
    const availableW = Math.max(1, cssWidth - 70);
    const availableH = Math.max(1, cssHeight - 70);
    camera.zoom = clampZoom(Math.min(availableW / draft.width, availableH / draft.height));
    camera.x = draft.width / 2;
    camera.y = draft.height / 2;
    requestRender();
    updateStatus();
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: camera.x + (sx - cssWidth / 2) / camera.zoom,
      y: camera.y + (sy - cssHeight / 2) / camera.zoom
    };
  }

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    cssWidth = Math.max(1, Math.floor(rect.width));
    cssHeight = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetW = Math.max(1, Math.round(cssWidth * dpr));
    const targetH = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    requestRender();
  }

  function requestRender() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(render);
  }

  function withWorldTransform(callback) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.setTransform(
      dpr * camera.zoom, 0, 0, dpr * camera.zoom,
      dpr * (cssWidth / 2 - camera.x * camera.zoom),
      dpr * (cssHeight / 2 - camera.y * camera.zoom)
    );
    callback();
  }

  function visibleWorldBounds(padding = 0) {
    const halfW = cssWidth / (2 * camera.zoom);
    const halfH = cssHeight / (2 * camera.zoom);
    return {
      left: camera.x - halfW - padding,
      right: camera.x + halfW + padding,
      top: camera.y - halfH - padding,
      bottom: camera.y + halfH + padding
    };
  }

  function drawTerrainSouthFaces() {
    if (!layers.terrain.checked) return;
    const size = draft.cellSize;
    const depth = 10;
    const bounds = visibleWorldBounds(depth + size);
    const styles = {
      grass: { face: "#855b3b", band: "#725036", bottom: "#543723" },
      dirt: { face: "#855b3b", band: "#725036", bottom: "#543723" },
      sand: { face: "#bea36d", band: "#a68e61", bottom: "#806946" },
      water: { face: "#315e76", band: "#294f65", bottom: "#1f3d50" }
    };

    for (let row = 0; row < draft.rows; row += 1) {
      const edgeY = (row + 1) * size;
      if (edgeY < bounds.top || edgeY > bounds.bottom) continue;

      let active = null;
      const flush = endCol => {
        if (!active) return;
        const style = styles[active.type];
        const x = active.startCol * size;
        const width = (endCol - active.startCol) * size;
        ctx.fillStyle = style.face;
        ctx.fillRect(x, edgeY, width, depth);
        ctx.fillStyle = style.band;
        ctx.fillRect(x, edgeY + 3, width, 2);
        ctx.fillStyle = style.bottom;
        ctx.fillRect(x, edgeY + depth, width, 2);
        active = null;
      };

      for (let col = 0; col < draft.cols; col += 1) {
        const type = draft.cells[row * draft.cols + col];
        const below = row + 1 < draft.rows
          ? draft.cells[(row + 1) * draft.cols + col]
          : "void";
        const visibleFace = Boolean(styles[type]) && below === "void";

        if (!visibleFace) {
          flush(col);
          continue;
        }

        if (!active) {
          active = { type, startCol: col };
          continue;
        }

        if (active.type !== type) {
          flush(col);
          active = { type, startCol: col };
        }
      }

      flush(draft.cols);
    }
  }

  function renderTerrain(nowSeconds) {
    if (!layers.terrain.checked) return;
    const size = draft.cellSize;
    const bounds = visibleWorldBounds(size);
    const startCol = Math.max(0, Math.floor(bounds.left / size));
    const endCol = Math.min(draft.cols - 1, Math.floor(bounds.right / size));
    const startRow = Math.max(0, Math.floor(bounds.top / size));
    const endRow = Math.min(draft.rows - 1, Math.floor(bounds.bottom / size));

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const type = draft.cells[row * draft.cols + col];
        if (!type || type === "void") continue;
        const palette = TERRAIN_PRESENTATION.PALETTE[type];
        if (!palette) continue;
        const x = col * size;
        const y = row * size;
        ctx.fillStyle = palette.base;
        ctx.fillRect(x, y, size, size);
        TERRAIN_PRESENTATION.drawCellTexture(ctx, type, x, y, x, y, size, nowSeconds);
        TERRAIN_PRESENTATION.drawTransitions(ctx, type, x, y, x, y, size, typeAtWorld, nowSeconds);
      }
    }

    drawTerrainSouthFaces();
  }

  function drawMapBounds() {
    ctx.save();
    ctx.lineWidth = Math.max(1 / camera.zoom, 1);
    ctx.strokeStyle = "rgba(218,230,210,.32)";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(0, 0, draft.width, draft.height);
    ctx.restore();
  }

  function renderGrid() {
    if (!layers.grid.checked || camera.zoom < 0.7) return;
    const size = draft.cellSize;
    const bounds = visibleWorldBounds(size);
    const startX = Math.max(0, Math.floor(bounds.left / size) * size);
    const endX = Math.min(draft.width, Math.ceil(bounds.right / size) * size);
    const startY = Math.max(0, Math.floor(bounds.top / size) * size);
    const endY = Math.min(draft.height, Math.ceil(bounds.bottom / size) * size);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(230,240,225,.13)";
    ctx.lineWidth = 1 / camera.zoom;
    for (let x = startX; x <= endX; x += size) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += size) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTree(tree) {
    const interactive = tree.nonInteractive === false;
    ctx.fillStyle = interactive ? "#3f7d3b" : "#315f35";
    ctx.strokeStyle = interactive ? "#b6d777" : "#6f9870";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y - 7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#765239";
    ctx.fillRect(tree.x - 2, tree.y - 2, 4, 8);
  }

  function drawTallGrass(grass) {
    ctx.strokeStyle = "#7fb860";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -4; i <= 4; i += 4) {
      ctx.moveTo(grass.x + i, grass.y + 4);
      ctx.lineTo(grass.x + i + 1, grass.y - 4);
    }
    ctx.stroke();
  }

  function drawRock(rock) {
    const image = rock.variant === "grass" ? editorRockGrassImage : editorRockPlainImage;
    if (image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, rock.x - 8, rock.y - 16);
      return;
    }

    ctx.fillStyle = rock.variant === "grass" ? "#71856b" : "#777873";
    ctx.strokeStyle = "#292d29";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rock.x, rock.y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawSceneryRock(rock) {
    if (editorSceneryRockImage.complete && editorSceneryRockImage.naturalWidth > 0) {
      ctx.drawImage(editorSceneryRockImage, rock.x - 8, rock.y - 18);
      return;
    }

    ctx.fillStyle = "#697467";
    ctx.strokeStyle = "#b5c0ad";
    ctx.lineWidth = 1;
    ctx.fillRect(rock.x - 8, rock.y - 18, 16, 18);
    ctx.strokeRect(rock.x - 8, rock.y - 18, 16, 18);
  }

  function drawHarvestFlower(flower) {
    const type = flower.type === "blue" ? "blue" : "white";
    ctx.fillStyle = "#568447";
    ctx.fillRect(flower.x, flower.y - 8, 1, 8);
    ctx.fillStyle = "#6da259";
    ctx.fillRect(flower.x - 2, flower.y - 4, 2, 1);
    ctx.fillRect(flower.x + 1, flower.y - 6, 2, 1);
    ctx.fillStyle = type === "blue" ? "#79a9e8" : "#f2efe3";
    ctx.strokeStyle = type === "blue" ? "#36547c" : "#8d8775";
    ctx.lineWidth = 1;
    ctx.fillRect(flower.x - 3, flower.y - 13, 7, 5);
    ctx.strokeRect(flower.x - 3, flower.y - 13, 7, 5);
    ctx.fillStyle = "#e4bd55";
    ctx.fillRect(flower.x, flower.y - 11, 1, 1);
  }

  function drawHouse(house) {
    const variant = house.variant === "red" ? "red" : "default";
    const left = house.x - HOUSE_WIDTH / 2;
    const top = house.y - (HOUSE_HEIGHT - 1);

    // Ground/path hint matches the house's bottom-centre anchor used in-game.
    ctx.fillStyle = "rgba(139,121,73,.55)";
    ctx.fillRect(house.x - 8, house.y, 16, 18);

    if (variant === "red" && editorRedHouseImage.complete && editorRedHouseImage.naturalWidth > 0) {
      ctx.drawImage(editorRedHouseImage, left, top, HOUSE_WIDTH, HOUSE_HEIGHT);
      return;
    }

    // Lightweight editor preview for the original embedded house sprite.
    ctx.fillStyle = "#d8c99d";
    ctx.strokeStyle = "#554934";
    ctx.lineWidth = 1;
    ctx.fillRect(left + 8, top + 22, 48, 40);
    ctx.strokeRect(left + 8, top + 22, 48, 40);
    ctx.fillStyle = "#866047";
    ctx.beginPath();
    ctx.moveTo(left + 4, top + 25);
    ctx.lineTo(left + 32, top + 4);
    ctx.lineTo(left + 60, top + 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6c4d36";
    ctx.fillRect(house.x - 5, house.y - 20, 10, 19);
  }

  function npcImageForEditorType(type) {
    if (type === "hunter") return editorHunterNpcImage;
    if (type === "jester") return editorJesterNpcImage;
    if (type === "craftingTable") return editorWoodBenchImage;
    if (type === "classResetCrystal") return editorClassResetCrystalImage;
    return editorShopkeeperNpcImage;
  }

  function npcDisplayConfig(type) {
    switch (type) {
      case "hunter":
        return { label: "HUNTER", color: "#bfe2a8", fallback: "#6d8a62", width: 17, height: 20, shadow: true };
      case "jester":
        return { label: "JESTER", color: "#e3b6ef", fallback: "#8b6299", width: 16, height: 20, shadow: true };
      case "craftingTable":
        return { label: "CRAFT", color: "#ffd89b", fallback: "#9b6438", width: 18, height: 18, shadow: true };
      case "classResetCrystal":
        return { label: "CRYSTAL", color: "#9de6ef", fallback: "#5b9fb0", width: 32, height: 32, shadow: true };
      default:
        return { label: "SHOP", color: "#ffe06a", fallback: "#a77d50", width: 16, height: 16, shadow: true };
    }
  }

  function drawNpc(npc) {
    const allowed = ["shopkeeper", "hunter", "jester", "craftingTable", "classResetCrystal"];
    const type = allowed.includes(npc.type) ? npc.type : "shopkeeper";
    const image = npcImageForEditorType(type);
    const config = npcDisplayConfig(type);
    const naturalW = image.naturalWidth || config.width;
    const naturalH = image.naturalHeight || config.height;

    ctx.fillStyle = type === "classResetCrystal" ? "rgba(20,45,38,.24)" : "rgba(34,46,28,.28)";
    const shadowW = type === "craftingTable" || type === "classResetCrystal" ? 14 : 10;
    const shadowY = type === "shopkeeper" ? 0 : 1;
    ctx.fillRect(npc.x - Math.floor(shadowW / 2), npc.y + shadowY, shadowW, type === "classResetCrystal" ? 3 : 2);

    if (image.complete && image.naturalWidth > 0) {
      if (type === "classResetCrystal") {
        ctx.drawImage(image, Math.round(npc.x - 16), Math.round(npc.y - 31), 32, 32);
      } else {
        ctx.drawImage(image, Math.round(npc.x - naturalW / 2), Math.round(npc.y - naturalH));
      }
    } else {
      ctx.fillStyle = config.fallback;
      const fallbackH = type === "craftingTable" ? 10 : type === "classResetCrystal" ? 20 : 13;
      ctx.fillRect(npc.x - 6, npc.y - fallbackH, 12, fallbackH);
    }

    ctx.fillStyle = config.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "bold 6px monospace";
    const labelY = type === "classResetCrystal" ? npc.y - 34 : npc.y - naturalH - 2;
    ctx.fillText(config.label, npc.x, labelY);
  }

  function drawEnemySpawn(spawn) {
    const type = spawn.type || "slime";
    const marker = type === "mushroom"
      ? { fill: "#d86a46", text: "#fff0d1", label: "M" }
      : type === "crab"
        ? { fill: "#e9784f", text: "#35150d", label: "C" }
      : type === "goblin"
        ? { fill: "#7eb95c", text: "#102010", label: "G" }
        : type === "ghost"
          ? { fill: "#c9d4dd", text: "#24313b", label: "H" }
          : type === "bigGoldSlime"
            ? { fill: "#e0bd43", text: "#2b2107", label: "B" }
            : {
                fill: spawn.variant === "blue" ? "#64c7df" : "#9bdc81",
                text: "#102010",
                label: "S"
              };

    ctx.fillStyle = marker.fill;
    ctx.strokeStyle = "#172217";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(spawn.x, spawn.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = marker.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 7px monospace";
    ctx.fillText(marker.label, spawn.x, spawn.y + .5);
  }

  function drawPlayerSpawn(spawn) {
    const isDefaultLoad = draft.map.defaultPlayerSpawnId === spawn.id;
    if (isDefaultLoad) {
      ctx.strokeStyle = "#7fffd4";
      ctx.lineWidth = 1;
      ctx.strokeRect(spawn.x - 8, spawn.y - 8, 16, 16);
    }
    ctx.strokeStyle = isDefaultLoad ? "#7fffd4" : "#fff1a8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(spawn.x - 6, spawn.y);
    ctx.lineTo(spawn.x + 6, spawn.y);
    ctx.moveTo(spawn.x, spawn.y - 6);
    ctx.lineTo(spawn.x, spawn.y + 6);
    ctx.stroke();
    ctx.fillStyle = isDefaultLoad ? "#7fffd4" : "#fff1a8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 7px monospace";
    ctx.fillText(isDefaultLoad ? "LOAD" : "P", spawn.x + (isDefaultLoad ? 17 : 10), spawn.y - 7);
  }

  function drawPortal(portal) {
    ctx.fillStyle = "rgba(205,142,245,.22)";
    ctx.strokeStyle = "#d69af8";
    ctx.lineWidth = 1;
    ctx.fillRect(portal.x, portal.y, portal.width, portal.height);
    ctx.strokeRect(portal.x, portal.y, portal.width, portal.height);
    ctx.fillStyle = "#f0caff";
    ctx.font = "7px monospace";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`→ ${portal.targetMapId}`, portal.x + portal.width + 3, portal.y - 2);
  }

  function drawMapLandmarks(nowSeconds) {
    const landmarks = draft.map.landmarks;
    const waterfall = landmarks?.waterfall;
    if (!waterfall) return;

    const centerX = Number(waterfall.x);
    const topY = Number(waterfall.topY);
    const baseY = Number(waterfall.baseY);
    const width = Number(waterfall.width);
    const left = Number(waterfall.cliffLeft);
    const right = Number(waterfall.cliffRight);
    if (![centerX, topY, baseY, width, left, right].every(Number.isFinite)) return;

    const fallLeft = centerX - width / 2;
    const fallRight = centerX + width / 2;
    ctx.save();
    ctx.fillStyle = "#243b35";
    ctx.fillRect(left, topY - 8, right - left, baseY - topY + 18);
    ctx.fillStyle = "#405246";
    ctx.fillRect(left + 8, topY, fallLeft - left - 12, baseY - topY);
    ctx.fillRect(fallRight + 4, topY, right - fallRight - 12, baseY - topY);
    ctx.fillStyle = "#567b45";
    ctx.fillRect(left + 5, topY + 8, fallLeft - left - 14, 4);
    ctx.fillRect(fallRight + 8, topY + 14, right - fallRight - 16, 4);
    ctx.fillStyle = "#4d91aa";
    ctx.fillRect(fallLeft, topY, width, baseY - topY);
    ctx.fillStyle = "#75bfd0";
    ctx.fillRect(fallLeft + 8, topY, 14, baseY - topY);
    ctx.fillRect(centerX + 5, topY, 10, baseY - topY);
    const flow = Math.floor(nowSeconds * 20) % 18;
    ctx.fillStyle = "rgba(235,252,255,.86)";
    for (let y = topY + flow - 18; y < baseY; y += 18) {
      ctx.fillRect(fallLeft + 4, y, 20, 2);
      ctx.fillRect(centerX + 1, y + 7, 26, 2);
    }
    ctx.fillRect(centerX - 54, baseY - 2, 108, 4);
    ctx.fillRect(centerX - 68, baseY + 4, 136, 3);

    ctx.globalCompositeOperation = "screen";
    for (const beam of landmarks.lightBeams || []) {
      ctx.fillStyle = `rgba(255,249,195,${Number(beam.alpha) || .08})`;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.x + beam.width, beam.y);
      ctx.lineTo(beam.x + beam.width + beam.lean, beam.y + beam.height);
      ctx.lineTo(beam.x + beam.lean, beam.y + beam.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnvironmentObjects() {
    if (!layers.objects.checked) return;
    const env = draft.map.environment;
    ctx.save();
    for (const tree of env.trees) drawTree(tree);
    for (const grass of env.tallGrass) drawTallGrass(grass);
    for (const rock of env.rocks) drawRock(rock);
    for (const rock of env.sceneryRocks) drawSceneryRock(rock);
    for (const flower of env.harvestFlowers) drawHarvestFlower(flower);
    for (const house of env.houses) drawHouse(house);
    ctx.restore();
  }

  function drawEntities() {
    if (!layers.entities.checked) return;
    ctx.save();
    for (const npc of draft.map.npcs) drawNpc(npc);
    for (const spawn of draft.map.enemySpawns) drawEnemySpawn(spawn);
    for (const spawn of draft.map.playerSpawns) drawPlayerSpawn(spawn);
    ctx.restore();
  }

  function drawPortals() {
    if (!layers.portals.checked) return;
    ctx.save();
    for (const portal of draft.map.portals) drawPortal(portal);
    ctx.restore();
  }

  const groupConfig = {
    tree: { layer: "objects", label: "Tree", get: map => map.environment.trees },
    tallGrass: { layer: "objects", label: "Tall grass", get: map => map.environment.tallGrass },
    rock: { layer: "objects", label: "Throwable rock", get: map => map.environment.rocks },
    sceneryRock: { layer: "objects", label: "Scenery rock", get: map => map.environment.sceneryRocks },
    harvestFlower: { layer: "objects", label: "Harvest flower", get: map => map.environment.harvestFlowers },
    house: { layer: "objects", label: "House", get: map => map.environment.houses },
    npc: { layer: "entities", label: "NPC", get: map => map.npcs },
    enemySpawn: { layer: "entities", label: "Enemy spawn", get: map => map.enemySpawns },
    playerSpawn: { layer: "entities", label: "Player spawn", get: map => map.playerSpawns },
    portal: { layer: "portals", label: "Portal", get: map => map.portals }
  };

  function descriptorsForKind(kind) {
    const config = groupConfig[kind];
    if (!config) return [];
    return config.get(draft.map).map(item => ({ kind, item, config }));
  }

  function resolveSelection() {
    if (!selectionKey) return null;
    const config = groupConfig[selectionKey.kind];
    if (!config) return null;
    const array = config.get(draft.map);
    const item = array.find(candidate => candidate.id === selectionKey.id);
    return item ? { kind: selectionKey.kind, item, config, array } : null;
  }

  function descriptorBounds(descriptor) {
    const { kind, item } = descriptor;
    if (kind === "portal") {
      return { x: item.x, y: item.y, width: item.width, height: item.height };
    }
    if (kind === "tree") return { x: item.x - 10, y: item.y - 18, width: 20, height: 27 };
    if (kind === "tallGrass") return { x: item.x - 8, y: item.y - 7, width: 16, height: 14 };
    if (kind === "rock") return { x: item.x - 7, y: item.y - 7, width: 14, height: 14 };
    if (kind === "sceneryRock") return { x: item.x - 6, y: item.y - 5, width: 12, height: 10 };
    if (kind === "harvestFlower") return { x: item.x - 8, y: item.y - 16, width: 16, height: 17 };
    if (kind === "house") return { x: item.x - HOUSE_WIDTH / 2, y: item.y - (HOUSE_HEIGHT - 1), width: HOUSE_WIDTH, height: HOUSE_HEIGHT + 18 };
    if (kind === "npc") {
      const type = item.type;
      if (type === "classResetCrystal") return { x: item.x - 16, y: item.y - 31, width: 32, height: 35 };
      if (type === "craftingTable") return { x: item.x - 10, y: item.y - 18, width: 20, height: 21 };
      return { x: item.x - 10, y: item.y - 24, width: 20, height: 27 };
    }
    return { x: item.x - 8, y: item.y - 8, width: 16, height: 16 };
  }

  function layerVisibleForKind(kind) {
    const config = groupConfig[kind];
    return config ? layers[config.layer].checked : false;
  }

  function hitTest(world) {
    const order = ["portal", "playerSpawn", "enemySpawn", "npc", "house", "harvestFlower", "sceneryRock", "rock", "tallGrass", "tree"];
    const padding = Math.max(2, 5 / camera.zoom);
    let best = null;
    let bestDistance = Infinity;

    for (const kind of order) {
      if (!layerVisibleForKind(kind)) continue;
      const list = descriptorsForKind(kind);
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const descriptor = list[i];
        const bounds = descriptorBounds(descriptor);
        const left = bounds.x - padding;
        const right = bounds.x + bounds.width + padding;
        const top = bounds.y - padding;
        const bottom = bounds.y + bounds.height + padding;
        if (world.x < left || world.x > right || world.y < top || world.y > bottom) continue;
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const distance = Math.hypot(world.x - cx, world.y - cy);
        if (distance < bestDistance) {
          best = descriptor;
          bestDistance = distance;
        }
      }
      if (best && kind === "portal") return best;
    }
    return best;
  }

  function drawSelection() {
    const descriptor = resolveSelection();
    if (!descriptor || !layerVisibleForKind(descriptor.kind)) return;
    const bounds = descriptorBounds(descriptor);
    const pad = Math.max(2 / camera.zoom, 2);
    ctx.save();
    ctx.strokeStyle = "#ffe58a";
    ctx.fillStyle = "rgba(255,229,138,.08)";
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
    ctx.fillRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
    ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
    ctx.setLineDash([]);
    ctx.font = `${Math.max(6 / camera.zoom, 6)}px monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#ffeaa4";
    ctx.fillText(descriptor.config.label, bounds.x - pad, bounds.y - pad - 2 / camera.zoom);
    ctx.restore();
  }

  function drawBrushCursor() {
    if (editorMode !== "paint" || !pointerWorld || panning) return;
    const col = Math.floor(pointerWorld.x / draft.cellSize);
    const row = Math.floor(pointerWorld.y / draft.cellSize);
    const radius = Math.floor(brushSize / 2);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1 / camera.zoom;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && dx * dx + dy * dy > radius * radius + .25) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= draft.cols || r >= draft.rows) continue;
        const x = c * draft.cellSize;
        const y = r * draft.cellSize;
        ctx.fillRect(x, y, draft.cellSize, draft.cellSize);
        ctx.strokeRect(x, y, draft.cellSize, draft.cellSize);
      }
    }
    ctx.restore();
  }

  function placementPreviewItem(kind, world) {
    if (!world) return null;
    const x = Math.round(world.x);
    const y = Math.round(world.y);
    if (kind === "interactiveTree") return { kind: "tree", item: { x, y, nonInteractive: false } };
    if (kind === "decorativeTree") return { kind: "tree", item: { x, y, nonInteractive: true } };
    if (kind === "tallGrass") return { kind: "tallGrass", item: { x, y } };
    if (kind === "throwableRock") return { kind: "rock", item: { x, y, variant: "plain" } };
    if (kind === "sceneryRock") return { kind: "sceneryRock", item: { x, y } };
    if (kind === "harvestFlower") return { kind: "harvestFlower", item: { x, y, type: "white" } };
    if (kind === "house") return { kind: "house", item: { x, y, variant: "default" } };
    if (kind === "shopkeeperNpc") return { kind: "npc", item: { x, y, type: "shopkeeper", interactionRadius: 24 } };
    if (kind === "hunterNpc") return { kind: "npc", item: { x, y, type: "hunter", interactionRadius: 24 } };
    if (kind === "jesterNpc") return { kind: "npc", item: { x, y, type: "jester", interactionRadius: 24 } };
    if (kind === "craftingTableNpc") return { kind: "npc", item: { x, y, type: "craftingTable", interactionRadius: 24 } };
    if (kind === "classResetCrystalNpc") return { kind: "npc", item: { x, y, type: "classResetCrystal", interactionRadius: 28 } };
    if (kind === "enemySpawn") return { kind: "enemySpawn", item: { x, y } };
    if (kind === "playerSpawn") return { kind: "playerSpawn", item: { x, y } };
    if (kind === "portal") return { kind: "portal", item: { x: x - 6, y: y - 26, width: 12, height: 52, targetMapId: "?" } };
    return null;
  }

  function drawPlacementPreview() {
    if (editorMode !== "place" || !placeKind || !pointerWorld || panning) return;
    const preview = placementPreviewItem(placeKind, pointerWorld);
    if (!preview) return;
    ctx.save();
    ctx.globalAlpha = 0.58;
    if (preview.kind === "tree") drawTree(preview.item);
    if (preview.kind === "tallGrass") drawTallGrass(preview.item);
    if (preview.kind === "rock") drawRock(preview.item);
    if (preview.kind === "sceneryRock") drawSceneryRock(preview.item);
    if (preview.kind === "harvestFlower") drawHarvestFlower(preview.item);
    if (preview.kind === "house") drawHouse(preview.item);
    if (preview.kind === "npc") drawNpc(preview.item);
    if (preview.kind === "enemySpawn") drawEnemySpawn(preview.item);
    if (preview.kind === "playerSpawn") drawPlayerSpawn(preview.item);
    if (preview.kind === "portal") drawPortal(preview.item);
    ctx.restore();
  }

  function render(timestamp) {
    framePending = false;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = false;

    if (!draft) return;
    withWorldTransform(() => {
      renderTerrain((timestamp || performance.now()) / 1000);
      drawMapLandmarks((timestamp || performance.now()) / 1000);
      renderGrid();
      drawEnvironmentObjects();
      drawEntities();
      drawPortals();
      drawSelection();
      drawMapBounds();
      drawBrushCursor();
      drawPlacementPreview();
    });

    if (layers.terrain.checked && draft.cells.includes("water") && waterAnimationTimer === null) {
      waterAnimationTimer = window.setTimeout(() => {
        waterAnimationTimer = null;
        requestRender();
      }, 120);
    }
  }

  function paintCell(col, row) {
    if (col < 0 || row < 0 || col >= draft.cols || row >= draft.rows) return;
    const radius = Math.floor(brushSize / 2);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && dx * dx + dy * dy > radius * radius + .25) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= draft.cols || r >= draft.rows) continue;
        draft.cells[r * draft.cols + c] = activeTerrain;
      }
    }
  }

  function paintLine(from, to) {
    let x0 = from.col;
    let y0 = from.row;
    const x1 = to.col;
    const y1 = to.row;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    while (true) {
      paintCell(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * error;
      if (e2 >= dy) { error += dy; x0 += sx; }
      if (e2 <= dx) { error += dx; y0 += sy; }
    }
  }

  function beginStroke() {
    strokeBefore = captureState();
    lastPaintCell = null;
  }

  function paintAt(world) {
    const cell = {
      col: Math.floor(world.x / draft.cellSize),
      row: Math.floor(world.y / draft.cellSize)
    };
    if (lastPaintCell) paintLine(lastPaintCell, cell);
    else paintCell(cell.col, cell.row);
    lastPaintCell = cell;
    draft.dirty = true;
    updateStatus();
    requestRender();
  }

  function endStroke() {
    if (!strokeBefore) return;
    const before = strokeBefore;
    strokeBefore = null;
    lastPaintCell = null;
    pushHistory(`Paint ${activeTerrain}`, before);
  }

  function setEditorMode(mode, kind = null) {
    editorMode = mode;
    placeKind = mode === "place" ? kind : null;
    selectModeButton.classList.toggle("active", mode === "select");
    terrainModeButton.classList.toggle("active", mode === "paint");
    terrainSection.classList.toggle("hidden", mode !== "paint");
    paletteTools.forEach(tool => tool.classList.toggle("active", mode === "place" && tool.dataset.place === placeKind));
    viewport.classList.toggle("painting", mode === "paint");
    viewport.classList.toggle("placing", mode === "place");
    updateUI();
    requestRender();
  }

  function setActiveTerrain(type) {
    if (!TERRAIN_RULES.TYPES[type]) return;
    activeTerrain = type;
    terrainTools.forEach(tool => tool.classList.toggle("active", tool.dataset.terrain === type));
    setEditorMode("paint");
  }

  function clampPoint(item, kind) {
    if (kind === "portal") {
      item.x = Math.round(Math.max(0, Math.min(draft.width - item.width, item.x)));
      item.y = Math.round(Math.max(0, Math.min(draft.height - item.height, item.y)));
      return;
    }
    item.x = Math.round(Math.max(0, Math.min(draft.width, item.x)));
    item.y = Math.round(Math.max(0, Math.min(draft.height, item.y)));
  }

  function selectDescriptor(descriptor) {
    selectionKey = descriptor ? { kind: descriptor.kind, id: descriptor.item.id } : null;
    updateInspector();
    requestRender();
  }

  function beginObjectDrag(descriptor, world) {
    const item = descriptor.item;
    dragState = {
      kind: descriptor.kind,
      id: item.id,
      before: captureState(),
      offsetX: world.x - item.x,
      offsetY: world.y - item.y
    };
    viewport.classList.add("dragging-object");
  }

  function continueObjectDrag(world) {
    if (!dragState) return;
    const descriptor = resolveSelection();
    if (!descriptor || descriptor.kind !== dragState.kind || descriptor.item.id !== dragState.id) return;
    descriptor.item.x = world.x - dragState.offsetX;
    descriptor.item.y = world.y - dragState.offsetY;
    clampPoint(descriptor.item, descriptor.kind);
    draft.dirty = true;
    updateInspector(false);
    updateStatus();
    requestRender();
  }

  function endObjectDrag() {
    if (!dragState) return;
    const before = dragState.before;
    const descriptor = resolveSelection();
    const label = descriptor ? `Move ${descriptor.config.label}` : "Move object";
    dragState = null;
    viewport.classList.remove("dragging-object");
    pushHistory(label, before);
  }

  function allExistingIds() {
    const ids = new Set();
    for (const kind of Object.keys(groupConfig)) {
      for (const descriptor of descriptorsForKind(kind)) ids.add(descriptor.item.id);
    }
    return ids;
  }

  function nextId(prefix, simple = false) {
    const ids = allExistingIds();
    let index = 1;
    while (true) {
      const id = simple ? `${prefix}${index}` : `${mapId}:${prefix}:${index}`;
      if (!ids.has(id)) return id;
      index += 1;
    }
  }

  function defaultPortalTarget() {
    const candidates = Object.entries(WORLD_CONTENT.maps)
      .filter(([id, map]) => id !== mapId && Array.isArray(map.playerSpawns) && map.playerSpawns.length > 0);
    const preferred = candidates.find(([id]) => mapId === "prototypeIslandWest" ? id === "prototypeIsland" : id === "spawn") || candidates[0];
    if (!preferred) return { targetMapId: mapId, targetSpawnId: draft.map.playerSpawns[0]?.id || "center" };
    return { targetMapId: preferred[0], targetSpawnId: preferred[1].playerSpawns[0].id };
  }

  function placeObject(kind, world) {
    const before = captureState();
    const x = Math.round(Math.max(0, Math.min(draft.width, world.x)));
    const y = Math.round(Math.max(0, Math.min(draft.height, world.y)));
    let selectionKind = null;
    let item = null;

    if (kind === "interactiveTree" || kind === "decorativeTree") {
      selectionKind = "tree";
      item = {
        id: nextId("tree"),
        x, y,
        phase: Number((draft.map.environment.trees.length * 0.73 + 0.42).toFixed(2)),
        fireImmune: kind === "decorativeTree",
        nonInteractive: kind === "decorativeTree",
        ...(kind === "interactiveTree" ? { canopyVariant: 0 } : {})
      };
      draft.map.environment.trees.push(item);
    } else if (kind === "tallGrass") {
      selectionKind = "tallGrass";
      item = {
        id: nextId("grass"), x, y,
        phase: Number((draft.map.environment.tallGrass.length * 0.8 + 0.4).toFixed(2)),
        width: 13,
        flowerType: null
      };
      draft.map.environment.tallGrass.push(item);
    } else if (kind === "throwableRock") {
      selectionKind = "rock";
      item = { id: nextId("rock"), x, y, variant: "plain" };
      draft.map.environment.rocks.push(item);
    } else if (kind === "sceneryRock") {
      selectionKind = "sceneryRock";
      item = { id: nextId("sceneryRock"), x, y, collision: { width: 10, height: 6 } };
      draft.map.environment.sceneryRocks.push(item);
    } else if (kind === "harvestFlower") {
      selectionKind = "harvestFlower";
      item = {
        id: nextId("flower"), x, y,
        phase: Number((draft.map.environment.harvestFlowers.length * 0.8 + 0.4).toFixed(2)),
        type: "white"
      };
      draft.map.environment.harvestFlowers.push(item);
    } else if (kind === "house") {
      selectionKind = "house";
      item = {
        id: nextId("house"), x, y, variant: "default",
        collision: { width: HOUSE_COLLISION_WIDTH, height: HOUSE_COLLISION_HEIGHT }
      };
      draft.map.environment.houses.push(item);
    } else if (
      kind === "shopkeeperNpc" || kind === "hunterNpc" || kind === "jesterNpc" ||
      kind === "craftingTableNpc" || kind === "classResetCrystalNpc"
    ) {
      selectionKind = "npc";
      const type = kind === "hunterNpc"
        ? "hunter"
        : kind === "jesterNpc"
          ? "jester"
          : kind === "craftingTableNpc"
            ? "craftingTable"
            : kind === "classResetCrystalNpc"
              ? "classResetCrystal"
              : "shopkeeper";
      item = {
        id: nextId("npc"),
        type,
        x,
        y,
        interactionRadius: type === "classResetCrystal" ? 28 : 24
      };
      draft.map.npcs.push(item);
    } else if (kind === "enemySpawn") {
      selectionKind = "enemySpawn";
      item = {
        id: nextId("slime"), type: "slime", level: 1, x, y,
        phase: Number((draft.map.enemySpawns.length * 0.9 + 0.3).toFixed(2)),
        wanderRadiusX: 18, wanderRadiusY: 13
      };
      draft.map.enemySpawns.push(item);
    } else if (kind === "playerSpawn") {
      selectionKind = "playerSpawn";
      item = { id: nextId("editorSpawn", true), x, y };
      draft.map.playerSpawns.push(item);
    } else if (kind === "portal") {
      selectionKind = "portal";
      const target = defaultPortalTarget();
      item = {
        id: nextId("portal"),
        x: x - 6, y: y - 26, width: 12, height: 52,
        targetMapId: target.targetMapId,
        targetSpawnId: target.targetSpawnId
      };
      clampPoint(item, "portal");
      draft.map.portals.push(item);
    }

    if (!item || !selectionKind) return;
    selectionKey = { kind: selectionKind, id: item.id };
    pushHistory(`Place ${groupConfig[selectionKind].label}`, before);
    updateInspector();
  }

  function duplicateSelected() {
    const descriptor = resolveSelection();
    if (!descriptor) return;
    const before = captureState();
    const copy = clone(descriptor.item);

    if (descriptor.kind === "playerSpawn") copy.id = nextId("editorSpawn", true);
    else if (descriptor.kind === "tree") copy.id = nextId("tree");
    else if (descriptor.kind === "tallGrass") copy.id = nextId("grass");
    else if (descriptor.kind === "rock") copy.id = nextId("rock");
    else if (descriptor.kind === "sceneryRock") copy.id = nextId("sceneryRock");
    else if (descriptor.kind === "harvestFlower") copy.id = nextId("flower");
    else if (descriptor.kind === "house") copy.id = nextId("house");
    else if (descriptor.kind === "npc") copy.id = nextId("npc");
    else if (descriptor.kind === "enemySpawn") copy.id = nextId(copy.type || "enemy");
    else if (descriptor.kind === "portal") copy.id = nextId("portal");

    copy.x = Number(copy.x) + 12;
    copy.y = Number(copy.y) + 12;
    clampPoint(copy, descriptor.kind);
    descriptor.array.push(copy);
    selectionKey = { kind: descriptor.kind, id: copy.id };
    pushHistory(`Duplicate ${descriptor.config.label}`, before);
    updateInspector();
  }

  function portalsTargetingSpawn(spawnId) {
    const hits = [];
    for (const [otherMapId, source] of Object.entries(WORLD_CONTENT.maps)) {
      const map = drafts.has(otherMapId) ? drafts.get(otherMapId).map : source;
      for (const portal of map.portals || []) {
        if (portal.targetMapId === mapId && portal.targetSpawnId === spawnId) hits.push(`${otherMapId}:${portal.id}`);
      }
    }
    return hits;
  }

  function deleteSelected() {
    const descriptor = resolveSelection();
    if (!descriptor) return;
    if (descriptor.kind === "playerSpawn") {
      const refs = portalsTargetingSpawn(descriptor.item.id);
      if (refs.length > 0) {
        const okay = window.confirm(`This player spawn is targeted by ${refs.length} portal(s). Deleting it will make those portal targets invalid in the exported draft. Delete anyway?`);
        if (!okay) return;
      }
    }
    const before = captureState();
    if (descriptor.kind === "playerSpawn" && draft.map.defaultPlayerSpawnId === descriptor.item.id) {
      delete draft.map.defaultPlayerSpawnId;
    }
    const index = descriptor.array.findIndex(item => item.id === descriptor.item.id);
    if (index < 0) return;
    descriptor.array.splice(index, 1);
    selectionKey = null;
    pushHistory(`Delete ${descriptor.config.label}`, before);
    updateInspector();
  }

  function mutateSelected(label, mutator) {
    const descriptor = resolveSelection();
    if (!descriptor) return;
    const before = captureState();
    mutator(descriptor.item, descriptor);
    clampPoint(descriptor.item, descriptor.kind);
    pushHistory(label, before);
    updateInspector();
  }

  function resetDraft() {
    if (!draft.dirty) return;
    const okay = window.confirm(`Reset ALL terrain and object edits for ${draft.map.name || mapId}?`);
    if (!okay) return;
    draft.cells = draft.sourceState.cells.slice();
    draft.map = clone(draft.sourceState.map);
    ensureMapCollections(draft.map);
    draft.undo.length = 0;
    draft.redo.length = 0;
    draft.dirty = false;
    draft.importedFrom = null;
    selectionKey = null;
    updateUI();
    requestRender();
  }

  function compressTerrainRegions() {
    const size = draft.cellSize;
    const runsByRow = [];

    for (let row = 0; row < draft.rows; row += 1) {
      const runs = [];
      let col = 0;
      while (col < draft.cols) {
        const type = draft.cells[row * draft.cols + col];
        if (type === "void") { col += 1; continue; }
        const start = col;
        col += 1;
        while (col < draft.cols && draft.cells[row * draft.cols + col] === type) col += 1;
        runs.push({ type, x: start * size, y: row * size, width: (col - start) * size, height: size });
      }
      runsByRow.push(runs);
    }

    const regions = [];
    let active = new Map();
    for (let row = 0; row < runsByRow.length; row += 1) {
      const next = new Map();
      for (const run of runsByRow[row]) {
        const key = `${run.type}:${run.x}:${run.width}`;
        const previous = active.get(key);
        if (previous && previous.y + previous.height === run.y) {
          previous.height += size;
          next.set(key, previous);
        } else {
          const region = { ...run };
          regions.push(region);
          next.set(key, region);
        }
      }
      active = next;
    }

    return regions.map(region => ({
      type: region.type,
      x: region.x,
      y: region.y,
      width: Math.min(region.width, draft.width - region.x),
      height: Math.min(region.height, draft.height - region.y)
    })).filter(region => region.width > 0 && region.height > 0);
  }

  function importDraftPayload(payload, fileName = "draft JSON") {
    const result = MAP_DRAFT_FORMAT.validate(payload, WORLD_CONTENT, TERRAIN_RULES);
    if (!result.ok) {
      window.alert(`Could not import ${fileName}:\n\n${result.errors.map(error => `• ${error}`).join("\n")}`);
      return false;
    }

    const targetId = result.mapId;
    const targetDraft = getDraft(targetId);
    if (targetDraft.dirty) {
      const okay = window.confirm(`${WORLD_CONTENT.maps[targetId].name || targetId} already has unsaved editor changes. Replace that working draft with ${fileName}?`);
      if (!okay) return false;
    }

    const importedMap = clone(result.map);
    ensureMapCollections(importedMap);
    const terrain = terrainCellsFromMap(importedMap);
    targetDraft.cellSize = terrain.cellSize;
    targetDraft.width = terrain.width;
    targetDraft.height = terrain.height;
    targetDraft.cols = terrain.cols;
    targetDraft.rows = terrain.rows;
    targetDraft.cells = terrain.cells;
    targetDraft.map = importedMap;
    targetDraft.undo.length = 0;
    targetDraft.redo.length = 0;
    targetDraft.importedFrom = {
      fileName,
      editorBuild: result.editorBuild
    };

    if (targetId !== mapId) setMap(targetId, false);
    else draft = targetDraft;
    refreshDirty();
    selectionKey = null;
    setEditorMode("select");
    fitMap();
    updateUI();
    requestRender();

    if (result.warnings.length) {
      window.alert(`Imported ${fileName} with warning${result.warnings.length === 1 ? "" : "s"}:\n\n${result.warnings.map(warning => `• ${warning}`).join("\n")}`);
    }
    return true;
  }

  async function importDraftFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); }
      catch (error) {
        window.alert(`Could not import ${file.name}:\n\nThe file is not valid JSON.\n${error.message}`);
        return;
      }
      importDraftPayload(payload, file.name);
    } catch (error) {
      window.alert(`Could not read ${file.name}:\n\n${error.message}`);
    } finally {
      importFileInput.value = "";
    }
  }

  function buildDraftPayload() {
    const exportedMap = clone(draft.map);
    exportedMap.terrain = {
      cellSize: draft.cellSize,
      defaultType: "void",
      regions: compressTerrainRegions()
    };

    return {
      editorBuild: BUILD,
      worldContentVersion: canonicalWorldContentVersion,
      schemaVersion: WORLD_CONTENT.schemaVersion,
      mapId,
      map: exportedMap
    };
  }

  function exportDraft() {
    const payload = buildDraftPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${mapId}.map-draft.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }


  async function applyDraftToGame() {
    const okay = window.confirm(
      `Apply the current ${draft.map.name || mapId} draft to this Slime Story project?\n\n` +
      "This writes the canonical editor-map override on the local development server. " +
      "You will need to restart the server before testing it in-game."
    );
    if (!okay) return;

    applyButton.disabled = true;
    const previousText = applyButton.textContent;
    applyButton.textContent = "Applying…";
    try {
      const response = await fetch("/dev/map-editor/adopt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Slime-Story-Editor": "1"
        },
        body: JSON.stringify(buildDraftPayload())
      });
      let body = null;
      try { body = await response.json(); } catch {}
      if (!response.ok || !body?.ok) {
        const detail = body?.errors?.join("\n") || body?.error || `${response.status} ${response.statusText}`;
        throw new Error(detail);
      }

      canonicalWorldContentVersion = Number(body.version) || canonicalWorldContentVersion;

      // The POST has persisted the exact current editor state. Treat that as
      // this tab's new saved baseline so the editor status matches reality.
      const appliedState = captureState();
      draft.sourceState = { cells: appliedState.cells.slice(), map: clone(appliedState.map) };
      draft.sourceSignature = stateSignature(draft.sourceState);
      draft.dirty = false;
      updateStatus();

      const warningText = body.warnings?.length
        ? `\n\nWarnings:\n${body.warnings.map(item => `• ${item}`).join("\n")}`
        : "";
      if (body.changed) {
        window.alert(
          `${draft.map.name || mapId} was applied successfully (world content v${body.version}).` +
          "\n\nRestart the Slime Story server and reload the game to use this map." +
          warningText
        );
      } else {
        window.alert(`${draft.map.name || mapId} is already saved as the canonical map.${warningText}`);
      }
    } catch (error) {
      window.alert(
        "Could not apply this draft to the game.\n\n" + error.message +
        "\n\nApply is available only from a local Slime Story development server. " +
        "You can always Export Draft JSON instead."
      );
    } finally {
      applyButton.disabled = false;
      applyButton.textContent = previousText;
    }
  }

  function makePropertyRow(labelText, control) {
    const row = document.createElement("div");
    row.className = "property-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    row.append(label, control);
    return row;
  }

  function numberControl(value, onChange, options = {}) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "property-input";
    input.step = String(options.step ?? 1);
    if (Number.isFinite(options.min)) input.min = String(options.min);
    if (Number.isFinite(options.max)) input.max = String(options.max);
    input.value = String(Number(value) || 0);
    input.addEventListener("change", () => {
      let next = Number(input.value);
      if (!Number.isFinite(next)) next = Number(value) || 0;
      if (Number.isFinite(options.min)) next = Math.max(options.min, next);
      if (Number.isFinite(options.max)) next = Math.min(options.max, next);
      onChange(next);
    });
    return input;
  }

  function selectControl(value, options, onChange) {
    const select = document.createElement("select");
    select.className = "property-input";
    for (const optionSpec of options) {
      const option = document.createElement("option");
      option.value = optionSpec.value;
      option.textContent = optionSpec.label;
      select.append(option);
    }
    select.value = value == null ? "" : String(value);
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  function checkboxControl(labelText, checked, onChange) {
    const label = document.createElement("label");
    label.className = "property-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", () => onChange(input.checked));
    label.append(input, document.createTextNode(labelText));
    return label;
  }

  function addGroup(title, nodes) {
    const group = document.createElement("div");
    group.className = "property-group";
    const heading = document.createElement("div");
    heading.className = "property-group-title";
    heading.textContent = title;
    group.append(heading, ...nodes);
    propertyFields.append(group);
  }

  function commonPositionGroup(descriptor) {
    const grid = document.createElement("div");
    grid.className = "property-grid";
    grid.append(
      makePropertyRow("X", numberControl(descriptor.item.x, value => mutateSelected(`Set ${descriptor.config.label} X`, item => { item.x = value; }), { min: 0, max: draft.width })),
      makePropertyRow("Y", numberControl(descriptor.item.y, value => mutateSelected(`Set ${descriptor.config.label} Y`, item => { item.y = value; }), { min: 0, max: draft.height }))
    );
    return grid;
  }

  function targetMapDefinition(targetMapId) {
    if (drafts.has(targetMapId)) return drafts.get(targetMapId).map;
    return WORLD_CONTENT.maps[targetMapId];
  }

  function updateInspector(rebuild = true) {
    const descriptor = resolveSelection();
    inspectorEmpty.classList.toggle("hidden", Boolean(descriptor));
    inspectorContent.classList.toggle("hidden", !descriptor);
    duplicateButton.disabled = !descriptor;
    deleteButton.disabled = !descriptor;
    if (!descriptor || !rebuild) {
      if (descriptor && !rebuild) {
        const xInput = propertyFields.querySelector('[data-role="x"]');
        const yInput = propertyFields.querySelector('[data-role="y"]');
        if (xInput) xInput.value = String(Math.round(descriptor.item.x));
        if (yInput) yInput.value = String(Math.round(descriptor.item.y));
      }
      return;
    }

    selectionType.textContent = descriptor.config.label;
    selectionId.textContent = descriptor.item.id;
    propertyFields.textContent = "";

    const positionGrid = document.createElement("div");
    positionGrid.className = "property-grid";
    const xControl = numberControl(descriptor.item.x, value => mutateSelected(`Set ${descriptor.config.label} X`, item => { item.x = value; }), { min: 0, max: draft.width });
    xControl.dataset.role = "x";
    const yControl = numberControl(descriptor.item.y, value => mutateSelected(`Set ${descriptor.config.label} Y`, item => { item.y = value; }), { min: 0, max: draft.height });
    yControl.dataset.role = "y";
    positionGrid.append(makePropertyRow("X", xControl), makePropertyRow("Y", yControl));
    addGroup("Position", [positionGrid]);

    if (descriptor.kind === "tree") {
      addGroup("Tree", [
        checkboxControl("Interactive / choppable", descriptor.item.nonInteractive === false, checked => mutateSelected("Change tree interaction", item => {
          item.nonInteractive = !checked;
          if (checked && !Number.isInteger(item.canopyVariant)) item.canopyVariant = 0;
        })),
        checkboxControl("Fire immune", descriptor.item.fireImmune !== false, checked => mutateSelected("Change tree fire immunity", item => { item.fireImmune = checked; })),
        makePropertyRow("Canopy variant", numberControl(descriptor.item.canopyVariant ?? 0, value => mutateSelected("Change canopy variant", item => { item.canopyVariant = Math.max(0, Math.round(value)); }), { min: 0, step: 1 }))
      ]);
    }

    if (descriptor.kind === "tallGrass") {
      addGroup("Tall grass", [
        makePropertyRow("Width", numberControl(descriptor.item.width ?? 13, value => mutateSelected("Change grass width", item => { item.width = Math.max(4, Math.round(value)); }), { min: 4, max: 64 })),
        makePropertyRow("Flower", selectControl(descriptor.item.flowerType ?? "", [
          { value: "", label: "None" },
          { value: "yellow", label: "Yellow" }
        ], value => mutateSelected("Change grass flower", item => { item.flowerType = value || null; })))
      ]);
    }

    if (descriptor.kind === "rock") {
      addGroup("Throwable rock", [
        makePropertyRow("Variant", selectControl(descriptor.item.variant || "plain", [
          { value: "plain", label: "Plain" },
          { value: "grass", label: "Grass" }
        ], value => mutateSelected("Change rock variant", item => { item.variant = value; })))
      ]);
    }

    if (descriptor.kind === "sceneryRock") {
      if (!descriptor.item.collision) descriptor.item.collision = { width: 10, height: 6 };
      const collisionGrid = document.createElement("div");
      collisionGrid.className = "property-grid";
      collisionGrid.append(
        makePropertyRow("Collision W", numberControl(descriptor.item.collision.width ?? 10, value => mutateSelected("Change scenery collision width", item => {
          if (!item.collision) item.collision = {};
          item.collision.width = Math.max(1, Math.round(value));
        }), { min: 1, max: 128 })),
        makePropertyRow("Collision H", numberControl(descriptor.item.collision.height ?? 6, value => mutateSelected("Change scenery collision height", item => {
          if (!item.collision) item.collision = {};
          item.collision.height = Math.max(1, Math.round(value));
        }), { min: 1, max: 128 }))
      );
      addGroup("Scenery rock", [collisionGrid]);
    }

    if (descriptor.kind === "harvestFlower") {
      addGroup("Harvest flower", [
        makePropertyRow("Type", selectControl(descriptor.item.type || "white", [
          { value: "white", label: "White" },
          { value: "blue", label: "Blue" }
        ], value => mutateSelected("Change flower type", item => { item.type = value; })))
      ]);
    }

    if (descriptor.kind === "house") {
      if (!descriptor.item.collision) descriptor.item.collision = { width: HOUSE_COLLISION_WIDTH, height: HOUSE_COLLISION_HEIGHT };
      const collisionGrid = document.createElement("div");
      collisionGrid.className = "property-grid";
      collisionGrid.append(
        makePropertyRow("Collision W", numberControl(descriptor.item.collision.width ?? HOUSE_COLLISION_WIDTH, value => mutateSelected("Change house collision width", item => {
          if (!item.collision) item.collision = {};
          item.collision.width = Math.max(1, Math.round(value));
        }), { min: 1, max: 128 })),
        makePropertyRow("Collision H", numberControl(descriptor.item.collision.height ?? HOUSE_COLLISION_HEIGHT, value => mutateSelected("Change house collision height", item => {
          if (!item.collision) item.collision = {};
          item.collision.height = Math.max(1, Math.round(value));
        }), { min: 1, max: 128 }))
      );
      addGroup("House", [
        makePropertyRow("Variant", selectControl(descriptor.item.variant || "default", [
          { value: "default", label: "Original" },
          { value: "red", label: "Red" }
        ], value => mutateSelected("Change house variant", item => { item.variant = value; }))),
        collisionGrid
      ]);
    }

    if (descriptor.kind === "npc") {
      const roleNote = document.createElement("div");
      roleNote.className = "property-readonly";
      roleNote.textContent = descriptor.item.type === "jester"
        ? "Jester is visual-only for now."
        : descriptor.item.type === "hunter"
          ? "Hunter uses the existing Hunter talk interaction."
          : descriptor.item.type === "craftingTable"
            ? "Crafting Table opens the existing crafting menu."
            : descriptor.item.type === "classResetCrystal"
              ? "Class Reset Crystal opens the class reset confirmation."
              : "Shopkeeper uses the existing Axe tutorial/shop interaction.";
      addGroup("NPC", [
        makePropertyRow("Type", selectControl(descriptor.item.type || "shopkeeper", [
          { value: "shopkeeper", label: "Shopkeeper" },
          { value: "hunter", label: "Hunter" },
          { value: "jester", label: "Jester" },
          { value: "craftingTable", label: "Crafting Table" },
          { value: "classResetCrystal", label: "Class Reset Crystal" }
        ], value => mutateSelected("Change NPC type", item => {
          item.type = value;
          if (value === "classResetCrystal") item.interactionRadius = Math.max(8, Number(item.interactionRadius) || 28);
        }))),
        makePropertyRow("Interact radius", numberControl(descriptor.item.interactionRadius ?? (descriptor.item.type === "classResetCrystal" ? 28 : 24), value => mutateSelected("Change NPC interaction radius", item => { item.interactionRadius = Math.max(8, Math.round(value)); }), { min: 8, max: 96 })),
        roleNote
      ]);
    }

    if (descriptor.kind === "enemySpawn") {
      const enemyType = descriptor.item.type || "slime";
      const enemyFields = [
        makePropertyRow("Species", selectControl(enemyType, [
          { value: "slime", label: "Slime" },
          { value: "mushroom", label: "Sleeping Mushroom" },
          { value: "crab", label: "Crab" },
          { value: "goblin", label: "Goblin" },
          { value: "ghost", label: "Ghost" },
          { value: "bigGoldSlime", label: "Big Gold Slime" }
        ], value => mutateSelected("Change enemy species", item => {
          item.type = value;

          if (value === "slime") {
            item.wanderRadiusX = Number.isFinite(Number(item.wanderRadiusX))
              ? Number(item.wanderRadiusX)
              : 18;
            item.wanderRadiusY = Number.isFinite(Number(item.wanderRadiusY))
              ? Number(item.wanderRadiusY)
              : 13;
          } else {
            delete item.variant;
            delete item.aggressiveOnSight;
            delete item.wanderRadiusX;
            delete item.wanderRadiusY;
          }
        }))),
        makePropertyRow("Level", numberControl(descriptor.item.level ?? 1, value => mutateSelected("Change enemy level", item => { item.level = Math.max(1, Math.round(value)); }), { min: 1, max: 999 }))
      ];

      if (enemyType === "slime") {
        enemyFields.splice(1, 0,
          makePropertyRow("Variant", selectControl(descriptor.item.variant || "", [
            { value: "", label: "Default slime" },
            { value: "blue", label: "Blue slime" }
          ], value => mutateSelected("Change enemy variant", item => {
            if (value) item.variant = value;
            else delete item.variant;
          })))
        );

        const grid = document.createElement("div");
        grid.className = "property-grid";
        grid.append(
          makePropertyRow("Wander X", numberControl(descriptor.item.wanderRadiusX ?? 18, value => mutateSelected("Change wander radius X", item => { item.wanderRadiusX = Math.max(0, Math.round(value)); }), { min: 0, max: 500 })),
          makePropertyRow("Wander Y", numberControl(descriptor.item.wanderRadiusY ?? 13, value => mutateSelected("Change wander radius Y", item => { item.wanderRadiusY = Math.max(0, Math.round(value)); }), { min: 0, max: 500 }))
        );
        enemyFields.push(grid);
      } else if (enemyType === "mushroom") {
        const behaviorNote = document.createElement("div");
        behaviorNote.className = "property-readonly";
        behaviorNote.textContent = "Sleeps at its spawn until provoked, then wakes and chases.";
        enemyFields.push(behaviorNote);
      } else if (enemyType === "crab") {
        const behaviorNote = document.createElement("div");
        behaviorNote.className = "property-readonly";
        behaviorNote.textContent = "Scuttles mostly sideways near its spawn and chases when provoked.";
        enemyFields.push(behaviorNote);
      }

      addGroup("Enemy spawn", enemyFields);
    }

    if (descriptor.kind === "playerSpawn") {
      const readonly = document.createElement("div");
      readonly.className = "property-readonly";
      readonly.textContent = descriptor.item.id;
      const loadToggle = checkboxControl(
        "Use as default loading position",
        draft.map.defaultPlayerSpawnId === descriptor.item.id,
        checked => {
          const before = captureState();
          if (checked) draft.map.defaultPlayerSpawnId = descriptor.item.id;
          else if (draft.map.defaultPlayerSpawnId === descriptor.item.id) delete draft.map.defaultPlayerSpawnId;
          pushHistory("Change default player load position", before);
          updateInspector();
        }
      );
      const note = document.createElement("div");
      note.className = "property-readonly";
      note.textContent = "This becomes the game's global loading position, including which map opens on a new/reloaded session. Portal targets and death respawn behavior remain separate.";
      addGroup("Player spawn", [makePropertyRow("Spawn ID", readonly), loadToggle, note]);
    }

    if (descriptor.kind === "portal") {
      const sizeGrid = document.createElement("div");
      sizeGrid.className = "property-grid";
      sizeGrid.append(
        makePropertyRow("Width", numberControl(descriptor.item.width, value => mutateSelected("Change portal width", item => { item.width = Math.max(1, Math.round(value)); }), { min: 1, max: 500 })),
        makePropertyRow("Height", numberControl(descriptor.item.height, value => mutateSelected("Change portal height", item => { item.height = Math.max(1, Math.round(value)); }), { min: 1, max: 500 }))
      );

      const mapOptions = Object.entries(WORLD_CONTENT.maps)
        .filter(([, map]) => Array.isArray(map.playerSpawns) && map.playerSpawns.length > 0)
        .map(([id, map]) => ({ value: id, label: map.name || id }));
      const targetMapSelect = selectControl(descriptor.item.targetMapId, mapOptions, value => mutateSelected("Change portal target map", item => {
        item.targetMapId = value;
        const target = targetMapDefinition(value);
        if (!(target?.playerSpawns || []).some(spawn => spawn.id === item.targetSpawnId)) {
          item.targetSpawnId = target?.playerSpawns?.[0]?.id || "";
        }
      }));
      const target = targetMapDefinition(descriptor.item.targetMapId);
      const spawnOptions = (target?.playerSpawns || []).map(spawn => ({ value: spawn.id, label: spawn.id }));
      const targetSpawnSelect = selectControl(descriptor.item.targetSpawnId, spawnOptions, value => mutateSelected("Change portal target spawn", item => { item.targetSpawnId = value; }));

      addGroup("Portal", [
        sizeGrid,
        makePropertyRow("Target map", targetMapSelect),
        makePropertyRow("Target spawn", targetSpawnSelect)
      ]);
    }
  }

  function updateStatus() {
    if (!draft) return;
    statusMap.textContent = `${draft.map.name || mapId} • ${draft.width}×${draft.height}`;
    statusZoom.textContent = `zoom ${Math.round(camera.zoom * 100)}%`;
    if (pointerWorld) {
      const x = Math.floor(pointerWorld.x);
      const y = Math.floor(pointerWorld.y);
      statusPointer.textContent = `x ${x}, y ${y}`;
      statusTerrain.textContent = `terrain ${typeAtWorld(pointerWorld.x, pointerWorld.y)}`;
    } else {
      statusPointer.textContent = "x —, y —";
      statusTerrain.textContent = "terrain —";
    }
    const importedLabel = draft.importedFrom ? `imported ${draft.importedFrom.fileName}` : null;
    statusDirty.textContent = draft.dirty ? (importedLabel ? `${importedLabel} • unsaved` : "unsaved map draft") : (importedLabel || "source map");
    statusDirty.classList.toggle("dirty", draft.dirty);
  }

  function updateUI() {
    if (!draft) return;
    undoButton.disabled = draft.undo.length === 0;
    redoButton.disabled = draft.redo.length === 0;
    resetButton.disabled = !draft.dirty;

    if (editorMode === "paint") {
      modeBadge.textContent = `PAINT ${activeTerrain.toUpperCase()} • ${brushSize} CELL${brushSize === 1 ? "" : "S"}`;
    } else if (editorMode === "place") {
      const label = {
        interactiveTree: "INTERACTIVE TREE",
        decorativeTree: "DECORATIVE TREE",
        tallGrass: "TALL GRASS",
        throwableRock: "THROWABLE ROCK",
        sceneryRock: "SCENERY ROCK",
        harvestFlower: "HARVEST FLOWER",
        house: "HOUSE",
        shopkeeperNpc: "SHOPKEEPER NPC",
        hunterNpc: "HUNTER NPC",
        jesterNpc: "JESTER NPC",
        craftingTableNpc: "CRAFTING TABLE",
        classResetCrystalNpc: "CLASS RESET CRYSTAL",
        enemySpawn: "ENEMY SPAWN",
        playerSpawn: "PLAYER SPAWN",
        portal: "PORTAL"
      }[placeKind] || "OBJECT";
      modeBadge.textContent = `PLACE ${label}`;
    } else {
      modeBadge.textContent = "SELECT / MOVE";
    }

    updateStatus();
    updateInspector();
  }

  function beginPan(event) {
    panning = true;
    viewport.classList.add("panning");
    panOrigin = { clientX: event.clientX, clientY: event.clientY, camX: camera.x, camY: camera.y };
  }

  function continuePan(event) {
    if (!panning || !panOrigin) return;
    camera.x = panOrigin.camX - (event.clientX - panOrigin.clientX) / camera.zoom;
    camera.y = panOrigin.camY - (event.clientY - panOrigin.clientY) / camera.zoom;
    updateStatus();
    requestRender();
  }

  canvas.addEventListener("pointerdown", event => {
    viewport.focus();
    pointerWorld = screenToWorld(event.clientX, event.clientY);
    const wantsPan = event.button === 1 || (event.button === 0 && spaceHeld);
    if (wantsPan) {
      pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      beginPan(event);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;

    if (editorMode === "paint") {
      pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      beginStroke();
      paintAt(pointerWorld);
      return;
    }

    if (editorMode === "place") {
      placeObject(placeKind, pointerWorld);
      return;
    }

    const hit = hitTest(pointerWorld);
    selectDescriptor(hit);
    if (hit) {
      pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      beginObjectDrag(hit, pointerWorld);
    }
  });

  canvas.addEventListener("pointermove", event => {
    pointerWorld = screenToWorld(event.clientX, event.clientY);
    if (panning) continuePan(event);
    else if (dragState) continueObjectDrag(pointerWorld);
    else if (pointerDown && strokeBefore) paintAt(pointerWorld);
    updateStatus();
    requestRender();
  });

  function finishPointer(event) {
    if (panning) {
      panning = false;
      viewport.classList.remove("panning");
      panOrigin = null;
    }
    if (dragState) endObjectDrag();
    if (strokeBefore) endStroke();
    pointerDown = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  canvas.addEventListener("pointerleave", () => {
    if (!pointerDown) {
      pointerWorld = null;
      updateStatus();
      requestRender();
    }
  });

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.0015);
    const newZoom = clampZoom(camera.zoom * factor);
    if (Math.abs(newZoom - camera.zoom) < 0.0001) return;
    camera.zoom = newZoom;
    const after = screenToWorld(event.clientX, event.clientY);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    updateStatus();
    requestRender();
  }, { passive: false });

  canvas.addEventListener("contextmenu", event => event.preventDefault());

  window.addEventListener("keydown", event => {
    const target = event.target;
    const editingControl = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    if (event.code === "Space" && !editingControl) {
      spaceHeld = true;
      event.preventDefault();
    }
    if (editingControl) return;

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectionKey) {
        event.preventDefault();
        deleteSelected();
      }
      return;
    }
    if (event.key === "Escape" || event.key.toLowerCase() === "q") {
      setEditorMode("select");
      return;
    }
    if (event.key.toLowerCase() === "t") {
      setEditorMode("paint");
      return;
    }
    if (event.key === "1") setActiveTerrain("grass");
    if (event.key === "2") setActiveTerrain("dirt");
    if (event.key === "3") setActiveTerrain("sand");
    if (event.key === "4") setActiveTerrain("water");
    if (event.key === "5") setActiveTerrain("void");
  });

  window.addEventListener("keyup", event => {
    if (event.code === "Space") spaceHeld = false;
  });
  window.addEventListener("blur", () => { spaceHeld = false; });

  mapSelect.addEventListener("change", () => setMap(mapSelect.value, true));
  brushSizeSelect.addEventListener("change", () => {
    brushSize = Number(brushSizeSelect.value) || 1;
    updateUI();
    requestRender();
  });
  selectModeButton.addEventListener("click", () => setEditorMode("select"));
  terrainModeButton.addEventListener("click", () => setEditorMode("paint"));
  terrainTools.forEach(tool => tool.addEventListener("click", () => setActiveTerrain(tool.dataset.terrain)));
  paletteTools.forEach(tool => tool.addEventListener("click", () => setEditorMode("place", tool.dataset.place)));
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  resetButton.addEventListener("click", resetDraft);
  fitMapButton.addEventListener("click", fitMap);
  importButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => importDraftFile(importFileInput.files?.[0]));
  exportButton.addEventListener("click", exportDraft);
  applyButton.addEventListener("click", applyDraftToGame);
  duplicateButton.addEventListener("click", duplicateSelected);
  deleteButton.addEventListener("click", deleteSelected);
  Object.values(layers).forEach(control => control.addEventListener("change", () => {
    updateInspector();
    requestRender();
  }));

  const resizeObserver = new ResizeObserver(() => resizeCanvas());
  resizeObserver.observe(viewport);

  draft = getDraft(mapId);
  resizeCanvas();
  setEditorMode("select");
  requestAnimationFrame(() => {
    fitMap();
    updateUI();
  });
})();
