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

    const VERSION = 32;
    const MIN_DAMAGE = 1;
    const ELEMENT_TYPES = Object.freeze(["neutral", "fire", "water", "air", "earth"]);
    const LEVEL_GAP_DAMAGE_PENALTY_PER_LEVEL = 0.05;
    const PLAYER_ARMOR_RATING_PER_POINT = 3;
    const PLAYER_RESIST_RATING_PER_POINT = 3;
    const DAMAGE_VARIANCE_FLOOR = 0.15;

    const ATTACK_SPEED_TIERS = Object.freeze({
      slow: Object.freeze({ label: "Slow", cooldown: 0.83 }),
      normal: Object.freeze({ label: "Normal", cooldown: 0.75 }),
      quick: Object.freeze({ label: "Quick", cooldown: 0.65 })
    });

    // Weapon profiles are deliberately small/readable. Equipment power is the
    // only player-side input to outgoing damage.
    const WEAPON_PROFILES = Object.freeze([
      Object.freeze({
        id: "weapon_sword",
        name: "Wood Sword",
        damageType: "physical",
        attackSpeed: "normal",
        attackPower: 8,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_axe",
        name: "Axe",
        damageType: "physical",
        attackSpeed: "slow",
        attackPower: 10,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_wand",
        name: "Fire Wand",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 5,
        magicPower: 10,
      }),
      Object.freeze({
        id: "weapon_rainWand",
        name: "Rain Wand",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 4,
        magicPower: 8,
      }),
      Object.freeze({
        id: "weapon_katana",
        name: "Katana",
        damageType: "physical",
        attackSpeed: "quick",
        attackPower: 12,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_oldSword",
        name: "Sword",
        damageType: "physical",
        attackSpeed: "normal",
        attackPower: 10,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_bow",
        name: "Wood Bow",
        damageType: "physical",
        attackPower: 9,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_dreamcatcher",
        name: "Dreamcatcher",
        damageType: "physical",
        attackPower: 20,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_shepherdStaff",
        name: "Shepherd Staff",
        damageType: "magic",
        attackSpeed: "slow",
        attackPower: 5,
        magicPower: 10,
      }),
      Object.freeze({
        id: "weapon_lostKey",
        name: "Tournesol",
        damageType: "magic",
        attackSpeed: "normal",
        attackPower: 7,
        magicPower: 20,
      }),
      Object.freeze({
        id: "weapon_hugeSunflower",
        name: "Tabatha's Key",
        damageType: "magic",
        attackSpeed: "quick",
        attackPower: 8,
        magicPower: 25,
      }),
      Object.freeze({
        id: "weapon_pickaxe",
        name: "Pickaxe",
        damageType: "physical",
        attackSpeed: "slow",
        attackPower: 8,
        magicPower: 0,
      }),
      Object.freeze({
        id: "weapon_sapgemWand",
        name: "Sapgem Wand",
        damageType: "magic",
        attackSpeed: "normal",
        attackPower: 6,
        magicPower: 15,
      }),
      Object.freeze({
        id: "weapon_tigerPaw",
        name: "Tiger Paw",
        damageType: "physical",
        attackSpeed: "quick",
        attackPower: 0,
        magicPower: 0,
      })
    ]);

    const ACTION_PROFILES = Object.freeze({
      fireball: Object.freeze({
        name: "Fireball",
        damageType: "magic",
        element: "fire",
        powerPercent: 100
      }),
      fireballBurnTick: Object.freeze({
        name: "On-Fire Tick",
        damageType: "magic",
        element: "fire",
        // Burn ticks twice per second; 10% Magic Power per tick = 20%/second.
        powerPercent: 10
      }),
      rain: Object.freeze({
        name: "Rain Cloud",
        damageType: "magic",
        element: "neutral",
        powerPercent: 35
      })
    });

    // Positive defense/resist is a rating with diminishing returns. Negative
    // resist means vulnerability. These are intentionally conservative first-
    // pass values that are easy to tune without changing the formula.
    const MONSTER_DEFAULTS = Object.freeze({
      slime: Object.freeze({
        level: 1,
        physicalDefense: 0,
        magicResist: 0,
        elementalResistances: Object.freeze({})
      }),
      mushroom: Object.freeze({
        level: 1,
        physicalDefense: 0,
        magicResist: 0,
        elementalResistances: Object.freeze({})
      }),
      crab: Object.freeze({
        level: 2,
        physicalDefense: 18,
        magicResist: 0,
        elementalResistances: Object.freeze({})
      }),
      goblin: Object.freeze({
        level: 3,
        physicalDefense: 8,
        magicResist: 6,
        elementalResistances: Object.freeze({})
      }),
      ghost: Object.freeze({
        level: 5,
        physicalDefense: 450,
        magicResist: -12,
        elementalResistances: Object.freeze({})
      }),
      bigGoldSlime: Object.freeze({
        level: 4,
        physicalDefense: 20,
        magicResist: 18,
        elementalResistances: Object.freeze({})
      })
    });

    const ARMOR_VALUES = Object.freeze({
      armor: Object.freeze({
        hats: Object.freeze([1, 1, 2, 2, 2, 4, 1, 2, 3, 2, 2]),
        shirts: Object.freeze([2, 3, 3, 6, 3, 5, 3, 3]),
        pants: Object.freeze([1, 2, 2, 5, 2, 4, 2, 2]),
        charms: Object.freeze([1])
      }),
      resist: Object.freeze({
        hats: Object.freeze([0, 0, 2, 2, 1, 1, 0, 1, 1, 2, 2]),
        shirts: Object.freeze([0, 3, 2, 1, 2, 1, 3, 2]),
        pants: Object.freeze([0, 2, 1, 1, 1, 1, 2, 2]),
        charms: Object.freeze([0])
      })
    });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }


    function weaponProfile(weaponIndex) {
      const index = Math.floor(Number(weaponIndex));
      return WEAPON_PROFILES[index] || null;
    }

    function isWandWeaponIndex(weaponIndex) {
      return [2, 3, 8, 9, 10, 12].includes(Math.floor(Number(weaponIndex)));
    }

    function isBowWeaponIndex(weaponIndex) {
      return [6, 7].includes(Math.floor(Number(weaponIndex)));
    }

    function weaponAttackSpeedProfile(weaponIndex) {
      if (isBowWeaponIndex(weaponIndex)) return null;
      const weapon = weaponProfile(weaponIndex);
      if (!weapon) return null;
      const tier = String(weapon.attackSpeed || "normal");
      return ATTACK_SPEED_TIERS[tier] || ATTACK_SPEED_TIERS.normal;
    }

    function weaponAttackCooldown(weaponIndex) {
      return weaponAttackSpeedProfile(weaponIndex)?.cooldown || ATTACK_SPEED_TIERS.normal.cooldown;
    }

    function weaponAttackSpeedLabel(weaponIndex) {
      return weaponAttackSpeedProfile(weaponIndex)?.label || ATTACK_SPEED_TIERS.normal.label;
    }

    function calculateMagicPower(weaponIndex) {
      const weapon = weaponProfile(weaponIndex);
      if (!weapon || !isWandWeaponIndex(weaponIndex)) return 0;
      return Math.max(0, Number(weapon.magicPower || 0));
    }

    function calculateAttackPower(weaponIndex) {
      const weapon = weaponProfile(weaponIndex);
      if (!weapon) return 0;
      return Math.max(0, Number(weapon.attackPower || 0));
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

    function normalizeElement(element) {
      const clean = String(element || "neutral").toLowerCase();
      return ELEMENT_TYPES.includes(clean) ? clean : "neutral";
    }

    function elementForAttack(source, weaponIndex = -1) {
      const profile = profileForAttack(source, weaponIndex);
      return normalizeElement(profile?.element);
    }

    function monsterElementResistance(monsterType, element) {
      const cleanElement = normalizeElement(element);
      if (cleanElement === "neutral") return 0;
      const monster = MONSTER_DEFAULTS[monsterType] || MONSTER_DEFAULTS.slime;
      return Number(monster.elementalResistances?.[cleanElement] || 0);
    }

    function monsterElementMultiplier(monsterType, element) {
      return resistanceMultiplier(monsterElementResistance(monsterType, element));
    }

    function profileForAttack(source, weaponIndex) {
      const weapon = weaponProfile(weaponIndex);
      const action = ACTION_PROFILES[source] || null;

      if (action) {
        if (!weapon || !isWandWeaponIndex(weaponIndex)) return null;
        return { ...action, weapon };
      }

      if (
        source === "melee" ||
        source === "basic" ||
        source === "arrow"
      ) {
        if (!weapon) return null;
        return {
          ...weapon,
          damageType: "physical",
          element: "neutral"
        };
      }

      return null;
    }

    function calculateDamage({
      source,
      weaponIndex = -1,
      playerLevel = 1,
      monsterType = "slime",
      monsterLevel = null,
      critical = false,
      roll = Math.random()
    } = {}) {
      const profile = profileForAttack(source, weaponIndex);
      if (!profile) return 0;

      let base = profile.damageType === "magic"
        ? calculateMagicPower(weaponIndex) * ((Number(profile.powerPercent) || 100) / 100)
        : calculateAttackPower(weaponIndex);

      if (base <= 0) return 0;

      const monster = MONSTER_DEFAULTS[monsterType] || MONSTER_DEFAULTS.slime;
      const resolvedMonsterLevel = Math.max(
        1,
        Math.floor(Number(monsterLevel) || monster.level || 1)
      );

      let maximumDamage =
        base *
        monsterDamageMultiplier(monsterType, profile.damageType) *
        monsterElementMultiplier(monsterType, profile.element);

      if (critical) maximumDamage *= 1.75;
      maximumDamage *= levelMultiplier(playerLevel, resolvedMonsterLevel);

      const cleanRoll = clamp(Number(roll) || 0, 0, 1);
      const damageFactor = DAMAGE_VARIANCE_FLOOR + cleanRoll * (1 - DAMAGE_VARIANCE_FLOOR);

      return Math.max(MIN_DAMAGE, Math.round(maximumDamage * damageFactor));
    }

    function armorSlotValue(values, index) {
      const cleanIndex = Math.floor(Number(index));
      if (cleanIndex < 0 || cleanIndex >= values.length) return 0;
      return Number(values[cleanIndex]) || 0;
    }

    function gearValueFromSlots(values, {
      hatIndex = -1,
      shirtIndex = -1,
      pantsIndex = -1,
      charmIndex = -1
    } = {}) {
      return (
        armorSlotValue(values.hats, hatIndex) +
        armorSlotValue(values.shirts, shirtIndex) +
        armorSlotValue(values.pants, pantsIndex) +
        armorSlotValue(values.charms, charmIndex)
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
      elementTypes: ELEMENT_TYPES,
      levelGapDamagePenaltyPerLevel: LEVEL_GAP_DAMAGE_PENALTY_PER_LEVEL,
      playerArmorRatingPerPoint: PLAYER_ARMOR_RATING_PER_POINT,
      playerResistRatingPerPoint: PLAYER_RESIST_RATING_PER_POINT,
      damageVarianceFloor: DAMAGE_VARIANCE_FLOOR,
      attackSpeedTiers: ATTACK_SPEED_TIERS,
      weaponProfiles: WEAPON_PROFILES,
      actionProfiles: ACTION_PROFILES,
      monsterDefaults: MONSTER_DEFAULTS,
      armorValues: ARMOR_VALUES,
      armorDefense: ARMOR_VALUES.armor,
      armorResist: ARMOR_VALUES.resist,
      isWandWeaponIndex,
      isBowWeaponIndex,
      weaponAttackSpeedProfile,
      weaponAttackCooldown,
      weaponAttackSpeedLabel,
      calculateMagicPower,
      calculateAttackPower,
      levelsBehind,
      levelMultiplier,
      resistanceMultiplier,
      monsterResistance,
      monsterDamageMultiplier,
      normalizeElement,
      elementForAttack,
      monsterElementResistance,
      monsterElementMultiplier,
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
