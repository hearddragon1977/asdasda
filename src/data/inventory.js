/**
 * Operator inventory / loadout helpers.
 * Dedicated equipment slots: primary, sidearm, helmet, vest, backpack.
 */

import {
  DEFAULT_PLAYER_WEAPON,
  DEFAULT_SIDEARM,
  createMagazineLoadout,
  getWeaponById,
  getWeaponEquipSlot,
} from './weapons.js';
import {
  DEFAULT_BACKPACK,
  DEFAULT_HELMET,
  DEFAULT_VEST,
  getGearById,
} from './gear.js';

/**
 * @typedef {import('../types/game').WeaponLoadoutState} WeaponLoadoutState
 * @typedef {import('../types/game').InventoryState} InventoryState
 * @typedef {import('../types/game').WeaponState} WeaponState
 * @typedef {import('../types/game').EquipmentSlot} EquipmentSlot
 */

/**
 * @param {import('./weapons.js').WeaponDefinition} weapon
 * @param {number} [bonusMags]
 * @returns {WeaponLoadoutState}
 */
export function createWeaponLoadoutState(weapon, bonusMags = 0) {
  const loadout = createMagazineLoadout(weapon);
  const extra = Math.max(0, bonusMags);
  const reserveMags = [
    ...loadout.reserveMags,
    ...Array.from({ length: extra }, () => weapon.magazineSize),
  ];
  return {
    weaponId: weapon.id,
    currentMagRounds: loadout.currentMagRounds,
    chambered: loadout.chambered,
    reserveMags,
    reserveRounds: reserveMags.reduce((sum, n) => sum + n, 0),
  };
}

/**
 * Starting Bluefor patrol loadout.
 * @returns {InventoryState}
 */
export function createDefaultInventory() {
  const backpack = DEFAULT_BACKPACK;
  const bonus = backpack.ammoBonusMags ?? 0;
  return {
    primary: createWeaponLoadoutState(DEFAULT_PLAYER_WEAPON, bonus),
    sidearm: createWeaponLoadoutState(DEFAULT_SIDEARM, 0),
    helmetId: DEFAULT_HELMET.id,
    vestId: DEFAULT_VEST.id,
    backpackId: backpack.id,
    ownedWeaponIds: [
      DEFAULT_PLAYER_WEAPON.id,
      DEFAULT_SIDEARM.id,
      'm16a4',
      'mk18_cqbr',
      'm249_saw',
      'm14_ebr',
      'm24_sws',
      'akm',
      'ak74',
      'svd',
      'pkm',
      'makarov',
      'm1911a1',
      'mp5a3',
    ],
    ownedGearIds: [
      DEFAULT_HELMET.id,
      DEFAULT_VEST.id,
      DEFAULT_BACKPACK.id,
      'pasgt_helmet',
      'fast_helmet',
      'ciras_vest',
      'mbav_vest',
      'alice_pack',
      'camelbak',
      'chest_rig',
      'ssh68_helmet',
      'rd54_pack',
    ],
    activeWeaponSlot: 'primary',
  };
}

/**
 * Convert a slot loadout into live WeaponState for the viewport.
 * @param {WeaponLoadoutState} loadout
 * @returns {WeaponState}
 */
export function loadoutToWeaponState(loadout) {
  return {
    weaponId: loadout.weaponId,
    currentMagRounds: loadout.currentMagRounds,
    chambered: loadout.chambered,
    reserveMags: [...loadout.reserveMags],
    reserveRounds: loadout.reserveRounds,
    isReloading: false,
    isInspectingMag: false,
    magCheckInspectionText: null,
    aimingDownSights: false,
    tacticalLaser: true,
    tacticalLight: false,
    dryFired: false,
  };
}

/**
 * Snapshot live WeaponState back into a slot loadout (ammo preserved).
 * @param {WeaponState} weapon
 * @returns {WeaponLoadoutState}
 */
export function weaponStateToLoadout(weapon) {
  const reserveRounds =
    weapon.reserveRounds ??
    weapon.reserveMags.reduce((sum, n) => sum + n, 0);
  return {
    weaponId: weapon.weaponId,
    currentMagRounds: weapon.currentMagRounds,
    chambered: weapon.chambered,
    reserveMags: [...weapon.reserveMags],
    reserveRounds,
  };
}

/**
 * Active slot loadout from inventory.
 * @param {InventoryState} inventory
 * @returns {WeaponLoadoutState | null}
 */
