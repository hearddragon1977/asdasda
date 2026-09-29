import * as THREE from 'three';

/** Nightfang's snout sits on local +X. This yaws it onto the actor's forward axis. */
export const NIGHTFANG_FACING_YAW = -Math.PI / 2;

export type NightfangPose = 'idle' | 'walk' | 'sprint' | 'reload' | 'signal';

/**
 * Pose driver for the static Nightfang mesh.
 * The file has no skeleton, so walk, sprint, reload, and hand signals
 * are played by rocking the whole body on a pose pivot at the feet.
 */
export class NightfangAnimator {
  private moving = false;
  private sprinting = false;
  private phase = Math.random() * Math.PI * 2;
  private reloadLeft = 0;
  private signalLeft = 0;
  readonly posePivot: THREE.Group;

  constructor(posePivot: THREE.Group) {
    this.posePivot = posePivot;
  }

  setLocomotion(speed: number, sprint: boolean): void {
    this.moving = speed > 0.45;
    this.sprinting = sprint && this.moving;
  }

  triggerReload(seconds = 0.85): void {
    this.reloadLeft = Math.max(this.reloadLeft, seconds);
  }

  triggerSignal(seconds = 1.15): void {
    this.signalLeft = Math.max(this.signalLeft, seconds);
  }

  get pose(): NightfangPose {
    if (this.reloadLeft > 0) return 'reload';
    if (this.signalLeft > 0) return 'signal';
    if (this.sprinting) return 'sprint';
    if (this.moving) return 'walk';
    return 'idle';
  }

  update(dt: number): void {
    const step = Math.min(0.05, Math.max(0, dt));
    this.reloadLeft = Math.max(0, this.reloadLeft - step);
    this.signalLeft = Math.max(0, this.signalLeft - step);

    const pose = this.pose;
    const rate = pose === 'sprint' ? 11 : pose === 'walk' ? 7.2 : pose === 'signal' ? 8 : 1.8;
    this.phase += step * rate;

    const pivot = this.posePivot;
    const stepWave = Math.sin(this.phase);
    const bounce = Math.abs(Math.sin(this.phase));

    pivot.position.y = 0;
    pivot.rotation.x = 0;
    pivot.rotation.z = 0;

    if (pose === 'idle') {
      pivot.position.y = Math.sin(this.phase) * 0.015;
      pivot.rotation.x = Math.sin(this.phase * 0.5) * 0.015;
      return;
    }

    if (pose === 'walk') {
      pivot.position.y = bounce * 0.05;
      pivot.rotation.z = stepWave * 0.07;
      pivot.rotation.x = 0.06 + bounce * 0.03;
      return;
    }

    if (pose === 'sprint') {
      pivot.position.y = bounce * 0.09;
      pivot.rotation.z = stepWave * 0.1;
      pivot.rotation.x = 0.32;
      return;
    }

    if (pose === 'reload') {
      const pump = (Math.sin(this.phase * 1.4) + 1) * 0.5;
      pivot.position.y = -0.06;
      pivot.rotation.x = 0.42 + pump * 0.1;
      pivot.rotation.z = -0.28;
      return;
    }

    const wave = Math.sin(this.phase);
    pivot.position.y = 0.03;
    pivot.rotation.x = -0.08;
    pivot.rotation.z = -0.42 + wave * 0.16;
  }
}

export function mountNightfang(template: THREE.Object3D): { pose: THREE.Group; animator: NightfangAnimator } {
  const pose = new THREE.Group();
  const model = template.clone(true);
  model.rotation.y = NIGHTFANG_FACING_YAW;
  pose.add(model);
  const animator = new NightfangAnimator(pose);
  return { pose, animator };
}
