/**
 * Afghanistan Conflict Era (2000s–2010s) Equippable Firearms Database
 *
 * Standard-issue and commonly encountered small arms used by US/Coalition
 * forces and opposing factions during Operations Enduring Freedom / ISAF.
 *
 * Ballistic figures are drawn from published military manuals and open-source
 * technical references (TM 9-1005 series, FM 3-22.9, Soviet/Russian manuals,
 * NATO STANAGs). Game damage values are scaled to the simulator's 0–100
 * combatant health model with range falloff.
 *
 * Units:
 *   muzzleVelocity  — m/s
 *   effectiveRange  — metres (point target unless noted)
 *   maxRange        — metres (maximum useful trajectory)
 *   fireRateRpm     — rounds/minute (cyclic)
 *   barrelLengthMm  — millimetres
 *   weightKg        — unloaded kilograms
 *   reloadTimeSec   — tactical reload seconds (approx.)
 */

/** @typedef {'US' | 'Coalition' | 'OPFOR'} WeaponFaction */
/** @typedef {'carbine' | 'assault_rifle' | 'battle_rifle' | 'dmr' | 'sniper' | 'lmg' | 'gpmg' | 'smg' | 'pistol'} WeaponCategory */
/** @typedef {'semi' | 'burst' | 'auto' | 'bolt'} FireMode */

/**
 * @typedef {Object} DamageScaling
 * @property {number} baseDamage          Damage at 0 m (muzzle / point-blank)
 * @property {number} minDamage           Floor damage at falloffEnd metres
 * @property {number} falloffStartM       Range where soft falloff begins
 * @property {number} falloffEndM         Range where minDamage is reached
 * @property {number} headMultiplier      Head / CNS hit multiplier
 * @property {number} limbMultiplier      Limb hit multiplier
 * @property {number} armorPenetration    0–1 soft armor defeat factor (era soft plates / PASGT)
 */

/**
 * @typedef {Object} WeaponDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {WeaponFaction} faction
 * @property {WeaponCategory} category
 * @property {string} caliber
 * @property {string} cartridge
 * @property {number} muzzleVelocity
 * @property {number} effectiveRange
 * @property {number} maxRange
 * @property {number} fireRateRpm
 * @property {FireMode[]} fireModes
 * @property {number} magazineSize
 * @property {number} defaultReserveMags
 * @property {number} reloadTimeSec
 * @property {number} emptyReloadTimeSec
 * @property {number} weightKg
 * @property {number} barrelLengthMm
 * @property {DamageScaling} damage
 * @property {boolean} equippable
 * @property {string} era
 * @property {string} description
 * @property {string[]} [aliases]
 */

// ---------------------------------------------------------------------------
// Damage helpers
// ---------------------------------------------------------------------------

/**
 * Linear damage falloff between falloffStartM and falloffEndM.
 * @param {WeaponDefinition} weapon
 * @param {number} rangeM
 * @returns {number}
 */
export function getDamageAtRange(weapon, rangeM) {
  const { baseDamage, minDamage, falloffStartM, falloffEndM } = weapon.damage;
  if (rangeM <= falloffStartM) return baseDamage;
  if (rangeM >= falloffEndM) return minDamage;
  const t = (rangeM - falloffStartM) / (falloffEndM - falloffStartM);
  return baseDamage + (minDamage - baseDamage) * t;
}

/**
 * Zone-adjusted damage for anatomy / hit resolution.
 * @param {WeaponDefinition} weapon
 * @param {number} rangeM
 * @param {'head' | 'torso' | 'limb'} zone
 * @returns {number}
 */
export function getZoneDamage(weapon, rangeM, zone) {
  const base = getDamageAtRange(weapon, rangeM);
  if (zone === 'head') return base * weapon.damage.headMultiplier;
  if (zone === 'limb') return base * weapon.damage.limbMultiplier;
  return base;
}

/**
 * Approximate time between shots (ms) from cyclic RPM.
 * @param {WeaponDefinition} weapon
 * @returns {number}
 */
export function getShotIntervalMs(weapon) {
  if (!weapon.fireRateRpm || weapon.fireRateRpm <= 0) return 1000;
  return Math.round(60000 / weapon.fireRateRpm);
}

/**
 * Approximate projectile speed for the 3D tactical world (game units/sec).
 * Scales muzzle velocity into the existing ~36 u/s visual ballistic budget.
 * @param {WeaponDefinition} weapon
 * @param {number} [referenceMps=900]
 * @param {number} [referenceSpeed=36]
 * @returns {number}
 */
export function getProjectileSpeed(weapon, referenceMps = 900, referenceSpeed = 36) {
  return (weapon.muzzleVelocity / referenceMps) * referenceSpeed;
}

/**
 * Build initial WeaponState-compatible magazine loadout from a definition.
 * @param {WeaponDefinition} weapon
 * @returns {{ currentMagRounds: number, chambered: boolean, reserveMags: number[] }}
 */
