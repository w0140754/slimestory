(function (root, factory) {
  const content = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = content;
  }

  if (root) {
    root.WORLD_CONTENT = content;
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    // Natural enemy placement is shared by the browser and Node server.
    //
    // Adding another slime to an existing map is only a new spawn object here.
    // A brand-new map still needs its visual terrain/portals in index.html, but
    // the enemy networking layer does not need another map-specific handler.
    const maps = {
      spawn: {
        enemySpawns: [],
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

    return Object.freeze({
      // Bump this whenever shared map/enemy placement changes. The browser
      // loads this file with the matching version in its URL so an old cached
      // registry cannot disagree with the running Node server.
      version: 10,
      maps
    });
  }
);
