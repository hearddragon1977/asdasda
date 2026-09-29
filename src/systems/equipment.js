/**
 * Modular Equipment & Weapon Attachment System
 *
 * Manages tactical gear (vest / helmet / backpack) and weapon rail attachments
 * (optic / flashlight / muzzle) for the player and AI units. Integrates with:
 *   - Anatomical trauma (src/game/anatomySimulation.ts) via hitbox coverage
 *   - WeaponState (src/types/game.ts) via attachment modifiers
 *   - Movement speed via backpack / vest encumbrance
 *
 * Inventory API: equip, swap, drop — shared by player and AI combatants.
 */

import {
  ATTACHMENT_SLOTS,
  ARMOR_TIER_THRESHOLDS,
  DEFAULT_OPFOR_GEAR_IDS,
  DEFAULT_PLAYER_GEAR_IDS,
  EQUIPMENT_SLOTS,
  GEAR_BY_ID,
  HELMET_ZONE_MAP,
  getGearById,
  resolveSlotForGear,
} from '../data/gear.js';

/**
 * @typedef {import('../data/gear.js').GearDefinition} GearDefinition
 * @typedef {import('../data/gear.js').GearAnatomicalZone} GearAnatomicalZone
 * @typedef {import('../data/gear.js').GearCategory} GearCategory
 */

/**
 * @typedef {Object} EquipmentSlots
 * @property {string | null} vest
 * @property {string | null} helmet
 * @property {string | null} backpack
 */

/**
 * @typedef {Object} AttachmentSlots
 * @property {string | null} optic
 * @property {string | null} flashlight
 * @property {string | null} muzzle
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id              Gear definition id
 * @property {number} [qty]
 */

/**
 * @typedef {Object} ArmorHitResult
 * @property {boolean} covered        Zone is under equipped armor / helmet
 * @property {boolean} stopped        Round defeated by armor (no penetrating trauma)
 * @property {boolean} bluntTrauma    Non-penetrating hit still applies reduced trauma
 * @property {number} bleedMultiplier Multiplier for residual bleed if blunt / partial
 * @property {string | null} blockedBy Gear id that interacted with the round
 * @property {string} message
 */

/**
 * @typedef {Object} AttachmentEffects
 * @property {number} adsZoom
 * @property {string} reticle
 * @property {number} adsTransitionSec
 * @property {number} swayReduction
 * @property {boolean} hasFlashlight
 * @property {number} lightIntensity
 * @property {number} lightRangeM
 * @property {number} lightConeAngleDeg
 * @property {number} lightColor
 * @property {boolean} lightStrobeCapable
 * @property {number} soundSignature
 * @property {number} muzzleFlashScale
 * @property {number} hearingRangeMul
 * @property {number} velocityLossMps
 * @property {boolean} isSuppressed
 * @property {string | null} opticId
 * @property {string | null} flashlightId
 * @property {string | null} muzzleId
 */

/**
 * @typedef {Object} LoadoutSnapshot
 * @property {string} unitId
 * @property {EquipmentSlots} equipment
 * @property {AttachmentSlots} attachments
 * @property {InventoryItem[]} inventory
 * @property {number} carriedWeightKg
 * @property {number} capacityKg
 * @property {number} encumbrancePenalty
 * @property {number} moveSpeedMultiplier
 * @property {AttachmentEffects} attachmentEffects
 */

/** Player singleton unit id used across App / TacticalViewport. */
export const PLAYER_UNIT_ID = 'player';

/**
 * @returns {EquipmentSlots}
 */
export function emptyEquipmentSlots() {
  return { vest: null, helmet: null, backpack: null };
}

/**
 * @returns {AttachmentSlots}
 */
export function emptyAttachmentSlots() {
  return { optic: null, flashlight: null, muzzle: null };
}

/**
 * Baseline attachment effects when no devices are mounted.
 * @returns {AttachmentEffects}
 */
export function defaultAttachmentEffects() {
  return {
    adsZoom: 1.05,
    reticle: 'iron',
    adsTransitionSec: 0.15,
    swayReduction: 0,
    hasFlashlight: false,
    lightIntensity: 0,
    lightRangeM: 0,
    lightConeAngleDeg: 20,
    lightColor: 0xfff2cc,
    lightStrobeCapable: false,
    soundSignature: 1,
    muzzleFlashScale: 1,
    hearingRangeMul: 1,
    velocityLossMps: 0,
    isSuppressed: false,
    opticId: null,
    flashlightId: null,
    muzzleId: null,
  };
}

