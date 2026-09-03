// Slime Story deterministic client map construction/registration.
// This file defines the builder only. game.js invokes it at the same point
// where map construction previously ran, after enemy collections exist.

function buildClientMapRegistry() {
  function makeRuntimeTree(x, y, phase = 0) {
    return {
      x,
      y,
      phase,

      collision: {
        width: 10,
        height: 8
      },

      maxHp: 4,
      hp: 4,
      isStump: false,
      shakeTime: 0,

      falling: false,
      fallTime: 0,
      fallDuration: 0.42,
      fallDirection: 1,

      canopyBurnTime: 0,
      canopyBurnDuration: 2.7,
      canopyBurned: false,

      regrowAnimTime: 0,
      regrowAnimDuration: 0.34,
      regrowAt: 0,

      canopyVariant: randomTreeCanopyVariant()
    };
  }

  function makeMapGrass(x, y, phase, width = 13, flowerType = null) {
    return {
      x,
      y,
      phase,
      width,
      cut: false,
      burnt: false,
      burnTime: 0,
      burnDuration: 1.05,

      regrowAnimTime: 0,
      regrowAnimDuration: 0.22,
      regrowAt: 0,

      flowerType,
      flowerPicked: !flowerType,
      patchFlower: false
    };
  }

  function sharedEnvironmentDefinition(mapId) {
    const definition =
      typeof WORLD_CONTENT !== "undefined"
        ? WORLD_CONTENT.maps?.[mapId]
        : null;

    return definition?.environment || null;
  }

  function runtimeTreeFromSharedDefinition(definition) {
    const tree = makeRuntimeTree(
      Number(definition?.x) || 0,
      Number(definition?.y) || 0,
      Number(definition?.phase) || 0
    );

    tree.entityId = definition?.id || null;
    tree.fireImmune = Boolean(definition?.fireImmune);
    tree.nonInteractive = Boolean(definition?.nonInteractive);

    if (Number.isInteger(definition?.canopyVariant)) {
      tree.canopyVariant = definition.canopyVariant;
    }

    return tree;
  }

  function runtimeGrassFromSharedDefinition(definition) {
    const grass = makeMapGrass(
      Number(definition?.x) || 0,
      Number(definition?.y) || 0,
      Number(definition?.phase) || 0,
      Number(definition?.width) || 13,
      definition?.flowerType || null
    );
    grass.entityId = definition?.id || null;
    return grass;
  }

  function runtimeRockFromSharedDefinition(definition) {
    const rock = makeMapRock(
      Number(definition?.x) || 0,
      Number(definition?.y) || 0,
      definition?.variant || "plain"
    );
    rock.entityId = definition?.id || null;
    return rock;
  }

  function runtimeSceneryRockFromSharedDefinition(definition) {
    const rock = makeSceneryRock(
      Number(definition?.x) || 0,
      Number(definition?.y) || 0
    );
    rock.entityId = definition?.id || null;

    if (definition?.collision) {
      rock.collision = {
        width: Number(definition.collision.width) || rock.collision.width,
        height: Number(definition.collision.height) || rock.collision.height
      };
    }

    return rock;
  }

  function runtimeHarvestFlowerFromSharedDefinition(definition) {
    return {
      entityId: definition?.id || null,
      x: Number(definition?.x) || 0,
      y: Number(definition?.y) || 0,
      phase: Number(definition?.phase) || 0,
      type: definition?.type === "blue" ? "blue" : "white",
      cut: false,
      looted: false,
      burnTime: 0,
      burnDuration: 1.15,
      burnt: false
    };
  }

  function runtimeHouseFromSharedDefinition(definition) {
    const house = makeMapHouse(
      Number(definition?.x) || 0,
      Number(definition?.y) || 0,
      { image: definition?.variant === "red" ? houseRedImage : houseImage }
    );

    house.entityId = definition?.id || null;
    house.variant = definition?.variant === "red" ? "red" : "default";

    if (definition?.collision) {
      house.collision = {
        width: Number(definition.collision.width) || house.collision.width,
        height: Number(definition.collision.height) || house.collision.height
      };
    }

    return house;
  }

  function buildSharedEnvironmentMapState(mapId) {
    const environment = sharedEnvironmentDefinition(mapId);
    if (!environment) {
      throw new Error(
        `WORLD_CONTENT map "${mapId}" has no shared environment definition`
      );
    }

    return {
      trees: (environment.trees || []).map(runtimeTreeFromSharedDefinition),
      tallGrass: (environment.tallGrass || []).map(runtimeGrassFromSharedDefinition),
      rocks: (environment.rocks || []).map(runtimeRockFromSharedDefinition),
      sceneryRocks: (environment.sceneryRocks || []).map(runtimeSceneryRockFromSharedDefinition),
      harvestFlowers: (environment.harvestFlowers || []).map(runtimeHarvestFlowerFromSharedDefinition),
      slimes: [],
      ghosts: [],
      goblins: [],
      houses: (environment.houses || []).map(runtimeHouseFromSharedDefinition),
      pond: {
        x: -1000,
        y: -1000,
        width: 1,
        height: 1
      }
    };
  }

  const houseImage = new Image();
  houseImage.src = "data:image/png;base64,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";

  const houseRedImage = new Image();
  houseRedImage.src = "./assets/house_red.png";

  function makeMapHouse(x, y, options = {}) {
    return {
      x,
      y,
      width: GAME_CONFIG.house.width,
      height: GAME_CONFIG.house.height,
      image: options.image || houseImage,

      collision: {
        width: GAME_CONFIG.house.collisionWidth,
        height: GAME_CONFIG.house.collisionHeight
      },

      path: {
        width: GAME_CONFIG.house.pathWidth,
        height: GAME_CONFIG.house.pathHeight
      }
    };
  }

  // Carve four walkable routes through the meadow's forest perimeter:
  // WEST -> the safe spawn clearing
  // EAST -> Goblin Woods
  // NORTH -> Ghost Grove
  // SOUTH -> Hunter Hollow
  for (let i = trees.length - 1; i >= 0; i--) {
    const tree = trees[i];

    const insideGateY =
      tree.y >= 162 &&
      tree.y <= 238;

    const westOpening =
      tree.x <= 62 &&
      insideGateY;

    const eastOpening =
      tree.x >= world.width - 62 &&
      insideGateY;

    const northOpening =
      tree.y <= 100 &&
      tree.x >= 270 &&
      tree.x <= 370;

    const southOpening =
      tree.y >= world.height - 100 &&
      tree.x >= 270 &&
      tree.x <= 370;

    if (
      westOpening ||
      eastOpening ||
      northOpening ||
      southOpening
    ) {
      trees.splice(i, 1);
    }
  }

  // Preserve the original meadow state. Goblins intentionally do NOT live here.
  const meadowMapHouses = [];

  const meadowPondClearance = 18;
  const meadowOutsidePondClearance = object => (
    object.x < pond.x - meadowPondClearance ||
    object.x > pond.x + pond.width + meadowPondClearance ||
    object.y < pond.y - meadowPondClearance ||
    object.y > pond.y + pond.height + meadowPondClearance
  );

  const meadowMap = {
    trees: trees.slice().filter(meadowOutsidePondClearance),
    tallGrass: tallGrass.slice().filter(meadowOutsidePondClearance),
    harvestFlowers: harvestFlowers.slice().filter(meadowOutsidePondClearance),
    slimes: slimes.slice(),
    ghosts: [],
    goblins: [],
    houses: meadowMapHouses,
    pond: {
      x: pond.x,
      y: pond.y,
      width: pond.width,
      height: pond.height
    }
  };


  // -----------------------------------------------------------------------------
  // SAFE SPAWN CLEARING
  // -----------------------------------------------------------------------------
  // This is intentionally much smaller-feeling than the combat maps: a compact
  // clearing surrounded by a thick forest wall. There are no natural enemies.
  const SPAWN_MAP_OFFSET_X = 160;
  const SPAWN_MAP_OFFSET_Y = 100;
  const spawnMapX = x => x - SPAWN_MAP_OFFSET_X;
  const spawnMapY = y => y - SPAWN_MAP_OFFSET_Y;

  const spawnMapTrees = [];
  let spawnTreePhase = 0.18;

  function addSpawnTree(x, y, perimeter = false, outermost = false) {
    const tree = makeRuntimeTree(
      spawnMapX(x),
      spawnMapY(y),
      spawnTreePhase
    );

    if (perimeter) {
      configurePerimeterTree(tree, x, y, 1, outermost);
    }

    // Spawn is a purely safe/quiet presentation space now: every tree here is
    // fire-immune and non-interactive so none of them can be burned or chopped.
    tree.fireImmune = true;
    tree.nonInteractive = true;

    spawnMapTrees.push(tree);
    spawnTreePhase += 0.61;
  }

  // Compact playable clearing, roughly one screen across.
  // Two staggered rows make the forest boundary feel thick.
  for (let x = 176; x <= 464; x += 24) {
    addSpawnTree(x, 112, true, true);
    addSpawnTree(x + 12, 136, true);

    addSpawnTree(x, 288, true);
    addSpawnTree(x + 12, 312, true, true);
  }

  // Left wall, with a broad opening around y=200 leading to the prototype map.
  for (let y = 148; y <= 276; y += 24) {
    if (y < 172 || y > 228) {
      addSpawnTree(176, y, true, true);
    }

    if (y + 12 < 172 || y + 12 > 228) {
      addSpawnTree(200, y + 12, true);
    }
  }

  // Right wall, with a broad opening around y=200 leading to the slime meadow.
  for (let y = 148; y <= 276; y += 24) {
    if (y < 172 || y > 228) {
      addSpawnTree(464, y, true);
    }

    if (y + 12 < 172 || y + 12 > 228) {
      addSpawnTree(488, y + 12, true, true);
    }
  }

  // A handful of quiet vegetation clumps so the spawn doesn't feel sterile.
  const spawnMapGrass = [
    makeMapGrass(spawnMapX(248), spawnMapY(168), 0.4, 12, "white"),
    makeMapGrass(spawnMapX(278), spawnMapY(252), 1.2, 13),
    makeMapGrass(spawnMapX(330), spawnMapY(158), 2.0, 12, "yellow"),
    makeMapGrass(spawnMapX(366), spawnMapY(252), 2.8, 13, "pink"),
    makeMapGrass(spawnMapX(408), spawnMapY(176), 3.6, 12),
    makeMapGrass(spawnMapX(228), spawnMapY(230), 4.4, 12, "blue")
  ];

  const spawnMapHouses = [
    // Bottom-center anchored. Slightly left of the path so it feels like a
    // peaceful little home in the safe clearing without blocking the exit lane.
    // Nudged a little higher so a front path has room to breathe.
    makeMapHouse(spawnMapX(275), spawnMapY(184))
  ];

  // First progression/tutorial fixtures.
  // These are deterministic map fixtures, not inventory/world-state entities.
  const tutorialNpc = {
    x: spawnMapX(350),
    y: spawnMapY(180),
    interactionRadius: 24
  };

  const hunterNpc = {
    x: 311,
    y: 183,
    interactionRadius: 24
  };

  const jesterNpc = {
    x: 338,
    y: 183,
    interactionRadius: 24
  };

  const woodCraftBench = {
    x: spawnMapX(376),
    y: spawnMapY(181),
    interactionRadius: 24
  };

  // Class-reset crystal. The supplied 64×64 artwork is stored/rendered at
  // half size (32×32) so it reads as a prominent fixture without dominating
  // the compact spawn clearing.
  const classResetCrystal = {
    x: spawnMapX(430),
    y: spawnMapY(250),
    interactionRadius: 28
  };

  const spawnMap = {
    trees: spawnMapTrees,
    tallGrass: spawnMapGrass,
    harvestFlowers: [],
    slimes: [],
    ghosts: [],
    goblins: [],
    houses: spawnMapHouses,

    // No pond in the safe clearing for now.
    pond: {
      x: -1000,
      y: -1000,
      width: 1,
      height: 1
    }
  };

  // -----------------------------------------------------------------------------
  // PROTOTYPE ISLAND MAPS
  // -----------------------------------------------------------------------------
  // v282: placements now come from the canonical shared map definition. The
  // client only converts plain editor-safe data into runtime objects with HP,
  // burn timers, interpolation state, etc.
  const prototypeIslandMap =
    buildSharedEnvironmentMapState("prototypeIsland");

  const prototypeIslandWestMap =
    buildSharedEnvironmentMapState("prototypeIslandWest");

  const crabBeachMap =
    buildSharedEnvironmentMapState("crabBeach");

  const waterfallGroveMap =
    buildSharedEnvironmentMapState("waterfallGrove");

  // Move the three existing goblin objects to their own connected map so their
  // combat/HP/respawn state remains exactly the same system as before.
  const goblinMapGoblins = goblins.slice();
  goblins.length = 0;

  const goblinSpawnPositions = [
    { x: 270, y: 150 },
    { x: 405, y: 215 },
    { x: 500, y: 300 }
  ];

  for (let i = 0; i < goblinMapGoblins.length; i++) {
    const goblin = goblinMapGoblins[i];
    const spawn = goblinSpawnPositions[i % goblinSpawnPositions.length];

    goblin.x = spawn.x;
    goblin.y = spawn.y;
    goblin.homeX = spawn.x;
    goblin.homeY = spawn.y;
    goblin.wanderTargetX = spawn.x;
    goblin.wanderTargetY = spawn.y;
  }

  // Build a dense forest perimeter for Goblin Woods. Its west wall has a wide
  // opening matching the meadow's east-side exit.
  const goblinMapTrees = [];
  let goblinTreePhase = 0.35;

  function addGoblinMapTree(x, y, perimeter = false, outermost = false) {
    const tree = makeRuntimeTree(x, y, goblinTreePhase);
    if (perimeter) configurePerimeterTree(tree, x, y, 2, outermost);
    goblinMapTrees.push(tree);
    goblinTreePhase += 0.67;
  }

  // Top / bottom: two staggered rows.
  for (let x = 12; x <= world.width - 12; x += 28) {
    addGoblinMapTree(x, 28, true, true);
    addGoblinMapTree(x, world.height - 6, true, true);
  }

  for (let x = 26; x <= world.width - 12; x += 28) {
    addGoblinMapTree(x, 52, true);
    addGoblinMapTree(x, world.height - 30, true);
  }

  // Left / right sides. Leave the WEST entrance open around y=200.
  for (let y = 78; y <= world.height - 78; y += 28) {
    if (y < 160 || y > 240) {
      addGoblinMapTree(14, y, true, true);
    }

    addGoblinMapTree(world.width - 14, y, true, true);
  }

  for (let y = 92; y <= world.height - 78; y += 28) {
    if (y < 160 || y > 240) {
      addGoblinMapTree(40, y, true);
    }

    addGoblinMapTree(world.width - 40, y, true);
  }

  // A few interior forest clusters leave a broad central goblin clearing.
  [
    [120, 105], [148, 125], [116, 330], [150, 312],
    [530, 105], [555, 130], [545, 258], [575, 280],
    [220, 300], [245, 328], [355, 92], [385, 112]
  ].forEach(([x, y]) => addGoblinMapTree(x, y));

  // Some light vegetation keeps Goblin Woods from looking like an empty test map.
  const goblinMapGrass = [
    makeMapGrass(170, 145, 0.3, 13),
    makeMapGrass(190, 152, 1.0, 12),
    makeMapGrass(215, 143, 1.7, 14, "yellow"),
    makeMapGrass(310, 185, 2.4, 13),
    makeMapGrass(335, 194, 3.1, 14),
    makeMapGrass(360, 184, 3.8, 12, "pink"),
    makeMapGrass(440, 250, 4.5, 13),
    makeMapGrass(465, 260, 5.2, 14),
    makeMapGrass(490, 248, 5.9, 12, "white"),
    makeMapGrass(280, 315, 0.8, 13),
    makeMapGrass(310, 325, 1.6, 14),
    makeMapGrass(342, 314, 2.3, 12, "blue")
  ];

  const goblinWoodsMap = {
    trees: goblinMapTrees,
    tallGrass: goblinMapGrass,
    harvestFlowers: [],
    slimes: [],
    ghosts: [],
    goblins: goblinMapGoblins,
    houses: [],

    // No pond in this first Goblin Woods pass. Moving it far off-map lets the
    // existing water system stay untouched.
    pond: {
      x: -1000,
      y: -1000,
      width: 1,
      height: 1
    }
  };

  // -----------------------------------------------------------------------------
  // HUNTER HOLLOW
  // -----------------------------------------------------------------------------
  // Connected directly below Slime Meadow. This lower field is home to stronger
  // blue and purple slimes, and serves as the next step after the starter area.
  const hunterHollowHousePlacement = {
    x: 525,
    y: 112
  };

  hunterNpc.x = 485;
  hunterNpc.y = 126;
  jesterNpc.x = 513;
  jesterNpc.y = 127;

  const hunterHollowTrees = [];
  let hunterHollowTreePhase = 0.24;

  function addHunterHollowTree(x, y, perimeter = false, outermost = false) {
    const tree = makeRuntimeTree(x, y, hunterHollowTreePhase);
    if (perimeter) configurePerimeterTree(tree, x, y, 3, outermost);
    hunterHollowTrees.push(tree);
    hunterHollowTreePhase += 0.59;
  }

  for (let x = 12; x <= world.width - 12; x += 28) {
    if (x < 276 || x > 364) {
      addHunterHollowTree(x, 28, true, true);
      addHunterHollowTree(x, world.height - 6, true, true);
    }
  }

  for (let x = 26; x <= world.width - 12; x += 28) {
    if (x < 276 || x > 364) {
      addHunterHollowTree(x, 52, true);
      addHunterHollowTree(x, world.height - 30, true);
    }
  }

  for (let y = 78; y <= world.height - 78; y += 28) {
    addHunterHollowTree(14, y, true, true);
    addHunterHollowTree(world.width - 14, y, true, true);
  }

  for (let y = 92; y <= world.height - 78; y += 28) {
    addHunterHollowTree(40, y, true);
    addHunterHollowTree(world.width - 40, y, true);
  }

  [
    [120, 124], [154, 146], [184, 118],
    [246, 280], [274, 306],
    [392, 154], [422, 136],
    [430, 280], [462, 304]
  ].forEach(([x, y]) => addHunterHollowTree(x, y));

  const hunterHollowGrass = [
    makeMapGrass(158, 210, 0.4, 13),
    makeMapGrass(188, 220, 1.1, 14, "blue"),
    makeMapGrass(222, 208, 1.8, 12),
    makeMapGrass(330, 178, 2.6, 13),
    makeMapGrass(360, 188, 3.3, 14, "white"),
    makeMapGrass(420, 238, 4.0, 13, "pink"),
    makeMapGrass(468, 252, 4.7, 14, "blue"),
    makeMapGrass(512, 218, 5.4, 12),
    makeMapGrass(340, 324, 0.9, 13),
    makeMapGrass(514, 344, 1.7, 12, "white")
  ];

  const hunterHollowHouses = [
    makeMapHouse(
      hunterHollowHousePlacement.x,
      hunterHollowHousePlacement.y,
      { image: houseRedImage }
    )
  ];

  const hunterHollowMap = {
    trees: hunterHollowTrees,
    tallGrass: hunterHollowGrass,
    harvestFlowers: [],
    slimes: [],
    ghosts: [],
    goblins: [],
    houses: hunterHollowHouses,
    pond: {
      x: -1000,
      y: -1000,
      width: 1,
      height: 1
    }
  };

  // -----------------------------------------------------------------------------
  // GOLD SLIME DEN
  // -----------------------------------------------------------------------------
  // A deliberately compact single-elite hunting arena south of Hunter Hollow.
  // Unlike the older inset tree ring, this map is actually smaller: there is no
  // playable safety strip outside the perimeter. The perimeter itself is only a
  // single, loose row so the Gold Slime can visually chase through the gaps
  // instead of looking trapped behind a decorative wall.
  const GOLD_SLIME_DEN_WIDTH = 520;
  const GOLD_SLIME_DEN_HEIGHT = 330;
  const goldSlimeDenTrees = [];
  let goldSlimeDenTreePhase = 0.41;

  function addGoldSlimeDenTree(x, y, perimeter = false, outermost = false) {
    const tree = makeRuntimeTree(x, y, goldSlimeDenTreePhase);
    if (perimeter) configurePerimeterTree(tree, x, y, 4, outermost);
    goldSlimeDenTrees.push(tree);
    goldSlimeDenTreePhase += 0.57;
  }

  // Restored a denser perimeter now that enemies are allowed to phase through
  // trees. The north gate remains readable, but the map edges feel wooded again.
  for (let x = 12; x <= GOLD_SLIME_DEN_WIDTH - 12; x += 28) {
    if (x < 220 || x > 300) {
      addGoldSlimeDenTree(x, 24, true, true);
    }

    addGoldSlimeDenTree(x, GOLD_SLIME_DEN_HEIGHT - 4, true, true);
  }

  for (let x = 26; x <= GOLD_SLIME_DEN_WIDTH - 12; x += 28) {
    if (x < 234 || x > 286) {
      addGoldSlimeDenTree(x, 48, true);
    }

    addGoldSlimeDenTree(x, GOLD_SLIME_DEN_HEIGHT - 28, true);
  }

  for (let y = 70; y <= GOLD_SLIME_DEN_HEIGHT - 44; y += 28) {
    addGoldSlimeDenTree(14, y, true, true);
    addGoldSlimeDenTree(GOLD_SLIME_DEN_WIDTH - 14, y, true, true);
  }

  for (let y = 84; y <= GOLD_SLIME_DEN_HEIGHT - 58; y += 28) {
    addGoldSlimeDenTree(40, y, true);
    addGoldSlimeDenTree(GOLD_SLIME_DEN_WIDTH - 40, y, true);
  }

  // A handful of interior canopy anchors preserve deliberate Camouflage setup
  // spots without recreating a second defensive ring.
  [
    [126, 96],
    [394, 100],
    [122, 244],
    [398, 246]
  ].forEach(([x, y]) =>
    addGoldSlimeDenTree(x, y)
  );

  // Tight grass cover remains around the outer lanes while the centre is left
  // open for Strafe, Focus Fire and the slime's chase path.
  const goldSlimeDenGrass = [
    makeMapGrass(166, 108, 0.5, 14),
    makeMapGrass(190, 118, 1.2, 13, "yellow"),
    makeMapGrass(330, 120, 2.0, 14),
    makeMapGrass(354, 110, 2.7, 13, "white"),
    makeMapGrass(164, 250, 3.4, 14, "blue"),
    makeMapGrass(190, 260, 4.1, 13),
    makeMapGrass(326, 258, 4.8, 14, "pink"),
    makeMapGrass(352, 248, 5.5, 13),
    makeMapGrass(116, 156, 0.9, 13),
    makeMapGrass(136, 190, 1.6, 14, "white"),
    makeMapGrass(122, 220, 2.3, 13, "blue"),
    makeMapGrass(406, 156, 3.1, 14, "yellow"),
    makeMapGrass(386, 190, 3.8, 13),
    makeMapGrass(402, 220, 4.6, 14, "pink")
  ];

  const goldSlimeDenMap = {
    trees: goldSlimeDenTrees,
    tallGrass: goldSlimeDenGrass,
    harvestFlowers: [],
    slimes: [],
    ghosts: [],
    goblins: [],
    bigGoldSlimes: [],
    houses: [],
    pond: {
      x: -1000,
      y: -1000,
      width: 1,
      height: 1
    }
  };

  // -----------------------------------------------------------------------------
  // GHOST GROVE
  // -----------------------------------------------------------------------------
  // Connected directly above Slime Meadow. Natural ghosts now live here instead
  // of sharing the Meadow with the starter slimes.
  const ghostGroveTrees = [];
  let ghostGroveTreePhase = 0.52;

  function addGhostGroveTree(x, y, perimeter = false, outermost = false) {
    const tree = makeRuntimeTree(
      x,
      y,
      ghostGroveTreePhase
    );

    if (perimeter) configurePerimeterTree(tree, x, y, 5, outermost);
    ghostGroveTrees.push(tree);
    ghostGroveTreePhase += 0.63;
  }

  // Thick top boundary.
  for (
    let x = 12;
    x <= world.width - 12;
    x += 28
  ) {
    addGhostGroveTree(x, 28, true, true);
    addGhostGroveTree(x + 14, 52, true);
  }

  // Bottom boundary, leaving the SOUTH entrance open around x=320.
  for (
    let x = 12;
    x <= world.width - 12;
    x += 28
  ) {
    if (x < 276 || x > 364) {
      addGhostGroveTree(
        x,
        world.height - 6,
        true,
        true
      );
    }
  }

  for (
    let x = 26;
    x <= world.width - 12;
    x += 28
  ) {
    if (x < 276 || x > 364) {
      addGhostGroveTree(
        x,
        world.height - 30,
        true
      );
    }
  }

  // Closed side walls.
  for (
    let y = 78;
    y <= world.height - 78;
    y += 28
  ) {
    addGhostGroveTree(14, y, true, true);
    addGhostGroveTree(
      world.width - 14,
      y,
      true,
      true
    );
  }

  for (
    let y = 92;
    y <= world.height - 78;
    y += 28
  ) {
    addGhostGroveTree(40, y, true);
    addGhostGroveTree(
      world.width - 40,
      y,
      true
    );
  }

  // A few loose clusters create a slightly eerie broken clearing without
  // introducing a new art set yet.
  [
    [118, 126], [150, 144],
    [502, 120], [535, 145],
    [205, 255], [232, 278],
    [420, 250], [454, 274],
    [320, 105]
  ].forEach(([x, y]) =>
    addGhostGroveTree(x, y)
  );

  const ghostGroveGrass = [
    makeMapGrass(176, 188, 0.5, 13),
    makeMapGrass(205, 198, 1.3, 12, "white"),
    makeMapGrass(268, 150, 2.1, 14),
    makeMapGrass(355, 168, 2.9, 13, "blue"),
    makeMapGrass(430, 190, 3.7, 12),
    makeMapGrass(480, 220, 4.5, 14, "white"),
    makeMapGrass(305, 285, 5.3, 13),
    makeMapGrass(365, 305, 6.1, 12, "pink")
  ];

  const ghostGroveMap = {
    trees: ghostGroveTrees,
    tallGrass: ghostGroveGrass,
    harvestFlowers: [],
    slimes: [],
    ghosts: [],
    goblins: [],
    houses: [],

    pond: {
      x: -1000,
      y: -1000,
      width: 1,
      height: 1
    }
  };

  const mapStates = {
    spawn: spawnMap,
    prototypeIsland: prototypeIslandMap,
    prototypeIslandWest: prototypeIslandWestMap,
    crabBeach: crabBeachMap,
    waterfallGrove: waterfallGroveMap,
    meadow: meadowMap,
    hunterHollow: hunterHollowMap,
    goldSlimeDen: goldSlimeDenMap,
    goblinWoods: goblinWoodsMap,
    ghostGrove: ghostGroveMap
  };

  return {
    houseImage,
    spawnMapX,
    spawnMapY,
    tutorialNpc,
    hunterNpc,
    jesterNpc,
    woodCraftBench,
    classResetCrystal,
    mapStates,
  };
}
