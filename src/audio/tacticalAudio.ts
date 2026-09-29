/**
 * Procedural Web Audio API Sound Synthesizer for Tactical Trauma & Combat Simulator
 * Generates realistic gunfire, ballistics, heartbeats, breathing, tinnitus,
 * field medical procedures, and radio tactical barks without external asset dependencies.
 */

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  /** Low-pass inserted between master and destination for suppression muffling. */
  private muffleFilter: BiquadFilterNode | null = null;
  private tinnitusOsc: OscillatorNode | null = null;
  private tinnitusGain: GainNode | null = null;
  private heartbeatTimer: number | null = null;
  private breathingTimer: number | null = null;
  private isInitialized = false;
  private tinnitusStopTimer: number | null = null;
  private suppressionMuffle = 0;

  public init(): void {
    if (this.isInitialized && this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      // Master → muffle (lowpass) → speakers. Cutoff drops under heavy fire.
      this.muffleFilter = this.ctx.createBiquadFilter();
      this.muffleFilter.type = 'lowpass';
      this.muffleFilter.frequency.setValueAtTime(18000, this.ctx.currentTime);
      this.muffleFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      this.masterGain.connect(this.muffleFilter);
      this.muffleFilter.connect(this.ctx.destination);
      this.isInitialized = true;
    } catch {
      // AudioContext may require user interaction to unlock
    }
  }

  /**
   * Apply combat-suppression audio muffling (0 = clear, 1 = heavy low-pass).
   * Softens highs to simulate temporary auditory dulling under incoming fire.
   */
  public setSuppressionMuffle(amount: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.muffleFilter) return;

    const clamped = Math.max(0, Math.min(1, amount));
    this.suppressionMuffle = clamped;
    // 18 kHz (open) → ~450 Hz (heavily muffled)
    const hz = 18000 * Math.pow(450 / 18000, clamped);
    const t = ctx.currentTime;
    this.muffleFilter.frequency.cancelScheduledValues(t);
    this.muffleFilter.frequency.setTargetAtTime(hz, t, 0.05);
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0.85 * (1 - clamped * 0.45), t, 0.05);
    }
  }

  public getSuppressionMuffle(): number {
    return this.suppressionMuffle;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private arm(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    source.addEventListener('ended', () => {
      try {
        source.disconnect();
      } catch {
        // Already detached.
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Already detached.
        }
      }
    });
  }

  // --- WEAPON & BALLISTICS SFX ---

  public playM4Fire(volumeScale = 1): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1.5, volumeScale));

    // 1. Initial transient crack (fast noise burst)
    const bufferSize = ctx.sampleRate * 0.05;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1200, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9 * vol, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    this.arm(noise, [noiseFilter, noiseGain]);
    noise.start(t);

    // 2. Punch / low-end explosive pressure
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.9 * vol, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    this.arm(osc, [oscGain]);
    osc.start(t);
    osc.stop(t + 0.25);

    // 3. Reverb tail / environmental acoustic resonance
    const reverbLen = ctx.sampleRate * 0.45;
    const revBuffer = ctx.createBuffer(1, reverbLen, ctx.sampleRate);
    const revData = revBuffer.getChannelData(0);
    for (let i = 0; i < reverbLen; i++) {
      revData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
    }
    const revSource = ctx.createBufferSource();
    revSource.buffer = revBuffer;

    const revFilter = ctx.createBiquadFilter();
    revFilter.type = 'lowpass';
    revFilter.frequency.setValueAtTime(2400 * (0.4 + 0.6 * vol), t);

    const revGain = ctx.createGain();
    revGain.gain.setValueAtTime(0.45 * vol, t);
    revGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45 * (0.5 + 0.5 * vol));

    revSource.connect(revFilter);
    revFilter.connect(revGain);
    revGain.connect(this.masterGain);
    this.arm(revSource, [revFilter, revGain]);
    revSource.start(t);
  }

  public playEnemyAKFire(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;

    // AK-47 heavier acoustic thump
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);

    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(1800, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(oscFilter);
    oscFilter.connect(gain);
    gain.connect(this.masterGain);
    this.arm(osc, [oscFilter, gain]);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  public playBulletCrack(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.arm(osc, [gain]);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playDryFire(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.arm(osc, [gain]);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playMagCheck(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    // Magazine catch click + slide
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(650, t);
    osc1.frequency.exponentialRampToValueAtTime(200, t + 0.08);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.3, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    this.arm(osc1, [gain1]);
    osc1.start(t);
    osc1.stop(t + 0.1);

    // Polymer mag seating clack
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(450, t + 0.22);
    osc2.frequency.exponentialRampToValueAtTime(110, t + 0.3);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.0, t);
    gain2.gain.setValueAtTime(0.4, t + 0.22);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    this.arm(osc2, [gain2]);
    osc2.start(t + 0.22);
    osc2.stop(t + 0.35);
  }

  // --- DIEGETIC PHYSIOLOGICAL AUDIO ---

  public updateHeartbeat(bpm: number, bloodVolumeRatio: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (bpm <= 0 || bloodVolumeRatio <= 0.25) return; // Flatline

    const intervalMs = Math.max(300, (60 / bpm) * 1000);

    const playThump = () => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      // Lub
      const o1 = this.ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(68, t);
      o1.frequency.exponentialRampToValueAtTime(32, t + 0.12);

      const g1 = this.ctx.createGain();
      const intensity = Math.min(1.0, 0.4 + (1 - bloodVolumeRatio) * 0.6);
      g1.gain.setValueAtTime(intensity, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      o1.connect(g1);
      g1.connect(this.masterGain);
      this.arm(o1, [g1]);
      o1.start(t);
      o1.stop(t + 0.15);

      // Dub
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(54, t + 0.18);
      o2.frequency.exponentialRampToValueAtTime(28, t + 0.28);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0, t);
      g2.gain.setValueAtTime(intensity * 0.7, t + 0.18);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      o2.connect(g2);
      g2.connect(this.masterGain);
      this.arm(o2, [g2]);
      o2.start(t + 0.18);
      o2.stop(t + 0.32);
    };

    // Trigger initial beat and schedule interval
    playThump();
    this.heartbeatTimer = window.setInterval(playThump, intervalMs);
  }

  public updateBreathing(rate: 'normal' | 'heavy' | 'wheezing'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (this.breathingTimer) {
      clearInterval(this.breathingTimer);
      this.breathingTimer = null;
    }

    const interval = rate === 'wheezing' ? 2200 : rate === 'heavy' ? 1800 : 3800;

    const playBreath = () => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const duration = rate === 'heavy' ? 1.0 : 1.5;

      // Inhale noise
      const len = Math.floor(this.ctx.sampleRate * duration);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = Math.random() * 2 - 1;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = b;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(rate === 'wheezing' ? 1400 : 600, t);
      filter.Q.setValueAtTime(rate === 'wheezing' ? 4 : 1.5, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.linearRampToValueAtTime(rate === 'heavy' ? 0.35 : 0.18, t + duration * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      this.arm(source, [filter, gain]);
      source.start(t);

      // If wheezing (tension pneumothorax), add high pitch pleural whistle
      if (rate === 'wheezing') {
        const whistle = this.ctx.createOscillator();
        whistle.type = 'sine';
        whistle.frequency.setValueAtTime(1800, t + 0.2);
        whistle.frequency.linearRampToValueAtTime(2100, t + 0.6);
        whistle.frequency.linearRampToValueAtTime(1700, t + 0.9);

        const whistleGain = this.ctx.createGain();
        whistleGain.gain.setValueAtTime(0.0, t);
        whistleGain.gain.setValueAtTime(0.12, t + 0.2);
        whistleGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

        whistle.connect(whistleGain);
        whistleGain.connect(this.masterGain);
        this.arm(whistle, [whistleGain]);
        whistle.start(t + 0.2);
        whistle.stop(t + 1.1);
      }
    };

    playBreath();
    this.breathingTimer = window.setInterval(playBreath, interval);
  }

  public setTinnitus(active: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    if (active) {
      if (!this.tinnitusOsc) {
        this.tinnitusOsc = ctx.createOscillator();
        this.tinnitusOsc.type = 'sine';
        this.tinnitusOsc.frequency.setValueAtTime(5400, t);

        this.tinnitusGain = ctx.createGain();
        this.tinnitusGain.gain.setValueAtTime(0.001, t);
        this.tinnitusGain.gain.exponentialRampToValueAtTime(0.35, t + 0.4);

        this.tinnitusOsc.connect(this.tinnitusGain);
        this.tinnitusGain.connect(this.masterGain);
        this.tinnitusOsc.start(t);
      }
    } else {
      if (this.tinnitusOsc && this.tinnitusGain) {
        this.tinnitusGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        if (this.tinnitusStopTimer) window.clearTimeout(this.tinnitusStopTimer);
        this.tinnitusStopTimer = window.setTimeout(() => {
          this.tinnitusStopTimer = null;
          try {
            this.tinnitusOsc?.stop();
            this.tinnitusOsc?.disconnect();
            this.tinnitusGain?.disconnect();
          } catch {
            // Oscillator already stopped.
          }
          this.tinnitusOsc = null;
          this.tinnitusGain = null;
        }, 1600);
      }
    }
  }

  // --- FIELD TRAUMA INTERVENTIONS ---

  public playTourniquetRatchet(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    // Rapid ratcheting clicks
    for (let i = 0; i < 3; i++) {
      const clickTime = t + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900 + i * 150, clickTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);
      this.arm(osc, [gain]);
      osc.start(clickTime);
      osc.stop(clickTime + 0.05);
    }
  }

  public playMudPackSquelch(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    // Low moist squelch + friction
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(90, t + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.arm(osc, [gain]);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  public playRadioSquelchChirp(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1920, t);
    osc.frequency.setValueAtTime(2450, t + 0.04);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    this.arm(osc, [gain]);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  public cleanup(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.breathingTimer) clearInterval(this.breathingTimer);
    this.heartbeatTimer = null;
    this.breathingTimer = null;
    if (this.tinnitusStopTimer) {
      window.clearTimeout(this.tinnitusStopTimer);
      this.tinnitusStopTimer = null;
    }
    try {
      this.tinnitusOsc?.stop();
      this.tinnitusOsc?.disconnect();
      this.tinnitusGain?.disconnect();
    } catch {
      // Oscillator already stopped.
    }
    this.tinnitusOsc = null;
    this.tinnitusGain = null;
    try {
      this.masterGain?.disconnect();
    } catch {
      // Master bus already detached.
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.masterGain = null;
    this.isInitialized = false;
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
}

export const tacticalAudio = new TacticalAudioEngine();
