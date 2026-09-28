/**
 * Afghanistan-era personal protective equipment & load-bearing gear.
 * Equips into dedicated inventory slots: helmet, vest, backpack.
 */

/** @typedef {'helmet' | 'vest' | 'backpack'} GearSlot */
/** @typedef {'US' | 'Coalition' | 'OPFOR'} GearFaction */

/**
 * @typedef {Object} GearDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {GearSlot} slot
 * @property {GearFaction} faction
 * @property {number} weightKg
 * @property {number} protection   0–1 ballistic protection factor for that slot
 * @property {number} [ammoBonusMags] Extra reserve magazines granted by backpack
 * @property {number} [mobilityPenalty] 0–1 movement drag (UI / future use)
 * @property {boolean} equippable
 * @property {string} era
 * @property {string} description
 */

/** @type {GearDefinition} */
export const ACH_HELMET = {
  id: 'ach_helmet',
  name: 'ACH / MICH Helmet',
  shortName: 'ACH',
  slot: 'helmet',
  faction: 'US',
  weightKg: 1.5,
  protection: 0.55,
  mobilityPenalty: 0.02,
  equippable: true,
  era: '2003–2014+',
  description:
    'Advanced Combat Helmet — standard US issue through mid/late OEF. Rail mounts for NODs and side covers.',
};

/** @type {GearDefinition} */
export const PASGT_HELMET = {
  id: 'pasgt_helmet',
  name: 'PASGT Helmet',
  shortName: 'PASGT',
  slot: 'helmet',
  faction: 'US',
  weightKg: 1.9,
  protection: 0.42,
  mobilityPenalty: 0.04,
  equippable: true,
  era: '2001–2005',
  description:
    'Legacy Kevlar “Fritz” helmet still seen early in OEF and among some ANA/Coalition partners.',
};

/** @type {GearDefinition} */
export const FAST_HELMET = {
  id: 'fast_helmet',
  name: 'Ops-Core FAST Helmet',
  shortName: 'FAST',
  slot: 'helmet',
  faction: 'US',
  weightKg: 1.1,
  protection: 0.48,
  mobilityPenalty: 0.01,
  equippable: true,
  era: '2007–2014+',
  description:
    'High-cut SOF helmet with side rails. Favored by Rangers, SEALs, and JSOC elements for headset clearance.',
};

/** @type {GearDefinition} */
export const SSH68_HELMET = {
  id: 'ssh68_helmet',
  name: 'SSh-68 Steel Helmet',
  shortName: 'SSh-68',
  slot: 'helmet',
  faction: 'OPFOR',
  weightKg: 1.3,
  protection: 0.28,
  mobilityPenalty: 0.03,
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Soviet steel helmet still circulating among Afghan security forces and some insurgent cadres.',
};

/** @type {GearDefinition} */
export const IOTV_VEST = {
  id: 'iotv_vest',
  name: 'IOTV Plate Carrier',
  shortName: 'IOTV',
  slot: 'vest',
  faction: 'US',
  weightKg: 14.0,
  protection: 0.78,
  mobilityPenalty: 0.18,
  equippable: true,
  era: '2007–2014+',
  description:
    'Improved Outer Tactical Vest with ESAPI plates — heavy torso protection for conventional infantry patrols.',
};

/** @type {GearDefinition} */
export const CIRAS_VEST = {
  id: 'ciras_vest',
  name: 'CIRAS Plate Carrier',
  shortName: 'CIRAS',
  slot: 'vest',
  faction: 'US',
  weightKg: 9.5,
  protection: 0.72,
  mobilityPenalty: 0.12,
  equippable: true,
  era: '2004–2014',
  description:
    'SOF/MARSOC plate carrier — lighter cut than IOTV with scalable soft armor and pouch real estate.',
};

/** @type {GearDefinition} */
export const MBAV_VEST = {
  id: 'mbav_vest',
  name: 'MBAV Plate Carrier',
  shortName: 'MBAV',
  slot: 'vest',
  faction: 'US',
  weightKg: 8.2,
  protection: 0.7,
  mobilityPenalty: 0.1,
  equippable: true,
  era: '2005–2014+',
  description:
    'Modular Body Armor Vest — common among Rangers and conventional units seeking mobility over full IOTV coverage.',
};

/** @type {GearDefinition} */
export const CHEST_RIG = {
  id: 'chest_rig',
  name: 'Chicom Chest Rig',
  shortName: 'Chest Rig',
  slot: 'vest',
  faction: 'OPFOR',
  weightKg: 1.8,
  protection: 0.08,
  mobilityPenalty: 0.02,
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Type 56 / DIY chest rig for AK magazines. Almost no ballistic protection — pure ammo carriage.',
};

/** @type {GearDefinition} */
export const ASSAULT_PACK = {
  id: 'assault_pack',
  name: 'MOLLE Assault Pack',
  shortName: 'Assault Pack',
  slot: 'backpack',
  faction: 'US',
  weightKg: 1.4,
  protection: 0,
  ammoBonusMags: 2,
  mobilityPenalty: 0.04,
  equippable: true,
  era: '2001–2014+',
  description:
    '3-day assault pack for patrol ammo, IFAK overflow, and hydration. Standard Bluefor day-pack.',
};

/** @type {GearDefinition} */
export const ALICE_PACK = {
  id: 'alice_pack',
  name: 'ALICE Medium Pack',
  shortName: 'ALICE',
  slot: 'backpack',
  faction: 'US',
  weightKg: 2.2,
  protection: 0,
  ammoBonusMags: 3,
  mobilityPenalty: 0.08,
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Legacy ALICE frame pack still issued early war and to partner forces. Extra mag capacity at mobility cost.',
};

/** @type {GearDefinition} */
export const CAMELBAK = {
  id: 'camelbak',
  name: 'CamelBak Hydration Carrier',
  shortName: 'CamelBak',
  slot: 'backpack',
  faction: 'US',
  weightKg: 0.9,
  protection: 0,
  ammoBonusMags: 1,
  mobilityPenalty: 0.02,
  equippable: true,
  era: '2001–2014+',
  description:
    'Minimal hydration carrier with side pouches — light footprint for short dismounted movements.',
};

/** @type {GearDefinition} */
export const RD54_PACK = {
  id: 'rd54_pack',
  name: 'RD-54 Backpack',
  shortName: 'RD-54',
  slot: 'backpack',
  faction: 'OPFOR',
  weightKg: 1.6,
  protection: 0,
  ammoBonusMags: 2,
  mobilityPenalty: 0.05,
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Soviet airborne rucksack still found in Afghan bazaars and Taliban caches.',
};

/** @type {GearDefinition[]} */
export const GEAR = [
  ACH_HELMET,
  PASGT_HELMET,
  FAST_HELMET,
  SSH68_HELMET,
  IOTV_VEST,
  CIRAS_VEST,
  MBAV_VEST,
  CHEST_RIG,
  ASSAULT_PACK,
  ALICE_PACK,
  CAMELBAK,
  RD54_PACK,
];

/** @type {Record<string, GearDefinition>} */
export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const DEFAULT_HELMET = ACH_HELMET;
export const DEFAULT_VEST = IOTV_VEST;
export const DEFAULT_BACKPACK = ASSAULT_PACK;

/**
 * @param {string} id
 * @returns {GearDefinition | undefined}
 */
export function getGearById(id) {
  return GEAR_BY_ID[id];
}

/**
 * @param {GearSlot} slot
 * @returns {GearDefinition[]}
 */
export function getGearBySlot(slot) {
  return GEAR.filter((g) => g.slot === slot && g.equippable);
}

export default GEAR;
