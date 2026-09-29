/**
 * Authored city and character meshes.
 * Ghost City is already in meters. Nightfang is scaled to a standing height
 * and planted on its feet so capsules and the first-person camera line up.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const GHOST_CITY_URL = '/assets/maps/ghost_city.glb';
export const NIGHTFANG_URL = '/assets/characters/nightfang.glb';

/** Meshes on this layer are drawn but left out of the city collision octree. */
export const COLLISION_SKIP_LAYER = 2;

const CHARACTER_HEIGHT = 1.82;

function loadGltf(url: string, attempt = 0): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  return new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, (error) => reject(error));
  }).catch(async (error: unknown) => {
    if (attempt >= 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return loadGltf(url, attempt + 1);
  });
}

export function prepareCityMap(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const label = `${obj.name} ${obj.parent?.name ?? ''}`;
    if (/bake/i.test(label)) {
      obj.layers.set(COLLISION_SKIP_LAYER);
      obj.visible = false;
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

export function fitCharacter(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const measured = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  measured.getSize(size);
  if (size.y > 0.001) root.scale.multiplyScalar(CHARACTER_HEIGHT / size.y);

  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  root.position.y -= grounded.min.y;

  root.updateMatrixWorld(true);
  const centered = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  centered.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return root;
}

export function tintActor(root: THREE.Object3D, emissive: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const tinted = source.map((material) => {
      const cloned = material.clone();
      const standard = cloned as THREE.MeshStandardMaterial;
      if (standard.emissive) {
        standard.emissive.setHex(emissive);
        standard.emissiveIntensity = 0.05;
      }
      return cloned;
    });
    mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
  });
}

export async function loadGhostCity(): Promise<THREE.Object3D> {
  const root = await loadGltf(GHOST_CITY_URL);
  prepareCityMap(root);
  return root;
}

export async function loadNightfangTemplate(): Promise<THREE.Object3D> {
  const root = await loadGltf(NIGHTFANG_URL);
  return fitCharacter(root);
}
