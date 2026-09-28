/**
 * Spatial 3D Positional Audio Manager
 *
 * Web Audio API engine for gunfire and footsteps with HRTF panning.
 * Gunfire is split into two physically distinct layers:
 *
 *   1. Muzzle blast  — low-frequency pressure wave originating at the weapon.
 *      Audible at the shooter; falls off with inverse-square distance.
 *
 *   2. Sonic (ballistic) crack — N-wave Mach-cone transient produced only by
 *      supersonic projectiles. Originates at the closest point on the bullet
 *      trajectory to the listener, not at the muzzle. Never plays for
 *      subsonic rounds (muzzleVelocity ≤ SPEED_OF_SOUND_MPS).
 *
 * Footsteps are short positional soft-surface / hard-surface impulses tied to
 * walker cadence.
 *
 * Game-world units are treated as metres for panning / distance models.
 */

/** @typedef {{ x: number, y?: number, z: number }} Vec3 */

/** @typedef {'dirt' | 'concrete' | 'gravel' | 'metal'} FootstepSurface */

/**
 * @typedef {Object} WeaponAudioProfile
 * @property {string} [id]
 * @property {number} [muzzleVelocity]  m/s — used to gate sonic crack
 * @property {number} [caliberMm]       approximate projectile diameter
 * @property {number} [blastGain]       relative muzzle blast loudness (default 1)
 * @property {number} [crackGain]       relative sonic crack loudness (default 1)
 * @property {'rifle' | 'carbine' | 'lmg' | 'pistol' | 'smg' | 'ak'} [family]
 */

/**
 * @typedef {Object} GunfireOptions
 * @property {Vec3} muzzle
 * @property {Vec3} [target]
 * @property {Vec3} [listener]
 * @property {string | WeaponAudioProfile} [weapon]
 * @property {boolean} [isPlayer]  own-weapon near-field boost
 * @property {boolean} [supersonic] force / override sonic-crack gate
 */

const SPEED_OF_SOUND_MPS = 343;
const DEFAULT_MUZZLE_VELOCITY = 800;

/** Built-in profiles keyed by common weapon ids / families. */
const WEAPON_PROFILES = {
  m4a1: { id: 'm4a1', family: 'carbine', muzzleVelocity: 884, caliberMm: 5.56, blastGain: 0.95, crackGain: 1.0 },
  m16a4: { id: 'm16a4', family: 'rifle', muzzleVelocity: 948, caliberMm: 5.56, blastGain: 1.05, crackGain: 1.05 },
  ak47: { id: 'ak47', family: 'ak', muzzleVelocity: 715, caliberMm: 7.62, blastGain: 1.2, crackGain: 0.95 },
  akm: { id: 'akm', family: 'ak', muzzleVelocity: 715, caliberMm: 7.62, blastGain: 1.2, crackGain: 0.95 },
  rpk: { id: 'rpk', family: 'lmg', muzzleVelocity: 745, caliberMm: 7.62, blastGain: 1.35, crackGain: 1.0 },
  svd: { id: 'svd', family: 'rifle', muzzleVelocity: 830, caliberMm: 7.62, blastGain: 1.15, crackGain: 1.2 },
  m249: { id: 'm249', family: 'lmg', muzzleVelocity: 915, caliberMm: 5.56, blastGain: 1.25, crackGain: 1.05 },
  pistol: { id: 'pistol', family: 'pistol', muzzleVelocity: 350, caliberMm: 9, blastGain: 0.55, crackGain: 0.4 },
};

const SURFACE_FOOTSTEP = {
  dirt: { hp: 280, lp: 1400, gain: 0.22, duration: 0.09 },
  concrete: { hp: 600, lp: 3200, gain: 0.3, duration: 0.055 },
  gravel: { hp: 400, lp: 2400, gain: 0.28, duration: 0.08 },
  metal: { hp: 900, lp: 4800, gain: 0.34, duration: 0.045 },
};

/**
 * Closest point on segment AB to point P.
 * @param {Vec3} a
 * @param {Vec3} b
 * @param {Vec3} p
 * @returns {{ point: Required<Vec3>, distance: number, t: number }}
 */
