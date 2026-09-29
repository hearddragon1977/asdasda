/**
 * Tactical Gear & Weapon Attachment Catalog
 *
 * Plate carriers, helmets, backpacks, and rail attachments (optics,
 * tactical lights, muzzle devices) used by Bluefor / OPFOR loadouts.
 *
 * Armor coverage maps onto AnatomicalZone ids from src/types/game.ts so
 * the equipment system can gate ballistic trauma before anatomySimulation
 * applies wounds. Attachment modifiers feed WeaponState (ADS, light, signature).
 *
 * Units:
 *   weightKg              — kilograms
 *   armorTier             — NIJ-analogue plate rating (0 = soft / none … 4 = Level IV)
 *   protectionFactor      — 0–1 chance to defeat a round after tier vs penetration check
 *   capacityKg            — backpack carry budget
 *   encumbrancePenalty    — multiplicative move-speed drag (0 = none, 0.25 = −25%)
 *   adsZoom               — FOV / camera zoom multiplier while ADS (>1 = tighter)
 *   soundSignature        — relative audible muzzle blast (1 = unsuppressed)
 *   muzzleFlashScale      — relative muzzle flash intensity (1 = open muzzle)
 */

/** @typedef {'vest' | 'helmet' | 'backpack' | 'optic' | 'flashlight' | 'muzzle'} GearCategory */
/** @typedef {'equipment' | 'attachment'} GearKind */
/** @typedef {'IIA' | 'II' | 'IIIA' | 'III' | 'IV' | 'soft' | 'none'} ArmorRatingLabel */

/**
 * Anatomical zones covered by body armor / helmets.
 * Must stay aligned with AnatomicalZone in src/types/game.ts.
 * @typedef {(
 *   'head_brain' | 'head_carotid' | 'head_facial' |
 *   'torso_heart' | 'torso_lungs' | 'torso_abdomen' | 'torso_spine' |
 *   'junctional_groin' | 'junctional_axilla' |
 *   'limb_arm_left' | 'limb_arm_right' | 'limb_leg_left' | 'limb_leg_right'
 * )} GearAnatomicalZone
 */

/**
 * @typedef {Object} PlateCarrierStats
 * @property {number} armorTier                 0–4 NIJ-analogue plate tier
 * @property {ArmorRatingLabel} ratingLabel
 * @property {GearAnatomicalZone[]} coveredZones  Hitboxes the plates/soft armor protect
 * @property {number} protectionFactor          Base stop chance once tier check passes (0–1)
 * @property {number} bluntTraumaBleedMul       Residual bleed multiplier on non-penetrating hits
 * @property {boolean} coversJunctionalAxilla   Whether side plates / cummerbund cover axilla
 */

/**
 * @typedef {Object} HelmetStats
 * @property {number} craniumProtection         0–1 stop chance for head_brain
 * @property {number} faceProtection            0–1 stop / deflect chance for head_facial
 * @property {number} carotidProtection         0–1 stop chance for head_carotid (mandible / nape)
 * @property {number} armorTier                 Shell hardness tier (typically 1–2)
 * @property {ArmorRatingLabel} ratingLabel
 */

/**
 * @typedef {Object} BackpackStats
 * @property {number} capacityKg                Max carried mass
 * @property {number} capacitySlots             Discrete inventory slots
 * @property {number} encumbrancePenalty        Move-speed penalty fraction (0–1)
 * @property {number} staminaDrainMul           Relative stamina / sprint drain (1 = baseline)
 */

/**
 * @typedef {Object} OpticStats
 * @property {number} adsZoom                   Zoom multiplier while aiming down sights
 * @property {'iron' | 'red_dot' | 'holo' | 'lpvo' | 'acog' | 'scope'} reticle
 * @property {number} adsTransitionSec          Time to shoulder / clear optic
 * @property {number} swayReduction             0–1 reduction to aim sway while ADS
 * @property {number} eyeReliefMm
 */

/**
 * @typedef {Object} FlashlightStats
 * @property {number} intensity                 SpotLight intensity (Three.js units)
 * @property {number} rangeM                    Beam reach in metres
 * @property {number} coneAngleDeg              Spot penumbra cone half-angle
 * @property {number} color                     Hex color (e.g. 0xfff2cc)
 * @property {boolean} strobeCapable
 */

