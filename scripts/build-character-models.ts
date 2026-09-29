import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ENEMY_HITBOX,
  FRIENDLY_HITBOX,
  fitModelToHitbox,
} from '../src/game/characterModels.ts';

// GLTFExporter's binary path reads blobs with FileReader, which Bun does not provide.
if (typeof globalThis.FileReader === 'undefined') {
  class FileReaderPolyfill {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  }
  globalThis.FileReader = FileReaderPolyfill as unknown as typeof FileReader;
}

const outDir = path.resolve(import.meta.dirname, '../public/models');

function addPart(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number],
  rotation?: [number, number, number]
): void {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 })
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  parent.add(mesh);
}

/** Low-poly operator facing +Z, feet on y = 0. Original geometry for this project. */
function buildCharacter(kind: 'friendly' | 'enemy'): THREE.Group {
  const friendly = kind === 'friendly';
  const root = new THREE.Group();
  root.name = friendly ? 'FriendlyOperator' : 'HostileFighter';

  const cloth = friendly ? 0x1e3a8a : 0x7f1d1d;
  const vest = friendly ? 0x38bdf8 : 0xef4444;
  const accent = friendly ? 0x0ea5e9 : 0xb91c1c;
  const gear = friendly ? 0x0f172a : 0x292524;
  const skin = 0xe7c2a2;
  const stance = friendly ? 0.12 : 0.16;
  const torsoW = friendly ? 0.46 : 0.58;
  const torsoH = friendly ? 0.5 : 0.56;

  addPart(root, new THREE.CylinderGeometry(0.09, 0.11, 0.74, 10), cloth, [-stance, 0.37, 0]);
  addPart(root, new THREE.CylinderGeometry(0.09, 0.11, 0.74, 10), cloth, [stance, 0.37, 0]);
  addPart(root, new THREE.BoxGeometry(0.16, 0.1, 0.3), gear, [-stance, 0.05, 0.05]);
  addPart(root, new THREE.BoxGeometry(0.16, 0.1, 0.3), gear, [stance, 0.05, 0.05]);

  addPart(root, new THREE.BoxGeometry(torsoW, torsoH, 0.26), cloth, [0, 1.02, 0]);
  addPart(root, new THREE.BoxGeometry(torsoW * 0.86, 0.32, 0.32), vest, [0, 1.08, 0.03]);
  addPart(root, new THREE.BoxGeometry(0.22, 0.28, 0.16), gear, [0, 1.12, -0.16]);

  addPart(root, new THREE.SphereGeometry(0.1, 10, 8), accent, [-(torsoW / 2 + 0.04), 1.2, 0]);
  addPart(root, new THREE.SphereGeometry(0.1, 10, 8), accent, [torsoW / 2 + 0.04, 1.2, 0]);
  addPart(root, new THREE.CylinderGeometry(0.06, 0.07, 0.44, 8), cloth, [-0.34, 0.9, 0.1], [0.55, 0, 0.2]);
  addPart(root, new THREE.CylinderGeometry(0.06, 0.07, 0.44, 8), cloth, [0.34, 0.9, 0.16], [1.05, 0, -0.15]);

  addPart(root, new THREE.SphereGeometry(0.15, 14, 12), skin, [0, 1.48, 0.02]);

  if (friendly) {
    addPart(
      root,
      new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7),
      0xe2e8f0,
      [0, 1.52, 0]
    );
    addPart(root, new THREE.BoxGeometry(0.22, 0.05, 0.05), 0x082f49, [0, 1.46, 0.16]);
    addPart(root, new THREE.BoxGeometry(0.05, 0.07, 0.72), gear, [0.2, 1.02, 0.38]);
    addPart(root, new THREE.BoxGeometry(0.04, 0.14, 0.05), 0x334155, [0.2, 0.96, 0.08]);
  } else {
    addPart(root, new THREE.BoxGeometry(0.34, 0.16, 0.32), 0x111827, [0, 1.58, 0]);
    addPart(root, new THREE.BoxGeometry(0.28, 0.1, 0.08), 0x111827, [0, 1.46, 0.14]);
    addPart(root, new THREE.BoxGeometry(0.05, 0.08, 0.95), 0x44403c, [0.24, 1.0, 0.48]);
    addPart(root, new THREE.BoxGeometry(0.05, 0.16, 0.06), 0x1c1917, [0.24, 0.94, 0.06]);
  }

  return root;
}

async function exportGlb(root: THREE.Group, filePath: string): Promise<void> {
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(root, { binary: true });
  if (!(data instanceof ArrayBuffer)) {
    throw new Error(`Expected binary glTF for ${filePath}`);
  }
  fs.writeFileSync(filePath, Buffer.from(data));
}

async function assertFit(filePath: string, hitbox: THREE.Vector3): Promise<void> {
  const loader = new GLTFLoader();
  const bytes = fs.readFileSync(filePath);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const fitted = fitModelToHitbox(gltf.scene, hitbox);
  fitted.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(fitted);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  const within = (value: number, limit: number) => value <= limit + 1e-3;
  if (!within(size.x, hitbox.x) || !within(size.y, hitbox.y) || !within(size.z, hitbox.z)) {
    throw new Error(`${filePath} exceeds hitbox: ${size.x.toFixed(3)} ${size.y.toFixed(3)} ${size.z.toFixed(3)}`);
  }
  const touched =
    Math.abs(size.x - hitbox.x) < 0.02 ||
    Math.abs(size.y - hitbox.y) < 0.02 ||
    Math.abs(size.z - hitbox.z) < 0.02;
  if (!touched) {
    throw new Error(`${filePath} does not meet the hitbox: ${size.x.toFixed(3)} ${size.y.toFixed(3)} ${size.z.toFixed(3)}`);
  }
  if (center.length() > 1e-3) {
    throw new Error(`${filePath} is not centered: ${center.x} ${center.y} ${center.z}`);
  }
  console.log(
    `${path.basename(filePath)} fitted ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} (hitbox ${hitbox.x} x ${hitbox.y} x ${hitbox.z})`
  );
}

fs.mkdirSync(outDir, { recursive: true });
const friendlyPath = path.join(outDir, 'friendly.glb');
const enemyPath = path.join(outDir, 'enemy.glb');

await exportGlb(buildCharacter('friendly'), friendlyPath);
await exportGlb(buildCharacter('enemy'), enemyPath);
await assertFit(friendlyPath, FRIENDLY_HITBOX);
await assertFit(enemyPath, ENEMY_HITBOX);