/**
 * Merge default kit ids into concrete slot maps (nulls allowed).
 * @param {Partial<EquipmentSlots & AttachmentSlots> | null | undefined} ids
 * @returns {{ equipment: EquipmentSlots, attachments: AttachmentSlots }}
 */
export function resolveDefaultKit(ids) {
  const src = ids || {};
  return {
    equipment: {
      vest: src.vest ?? null,
      helmet: src.helmet ?? null,
      backpack: src.backpack ?? null,
    },
    attachments: {
      optic: src.optic ?? null,
      flashlight: src.flashlight ?? null,
      muzzle: src.muzzle ?? null,
    },
  };
}

/**
 * Per-unit equipment + attachment inventory.
 */
export class UnitEquipment {
  /**
   * @param {string} unitId
   * @param {{
   *   faction?: 'US' | 'Coalition' | 'OPFOR' | 'Universal',
   *   defaultKit?: Partial<EquipmentSlots & AttachmentSlots> | null,
   * }} [options]
   */
  constructor(unitId, options = {}) {
    this.unitId = unitId;
    this.faction = options.faction || 'US';

    /** @type {EquipmentSlots} */
    this.equipment = emptyEquipmentSlots();
    /** @type {AttachmentSlots} */
    this.attachments = emptyAttachmentSlots();
    /** @type {InventoryItem[]} */
    this.inventory = [];

    const kit = resolveDefaultKit(
      options.defaultKit !== undefined
        ? options.defaultKit
        : this.faction === 'OPFOR'
          ? DEFAULT_OPFOR_GEAR_IDS
          : DEFAULT_PLAYER_GEAR_IDS
    );

    for (const slot of EQUIPMENT_SLOTS) {
      const id = kit.equipment[slot];
      if (id && GEAR_BY_ID[id]) this.equipment[slot] = id;
    }
    for (const slot of ATTACHMENT_SLOTS) {
      const id = kit.attachments[slot];
      if (id && GEAR_BY_ID[id]) this.attachments[slot] = id;
    }
  }

  /**
   * Look up a definition currently seated in any slot.
   * @param {string} slot
   * @returns {GearDefinition | null}
   */
  getEquippedDef(slot) {
    if (EQUIPMENT_SLOTS.includes(/** @type {any} */ (slot))) {
      const id = this.equipment[/** @type {keyof EquipmentSlots} */ (slot)];
      return id ? getGearById(id) || null : null;
    }
    if (ATTACHMENT_SLOTS.includes(/** @type {any} */ (slot))) {
      const id = this.attachments[/** @type {keyof AttachmentSlots} */ (slot)];
      return id ? getGearById(id) || null : null;
    }
    return null;
  }