/**
 * @typedef {Object} MuzzleDeviceStats
 * @property {number} soundSignature            Relative audible blast (suppressor < 1)
 * @property {number} muzzleFlashScale          Relative flash (suppressor ≈ 0.05–0.2)
 * @property {number} hearingRangeMul           AI / spatial-audio detection radius mul
 * @property {number} velocityLossMps           Muzzle velocity lost to device (suppressors)
 * @property {boolean} isSuppressor
 */

/**
 * @typedef {Object} GearDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {GearCategory} category
 * @property {GearKind} kind
 * @property {number} weightKg
 * @property {string} faction                   'US' | 'Coalition' | 'OPFOR' | 'Universal'
 * @property {string} description
 * @property {boolean} equippable
 * @property {PlateCarrierStats} [vest]
 * @property {HelmetStats} [helmet]
 * @property {BackpackStats} [backpack]
 * @property {OpticStats} [optic]
 * @property {FlashlightStats} [flashlight]
 * @property {MuzzleDeviceStats} [muzzle]
 * @property {string[]} [aliases]
 */

/** Soft / unarmored torso zones a plate carrier typically covers. */
export const PLATE_CARRIER_ZONES = Object.freeze([
  'torso_heart',
  'torso_lungs',
  'torso_abdomen',
  'torso_spine',
]);

/** Zones protected by a full-cut ballistic helmet + mandible. */
export const HELMET_ZONE_MAP = Object.freeze({
  head_brain: 'craniumProtection',
  head_facial: 'faceProtection',
  head_carotid: 'carotidProtection',
});

/** Slot names used by the equipment inventory system. */
export const EQUIPMENT_SLOTS = Object.freeze(['vest', 'helmet', 'backpack']);
export const ATTACHMENT_SLOTS = Object.freeze(['optic', 'flashlight', 'muzzle']);

/** NIJ-analogue tier → minimum armorPenetration a round needs to threaten plates. */
export const ARMOR_TIER_THRESHOLDS = Object.freeze({
  0: 0.0,
  1: 0.25,
  2: 0.4,
  3: 0.55,
  4: 0.75,
});

// ---------------------------------------------------------------------------
// Plate carriers / vests
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const IOTV_GEN2 = {
  id: 'iotv_gen2',
  name: 'IOTV Gen II + ESAPI',
  shortName: 'IOTV',
  category: 'vest',
  kind: 'equipment',
  weightKg: 12.5,
  faction: 'US',
  equippable: true,
  description:
    'Improved Outer Tactical Vest with front/back ESAPI plates and soft armor. Covers primary thoracic hitboxes; axilla remains a known junctional gap without side plates.',
  vest: {
    armorTier: 4,
    ratingLabel: 'IV',
    coveredZones: [...PLATE_CARRIER_ZONES],
    protectionFactor: 0.92,
    bluntTraumaBleedMul: 0.12,
    coversJunctionalAxilla: false,
  },
};

/** @type {GearDefinition} */
export const CIRAS_LAND = {
  id: 'ciras_land',
  name: 'CIRAS Land Plate Carrier',
  shortName: 'CIRAS',
  category: 'vest',
  kind: 'equipment',
  weightKg: 8.2,
  faction: 'US',
  equippable: true,
  description:
    'SOF plate carrier with SAPI/ESAPI pockets and modular cummerbund. Lighter than IOTV; optional soft side panels close the axillary gap.',
  vest: {
    armorTier: 3,
    ratingLabel: 'III',
    coveredZones: [...PLATE_CARRIER_ZONES, 'junctional_axilla'],
    protectionFactor: 0.85,
    bluntTraumaBleedMul: 0.18,
    coversJunctionalAxilla: true,
  },
};

/** @type {GearDefinition} */
export const MBAV = {
  id: 'mbav',
  name: 'MBAV Plate Carrier',
  shortName: 'MBAV',
  category: 'vest',
  kind: 'equipment',
  weightKg: 7.4,
  faction: 'US',
  equippable: true,
  description:
    'Modular Body Armor Vest — scalable plate carrier common with Marine / SOF elements. Front/back hard plates only unless soft armor inserts fitted.',
  vest: {
    armorTier: 3,
    ratingLabel: 'III',
    coveredZones: ['torso_heart', 'torso_lungs', 'torso_spine'],
    protectionFactor: 0.82,
    bluntTraumaBleedMul: 0.2,
    coversJunctionalAxilla: false,
  },
};