function closestPointOnSegment(a, b, p) {
  const ax = a.x;
  const ay = a.y ?? 0;
  const az = a.z;
  const bx = b.x;
  const by = b.y ?? 0;
  const bz = b.z;
  const px = p.x;
  const py = p.y ?? 0;
  const pz = p.z;

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;

  let t = 0;
  if (abLenSq > 1e-8) {
    t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const point = { x: ax + abx * t, y: ay + aby * t, z: az + abz * t };
  const dx = px - point.x;
  const dy = py - point.y;
  const dz = pz - point.z;
  return { point, distance: Math.hypot(dx, dy, dz), t };
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
function distance3(a, b) {
  return Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
}

class AudioManager {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {GainNode | null} */
    this.masterGain = null;
    /** @type {GainNode | null} */
    this.gunfireBus = null;
    /** @type {GainNode | null} */
    this.footstepBus = null;
    /** @type {boolean} */
    this.isInitialized = false;
    /** @type {Required<Vec3>} */
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    /** @type {{ forward: Required<Vec3>, up: Required<Vec3> }} */
    this.listenerOrient = {
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    };
    /** @type {Map<string, number>} last footstep times keyed by entity id */
    this._footstepClocks = new Map();
    /** Soft concurrency cap so automatic fire doesn't spawn unbounded nodes */
    this._activeVoices = 0;
    this._maxVoices = 48;
  }

  /**
   * Unlock / create the AudioContext. Safe to call repeatedly (e.g. on first click).
   * @returns {boolean}
   */
  init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        /** @type {typeof AudioContext} */ (
          /** @type {unknown} */ (window).webkitAudioContext
        );
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.gunfireBus = this.ctx.createGain();
      this.gunfireBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.gunfireBus.connect(this.masterGain);

      this.footstepBus = this.ctx.createGain();
      this.footstepBus.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.footstepBus.connect(this.masterGain);

      this._syncListener();
      this.isInitialized = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns {AudioContext | null}
   */
  _ensure() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Update the listener (player ear) world position for HRTF / distance models.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setListenerPosition(x, y = 1.6, z = 0) {
    this.listenerPos = { x, y, z };
    this._syncListener();
  }

  /**
   * @param {number} fx forward X
   * @param {number} fy
   * @param {number} fz
   * @param {number} [ux=0]
   * @param {number} [uy=1]
   * @param {number} [uz=0]
   */
  setListenerOrientation(fx, fy, fz, ux = 0, uy = 1, uz = 0) {
    this.listenerOrient = {
      forward: { x: fx, y: fy, z: fz },
      up: { x: ux, y: uy, z: uz },
    };
    this._syncListener();
  }

  /**
   * Convenience: top-down game — listener looks along yaw around +Y.
   * @param {number} x
   * @param {number} z
   * @param {number} rotationY radians
   * @param {number} [y=1.6]
   */
  setListenerFromPlayer(x, z, rotationY, y = 1.6) {
    this.setListenerPosition(x, y, z);
    // In the tactical top-down view, +Z is "south"; yaw 0 faces +Z.
    const fx = Math.sin(rotationY);
    const fz = Math.cos(rotationY);
    this.setListenerOrientation(fx, 0, fz);
  }

  _syncListener() {
    if (!this.ctx) return;
    const { listener } = this.ctx;
    const t = this.ctx.currentTime;
    const p = this.listenerPos;
    const { forward, up } = this.listenerOrient;

    if (typeof listener.positionX !== 'undefined') {
      listener.positionX.setValueAtTime(p.x, t);
      listener.positionY.setValueAtTime(p.y, t);
      listener.positionZ.setValueAtTime(p.z, t);
      listener.forwardX.setValueAtTime(forward.x, t);
      listener.forwardY.setValueAtTime(forward.y, t);
      listener.forwardZ.setValueAtTime(forward.z, t);
      listener.upX.setValueAtTime(up.x, t);
      listener.upY.setValueAtTime(up.y, t);
      listener.upZ.setValueAtTime(up.z, t);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(p.x, p.y, p.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * @param {number} volume 0–1
   */
  setMasterVolume(volume) {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, volume)),
      this.ctx.currentTime,
      0.05
    );
  }

  /**
   * Resolve a weapon id / partial profile into a full audio profile.
   * @param {string | WeaponAudioProfile | undefined | null} weapon
   * @returns {{ id: string, family: 'rifle' | 'carbine' | 'lmg' | 'pistol' | 'smg' | 'ak', muzzleVelocity: number, caliberMm: number, blastGain: number, crackGain: number }}
   */
  resolveWeaponProfile(weapon) {
    const fallback = {
      id: 'generic_rifle',
      family: /** @type {const} */ ('rifle'),
      muzzleVelocity: DEFAULT_MUZZLE_VELOCITY,
      caliberMm: 5.56,
      blastGain: 1,
      crackGain: 1,
    };

    if (!weapon) {
      return fallback;
    }

    if (typeof weapon === 'string') {
      const key = weapon.toLowerCase();
      if (WEAPON_PROFILES[key]) {
        return { ...WEAPON_PROFILES[key] };
      }
      for (const profile of Object.values(WEAPON_PROFILES)) {
        if (key.includes(profile.id) || key.includes(profile.family)) {
          return { ...profile };
        }
      }
      return {
        id: key,
        family: /** @type {const} */ ('rifle'),
        muzzleVelocity: DEFAULT_MUZZLE_VELOCITY,
        caliberMm: 5.56,
        blastGain: 1,
        crackGain: 1,
      };
    }

    const base =
      (weapon.id && WEAPON_PROFILES[weapon.id.toLowerCase()]) ||
      (weapon.family &&
        Object.values(WEAPON_PROFILES).find((p) => p.family === weapon.family)) ||
      {};

    return {
      id: weapon.id || base.id || 'custom',
      family: weapon.family || base.family || 'rifle',
      muzzleVelocity: weapon.muzzleVelocity ?? base.muzzleVelocity ?? DEFAULT_MUZZLE_VELOCITY,
      caliberMm: weapon.caliberMm ?? base.caliberMm ?? 5.56,
      blastGain: weapon.blastGain ?? base.blastGain ?? 1,
      crackGain: weapon.crackGain ?? base.crackGain ?? 1,
    };
  }

  /**
   * Whether a round produces an audible ballistic crack.
   * @param {string | WeaponAudioProfile | number} weaponOrVelocity
   * @returns {boolean}
   */
  isSupersonic(weaponOrVelocity) {
    const v =
      typeof weaponOrVelocity === 'number'
        ? weaponOrVelocity
        : this.resolveWeaponProfile(weaponOrVelocity).muzzleVelocity;
    return v > SPEED_OF_SOUND_MPS;
  }

  /**
   * Create a spatial panner → bus chain.
   * @param {Vec3} position
   * @param {{ refDistance?: number, maxDistance?: number, rolloff?: number, bus?: GainNode }} [opts]
   * @returns {{ panner: PannerNode, gain: GainNode } | null}
   */
  _createPanner(position, opts = {}) {
    const ctx = this._ensure();
    if (!ctx || !this.gunfireBus) return null;
    if (this._activeVoices >= this._maxVoices) return null;

    const bus = opts.bus || this.gunfireBus;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = opts.refDistance ?? 2;
    panner.maxDistance = opts.maxDistance ?? 80;
    panner.rolloffFactor = opts.rolloff ?? 1.1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;

    const x = position.x;
    const y = position.y ?? 0.9;
    const z = position.z;

    if (typeof panner.positionX !== 'undefined') {
      panner.positionX.setValueAtTime(x, ctx.currentTime);
      panner.positionY.setValueAtTime(y, ctx.currentTime);
      panner.positionZ.setValueAtTime(z, ctx.currentTime);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(x, y, z);
    }

    const gain = ctx.createGain();
    gain.connect(panner);
    panner.connect(bus);

    this._activeVoices += 1;
    const release = () => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
      try {
        gain.disconnect();
        panner.disconnect();
      } catch {
        /* already disconnected */
      }
    };

    // Auto-release after a generous window; callers should stop sources sooner.
    setTimeout(release, 2000);

    return { panner, gain };
  }

  /**
   * Fill a mono buffer with white noise.
   * @param {number} durationSec
   * @returns {AudioBuffer | null}
   */
  _noiseBuffer(durationSec) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Classic N-wave (positive spike → negative trough) used for ballistic cracks.
   * @param {number} durationSec
   * @returns {AudioBuffer | null}
   */
  _nWaveBuffer(durationSec) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const len = Math.max(8, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const half = Math.floor(len / 2);
    for (let i = 0; i < len; i++) {
      if (i < half) {
        // Rising front then plateau collapse
        const t = i / half;
        data[i] = (1 - t) * (0.85 + Math.random() * 0.15);
      } else {
        const t = (i - half) / Math.max(1, len - half);
        data[i] = -(1 - t) * (0.7 + Math.random() * 0.2);
      }
    }
    // Soften the very last samples to avoid click
    const fade = Math.min(16, len);
    for (let i = 0; i < fade; i++) {
      data[len - 1 - i] *= i / fade;
    }
    return buffer;
  }

  // ---------------------------------------------------------------------------
  // Muzzle blast profile
  // ---------------------------------------------------------------------------

  /**
   * Play a positional muzzle blast at the weapon.
   * Character: low-end boom + short broadband transient + brief mid tail.
   * Distinct from the high, whip-crack ballistic N-wave.
   *
   * @param {Vec3} position
   * @param {string | WeaponAudioProfile} [weapon]
   * @param {{ intensity?: number, isPlayer?: boolean }} [opts]
   */
  playMuzzleBlast(position, weapon, opts = {}) {
    const ctx = this._ensure();
    if (!ctx || !this.gunfireBus) return;

    const profile = this.resolveWeaponProfile(weapon);
    const intensity = (opts.intensity ?? 1) * profile.blastGain;
    const nearField = opts.isPlayer ? 1.15 : 1;
    const spatial = this._createPanner(position, {
      refDistance: opts.isPlayer ? 1.2 : 2.5,
      maxDistance: 90,
      rolloff: 0.95,
      bus: this.gunfireBus,
    });
    if (!spatial) return;

    const t = ctx.currentTime;
    const family = profile.family;
    const baseFreq =
      family === 'ak' || family === 'lmg' ? 130 : family === 'pistol' ? 260 : 175;
    const boomDur = family === 'lmg' || family === 'ak' ? 0.28 : family === 'pistol' ? 0.12 : 0.2;

    // 1) Transient noise crack at the muzzle (not the ballistic crack)
    const noiseBuf = this._noiseBuffer(0.06);
    if (noiseBuf) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(family === 'ak' ? 700 : 1100, t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(family === 'pistol' ? 4200 : 2800, t);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, t);
      ng.gain.exponentialRampToValueAtTime(0.55 * intensity * nearField, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      noise.connect(hp);
      hp.connect(lp);
      lp.connect(ng);
      ng.connect(spatial.gain);
      noise.start(t);
      noise.stop(t + 0.06);
    }

    // 2) Low-frequency explosive pressure (the "thump")
    const boom = ctx.createOscillator();
    boom.type = family === 'ak' ? 'sawtooth' : 'triangle';
    boom.frequency.setValueAtTime(baseFreq, t);
    boom.frequency.exponentialRampToValueAtTime(32, t + boomDur);

    const boomFilter = ctx.createBiquadFilter();
    boomFilter.type = 'lowpass';
    boomFilter.frequency.setValueAtTime(family === 'ak' ? 1600 : 1200, t);

    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.001, t);
    bg.gain.exponentialRampToValueAtTime(0.7 * intensity * nearField, t + 0.006);
    bg.gain.exponentialRampToValueAtTime(0.001, t + boomDur);

    boom.connect(boomFilter);
    boomFilter.connect(bg);
    bg.connect(spatial.gain);
    boom.start(t);
    boom.stop(t + boomDur + 0.02);

    // 3) Short environmental mid tail (room / open-air bloom)
    const tailBuf = this._noiseBuffer(0.35);
    if (tailBuf) {
      const tail = ctx.createBufferSource();
      tail.buffer = tailBuf;
      const tailLp = ctx.createBiquadFilter();
      tailLp.type = 'lowpass';
      tailLp.frequency.setValueAtTime(1800, t);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.001, t);
      tg.gain.exponentialRampToValueAtTime(0.28 * intensity, t + 0.02);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      tail.connect(tailLp);
      tailLp.connect(tg);
      tg.connect(spatial.gain);
      tail.start(t);
      tail.stop(t + 0.36);
    }

    spatial.gain.gain.setValueAtTime(1, t);
  }

  // ---------------------------------------------------------------------------
  // Sonic / ballistic crack profile
  // ---------------------------------------------------------------------------

  /**
   * Play a supersonic ballistic crack at a world position (typically the closest
   * point on the projectile path to the listener).
   *
   * Character: extremely short bipolar N-wave + high-frequency hiss —
   * deliberately different from the low muzzle boom.
   *
   * @param {Vec3} position
   * @param {string | WeaponAudioProfile} [weapon]
   * @param {{ intensity?: number, missDistance?: number }} [opts]
   */
  playSonicCrack(position, weapon, opts = {}) {
    const ctx = this._ensure();
    if (!ctx || !this.gunfireBus) return;

    const profile = this.resolveWeaponProfile(weapon);
    if (!this.isSupersonic(profile)) return;

    const miss = opts.missDistance ?? 0;
    // Cracks collapse quickly with lateral miss distance from the trajectory.
    const proximity = Math.max(0, 1 - miss / 14);
    if (proximity <= 0.02) return;

    const intensity = (opts.intensity ?? 1) * profile.crackGain * proximity;
    const spatial = this._createPanner(position, {
      refDistance: 1.5,
      maxDistance: 55,
      rolloff: 1.4,
      bus: this.gunfireBus,
    });
    if (!spatial) return;

    const t = ctx.currentTime;
    const crackDur = 0.012 + Math.min(0.01, (profile.caliberMm / 7.62) * 0.006);

    // 1) N-wave impulse — hallmark of a Mach cone sweep
    const nBuf = this._nWaveBuffer(crackDur);
    if (nBuf) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = nBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1800, t);
      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.setValueAtTime(4200, t);
      peak.Q.setValueAtTime(2.2, t);
      peak.gain.setValueAtTime(8, t);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, t);
      ng.gain.exponentialRampToValueAtTime(0.85 * intensity, t + 0.001);
      ng.gain.exponentialRampToValueAtTime(0.001, t + crackDur + 0.01);
      nSrc.connect(hp);
      hp.connect(peak);
      peak.connect(ng);
      ng.connect(spatial.gain);
      nSrc.start(t);
      nSrc.stop(t + crackDur + 0.015);
    }

    // 2) Brief ultrasonic-ish hiss (air shear / wake)
    const hissBuf = this._noiseBuffer(0.04);
    if (hissBuf) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = hissBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(5500, t);
      bp.Q.setValueAtTime(1.8, t);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.001, t);
      hg.gain.exponentialRampToValueAtTime(0.35 * intensity, t + 0.002);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      hiss.connect(bp);
      bp.connect(hg);
      hg.connect(spatial.gain);
      hiss.start(t);
      hiss.stop(t + 0.04);
    }

    // 3) Tiny descending sine "whip" for presence on close passes
    if (miss < 6) {
      const whip = ctx.createOscillator();
      whip.type = 'sine';
      whip.frequency.setValueAtTime(5200, t);
      whip.frequency.exponentialRampToValueAtTime(900, t + 0.045);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.001, t);
      wg.gain.exponentialRampToValueAtTime(0.22 * intensity * (1 - miss / 6), t + 0.002);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      whip.connect(wg);
      wg.connect(spatial.gain);
      whip.start(t);
      whip.stop(t + 0.055);
    }

    spatial.gain.gain.setValueAtTime(1, t);
  }

  // ---------------------------------------------------------------------------
  // Orchestrated gunfire (blast + optional crack)
  // ---------------------------------------------------------------------------

  /**
   * Fire a complete gunshot: muzzle blast at the weapon, and — when the round
   * is supersonic — a ballistic crack at the closest point on the shot line to
   * the listener.
   *
   * @param {GunfireOptions} options
   * @returns {{ playedCrack: boolean, crackPosition: Required<Vec3> | null, missDistance: number }}
   */
  playGunfire(options) {
    const profile = this.resolveWeaponProfile(options.weapon);
    const listener = options.listener || this.listenerPos;

    this.playMuzzleBlast(options.muzzle, profile, {
      isPlayer: options.isPlayer,
      intensity: 1,
    });

    const forceSupersonic = options.supersonic;
    const supersonic =
      typeof forceSupersonic === 'boolean'
        ? forceSupersonic
        : this.isSupersonic(profile);

    if (!supersonic || !options.target) {
      return { playedCrack: false, crackPosition: null, missDistance: Infinity };
    }

    // Own weapon at the ear: crack and blast collapse into one near-field event —
    // skip a separate crack to avoid doubling the transient on the player's gun.
    if (options.isPlayer && distance3(options.muzzle, listener) < 2.5) {
      return { playedCrack: false, crackPosition: null, missDistance: 0 };
    }

    const { point, distance, t } = closestPointOnSegment(
      options.muzzle,
      options.target,
      listener
    );

    // Crack is heard along the flight path after the round has left the muzzle.
    // Ignore near-muzzle samples (t≈0) and impacts behind the listener path.
    if (t < 0.04 || distance > 14) {
      return { playedCrack: false, crackPosition: point, missDistance: distance };
    }

    this.playSonicCrack(point, profile, {
      missDistance: distance,
      intensity: 1,
    });

    return { playedCrack: true, crackPosition: point, missDistance: distance };
  }

  /**
   * Convenience wrappers matching common call sites in the tactical sim.
   * @param {Vec3} muzzle
   * @param {Vec3} [target]
   * @param {Vec3} [listener]
   */
  playM4Fire(muzzle, target, listener) {
    this.playGunfire({
      muzzle,
      target,
      listener,
      weapon: 'm4a1',
      isPlayer: true,
    });
  }

  /**
   * @param {Vec3} muzzle
   * @param {Vec3} [target]
   * @param {Vec3} [listener]
   * @param {string} [weaponId='ak47']
   */
  playEnemyFire(muzzle, target, listener, weaponId = 'ak47') {
    this.playGunfire({
      muzzle,
      target,
      listener,
      weapon: weaponId,
      isPlayer: false,
    });
  }

  /**
   * Near-miss / pass-by crack when a hostile round flies near the player.
   * Prefer playGunfire for full shots; use this when only the crack is known.
   * @param {Vec3} position
   * @param {number} [missDistance=2]
   */
  playBulletCrack(position, missDistance = 2) {
    this.playSonicCrack(position, 'm4a1', { missDistance, intensity: 1.1 });
  }

  // ---------------------------------------------------------------------------
  // Footsteps
  // ---------------------------------------------------------------------------

  /**
   * Play a single positional footstep.
   * @param {Vec3} position
   * @param {{ surface?: FootstepSurface, intensity?: number, isPlayer?: boolean }} [opts]
   */
  playFootstep(position, opts = {}) {
    const ctx = this._ensure();
    if (!ctx || !this.footstepBus) return;

    const surface = opts.surface || 'dirt';
    const cfg = SURFACE_FOOTSTEP[surface] || SURFACE_FOOTSTEP.dirt;
    const intensity = (opts.intensity ?? 1) * (opts.isPlayer ? 0.55 : 1);

    const spatial = this._createPanner(position, {
      refDistance: 1.2,
      maxDistance: 28,
      rolloff: 1.6,
      bus: this.footstepBus,
    });
    if (!spatial) return;

    const t = ctx.currentTime;
    const buf = this._noiseBuffer(cfg.duration);
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(cfg.hp, t);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cfg.lp, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(cfg.gain * intensity, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + cfg.duration);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(spatial.gain);
    src.start(t);
    src.stop(t + cfg.duration + 0.01);

    // Soft body-weight thump for heavier surfaces
    if (surface === 'concrete' || surface === 'metal') {
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(surface === 'metal' ? 110 : 85, t);
      thump.frequency.exponentialRampToValueAtTime(40, t + 0.06);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.001, t);
      tg.gain.exponentialRampToValueAtTime(0.12 * intensity, t + 0.005);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      thump.connect(tg);
      tg.connect(spatial.gain);
      thump.start(t);
      thump.stop(t + 0.08);
    }
  }

  /**
   * Cadence-gated footstep helper for movement loops.
   * Call every frame while an entity is moving; returns true when a step fired.
   *
   * @param {string} entityId
   * @param {Vec3} position
   * @param {number} speedUnitsPerSec
   * @param {{ surface?: FootstepSurface, isPlayer?: boolean, dt?: number }} [opts]
   * @returns {boolean}
   */
  updateFootsteps(entityId, position, speedUnitsPerSec, opts = {}) {
    if (speedUnitsPerSec < 0.4) {
      this._footstepClocks.delete(entityId);
      return false;
    }

    const now = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    // Stride interval shrinks as speed rises (walk ~0.55s, run ~0.32s)
    const interval = Math.max(0.28, Math.min(0.6, 1.15 / Math.max(1, speedUnitsPerSec * 0.22)));
    const last = this._footstepClocks.get(entityId) ?? 0;

    if (now - last < interval) return false;

    this._footstepClocks.set(entityId, now);
    const intensity = Math.min(1.3, 0.55 + speedUnitsPerSec / 14);
    this.playFootstep(position, {
      surface: opts.surface,
      intensity,
      isPlayer: opts.isPlayer,
    });
    return true;
  }

  /**
   * Tear down looping / retained state. Does not close the AudioContext so
   * subsequent init() can reuse it after user gestures.
   */
  cleanup() {
    this._footstepClocks.clear();
    this._activeVoices = 0;
  }

  /** Fully dispose the audio graph. */
  destroy() {
    this.cleanup();
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.masterGain = null;
    this.gunfireBus = null;
    this.footstepBus = null;
    this.isInitialized = false;
  }
}

export const audioManager = new AudioManager();
export {
  AudioManager,
  SPEED_OF_SOUND_MPS,
  WEAPON_PROFILES,
  closestPointOnSegment,
};
export default audioManager;