export function getActiveLoadout(inventory) {
  return inventory[inventory.activeWeaponSlot];
}

/**
 * Build WeaponState for whatever is currently in the hands.
 * @param {InventoryState} inventory
 * @returns {WeaponState}
 */
export function getActiveWeaponState(inventory) {
  const active = getActiveLoadout(inventory);
  if (!active) {
    // Fallback: empty hands → dry M9-shaped stub so UI never crashes
    return loadoutToWeaponState(createWeaponLoadoutState(DEFAULT_SIDEARM));
  }
  return loadoutToWeaponState(active);
}

/**
 * Persist current WeaponState into the active inventory slot.
 * @param {InventoryState} inventory
 * @param {WeaponState} weapon
 * @returns {InventoryState}
 */
export function syncWeaponIntoInventory(inventory, weapon) {
  const slot = inventory.activeWeaponSlot;
  const current = inventory[slot];
  if (!current || current.weaponId !== weapon.weaponId) {
    // Equipped item changed externally; still write into active slot
  }
  return {
    ...inventory,
    [slot]: weaponStateToLoadout(weapon),
  };
}

/**
 * Switch between primary and sidearm, preserving ammo in both slots.
 * @param {InventoryState} inventory
 * @param {WeaponState} currentWeapon
 * @param {'primary' | 'sidearm'} nextSlot
 * @returns {{ inventory: InventoryState, weapon: WeaponState } | null}
 */
export function switchWeaponSlot(inventory, currentWeapon, nextSlot) {
  if (nextSlot === inventory.activeWeaponSlot) return null;
  const target = inventory[nextSlot];
  if (!target) return null;

  const synced = syncWeaponIntoInventory(inventory, currentWeapon);
  const nextInventory = {
    ...synced,
    activeWeaponSlot: nextSlot,
  };
  return {
    inventory: nextInventory,
    weapon: loadoutToWeaponState(target),
  };
}

/**
 * Equip a weapon into primary or sidearm from the owned stash.
 * @param {InventoryState} inventory
 * @param {WeaponState} currentWeapon
 * @param {string} weaponId
 * @returns {{ inventory: InventoryState, weapon: WeaponState } | null}
 */
export function equipWeapon(inventory, currentWeapon, weaponId) {
  const def = getWeaponById(weaponId);
  if (!def || !def.equippable) return null;
  if (!inventory.ownedWeaponIds.includes(weaponId)) return null;

  const slot = getWeaponEquipSlot(def);
  const backpack = inventory.backpackId ? getGearById(inventory.backpackId) : null;
  const bonus = slot === 'primary' ? backpack?.ammoBonusMags ?? 0 : 0;

  let next = syncWeaponIntoInventory(inventory, currentWeapon);
  const previous = next[slot];

  // Return previously equipped weapon to owned list (already there)
  const fresh = createWeaponLoadoutState(def, bonus);
  // If re-equipping the same gun that was stashed with ammo, prefer existing ammo...
  // but fresh equip from stash always starts full for clarity.

  next = {
    ...next,
    [slot]: fresh,
    activeWeaponSlot: slot,
  };

  // Keep previous weapon owned
  if (previous && !next.ownedWeaponIds.includes(previous.weaponId)) {
    next = {
      ...next,
      ownedWeaponIds: [...next.ownedWeaponIds, previous.weaponId],
    };
  }

  return {
    inventory: next,
    weapon: loadoutToWeaponState(fresh),
  };
}

/**
 * Unequip primary or sidearm (cannot fire that slot until re-equipped).
 * @param {InventoryState} inventory
 * @param {WeaponState} currentWeapon
 * @param {'primary' | 'sidearm'} slot
 * @returns {{ inventory: InventoryState, weapon: WeaponState }}
 */
export function unequipWeaponSlot(inventory, currentWeapon, slot) {
  let next = syncWeaponIntoInventory(inventory, currentWeapon);
  next = { ...next, [slot]: null };

  if (next.activeWeaponSlot === slot) {
    const fallback = slot === 'primary' ? 'sidearm' : 'primary';
    if (next[fallback]) {
      next = { ...next, activeWeaponSlot: fallback };
      return {
        inventory: next,
        weapon: loadoutToWeaponState(next[fallback]),
      };
    }
    // No weapon left — keep empty primary-shaped dry state
    next = { ...next, activeWeaponSlot: 'primary' };
    const empty = createWeaponLoadoutState(DEFAULT_SIDEARM);
    empty.currentMagRounds = 0;
    empty.reserveMags = [];
    empty.reserveRounds = 0;
    return {
      inventory: next,
      weapon: loadoutToWeaponState(empty),
    };
  }

  return {
    inventory: next,
    weapon: getActiveWeaponState(next),
  };
}

