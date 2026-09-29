import { AnatomicalZone, AnatomicalWound, PlayerVitals, ShockStage } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';

export interface TraumaHitResult {
  wound: AnatomicalWound;
  instantDeath: boolean;
  message: string;
}

let woundGlobalCounter = 0;

export class AnatomySimulation {
  public wounds: AnatomicalWound[] = [];
  public vitals: PlayerVitals = {
    bloodVolume: 5000,
    maxBloodVolume: 5000,
    heartRate: 72,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    spO2: 99,
    shockStage: 'normal',
    paralyzed: false,
    limping: false,
    severeSway: false,
    tinnitusDuration: 0,
    hypoxiaLevel: 0,
  };

  private lastHeartbeatUpdate = 0;
  private lastBreathingMode: 'normal' | 'heavy' | 'wheezing' = 'normal';

  public reset(): void {
    this.wounds = [];
    this.vitals = {
      bloodVolume: 5000,
      maxBloodVolume: 5000,
      heartRate: 72,
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      spO2: 99,
      shockStage: 'normal',
      paralyzed: false,
      limping: false,
      severeSway: false,
      tinnitusDuration: 0,
      hypoxiaLevel: 0,
    };
    tacticalAudio.setTinnitus(false);
    tacticalAudio.updateBreathing('normal');
  }

  /**
   * Inflicts ballistic trauma on a specific anatomical zone
   */
  public inflictTrauma(zone: AnatomicalZone): TraumaHitResult {
    let bleedRate = 0;
    let name = '';
    let type: AnatomicalWound['type'] = 'venous';
    let description = '';
    let instantDeath = false;
    let isSpineParalysis = false;

    switch (zone) {
      case 'head_brain':
        name = 'Cranial Penetration (Brainstem / Frontal Lobe)';
        type = 'organ_damage';
        bleedRate = 200;
        description = 'Catastrophic cranial destruction. Loss of vital centers.';
        instantDeath = true;
        break;

      case 'head_carotid':
        name = 'Carotid Artery & Jugular Severance';
        type = 'arterial';
        bleedRate = 42; // mL/sec -> 2500 mL loss in ~60 seconds
        description = 'Massive pulsating arterial bleed from neck. Severe sensory loss.';
        this.vitals.tinnitusDuration = 15;
        tacticalAudio.setTinnitus(true);
        break;

      case 'head_facial':
        name = 'Facial Maxillofacial Trauma';
        type = 'venous';
        bleedRate = 12;
        description = 'Heavy blood pooling in airway and facial lacerations.';
        break;

      case 'torso_heart':
        name = 'Thoracic Cavity: Myocardial Rupture';
        type = 'organ_damage';
        bleedRate = 95;
        description = 'Massive internal hemothorax, rapid cardiac tamponade.';
        break;

      case 'torso_lungs':
        name = 'Open Pneumothorax (Sucking Chest Wound)';
        type = 'organ_damage';
        bleedRate = 18;
        description = 'Thoracic cavity breached. Collapsing lung, pleural bubbling.';
        break;

      case 'torso_abdomen':
        name = 'Abdominal Non-Compressible Hemorrhage';
        type = 'organ_damage';
        bleedRate = 24;
        description = 'Mesenteric and hepatic vascular laceration. Deep internal cavity bleed.';
        break;

      case 'torso_spine':
        name = 'Thoracic Vertebral Transection (Spinal Shock)';
        type = 'skeletal_paralysis';
        bleedRate = 16;
        description = 'Spinal cord severed at T8. Complete lower body motor paralysis.';
        isSpineParalysis = true;
        break;

      case 'junctional_groin':
        name = 'Junctional Femoral Inguinal Rupture';
        type = 'arterial';
        bleedRate = 34;
        description = 'High-pressure groin bleed at junctional fold. Cannot fit limb TQ.';
        break;

      case 'junctional_axilla':
        name = 'Junctional Axillary Artery Puncture';
        type = 'arterial';
        bleedRate = 28;
        description = 'Underarm junctional tear beneath body armor. Rapid thoracic seepage.';
        break;

      case 'limb_arm_left':
      case 'limb_arm_right':
        name = zone === 'limb_arm_left' ? 'Left Brachial Artery Laceration' : 'Right Brachial Artery Laceration';
        type = 'arterial';
        bleedRate = 16;
        description = 'Arterial spurting from arm. Severe tremors and weapon instability.';
        this.vitals.severeSway = true;
        break;

      case 'limb_leg_left':
      case 'limb_leg_right':
        name = zone === 'limb_leg_left' ? 'Left Femoral Artery Rupture' : 'Right Femoral Artery Rupture';
        type = 'arterial';
        bleedRate = 32;
        description = 'Catastrophic high-pressure femoral bleed. Severe limp, sprint disabled.';
        this.vitals.limping = true;
        break;

      default: {
        const unknown = String(zone ?? 'unmapped');
        name = `Unrecognized trauma (${unknown})`;
        type = 'venous';
        bleedRate = 0;
        description = 'Hit registered without a mapped anatomical node.';
        break;
      }
    }

    woundGlobalCounter++;
    const uniqueHash = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 9);

