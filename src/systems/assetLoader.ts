/**
 * Structural prop loader.
 * Prefers authored .glb meshes and falls back to procedural cover when a file,
 * node, or texture is missing. Shared GLB geometry is never disposed with a scene clone.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CoverPropKind, StructuralPropKey } from './mapGenerator';

export const STRUCTURAL_PROP_URLS: Record<StructuralPropKey, string> = {
  ruined_brick: '/assets/props/ruined_brick_wall.glb',
  shipping_container: '/assets/props/shipping_container.glb',
  concrete_barrier: '/assets/props/concrete_barrier.glb',
  trench: '/assets/props/trench.glb',
};

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;

export interface CoverMaterialLibrary {
  brick: THREE.MeshStandardMaterial;
  brickDark: THREE.MeshStandardMaterial;
  container: THREE.MeshStandardMaterial;
  containerTrim: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  trench: THREE.MeshStandardMaterial;
  trenchLip: THREE.MeshStandardMaterial;
  crate: THREE.MeshStandardMaterial;
  crateStrap: THREE.MeshStandardMaterial;
}

interface UpgradeJob {
  key: StructuralPropKey;
  size: { x: number; y: number; z: number };
  cancelled: boolean;
  apply: (imported: THREE.Object3D) => void;
}

function ownMesh(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  return mesh;
}

function safeSize(size: { x: number; y: number; z: number } | null | undefined): { x: number; y: number; z: number } | null {
  if (!size) return null;
  if (!(size.x > 0) || !(size.y > 0) || !(size.z > 0)) return null;
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) return null;
  return size;
}

export function createCoverMaterials(): CoverMaterialLibrary {
  return {
    brick: new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.94, metalness: 0.02 }),
    brickDark: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.96, metalness: 0.02 }),
    container: new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.55, metalness: 0.45 }),
    containerTrim: new THREE.MeshStandardMaterial({ color: 0x431407, roughness: 0.6, metalness: 0.35 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.86, metalness: 0.04 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7, metalness: 0.05 }),
    trench: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 1, metalness: 0 }),
    trenchLip: new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.95, metalness: 0.02 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72, metalness: 0.05 }),
    crateStrap: new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8, metalness: 0.04 }),
  };
}

export function disposeCoverMaterials(library: CoverMaterialLibrary | null | undefined): void {
  if (!library) return;
  for (const material of Object.values(library)) {
    material.dispose();
  }
}

export function disposeOwnedGeometries(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.geometry || !mesh.userData?.ownsGeometry) return;
    mesh.geometry.dispose();
    mesh.userData.ownsGeometry = false;
  });
}

export function createProceduralCover(
  kind: CoverPropKind,
  size: { x: number; y: number; z: number },
  materials: CoverMaterialLibrary | null | undefined
): THREE.Group {
  const group = new THREE.Group();
  group.name = `procedural_${kind}`;
  const dims = safeSize(size);
  if (!dims || !materials) return group;

  if (kind === 'ruined_brick') {
    const segments = 4;
    const segW = dims.x / segments;
    for (let i = 0; i < segments; i++) {
      const broken = i === 2;
      const height = dims.y * (broken ? 0.36 : i === 0 ? 0.84 : i === 3 ? 0.7 : 1);
      const mesh = ownMesh(
        new THREE.Mesh(
          new THREE.BoxGeometry(segW * (broken ? 0.72 : 0.92), height, dims.z),
          i % 2 === 0 ? materials.brick : materials.brickDark
        )
      );
      mesh.position.set(-dims.x / 2 + segW * (i + 0.5), -dims.y / 2 + height / 2, 0);
      group.add(mesh);
      if (broken) {
        const rubble = ownMesh(
          new THREE.Mesh(
            new THREE.BoxGeometry(segW * 0.9, dims.y * 0.16, dims.z * 1.35),
            materials.brickDark
          )
        );
        rubble.position.set(-dims.x / 2 + segW * (i + 0.5), -dims.y / 2 + dims.y * 0.08, dims.z * 0.15);
        group.add(rubble);
      }
    }
    return group;
  }

  if (kind === 'shipping_container') {
    const body = ownMesh(new THREE.Mesh(new THREE.BoxGeometry(dims.x, dims.y * 0.9, dims.z), materials.container));
    body.position.y = -dims.y * 0.02;
    group.add(body);
    const rail = ownMesh(
      new THREE.Mesh(new THREE.BoxGeometry(dims.x * 1.02, dims.y * 0.08, dims.z * 1.04), materials.containerTrim)
    );
    rail.position.y = dims.y * 0.4;
    group.add(rail);
    const door = ownMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.08, dims.y * 0.72, dims.z * 0.9), materials.containerTrim)
    );
    door.position.set(dims.x / 2 - 0.02, -dims.y * 0.04, 0);
    group.add(door);
    return group;
  }

  if (kind === 'concrete_barrier') {
    const base = ownMesh(new THREE.Mesh(new THREE.BoxGeometry(dims.x, dims.y * 0.62, dims.z), materials.concrete));
    base.position.y = -dims.y * 0.16;
    group.add(base);
    const top = ownMesh(
      new THREE.Mesh(new THREE.BoxGeometry(dims.x * 0.94, dims.y * 0.38, dims.z * 0.62), materials.concrete)
    );
    top.position.y = dims.y * 0.26;
    group.add(top);
    const stripe = ownMesh(
      new THREE.Mesh(new THREE.BoxGeometry(dims.x * 0.96, dims.y * 0.1, dims.z * 0.68), materials.hazard)
    );
    stripe.position.y = dims.y * 0.08;
    group.add(stripe);
    return group;
  }

  if (kind === 'trench') {
    const floor = ownMesh(new THREE.Mesh(new THREE.BoxGeometry(dims.x * 0.94, 0.12, dims.z * 0.62), materials.trench));
    floor.position.y = -dims.y / 2 + 0.06;
    group.add(floor);
    const lipDepth = Math.max(0.18, dims.z * 0.18);
    for (const side of [-1, 1]) {
      const lip = ownMesh(new THREE.Mesh(new THREE.BoxGeometry(dims.x, dims.y, lipDepth), materials.trenchLip));
      lip.position.set(0, 0, side * dims.z * 0.38);
      group.add(lip);
    }
    return group;
  }

  const crate = ownMesh(new THREE.Mesh(new THREE.BoxGeometry(dims.x, dims.y, dims.z), materials.crate));
  group.add(crate);
  const strap = ownMesh(
    new THREE.Mesh(new THREE.BoxGeometry(dims.x * 1.02, dims.y * 0.12, dims.z * 0.18), materials.crateStrap)
  );
  strap.position.y = dims.y * 0.12;
  group.add(strap);
  return group;
}

function textureIsUsable(texture: THREE.Texture | null | undefined): boolean {
  if (!texture) return false;
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image) return false;
  if ((image.width ?? 0) > 0 || (image.height ?? 0) > 0) return true;
  return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
}

function sanitizeMaterial(material: THREE.Material | null | undefined): THREE.Material {
  if (!material) {
    return new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 });
  }
  const textured = material as THREE.MeshStandardMaterial;
  for (const slot of TEXTURE_SLOTS) {
    const texture = textured[slot] as THREE.Texture | null | undefined;
    if (texture && !textureIsUsable(texture)) {
      textured[slot] = null;
      texture.dispose();
    }
  }
  return material;
}

export function sanitizeImportedRoot(root: THREE.Object3D | null | undefined): THREE.Group | null {
  if (!root) return null;
  let meshCount = 0;
  const remove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.getAttribute?.('position');
    if (!mesh.geometry || !position || position.count === 0) {
      remove.push(mesh);
      return;
    }
    meshCount += 1;
    const source = mesh.material;
    if (Array.isArray(source)) {
      const fixed = source.map((entry) => sanitizeMaterial(entry));
      mesh.material = fixed.length > 0 ? fixed : sanitizeMaterial(null);
    } else {
      mesh.material = sanitizeMaterial(source);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ownsGeometry = false;
  });
  for (const dead of remove) {
    dead.parent?.remove(dead);
  }
  if (meshCount === 0) return null;
  const group = new THREE.Group();
  group.name = root.name || 'structural_prop';
  group.add(root);
  return group;
}

export function fitToFootprint(
  object: THREE.Object3D | null | undefined,
  size: { x: number; y: number; z: number }
): THREE.Group | null {
  const dims = safeSize(size);
  if (!object || !dims) return null;
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  const measured = new THREE.Vector3();
  bounds.getSize(measured);
  if (measured.x < 1e-4 || measured.y < 1e-4 || measured.z < 1e-4) return null;
  const scale = Math.min(dims.x / measured.x, dims.y / measured.y, dims.z / measured.z);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  object.scale.multiplyScalar(scale);
  object.updateWorldMatrix(true, true);
  const fitted = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  fitted.getCenter(center);
  object.position.sub(center);
  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.userData.ownsGeometry = false;
  return wrapper;
}

class StructuralAssetLoader {
  private loader: GLTFLoader | null = null;
  private templates = new Map<StructuralPropKey, THREE.Object3D | null>();
  private inflight = new Map<StructuralPropKey, Promise<THREE.Object3D | null>>();
  private jobs: UpgradeJob[] = [];

  private getLoader(): GLTFLoader | null {
    if (this.loader) return this.loader;
    try {
      this.loader = new GLTFLoader();
      return this.loader;
    } catch {
      return null;
    }
  }

  preloadAll(): void {
    (Object.keys(STRUCTURAL_PROP_URLS) as StructuralPropKey[]).forEach((key) => {
      void this.load(key);
    });
  }

  load(key: StructuralPropKey): Promise<THREE.Object3D | null> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = this.fetchTemplate(key)
      .then((template) => {
        this.templates.set(key, template);
        this.flush(key, template);
        return template;
      })
      .catch(() => {
        this.templates.set(key, null);
        this.flush(key, null);
        return null;
      });
    this.inflight.set(key, task);
    return task;
  }

  requestUpgrade(
    key: StructuralPropKey | null | undefined,
    size: { x: number; y: number; z: number },
    apply: (imported: THREE.Object3D) => void
  ): () => void {
    if (!key || !STRUCTURAL_PROP_URLS[key] || !safeSize(size)) return () => {};
    const job: UpgradeJob = { key, size, cancelled: false, apply };
    this.jobs.push(job);
    if (this.templates.has(key)) {
      this.applyJob(job, this.templates.get(key) ?? null);
    } else if (!this.inflight.has(key)) {
      void this.load(key);
    }
    return () => {
      job.cancelled = true;
    };
  }

  private flush(key: StructuralPropKey, template: THREE.Object3D | null): void {
    for (const job of this.jobs) {
      if (job.key !== key || job.cancelled) continue;
      this.applyJob(job, template);
    }
  }

  private applyJob(job: UpgradeJob, template: THREE.Object3D | null): void {
    if (job.cancelled) return;
    job.cancelled = true;
    if (!template) return;
    const clone = template.clone(true);
    const fitted = fitToFootprint(clone, job.size);
    if (!fitted) return;
    fitted.userData.structuralProp = job.key;
    fitted.userData.ownsGeometry = false;
    try {
      job.apply(fitted);
    } catch {
      // The scene may already have been torn down.
    }
  }

  private async fetchTemplate(key: StructuralPropKey): Promise<THREE.Object3D | null> {
    const url = STRUCTURAL_PROP_URLS[key];
    if (!url || typeof fetch !== 'function') return null;
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength < 20) return null;
    const loader = this.getLoader();
    if (!loader) return null;

    const gltf = await new Promise<{ scene?: THREE.Object3D | null } | null>((resolve) => {
      try {
        loader.parse(
          buffer,
          url.slice(0, url.lastIndexOf('/') + 1),
          (parsed) => resolve(parsed),
          () => resolve(null)
        );
      } catch {
        resolve(null);
      }
    });

    const scene = gltf?.scene ?? null;
    return sanitizeImportedRoot(scene);
  }
}

export const structuralAssets = new StructuralAssetLoader();

if (typeof window !== 'undefined') {
  structuralAssets.preloadAll();
}
