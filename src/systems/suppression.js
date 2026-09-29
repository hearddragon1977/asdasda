/**
 * Player Suppression & Stress System
 *
 * Tracks hostile projectile near-misses (passes) and bullet impacts near the
 * player. Accumulates a stress meter that temporarily drives:
 *   - visual blur (tunnel / shell-shock soft focus)
 *   - audio muffling (low-pass combat deafness)
 *   - weapon sway (aim jitter under heavy fire)
 *
 * Designed as a pure simulation module — consumers read effects each tick and
 * apply them to HUD, Web Audio, and aim offsets.
 */

/** Distance (m) within which a hostile round counts as a near-miss pass. */
const PASS_RADIUS = 3.6;
/** Distance (m) within which an obstacle/ground impact rattles the player. */
const IMPACT_NEAR_RADIUS = 4.5;
/** Player hit-sphere — used so we don't double-count passes that become hits. */
const HIT_RADIUS = 1.2;

/** Stress added when a round whizzes past (scaled by closeness). */
const PASS_STRESS_MAX = 0.18;
const PASS_STRESS_MIN = 0.06;
/** Stress added when the player is directly hit. */
const HIT_STRESS = 0.42;
/** Stress added when a round impacts cover / ground nearby. */
const NEAR_IMPACT_STRESS = 0.14;

/** Peak stress before hard clamp. */
const STRESS_CAP = 1.0;
/** Seconds of no stimulus before decay begins. */
const DECAY_DELAY = 0.55;
/** Stress units drained per second after delay. */
const DECAY_RATE = 0.38;
/** Soft recovery boost once stress is low (helps clear residual blur). */
const DECAY_FLOOR_BOOST = 0.12;

/** Effect thresholds (stress 0–1). */
const BLUR_START = 0.15;
const MUFFLE_START = 0.18;
const SWAY_START = 0.12;
const HEAVY_FIRE_THRESHOLD = 0.55;

/** Peak CSS / backdrop blur in pixels at full stress. */
const BLUR_MAX_PX = 7.5;
/** Aim sway world-scale multiplier helpers (consumers also scale). */
const SWAY_AMP_MAX = 0.14;

/**
 * @typedef {{ x: number, y?: number, z: number }} Vec3
 *
 * @typedef {Object} ProjectileSnapshot
 * @property {string} id                     Stable id (e.g. THREE.Mesh.uuid)
 * @property {number} x
 * @property {number} z
 * @property {boolean} isBluefor
 * @property {string} [shooterId]
 *
 * @typedef {Object} SuppressionEffects
 * @property {number} stress                 0–1 accumulated suppression
 * @property {number} blurPx                 CSS blur in pixels
 * @property {number} muffle                 0–1 audio muffling amount
 * @property {number} swayRadians            peak yaw sway amplitude
 * @property {number} swayOffsetX            instantaneous aim sway (world X)
 * @property {number} swayOffsetZ            instantaneous aim sway (world Z)
 * @property {boolean} underHeavyFire        stress above combat threshold
 * @property {number} recentPassCount        passes in the rolling window
 * @property {number} recentImpactCount      impacts in the rolling window
 */

/**
 * @returns {SuppressionEffects}
 */
function emptyEffects() {
  return {
    stress: 0,
    blurPx: 0,
    muffle: 0,
    swayRadians: 0,
    swayOffsetX: 0,
    swayOffsetZ: 0,
    underHeavyFire: false,
    recentPassCount: 0,
    recentImpactCount: 0,
  };
}

export class SuppressionSystem {
  constructor() {
    /** @type {number} */
    this.stress = 0;
    /** @type {number} seconds since last stress spike */
    this._timeSinceStimulus = 999;
    /** @type {number} phase accumulator for organic sway wobble */
    this._swayPhase = 0;
    /** @type {Set<string>} projectile ids already credited as a pass */
    this._passCredited = new Set();
    /** @type {Map<string, number>} min distance observed per live projectile */
    this._passMinDist = new Map();
    /** @type {{ t: number, kind: 'pass' | 'hit' | 'near_impact' }[]} */
    this._recentEvents = [];
    /** @type {number} */
    this._clock = 0;
    /** Rolling window (seconds) for recent-event counters. */
    this.eventWindowSec = 2.5;
  }

  /** Clear all stress / tracking state (respawn, CASEVAC reset, etc.). */
  reset() {
    this.stress = 0;
    this._timeSinceStimulus = 999;
    this._swayPhase = 0;
    this._passCredited.clear();
    this._passMinDist.clear();
    this._recentEvents = [];
    this._clock = 0;
  }

  /**
   * Direct stress injection — player took a round.
   * @param {'hit' | 'near_impact'} [kind='hit']
   * @param {number} [intensity=1] 0–1 scalar
   */
  registerImpact(kind = 'hit', intensity = 1) {
    const clamped = Math.max(0, Math.min(1, intensity));
    const amount = (kind === 'hit' ? HIT_STRESS : NEAR_IMPACT_STRESS) * clamped;
    this._addStress(amount, kind === 'hit' ? 'hit' : 'near_impact');
  }

  /**
   * Explicit near-miss registration (optional — scanProjectiles covers this).
   * @param {number} distanceM distance from player at closest approach
   */
  registerPass(distanceM) {
    if (distanceM >= PASS_RADIUS) return;
    const t = 1 - Math.max(0, distanceM - HIT_RADIUS) / (PASS_RADIUS - HIT_RADIUS);
    const amount = PASS_STRESS_MIN + (PASS_STRESS_MAX - PASS_STRESS_MIN) * t;
    this._addStress(amount, 'pass');
  }

