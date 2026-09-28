/**
 * Walk collision for the authored city.
 * Rays against the real meshes stop the player at walls and floors.
 * A triangle octree is a poor fit here: the street planes get copied into
 * every leaf and the player falls through.
 */

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { mapBounds } from './mapBounds';

export interface CityPoint {
  x: number;
  y: number;
  z: number;
}

export interface CitySpawnLayout {
  player: CityPoint;
  friendlies: CityPoint[];
  enemies: CityPoint[];
  covers: CityPoint[];
}

const ACTOR_RADIUS = 0.3;

export class CityCollision {
  readonly raycaster = new THREE.Raycaster();
  private meshes: THREE.Mesh[] = [];
  ready = false;

  buildFrom(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !isShown(mesh)) return;
      meshes.push(mesh);
    });
    this.meshes = meshes;
    this.ready = meshes.length > 0;
  }

  sampleGround(x: number, z: number, originY = 80, maxDrop = 40): number | null {
    const origin = new THREE.Vector3(x, originY, z);
    const hits = this.rayHitAll(origin, new THREE.Vector3(0, -1, 0), maxDrop);
    for (const hit of hits) {
      if (worldFaceNormal(hit).y >= 0.45) return hit.point.y;
    }
    return null;
  }

  fits(x: number, y: number, z: number, radius = ACTOR_RADIUS): boolean {
    const ground = this.sampleGround(x, z, y + 1.6, 2.2);
    if (ground == null || Math.abs(ground - y) > 0.45) return false;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const hit = this.rayHit(new THREE.Vector3(x, y + 1, z), dir, radius + 0.2);
      if (!hit || hit.distance >= radius) continue;
      if (worldFaceNormal(hit).y < 0.5) return false;
    }
    return true;
  }

  /**
   * Slides a capsule through the city. Returns whether it is standing on a floor.
   * Horizontal rays stop at walls. A vertical sweep lands on thin street decks
   * instead of falling through them.
   */
  moveCapsule(capsule: Capsule, velocity: THREE.Vector3, dt: number): boolean {
    const radius = capsule.radius;
    let feetY = capsule.start.y - radius;
    let x = capsule.start.x;
    let z = capsule.start.z;

    const hdx = velocity.x * dt;
    const hdz = velocity.z * dt;
    const hlen = Math.hypot(hdx, hdz);
    if (hlen > 0.0001) {
      const dir = new THREE.Vector3(hdx / hlen, 0, hdz / hlen);
      let allowed = this.wallClearance(x, feetY, z, dir, hlen, radius);
      if (allowed < hlen * 0.35) {
        const raised = feetY + 0.4;
        const stepped = this.wallClearance(x, raised, z, dir, hlen, radius);
        const stepX = x + dir.x * stepped;
        const stepZ = z + dir.z * stepped;
        const stepGround = this.sampleGround(stepX, stepZ, raised + 1.1, 1.5);
        if (
          stepped > allowed + 0.05 &&
          stepGround != null &&
          stepGround <= feetY + 0.42 &&
          stepGround >= feetY - 0.15
        ) {
          x = stepX;
          z = stepZ;
          feetY = stepGround;
          if (velocity.y < 0) velocity.y = 0;
          this.writeCapsule(capsule, x, feetY, z);
          return true;
        }
      }
      x += dir.x * allowed;
      z += dir.z * allowed;
    }

    if (velocity.y < -9) velocity.y = -9;
    const nextFeet = feetY + velocity.y * dt;
    const ground = this.sampleGround(x, z, feetY + 1.4, 3.2);
    if (ground != null && velocity.y <= 0 && nextFeet <= ground + 0.12 && feetY >= ground - 0.9) {
      this.writeCapsule(capsule, x, ground, z);
      velocity.y = 0;
      return true;
    }

    this.writeCapsule(capsule, x, nextFeet, z);
    return false;
  }

  settle(pos: { x: number; y?: number; z: number }, radius = ACTOR_RADIUS): boolean {
    const hinted = pos.y ?? 0;
    const ground = this.sampleGround(pos.x, pos.z, hinted + 1.7, 3);
    if (ground == null || !this.fits(pos.x, ground, pos.z, radius)) return false;
    pos.y = ground;
    return true;
  }

  blocksSegment(from: THREE.Vector3, to: THREE.Vector3, padding = 0.25): boolean {
    const delta = to.clone().sub(from);
    const dist = delta.length();
    if (dist < 0.05) return false;
    delta.multiplyScalar(1 / dist);
    const reach = dist - padding;
    if (reach <= 0) return false;
    return this.rayHit(from, delta, reach) != null;
  }

  collectSpawns(friendlyCount: number, enemyCount: number, coverCount: number): CitySpawnLayout {
    const bounds = new THREE.Box3();
    for (const mesh of this.meshes) bounds.expandByObject(mesh);
    const spots: CityPoint[] = [];
    const step = 5;
    for (let x = bounds.min.x + 2; x <= bounds.max.x - 2; x += step) {
      for (let z = bounds.min.z + 2; z <= bounds.max.z - 2; z += step) {
        const y = this.sampleGround(x, z, 120, 140);
        if (y == null || y < -0.8 || y > 1.4) continue;
        if (!this.fits(x, y, z)) continue;
        spots.push({ x, y, z });
      }
    }

    if (spots.length === 0) {
      const center = bounds.getCenter(new THREE.Vector3());
      const y = this.sampleGround(center.x, center.z, 120, 140) ?? 0;
      spots.push({ x: center.x, y, z: center.z });
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const spot of spots) {
      minX = Math.min(minX, spot.x);
      maxX = Math.max(maxX, spot.x);
      minZ = Math.min(minZ, spot.z);
      maxZ = Math.max(maxZ, spot.z);
    }
    mapBounds.minX = minX - 1.5;
    mapBounds.maxX = maxX + 1.5;
    mapBounds.minZ = minZ - 1.5;
    mapBounds.maxZ = maxZ + 1.5;

    const center = { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 };
    const player = nearest(spots, center);
    const friendlies = pick(spots, player, friendlyCount, 3.5, false, 2.5);
    const enemies = pick(spots, player, enemyCount, 8, true, 18);
    const covers = pick(spots, player, coverCount, 7, false, 6);
    return { player, friendlies, enemies, covers };
  }

  private wallClearance(
    x: number,
    feetY: number,
    z: number,
    dir: THREE.Vector3,
    distance: number,
    radius: number
  ): number {
    let allowed = distance;
    for (const height of [0.4, 0.95, 1.45]) {
      const hit = this.rayHit(new THREE.Vector3(x, feetY + height, z), dir, distance + radius);
      if (!hit) continue;
      if (worldFaceNormal(hit).y > 0.55) continue;
      const gap = hit.distance - radius - 0.05;
      if (gap < allowed) allowed = Math.max(0, gap);
    }
    return allowed;
  }

  private rayHit(origin: THREE.Vector3, direction: THREE.Vector3, far: number): THREE.Intersection | null {
    return this.rayHitAll(origin, direction, far)[0] ?? null;
  }

  private rayHitAll(origin: THREE.Vector3, direction: THREE.Vector3, far: number): THREE.Intersection[] {
    this.raycaster.set(origin, direction);
    this.raycaster.far = far;
    this.raycaster.near = 0;
    return this.raycaster.intersectObjects(this.meshes, false);
  }

  private writeCapsule(capsule: Capsule, x: number, feetY: number, z: number): void {
    const radius = capsule.radius;
    capsule.start.set(x, feetY + radius + 0.02, z);
    capsule.end.set(x, feetY + 1.5, z);
  }
}