  /**
   * Total mass of worn gear + attachments + inventory contents.
   * @returns {number}
   */
  getCarriedWeightKg() {
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const def = this.getEquippedDef(slot);
      if (def) total += def.weightKg;
    }
    for (const slot of ATTACHMENT_SLOTS) {
      const def = this.getEquippedDef(slot);
      if (def) total += def.weightKg;
    }
    for (const item of this.inventory) {
      const def = getGearById(item.id);
      if (def) total += def.weightKg * (item.qty || 1);
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * Backpack capacity in kilograms (0 if no pack).
   * @returns {number}
   */
  getCapacityKg() {
    const pack = this.getEquippedDef('backpack');
    return pack?.backpack?.capacityKg ?? 0;
  }

  /**
   * Discrete inventory slot capacity.
   * @returns {number}
   */
  getCapacitySlots() {
    const pack = this.getEquippedDef('backpack');
    return pack?.backpack?.capacitySlots ?? 0;
  }

  /**
   * Combined encumbrance from vest weight class + backpack penalty.
   * @returns {number} 0–1 penalty fraction
   */
  getEncumbrancePenalty() {
    let penalty = 0;
    const vest = this.getEquippedDef('vest');
    if (vest?.vest) {
      // Heavy plate carriers add a small fixed drag beyond backpack.
      if (vest.vest.armorTier >= 4) penalty += 0.06;
      else if (vest.vest.armorTier >= 3) penalty += 0.035;
      else if (vest.weightKg >= 8) penalty += 0.025;
    }
    const pack = this.getEquippedDef('backpack');
    if (pack?.backpack) penalty += pack.backpack.encumbrancePenalty;

    // Overload inventory beyond pack rating.
    const capacity = this.getCapacityKg();
    const carried = this.getCarriedWeightKg();
    if (capacity > 0 && carried > capacity) {
      penalty += Math.min(0.25, ((carried - capacity) / capacity) * 0.2);
    }

    return Math.min(0.55, penalty);
  }

  /**
   * Multiplier applied to base move speed (1 = full speed).
   * @returns {number}
   */
  getMoveSpeedMultiplier() {
    return Math.max(0.45, 1 - this.getEncumbrancePenalty());
  }

  /**
   * Aggregate optic / light / muzzle modifiers for WeaponState consumers.
   * @returns {AttachmentEffects}
   */
  getAttachmentEffects() {
    const effects = defaultAttachmentEffects();
    const optic = this.getEquippedDef('optic');
    if (optic?.optic) {
      effects.opticId = optic.id;
      effects.adsZoom = optic.optic.adsZoom;
      effects.reticle = optic.optic.reticle;
      effects.adsTransitionSec = optic.optic.adsTransitionSec;
      effects.swayReduction = optic.optic.swayReduction;
    }

    const light = this.getEquippedDef('flashlight');
    if (light?.flashlight) {
      effects.flashlightId = light.id;
      effects.hasFlashlight = true;
      effects.lightIntensity = light.flashlight.intensity;
      effects.lightRangeM = light.flashlight.rangeM;
      effects.lightConeAngleDeg = light.flashlight.coneAngleDeg;
      effects.lightColor = light.flashlight.color;
      effects.lightStrobeCapable = light.flashlight.strobeCapable;
    }

    const muzzle = this.getEquippedDef('muzzle');
    if (muzzle?.muzzle) {
      effects.muzzleId = muzzle.id;
      effects.soundSignature = muzzle.muzzle.soundSignature;
      effects.muzzleFlashScale = muzzle.muzzle.muzzleFlashScale;
      effects.hearingRangeMul = muzzle.muzzle.hearingRangeMul;
      effects.velocityLossMps = muzzle.muzzle.velocityLossMps;
      effects.isSuppressed = muzzle.muzzle.isSuppressor;
    }

    return effects;
  }

  /**
   * Patch fields onto an existing WeaponState-compatible object.
   * Preserves magazine / reload fields; syncs attachment-driven flags.
   * @param {Record<string, any>} weaponState
   * @param {{ lightEnabled?: boolean, aimingDownSights?: boolean }} [opts]
   * @returns {Record<string, any>}
   */
  applyToWeaponState(weaponState, opts = {}) {
    const fx = this.getAttachmentEffects();
    const lightEnabled =
      opts.lightEnabled !== undefined
        ? opts.lightEnabled
        : Boolean(weaponState.tacticalLight);
    return {
      ...weaponState,
      attachments: {
        opticId: fx.opticId,
        flashlightId: fx.flashlightId,
        muzzleId: fx.muzzleId,
      },
      aimingDownSights:
        opts.aimingDownSights !== undefined
          ? opts.aimingDownSights
          : Boolean(weaponState.aimingDownSights),
      tacticalLight: fx.hasFlashlight ? lightEnabled : false,
      adsZoom: fx.adsZoom,
      reticle: fx.reticle,
      soundSignature: fx.soundSignature,
      muzzleFlashScale: fx.muzzleFlashScale,
      hearingRangeMul: fx.hearingRangeMul,
      isSuppressed: fx.isSuppressed,
    };
  }

  /**
   * Resolve ballistic interaction against equipped vest / helmet for a zone.
   * Call BEFORE anatomySimulation.inflictTrauma — if stopped, skip wounding
   * (or apply blunt trauma with bleedMultiplier).
   *
   * @param {GearAnatomicalZone | string} zone
   * @param {number} [armorPenetration=0.55]  From weapon damage.armorPenetration (0–1)
   * @param {() => number} [rng=Math.random]
   * @returns {ArmorHitResult}
   */
  resolveArmorHit(zone, armorPenetration = 0.55, rng = Math.random) {
    const vest = this.getEquippedDef('vest');
    if (vest?.vest) {
      const covers =
        vest.vest.coveredZones.includes(/** @type {GearAnatomicalZone} */ (zone)) ||
        (zone === 'junctional_axilla' && vest.vest.coversJunctionalAxilla);

      if (covers && vest.vest.armorTier > 0) {
        const tierFloor = ARMOR_TIER_THRESHOLDS[vest.vest.armorTier] ?? 0.55;
        const overmatch = armorPenetration - tierFloor;
        // Round must exceed plate rating; residual chance uses protectionFactor.
        if (overmatch < 0) {
          const stopRoll = rng();
          if (stopRoll <= vest.vest.protectionFactor) {
            return {
              covered: true,
              stopped: true,
              bluntTrauma: vest.vest.bluntTraumaBleedMul > 0,
              bleedMultiplier: vest.vest.bluntTraumaBleedMul,
              blockedBy: vest.id,
              message: `PLATE STOP (${vest.shortName}) — ${zone}`,
            };
          }
        } else {
          // Partial defeat chance shrinks as penetration overmatches tier.
          const remnant = Math.max(
            0,
            vest.vest.protectionFactor - overmatch * 1.4
          );
          if (rng() <= remnant) {
            return {
              covered: true,
              stopped: true,
              bluntTrauma: true,
              bleedMultiplier: Math.min(1, vest.vest.bluntTraumaBleedMul * 2),
              blockedBy: vest.id,
              message: `PLATE DEFLECT (${vest.shortName}) — ${zone}`,
            };
          }
          return {
            covered: true,
            stopped: false,
            bluntTrauma: false,
            bleedMultiplier: 1,
            blockedBy: vest.id,
            message: `PLATE PENETRATED (${vest.shortName}) — ${zone}`,
          };
        }

        return {
          covered: true,
          stopped: false,
          bluntTrauma: false,
          bleedMultiplier: 1,
          blockedBy: vest.id,
          message: `ARMOR OVERMATCH (${vest.shortName}) — ${zone}`,
        };
      }
    }

    const helmet = this.getEquippedDef('helmet');
    if (helmet?.helmet) {
      const key = HELMET_ZONE_MAP[/** @type {keyof typeof HELMET_ZONE_MAP} */ (zone)];
      if (key) {
        const protection = /** @type {number} */ (helmet.helmet[key] || 0);
        const tierFloor = ARMOR_TIER_THRESHOLDS[helmet.helmet.armorTier] ?? 0.25;
        const adjusted = protection * (armorPenetration < tierFloor + 0.15 ? 1 : 0.55);
        if (adjusted > 0 && rng() <= adjusted) {
          return {
            covered: true,
            stopped: true,
            bluntTrauma: zone === 'head_brain',
            bleedMultiplier: zone === 'head_brain' ? 0.05 : 0.15,
            blockedBy: helmet.id,
            message: `HELMET STOP (${helmet.shortName}) — ${zone}`,
          };
        }
        return {
          covered: true,
          stopped: false,
          bluntTrauma: false,
          bleedMultiplier: 1,
          blockedBy: helmet.id,
          message: `HELMET DEFEATED (${helmet.shortName}) — ${zone}`,
        };
      }
    }

    return {
      covered: false,
      stopped: false,
      bluntTrauma: false,
      bleedMultiplier: 1,
      blockedBy: null,
      message: `UNARMORED HIT — ${zone}`,
    };
  }

  /**
   * Add a loose item to backpack inventory (not worn).
   * @param {string} itemId
   * @param {number} [qty=1]
   * @returns {{ ok: boolean, reason?: string }}
   */
  stow(itemId, qty = 1) {
    const def = getGearById(itemId);
    if (!def) return { ok: false, reason: 'unknown_item' };
    if (this.inventory.length >= this.getCapacitySlots() && this.getCapacitySlots() > 0) {
      // Allow stow into inventory even without pack slots if pack missing — soft fail.
      if (this.getCapacitySlots() === 0) {
        return { ok: false, reason: 'no_backpack' };
      }
      return { ok: false, reason: 'inventory_full' };
    }
    if (this.getCapacitySlots() === 0) {
      return { ok: false, reason: 'no_backpack' };
    }
    const existing = this.inventory.find((i) => i.id === itemId);
    if (existing) existing.qty = (existing.qty || 1) + qty;
    else this.inventory.push({ id: itemId, qty });
    return { ok: true };
  }

  /**
   * Equip an item into its natural slot. Previously equipped item is swapped
   * into inventory (or returned as dropped if inventory cannot hold it).
   * @param {string} itemId
   * @returns {{
   *   ok: boolean,
   *   slot?: string,
   *   previousId?: string | null,
   *   dropped?: string | null,
   *   reason?: string
   * }}
   */
  equip(itemId) {
    const def = getGearById(itemId);
    if (!def || !def.equippable) return { ok: false, reason: 'not_equippable' };
    const slot = resolveSlotForGear(itemId);
    if (!slot) return { ok: false, reason: 'unknown_slot' };

    const isAttachment = ATTACHMENT_SLOTS.includes(/** @type {any} */ (slot));
    /** @type {string | null} */
    const previousId = isAttachment
      ? this.attachments[/** @type {keyof AttachmentSlots} */ (slot)]
      : this.equipment[/** @type {keyof EquipmentSlots} */ (slot)];

    // Remove from inventory if present
    this._takeFromInventory(itemId);

    if (isAttachment) {
      this.attachments[/** @type {keyof AttachmentSlots} */ (slot)] = itemId;
    } else {
      this.equipment[/** @type {keyof EquipmentSlots} */ (slot)] = itemId;
    }

    /** @type {string | null} */
    let dropped = null;
    if (previousId && previousId !== itemId) {
      const stowed = this.stow(previousId);
      if (!stowed.ok) dropped = previousId;
    }

    return { ok: true, slot, previousId, dropped };
  }

  /**
   * Swap currently equipped slot item with another item id (from inventory or fresh).
   * @param {string} slot
   * @param {string} itemId
   */
  swap(slot, itemId) {
    const def = getGearById(itemId);
    if (!def) return { ok: false, reason: 'unknown_item' };
    const natural = resolveSlotForGear(itemId);
    if (natural !== slot) return { ok: false, reason: 'slot_mismatch' };
    return this.equip(itemId);
  }

  /**
   * Unequip a slot and either stow into inventory or drop into the world.
   * @param {string} slot
   * @param {{ preferDrop?: boolean }} [opts]
   * @returns {{ ok: boolean, itemId?: string | null, dropped?: boolean, reason?: string }}
   */
  unequip(slot, opts = {}) {
    const isAttachment = ATTACHMENT_SLOTS.includes(/** @type {any} */ (slot));
    const isEquipment = EQUIPMENT_SLOTS.includes(/** @type {any} */ (slot));
    if (!isAttachment && !isEquipment) return { ok: false, reason: 'invalid_slot' };

    /** @type {string | null} */
    const itemId = isAttachment
      ? this.attachments[/** @type {keyof AttachmentSlots} */ (slot)]
      : this.equipment[/** @type {keyof EquipmentSlots} */ (slot)];

    if (!itemId) return { ok: false, reason: 'empty_slot', itemId: null };

    if (isAttachment) {
      this.attachments[/** @type {keyof AttachmentSlots} */ (slot)] = null;
    } else {
      this.equipment[/** @type {keyof EquipmentSlots} */ (slot)] = null;
    }

    if (opts.preferDrop) {
      return { ok: true, itemId, dropped: true };
    }

    const stowed = this.stow(itemId);
    if (!stowed.ok) {
      return { ok: true, itemId, dropped: true };
    }
    return { ok: true, itemId, dropped: false };
  }

  /**
   * Explicit drop — unequip (or pull from inventory) and return the item id
   * for world-spawn / pickup systems.
   * @param {string} slotOrItemId  Slot name OR inventory item id
   * @returns {{ ok: boolean, itemId?: string | null, reason?: string }}
   */
  drop(slotOrItemId) {
    if (
      EQUIPMENT_SLOTS.includes(/** @type {any} */ (slotOrItemId)) ||
      ATTACHMENT_SLOTS.includes(/** @type {any} */ (slotOrItemId))
    ) {
      return this.unequip(slotOrItemId, { preferDrop: true });
    }

    const taken = this._takeFromInventory(slotOrItemId);
    if (!taken) return { ok: false, reason: 'not_in_inventory', itemId: null };
    return { ok: true, itemId: slotOrItemId };
  }

  /**
   * @param {string} itemId
   * @returns {boolean}
   */
  _takeFromInventory(itemId) {
    const idx = this.inventory.findIndex((i) => i.id === itemId);
    if (idx < 0) return false;
    const item = this.inventory[idx];
    if ((item.qty || 1) > 1) {
      item.qty = (item.qty || 1) - 1;
    } else {
      this.inventory.splice(idx, 1);
    }
    return true;
  }

  /**
   * Serializable loadout for React state / AI sync.
   * @returns {LoadoutSnapshot}
   */
  snapshot() {
    return {
      unitId: this.unitId,
      equipment: { ...this.equipment },
      attachments: { ...this.attachments },
      inventory: this.inventory.map((i) => ({ ...i })),
      carriedWeightKg: this.getCarriedWeightKg(),
      capacityKg: this.getCapacityKg(),
      encumbrancePenalty: this.getEncumbrancePenalty(),
      moveSpeedMultiplier: this.getMoveSpeedMultiplier(),
      attachmentEffects: this.getAttachmentEffects(),
    };
  }

  /**
   * Restore from a snapshot (network / save).
   * @param {Partial<LoadoutSnapshot>} snap
   */
  applySnapshot(snap) {
    if (snap.equipment) {
      this.equipment = {
        vest: snap.equipment.vest ?? null,
        helmet: snap.equipment.helmet ?? null,
        backpack: snap.equipment.backpack ?? null,
      };
    }
    if (snap.attachments) {
      this.attachments = {
        optic: snap.attachments.optic ?? null,
        flashlight: snap.attachments.flashlight ?? null,
        muzzle: snap.attachments.muzzle ?? null,
      };
    }
    if (Array.isArray(snap.inventory)) {
      this.inventory = snap.inventory.map((i) => ({ ...i }));
    }
  }

  /**
   * Restore default faction kit and clear loose inventory.
   * @param {Partial<EquipmentSlots & AttachmentSlots> | null} [kit]
   */
  resetKit(kit) {
    this.inventory = [];
    this.equipment = emptyEquipmentSlots();
    this.attachments = emptyAttachmentSlots();
    const resolved = resolveDefaultKit(
      kit !== undefined
        ? kit
        : this.faction === 'OPFOR'
          ? DEFAULT_OPFOR_GEAR_IDS
          : DEFAULT_PLAYER_GEAR_IDS
    );
    for (const slot of EQUIPMENT_SLOTS) {
      const id = resolved.equipment[slot];
      if (id && GEAR_BY_ID[id]) this.equipment[slot] = id;
    }
    for (const slot of ATTACHMENT_SLOTS) {
      const id = resolved.attachments[slot];
      if (id && GEAR_BY_ID[id]) this.attachments[slot] = id;
    }
  }

  /** Strip all gear into inventory drops list. */
  stripAll() {
    /** @type {string[]} */
    const dropped = [];
    for (const slot of [...EQUIPMENT_SLOTS, ...ATTACHMENT_SLOTS]) {
      const res = this.unequip(slot, { preferDrop: true });
      if (res.ok && res.itemId) dropped.push(res.itemId);
    }
    for (const item of [...this.inventory]) {
      dropped.push(item.id);
    }
    this.inventory = [];
    return dropped;
  }
}

/**
 * Registry of UnitEquipment for the player and every AI combatant.
 */
export class EquipmentManager {
  constructor() {
    /** @type {Map<string, UnitEquipment>} */
    this.units = new Map();
    this.units.set(
      PLAYER_UNIT_ID,
      new UnitEquipment(PLAYER_UNIT_ID, {
        faction: 'US',
        defaultKit: DEFAULT_PLAYER_GEAR_IDS,
      })
    );
  }

