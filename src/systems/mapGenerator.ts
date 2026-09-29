/**
 * Procedural compound layout.
 * Cover is placed along sightlines between the bluefor insert and OPFOR approach zones
 * so lanes are broken by ruined walls, containers, barriers, and trenches.
 */

export type CoverPropKind =
  | 'ruined_brick'
  | 'shipping_container'
  | 'concrete_barrier'
  | 'trench'
  | 'crate';

export type StructuralPropKey = 'ruined_brick' | 'shipping_container' | 'concrete_barrier' | 'trench';

export interface MapSpawnZone {
  id: string;
  faction: 'bluefor' | 'opfor';
  label: string;
  position: { x: number; z: number };
}

export interface GeneratedCoverNode {
  id: string;
  position: { x: number; y: number; z: number };
  isHighGround: boolean;
}

export interface MapCoverPlacement {
  id: string;
  kind: CoverPropKind;
  glbKey: StructuralPropKey | null;
  position: { x: number; y: number; z: number };
  rotationY: number;
  size: { x: number; y: number; z: number };
  movable: boolean;
  mass: number;
  coverNode: GeneratedCoverNode | null;
}

export interface TacticalMapLayout {
  seed: number;
  compoundHalf: number;
  spawns: MapSpawnZone[];
  placements: MapCoverPlacement[];
}

interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const COVER_SIZES: Record<CoverPropKind, { x: number; y: number; z: number }> = {
  ruined_brick: { x: 6.4, y: 2.15, z: 1.15 },
  shipping_container: { x: 6.0, y: 2.5, z: 2.4 },
  concrete_barrier: { x: 3.4, y: 1.15, z: 0.85 },
  trench: { x: 5.2, y: 0.72, z: 2.2 },
  crate: { x: 2.2, y: 1.8, z: 2.2 },
};

const KIND_CYCLE: StructuralPropKey[] = [
  'ruined_brick',
  'shipping_container',
  'concrete_barrier',
  'trench',
];

const SIGHTLINE_SAMPLES = [0.36, 0.56, 0.74];