/** @type {GearDefinition} */
export const SIXB45_VEST = {
  id: '6b45',
  name: '6B45 Ratnik Vest',
  shortName: '6B45',
  category: 'vest',
  kind: 'equipment',
  weightKg: 10.5,
  faction: 'OPFOR',
  equippable: true,
  description:
    'Russian Ratnik-era modular vest with ceramic plates. Broad torso coverage; used as analogue for well-equipped OPFOR heavy infantry.',
  vest: {
    armorTier: 3,
    ratingLabel: 'III',
    coveredZones: [...PLATE_CARRIER_ZONES],
    protectionFactor: 0.8,
    bluntTraumaBleedMul: 0.22,
    coversJunctionalAxilla: false,
  },
};

/** @type {GearDefinition} */
export const CHEST_RIG_LIGHT = {
  id: 'chest_rig_light',
  name: 'Lightweight Chest Rig',
  shortName: 'Chest Rig',
  category: 'vest',
  kind: 'equipment',
  weightKg: 1.8,
  faction: 'Universal',
  equippable: true,
  description:
    'Magazine chest rig with no ballistic plates. Zero trauma protection — mag/load carriage only.',
  vest: {
    armorTier: 0,
    ratingLabel: 'none',
    coveredZones: [],
    protectionFactor: 0,
    bluntTraumaBleedMul: 1,
    coversJunctionalAxilla: false,
  },
};

// ---------------------------------------------------------------------------
// Helmets
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const ACH_MICH = {
  id: 'ach_mich',
  name: 'ACH / MICH Ballistic Helmet',
  shortName: 'ACH',
  category: 'helmet',
  kind: 'equipment',
  weightKg: 1.5,
  faction: 'US',
  equippable: true,
  description:
    'Advanced Combat Helmet. Strong cranium shell; open face and limited carotid/nape coverage.',
  helmet: {
    craniumProtection: 0.78,
    faceProtection: 0.08,
    carotidProtection: 0.18,
    armorTier: 2,
    ratingLabel: 'IIIA',
  },
};

/** @type {GearDefinition} */
export const FAST_HIGH_CUT = {
  id: 'fast_high_cut',
  name: 'FAST High-Cut Helmet',
  shortName: 'FAST',
  category: 'helmet',
  kind: 'equipment',
  weightKg: 1.1,
  faction: 'US',
  equippable: true,
  description:
    'High-cut SOF helmet optimized for comms headsets. Slightly less cranial coverage than ACH; face still unprotected without a visor.',
  helmet: {
    craniumProtection: 0.7,
    faceProtection: 0.05,
    carotidProtection: 0.1,
    armorTier: 2,
    ratingLabel: 'IIIA',
  },
};

/** @type {GearDefinition} */
export const OPS_CORE_MANDIBLE = {
  id: 'ops_core_mandible',
  name: 'Ops-Core + Mandible Guard',
  shortName: 'Ops-Core+',
  category: 'helmet',
  kind: 'equipment',
  weightKg: 2.1,
  faction: 'US',
  equippable: true,
  description:
    'Ballistic helmet with mandible / face guard. Improves facial and carotid hitbox protection at the cost of weight and situational awareness.',
  helmet: {
    craniumProtection: 0.8,
    faceProtection: 0.62,
    carotidProtection: 0.55,
    armorTier: 2,
    ratingLabel: 'IIIA',
  },
};

/** @type {GearDefinition} */
export const PASGT = {
  id: 'pasgt',
  name: 'PASGT Helmet',
  shortName: 'PASGT',
  category: 'helmet',
  kind: 'equipment',
  weightKg: 1.9,
  faction: 'Coalition',
  equippable: true,
  description:
    'Legacy Kevlar PASGT shell still fielded by partner forces. Decent cranial coverage, minimal face protection.',
  helmet: {
    craniumProtection: 0.65,
    faceProtection: 0.1,
    carotidProtection: 0.22,
    armorTier: 1,
    ratingLabel: 'II',
  },
};

