(function (root, factory) {
  const balance = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = balance;
  }

  if (root) {
    root.COMBAT_BALANCE = balance;
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    const VERSION = 5;

    const LEVEL_GAP_PENALTY_PER_LEVEL = 0.07;
    const MIN_LEVEL_MULTIPLIER = 0.45;

    const WEAPON_PROFILES = Object.freeze([
      Object.freeze({
        id: "weapon_sword",
        name: "Wood Sword",
        power: 8,
        damageType: "physical",
        strengthScale: 0.50,
        dexScale: 0.20,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_axe",
        name: "Axe",
        power: 10,
        damageType: "physical",
        strengthScale: 0.75,
        dexScale: 0,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_wand",
        name: "Fire Wand",
        power: 8,
        damageType: "magic",
        strengthScale: 0,
        dexScale: 0,
        intScale: 0.70
      }),

      Object.freeze({
        id: "weapon_rainWand",
        name: "Rain Wand",
        power: 7,
        damageType: "magic",
        strengthScale: 0,
        dexScale: 0,
        intScale: 0.65
      }),

      Object.freeze({
        id: "weapon_katana",
        name: "Katana",
        power: 12,
        damageType: "physical",
        strengthScale: 0.30,
        dexScale: 0.65,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_oldSword",
        name: "Sword",
        power: 10,
        damageType: "physical",
        strengthScale: 0.55,
        dexScale: 0.25,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_bow",
        name: "Wood Bow",
        power: 9,
        damageType: "physical",
        strengthScale: 0.15,
        dexScale: 0.85,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_dreamcatcher",
        name: "Dreamcatcher",
        power: 9,
        damageType: "physical",
        strengthScale: 0.15,
        dexScale: 0.85,
        intScale: 0
      }),

      Object.freeze({
        id: "weapon_shepherdStaff",
        name: "Shepherd Staff",
        power: 8,
        damageType: "magic",
        strengthScale: 0,
        dexScale: 0,
        intScale: 0.70
      })
    ]);

    const ABILITY_PROFILES = Object.freeze({
      fireball: Object.freeze({
        name: "Fireball",
        power: 12,
        damageType: "magic",
        strengthScale: 0,
        dexScale: 0,
        intScale: 0.90
      }),

      rain: Object.freeze({
        name: "Rain Cloud",
        power: 4,
        damageType: "magic",
        strengthScale: 0,
        dexScale: 0,
        intScale: 0.30
      })
    });

    const MONSTER_DEFAULTS = Object.freeze({
      slime: Object.freeze({
        level: 1,
        physicalMultiplier: 1,
        magicMultiplier: 1
      }),

      goblin: Object.freeze({
        level: 3,
        physicalMultiplier: 1,
        magicMultiplier: 1
      }),

      ghost: Object.freeze({
        level: 5,

        // Spectral body: mundane weapons barely connect.
        physicalMultiplier: 0.15,

        // Elemental / magical attacks are the intended answer.
        magicMultiplier: 1.15
      }),

      bigGoldSlime: Object.freeze({
        level: 4,
        physicalMultiplier: 1,
        magicMultiplier: 1
      })
    });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function safeStat(value) {
      return clamp(
        Math.floor(Number(value) || 0),
        0,
        999
      );
    }

    function normalizeStats(stats = {}) {
      return {
        strength: safeStat(stats.strength),
        dex: safeStat(stats.dex),
        luck: safeStat(stats.luck),
        int: safeStat(stats.int)
      };
    }

    function levelMultiplier(
      playerLevel,
      monsterLevel
    ) {
      const pLevel = Math.max(
        1,
        Math.floor(Number(playerLevel) || 1)
      );

      const mLevel = Math.max(
        1,
        Math.floor(Number(monsterLevel) || 1)
      );

      const levelsBehind =
        Math.max(0, mLevel - pLevel);

      return Math.max(
        MIN_LEVEL_MULTIPLIER,
        1 -
          levelsBehind *
          LEVEL_GAP_PENALTY_PER_LEVEL
      );
    }

    function monsterDamageMultiplier(
      monsterType,
      damageType
    ) {
      const monster =
        MONSTER_DEFAULTS[monsterType] ||
        MONSTER_DEFAULTS.slime;

      return damageType === "magic"
        ? monster.magicMultiplier
        : monster.physicalMultiplier;
    }

    function profileForAttack(
      source,
      weaponIndex
    ) {
      if (
        source === "melee" ||
        source === "bowMelee" ||
        source === "basic" ||
        source === "arrow"
      ) {
        return WEAPON_PROFILES[
          Math.floor(Number(weaponIndex))
        ] || null;
      }

      return ABILITY_PROFILES[source] || null;
    }

    function calculateDamage({
      source,
      weaponIndex = -1,
      playerLevel = 1,
      stats = {},
      monsterType = "slime",
      monsterLevel = null,
      critical = false,
      rainPower = 2,
      roll = Math.random()
    } = {}) {
      const profile =
        profileForAttack(
          source,
          weaponIndex
        );

      if (!profile) return 0;

      const cleanStats =
        normalizeStats(stats);

      let base =
        profile.power +
        cleanStats.strength *
          profile.strengthScale +
        cleanStats.dex *
          profile.dexScale +
        cleanStats.int *
          profile.intScale;

      if (source === "rain") {
        const rainEnhancementBonus =
          Math.max(
            0,
            Math.round(Number(rainPower) || 2) - 2
          );

        base += rainEnhancementBonus * 1.5;
      }

      const monster =
        MONSTER_DEFAULTS[monsterType] ||
        MONSTER_DEFAULTS.slime;

      const resolvedMonsterLevel =
        Math.max(
          1,
          Math.floor(
            Number(monsterLevel) ||
            monster.level
          )
        );

      const randomFactor =
        source === "rain"
          ? 1
          : 0.90 +
            clamp(Number(roll) || 0, 0, 1) *
            0.20;

      let damage =
        base *
        randomFactor *
        levelMultiplier(
          playerLevel,
          resolvedMonsterLevel
        ) *
        monsterDamageMultiplier(
          monsterType,
          profile.damageType
        );

      if (source === "bowMelee") {
        damage *= 0.40;
      }

      if (critical) {
        damage *= 1.75;
      }

      return Math.max(
        1,
        Math.round(damage)
      );
    }

    return Object.freeze({
      version: VERSION,
      levelGapPenaltyPerLevel:
        LEVEL_GAP_PENALTY_PER_LEVEL,
      minimumLevelMultiplier:
        MIN_LEVEL_MULTIPLIER,
      weaponProfiles:
        WEAPON_PROFILES,
      abilityProfiles:
        ABILITY_PROFILES,
      monsterDefaults:
        MONSTER_DEFAULTS,
      normalizeStats,
      levelMultiplier,
      monsterDamageMultiplier,
      profileForAttack,
      calculateDamage
    });
  }
);
