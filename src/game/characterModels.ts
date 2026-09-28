import * as THREE from 'three';

/** Served from `public/models`. */
export const FRIENDLY_MODEL_URL = '/models/friendly.glb';
export const ENEMY_MODEL_URL = '/models/enemy.glb';

/**
 * Friendly placeholder was `BoxGeometry(1.5, 1.5, 1.5)` centered on the group.
 * The group sits at y = 0.75, so the volume runs from the ground to y = 1.5.
 */
export const FRIENDLY_HITBOX = new THREE.Vector3(1.5, 1.5, 1.5);

/**
 * Player placeholder was `BoxGeometry(1.6, 1.6, 1.6)` centered on the group.
 * The group sits at y = 0.9, so the volume is centered on the existing hit point.
 */
export const PLAYER_HITBOX = new THREE.Vector3(1.6, 1.6, 1.6);

/**
 * Enemy placeholder was `SphereGeometry(1)` centered on the group.
 * The group sits at y = 1, so the volume runs from the ground to y = 2.
 */
export const ENEMY_HITBOX = new THREE.Vector3(2, 2, 2);

/**
 * Uniformly scale a cloned model so it fits inside the old primitive and
 * touches the hitbox on its largest relative axis, then center that bounds
 * on the group origin. Collision still uses the group position, so the
 * visual occupies the same volume as the placeholder.
 */
export function fitModelToHitbox(source: THREE.Object3D, hitbox: THREE.Vector3): THREE.Group {
  const fitted = new THREE.Group();
  fitted.name = 'character';

  const model = source.clone(true);
  fitted.add(model);
  fitted.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const safe = (value: number) => (value > 1e-5 ? value : 1);
  const scale = Math.min(hitbox.x / safe(size.x), hitbox.y / safe(size.y), hitbox.z / safe(size.z));

  model.scale.multiplyScalar(scale);
  model.updateWorldMatrix(true, true);

  const centered = new THREE.Box3().setFromObject(model);
  model.position.sub(centered.getCenter(new THREE.Vector3()));

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return fitted;
}