/** @type {GearDefinition} */
export const SIXB47_HELMET = {
  id: '6b47',
  name: '6B47 Ratnik Helmet',
  shortName: '6B47',
  category: 'helmet',
  kind: 'equipment',
  weightKg: 1.25,
  faction: 'OPFOR',
  equippable: true,
  description: 'Russian Ratnik combat helmet with rail mounts. Mid-tier cranial protection.',
  helmet: {
    craniumProtection: 0.68,
    faceProtection: 0.06,
    carotidProtection: 0.15,
    armorTier: 2,
    ratingLabel: 'IIIA',
  },
};

// ---------------------------------------------------------------------------
// Backpacks
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const ASSAULT_PACK_3DAY = {
  id: 'assault_pack_3day',
  name: '3-Day Assault Pack',
  shortName: '3-Day Pack',
  category: 'backpack',
  kind: 'equipment',
  weightKg: 1.4,
  faction: 'US',
  equippable: true,
  description: 'Compact assault pack for IFAK overflow, water, and demo. Light encumbrance.',
  backpack: {
    capacityKg: 18,
    capacitySlots: 8,
    encumbrancePenalty: 0.04,
    staminaDrainMul: 1.05,
  },
};

/** @type {GearDefinition} */
export const MOLLE_RUCK_LARGE = {
  id: 'molle_ruck_large',
  name: 'MOLLE Large Rucksack',
  shortName: 'Large Ruck',
  category: 'backpack',
  kind: 'equipment',
  weightKg: 3.2,
  faction: 'US',
  equippable: true,
  description:
    'Full-size MOLLE ruck for sustained patrols. High capacity with noticeable movement drag.',
  backpack: {
    capacityKg: 45,
    capacitySlots: 18,
    encumbrancePenalty: 0.14,
    staminaDrainMul: 1.25,
  },
};

/** @type {GearDefinition} */
export const HYDRATION_CARRIER = {
  id: 'hydration_carrier',
  name: 'Hydration Carrier',
  shortName: 'Hydration',
  category: 'backpack',
  kind: 'equipment',
  weightKg: 0.6,
  faction: 'Universal',
  equippable: true,
  description: 'Minimal bladder carrier. Tiny cargo budget, negligible encumbrance.',
  backpack: {
    capacityKg: 4,
    capacitySlots: 2,
    encumbrancePenalty: 0.01,
    staminaDrainMul: 1.0,
  },
};

/** @type {GearDefinition} */
export const OPFOR_DAYPACK = {
  id: 'opfor_daypack',
  name: 'OPFOR Daypack',
  shortName: 'Daypack',
  category: 'backpack',
  kind: 'equipment',
  weightKg: 1.1,
  faction: 'OPFOR',
  equippable: true,
  description: 'Civilian / surplus daypack common on insurgent fighters. Modest capacity.',
  backpack: {
    capacityKg: 14,
    capacitySlots: 6,
    encumbrancePenalty: 0.06,
    staminaDrainMul: 1.08,
  },
};

// ---------------------------------------------------------------------------
// Optics
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const AIMPOINT_T2 = {
  id: 'aimpoint_t2',
  name: 'Aimpoint Micro T-2',
  shortName: 'T-2',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.1,
  faction: 'US',
  equippable: true,
  description: '1× red-dot. Fast ADS, minimal zoom — CQB / carbine standard.',
  optic: {
    adsZoom: 1.15,
    reticle: 'red_dot',
    adsTransitionSec: 0.18,
    swayReduction: 0.12,
    eyeReliefMm: 0,
  },
};

/** @type {GearDefinition} */
export const EOTECH_EXPS3 = {
  id: 'eotech_exps3',
  name: 'EOTech EXPS3',
  shortName: 'EXPS3',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.32,
  faction: 'US',
  equippable: true,
  description: 'Holographic 1× sight with 68 MOA ring / 1 MOA dot reticle behaviour.',
  optic: {
    adsZoom: 1.2,
    reticle: 'holo',
    adsTransitionSec: 0.2,
    swayReduction: 0.1,
    eyeReliefMm: 0,
  },
};