export function createMagazineLoadout(weapon) {
  const full = weapon.magazineSize;
  const reserves = Array.from({ length: weapon.defaultReserveMags }, () => full);
  // Last spare often partially filled in field conditions
  if (reserves.length > 0) {
    reserves[reserves.length - 1] = Math.max(1, Math.floor(full * 0.6));
  }
  return {
    currentMagRounds: full,
    chambered: true,
    reserveMags: reserves,
  };
}

// ---------------------------------------------------------------------------
// US / Coalition — Service rifles, carbines, LMGs, sidearms
// ---------------------------------------------------------------------------

/** @type {WeaponDefinition} */
export const M4A1 = {
  id: 'm4a1',
  name: 'M4A1 Carbine',
  shortName: 'M4A1',
  faction: 'US',
  category: 'carbine',
  caliber: '5.56×45mm NATO',
  cartridge: 'M855 / M855A1',
  muzzleVelocity: 884,
  effectiveRange: 500,
  maxRange: 3600,
  fireRateRpm: 800,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 1.8,
  emptyReloadTimeSec: 2.4,
  weightKg: 3.4,
  barrelLengthMm: 368,
  damage: {
    baseDamage: 34,
    minDamage: 18,
    falloffStartM: 150,
    falloffEndM: 500,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.55,
  },
  equippable: true,
  era: '2001–2014+',
  description:
    'Standard US Army / SOCOM carbine throughout OEF. 14.5″ barrel, flat-top rail, full-auto. Ubiquitous among Bluefor fireteams in Helmand, Kandahar, and Kunar.',
  aliases: ['M4', 'M4 Carbine'],
};