export function createSpawnZones(): MapSpawnZone[] {
  return [
    { id: 'bluefor_insert', faction: 'bluefor', label: 'BLUEFOR INSERT', position: { x: 0, z: 0 } },
    { id: 'opfor_north', faction: 'opfor', label: 'NORTH ASSAULT', position: { x: 0, z: -36 } },
    { id: 'opfor_east', faction: 'opfor', label: 'EAST FLANK', position: { x: 32, z: -8 } },
    { id: 'opfor_west', faction: 'opfor', label: 'WEST BREACH', position: { x: -32, z: -8 } },
    { id: 'opfor_pincer_w', faction: 'opfor', label: 'PINCER WEST', position: { x: -20, z: 28 } },
    { id: 'opfor_pincer_e', faction: 'opfor', label: 'PINCER EAST', position: { x: 20, z: 28 } },
  ];
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function footprint(
  x: number,
  z: number,
  size: { x: number; y: number; z: number },
  rotationY: number,
  pad = 0
): Aabb {
  const swapped = Math.abs(Math.sin(rotationY)) > 0.5;
  const hx = (swapped ? size.z : size.x) / 2 + pad;
  const hz = (swapped ? size.x : size.z) / 2 + pad;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function insideCompound(box: Aabb, limit: number): boolean {
  return box.minX > -limit && box.maxX < limit && box.minZ > -limit && box.maxZ < limit;
}

function clearsPoint(box: Aabb, px: number, pz: number, radius: number): boolean {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  return Math.hypot(cx - px, cz - pz) >= radius;
}

function rotationForSightline(dx: number, dz: number): number {
  return Math.abs(dx) > Math.abs(dz) ? Math.PI / 2 : 0;
}

function coverAnchor(
  x: number,
  z: number,
  box: Aabb,
  safeX: number,
  safeZ: number
): { x: number; z: number } {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  let dx = safeX - cx;
  let dz = safeZ - cz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  for (let step = 1; step <= 24; step++) {
    const nx = cx + dx * step * 0.35;
    const nz = cz + dz * step * 0.35;
    const pad = 1.2;
    if (nx < box.minX - pad || nx > box.maxX + pad || nz < box.minZ - pad || nz > box.maxZ + pad) {
      return { x: nx, z: nz };
    }
  }
  return { x: cx + dx * 4.2, z: cz + dz * 4.2 };
}

function tryPlace(
  placements: MapCoverPlacement[],
  spawns: MapSpawnZone[],
  spec: {
    kind: CoverPropKind;
    x: number;
    z: number;
    rotationY: number;
    movable?: boolean;
    safe: { x: number; z: number };
  }
): boolean {
  const size = COVER_SIZES[spec.kind];
  if (!size || size.x <= 0 || size.y <= 0 || size.z <= 0) return false;

  const box = footprint(spec.x, spec.z, size, spec.rotationY, 0.7);
  if (!insideCompound(box, 37.5)) return false;
  if (!clearsPoint(box, 0, 0, 7.5)) return false;
  for (const spawn of spawns) {
    const radius = spawn.faction === 'bluefor' ? 7.5 : 5.2;
    if (!clearsPoint(box, spawn.position.x, spawn.position.z, radius)) return false;
  }
  for (const existing of placements) {
    const other = footprint(existing.position.x, existing.position.z, existing.size, existing.rotationY, 0.7);
    if (overlaps(box, other)) return false;
  }

  const anchor = coverAnchor(spec.x, spec.z, box, spec.safe.x, spec.safe.z);
  const glbKey: StructuralPropKey | null =
    spec.kind === 'crate' ? null : spec.kind;
  const id = `${spec.kind}_${placements.length}`;
  const isHighGround = spec.kind === 'shipping_container' && spec.z < -12;

  placements.push({
    id,
    kind: spec.kind,
    glbKey,
    position: { x: spec.x, y: size.y / 2, z: spec.z },
    rotationY: spec.rotationY,
    size: { ...size },
    movable: Boolean(spec.movable),
    mass: spec.movable ? 50 : spec.kind === 'concrete_barrier' ? 800 : 4000,
    coverNode: {
      id: `${id}_node`,
      position: { x: anchor.x, y: 0, z: anchor.z },
      isHighGround,
    },
  });
  return true;
}

export function generateTacticalLayout(seed = 0x44b201): TacticalMapLayout {
  const rng = mulberry32(seed);
  const spawns = createSpawnZones();
  const blue = spawns.find((spawn) => spawn.faction === 'bluefor') ?? spawns[0];
  const placements: MapCoverPlacement[] = [];
  let kindCursor = 0;

  const hostileSpawns = spawns.filter((spawn) => spawn.faction === 'opfor');
  for (const spawn of hostileSpawns) {
    const dx = spawn.position.x - blue.position.x;
    const dz = spawn.position.z - blue.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const dirX = dx / length;
    const dirZ = dz / length;
    const rotationY = rotationForSightline(dx, dz);
    const perpX = -dirZ;
    const perpZ = dirX;

    for (const sample of SIGHTLINE_SAMPLES) {
      const kind = KIND_CYCLE[kindCursor % KIND_CYCLE.length];
      const alongX = blue.position.x + dirX * length * sample;
      const alongZ = blue.position.z + dirZ * length * sample;
      const jitter = (rng() - 0.5) * 2.4;
      const candidates = [
        { x: alongX + perpX * jitter, z: alongZ + perpZ * jitter },
        { x: alongX, z: alongZ },
        { x: alongX + perpX * 2.2, z: alongZ + perpZ * 2.2 },
        { x: alongX - perpX * 2.2, z: alongZ - perpZ * 2.2 },
      ];

      let placed = false;
      for (const candidate of candidates) {
        if (
          tryPlace(placements, spawns, {
            kind,
            x: candidate.x,
            z: candidate.z,
            rotationY,
            safe: blue.position,
          })
        ) {
          placed = true;
          break;
        }
      }
      if (placed) kindCursor += 1;
    }
  }

  const fallbacks = [
    { x: -16, z: -20, rotationY: 0 },
    { x: 16, z: -18, rotationY: 0 },
    { x: -24, z: 8, rotationY: Math.PI / 2 },
    { x: 24, z: 6, rotationY: Math.PI / 2 },
    { x: 0, z: -22, rotationY: 0 },
    { x: -12, z: 16, rotationY: Math.PI / 2 },
    { x: 12, z: 18, rotationY: Math.PI / 2 },
  ];

  for (const kind of KIND_CYCLE) {
    if (placements.some((placement) => placement.kind === kind)) continue;
    for (const spot of fallbacks) {
      if (
        tryPlace(placements, spawns, {
          kind,
          x: spot.x,
          z: spot.z,
          rotationY: spot.rotationY,
          safe: blue.position,
        })
      ) {
        break;
      }
    }
  }

  const crateSpots = [
    { x: -18, z: -4 },
    { x: 18, z: 12 },
    { x: -8, z: 18 },
    { x: 22, z: -16 },
  ];
  for (const spot of crateSpots) {
    tryPlace(placements, spawns, {
      kind: 'crate',
      x: spot.x,
      z: spot.z,
      rotationY: 0,
      movable: true,
      safe: blue.position,
    });
  }

  return {
    seed: seed >>> 0,
    compoundHalf: 44,
    spawns,
    placements,
  };
}

export function layoutIssues(layout: TacticalMapLayout | null | undefined): string[] {
  const issues: string[] = [];
  if (!layout) return ['layout missing'];
  if (!layout.placements?.length) issues.push('no placements');
  if (!layout.spawns?.length) issues.push('no spawns');

  const present = new Set((layout.placements ?? []).map((placement) => placement.kind));
  for (const kind of KIND_CYCLE) {
    if (!present.has(kind)) issues.push(`missing ${kind}`);
  }

  const boxes = (layout.placements ?? []).map((placement) => ({
    id: placement.id,
    box: footprint(placement.position.x, placement.position.z, placement.size, placement.rotationY, 0),
  }));

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box || !insideCompound(box.box, 40)) issues.push(`out of bounds ${box?.id ?? i}`);
    if (box && !clearsPoint(box.box, 0, 0, 2.4)) issues.push(`blocks insert ${box.id}`);
    for (let j = i + 1; j < boxes.length; j++) {
      const other = boxes[j];
      if (other && overlaps(box.box, other.box)) issues.push(`overlap ${box.id} ${other.id}`);
    }
  }

  return issues;
}

function readSessionSeed(): number {
  const fallback = 0x44b201;
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.sessionStorage.getItem('tactical-map-seed');
    if (stored && /^\d+$/.test(stored)) return Number(stored) >>> 0;
    const seed = (Math.floor(Math.random() * 0xffffffff) ^ fallback) >>> 0;
    window.sessionStorage.setItem('tactical-map-seed', String(seed));
    return seed;
  } catch {
    return fallback;
  }
}

export const tacticalLayout: TacticalMapLayout = generateTacticalLayout(readSessionSeed());
