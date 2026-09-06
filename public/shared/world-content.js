(function (root, factory) {
  const content = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = content;
  if (root) root.WORLD_CONTENT = content;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // v384: the retired visual-map-editor world and its authored override store
  // have been removed. The coordinate grid below is the single canonical world.
  const WORLD_GRID_RADIUS = 1;
  const WORLD_GRID_MAP_WIDTH = 400;
  const WORLD_GRID_MAP_HEIGHT = 400;

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

  function buildWorldGridMap(x, y) {
    const mapId = worldGridMapId(x, y);
    const distance = Math.abs(x) + Math.abs(y);
    const biome = worldGridBiomeFor(x, y);
    const seed = worldGridHash(x, y, 377);
    const random = makeWorldGridRandom(seed);
    const environment = {
      trees: [], tallGrass: [], rocks: [], sceneryRocks: [], harvestFlowers: [], houses: []
    };

    const protectedPoints = [
      [WORLD_GRID_MAP_WIDTH / 2, WORLD_GRID_MAP_HEIGHT / 2],
      [18, WORLD_GRID_MAP_HEIGHT / 2],
      [WORLD_GRID_MAP_WIDTH - 18, WORLD_GRID_MAP_HEIGHT / 2],
      [WORLD_GRID_MAP_WIDTH / 2, 22],
      [WORLD_GRID_MAP_WIDTH / 2, WORLD_GRID_MAP_HEIGHT - 22]
    ];

    function randomWorldPoint(minEdge = 38) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const px = Math.round(minEdge + random() * (WORLD_GRID_MAP_WIDTH - minEdge * 2));
        const py = Math.round(minEdge + random() * (WORLD_GRID_MAP_HEIGHT - minEdge * 2));
        const protectedSpawn = protectedPoints.some(([sx, sy]) => Math.hypot(px - sx, py - sy) < 54);
        if (!protectedSpawn) return [px, py];
      }
      return [Math.round(WORLD_GRID_MAP_WIDTH / 2 + 80), Math.round(WORLD_GRID_MAP_HEIGHT / 2 + 60)];
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

    const enemySpawns = [];
    if (distance > 0) {
      const slimeCount = biome === "forest" ? 3 : 4;
      for (let index = 0; index < slimeCount; index += 1) {
        const [px, py] = randomWorldPoint(50);
        enemySpawns.push({
          id: `${mapId}:slime:${index + 1}`,
          type: "slime",
          level: 1 + distance,
          x: px, y: py,
          phase: Number((random() * 6.28).toFixed(2)),
          wanderRadiusX: 18 + Math.floor(random() * 14),
          wanderRadiusY: 12 + Math.floor(random() * 10),
          ...(random() < 0.16 ? { variant: "purple" } : {})
        });
      }
      if (biome === "forest") {
        for (let index = 0; index < 2; index += 1) {
          const [px, py] = randomWorldPoint(50);
          enemySpawns.push({
            id: `${mapId}:mushroom:${index + 1}`,
            type: "mushroom",
            level: 1 + distance,
            x: px, y: py,
            phase: Number((random() * 6.28).toFixed(2))
          });
        }
      }
    }

    const terrainRegions = [];
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

    const npcs = [];
    if (x === 0 && y === 0) {
      npcs.push(
        { id: `${mapId}:npc:marnie`, type: "shopkeeper", name: "Marnie", x: 174, y: 190, interactionRadius: 24 },
        { id: `${mapId}:npc:crafting`, type: "craftingTable", x: 226, y: 190, interactionRadius: 24 }
      );
    }

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
      enemySpawns,
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
    version: 390,
    schemaVersion: 1,
    worldGrid,
    defaultPlayerLoad: Object.freeze({ mapId: worldGrid.startMapId, spawnId: "center" }),
    maps
  });
});