/** @type {GearDefinition} */
export const ACOG_TA31 = {
  id: 'acog_ta31',
  name: 'Trijicon ACOG TA31',
  shortName: 'ACOG',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.44,
  faction: 'US',
  equippable: true,
  description: '4× fixed magnification. Strong mid-range ADS zoom and reticle holdovers.',
  optic: {
    adsZoom: 2.4,
    reticle: 'acog',
    adsTransitionSec: 0.32,
    swayReduction: 0.28,
    eyeReliefMm: 38,
  },
};

/** @type {GearDefinition} */
export const LPVO_1_6 = {
  id: 'lpvo_1_6',
  name: '1-6× LPVO',
  shortName: 'LPVO',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.65,
  faction: 'Coalition',
  equippable: true,
  description: 'Low-power variable optic. Defaulted to mid zoom for general-purpose carbine use.',
  optic: {
    adsZoom: 2.0,
    reticle: 'lpvo',
    adsTransitionSec: 0.28,
    swayReduction: 0.22,
    eyeReliefMm: 90,
  },
};

/** @type {GearDefinition} */
export const IRON_SIGHTS = {
  id: 'iron_sights',
  name: 'Backup Iron Sights',
  shortName: 'Irons',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.08,
  faction: 'Universal',
  equippable: true,
  description: 'Flip-up or fixed irons. Baseline ADS with no magnification.',
  optic: {
    adsZoom: 1.05,
    reticle: 'iron',
    adsTransitionSec: 0.15,
    swayReduction: 0.05,
    eyeReliefMm: 0,
  },
};

/** @type {GearDefinition} */
export const PSO1 = {
  id: 'pso1',
  name: 'PSO-1 Scope',
  shortName: 'PSO-1',
  category: 'optic',
  kind: 'attachment',
  weightKg: 0.6,
  faction: 'OPFOR',
  equippable: true,
  description: '4× Soviet/Russian optic common on SVD and designated-marksman rifles.',
  optic: {
    adsZoom: 2.5,
    reticle: 'scope',
    adsTransitionSec: 0.35,
    swayReduction: 0.3,
    eyeReliefMm: 68,
  },
};

// ---------------------------------------------------------------------------
// Tactical lights
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const SUREFIRE_M300 = {
  id: 'surefire_m300',
  name: 'SureFire M300 Mini Scout',
  shortName: 'M300',
  category: 'flashlight',
  kind: 'attachment',
  weightKg: 0.1,
  faction: 'US',
  equippable: true,
  description: 'Compact rail light. Tight focused beam for compound clearing.',
  flashlight: {
    intensity: 2.4,
    rangeM: 28,
    coneAngleDeg: 22,
    color: 0xfff5e0,
    strobeCapable: false,
  },
};

/** @type {GearDefinition} */
export const SUREFIRE_M600 = {
  id: 'surefire_m600',
  name: 'SureFire M600 Scout Light',
  shortName: 'M600',
  category: 'flashlight',
  kind: 'attachment',
  weightKg: 0.14,
  faction: 'US',
  equippable: true,
  description: 'Full-size weapon light with wide flood for dark interiors and night patrols.',
  flashlight: {
    intensity: 3.6,
    rangeM: 40,
    coneAngleDeg: 28,
    color: 0xfff2cc,
    strobeCapable: true,
  },
};

/** @type {GearDefinition} */
export const PEQ15_ILLUMINATOR = {
  id: 'peq15_illuminator',
  name: 'AN/PEQ-15 Illuminator',
  shortName: 'PEQ-15',
  category: 'flashlight',
  kind: 'attachment',
  weightKg: 0.21,
  faction: 'US',
  equippable: true,
  description:
    'IR/visible illuminator mode treated as a narrow tactical light source for night environments.',
  flashlight: {
    intensity: 1.8,
    rangeM: 55,
    coneAngleDeg: 14,
    color: 0xddeeff,
    strobeCapable: false,
  },
};

/** @type {GearDefinition} */
export const CHEAP_WEAPON_LIGHT = {
  id: 'cheap_weapon_light',
  name: 'Improvised Weapon Light',
  shortName: 'Wpn Light',
  category: 'flashlight',
  kind: 'attachment',
  weightKg: 0.12,
  faction: 'OPFOR',
  equippable: true,
  description: 'Civilian flashlight taped / clamped to a handguard. Dimmer, wider spill.',
  flashlight: {
    intensity: 1.4,
    rangeM: 18,
    coneAngleDeg: 35,
    color: 0xffe8b0,
    strobeCapable: false,
  },
};