  /**
   * Scan live hostile projectiles for near-miss passes and track closest approach.
   * Call once per frame before / after projectile integration.
   *
   * @param {Vec3} playerPos
   * @param {ProjectileSnapshot[]} projectiles
   * @param {{ onPass?: (distance: number, id: string) => void }} [hooks]
   */
  scanProjectiles(playerPos, projectiles, hooks = {}) {
    const liveIds = new Set();

    for (const p of projectiles) {
      if (p.isBluefor) continue;
      const id = p.id;
      liveIds.add(id);

      const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const prev = this._passMinDist.get(id);
      if (prev === undefined || dist < prev) {
        this._passMinDist.set(id, dist);
      }

      // Credit a pass while the round is inside the danger cylinder but outside
      // the hit sphere — once per projectile lifetime.
      if (
        !this._passCredited.has(id) &&
        dist < PASS_RADIUS &&
        dist > HIT_RADIUS
      ) {
        this._passCredited.add(id);
        const closest = this._passMinDist.get(id) ?? dist;
        this.registerPass(closest);
        hooks.onPass?.(closest, id);
      }
    }

    // Drop tracking for despawned projectiles
    for (const id of this._passMinDist.keys()) {
      if (!liveIds.has(id)) {
        this._passMinDist.delete(id);
        this._passCredited.delete(id);
      }
    }
  }

  /**
   * Notify that a hostile round impacted an obstacle / terrain.
   * Only stresses the player when the impact is nearby.
   *
   * @param {Vec3} impactPos
   * @param {Vec3} playerPos
   */
  registerWorldImpact(impactPos, playerPos) {
    const dist = Math.hypot(impactPos.x - playerPos.x, impactPos.z - playerPos.z);
    if (dist > IMPACT_NEAR_RADIUS) return;
    const falloff = 1 - dist / IMPACT_NEAR_RADIUS;
    this.registerImpact('near_impact', 0.45 + falloff * 0.55);
  }

  /**
   * Advance decay, sway phase, and rolling event window.
   * @param {number} dt seconds
   * @returns {SuppressionEffects}
   */
  update(dt) {
    const safeDt = Math.max(0, Math.min(0.1, dt));
    this._clock += safeDt;
    this._timeSinceStimulus += safeDt;
    this._swayPhase += safeDt * (4.2 + this.stress * 7.5);

    // Decay after a short hold so burst fire "stacks" into heavy suppression
    if (this._timeSinceStimulus > DECAY_DELAY && this.stress > 0) {
      const boost = this.stress < 0.25 ? DECAY_FLOOR_BOOST : 0;
      this.stress = Math.max(0, this.stress - (DECAY_RATE + boost) * safeDt);
    }

    // Prune rolling event log
    const cutoff = this._clock - this.eventWindowSec;
    this._recentEvents = this._recentEvents.filter((e) => e.t >= cutoff);

    return this.getEffects();
  }

  /**
   * Current sensory / motor effect bundle for HUD, audio, and aim.
   * @returns {SuppressionEffects}
   */
  getEffects() {
    const s = this.stress;
    const blurT = s <= BLUR_START ? 0 : (s - BLUR_START) / (1 - BLUR_START);
    const muffleT = s <= MUFFLE_START ? 0 : (s - MUFFLE_START) / (1 - MUFFLE_START);
    const swayT = s <= SWAY_START ? 0 : (s - SWAY_START) / (1 - SWAY_START);

    // Organic two-frequency sway — stronger under heavy fire
    const amp = swayT * swayT * SWAY_AMP_MAX;
    const swayOffsetX =
      Math.sin(this._swayPhase * 1.37) * amp * 1.4 +
      Math.sin(this._swayPhase * 3.1) * amp * 0.55;
    const swayOffsetZ =
      Math.cos(this._swayPhase * 1.11) * amp * 1.4 +
      Math.cos(this._swayPhase * 2.7) * amp * 0.55;

    let recentPassCount = 0;
    let recentImpactCount = 0;
    for (const e of this._recentEvents) {
      if (e.kind === 'pass') recentPassCount += 1;
      else recentImpactCount += 1;
    }

    return {
      stress: s,
      // Ease-in curve keeps light stress subtle, then ramps hard under fire
      blurPx: blurT * blurT * BLUR_MAX_PX,
      muffle: Math.min(1, muffleT * 1.05),
      swayRadians: amp,
      swayOffsetX,
      swayOffsetZ,
      underHeavyFire: s >= HEAVY_FIRE_THRESHOLD,
      recentPassCount,
      recentImpactCount,
    };
  }

  /**
   * @param {number} amount
   * @param {'pass' | 'hit' | 'near_impact'} kind
   */
  _addStress(amount, kind) {
    if (amount <= 0) return;
    this.stress = Math.min(STRESS_CAP, this.stress + amount);
    this._timeSinceStimulus = 0;
    this._recentEvents.push({ t: this._clock, kind });
  }
}

/** Shared singleton used by the tactical viewport / audio bridge. */
export const suppressionSystem = new SuppressionSystem();

export const SUPPRESSION_CONSTANTS = {
  PASS_RADIUS,
  IMPACT_NEAR_RADIUS,
  HIT_RADIUS,
  HEAVY_FIRE_THRESHOLD,
  BLUR_MAX_PX,
};

// Dev / QA hook for verifying sensory feedback without waiting on combat RNG
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-underscore-dangle
  window.__suppressionSystem = suppressionSystem;
}