  /**
   * @param {string} unitId
   * @param {{
   *   faction?: 'US' | 'Coalition' | 'OPFOR' | 'Universal',
   *   defaultKit?: Partial<EquipmentSlots & AttachmentSlots> | null,
   *   reset?: boolean
   * }} [options]
   * @returns {UnitEquipment}
   */
  getOrCreate(unitId, options = {}) {
    if (!options.reset && this.units.has(unitId)) {
      return /** @type {UnitEquipment} */ (this.units.get(unitId));
    }
    const unit = new UnitEquipment(unitId, options);
    this.units.set(unitId, unit);
    return unit;
  }

  /**
   * @param {string} unitId
   * @returns {UnitEquipment | undefined}
   */
  get(unitId) {
    return this.units.get(unitId);
  }

  /** @returns {UnitEquipment} */
  getPlayer() {
    return this.getOrCreate(PLAYER_UNIT_ID, {
      faction: 'US',
      defaultKit: DEFAULT_PLAYER_GEAR_IDS,
    });
  }

  /** Reset player gear in-place (keeps the playerEquipment singleton valid). */
  resetPlayer() {
    const player = this.getPlayer();
    player.faction = 'US';
    player.resetKit(DEFAULT_PLAYER_GEAR_IDS);
    return player;
  }

