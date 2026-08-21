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
            x: 265,
            y: 228,
            phase: 0.0
          },
          {
            id: "meadow:slime:2",
            type: "slime",
            x: 82,
            y: 292,
            phase: 0.9,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "meadow:slime:3",
            type: "slime",
            x: 112,
            y: 318,
            phase: 2.2,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "meadow:slime:4",
            type: "slime",
            x: 143,
            y: 291,
            phase: 4.1,
            wanderRadiusX: 18,
            wanderRadiusY: 13
          },
          {
            id: "meadow:ghost:1",
            type: "ghost",
            x: 525,
            y: 105,
            phase: 0.4
          },
          {
            id: "meadow:ghost:2",
            type: "ghost",
            x: 540,
            y: 330,
            phase: 2.7
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
            x: 270,
            y: 150,
            phase: 0.4
          },
          {
            id: "goblinWoods:goblin:2",
            type: "goblin",
            x: 405,
            y: 215,
            phase: 2.0
          },
          {
            id: "goblinWoods:goblin:3",
            type: "goblin",
            x: 500,
            y: 300,
            phase: 4.1
          }
        ],

        collision: {
          waterRects: []
        }
      }
    };

    return Object.freeze({
      version: 1,
      maps
    });
  }
);
