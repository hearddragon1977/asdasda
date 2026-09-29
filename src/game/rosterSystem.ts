import { OperatorRecord, PlayerVitals } from '../types/game';

const FIRST_NAMES = [
  'Marcus', 'David', 'Cole', 'Wyatt', 'Tyler', 'Elena', 'Sarah', 'Jackson', 'Nathan',
  'Lucas', 'Liam', 'Owen', 'Zachary', 'Sean', 'Travis', 'Garrett', 'Ethan', 'Austin'
];

const LAST_NAMES = [
  'Vance', 'Miller', 'Cross', 'Kowalski', 'Holloway', 'Blackwood', 'Donovan', 'Mercer',
  'Stone', 'Reyes', 'Gallagher', 'Novak', 'Preston', 'Hayes', 'Sinclair', 'Strickland'
];

const CALLSIGNS = [
  'Specter-1', 'Ironclad', 'Ghost-Actual', 'Reaper-6', 'Viper-2', 'Dustoff-Lead',
  'Raven-4', 'Warhound', 'Apex-Actual', 'Paladin-3', 'Copperhead', 'Echo-Actual'
];

const RANKS = [
  'Staff Sergeant', 'Sergeant', 'Corporal', 'Captain', 'Master Sergeant', 'Lieutenant'
];

const UNITS = [
  '1st Marine Raider Battalion, MARSOC',
  '75th Ranger Regiment, 3rd Battalion',
  '22nd Special Air Service, B Squadron',
  'Naval Special Warfare Development Group (DEVGRU)',
  'Special Forces Operational Detachment-Delta'
];

const BLOOD_TYPES: ('O-' | 'O+' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+')[] = [
  'O-', 'O+', 'A+', 'A-', 'B+', 'B-', 'AB+'
];

export class RosterManager {
  public activeOperator: OperatorRecord;
  public memorialRoster: OperatorRecord[] = [];

  constructor() {
    this.activeOperator = this.generateRandomOperator();
  }

  public generateRandomOperator(): OperatorRecord {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const callsign = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const unit = UNITS[Math.floor(Math.random() * UNITS.length)];
    const bloodType = BLOOD_TYPES[Math.floor(Math.random() * BLOOD_TYPES.length)];

    return {
      id: `op-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${first} ${last}`,
      callsign,
      nickname: callsign,
      isScout: true, // Has Scout / Recon qualification for rapid map reading
      rank,
      unit,
      bloodType,
      status: 'active',
      deployments: 1, // Real initial deployment
      hostilesEliminated: 0, // Starts at 0, accurately incremented per kill
      careerKills: 0,
      careerDeaths: 0,
      injuriesSustained: [],
      purpleHeartAwarded: false,
      timestamp: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }

  /**
   * Evaluates after-action disposition when CASEVAC extracts or player dies
   */
  public processCasualtyOutcome(
    vitals: PlayerVitals,
    woundsCount: number,
    woundDescriptions: string[],
    extracted: boolean
  ): { status: 'active' | 'dia' | 'medically_discharged'; reason: string; awardPurpleHeart: boolean } {
    this.activeOperator.injuriesSustained = [...(woundDescriptions ?? [])];
    const bloodVolume = vitals?.bloodVolume ?? 0;
    const shockStage = vitals?.shockStage;

    // Permadeath (Dead In Action)
    if (!extracted || shockStage === 'cardiac_arrest' || bloodVolume <= 1500) {
      this.activeOperator.status = 'dia';
      this.activeOperator.dischargeReason = 'Killed In Action (KIA) - Irreversible Hypovolemic Exsanguination / Cranial Breach';
      this.activeOperator.purpleHeartAwarded = true;
      this.memorialRoster.unshift({ ...this.activeOperator });

      return {
        status: 'dia',
        reason: 'Casualty expired prior to surgical resuscitation. Body recovered.',
        awardPurpleHeart: true,
      };
    }

    // Extracted alive: Check for Permanent Medical Consequences
    if (vitals?.paralyzed) {
      this.activeOperator.status = 'medically_discharged';
      this.activeOperator.dischargeReason = 'Permanent Honorable Medical Discharge - Bilateral Lower Extremity Paraplegia (Spinal Cord Severance)';
      this.activeOperator.purpleHeartAwarded = true;
      this.memorialRoster.unshift({ ...this.activeOperator });

      return {
        status: 'medically_discharged',
        reason: 'Extracted alive. Surgical stabilization successful, but thoracic vertebral transection results in permanent paraplegia. Relieved of duty.',
        awardPurpleHeart: true,
      };
    }

    if (woundsCount >= 3 || bloodVolume < 3000) {
      this.activeOperator.status = 'medically_discharged';
      this.activeOperator.dischargeReason = 'Honorable Medical Discharge - Catastrophic Extremity Ischemia & Traumatic Vascular Rupture';
      this.activeOperator.purpleHeartAwarded = true;
      this.memorialRoster.unshift({ ...this.activeOperator });

      return {
        status: 'medically_discharged',
        reason: 'Casualty stabilized at Role 3 Field Hospital. Vascular trauma requires prolonged reconstructive limb salvage. Medically retired.',
        awardPurpleHeart: true,
      };
    }

    // Survived with minor trauma
    this.activeOperator.status = 'active';
    this.activeOperator.deployments += 1;
    return {
      status: 'active',
      reason: 'Wounds stabilized. Operator returned to ready rotation after triage.',
      awardPurpleHeart: woundDescriptions.length > 0,
    };
  }

  /**
   * Enrolls a brand-new recruit when predecessor is KIA or Medically Discharged
   */
  public enlistNextRecruit(): OperatorRecord {
    this.activeOperator = this.generateRandomOperator();
    return this.activeOperator;
  }
}

export const rosterManager = new RosterManager();