  /**
   * Register a Bluefor AI combatant with standard rifleman kit.
   * @param {string} unitId
   * @param {Partial<EquipmentSlots & AttachmentSlots>} [kitOverrides]
   */
  registerFriendly(unitId, kitOverrides) {
    return this.getOrCreate(unitId, {
      faction: 'US',
      defaultKit: { ...DEFAULT_PLAYER_GEAR_IDS, ...(kitOverrides || {}) },
      reset: true,
    });
  }

  /**
   * Register an OPFOR combatant with faction-default kit.
   * @param {string} unitId
   * @param {Partial<EquipmentSlots & AttachmentSlots>} [kitOverrides]
   */
  registerEnemy(unitId, kitOverrides) {
    return this.getOrCreate(unitId, {
      faction: 'OPFOR',
      defaultKit: { ...DEFAULT_OPFOR_GEAR_IDS, ...(kitOverrides || {}) },
      reset: true,
    });
  }

  /**
   * @param {string} unitId
   * @param {string} itemId
   */
  equip(unitId, itemId) {
    return this.getOrCreate(unitId).equip(itemId);
  }

  /**
   * @param {string} unitId
   * @param {string} slot
   * @param {string} itemId
   */
  swap(unitId, slot, itemId) {
    return this.getOrCreate(unitId).swap(slot, itemId);
  }

