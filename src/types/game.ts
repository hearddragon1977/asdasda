export type AnatomicalZone =
  | 'head_brain'
  | 'head_carotid'
  | 'head_facial'
  | 'torso_heart'
  | 'torso_lungs'
  | 'torso_abdomen'
  | 'torso_spine'
  | 'junctional_groin'
  | 'junctional_axilla'
  | 'limb_arm_left'
  | 'limb_arm_right'
  | 'limb_leg_left'
  | 'limb_leg_right';

export type WoundType = 'arterial' | 'venous' | 'organ_damage' | 'skeletal_paralysis';

export interface AnatomicalWound {
  id: string;
  zone: AnatomicalZone;
  name: string;
  type: WoundType;
  bleedingRate: number; // mL/second
  tourniquetApplied: boolean;
  packedStatus: 'none' | 'combat_gauze' | 'mud_and_spit';
  sealed: boolean; // For chest seal on lungs
  decompressed: boolean; // For ARS needle on pneumothorax
  description: string;
  painLevel: number; // 0 - 100
  timeSinceHit: number;
}

export type ShockStage =
  | 'normal'         // > 4400 mL
  | 'compensated'    // 3800 - 4400 mL
  | 'decompensated'  // 2600 - 3800 mL
  | 'irreversible'   // 1600 - 2600 mL
  | 'cardiac_arrest' // < 1600 mL (DIA)

export interface PlayerVitals {
  bloodVolume: number; // Max 5000 mL
  maxBloodVolume: number;
  heartRate: number; // BPM
  bloodPressureSystolic: number; // mmHg
  bloodPressureDiastolic: number;
  spO2: number; // % oxygen saturation (normal ~98-99%)
  shockStage: ShockStage;
  paralyzed: boolean; // Spinal trauma: lower body paralyzed, cannot run/stand, falls to prone crawl
  limping: boolean; // Leg wound or TQ applied
  severeSway: boolean; // Arm wound
  tinnitusDuration: number; // seconds of ringing
  hypoxiaLevel: number; // 0 - 100
}

export interface MedicalKit {
  tourniquets: number; // CAT Gen 7
  chestSeals: number; // Vented HyFin
  decompressionNeedles: number; // 14G ARS
  hemostaticGauze: number; // QuikClot Combat Gauze
  splints: number;
}

/** Body-worn tactical gear slots (src/data/gear.js + src/systems/equipment.js). */
export type EquipmentSlot = 'vest' | 'helmet' | 'backpack';
/** Weapon rail attachment slots. */
export type AttachmentSlot = 'optic' | 'flashlight' | 'muzzle';
export type GearReticle = 'iron' | 'red_dot' | 'holo' | 'lpvo' | 'acog' | 'scope';

export interface WeaponAttachmentsState {
  opticId: string | null;
  flashlightId: string | null;
  muzzleId: string | null;
}

export interface EquipmentSlotsState {
  vest: string | null;
  helmet: string | null;
  backpack: string | null;
}

export interface AttachmentSlotsState {
  optic: string | null;
  flashlight: string | null;
  muzzle: string | null;
}

/** Snapshot of a unit's worn gear + rail devices for React / AI sync. */
export interface UnitLoadoutState {
  unitId: string;
  equipment: EquipmentSlotsState;
  attachments: AttachmentSlotsState;
  inventory: { id: string; qty?: number }[];
  carriedWeightKg: number;
  capacityKg: number;
  encumbrancePenalty: number;
  moveSpeedMultiplier: number;
}

export interface WeaponState {
  currentMagRounds: number; // max 30
  chambered: boolean;
  reserveMags: number[]; // e.g. [30, 28, 15, 0]
  reserveRounds?: number; // total loose reserve rounds
  isReloading: boolean;
  isInspectingMag: boolean;
  magCheckInspectionText: string | null;
  aimingDownSights: boolean;
  tacticalLaser: boolean;
  tacticalLight: boolean;
  dryFired: boolean;
  /** Rail attachments from equipment system (optic / light / muzzle). */
  attachments?: WeaponAttachmentsState;
  /** ADS zoom multiplier sourced from equipped optic. */
  adsZoom?: number;
  /** Reticle behaviour key from equipped optic. */
  reticle?: GearReticle | string;
  /** Relative muzzle blast loudness (suppressor < 1). */
  soundSignature?: number;
  /** Relative muzzle flash scale (suppressor ≈ 0). */
  muzzleFlashScale?: number;
  /** AI / spatial-audio hearing radius multiplier. */
  hearingRangeMul?: number;
  /** True when a suppressor muzzle device is mounted. */
  isSuppressed?: boolean;
}

export interface CasevacState {
  status: 'idle' | 'calling' | 'inbound' | 'arrived' | 'treating' | 'extracting' | 'extracted' | 'dia';
  smokeDeployed: boolean;
  progress: number; // 0 - 100
  message: string;
  squadMembers: {
    id: string;
    role: string;
    callsign: string;
    status: 'moving' | 'suppressing' | 'treating' | 'ready';
    health: number;
  }[];
  evacuatedCasualties?: {
    id: string;
    name: string;
    callsign: string;
    status: 'WIA' | 'KIA';
    injurySummary: string;
  }[];
  retainedSecurity?: {
    id: string;
    callsign: string;
    role: string;
    health: number;
  }[];
}

export interface OperatorRecord {
  id: string;
  name: string;
  callsign: string;
  nickname?: string;
  isScout?: boolean;
  rank: string;
  unit: string;
  bloodType: 'O-' | 'O+' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+';
  status: 'active' | 'dia' | 'medically_discharged';
  deployments: number;
  hostilesEliminated: number;
  careerKills?: number;
  careerDeaths?: number;
  injuriesSustained: string[];
  dischargeReason?: string;
  purpleHeartAwarded: boolean;
  timestamp: string;
}

export type EnemyAction =
  | 'patrol'
  | 'investigate'
  | 'take_cover'
  | 'suppress'
  | 'flank_left'
  | 'flank_right'
  | 'retreat_heal'
  | 'commander'
  | 'overwatch'
  | 'advance'
  | 'dead';

export interface EnemyCombatant {
  id: string;
  name: string;
  callsign: string;
  role: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  health: number; // 0 - 100
  kills: number;
  deaths: number;
  state: EnemyAction;
  targetPosition: { x: number; y: number; z: number };
  coverPosition?: { x: number; y: number; z: number };
  currentAmmo: number;
  isShooting: boolean;
  lastBark: string;
  lastBarkTime: number;
  alertLevel: 'unaware' | 'suspicious' | 'combat';
  shootCooldown?: number;
  isCommander?: boolean;
  burstCount?: number;
  burstRemaining?: number;
  /** Optional equipment loadout id mirror (managed by equipmentManager). */
  loadout?: UnitLoadoutState;
}

export interface FriendlyCombatant {
  id: string;
  name: string;
  callsign: string;
  role: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  health: number; // 0 - 100
  kills: number;
  deaths: number;
  status: 'ALIVE' | 'WIA' | 'KIA';
  shootCooldown: number;
  targetEnemyId: string | null;
  formationOffset: { x: number; z: number };
  state: 'follow' | 'take_cover' | 'suppress' | 'bounding';
  isShooting: boolean;
  lastBark: string;
  lastBarkTime: number;
  currentAmmo: number;
  /** Optional equipment loadout id mirror (managed by equipmentManager). */
  loadout?: UnitLoadoutState;
}