    const wound: AnatomicalWound = {
      id: `${zone}-${Date.now()}-${woundGlobalCounter}-${uniqueHash}`,
      zone,
      name,
      type,
      bleedingRate: bleedRate,
      tourniquetApplied: false,
      packedStatus: 'none',
      sealed: false,
      decompressed: false,
      description,
      painLevel: 80,
      timeSinceHit: 0,
    };

    if (instantDeath) {
      this.vitals.bloodVolume = 0;
      this.vitals.heartRate = 0;
      this.vitals.bloodPressureSystolic = 0;
      this.vitals.bloodPressureDiastolic = 0;
      this.vitals.shockStage = 'cardiac_arrest';
    }

    if (isSpineParalysis) {
      this.vitals.paralyzed = true;
    }

    if (!this.wounds.some((w) => w.id === wound.id)) {
      this.wounds.push(wound);
    }

    return {
      wound,
      instantDeath,
      message: instantDeath ? 'LETHAL CRANIAL HIT - IMMEDIATE CESSATION OF VITALS' : `TRAUMA HIT: ${name}`,
    };
  }

  /**
   * Applies CAT Tourniquet to an extremity wound
   */
  public applyTourniquet(woundId: string): boolean {
    const wound = this.wounds.find((w) => w.id === woundId);
    if (!wound) return false;

    // Tourniquets only work on limbs
    if (
      wound.zone === 'limb_arm_left' ||
      wound.zone === 'limb_arm_right' ||
      wound.zone === 'limb_leg_left' ||
      wound.zone === 'limb_leg_right'
    ) {
      wound.tourniquetApplied = true;
      wound.bleedingRate = 0;
      tacticalAudio.playTourniquetRatchet();

      if (wound.zone.includes('leg')) {
        this.vitals.limping = true; // Ischemia and nerve compression causes limping
      }
      if (wound.zone.includes('arm')) {
        this.vitals.severeSway = true;
      }
      return true;
    }
    return false;
  }

  /**
   * Packs non-compressible junctional or abdominal cavity with Combat Gauze
   */
  public packWoundWithGauze(woundId: string): boolean {
    const wound = this.wounds.find((w) => w.id === woundId);
    if (!wound) return false;

    wound.packedStatus = 'combat_gauze';
    wound.bleedingRate = Math.max(0, wound.bleedingRate * 0.15); // Halts 85% of bleed
    tacticalAudio.playMudPackSquelch();
    return true;
  }

  /**
   * Desperate "Mud & Spit" Packing:
   * When out of sterile hemostatic gauze, player scrapes combat dirt/cloth to tamp down junctional cavity.
   */
  public packMudAndSpit(woundId: string): boolean {
    const wound = this.wounds.find((w) => w.id === woundId);
    if (!wound) return false;

    wound.packedStatus = 'mud_and_spit';
    wound.bleedingRate = Math.max(0, wound.bleedingRate * 0.35); // Halts 65% of bleed
    tacticalAudio.playMudPackSquelch();
    return true;
  }

  /**
   * Applies Vented Chest Seal to open lung wound
   */
  public applyChestSeal(woundId: string): boolean {
    const wound = this.wounds.find((w) => w.id === woundId && w.zone === 'torso_lungs');
    if (!wound) return false;

    wound.sealed = true;
    wound.bleedingRate = Math.max(0, wound.bleedingRate * 0.3);
    return true;
  }

  /**
   * Needle Thoracostomy (ARS 14G needle decompression for tension pneumothorax)
   */
  public decompressPneumothorax(woundId: string): boolean {
    const wound = this.wounds.find((w) => w.id === woundId && w.zone === 'torso_lungs');
    if (!wound) return false;

    wound.decompressed = true;
    this.vitals.spO2 = Math.min(96, this.vitals.spO2 + 15);
    tacticalAudio.playBulletCrack(); // Hiss of decompressed pleural air
    return true;
  }

  /**
   * Updates hemodynamics, blood loss, and vital signs per frame
   * dt: delta time in seconds
   */
  public update(dt: number): void {
    if (!this.vitals || !Number.isFinite(dt) || dt <= 0 || this.vitals.shockStage === 'cardiac_arrest') return;

    // Calculate total bleed rate
    let totalBleedRate = 0;
    let hasOpenLungWound = false;
    let openTensionPneumo = false;

    for (const w of this.wounds) {
      if (!w) continue;
      w.timeSinceHit += dt;
      totalBleedRate += Number.isFinite(w.bleedingRate) ? w.bleedingRate : 0;

      if (w.zone === 'torso_lungs') {
        hasOpenLungWound = true;
        if (!w.decompressed) {
          openTensionPneumo = true;
        }
      }
    }

    // Blood volume decrement
    this.vitals.bloodVolume = Math.max(0, this.vitals.bloodVolume - totalBleedRate * dt);

    // Tinnitus decay
    if (this.vitals.tinnitusDuration > 0) {
      this.vitals.tinnitusDuration -= dt;
      if (this.vitals.tinnitusDuration <= 0) {
        tacticalAudio.setTinnitus(false);
      }
    }

    // Lung / SpO2 oxygenation simulation
    if (openTensionPneumo) {
      this.vitals.spO2 = Math.max(50, this.vitals.spO2 - 1.4 * dt);
      this.vitals.hypoxiaLevel = Math.min(100, (100 - this.vitals.spO2) * 2);
    } else if (hasOpenLungWound && !this.wounds.some((w) => w.zone === 'torso_lungs' && w.sealed)) {
      this.vitals.spO2 = Math.max(68, this.vitals.spO2 - 0.6 * dt);
    } else {
      // Natural recovery towards 98%
      this.vitals.spO2 = Math.min(99, this.vitals.spO2 + 0.8 * dt);
      this.vitals.hypoxiaLevel = Math.max(0, this.vitals.hypoxiaLevel - 1.2 * dt);
    }

    // Determine Shock Stage & Vitals
    const bv = this.vitals.bloodVolume;
    let stage: ShockStage = 'normal';

    if (bv <= 1500) {
      stage = 'cardiac_arrest';
      this.vitals.heartRate = 0;
      this.vitals.bloodPressureSystolic = 0;
      this.vitals.bloodPressureDiastolic = 0;
    } else if (bv <= 2600) {
      stage = 'irreversible';
      this.vitals.heartRate = 165;
      this.vitals.bloodPressureSystolic = Math.round(60 + ((bv - 1500) / 1100) * 15);
      this.vitals.bloodPressureDiastolic = Math.round(35 + ((bv - 1500) / 1100) * 10);
    } else if (bv <= 3800) {
      stage = 'decompensated';
      this.vitals.heartRate = 138;
      this.vitals.bloodPressureSystolic = Math.round(75 + ((bv - 2600) / 1200) * 20);
      this.vitals.bloodPressureDiastolic = Math.round(45 + ((bv - 2600) / 1200) * 15);
    } else if (bv <= 4400) {
      stage = 'compensated';
      this.vitals.heartRate = 108;
      this.vitals.bloodPressureSystolic = Math.round(95 + ((bv - 3800) / 600) * 15);
      this.vitals.bloodPressureDiastolic = Math.round(60 + ((bv - 3800) / 600) * 15);
    } else {
      stage = 'normal';
      this.vitals.heartRate = 74;
      this.vitals.bloodPressureSystolic = 120;
      this.vitals.bloodPressureDiastolic = 80;
    }

    this.vitals.shockStage = stage;

    // Audio cue coordination (throttled every 1.5s to avoid audio glitching)
    const now = performance.now();
    if (now - this.lastHeartbeatUpdate > 1500) {
      this.lastHeartbeatUpdate = now;
      tacticalAudio.updateHeartbeat(this.vitals.heartRate, this.vitals.bloodVolume / 5000);

      const breathingRate: 'normal' | 'heavy' | 'wheezing' = openTensionPneumo
        ? 'wheezing'
        : stage === 'decompensated' || stage === 'irreversible'
        ? 'heavy'
        : 'normal';

      if (breathingRate !== this.lastBreathingMode) {
        this.lastBreathingMode = breathingRate;
        tacticalAudio.updateBreathing(breathingRate);
      }
    }
  }
}

export const anatomySim = new AnatomySimulation();
