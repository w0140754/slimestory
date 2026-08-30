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

    const VERSION = 20;
    const MIN_DAMAGE = 1;
    const LEVEL_GAP_DAMAGE_PENALTY_PER_LEVEL = 0.05;
    const PLAYER_ARMOR_RATING_PER_POINT = 3;
    const PLAYER_RESIST_RATING_PER_POINT = 3;
    const DEFAULT_MASTERY = 0.15;
    const CLASS_BASE_MASTERY = Object.freeze({
      arcana: 0.15,
      might: 0.20,
      precision: 0.25,
      guile: 0.25
    });

    const WAND_ATTACK_SPEEDS = Object.freeze({
      slow: Object.freeze({ label: "Slow", cooldown: 0.83 }),
      normal: Object.freeze({ label: "Normal", cooldown: 0.75 }),
      quick: Object.freeze({ label: "Quick", cooldown: 0.65 })
    });

    // Weapon profiles are deliberately small/readable. Physical attacks use
    // their own stat weights. Wand-type melee attacks are INT-weighted even
    // before Wand Mastery; wands also expose separate Magic Power that spells
    // and Wand Mastery consume.
    const WEAPON_PROFILES = Object.freeze([
      Object.freeze({
        id: "weapon_sword",
        name: "Wood Sword",
        damageType: "physical",
        attackPower: 8,
        magicPower: 0,
        strengthScale: 0.85,
        dexScale: 0.30,
        luckScale: 0.10,
        intScale: 0.05
      }),
      Object.freeze({
        id: "weapon_axe",
        name: "Axe",
        damageType: "physical",
        attackPower: 10,
        magicPower: 0,
        strengthScale: 1.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0
      }),
      Object.freeze({
        id: "weapon_wand",
        name: "Fire Wand",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 5,
        magicPower: 10,
        strengthScale: 0.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0.45
      }),
      Object.freeze({
        id: "weapon_rainWand",
        name: "Rain Wand",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 4,
        magicPower: 8,
        strengthScale: 0.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0.40
      }),
      Object.freeze({
        id: "weapon_katana",
        name: "Katana",
        damageType: "physical",
        attackPower: 12,
        magicPower: 0,
        strengthScale: 0.45,
        dexScale: 0.90,
        luckScale: 0.15,
        intScale: 0
      }),
      Object.freeze({
        id: "weapon_oldSword",
        name: "Sword",
        damageType: "physical",
        attackPower: 10,
        magicPower: 0,
        strengthScale: 0.90,
        dexScale: 0.35,
        luckScale: 0.10,
        intScale: 0.05
      }),
      Object.freeze({
        id: "weapon_bow",
        name: "Wood Bow",
        damageType: "physical",
        attackPower: 9,
        magicPower: 0,
        strengthScale: 0.20,
        dexScale: 1.00,
        luckScale: 0.15,
        intScale: 0
      }),
      Object.freeze({
        id: "weapon_dreamcatcher",
        name: "Dreamcatcher",
        damageType: "physical",
        attackPower: 10,
        magicPower: 0,
        strengthScale: 0.20,
        dexScale: 1.05,
        luckScale: 0.15,
        intScale: 0
      }),
      Object.freeze({
        id: "weapon_shepherdStaff",
        name: "Shepherd Staff",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 5,
        magicPower: 9,
        strengthScale: 0.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0.45
      }),
      Object.freeze({
        id: "weapon_lostKey",
        name: "Tournesol",
        damageType: "magic",
        attackSpeed: "normal",
        attackPower: 5,
        magicPower: 11,
        strengthScale: 0.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0.45
      }),
      Object.freeze({
        id: "weapon_hugeSunflower",
        name: "Tabatha's Key",
        damageType: "magic",
        attackSpeed: "quick",
        attackPower: 5,
        magicPower: 12,
        strengthScale: 0.05,
        dexScale: 0.10,
        luckScale: 0.05,
        intScale: 0.45
      }),
      Object.freeze({
        id: "weapon_pickaxe",
        name: "Pickaxe",
        damageType: "physical",
        attackPower: 8,
        magicPower: 0,
        strengthScale: 0.85,
        dexScale: 0.15,
        luckScale: 0.05,
        intScale: 0
      })
    ]);

    const ABILITY_PROFILES = Object.freeze({
      fireball: Object.freeze({
        name: "Fireball",
        damageType: "magic",
        maxLevel: 20,
        powerAnchors: Object.freeze([
          Object.freeze({ level: 1, power: 100 }),
          Object.freeze({ level: 10, power: 150 }),
          Object.freeze({ level: 20, power: 200 })
        ])
      }),
      fireballBurnTick: Object.freeze({
        name: "On-Fire Tick",
        damageType: "magic",
        maxLevel: 1,
        powerAnchors: Object.freeze([
          // Fireball Burn is 20 Power/sec at two ticks/sec. Each authoritative
          // half-second tick therefore uses the normal magic formula at 10 Power.
          Object.freeze({ level: 1, power: 10 })
        ])
      }),
      rain: Object.freeze({
        name: "Rain Cloud",
        damageType: "magic",
        maxLevel: 1,
        powerAnchors: Object.freeze([
          Object.freeze({ level: 1, power: 35 })
        ])
      }),
      wandMasteryMelee: Object.freeze({
        name: "Wand Mastery",
        damageType: "magic",
        maxLevel: 20,
        powerAnchors: Object.freeze([
          Object.freeze({ level: 1, power: 55 }),
          Object.freeze({ level: 20, power: 75 })
        ])
      })
    });

    // Positive defense/resist is a rating with diminishing returns. Negative
    // resist means vulnerability. These are intentionally conservative first-
    // pass values that are easy to tune without changing the formula.
    const MONSTER_DEFAULTS = Object.freeze({
      slime: Object.freeze({
        level: 1,
        physicalDefense: 0,
        magicResist: 0
      }),
      goblin: Object.freeze({
        level: 3,
        physicalDefense: 8,
        magicResist: 6
      }),
      ghost: Object.freeze({
        level: 5,
        physicalDefense: 450,
        magicResist: -12
      }),
      bigGoldSlime: Object.freeze({
        level: 4,
        physicalDefense: 20,
        magicResist: 18
      })
    });

    const ARMOR_VALUES = Object.freeze({
      armor: Object.freeze({
        hats: Object.freeze([1, 1, 2, 2, 2, 4, 1, 2, 3, 2]),
        shirts: Object.freeze([2, 3, 3, 6, 3, 5, 3]),
        pants: Object.freeze([1, 2, 2, 5, 2, 4, 2])
      }),
      resist: Object.freeze({
        hats: Object.freeze([0, 0, 2, 2, 1, 1, 0, 1, 1, 2]),
        shirts: Object.freeze([0, 3, 2, 1, 2, 1, 3]),
        pants: Object.freeze([0, 2, 1, 1, 1, 1, 2])
      })
    });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function safeStat(value) {
      return clamp(Math.floor(Number(value) || 0), 0, 999);
    }

    function normalizeStats(stats = {}) {
      return {
        strength: safeStat(stats.strength),
        dex: safeStat(stats.dex),
        luck: safeStat(stats.luck),
        int: safeStat(stats.int)
      };
    }

    function weaponProfile(weaponIndex) {
      const index = Math.floor(Number(weaponIndex));
      return WEAPON_PROFILES[index] || null;
    }

    function isWandWeaponIndex(weaponIndex) {
      return [2, 3, 8, 9, 10].includes(Math.floor(Number(weaponIndex)));
    }

    function wandAttackSpeedProfile(weaponIndex) {
      if (!isWandWeaponIndex(weaponIndex)) return null;
      const weapon = weaponProfile(weaponIndex);
      const tier = String(weapon?.attackSpeed || "slow");
      return WAND_ATTACK_SPEEDS[tier] || WAND_ATTACK_SPEEDS.slow;
    }

    function wandAttackCooldown(weaponIndex) {
      return wandAttackSpeedProfile(weaponIndex)?.cooldown || WAND_ATTACK_SPEEDS.slow.cooldown;
    }

    function wandAttackSpeedLabel(weaponIndex) {
      return wandAttackSpeedProfile(weaponIndex)?.label || WAND_ATTACK_SPEEDS.slow.label;
    }

    function calculateMagicPower(weaponIndex, stats = {}) {
      const weapon = weaponProfile(weaponIndex);
      if (!weapon || !isWandWeaponIndex(weaponIndex)) return 0;

      const clean = normalizeStats(stats);
      return Math.max(
        0,
        Number(weapon.magicPower || 0) +
          clean.int * 1.20 +
          clean.dex * 0.15 +
          clean.luck * 0.10 +
          clean.strength * 0.05
      );
    }

    function calculateMastery(classId, { bonus = 0 } = {}) {
      const base = Object.prototype.hasOwnProperty.call(CLASS_BASE_MASTERY, classId)
        ? CLASS_BASE_MASTERY[classId]
        : DEFAULT_MASTERY;

      return clamp(
        (Number(base) || 0) + (Number(bonus) || 0),
        0,
        1
      );
    }

    // Kept as an alias so older UI/call sites do not break while Mastery is
    // generalized across all classes.
    function calculateMagicMastery({ classId = "arcana", bonus = 0 } = {}) {
      return calculateMastery(classId, { bonus });
    }

    function calculateAttackPower(weaponIndex, stats = {}) {
      const weapon = weaponProfile(weaponIndex);
      if (!weapon) return 0;

      const clean = normalizeStats(stats);
      return Math.max(
        0,
        Number(weapon.attackPower || 0) +
          clean.strength * Number(weapon.strengthScale || 0) +
          clean.dex * Number(weapon.dexScale || 0) +
          clean.luck * Number(weapon.luckScale || 0) +
          clean.int * Number(weapon.intScale || 0)
      );
    }

    const calculatePhysicalPower = calculateAttackPower;

    function interpolatePowerAnchors(anchors, level) {
      if (!Array.isArray(anchors) || anchors.length === 0) return 100;

      const cleanLevel = Math.max(1, Math.floor(Number(level) || 1));
      const sorted = [...anchors].sort((a, b) => a.level - b.level);

      if (cleanLevel <= sorted[0].level) return sorted[0].power;
      if (cleanLevel >= sorted[sorted.length - 1].level) {
        return sorted[sorted.length - 1].power;
      }

      for (let i = 0; i < sorted.length - 1; i++) {
        const left = sorted[i];
        const right = sorted[i + 1];
        if (cleanLevel < left.level || cleanLevel > right.level) continue;

        const span = Math.max(1, right.level - left.level);
        const t = (cleanLevel - left.level) / span;
        return Math.round(left.power + (right.power - left.power) * t);
      }

      return sorted[sorted.length - 1].power;
    }

    function abilityPowerAtLevel(abilityId, level = 1) {
      const profile = ABILITY_PROFILES[abilityId];
      if (!profile) return 100;

      const cleanLevel = clamp(
        Math.floor(Number(level) || 1),
        1,
        Math.max(1, Number(profile.maxLevel) || 1)
      );

      return interpolatePowerAnchors(profile.powerAnchors, cleanLevel);
    }

    function levelsBehind(playerLevel, monsterLevel) {
      return Math.max(
        0,
        Math.floor(Number(monsterLevel) || 1) -
          Math.max(1, Math.floor(Number(playerLevel) || 1))
      );
    }

    // Players do not gain bonus damage for being above an enemy's level.
    // When fighting upward, each missing player level removes 5% of final
    // damage. The scale is intentionally uncapped; at a 20-level gap the
    // multiplier reaches zero and the global 1-damage floor is all that remains.
    function levelMultiplier(playerLevel, monsterLevel) {
      return Math.max(
        0,
        1 -
          levelsBehind(playerLevel, monsterLevel) *
            LEVEL_GAP_DAMAGE_PENALTY_PER_LEVEL
      );
    }

    function resistanceMultiplier(rating) {
      const value = Number(rating) || 0;
      if (value >= 0) {
        return 100 / (100 + value);
      }
      return 1 + Math.abs(value) / 100;
    }

    function monsterResistance(monsterType, damageType) {
      const monster = MONSTER_DEFAULTS[monsterType] || MONSTER_DEFAULTS.slime;
      return damageType === "magic"
        ? Number(monster.magicResist || 0)
        : Number(monster.physicalDefense || 0);
    }

    function monsterDamageMultiplier(monsterType, damageType) {
      return resistanceMultiplier(monsterResistance(monsterType, damageType));
    }

    function profileForAttack(source, weaponIndex) {
      const weapon = weaponProfile(weaponIndex);
      const ability = ABILITY_PROFILES[source] || null;

      if (ability) {
        if (!weapon) return null;

        // Existing Magus abilities require a wand. Future physical class
        // abilities can use the same ability-power pipeline with Attack Power.
        if (ability.damageType === "magic" && !isWandWeaponIndex(weaponIndex)) {
          return null;
        }

        return {
          ...ability,
          weapon
        };
      }

      if (
        source === "melee" ||
        source === "bowMelee" ||
        source === "basic" ||
        source === "arrow"
      ) {
        if (!weapon) return null;

        // An unmastered wand still bonks physically with its small Attack
        // Power, but wand Attack Power is already INT-weighted. Wand Mastery
        // adds its larger magical sweep/power/target scaling above.
        return {
          ...weapon,
          damageType: "physical"
        };
      }

      return null;
    }

    function calculateDamage({
      source,
      weaponIndex = -1,
      playerLevel = 1,
      stats = {},
      classId = null,
      monsterType = "slime",
      monsterLevel = null,
      critical = false,
      rainPower = 2,
      abilityLevel = 1,
      roll = Math.random()
    } = {}) {
      const profile = profileForAttack(source, weaponIndex);
      if (!profile) return 0;

      let base = 0;

      if (profile.damageType === "magic") {
        const magicPower = calculateMagicPower(weaponIndex, stats);
        if (magicPower <= 0) return 0;

        const powerPercent = abilityPowerAtLevel(
          source === "rain" ? "rain" : source,
          abilityLevel
        );

        base = magicPower * (powerPercent / 100);

        if (source === "rain") {
          const rainEnhancementBonus = Math.max(
            0,
            Math.round(Number(rainPower) || 2) - 2
          );
          base += rainEnhancementBonus * 1.5;
        }
      } else {
        base = calculateAttackPower(weaponIndex, stats);

        // Any present/future physical skill profile uses its Power value as a
        // multiplier over Attack Power, mirroring Magic Power + spell Power.
        if (ABILITY_PROFILES[source]) {
          const powerPercent = abilityPowerAtLevel(source, abilityLevel);
          base *= powerPercent / 100;
        }

        if (source === "bowMelee") {
          base *= 0.40;
        }
      }

      const monster = MONSTER_DEFAULTS[monsterType] || MONSTER_DEFAULTS.slime;
      const resolvedMonsterLevel = Math.max(
        1,
        Math.floor(Number(monsterLevel) || monster.level || 1)
      );

      // Everything up through resistance, crits, and level difference defines
      // the attack's maximum possible damage. Class Mastery then controls how
      // close the actual hit may roll to that ceiling. Mastery improves
      // reliability without increasing maximum damage.
      let maximumDamage =
        base *
        monsterDamageMultiplier(monsterType, profile.damageType);

      if (critical) {
        maximumDamage *= 1.75;
      }

      // Level disadvantage scales proportionally rather than subtracting a
      // flat amount per hit. This keeps rapid, low-damage attacks and slower,
      // heavier attacks equally affected by fighting above the player's level.
      maximumDamage *= levelMultiplier(playerLevel, resolvedMonsterLevel);

      const cleanRoll = clamp(Number(roll) || 0, 0, 1);
      const mastery = calculateMastery(classId);
      const damageFactor = mastery + cleanRoll * (1 - mastery);

      return Math.max(
        MIN_DAMAGE,
        Math.round(maximumDamage * damageFactor)
      );
    }

    function armorSlotValue(values, index) {
      const cleanIndex = Math.floor(Number(index));
      if (cleanIndex < 0 || cleanIndex >= values.length) return 0;
      return Number(values[cleanIndex]) || 0;
    }

    function gearValueFromSlots(values, {
      hatIndex = -1,
      shirtIndex = -1,
      pantsIndex = -1
    } = {}) {
      return (
        armorSlotValue(values.hats, hatIndex) +
        armorSlotValue(values.shirts, shirtIndex) +
        armorSlotValue(values.pants, pantsIndex)
      );
    }

    function playerArmorFromGear(gear = {}) {
      return gearValueFromSlots(ARMOR_VALUES.armor, gear);
    }

    function playerResistFromGear(gear = {}) {
      return gearValueFromSlots(ARMOR_VALUES.resist, gear);
    }

    function playerArmorMultiplier(armor) {
      const cleanArmor = Math.max(0, Number(armor) || 0);
      return 100 / (100 + cleanArmor * PLAYER_ARMOR_RATING_PER_POINT);
    }

    function playerResistMultiplier(resist) {
      const cleanResist = Math.max(0, Number(resist) || 0);
      return 100 / (100 + cleanResist * PLAYER_RESIST_RATING_PER_POINT);
    }

    function mitigatePlayerDamage(
      amount,
      defenses = {},
      damageType = "physical"
    ) {
      const cleanAmount = Math.max(0, Number(amount) || 0);
      if (cleanAmount <= 0) return 0;

      const armor = Math.max(0, Number(defenses.armor) || 0);
      const resist = Math.max(0, Number(defenses.resist) || 0);

      const multiplier = damageType === "magic"
        ? playerResistMultiplier(resist)
        : damageType === "physical"
          ? playerArmorMultiplier(armor)
          : 1;

      return Math.max(1, Math.round(cleanAmount * multiplier));
    }

    return Object.freeze({
      version: VERSION,
      minimumDamage: MIN_DAMAGE,
      levelGapDamagePenaltyPerLevel: LEVEL_GAP_DAMAGE_PENALTY_PER_LEVEL,
      playerArmorRatingPerPoint: PLAYER_ARMOR_RATING_PER_POINT,
      playerResistRatingPerPoint: PLAYER_RESIST_RATING_PER_POINT,
      baseMagicMastery: DEFAULT_MASTERY,
      defaultMastery: DEFAULT_MASTERY,
      classBaseMastery: CLASS_BASE_MASTERY,
      wandAttackSpeeds: WAND_ATTACK_SPEEDS,
      weaponProfiles: WEAPON_PROFILES,
      abilityProfiles: ABILITY_PROFILES,
      monsterDefaults: MONSTER_DEFAULTS,
      armorValues: ARMOR_VALUES,
      armorDefense: ARMOR_VALUES.armor,
      armorResist: ARMOR_VALUES.resist,
      normalizeStats,
      isWandWeaponIndex,
      wandAttackSpeedProfile,
      wandAttackCooldown,
      wandAttackSpeedLabel,
      calculateMagicPower,
      calculateMastery,
      calculateMagicMastery,
      calculateAttackPower,
      calculatePhysicalPower,
      abilityPowerAtLevel,
      levelsBehind,
      levelMultiplier,
      resistanceMultiplier,
      monsterResistance,
      monsterDamageMultiplier,
      profileForAttack,
      calculateDamage,
      playerArmorFromGear,
      playerResistFromGear,
      playerArmorMultiplier,
      playerResistMultiplier,
      mitigatePlayerDamage
    });
  }
);