function isShown(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function worldFaceNormal(hit: THREE.Intersection): THREE.Vector3 {
  const mesh = hit.object as THREE.Mesh;
  const face = hit.face;
  if (!face) return new THREE.Vector3(0, 1, 0);
  return face.normal.clone().transformDirection(mesh.matrixWorld);
}

function dist(a: CityPoint, b: CityPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearest(spots: CityPoint[], origin: CityPoint): CityPoint {
  return spots.reduce((best, spot) => (dist(spot, origin) < dist(best, origin) ? spot : best));
}

function pick(
  spots: CityPoint[],
  origin: CityPoint,
  count: number,
  minSep: number,
  preferFar: boolean,
  minFromOrigin: number
): CityPoint[] {
  const pool = [...spots].sort((a, b) => {
    const delta = dist(a, origin) - dist(b, origin);
    return preferFar ? -delta : delta;
  });
  const picked: CityPoint[] = [];
  const take = (sep: number, minDist: number) => {
    for (const spot of pool) {
      if (picked.length >= count) return;
      if (dist(spot, origin) < minDist) continue;
      if (picked.some((kept) => dist(kept, spot) < sep)) continue;
      picked.push(spot);
    }
  };
  take(minSep, minFromOrigin);
  if (picked.length < count) take(minSep * 0.45, 1);
  for (const spot of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(spot)) picked.push(spot);
  }
  return picked;
}
