(function (root, factory) {
  let adopted = null;
  if (typeof module !== "undefined" && module.exports) {
    try { adopted = require("../../content/adopted-map-overrides.json"); } catch {}
  } else if (root) {
    adopted = root.ADOPTED_MAP_OVERRIDES || null;
  }

  const content = factory(adopted);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = content;
  }

  if (root) {
    root.WORLD_CONTENT = content;
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (adoptedMapOverrides) {
    "use strict";

    // -------------------------------------------------------------------------
    // EDITOR-FRIENDLY MAP DATA
    // -------------------------------------------------------------------------
    // These helpers only construct plain JSON-safe map content. Runtime state
    // (HP, burn timers, render interpolation, etc.) is created by the client or
    // server after loading this shared definition. That separation is the core
    // contract the visual map editor will write to.
    function buildPrototypeEnvironment({
      mapId,
      westOpening = false,
      phaseStart = 0.42,
      mainX = 200,
      mainY = 130,
      mainWidth = 300,
      mainHeight = 300,
      interiorTrees = [],
      tallGrass = [],
      rocks = [],
      sceneryRocks = []
    }) {
      const trees = [];
      let phase = phaseStart;

      function addTree(x, y, options = {}) {
        const index = trees.length + 1;
        trees.push({
          id: `${mapId}:tree:${index}`,
          x,
          y,
          phase,
          fireImmune: options.fireImmune !== false,
          nonInteractive: options.nonInteractive !== false,
          ...(Number.isInteger(options.canopyVariant)
            ? { canopyVariant: options.canopyVariant }
            : {})
        });
        phase += 0.73;
      }

      const leftX = mainX + 10;
      const rightX = mainX + mainWidth - 10;
      const topOuterY = mainY + 20;
      const topInnerBaseY = mainY + 47;
      const bottomOuterY = mainY + mainHeight - 10;
      const bottomInnerBaseY = mainY + mainHeight - 37;

      for (let x = mainX + 22; x <= mainX + mainWidth - 14; x += 30) {
        addTree(x, topOuterY + ((((x / 30) | 0) % 3) === 1 ? -2 : 0));
        addTree(x, bottomOuterY + ((((x / 30) | 0) % 3) === 2 ? 2 : 0));
      }

      let innerIndex = 0;
      for (let x = mainX + 36; x <= mainX + mainWidth - 20; x += 34) {
        const wobble = [-4, 2, -1, 5, 0][innerIndex % 5];
        const xWobble = [0, 3, -2, 2, -3][innerIndex % 5];
        addTree(x + xWobble, topInnerBaseY + wobble);
        addTree(x - xWobble, bottomInnerBaseY - wobble);
        innerIndex += 1;
      }

      const gateTop = 248;
      const gateBottom = 314;
      for (let y = mainY + 46; y <= mainY + mainHeight - 20; y += 30) {
        const inGate = y >= gateTop && y <= gateBottom;
        if ((westOpening && !inGate) || !westOpening) {
          addTree(leftX, y);
        }
        if (!inGate) {
          addTree(rightX, y);
        }
      }

      for (const [x, y] of interiorTrees) {
        addTree(x, y, {
          fireImmune: false,
          nonInteractive: false,
          canopyVariant: 0
        });
      }

      return {
        trees,
        tallGrass: tallGrass.map((item, index) => ({
          id: `${mapId}:grass:${index + 1}`,
          x: item.x,
          y: item.y,
          phase: item.phase,
          width: item.width ?? 13,
          flowerType: item.flowerType ?? null
        })),
        rocks: rocks.map((item, index) => ({
          id: `${mapId}:rock:${index + 1}`,
          x: item.x,
          y: item.y,
          variant: item.variant || "plain"
        })),
        sceneryRocks: sceneryRocks.map((item, index) => ({
          id: `${mapId}:sceneryRock:${index + 1}`,
          x: item.x,
          y: item.y,
          collision: { width: 10, height: 6 }
        })),
        harvestFlowers: [],
        houses: []
      };
    }

    const prototypeIslandEnvironment = buildPrototypeEnvironment({
      mapId: "prototypeIsland",
      westOpening: true,
      phaseStart: 0.42,
      mainWidth: 300,
      interiorTrees: [
        [286, 245],
        [412, 220],
        [350, 355]
      ],
      tallGrass: [
        { x: 266, y: 310, phase: 0.8, width: 13 },
        { x: 430, y: 338, phase: 1.9, width: 12, flowerType: "yellow" },
        { x: 338, y: 205, phase: 3.2, width: 14 }
      ],
      rocks: [
        { x: 266, y: 188, variant: "plain" },
        { x: 448, y: 305, variant: "grass" },
        { x: 300, y: 392, variant: "plain" }
      ],
      sceneryRocks: [
        { x: 244, y: 198 },
        { x: 455, y: 378 }
      ]
    });

    const prototypeIslandWestEnvironment = buildPrototypeEnvironment({
      mapId: "prototypeIslandWest",
      westOpening: false,
      phaseStart: 1.17,
      mainWidth: 600,
      interiorTrees: [
        [290, 225],
        [455, 215],
        [625, 240],
        [738, 330],
        [365, 365],
        [560, 350]
      ],
      tallGrass: [
        { x: 315, y: 275, phase: 0.7, width: 16 },
        { x: 335, y: 292, phase: 1.4, width: 13 },
        { x: 492, y: 315, phase: 2.1, width: 18 },
        { x: 515, y: 296, phase: 2.8, width: 14, flowerType: "yellow" },
        { x: 675, y: 270, phase: 3.6, width: 17 },
        { x: 705, y: 292, phase: 4.2, width: 13 }
      ],
      rocks: [
        { x: 265, y: 350, variant: "plain" },
        { x: 405, y: 250, variant: "grass" },
        { x: 575, y: 300, variant: "plain" },
        { x: 715, y: 220, variant: "grass" },
        { x: 650, y: 385, variant: "plain" }
      ],
      sceneryRocks: [
        { x: 246, y: 195 },
        { x: 530, y: 382 },
        { x: 748, y: 194 }
      ]
    });

    function buildWaterfallGroveMap() {
      const mapId = "waterfallGrove";
      const trees = [];
      const tallGrass = [];
      const harvestFlowers = [];
      let treePhase = 0.21;

      function addTree(x, y, { perimeter = false, variant = trees.length % 2 } = {}) {
        trees.push({
          id: `${mapId}:tree:${trees.length + 1}`,
          x,
          y,
          phase: Number(treePhase.toFixed(2)),
          fireImmune: perimeter,
          nonInteractive: perimeter,
          canopyVariant: variant
        });
        treePhase += 0.57;
      }

      // Two staggered rows frame the grove while preserving a broad southern
      // entrance and an open view toward the waterfall.
      for (const y of [84, 110]) {
        const offset = y === 110 ? 12 : 0;
        for (let x = 80 + offset; x <= 248; x += 28) addTree(x, y, { perimeter: true });
        for (let x = 392 + offset; x <= 560; x += 28) addTree(x, y, { perimeter: true });
      }
      for (const y of [432, 456]) {
        const offset = y === 432 ? 12 : 0;
        for (let x = 80 + offset; x <= 560; x += 28) {
          if (x >= 276 && x <= 364) continue;
          addTree(x, y, { perimeter: true });
        }
      }
      for (let y = 132; y <= 416; y += 28) {
        addTree(80, y, { perimeter: true });
        addTree(104, y + 12, { perimeter: true });
        addTree(536, y + 12, { perimeter: true });
        addTree(560, y, { perimeter: true });
      }

      // Irregular inner stands make the canopy feel natural instead of like a
      // rectangular wall. These trees remain part of the interactive world.
      [
        [132, 164], [158, 188], [126, 242], [154, 276], [118, 334],
        [150, 370], [190, 404], [230, 430], [508, 166], [482, 190],
        [516, 244], [486, 282], [522, 336], [488, 374], [446, 414],
        [410, 438], [198, 146], [442, 146]
      ].forEach(([x, y], index) => addTree(x, y, { variant: index % 2 }));

      const grassPatches = [
        [178, 232, "yellow"], [196, 252, "pink"], [154, 302, "white"],
        [188, 326, "blue"], [216, 350, "yellow"], [176, 390, "pink"],
        [248, 330, "white"], [260, 372, "blue"], [236, 410, "yellow"],
        [462, 232, "pink"], [444, 258, "white"], [480, 310, "blue"],
        [438, 338, "yellow"], [466, 366, "pink"], [408, 386, "white"],
        [394, 426, "blue"], [284, 344, "yellow"], [356, 354, "pink"],
        [278, 398, "white"], [366, 404, "blue"], [206, 286, null],
        [426, 292, null], [260, 246, "pink"], [380, 250, "yellow"]
      ];
      grassPatches.forEach(([x, y, flowerType], index) => {
        tallGrass.push({
          id: `${mapId}:grass:${index + 1}`,
          x,
          y,
          phase: Number((0.35 + index * 0.49).toFixed(2)),
          width: 11 + (index % 5),
          flowerType
        });
      });

      [
        [164, 214, "white"], [190, 274, "blue"], [146, 352, "white"],
        [212, 382, "blue"], [250, 308, "white"], [270, 430, "blue"],
        [476, 216, "white"], [452, 280, "blue"], [494, 346, "white"],
        [430, 366, "blue"], [392, 444, "white"], [370, 322, "blue"],
        [226, 334, "white"], [416, 238, "blue"], [198, 414, "white"],
        [458, 404, "blue"]
      ].forEach(([x, y, type], index) => {
        harvestFlowers.push({
          id: `${mapId}:flower:${index + 1}`,
          x,
          y,
          phase: Number((0.18 + index * 0.63).toFixed(2)),
          type
        });
      });

      return {
        name: "Waterfall Grove",
        dimensions: { width: 640, height: 520 },
        playerSpawns: [
          { id: "southEntrance", x: 320, y: 430 }
        ],
        portals: [
          {
            id: `${mapId}:portal:south`,
            x: 292, y: 452, width: 56, height: 12,
            targetMapId: "prototypeIslandWest",
            targetSpawnId: "waterfallTrail"
          }
        ],
        environment: {
          trees,
          tallGrass,
          rocks: [
            { id: `${mapId}:rock:1`, x: 206, y: 214, variant: "grass" },
            { id: `${mapId}:rock:2`, x: 434, y: 218, variant: "grass" },
            { id: `${mapId}:rock:3`, x: 226, y: 294, variant: "plain" },
            { id: `${mapId}:rock:4`, x: 414, y: 296, variant: "plain" }
          ],
          sceneryRocks: [
            { id: `${mapId}:sceneryRock:1`, x: 184, y: 196, collision: { width: 12, height: 7 } },
            { id: `${mapId}:sceneryRock:2`, x: 456, y: 198, collision: { width: 12, height: 7 } },
            { id: `${mapId}:sceneryRock:3`, x: 246, y: 286, collision: { width: 10, height: 6 } },
            { id: `${mapId}:sceneryRock:4`, x: 394, y: 286, collision: { width: 10, height: 6 } }
          ],
          harvestFlowers,
          houses: []
        },
        enemySpawns: [],
        npcs: [],
        landmarks: {
          waterfall: {
            x: 320,
            topY: 76,
            baseY: 218,
            width: 88,
            cliffLeft: 160,
            cliffRight: 480,
            pool: { x: 224, y: 200, width: 192, height: 104 }
          },
          lightBeams: [
            { x: 230, y: 58, width: 58, height: 240, lean: 42, alpha: 0.09 },
            { x: 340, y: 48, width: 74, height: 270, lean: 24, alpha: 0.12 },
            { x: 430, y: 70, width: 42, height: 210, lean: -18, alpha: 0.07 }
          ]
        },
        terrain: {
          cellSize: 8,
          defaultType: "void",
          regions: [
            { type: "grass", x: 64, y: 64, width: 512, height: 400 },
            { type: "dirt", x: 304, y: 272, width: 32, height: 192 },
            { type: "dirt", x: 288, y: 272, width: 64, height: 40 },
            { type: "water", x: 248, y: 192, width: 144, height: 8 },
            { type: "water", x: 232, y: 200, width: 176, height: 16 },
            { type: "water", x: 224, y: 216, width: 192, height: 56 },
            { type: "water", x: 232, y: 272, width: 176, height: 16 },
            { type: "water", x: 248, y: 288, width: 144, height: 16 },
            { type: "water", x: 272, y: 80, width: 96, height: 152 },
            { type: "void", x: 160, y: 64, width: 112, height: 136 },
            { type: "void", x: 368, y: 64, width: 112, height: 136 }
          ]
        },
        collision: { waterRects: [] }
      };
    }

    const waterfallGroveMap = buildWaterfallGroveMap();

    // Canonical shared world definitions. Prototype Island and Prototype West
    // now exercise the editor-facing schema end to end; legacy maps are migrated
    // gradually so gameplay does not change all at once.
    const maps = {
      spawn: {
        name: "Spawn Clearing",
        dimensions: {
          width: 344,
          height: 224
        },
        playerSpawns: [
          { id: "westPrototype", x: 26, y: 100 }
        ],
        enemySpawns: [],
        collision: {
          waterRects: []
        }
      },

      prototypeIsland: {
        name: "Prototype Island",
        dimensions: {
          width: 760,
          height: 560
        },
        playerSpawns: [
          { id: "center", x: 350, y: 280 },
          { id: "eastBridge", x: 564, y: 280 },
          { id: "westBridge", x: 136, y: 280 }
        ],
        portals: [
          {
            id: "prototypeIsland:portal:east",
            x: 568, y: 254, width: 12, height: 52,
            targetMapId: "spawn",
            targetSpawnId: "westPrototype"
          },
          {
            id: "prototypeIsland:portal:west",
            x: 120, y: 254, width: 12, height: 52,
            targetMapId: "prototypeIslandWest",
            targetSpawnId: "eastBridge"
          }
        ],
        environment: prototypeIslandEnvironment,
        enemySpawns: [
          {
            id: "prototypeIsland:slime:1",
            type: "slime",
            level: 1,
            x: 270,
            y: 225,
            phase: 0.4,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "prototypeIsland:slime:2",
            type: "slime",
            level: 1,
            x: 420,
            y: 235,
            phase: 1.8,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "prototypeIsland:slime:3",
            type: "slime",
            level: 1,
            x: 350,
            y: 345,
            phase: 3.1,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          }
        ],
        // First terrain-driven map. Regions are ordered paint operations: the
        // grass island is laid down first, then dirt and water paint over it.
        // This is deliberately data-only so the future map editor can write
        // the same structure the server and client already consume.
        terrain: {
          cellSize: 8,
          defaultType: "void",
          regions: [
            { type: "grass", x: 200, y: 130, width: 300, height: 300 },
            { type: "grass", x: 122, y: 266, width: 78, height: 28 },
            { type: "grass", x: 500, y: 266, width: 78, height: 28 },

            // A restrained central trail demonstrates a real dirt material.
            { type: "dirt", x: 122, y: 272, width: 456, height: 16 },

            // Small stepped pond kept away from the main slime spawns. Water
            // is non-walkable and cannot host Magic Grass.
            { type: "water", x: 250, y: 334, width: 56, height: 32 },
            { type: "water", x: 258, y: 326, width: 40, height: 48 }
          ]
        },
        collision: {
          waterRects: []
        }
      },

      prototypeIslandWest: {
        name: "Prototype Island West",
        dimensions: {
          width: 1060,
          height: 560
        },
        playerSpawns: [
          { id: "center", x: 500, y: 280 },
          { id: "eastBridge", x: 864, y: 280 }
        ],
        portals: [
          {
            id: "prototypeIslandWest:portal:east",
            x: 868, y: 254, width: 12, height: 52,
            targetMapId: "prototypeIsland",
            targetSpawnId: "westBridge"
          }
        ],
        environment: prototypeIslandWestEnvironment,
        enemySpawns: [
          {
            id: "prototypeIslandWest:slime:1",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 285,
            y: 205,
            phase: 0.2,
            wanderRadiusX: 20,
            wanderRadiusY: 15
          },
          {
            id: "prototypeIslandWest:slime:2",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 420,
            y: 190,
            phase: 1.1,
            wanderRadiusX: 22,
            wanderRadiusY: 15
          },
          {
            id: "prototypeIslandWest:slime:3",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 565,
            y: 225,
            phase: 2.0,
            wanderRadiusX: 20,
            wanderRadiusY: 15
          },
          {
            id: "prototypeIslandWest:slime:4",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 700,
            y: 205,
            phase: 3.0,
            wanderRadiusX: 23,
            wanderRadiusY: 16
          },
          {
            id: "prototypeIslandWest:slime:5",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 330,
            y: 330,
            phase: 4.0,
            wanderRadiusX: 22,
            wanderRadiusY: 16
          },
          {
            id: "prototypeIslandWest:slime:6",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 520,
            y: 350,
            phase: 5.0,
            wanderRadiusX: 19,
            wanderRadiusY: 14
          },
          {
            id: "prototypeIslandWest:slime:7",
            type: "slime",
            variant: "blue",
            level: 2,
            x: 720,
            y: 355,
            phase: 5.8,
            wanderRadiusX: 24,
            wanderRadiusY: 17
          }
        ],
        terrain: {
          cellSize: 8,
          defaultType: "void",
          regions: [
            { type: "grass", x: 200, y: 130, width: 600, height: 300 },
            { type: "grass", x: 800, y: 266, width: 78, height: 28 },

            // West keeps more uninterrupted grass; the dirt route only guides
            // the player from the east bridge into the broad clearing.
            { type: "dirt", x: 620, y: 272, width: 258, height: 16 }
          ]
        },
        collision: {
          waterRects: []
        }
      },

      waterfallGrove: waterfallGroveMap,


      crabBeach: {
        name: "Crab Beach",
        dimensions: {
          width: 920,
          height: 560
        },
        playerSpawns: [
          { id: "westDune", x: 156, y: 286 },
          { id: "centerBeach", x: 356, y: 286 },
          { id: "eastShore", x: 708, y: 300 }
        ],
        portals: [
          {
            id: "crabBeach:portal:west",
            x: 116, y: 252, width: 12, height: 60,
            targetMapId: "prototypeIslandWest",
            targetSpawnId: "center"
          }
        ],
        environment: {
          trees: [],
          tallGrass: [],
          rocks: [
            { id: "crabBeach:rock:1", x: 228, y: 222, variant: "plain" },
            { id: "crabBeach:rock:2", x: 322, y: 360, variant: "plain" },
            { id: "crabBeach:rock:3", x: 438, y: 206, variant: "plain" }
          ],
          sceneryRocks: [
            { id: "crabBeach:sceneryRock:1", x: 184, y: 172, collision: { width: 10, height: 6 } },
            { id: "crabBeach:sceneryRock:2", x: 270, y: 404, collision: { width: 10, height: 6 } },
            { id: "crabBeach:sceneryRock:3", x: 516, y: 188, collision: { width: 10, height: 6 } },
            { id: "crabBeach:sceneryRock:4", x: 654, y: 396, collision: { width: 10, height: 6 } }
          ],
          harvestFlowers: [],
          houses: []
        },
        enemySpawns: [
          {
            id: "crabBeach:crab:1",
            type: "crab",
            level: 3,
            x: 286,
            y: 246,
            phase: 0.4,
            wanderRadiusX: 24,
            wanderRadiusY: 10
          },
          {
            id: "crabBeach:crab:2",
            type: "crab",
            level: 3,
            x: 382,
            y: 318,
            phase: 1.1,
            wanderRadiusX: 24,
            wanderRadiusY: 10
          },
          {
            id: "crabBeach:crab:3",
            type: "crab",
            level: 4,
            x: 548,
            y: 258,
            phase: 2.1,
            wanderRadiusX: 26,
            wanderRadiusY: 10
          },
          {
            id: "crabBeach:crab:4",
            type: "crab",
            level: 4,
            x: 640,
            y: 332,
            phase: 3.2,
            wanderRadiusX: 26,
            wanderRadiusY: 10
          }
        ],
        terrain: {
          cellSize: 8,
          defaultType: "void",
          regions: [
            { type: "sand", x: 120, y: 140, width: 640, height: 264 },
            { type: "sand", x: 96, y: 220, width: 48, height: 88 },
            { type: "sand", x: 176, y: 124, width: 464, height: 24 },
            { type: "sand", x: 176, y: 404, width: 420, height: 16 },
            { type: "sand", x: 760, y: 236, width: 40, height: 72 },
            { type: "water", x: 488, y: 228, width: 304, height: 164 },
            { type: "water", x: 536, y: 196, width: 256, height: 196 },
            { type: "water", x: 600, y: 164, width: 192, height: 228 },
            { type: "water", x: 680, y: 140, width: 112, height: 252 },
            { type: "water", x: 396, y: 248, width: 56, height: 48 },
            { type: "water", x: 404, y: 240, width: 40, height: 64 }
          ]
        },
        collision: {
          waterRects: []
        }
      },

      meadow: {
        enemySpawns: [
          {
            id: "meadow:slime:1",
            type: "slime",
            level: 1,
            x: 235,
            y: 245,
            phase: 0.0
          },
          {
            id: "meadow:slime:2",
            type: "slime",
            level: 1,
            x: 82,
            y: 292,
            phase: 0.9,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "meadow:slime:3",
            type: "slime",
            level: 1,
            x: 112,
            y: 318,
            phase: 2.2,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "meadow:slime:4",
            type: "slime",
            level: 1,
            x: 143,
            y: 291,
            phase: 4.1,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          }
,
          {
            id: "meadow:slime:5",
            type: "slime",
            level: 1,
            x: 172,
            y: 124,
            phase: 0.5,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:6",
            type: "slime",
            level: 1,
            x: 205,
            y: 138,
            phase: 1.7,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:7",
            type: "slime",
            level: 1,
            x: 232,
            y: 121,
            phase: 3.0,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:8",
            type: "slime",
            level: 1,
            x: 444,
            y: 211,
            phase: 0.8,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:9",
            type: "slime",
            level: 1,
            x: 474,
            y: 228,
            phase: 2.4,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:10",
            type: "slime",
            level: 1,
            x: 506,
            y: 207,
            phase: 4.0,
            wanderRadiusX: 20,
            wanderRadiusY: 14
          },
          {
            id: "meadow:slime:11",
            type: "slime",
            level: 1,
            x: 330,
            y: 145,
            phase: 1.3,
            wanderRadiusX: 24,
            wanderRadiusY: 17
          },
          {
            id: "meadow:slime:12",
            type: "slime",
            level: 1,
            x: 455,
            y: 330,
            phase: 3.6,
            wanderRadiusX: 24,
            wanderRadiusY: 17
          }
        ],

        collision: {
          waterRects: [
            {
              x: 260,
              y: 171,
              width: 120,
              height: 58
            }
          ]
        }
      },

      hunterHollow: {
        enemySpawns: [
          {
            id: "hunterHollow:slime:1",
            type: "slime",
            variant: "blue",
            aggressiveOnSight: true,
            level: 2,
            x: 162,
            y: 168,
            phase: 0.4,
            wanderRadiusX: 18,
            wanderRadiusY: 14
          },
          {
            id: "hunterHollow:slime:2",
            type: "slime",
            variant: "blue",
            aggressiveOnSight: true,
            level: 2,
            x: 196,
            y: 184,
            phase: 1.7,
            wanderRadiusX: 18,
            wanderRadiusY: 14
          },
          {
            id: "hunterHollow:slime:3",
            type: "slime",
            variant: "blue",
            aggressiveOnSight: true,
            level: 2,
            x: 228,
            y: 165,
            phase: 3.0,
            wanderRadiusX: 18,
            wanderRadiusY: 14
          },
          {
            id: "hunterHollow:slime:4",
            type: "slime",
            variant: "purple",
            aggressiveOnSight: true,
            level: 4,
            x: 404,
            y: 214,
            phase: 0.9,
            wanderRadiusX: 20,
            wanderRadiusY: 15
          },
          {
            id: "hunterHollow:slime:5",
            type: "slime",
            variant: "purple",
            aggressiveOnSight: true,
            level: 4,
            x: 439,
            y: 231,
            phase: 2.2,
            wanderRadiusX: 20,
            wanderRadiusY: 15
          },
          {
            id: "hunterHollow:slime:6",
            type: "slime",
            variant: "purple",
            aggressiveOnSight: true,
            level: 4,
            x: 472,
            y: 211,
            phase: 4.1,
            wanderRadiusX: 20,
            wanderRadiusY: 15
          },
          {
            id: "hunterHollow:slime:7",
            type: "slime",
            variant: "blue",
            aggressiveOnSight: true,
            level: 2,
            x: 310,
            y: 300,
            phase: 1.1,
            wanderRadiusX: 22,
            wanderRadiusY: 16
          },
          {
            id: "hunterHollow:slime:8",
            type: "slime",
            variant: "purple",
            aggressiveOnSight: true,
            level: 4,
            x: 515,
            y: 320,
            phase: 3.4,
            wanderRadiusX: 22,
            wanderRadiusY: 16
          }
        ],

        collision: {
          waterRects: []
        }
      },

      goldSlimeDen: {
        dimensions: {
          width: 520,
          height: 330
        },

        enemySpawns: [
          {
            id: "goldSlimeDen:bigGoldSlime:1",
            type: "bigGoldSlime",
            level: 4,
            x: 260,
            y: 184,
            phase: 0.8,
            hurlable: false
          },
          {
            id: "goldSlimeDen:slime:goldBaby:1",
            type: "slime",
            variant: "goldBaby",
            aggressiveOnSight: true,
            level: 3,
            x: 160,
            y: 142,
            phase: 0.3,
            wanderRadiusX: 24,
            wanderRadiusY: 18,
            spawnOnlyWhileBigGoldDead: true
          },
          {
            id: "goldSlimeDen:slime:goldBaby:2",
            type: "slime",
            variant: "goldBaby",
            aggressiveOnSight: true,
            level: 3,
            x: 360,
            y: 142,
            phase: 1.6,
            wanderRadiusX: 24,
            wanderRadiusY: 18,
            spawnOnlyWhileBigGoldDead: true
          },
          {
            id: "goldSlimeDen:slime:goldBaby:3",
            type: "slime",
            variant: "goldBaby",
            aggressiveOnSight: true,
            level: 3,
            x: 132,
            y: 218,
            phase: 2.8,
            wanderRadiusX: 22,
            wanderRadiusY: 16,
            spawnOnlyWhileBigGoldDead: true
          },
          {
            id: "goldSlimeDen:slime:goldBaby:4",
            type: "slime",
            variant: "goldBaby",
            aggressiveOnSight: true,
            level: 3,
            x: 388,
            y: 218,
            phase: 4.1,
            wanderRadiusX: 22,
            wanderRadiusY: 16,
            spawnOnlyWhileBigGoldDead: true
          },
          {
            id: "goldSlimeDen:slime:goldBaby:5",
            type: "slime",
            variant: "goldBaby",
            aggressiveOnSight: true,
            level: 3,
            x: 260,
            y: 270,
            phase: 5.2,
            wanderRadiusX: 26,
            wanderRadiusY: 16,
            spawnOnlyWhileBigGoldDead: true
          }
        ],

        collision: {
          waterRects: []
        }
      },

      goblinWoods: {
        enemySpawns: [
          {
            id: "goblinWoods:goblin:1",
            type: "goblin",
            level: 3,
            x: 270,
            y: 150,
            phase: 0.4
          },
          {
            id: "goblinWoods:goblin:2",
            type: "goblin",
            level: 3,
            x: 405,
            y: 215,
            phase: 2.0
          },
          {
            id: "goblinWoods:goblin:3",
            type: "goblin",
            level: 3,
            x: 500,
            y: 300,
            phase: 4.1
          },
          {
            id: "goblinWoods:goblin:4",
            type: "goblin",
            level: 3,
            x: 320,
            y: 128,
            phase: 0.9
          },
          {
            id: "goblinWoods:goblin:5",
            type: "goblin",
            level: 3,
            x: 365,
            y: 145,
            phase: 1.6
          },
          {
            id: "goblinWoods:goblin:6",
            type: "goblin",
            level: 3,
            x: 455,
            y: 170,
            phase: 2.4
          },
          {
            id: "goblinWoods:goblin:7",
            type: "goblin",
            level: 3,
            x: 285,
            y: 265,
            phase: 3.2
          },
          {
            id: "goblinWoods:goblin:8",
            type: "goblin",
            level: 3,
            x: 365,
            y: 290,
            phase: 4.7
          },
          {
            id: "goblinWoods:goblin:9",
            type: "goblin",
            level: 3,
            x: 465,
            y: 255,
            phase: 5.5
          }
        ],

        collision: {
          waterRects: []
        }
      },

      ghostGrove: {
        enemySpawns: [
          {
            id: "ghostGrove:ghost:1",
            type: "ghost",
            level: 5,
            x: 235,
            y: 170,
            phase: 0.4
          },
          {
            id: "ghostGrove:ghost:2",
            type: "ghost",
            level: 5,
            x: 430,
            y: 245,
            phase: 2.7
          }
        ],

        collision: {
          waterRects: []
        }
      }
    };

    // Drafts explicitly adopted from the visual editor replace their matching
    // canonical map definition here. The generated override remains plain
    // JSON-safe content, so client and server consume the exact same map.
    const adoptedMaps = adoptedMapOverrides?.maps;
    if (adoptedMaps && typeof adoptedMaps === "object") {
      for (const [mapId, adoptedMap] of Object.entries(adoptedMaps)) {
        if (!adoptedMap || typeof adoptedMap !== "object") continue;
        maps[mapId] = adoptedMap;
      }
    }

    const configuredDefaultLoad = adoptedMapOverrides?.defaultPlayerLoad;
    let defaultPlayerLoad = null;

    if (
      configuredDefaultLoad &&
      typeof configuredDefaultLoad.mapId === "string" &&
      typeof configuredDefaultLoad.spawnId === "string"
    ) {
      const targetMap = maps[configuredDefaultLoad.mapId];
      const targetSpawn = Array.isArray(targetMap?.playerSpawns)
        ? targetMap.playerSpawns.find(spawn => spawn?.id === configuredDefaultLoad.spawnId)
        : null;
      if (targetSpawn) {
        defaultPlayerLoad = Object.freeze({
          mapId: configuredDefaultLoad.mapId,
          spawnId: configuredDefaultLoad.spawnId
        });
      }
    }

    // v329 briefly stored the load marker on an individual map. Accept that
    // shape as a compatibility fallback, but v330 keeps the one global loading
    // target outside map data so choosing a new starting map never rewrites the
    // rest of another authored map.
    if (!defaultPlayerLoad) {
      for (const [mapId, map] of Object.entries(maps)) {
        const spawnId = typeof map?.defaultPlayerSpawnId === "string"
          ? map.defaultPlayerSpawnId
          : "";
        if (!spawnId) continue;
        const targetSpawn = Array.isArray(map?.playerSpawns)
          ? map.playerSpawns.find(spawn => spawn?.id === spawnId)
          : null;
        if (!targetSpawn) continue;
        defaultPlayerLoad = Object.freeze({ mapId, spawnId });
        break;
      }
    }

    return Object.freeze({
      // The adoption tool increments the shared content version whenever an
      // editor draft becomes canonical.
      version: Math.max(14, Number(adoptedMapOverrides?.version) || 14),
      schemaVersion: 1,
      defaultPlayerLoad,
      maps
    });
  }
);