/**
 * Equip gear into helmet / vest / backpack.
 * Recalculates primary reserve bonus when backpack changes.
 * @param {InventoryState} inventory
 * @param {WeaponState} currentWeapon
 * @param {string} gearId
 * @returns {{ inventory: InventoryState, weapon: WeaponState } | null}
 */
export function equipGear(inventory, currentWeapon, gearId) {
  const gear = getGearById(gearId);
  if (!gear || !gear.equippable) return null;
  if (!inventory.ownedGearIds.includes(gearId)) return null;

  let next = syncWeaponIntoInventory(inventory, currentWeapon);
  const slotKey =
    gear.slot === 'helmet'
      ? 'helmetId'
      : gear.slot === 'vest'
        ? 'vestId'
        : 'backpackId';

  next = { ...next, [slotKey]: gearId };

  if (gear.slot === 'backpack' && next.primary) {
    const def = getWeaponById(next.primary.weaponId);
    if (def) {
      const bonus = gear.ammoBonusMags ?? 0;
      const baseReserves = Math.max(
        def.defaultReserveMags,
        next.primary.reserveMags.length
      );
      const desired = def.defaultReserveMags + bonus;
      let reserveMags = [...next.primary.reserveMags];
      while (reserveMags.length < desired) {
        reserveMags.push(def.magazineSize);
      }
      // Don't strip mags the player already earned — only ensure minimum
      void baseReserves;
      next = {
        ...next,
        primary: {
          ...next.primary,
          reserveMags,
          reserveRounds: reserveMags.reduce((s, n) => s + n, 0),
        },
      };
    }
  }

  return {
    inventory: next,
    weapon: getActiveWeaponState(next),
  };
}

/**
 * Clear a gear slot.
 * @param {InventoryState} inventory
 * @param {WeaponState} currentWeapon
 * @param {'helmet' | 'vest' | 'backpack'} gearSlot
 * @returns {{ inventory: InventoryState, weapon: WeaponState }}
 */
export function unequipGear(inventory, currentWeapon, gearSlot) {
  let next = syncWeaponIntoInventory(inventory, currentWeapon);
  const slotKey =
    gearSlot === 'helmet'
      ? 'helmetId'
      : gearSlot === 'vest'
        ? 'vestId'
        : 'backpackId';
  next = { ...next, [slotKey]: null };
  return {
    inventory: next,
    weapon: getActiveWeaponState(next),
  };
}

/**
 * Replenish ammo on both guns (CASEVAC / restart).
 * @param {InventoryState} inventory
 * @returns {{ inventory: InventoryState, weapon: WeaponState }}
 */
export function replenishInventoryAmmo(inventory) {
  const backpack = inventory.backpackId ? getGearById(inventory.backpackId) : null;
  const bonus = backpack?.ammoBonusMags ?? 0;

  let next = { ...inventory };
  if (next.primary) {
    const def = getWeaponById(next.primary.weaponId);
    if (def) next = { ...next, primary: createWeaponLoadoutState(def, bonus) };
  }
  if (next.sidearm) {
    const def = getWeaponById(next.sidearm.weaponId);
    if (def) next = { ...next, sidearm: createWeaponLoadoutState(def, 0) };
  }

  return {
    inventory: next,
    weapon: getActiveWeaponState(next),
  };
}

/**
 * Combined torso+head protection for future trauma scaling (0–1).
 * @param {InventoryState} inventory
 * @returns {{ head: number, torso: number, ammoBonusMags: number }}
 */
export function getEquippedProtection(inventory) {
  const helmet = inventory.helmetId ? getGearById(inventory.helmetId) : null;
  const vest = inventory.vestId ? getGearById(inventory.vestId) : null;
  const backpack = inventory.backpackId ? getGearById(inventory.backpackId) : null;
  return {
    head: helmet?.protection ?? 0,
    torso: vest?.protection ?? 0,
    ammoBonusMags: backpack?.ammoBonusMags ?? 0,
  };
}