// ---------------------------------------------------------------------------
// Muzzle devices
// ---------------------------------------------------------------------------

/** @type {GearDefinition} */
export const A2_FLASH_HIDER = {
  id: 'a2_flash_hider',
  name: 'A2 Birdcage Flash Hider',
  shortName: 'A2 FH',
  category: 'muzzle',
  kind: 'attachment',
  weightKg: 0.08,
  faction: 'US',
  equippable: true,
  description: 'Standard A2 flash hider. Mild flash reduction, full acoustic signature.',
  muzzle: {
    soundSignature: 1.0,
    muzzleFlashScale: 0.55,
    hearingRangeMul: 1.0,
    velocityLossMps: 0,
    isSuppressor: false,
  },
};

/** @type {GearDefinition} */
export const SOCOM556_RC2 = {
  id: 'socom556_rc2',
  name: 'SureFire SOCOM556-RC2',
  shortName: 'RC2',
  category: 'muzzle',
  kind: 'attachment',
  weightKg: 0.49,
  faction: 'US',
  equippable: true,
  description:
    'Quick-detach 5.56 suppressor. Cuts muzzle flash nearly to zero and shrinks sound propagation / AI hearing radius.',
  muzzle: {
    soundSignature: 0.28,
    muzzleFlashScale: 0.08,
    hearingRangeMul: 0.35,
    velocityLossMps: 18,
    isSuppressor: true,
  },
};

/** @type {GearDefinition} */
export const NT4_SUPPRESSOR = {
  id: 'nt4_suppressor',
  name: 'Knight\'s Armament NT4',
  shortName: 'NT4',
  category: 'muzzle',
  kind: 'attachment',
  weightKg: 0.68,
  faction: 'US',
  equippable: true,
  description: 'Classic QD suppressor. Strong signature reduction for SOF carbines.',
  muzzle: {
    soundSignature: 0.32,
    muzzleFlashScale: 0.1,
    hearingRangeMul: 0.4,
    velocityLossMps: 22,
    isSuppressor: true,
  },
};

/** @type {GearDefinition} */
export const PBS1_SUPPRESSOR = {
  id: 'pbs1_suppressor',
  name: 'PBS-1 Suppressor',
  shortName: 'PBS-1',
  category: 'muzzle',
  kind: 'attachment',
  weightKg: 0.55,
  faction: 'OPFOR',
  equippable: true,
  description: 'AK-pattern wiper suppressor. Reduces flash and hearing range for OPFOR stealth elements.',
  muzzle: {
    soundSignature: 0.4,
    muzzleFlashScale: 0.15,
    hearingRangeMul: 0.48,
    velocityLossMps: 30,
    isSuppressor: true,
  },
};

/** @type {GearDefinition} */
export const AK_MUZZLE_BRAKE = {
  id: 'ak_muzzle_brake',
  name: 'AK Compensator / Brake',
  shortName: 'AK Brake',
  category: 'muzzle',
  kind: 'attachment',
  weightKg: 0.12,
  faction: 'OPFOR',
  equippable: true,
  description: 'Standard AK muzzle brake. Increases flash and blast; no signature reduction.',
  muzzle: {
    soundSignature: 1.15,
    muzzleFlashScale: 1.25,
    hearingRangeMul: 1.1,
    velocityLossMps: 0,
    isSuppressor: false,
  },
};

// ---------------------------------------------------------------------------
// Catalog indexes
// ---------------------------------------------------------------------------

