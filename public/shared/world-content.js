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
            x: 265,
            y: 228,
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
            y: 172,
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
              x: 300,
              y: 258,
              width: 120,
              height: 58
            }
          ]
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
      version: 4,
      maps
    });
  }
);
