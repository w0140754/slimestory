(function (root, factory) {
  const content = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = content;
  if (root) root.WORLD_CONTENT = content;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // The coordinate grid below is the single canonical world.
  const WORLD_GRID_RADIUS = 1;
  const WORLD_GRID_MAP_WIDTH = 400;
  const WORLD_GRID_MAP_HEIGHT = 400;

  // v414: the live server supplies a per-world generation seed through the
  // environment before loading this shared generator. Browser clients receive
  // the exact resolved WORLD_CONTENT object from the server runtime endpoint,
  // so both sides still use one canonical world without extra replication.
  // A zero/default seed intentionally preserves the old v413 deterministic
  // layout for regression fixtures and offline tooling.
  const WORLD_GENERATION_SEED = (() => {
    if (typeof process === "undefined" || !process?.env) return 0;
    const parsed = Number(process.env.SLIME_STORY_WORLD_SEED);
    return Number.isFinite(parsed) ? (Math.trunc(parsed) >>> 0) : 0;
  })();

  function worldGridAxisToken(value) {
    const n = Math.trunc(Number(value) || 0);
    return n < 0 ? `m${Math.abs(n)}` : `p${n}`;
  }

  function worldGridMapId(x, y) {
    return `world_${worldGridAxisToken(x)}_${worldGridAxisToken(y)}`;
  }

  function worldGridHash(x, y, salt = 0) {
    let h = (
      Math.imul((Math.trunc(x) + 1013), 73856093) ^
      Math.imul((Math.trunc(y) + 2027), 19349663) ^
      Math.imul((Math.trunc(salt) + 4099), 83492791)
    ) >>> 0;
    if (WORLD_GENERATION_SEED !== 0) {
      h ^= Math.imul((WORLD_GENERATION_SEED + 0x9e3779b9) >>> 0, 2246822519) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function makeWorldGridRandom(seed) {
    let state = (seed >>> 0) || 1;
    return function random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function worldGridBiomeFor(x, y) {
    if (x === 0 && y === 0) return "spawn-plains";
    const roll = worldGridHash(x, y, 17) % 10;
    if (roll <= 4) return "plains";
    if (roll <= 7) return "forest";
    return "rocky-plains";
  }

  const WORLD_CORNER_COORDINATES = Object.freeze([
    Object.freeze({ x: -WORLD_GRID_RADIUS, y: -WORLD_GRID_RADIUS }),
    Object.freeze({ x: WORLD_GRID_RADIUS, y: -WORLD_GRID_RADIUS }),
    Object.freeze({ x: -WORLD_GRID_RADIUS, y: WORLD_GRID_RADIUS }),
    Object.freeze({ x: WORLD_GRID_RADIUS, y: WORLD_GRID_RADIUS })
  ]);

  // v413: rare generated structures currently live only on the four corner
  // maps. The world-level roll intentionally produces 0-1 houses most of the
  // time, with 2 as an uncommon result, instead of rolling independently on
  // every map and accidentally filling the small 3x3 world with buildings.
  const WORLD_HOUSE_COUNT_ROLL = worldGridHash(0, 0, 1301) % 1000;
  const WORLD_GENERATED_HOUSE_COUNT = WORLD_HOUSE_COUNT_ROLL < 200
    ? 0
    : WORLD_HOUSE_COUNT_ROLL < 920
      ? 1
      : 2;
  const WORLD_GENERATED_HOUSE_MAPS = new Set(
    WORLD_CORNER_COORDINATES
      .slice()
      .sort((a, b) => worldGridHash(a.x, a.y, 1302) - worldGridHash(b.x, b.y, 1302))
      .slice(0, WORLD_GENERATED_HOUSE_COUNT)
      .map(point => worldGridMapId(point.x, point.y))
  );

  function buildWorldGridMap(x, y) {
    const mapId = worldGridMapId(x, y);
    const distance = Math.abs(x) + Math.abs(y);
    const biome = worldGridBiomeFor(x, y);
    const seed = worldGridHash(x, y, 377);
    const random = makeWorldGridRandom(seed);
    const environment = {
      trees: [], tallGrass: [], rocks: [], sceneryRocks: [], harvestFlowers: [], houses: []
    };
    const structures = [];
    const features = [];
    const terrainRegions = [];
    const npcs = [];

    const protectedPoints = [
      [WORLD_GRID_MAP_WIDTH / 2, WORLD_GRID_MAP_HEIGHT / 2],
      [18, WORLD_GRID_MAP_HEIGHT / 2],
      [WORLD_GRID_MAP_WIDTH - 18, WORLD_GRID_MAP_HEIGHT / 2],
      [WORLD_GRID_MAP_WIDTH / 2, 22],
      [WORLD_GRID_MAP_WIDTH / 2, WORLD_GRID_MAP_HEIGHT - 22]
    ];
    const featureReservations = [];

    function pointConflictsWithProtected(px, py, radius = 54) {
      return protectedPoints.some(([sx, sy]) => Math.hypot(px - sx, py - sy) < radius);
    }

    function pointConflictsWithReserved(px, py, radius = 18) {
      return featureReservations.some(reservation =>
        Math.hypot(px - reservation.x, py - reservation.y) < radius + reservation.radius
      );
    }

    function reserveFeaturePoint(kind, radius = 46, minEdge = 70) {
      for (let attempt = 0; attempt < 140; attempt += 1) {
        const px = Math.round((minEdge + random() * (WORLD_GRID_MAP_WIDTH - minEdge * 2)) / 8) * 8;
        const py = Math.round((minEdge + random() * (WORLD_GRID_MAP_HEIGHT - minEdge * 2)) / 8) * 8;
        if (pointConflictsWithProtected(px, py, radius + 24)) continue;
        if (pointConflictsWithReserved(px, py, radius + 8)) continue;
        const reservation = { kind, x: px, y: py, radius };
        featureReservations.push(reservation);
        return reservation;
      }
      return null;
    }

    function randomWorldPoint(minEdge = 38) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const px = Math.round(minEdge + random() * (WORLD_GRID_MAP_WIDTH - minEdge * 2));
        const py = Math.round(minEdge + random() * (WORLD_GRID_MAP_HEIGHT - minEdge * 2));
        if (pointConflictsWithProtected(px, py, 54)) continue;
        if (pointConflictsWithReserved(px, py, 22)) continue;
        return [px, py];
      }
      return [Math.round(WORLD_GRID_MAP_WIDTH / 2 + 80), Math.round(WORLD_GRID_MAP_HEIGHT / 2 + 60)];
    }

    function addFeature(type, reservation, extra = {}) {
      if (!reservation) return null;
      const feature = {
        id: `${mapId}:feature:${type}:${features.length + 1}`,
        type,
        x: reservation.x,
        y: reservation.y,
        radius: reservation.radius,
        ...extra
      };
      features.push(feature);
      return feature;
    }

    function addStoneFloorPatch(reservation) {
      if (!reservation) return;
      const offsets = [
        [0, 0], [-16, 0], [16, 0], [0, -16], [0, 16],
        [-16, -16], [16, 16], [32, 0], [0, 32]
      ];
      const keepCount = 5 + (worldGridHash(x, y, 733) % 4);
      offsets.slice(0, keepCount).forEach(([dx, dy], index) => {
        structures.push({
          id: `${mapId}:stone-patch:${index + 1}`,
          mapId,
          kind: "stoneFloor",
          x: reservation.x + dx,
          y: reservation.y + dy,
          worldGenerated: true,
          featureType: "stonePatch"
        });
      });
      // v414: generated scenery should be real gameplay content. Use the
      // existing mineable rock entity instead of an untouchable scenery rock.
      environment.rocks.push({
        id: `${mapId}:stone-patch:rock:1`,
        x: reservation.x + 26,
        y: reservation.y - 22,
        variant: "plain"
      });
    }

    function addMeadow(reservation) {
      if (!reservation) return;
      // v426: meadows now read as square tile-like patches instead of oval
      // radial blobs. The grass itself keeps tiny organic jitter/sway.
      const centerX = Math.round(reservation.x / 16) * 16;
      const centerY = Math.round(reservation.y / 16) * 16;
      const cells = [-24, -8, 8, 24];
      let index = 0;
      for (const dx of cells) {
        for (const dy of cells) {
          index += 1;
          environment.tallGrass.push({
            id: `${mapId}:meadow:grass:${index}`,
            x: centerX + dx + Math.floor(random() * 5) - 2,
            y: centerY + dy + Math.floor(random() * 5) - 2,
            phase: Number((random() * 6.28).toFixed(2)),
            width: 11 + Math.floor(random() * 6),
            flowerType: null
          });
        }
      }
      const flowerOffsets = [[-24,-24],[8,-24],[24,-8],[24,24],[-8,24],[-24,8]];
      flowerOffsets.forEach(([dx, dy], flowerIndex) => {
        environment.harvestFlowers.push({
          id: `${mapId}:meadow:flower:${flowerIndex + 1}`,
          x: centerX + dx,
          y: centerY + dy,
          phase: Number((random() * 6.28).toFixed(2)),
          type: flowerIndex % 2 === 0 ? "white" : "blue"
        });
      });
    }

    function addTreeRing(reservation) {
      if (!reservation) return;
      const count = 9;
      const ringRadius = Math.max(25, reservation.radius - 12);
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        environment.trees.push({
          id: `${mapId}:tree-ring:${index + 1}`,
          x: Math.round(reservation.x + Math.cos(angle) * ringRadius),
          y: Math.round(reservation.y + Math.sin(angle) * ringRadius * 0.78),
          phase: Number((random() * 6.28).toFixed(2)),
          fireImmune: false,
          nonInteractive: false,
          canopyVariant: index % 2
        });
      }
    }

    function addPond(reservation) {
      if (!reservation) return;
      const cx = Math.round(reservation.x / 8) * 8;
      const cy = Math.round(reservation.y / 8) * 8;
      // Three overlapping 8px-aligned rectangles make a tiny irregular pond
      // while reusing the existing water renderer/collision/reflection rules.
      terrainRegions.push(
        { type: "water", x: cx - 24, y: cy - 16, width: 48, height: 32 },
        { type: "water", x: cx - 16, y: cy - 24, width: 32, height: 48 },
        { type: "water", x: cx - 32, y: cy - 8, width: 64, height: 16 }
      );
    }

    function addGeneratedHouse(reservation, houseIndex) {
      if (!reservation) return;
      const cx = Math.round(reservation.x / 16) * 16;
      const cy = Math.round(reservation.y / 16) * 16;
      const ruin = (worldGridHash(x, y, 1313 + houseIndex * 17) % 1000) < 300;
      const floorKind = ruin && (worldGridHash(x, y, 1314 + houseIndex * 17) % 1000) < 650
        ? "stoneFloor"
        : "woodFloor";
      const floorOffsets = [
        [-16, -16], [0, -16], [16, -16],
        [-16, 0], [0, 0], [16, 0],
        [-16, 16], [0, 16], [16, 16]
      ];
      const missingFloorIndices = ruin
        ? new Set([worldGridHash(x, y, 1320 + houseIndex) % 9, worldGridHash(x, y, 1321 + houseIndex) % 9])
        : new Set();

      floorOffsets.forEach(([dx, dy], index) => {
        if (missingFloorIndices.has(index)) return;
        structures.push({
          id: `${mapId}:house:${houseIndex}:floor:${index + 1}`,
          mapId,
          kind: floorKind,
          x: cx + dx,
          y: cy + dy,
          worldGenerated: true,
          featureType: ruin ? "ruin" : "house"
        });
      });

      const boundaries = [];
      for (const dx of [-16, 0, 16]) {
        boundaries.push({ edge: `north:${dx}`, kind: "woodWall", x: cx + dx, y: cy - 24, axis: "horizontal" });
        boundaries.push({ edge: `south:${dx}`, kind: dx === 0 ? "woodDoor" : "woodWall", x: cx + dx, y: cy + 24, axis: "horizontal" });
      }
      for (const dy of [-16, 0, 16]) {
        boundaries.push({ edge: `west:${dy}`, kind: "woodWall", x: cx - 24, y: cy + dy, axis: "vertical" });
        boundaries.push({ edge: `east:${dy}`, kind: "woodWall", x: cx + 24, y: cy + dy, axis: "vertical" });
      }
      const missingBoundaryIndices = ruin
        ? new Set([
            worldGridHash(x, y, 1322 + houseIndex) % boundaries.length,
            worldGridHash(x, y, 1323 + houseIndex) % boundaries.length,
            worldGridHash(x, y, 1324 + houseIndex) % boundaries.length
          ])
        : new Set();

      boundaries.forEach((boundary, index) => {
        if (missingBoundaryIndices.has(index)) return;
        structures.push({
          id: `${mapId}:house:${houseIndex}:boundary:${index + 1}`,
          mapId,
          kind: ruin && boundary.kind === "woodDoor" ? "woodWall" : boundary.kind,
          x: boundary.x,
          y: boundary.y,
          axis: boundary.axis,
          worldGenerated: true,
          featureType: ruin ? "ruin" : "house"
        });
      });

      const feature = addFeature(ruin ? "ruin" : "house", { ...reservation, x: cx, y: cy }, {
        houseIndex,
        roofEligible: !ruin
      });

      const treasureRoll = worldGridHash(x, y, 1325 + houseIndex * 19) % 1000;
      if (treasureRoll < (ruin ? 220 : 380)) {
        structures.push({
          id: `${mapId}:treasure:${houseIndex}`,
          mapId,
          kind: "chest",
          x: cx,
          y: cy,
          worldGenerated: true,
          treasure: true,
          opened: false,
          featureType: ruin ? "ruin" : "house",
          featureId: feature?.id || null
        });
      }
    }

    // Decide/occupy the large feature zones before ordinary random scenery so
    // trees and rocks do not spawn through ponds, clearings or structures.
    if (distance > 0 && WORLD_GENERATED_HOUSE_MAPS.has(mapId)) {
      // The world-level roll already decides whether this generation contains
      // zero, one, or (rarely) two houses. Each selected corner gets one, so
      // the total can never silently exceed that rarity budget.
      const reservation = reserveFeaturePoint("house", 54, 82);
      addGeneratedHouse(reservation, 1);
    }

    if (distance > 0) {
      if (WORLD_GENERATION_SEED === 0) {
        // Keep the v413 fixture layout available to retained regression tests.
        const scenicTypes = ["pond", "meadow", "treeRing", "stonePatch"];
        const scenicCount = 1 + ((worldGridHash(x, y, 611) % 100) < 38 ? 1 : 0);
        const startType = worldGridHash(x, y, 612) % scenicTypes.length;
        for (let index = 0; index < scenicCount; index += 1) {
          const type = scenicTypes[(startType + index * 2) % scenicTypes.length];
          const radius = type === "pond" ? 48 : type === "treeRing" ? 52 : 44;
          const reservation = reserveFeaturePoint(type, radius, 68);
          if (!reservation) continue;
          addFeature(type, reservation);
          if (type === "pond") addPond(reservation);
          else if (type === "meadow") addMeadow(reservation);
          else if (type === "treeRing") addTreeRing(reservation);
          else if (type === "stonePatch") addStoneFloorPatch(reservation);
        }
      } else {
        // v414 live worlds use independent rarity rolls. Tree rings are a
        // distinctive landmark and intentionally much rarer than ponds. Cap
        // scenic features at two per map so a map can also simply breathe.
        const candidates = [
          { type: "pond", threshold: 330, salt: 611, radius: 48 },
          { type: "meadow", threshold: 230, salt: 613, radius: 44 },
          { type: "stonePatch", threshold: 220, salt: 615, radius: 44 },
          { type: "treeRing", threshold: 80, salt: 617, radius: 52 }
        ]
          .filter(entry => (worldGridHash(x, y, entry.salt) % 1000) < entry.threshold)
          .sort((a, b) => worldGridHash(x, y, a.salt + 100) - worldGridHash(x, y, b.salt + 100))
          .slice(0, 2);

        for (const entry of candidates) {
          const reservation = reserveFeaturePoint(entry.type, entry.radius, 68);
          if (!reservation) continue;
          addFeature(entry.type, reservation);
          if (entry.type === "pond") addPond(reservation);
          else if (entry.type === "meadow") addMeadow(reservation);
          else if (entry.type === "treeRing") addTreeRing(reservation);
          else if (entry.type === "stonePatch") addStoneFloorPatch(reservation);
        }
      }
    }

    const treeCount = biome === "forest" ? 20 : biome === "rocky-plains" ? 7 : biome === "spawn-plains" ? 9 : 12;
    const grassCount = biome === "forest" ? 24 : biome === "rocky-plains" ? 8 : biome === "spawn-plains" ? 14 : 18;
    const rockCount = biome === "rocky-plains" ? 10 : biome === "forest" ? 4 : 5;

    for (let index = 0; index < treeCount; index += 1) {
      const [px, py] = randomWorldPoint();
      environment.trees.push({
        id: `${mapId}:tree:${index + 1}`,
        x: px, y: py,
        phase: Number((random() * 6.28).toFixed(2)),
        fireImmune: false,
        nonInteractive: false,
        canopyVariant: index % 2
      });
    }

    const flowerTypes = [null, null, null, "yellow", "white", "blue"];
    for (let index = 0; index < grassCount; index += 1) {
      const [px, py] = randomWorldPoint(26);
      environment.tallGrass.push({
        id: `${mapId}:grass:${index + 1}`,
        x: px, y: py,
        phase: Number((random() * 6.28).toFixed(2)),
        width: 10 + Math.floor(random() * 7),
        flowerType: flowerTypes[Math.floor(random() * flowerTypes.length)] || null
      });
    }

    for (let index = 0; index < rockCount; index += 1) {
      const [px, py] = randomWorldPoint(30);
      environment.rocks.push({
        id: `${mapId}:rock:${index + 1}`,
        x: px, y: py,
        variant: random() < 0.35 ? "grass" : "plain"
      });
    }

    const harvestFlowerCount = biome === "forest" ? 6 : biome === "spawn-plains" ? 5 : 3;
    for (let index = 0; index < harvestFlowerCount; index += 1) {
      const [px, py] = randomWorldPoint(28);
      environment.harvestFlowers.push({
        id: `${mapId}:flower:${index + 1}`,
        x: px, y: py,
        phase: Number((random() * 6.28).toFixed(2)),
        type: index % 2 === 0 ? "white" : "blue"
      });
    }

    // v398: coordinate-world enemy positions are not part of WORLD_CONTENT.
    // This object only describes the per-map population rules. The server
    // chooses concrete enemy positions at runtime for each server session.
    const enemyGeneration = {
      level: 1 + distance,
      slimeCount: distance > 0 ? (biome === "forest" ? 3 : 4) : 0,
      mushroomCount: distance > 0 && biome === "forest" ? 2 : 0,
      purpleSlimeChance: distance > 0 ? 0.16 : 0
    };

    if (biome === "rocky-plains") {
      for (let index = 0; index < 7; index += 1) {
        const [px, py] = randomWorldPoint(24);
        terrainRegions.push({
          type: "dirt",
          x: Math.floor(px / 8) * 8,
          y: Math.floor(py / 8) * 8,
          width: 32 + Math.floor(random() * 5) * 8,
          height: 24 + Math.floor(random() * 4) * 8
        });
      }
    }

    // v420: the coordinate-world spawn has no mandatory starter NPC or static
    // crafting bench. New characters receive starter tools directly and build
    // their own portable Crafting Table as the first hand-crafted workstation.

    return {
      name: x === 0 && y === 0 ? "Spawn" : `${biome === "forest" ? "Forest" : biome === "rocky-plains" ? "Rocky Plains" : "Plains"} ${x},${y}`,
      dimensions: { width: WORLD_GRID_MAP_WIDTH, height: WORLD_GRID_MAP_HEIGHT },
      grid: { x, y, distance, difficulty: distance, biome, seed },
      playerSpawns: [
        { id: "center", x: WORLD_GRID_MAP_WIDTH / 2, y: WORLD_GRID_MAP_HEIGHT / 2 },
        { id: "west", x: 20, y: WORLD_GRID_MAP_HEIGHT / 2 },
        { id: "east", x: WORLD_GRID_MAP_WIDTH - 20, y: WORLD_GRID_MAP_HEIGHT / 2 },
        { id: "north", x: WORLD_GRID_MAP_WIDTH / 2, y: 24 },
        { id: "south", x: WORLD_GRID_MAP_WIDTH / 2, y: WORLD_GRID_MAP_HEIGHT - 24 }
      ],
      portals: [],
      environment,
      structures,
      features,
      enemyGeneration,
      npcs,
      terrain: { cellSize: 8, defaultType: "grass", regions: terrainRegions },
      collision: { waterRects: [] }
    };
  }

  const maps = {};
  for (let y = -WORLD_GRID_RADIUS; y <= WORLD_GRID_RADIUS; y += 1) {
    for (let x = -WORLD_GRID_RADIUS; x <= WORLD_GRID_RADIUS; x += 1) {
      maps[worldGridMapId(x, y)] = buildWorldGridMap(x, y);
    }
  }

  const worldGrid = Object.freeze({
    radius: WORLD_GRID_RADIUS,
    startX: 0,
    startY: 0,
    startMapId: worldGridMapId(0, 0),
    mapWidth: WORLD_GRID_MAP_WIDTH,
    mapHeight: WORLD_GRID_MAP_HEIGHT
  });

  return Object.freeze({
    version: 414,
    schemaVersion: 2,
    worldSeed: WORLD_GENERATION_SEED >>> 0,
    worldGrid,
    defaultPlayerLoad: Object.freeze({ mapId: worldGrid.startMapId, spawnId: "center" }),
    maps
  });
});