/** @type {GearDefinition[]} */
export const GEAR = [
  // Vests
  IOTV_GEN2,
  CIRAS_LAND,
  MBAV,
  SIXB45_VEST,
  CHEST_RIG_LIGHT,
  // Helmets
  ACH_MICH,
  FAST_HIGH_CUT,
  OPS_CORE_MANDIBLE,
  PASGT,
  SIXB47_HELMET,
  // Backpacks
  ASSAULT_PACK_3DAY,
  MOLLE_RUCK_LARGE,
  HYDRATION_CARRIER,
  OPFOR_DAYPACK,
  // Optics
  AIMPOINT_T2,
  EOTECH_EXPS3,
  ACOG_TA31,
  LPVO_1_6,
  IRON_SIGHTS,
  PSO1,
  // Lights
  SUREFIRE_M300,
  SUREFIRE_M600,
  PEQ15_ILLUMINATOR,
  CHEAP_WEAPON_LIGHT,
  // Muzzle
  A2_FLASH_HIDER,
  SOCOM556_RC2,
  NT4_SUPPRESSOR,
  PBS1_SUPPRESSOR,
  AK_MUZZLE_BRAKE,
];

/** @type {Record<string, GearDefinition>} */
export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

/** Default Bluefor rifleman loadout piece ids. */
export const DEFAULT_PLAYER_GEAR_IDS = Object.freeze({
  vest: IOTV_GEN2.id,
  helmet: ACH_MICH.id,
  backpack: ASSAULT_PACK_3DAY.id,
  optic: AIMPOINT_T2.id,
  flashlight: SUREFIRE_M600.id,
  muzzle: A2_FLASH_HIDER.id,
});

/** Default OPFOR rifleman loadout piece ids. */
export const DEFAULT_OPFOR_GEAR_IDS = Object.freeze({
  vest: CHEST_RIG_LIGHT.id,
  helmet: PASGT.id,
  backpack: OPFOR_DAYPACK.id,
  optic: IRON_SIGHTS.id,
  flashlight: null,
  muzzle: AK_MUZZLE_BRAKE.id,
});

/**
 * Inventory-facing view of a catalog entry.
 * Adds the slot / protection / ammo fields the loadout UI reads.
 * @param {GearDefinition | null | undefined} item
 * @returns {GearDefinition & { slot: string, protection: number, ammoBonusMags?: number }}
 */
function inventoryView(item) {
  const source = item || {};
  const slot = source.slot || source.category || 'vest';
  const protection =
    source.protection ??
    source.helmet?.craniumProtection ??
    source.vest?.protectionFactor ??
    0;
  const ammoBonusMags =
    source.ammoBonusMags ??
    (source.backpack ? Math.max(0, Math.round((source.backpack.capacitySlots ?? 0) / 4)) : undefined);
  return { ...source, slot, protection, ammoBonusMags };
}

/**
 * @param {string | null | undefined} id
 * @returns {(GearDefinition & { slot: string, protection: number, ammoBonusMags?: number }) | undefined}
 */
export function getGearById(id) {
  if (!id) return undefined;
  const item = GEAR_BY_ID[id];
  if (!item) return undefined;
  return inventoryView(item);
}

/** Inventory modal aliases for the Afghanistan-era worn kit. */
export const DEFAULT_HELMET = inventoryView(ACH_MICH);
export const DEFAULT_VEST = inventoryView(IOTV_GEN2);
export const DEFAULT_BACKPACK = inventoryView(ASSAULT_PACK_3DAY);

/**
 * @param {string} slot
 * @returns {Array<GearDefinition & { slot: string, protection: number, ammoBonusMags?: number }>}
 */
export function getGearBySlot(slot) {
  return GEAR.filter((item) => item.kind === 'equipment' && (item.slot || item.category) === slot).map((item) =>
    inventoryView(item)
  );
}

/**
 * @param {GearCategory} category
 * @returns {GearDefinition[]}
 */
export function getGearByCategory(category) {
  return GEAR.filter((g) => g.category === category);
}

/**
 * @param {GearKind} kind
 * @returns {GearDefinition[]}
 */
export function getGearByKind(kind) {
  return GEAR.filter((g) => g.kind === kind);
}

/**
 * @returns {GearDefinition[]}
 */
export function getEquippableGear() {
  return GEAR.filter((g) => g.equippable);
}

/**
 * Whether an item id belongs in an equipment body slot or a weapon rail slot.
 * @param {string} id
 * @returns {'vest' | 'helmet' | 'backpack' | 'optic' | 'flashlight' | 'muzzle' | null}
 */
export function resolveSlotForGear(id) {
  const def = getGearById(id);
  if (!def) return null;
  return def.category;
}

export default GEAR;