/** @type {WeaponDefinition} */
export const M16A4 = {
  id: 'm16a4',
  name: 'M16A4 Rifle',
  shortName: 'M16A4',
  faction: 'US',
  category: 'assault_rifle',
  caliber: '5.56×45mm NATO',
  cartridge: 'M855',
  muzzleVelocity: 948,
  effectiveRange: 550,
  maxRange: 3600,
  fireRateRpm: 800,
  fireModes: ['semi', 'burst'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 2.0,
  emptyReloadTimeSec: 2.6,
  weightKg: 3.99,
  barrelLengthMm: 508,
  damage: {
    baseDamage: 36,
    minDamage: 20,
    falloffStartM: 200,
    falloffEndM: 550,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.58,
  },
  equippable: true,
  era: '2003–2010s',
  description:
    'USMC standard rifle early/mid OEF–OIF. 20″ barrel and knurled RAS rails; three-round burst. Longer sight radius and higher MV than the M4A1.',
};

/** @type {WeaponDefinition} */
export const M249_SAW = {
  id: 'm249_saw',
  name: 'M249 SAW',
  shortName: 'M249',
  faction: 'US',
  category: 'lmg',
  caliber: '5.56×45mm NATO',
  cartridge: 'M855 linked',
  muzzleVelocity: 915,
  effectiveRange: 800,
  maxRange: 3600,
  fireRateRpm: 750,
  fireModes: ['auto'],
  magazineSize: 200,
  defaultReserveMags: 2,
  reloadTimeSec: 4.5,
  emptyReloadTimeSec: 5.5,
  weightKg: 7.5,
  barrelLengthMm: 465,
  damage: {
    baseDamage: 33,
    minDamage: 16,
    falloffStartM: 200,
    falloffEndM: 800,
    headMultiplier: 3.0,
    limbMultiplier: 0.7,
    armorPenetration: 0.55,
  },
  equippable: true,
  era: '2001–2014+',
  description:
    'Squad Automatic Weapon. Belt-fed 5.56mm suppression for US infantry squads; also accepts STANAG mags in emergency. Soft packs of 100/200 common in Afghanistan.',
  aliases: ['SAW', 'Minimi'],
};

/** @type {WeaponDefinition} */
export const M240B = {
  id: 'm240b',
  name: 'M240B Medium Machine Gun',
  shortName: 'M240B',
  faction: 'US',
  category: 'gpmg',
  caliber: '7.62×51mm NATO',
  cartridge: 'M80 linked',
  muzzleVelocity: 853,
  effectiveRange: 1100,
  maxRange: 3725,
  fireRateRpm: 650,
  fireModes: ['auto'],
  magazineSize: 100,
  defaultReserveMags: 3,
  reloadTimeSec: 5.0,
  emptyReloadTimeSec: 6.0,
  weightKg: 12.5,
  barrelLengthMm: 630,
  damage: {
    baseDamage: 48,
    minDamage: 28,
    falloffStartM: 300,
    falloffEndM: 1100,
    headMultiplier: 3.0,
    limbMultiplier: 0.75,
    armorPenetration: 0.78,
  },
  equippable: true,
  era: '2001–2014+',
  description:
    'Company/weapons-squad GPMG. Heavier 7.62mm punch for sustained fire from compounds and overwatch berms across Helmand river valleys.',
  aliases: ['M240', 'FN MAG'],
};

/** @type {WeaponDefinition} */
export const M9 = {
  id: 'm9',
  name: 'M9 Pistol',
  shortName: 'M9',
  faction: 'US',
  category: 'pistol',
  caliber: '9×19mm Parabellum',
  cartridge: 'M882',
  muzzleVelocity: 381,
  effectiveRange: 50,
  maxRange: 1800,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 15,
  defaultReserveMags: 2,
  reloadTimeSec: 1.4,
  emptyReloadTimeSec: 1.8,
  weightKg: 0.96,
  barrelLengthMm: 125,
  damage: {
    baseDamage: 22,
    minDamage: 12,
    falloffStartM: 15,
    falloffEndM: 50,
    headMultiplier: 2.8,
    limbMultiplier: 0.65,
    armorPenetration: 0.25,
  },
  equippable: true,
  era: '2001–2017',
  description:
    'Beretta 92FS adopted as M9 — standard US sidearm through most of the Afghan war. Backup for carbine stoppages and CQB.',
  aliases: ['Beretta 92FS'],
};

/** @type {WeaponDefinition} */
export const M1911A1 = {
  id: 'm1911a1',
  name: 'M1911A1 Pistol',
  shortName: 'M1911',
  faction: 'US',
  category: 'pistol',
  caliber: '.45 ACP',
  cartridge: 'M1911 ball',
  muzzleVelocity: 253,
  effectiveRange: 50,
  maxRange: 1500,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 7,
  defaultReserveMags: 3,
  reloadTimeSec: 1.5,
  emptyReloadTimeSec: 1.9,
  weightKg: 1.1,
  barrelLengthMm: 127,
  damage: {
    baseDamage: 28,
    minDamage: 16,
    falloffStartM: 12,
    falloffEndM: 50,
    headMultiplier: 2.8,
    limbMultiplier: 0.7,
    armorPenetration: 0.22,
  },
  equippable: true,
  era: '2001–2010s (SOF)',
  description:
    'Still carried by many SOF and MARSOC operators preferring .45 ACP stopping power over the issue M9.',
};

/** @type {WeaponDefinition} */
export const MK18_CQBR = {
  id: 'mk18_cqbr',
  name: 'Mk 18 CQBR',
  shortName: 'Mk18',
  faction: 'US',
  category: 'carbine',
  caliber: '5.56×45mm NATO',
  cartridge: 'Mk262 / M855',
  muzzleVelocity: 790,
  effectiveRange: 300,
  maxRange: 3600,
  fireRateRpm: 850,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 1.7,
  emptyReloadTimeSec: 2.3,
  weightKg: 3.0,
  barrelLengthMm: 262,
  damage: {
    baseDamage: 32,
    minDamage: 14,
    falloffStartM: 80,
    falloffEndM: 300,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.5,
  },
  equippable: true,
  era: '2000s–2010s',
  description:
    'Close Quarters Battle Receiver — 10.3″ upper used by SEALs, Rangers, and CAG for compound clearing and vehicle work.',
  aliases: ['CQBR', 'Mk 18'],
};

/** @type {WeaponDefinition} */
export const L85A2 = {
  id: 'l85a2',
  name: 'L85A2 Rifle',
  shortName: 'L85A2',
  faction: 'Coalition',
  category: 'assault_rifle',
  caliber: '5.56×45mm NATO',
  cartridge: 'L2A2 / SS109',
  muzzleVelocity: 940,
  effectiveRange: 400,
  maxRange: 3000,
  fireRateRpm: 650,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 2.2,
  emptyReloadTimeSec: 2.8,
  weightKg: 4.98,
  barrelLengthMm: 518,
  damage: {
    baseDamage: 35,
    minDamage: 19,
    falloffStartM: 150,
    falloffEndM: 400,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.56,
  },
  equippable: true,
  era: '2001–2014',
  description:
    'British Army SA80 A2 bullpup — standard rifle for UK forces in Helmand (Task Force Helmand). SUSAT / ACOG optics common.',
  aliases: ['SA80', 'SA80A2'],
};

/** @type {WeaponDefinition} */
export const C8_SFW = {
  id: 'c8_sfw',
  name: 'C8 SFW Carbine',
  shortName: 'C8',
  faction: 'Coalition',
  category: 'carbine',
  caliber: '5.56×45mm NATO',
  cartridge: 'C77 / SS109',
  muzzleVelocity: 870,
  effectiveRange: 400,
  maxRange: 3600,
  fireRateRpm: 750,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 1.9,
  emptyReloadTimeSec: 2.5,
  weightKg: 3.2,
  barrelLengthMm: 400,
  damage: {
    baseDamage: 34,
    minDamage: 17,
    falloffStartM: 120,
    falloffEndM: 400,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.54,
  },
  equippable: true,
  era: '2000s–2010s',
  description:
    'Diémaco/Colt Canada C8 Special Forces Weapon — Canadian and UK SOF carbine widely seen with ISAF partners.',
};

/** @type {WeaponDefinition} */
export const G36 = {
  id: 'g36',
  name: 'HK G36',
  shortName: 'G36',
  faction: 'Coalition',
  category: 'assault_rifle',
  caliber: '5.56×45mm NATO',
  cartridge: 'SS109',
  muzzleVelocity: 920,
  effectiveRange: 500,
  maxRange: 2860,
  fireRateRpm: 750,
  fireModes: ['semi', 'burst', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 6,
  reloadTimeSec: 2.0,
  emptyReloadTimeSec: 2.5,
  weightKg: 3.63,
  barrelLengthMm: 480,
  damage: {
    baseDamage: 34,
    minDamage: 18,
    falloffStartM: 150,
    falloffEndM: 500,
    headMultiplier: 3.2,
    limbMultiplier: 0.7,
    armorPenetration: 0.55,
  },
  equippable: true,
  era: '2001–2010s',
  description:
    'Bundeswehr and other ISAF contingents. Polymer receiver, dual optic carry handle; G36K carbine variant common on patrol.',
};

// ---------------------------------------------------------------------------
// US / Coalition — Designated marksman & sniper systems
// ---------------------------------------------------------------------------

/** @type {WeaponDefinition} */
export const M14_EBR = {
  id: 'm14_ebr',
  name: 'M14 EBR',
  shortName: 'M14 EBR',
  faction: 'US',
  category: 'dmr',
  caliber: '7.62×51mm NATO',
  cartridge: 'M80 / M118LR',
  muzzleVelocity: 853,
  effectiveRange: 800,
  maxRange: 3725,
  fireRateRpm: 700,
  fireModes: ['semi', 'auto'],
  magazineSize: 20,
  defaultReserveMags: 5,
  reloadTimeSec: 2.3,
  emptyReloadTimeSec: 2.9,
  weightKg: 5.1,
  barrelLengthMm: 457,
  damage: {
    baseDamage: 52,
    minDamage: 32,
    falloffStartM: 250,
    falloffEndM: 800,
    headMultiplier: 3.4,
    limbMultiplier: 0.75,
    armorPenetration: 0.82,
  },
  equippable: true,
  era: '2004–2014',
  description:
    'Enhanced Battle Rifle — Sage chassis M14 issued as DMR to US Army squads needing 7.62 reach across Afghan ridgelines before the SDM-R / M110 surge.',
  aliases: ['Mk 14 EBR', 'M14'],
};

/** @type {WeaponDefinition} */
export const M24_SWS = {
  id: 'm24_sws',
  name: 'M24 Sniper Weapon System',
  shortName: 'M24',
  faction: 'US',
  category: 'sniper',
  caliber: '7.62×51mm NATO',
  cartridge: 'M118LR',
  muzzleVelocity: 790,
  effectiveRange: 800,
  maxRange: 3725,
  fireRateRpm: 0,
  fireModes: ['bolt'],
  magazineSize: 5,
  defaultReserveMags: 6,
  reloadTimeSec: 3.5,
  emptyReloadTimeSec: 4.0,
  weightKg: 5.4,
  barrelLengthMm: 610,
  damage: {
    baseDamage: 72,
    minDamage: 48,
    falloffStartM: 400,
    falloffEndM: 800,
    headMultiplier: 4.0,
    limbMultiplier: 0.8,
    armorPenetration: 0.88,
  },
  equippable: true,
  era: '2001–2010s',
  description:
    'Remington 700-based Army sniper rifle. Bolt-action precision for overwatch and HVT interdiction; later superseded by M2010 in .300 WM.',
  aliases: ['M24 SWS'],
};

/** @type {WeaponDefinition} */
export const M110_SASS = {
  id: 'm110_sass',
  name: 'M110 SASS',
  shortName: 'M110',
  faction: 'US',
  category: 'dmr',
  caliber: '7.62×51mm NATO',
  cartridge: 'M118LR / Mk316',
  muzzleVelocity: 783,
  effectiveRange: 800,
  maxRange: 3725,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 20,
  defaultReserveMags: 5,
  reloadTimeSec: 2.4,
  emptyReloadTimeSec: 3.0,
  weightKg: 6.9,
  barrelLengthMm: 508,
  damage: {
    baseDamage: 55,
    minDamage: 35,
    falloffStartM: 300,
    falloffEndM: 800,
    headMultiplier: 3.5,
    limbMultiplier: 0.75,
    armorPenetration: 0.85,
  },
  equippable: true,
  era: '2008–2014+',
  description:
    'Semi-Automatic Sniper System (Knight’s Armament) — gas-gun DMR replacing many bolt guns for rapid follow-up shots in mountainous COIN fights.',
  aliases: ['SASS'],
};

/** @type {WeaponDefinition} */
export const MK12_SPR = {
  id: 'mk12_spr',
  name: 'Mk 12 SPR',
  shortName: 'Mk12',
  faction: 'US',
  category: 'dmr',
  caliber: '5.56×45mm NATO',
  cartridge: 'Mk262 Mod 1',
  muzzleVelocity: 900,
  effectiveRange: 600,
  maxRange: 3600,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 20,
  defaultReserveMags: 6,
  reloadTimeSec: 2.1,
  emptyReloadTimeSec: 2.7,
  weightKg: 4.5,
  barrelLengthMm: 457,
  damage: {
    baseDamage: 38,
    minDamage: 24,
    falloffStartM: 250,
    falloffEndM: 600,
    headMultiplier: 3.4,
    limbMultiplier: 0.7,
    armorPenetration: 0.62,
  },
  equippable: true,
  era: '2002–2010s',
  description:
    'Special Purpose Rifle — precision 5.56 upper (PRI / Crane) for SOF designated marksmen using match Mk262 ammunition out to ~600 m.',
  aliases: ['SPR', 'Mk 12'],
};

/** @type {WeaponDefinition} */
export const M107 = {
  id: 'm107',
  name: 'M107 Barrett',
  shortName: 'M107',
  faction: 'US',
  category: 'sniper',
  caliber: '12.7×99mm NATO',
  cartridge: 'M33 / Mk211',
  muzzleVelocity: 853,
  effectiveRange: 1800,
  maxRange: 6800,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 10,
  defaultReserveMags: 3,
  reloadTimeSec: 3.8,
  emptyReloadTimeSec: 4.5,
  weightKg: 12.9,
  barrelLengthMm: 737,
  damage: {
    baseDamage: 95,
    minDamage: 70,
    falloffStartM: 800,
    falloffEndM: 1800,
    headMultiplier: 4.5,
    limbMultiplier: 0.9,
    armorPenetration: 0.98,
  },
  equippable: true,
  era: '2001–2014+',
  description:
    'Anti-materiel / long-range antimateriel rifle. Used against technicals, compounds, and extreme-range personnel targets in open Afghan terrain.',
  aliases: ['Barrett M82', 'M82A1'],
};

/** @type {WeaponDefinition} */
export const L115A3 = {
  id: 'l115a3',
  name: 'L115A3 Long Range Rifle',
  shortName: 'L115A3',
  faction: 'Coalition',
  category: 'sniper',
  caliber: '.338 Lapua Magnum',
  cartridge: 'LockBase B408',
  muzzleVelocity: 936,
  effectiveRange: 1500,
  maxRange: 1700,
  fireRateRpm: 0,
  fireModes: ['bolt'],
  magazineSize: 5,
  defaultReserveMags: 5,
  reloadTimeSec: 3.6,
  emptyReloadTimeSec: 4.2,
  weightKg: 6.9,
  barrelLengthMm: 686,
  damage: {
    baseDamage: 85,
    minDamage: 60,
    falloffStartM: 600,
    falloffEndM: 1500,
    headMultiplier: 4.2,
    limbMultiplier: 0.85,
    armorPenetration: 0.94,
  },
  equippable: true,
  era: '2008–2014',
  description:
    'Accuracy International AWM variant — British sniper rifle famous for extreme-range engagements in Helmand.',
  aliases: ['AWM', 'L96'],
};

// ---------------------------------------------------------------------------
// OPFOR / Insurgent — Common small arms
// ---------------------------------------------------------------------------

/** @type {WeaponDefinition} */
export const AKM = {
  id: 'akm',
  name: 'AKM Assault Rifle',
  shortName: 'AKM',
  faction: 'OPFOR',
  category: 'assault_rifle',
  caliber: '7.62×39mm',
  cartridge: 'M43',
  muzzleVelocity: 715,
  effectiveRange: 350,
  maxRange: 1500,
  fireRateRpm: 600,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 4,
  reloadTimeSec: 2.2,
  emptyReloadTimeSec: 2.8,
  weightKg: 3.3,
  barrelLengthMm: 415,
  damage: {
    baseDamage: 40,
    minDamage: 22,
    falloffStartM: 100,
    falloffEndM: 350,
    headMultiplier: 3.0,
    limbMultiplier: 0.75,
    armorPenetration: 0.48,
  },
  equippable: true,
  era: '1979–2010s',
  description:
    'Most common insurgent rifle in Afghanistan. Stamped-receiver 7.62×39 with heavy projectile energy at close/medium ranges; Type 56 Chinese copies equally prevalent.',
  aliases: ['AK-47', 'Type 56'],
};

/** @type {WeaponDefinition} */
export const AK74 = {
  id: 'ak74',
  name: 'AK-74 Assault Rifle',
  shortName: 'AK-74',
  faction: 'OPFOR',
  category: 'assault_rifle',
  caliber: '5.45×39mm',
  cartridge: '7N6 / 7N10',
  muzzleVelocity: 900,
  effectiveRange: 500,
  maxRange: 3150,
  fireRateRpm: 650,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 4,
  reloadTimeSec: 2.1,
  emptyReloadTimeSec: 2.7,
  weightKg: 3.3,
  barrelLengthMm: 415,
  damage: {
    baseDamage: 33,
    minDamage: 17,
    falloffStartM: 150,
    falloffEndM: 500,
    headMultiplier: 3.1,
    limbMultiplier: 0.7,
    armorPenetration: 0.52,
  },
  equippable: true,
  era: '1980s–2010s',
  description:
    'Soviet 5.45mm successor seen among Taliban caches and Northern Alliance leftovers. Flatter trajectory than AKM; distinctive muzzle brake.',
  aliases: ['AK-74', 'AKS-74'],
};

/** @type {WeaponDefinition} */
export const AKS74U = {
  id: 'aks74u',
  name: 'AKS-74U Carbine',
  shortName: 'AKS-74U',
  faction: 'OPFOR',
  category: 'carbine',
  caliber: '5.45×39mm',
  cartridge: '7N6',
  muzzleVelocity: 735,
  effectiveRange: 200,
  maxRange: 3150,
  fireRateRpm: 700,
  fireModes: ['semi', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 4,
  reloadTimeSec: 2.0,
  emptyReloadTimeSec: 2.5,
  weightKg: 2.7,
  barrelLengthMm: 210,
  damage: {
    baseDamage: 30,
    minDamage: 12,
    falloffStartM: 60,
    falloffEndM: 200,
    headMultiplier: 3.0,
    limbMultiplier: 0.7,
    armorPenetration: 0.45,
  },
  equippable: true,
  era: '1980s–2010s',
  description:
    'Compact “Krinkov” — vehicle crews, bodyguards, and ambush teams. High cyclic rate, rapid velocity loss past 150–200 m.',
  aliases: ['Krinkov', 'AKSU'],
};

/** @type {WeaponDefinition} */
export const RPK = {
  id: 'rpk',
  name: 'RPK Light Machine Gun',
  shortName: 'RPK',
  faction: 'OPFOR',
  category: 'lmg',
  caliber: '7.62×39mm',
  cartridge: 'M43',
  muzzleVelocity: 745,
  effectiveRange: 800,
  maxRange: 1500,
  fireRateRpm: 600,
  fireModes: ['semi', 'auto'],
  magazineSize: 75,
  defaultReserveMags: 3,
  reloadTimeSec: 3.2,
  emptyReloadTimeSec: 3.8,
  weightKg: 4.8,
  barrelLengthMm: 590,
  damage: {
    baseDamage: 41,
    minDamage: 20,
    falloffStartM: 150,
    falloffEndM: 800,
    headMultiplier: 3.0,
    limbMultiplier: 0.75,
    armorPenetration: 0.5,
  },
  equippable: true,
  era: '1979–2010s',
  description:
    'Squad LMG based on the AKM. 75-round drum or 40-round box; sustained fire for Taliban fire teams suppressing patrol bases.',
};

/** @type {WeaponDefinition} */
export const RPK74 = {
  id: 'rpk74',
  name: 'RPK-74 Light Machine Gun',
  shortName: 'RPK-74',
  faction: 'OPFOR',
  category: 'lmg',
  caliber: '5.45×39mm',
  cartridge: '7N6',
  muzzleVelocity: 960,
  effectiveRange: 800,
  maxRange: 3150,
  fireRateRpm: 600,
  fireModes: ['semi', 'auto'],
  magazineSize: 45,
  defaultReserveMags: 4,
  reloadTimeSec: 3.0,
  emptyReloadTimeSec: 3.6,
  weightKg: 4.7,
  barrelLengthMm: 590,
  damage: {
    baseDamage: 34,
    minDamage: 16,
    falloffStartM: 200,
    falloffEndM: 800,
    headMultiplier: 3.0,
    limbMultiplier: 0.7,
    armorPenetration: 0.52,
  },
  equippable: true,
  era: '1980s–2010s',
  description:
    '5.45mm RPK variant. Longer barrel and bipod for area fire; shares magazines with AK-74 family.',
};

/** @type {WeaponDefinition} */
export const PKM = {
  id: 'pkm',
  name: 'PKM General-Purpose Machine Gun',
  shortName: 'PKM',
  faction: 'OPFOR',
  category: 'gpmg',
  caliber: '7.62×54mmR',
  cartridge: 'LPS / 57-N-323S',
  muzzleVelocity: 825,
  effectiveRange: 1000,
  maxRange: 3800,
  fireRateRpm: 650,
  fireModes: ['auto'],
  magazineSize: 100,
  defaultReserveMags: 3,
  reloadTimeSec: 5.5,
  emptyReloadTimeSec: 6.5,
  weightKg: 7.5,
  barrelLengthMm: 645,
  damage: {
    baseDamage: 50,
    minDamage: 30,
    falloffStartM: 300,
    falloffEndM: 1000,
    headMultiplier: 3.1,
    limbMultiplier: 0.75,
    armorPenetration: 0.8,
  },
  equippable: true,
  era: '1979–2010s',
  description:
    'Primary OPFOR support weapon. Non-disintegrating 100/200-round belts; devastating from grape-row berms and mountain positions. Peer threat to M240B.',
  aliases: ['PK', 'PKMS'],
};

/** @type {WeaponDefinition} */
export const SVD = {
  id: 'svd',
  name: 'Dragunov SVD',
  shortName: 'SVD',
  faction: 'OPFOR',
  category: 'dmr',
  caliber: '7.62×54mmR',
  cartridge: '7N1 / 7N14',
  muzzleVelocity: 830,
  effectiveRange: 800,
  maxRange: 3800,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 10,
  defaultReserveMags: 4,
  reloadTimeSec: 2.6,
  emptyReloadTimeSec: 3.2,
  weightKg: 4.3,
  barrelLengthMm: 620,
  damage: {
    baseDamage: 58,
    minDamage: 36,
    falloffStartM: 300,
    falloffEndM: 800,
    headMultiplier: 3.6,
    limbMultiplier: 0.75,
    armorPenetration: 0.84,
  },
  equippable: true,
  era: '1979–2010s',
  description:
    'Iconic designated marksman rifle of Afghan conflicts. PSO-1 optic, 10-round magazine; preferred for overwatch and IED-site security by insurgent marksmen.',
  aliases: ['Dragunov', 'SVD-63'],
};

/** @type {WeaponDefinition} */
export const MAKAROV = {
  id: 'makarov',
  name: 'PM Makarov Pistol',
  shortName: 'Makarov',
  faction: 'OPFOR',
  category: 'pistol',
  caliber: '9×18mm Makarov',
  cartridge: '57-N-181S',
  muzzleVelocity: 315,
  effectiveRange: 50,
  maxRange: 1250,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 8,
  defaultReserveMags: 2,
  reloadTimeSec: 1.6,
  emptyReloadTimeSec: 2.0,
  weightKg: 0.73,
  barrelLengthMm: 93,
  damage: {
    baseDamage: 20,
    minDamage: 10,
    falloffStartM: 10,
    falloffEndM: 50,
    headMultiplier: 2.6,
    limbMultiplier: 0.65,
    armorPenetration: 0.18,
  },
  equippable: true,
  era: '1951–2010s',
  description:
    'Standard Soviet/Warsaw Pact sidearm remaining in Afghan and Pakistani bazaar circulation. Compact backup for commanders and suicide-vest facilitators.',
  aliases: ['PM', 'Pistol Makarova'],
};

/** @type {WeaponDefinition} */
export const TT33 = {
  id: 'tt33',
  name: 'TT-33 Tokarev',
  shortName: 'TT-33',
  faction: 'OPFOR',
  category: 'pistol',
  caliber: '7.62×25mm Tokarev',
  cartridge: '57-N-134S',
  muzzleVelocity: 420,
  effectiveRange: 50,
  maxRange: 1600,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 8,
  defaultReserveMags: 2,
  reloadTimeSec: 1.5,
  emptyReloadTimeSec: 1.9,
  weightKg: 0.85,
  barrelLengthMm: 116,
  damage: {
    baseDamage: 24,
    minDamage: 12,
    falloffStartM: 15,
    falloffEndM: 50,
    headMultiplier: 2.7,
    limbMultiplier: 0.65,
    armorPenetration: 0.35,
  },
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Older but still encountered Tokarev pistol. Hot 7.62×25mm round with better soft-armor punch than Makarov at handgun distances.',
};

/** @type {WeaponDefinition} */
export const SKS = {
  id: 'sks',
  name: 'SKS Carbine',
  shortName: 'SKS',
  faction: 'OPFOR',
  category: 'battle_rifle',
  caliber: '7.62×39mm',
  cartridge: 'M43',
  muzzleVelocity: 735,
  effectiveRange: 400,
  maxRange: 1500,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 10,
  defaultReserveMags: 5,
  reloadTimeSec: 3.0,
  emptyReloadTimeSec: 3.5,
  weightKg: 3.85,
  barrelLengthMm: 520,
  damage: {
    baseDamage: 42,
    minDamage: 24,
    falloffStartM: 120,
    falloffEndM: 400,
    headMultiplier: 3.1,
    limbMultiplier: 0.75,
    armorPenetration: 0.5,
  },
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Semi-auto carbine still fielded by village militias and some Taliban cells. Fixed 10-round magazine, stripper-clip reload.',
};

/** @type {WeaponDefinition} */
export const LeeEnfield_No4 = {
  id: 'lee_enfield_no4',
  name: 'Lee-Enfield No.4 Mk I',
  shortName: 'Lee-Enfield',
  faction: 'OPFOR',
  category: 'sniper',
  caliber: '.303 British',
  cartridge: 'Mk VII ball',
  muzzleVelocity: 744,
  effectiveRange: 600,
  maxRange: 2740,
  fireRateRpm: 0,
  fireModes: ['bolt'],
  magazineSize: 10,
  defaultReserveMags: 4,
  reloadTimeSec: 3.8,
  emptyReloadTimeSec: 4.5,
  weightKg: 4.1,
  barrelLengthMm: 640,
  damage: {
    baseDamage: 55,
    minDamage: 34,
    falloffStartM: 250,
    falloffEndM: 600,
    headMultiplier: 3.5,
    limbMultiplier: 0.8,
    armorPenetration: 0.7,
  },
  equippable: true,
  era: 'legacy–2010s',
  description:
    'Colonial-era bolt rifle still prized by Pashtun marksmen for long-range ambushes; smooth action and heavy .303 projectile.',
  aliases: ['SMLE', 'No.4'],
};

/** @type {WeaponDefinition} */
export const MP5A3 = {
  id: 'mp5a3',
  name: 'HK MP5A3',
  shortName: 'MP5',
  faction: 'US',
  category: 'smg',
  caliber: '9×19mm Parabellum',
  cartridge: 'M882',
  muzzleVelocity: 400,
  effectiveRange: 100,
  maxRange: 1500,
  fireRateRpm: 800,
  fireModes: ['semi', 'burst', 'auto'],
  magazineSize: 30,
  defaultReserveMags: 5,
  reloadTimeSec: 1.8,
  emptyReloadTimeSec: 2.3,
  weightKg: 3.1,
  barrelLengthMm: 225,
  damage: {
    baseDamage: 24,
    minDamage: 12,
    falloffStartM: 30,
    falloffEndM: 100,
    headMultiplier: 2.8,
    limbMultiplier: 0.65,
    armorPenetration: 0.28,
  },
  equippable: true,
  era: '2001–2010s (SOF)',
  description:
    'Roller-delayed 9mm SMG retained by SOF and PSD teams for low-overpenetration CQB inside compounds and aircraft.',
};

/** @type {WeaponDefinition} */
export const M203 = {
  id: 'm203',
  name: 'M203 Grenade Launcher',
  shortName: 'M203',
  faction: 'US',
  category: 'assault_rifle',
  caliber: '40×46mm LV',
  cartridge: 'M406 / M433',
  muzzleVelocity: 76,
  effectiveRange: 150,
  maxRange: 400,
  fireRateRpm: 0,
  fireModes: ['semi'],
  magazineSize: 1,
  defaultReserveMags: 6,
  reloadTimeSec: 2.5,
  emptyReloadTimeSec: 2.5,
  weightKg: 1.36,
  barrelLengthMm: 305,
  damage: {
    baseDamage: 90,
    minDamage: 70,
    falloffStartM: 50,
    falloffEndM: 150,
    headMultiplier: 1.5,
    limbMultiplier: 1.0,
    armorPenetration: 0.9,
  },
  equippable: true,
  era: '2001–2014+',
  description:
    'Underbarrel 40mm for M4/M16. High-explosive and HEDP for compounds, grape huts, and machine-gun nests. Damage models blast/fragmentation at impact, not kinetic bullet falloff.',
  aliases: ['M203A2'],
};

// ---------------------------------------------------------------------------
// Catalog indexes
// ---------------------------------------------------------------------------

/** @type {WeaponDefinition[]} */
export const WEAPONS = [
  // US / Coalition service
  M4A1,
  M16A4,
  MK18_CQBR,
  M249_SAW,
  M240B,
  M9,
  M1911A1,
  MP5A3,
  M203,
  L85A2,
  C8_SFW,
  G36,
  // Marksman / sniper
  M14_EBR,
  M24_SWS,
  M110_SASS,
  MK12_SPR,
  M107,
  L115A3,
  // OPFOR
  AKM,
  AK74,
  AKS74U,
  RPK,
  RPK74,
  PKM,
  SVD,
  MAKAROV,
  TT33,
  SKS,
  LeeEnfield_No4,
];

/** @type {Record<string, WeaponDefinition>} */
export const WEAPONS_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/** Default player-equippable carbine for Bluefor operators. */
export const DEFAULT_PLAYER_WEAPON = M4A1;

/** Default sidearm for Bluefor operators. */
export const DEFAULT_SIDEARM = M9;

/**
 * Inventory equip slot for a weapon definition.
 * Pistols → sidearm; everything else → primary.
 * @param {WeaponDefinition | { category: string }} weapon
 * @returns {'primary' | 'sidearm'}
 */
export function getWeaponEquipSlot(weapon) {
  return weapon.category === 'pistol' ? 'sidearm' : 'primary';
}

/**
 * @param {string} id
 * @returns {WeaponDefinition | undefined}
 */
export function getWeaponById(id) {
  return WEAPONS_BY_ID[id];
}

/**
 * @param {WeaponFaction} faction
 * @returns {WeaponDefinition[]}
 */
export function getWeaponsByFaction(faction) {
  return WEAPONS.filter((w) => w.faction === faction);
}

/**
 * @param {WeaponCategory} category
 * @returns {WeaponDefinition[]}
 */
export function getWeaponsByCategory(category) {
  return WEAPONS.filter((w) => w.category === category);
}

/**
 * Equippable weapons only (all current entries are equippable; filter kept for future locked items).
 * @returns {WeaponDefinition[]}
 */
export function getEquippableWeapons() {
  return WEAPONS.filter((w) => w.equippable);
}

/**
 * @param {'primary' | 'sidearm'} slot
 * @returns {WeaponDefinition[]}
 */
export function getWeaponsForSlot(slot) {
  return WEAPONS.filter((w) => w.equippable && getWeaponEquipSlot(w) === slot);
}

export default WEAPONS;