  /**
   * @param {string} unitId
   * @param {string} slotOrItemId
   */
  drop(unitId, slotOrItemId) {
    return this.getOrCreate(unitId).drop(slotOrItemId);
  }

  /**
   * @param {string} unitId
   * @param {GearAnatomicalZone | string} zone
   * @param {number} [armorPenetration]
   */
  resolveArmorHit(unitId, zone, armorPenetration) {
    return this.getOrCreate(unitId).resolveArmorHit(zone, armorPenetration);
  }

  /**
   * Ensure every combatant in a list has an equipment record.
   * @param {{ id: string }[]} friendlies
   * @param {{ id: string }[]} enemies
   */
  syncCombatants(friendlies = [], enemies = []) {
    for (const f of friendlies) {
      if (!this.units.has(f.id)) this.registerFriendly(f.id);
    }
    for (const e of enemies) {
      if (!this.units.has(e.id)) this.registerEnemy(e.id);
    }
  }

  /**
   * Remove gear records for units that no longer exist (KIA cleanup).
   * @param {Set<string> | string[]} livingIds
   */
  pruneMissing(livingIds) {
    const live = livingIds instanceof Set ? livingIds : new Set(livingIds);
    live.add(PLAYER_UNIT_ID);
    for (const id of [...this.units.keys()]) {
      if (!live.has(id)) this.units.delete(id);
    }
  }
}

/** Shared singleton used by App / viewport / AI. */
export const equipmentManager = new EquipmentManager();

/** Convenience alias for the player unit equipment. */
export const playerEquipment = equipmentManager.getPlayer();

export default equipmentManager;
