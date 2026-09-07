// Slime Story deterministic client map construction/registration.
// v383: legacy authored-map construction was retired with the visual editor.
// Runtime map state is now built only from the active coordinate-grid WORLD_CONTENT.

function buildClientMapRegistry() {
  function makeRuntimeTree(x, y, phase = 0) {
    return {
      x,
      y,
      phase,
      collision: { width: 10, height: 8 },
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
    return typeof WORLD_CONTENT !== "undefined"
      ? WORLD_CONTENT.maps?.[mapId]?.environment || null
      : null;
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
    if (Number.isInteger(definition?.canopyVariant)) tree.canopyVariant = definition.canopyVariant;
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

  const houseImage = new Image();
  houseImage.src = "assets/house_red.png";

  function runtimeHouseFromSharedDefinition(definition) {
    return {
      entityId: definition?.id || null,
      x: Number(definition?.x) || 0,
      y: Number(definition?.y) || 0,
      width: GAME_CONFIG.house.width,
      height: GAME_CONFIG.house.height,
      image: houseImage,
      collision: {
        width: Number(definition?.collision?.width) || GAME_CONFIG.house.collisionWidth,
        height: Number(definition?.collision?.height) || GAME_CONFIG.house.collisionHeight
      },
      path: {
        width: GAME_CONFIG.house.pathWidth,
        height: GAME_CONFIG.house.pathHeight
      }
    };
  }

  function buildSharedEnvironmentMapState(mapId) {
    const environment = sharedEnvironmentDefinition(mapId);
    if (!environment) throw new Error(`WORLD_CONTENT map "${mapId}" has no shared environment definition`);
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
      pond: { x: -1000, y: -1000, width: 1, height: 1 }
    };
  }

  const mapStates = {};
  for (const mapId of Object.keys(WORLD_CONTENT?.maps || {})) {
    mapStates[mapId] = buildSharedEnvironmentMapState(mapId);
  }

  // Compatibility handles for older rendering/interaction helpers that still
  // exist outside the retired map system. v420 removes the starter Marnie NPC
  // and static bench, so all legacy spawn fixtures remain harmlessly off-map.
  const offMapNpc = () => ({ x: -10000, y: -10000, interactionRadius: 0 });

  const spawnMapX = x => x;
  const spawnMapY = y => y;
  const tutorialNpc = offMapNpc();
  const hunterNpc = offMapNpc();
  const jesterNpc = offMapNpc();
  const woodCraftBench = offMapNpc();
  const classResetCrystal = offMapNpc();

  return {
    houseImage,
    spawnMapX,
    spawnMapY,
    tutorialNpc,
    hunterNpc,
    jesterNpc,
    woodCraftBench,
    classResetCrystal,
    mapStates
  };
}
