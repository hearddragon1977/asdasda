import * as THREE from 'three';
import { EnemyCombatant, FriendlyCombatant } from '../types/game';

export interface TacticalProjectile {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  isBluefor: boolean;
  shooterId: string;
}

export interface TacticalObstacle {
  id: string;
  mesh: THREE.Mesh;
  type: 'crate' | 'wall' | 'perimeter' | 'barrier';
  pos: { x: number; y: number; z: number };
  vel: { x: number; z: number };
  size: { x: number; y: number; z: number };
  movable: boolean;
  mass: number;
}

/** Designated spawn pad for bluefor / opfor tactical testing. */
export interface SpawnZone {
  id: string;
  faction: 'friendly' | 'enemy';
  label: string;
  /** Center of the spawn pad on the XZ plane. */
  position: { x: number; z: number };
  /** Half-extents of the pad (meters). */
  halfSize: { x: number; z: number };
}

/** Canonical spawn layout — shared by the scene builder and AI director. */
export const TACTICAL_SPAWN_ZONES: SpawnZone[] = [
  {
    id: 'friendly_staging',
    faction: 'friendly',
    label: 'BLUEFOR Staging',
    position: { x: 0, z: 22 },
    halfSize: { x: 8, z: 5 },
  },
  {
    id: 'enemy_north_gate',
    faction: 'enemy',
    label: 'OPFOR North Gate',
    position: { x: 0, z: -38 },
    halfSize: { x: 6, z: 3 },
  },
  {
    id: 'enemy_west_alley',
    faction: 'enemy',
    label: 'OPFOR West Alley',
    position: { x: -36, z: -4 },
    halfSize: { x: 3, z: 6 },
  },
  {
    id: 'enemy_east_alley',
    faction: 'enemy',
    label: 'OPFOR East Alley',
    position: { x: 36, z: -4 },
    halfSize: { x: 3, z: 6 },
  },
  {
    id: 'enemy_nw_warehouse',
    faction: 'enemy',
    label: 'OPFOR NW Breach',
    position: { x: -26, z: -32 },
    halfSize: { x: 4, z: 3 },
  },
  {
    id: 'enemy_ne_warehouse',
    faction: 'enemy',
    label: 'OPFOR NE Breach',
    position: { x: 26, z: -32 },
    halfSize: { x: 4, z: 3 },
  },
];

/** Cover nodes aligned to the urban compound berms / Jersey lanes. */
export const TACTICAL_COVER_NODES: Array<{
  id: string;
  position: { x: number; y: number; z: number };
  isHighGround: boolean;
}> = [
  { id: 'c1_berm_mid_w', position: { x: -12, y: 0, z: -8 }, isHighGround: false },
  { id: 'c2_berm_mid_e', position: { x: 12, y: 0, z: -8 }, isHighGround: false },
  { id: 'c3_north_berm', position: { x: 0, y: 0, z: -34 }, isHighGround: true },
  { id: 'c4_jersey_court_w', position: { x: -4, y: 0, z: 0 }, isHighGround: false },
  { id: 'c5_jersey_court_e', position: { x: 4, y: 0, z: 0 }, isHighGround: false },
  { id: 'c6_flank_w', position: { x: -26, y: 0, z: 2 }, isHighGround: false },
  { id: 'c7_flank_e', position: { x: 26, y: 0, z: 2 }, isHighGround: false },
  { id: 'c8_screen_sw', position: { x: -14, y: 0, z: 10 }, isHighGround: false },
  { id: 'c9_screen_se', position: { x: 14, y: 0, z: 10 }, isHighGround: false },
  { id: 'c10_staging_jersey', position: { x: 0, y: 0, z: 16 }, isHighGround: false },
  { id: 'c11_nw_door', position: { x: -18, y: 0, z: -23 }, isHighGround: false },
  { id: 'c12_ne_door', position: { x: 18, y: 0, z: -23 }, isHighGround: false },
];

export class ThreeTacticalWorld {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  // Player & Visuals
  public playerMesh: THREE.Mesh;
  public playerGroup: THREE.Group;
  public barrelMesh: THREE.Mesh;
  public godModeRing: THREE.Mesh;

  // Ground & Grid
  public groundMesh: THREE.Mesh;
  public gridHelper: THREE.GridHelper;

  // Combat Entities Meshes
  public enemyMeshes: Map<string, THREE.Group> = new Map();
  public friendlyMeshes: Map<string, THREE.Group> = new Map();

  // Physical Obstacles with 1:1 Visual Mesh & AABB Collision (ZERO INVISIBLE OBSTACLES)
  public obstacles: TacticalObstacle[] = [];

  /** Marked spawn pads used by AI director / LOS & movement tests. */
  public spawnZones: SpawnZone[] = [];

  // Projectiles
  public projectiles: TacticalProjectile[] = [];

  // Mouse Raycaster plane for top-down aim
  public groundPlane: THREE.Plane;
  public raycaster: THREE.Raycaster;
  public aimPoint: THREE.Vector3 = new THREE.Vector3(0, 0, -5);
  public lastMouseNorm: { x: number; y: number } = { x: 0, y: 0 };

  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLDivElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    const width = container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
    const height = container.clientHeight > 0 ? container.clientHeight : window.innerHeight - 48;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 32, 24);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';

    container.appendChild(canvas);

    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster = new THREE.Raycaster();

    // 1. Clear Tactical Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(30, 50, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x334155, 0.95);
    this.scene.add(hemiLight);

    // 2. High-Contrast Slate Ground Floor
    const groundGeo = new THREE.PlaneGeometry(96, 96);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.gridHelper = new THREE.GridHelper(96, 48, 0x94a3b8, 0x475569);
    this.gridHelper.position.y = 0.02;
    this.scene.add(this.gridHelper);

    // 3. Player: Bright Green Box + Directional Aim Barrel (starts on BLUEFOR staging pad)
    this.playerGroup = new THREE.Group();
    const friendlyPad = TACTICAL_SPAWN_ZONES.find((z) => z.id === 'friendly_staging');
    this.playerGroup.position.set(friendlyPad?.position.x ?? 0, 0.9, friendlyPad?.position.z ?? 22);

    const playerGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const playerMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.2,
      emissive: 0x16a34a,
      emissiveIntensity: 0.5,
    });
    this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this.playerMesh.castShadow = true;
    this.playerGroup.add(this.playerMesh);

    // Aim Barrel pointing in positive Z direction of local group
    const barrelGeo = new THREE.BoxGeometry(0.35, 0.35, 1.4);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x022c22,
      roughness: 0.4,
      emissive: 0x15803d,
      emissiveIntensity: 0.4,
    });
    this.barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
    this.barrelMesh.position.set(0, 0.3, 1.0);
    this.barrelMesh.castShadow = true;
    this.playerGroup.add(this.barrelMesh);

    // God Mode Shield Ring
    const ringGeo = new THREE.RingGeometry(1.5, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    this.godModeRing = new THREE.Mesh(ringGeo, ringMat);
    this.godModeRing.rotation.x = Math.PI / 2;
    this.godModeRing.position.y = 0.05;
    this.godModeRing.visible = false;
    this.playerGroup.add(this.godModeRing);

    this.scene.add(this.playerGroup);

    // 4. Physical Obstacles Setup (1:1 Visible Meshes, Zero Invisible Obstacles)
    this.buildPhysicalCompound();

    // 5. Setup Resize Observer
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            this.resize(w, h);
          }
        }
      });
      this.resizeObserver.observe(container);
    }
  }

  // --- PHYSICAL OBSTACLES: EVERY COLLISION OBJECT HAS A 1:1 VISIBLE 3D MESH ---
  private buildPhysicalCompound(): void {
    this.buildPerimeterWalls();
    this.buildUrbanInterior();
    this.buildJerseyBarriers();
    this.buildSupplyCrates();
    this.buildSpawnZones();
    this.buildCornerWatchtowers();
  }

  /** Outer security ring — visible BoxGeometry walls, zero invisible bounds. */
  private buildPerimeterWalls(): void {
    const perimeterMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
    });

    const perimeters = [
      { id: 'perim_north', x: 0, z: -44, sx: 88, sy: 2.2, sz: 1.2 },
      { id: 'perim_south', x: 0, z: 44, sx: 88, sy: 2.2, sz: 1.2 },
      { id: 'perim_west', x: -44, z: 0, sx: 1.2, sy: 2.2, sz: 88 },
      { id: 'perim_east', x: 44, z: 0, sx: 1.2, sy: 2.2, sz: 88 },
    ];

    perimeters.forEach((p) => {
      this.addSolidBox(p.id, 'perimeter', p.x, p.z, p.sx, p.sy, p.sz, perimeterMat, 9999);
    });
  }

  /**
   * Urban compound interior: building shells + blast walls that carve
   * alley corridors for line-of-sight and flanking movement tests.
   */
  private buildUrbanInterior(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72 });
    const darkWallMat = new THREE.MeshStandardMaterial({ color: 0x52606d, roughness: 0.78 });

    // Building shells (hollow courtyards formed by wall segments with door gaps)
    // NW warehouse — open doorway facing east
    this.addSolidBox('bldg_nw_n', 'wall', -26, -28, 14, 2.4, 1.2, darkWallMat);
    this.addSolidBox('bldg_nw_s', 'wall', -26, -18, 14, 2.4, 1.2, darkWallMat);
    this.addSolidBox('bldg_nw_w', 'wall', -33, -23, 1.2, 2.4, 10, darkWallMat);
    this.addSolidBox('bldg_nw_e_n', 'wall', -19, -26, 1.2, 2.4, 4, darkWallMat); // door gap at (-19, -23)

    // NE warehouse — open doorway facing west
    this.addSolidBox('bldg_ne_n', 'wall', 26, -28, 14, 2.4, 1.2, darkWallMat);
    this.addSolidBox('bldg_ne_s', 'wall', 26, -18, 14, 2.4, 1.2, darkWallMat);
    this.addSolidBox('bldg_ne_e', 'wall', 33, -23, 1.2, 2.4, 10, darkWallMat);
    this.addSolidBox('bldg_ne_w_n', 'wall', 19, -26, 1.2, 2.4, 4, darkWallMat); // door gap at (19, -23)

    // SW garage block — north-facing bay
    this.addSolidBox('bldg_sw_s', 'wall', -22, 28, 16, 2.2, 1.2, wallMat);
    this.addSolidBox('bldg_sw_w', 'wall', -30, 22, 1.2, 2.2, 12, wallMat);
    this.addSolidBox('bldg_sw_e', 'wall', -14, 24, 1.2, 2.2, 8, wallMat);
    this.addSolidBox('bldg_sw_n_w', 'wall', -26, 16, 8, 2.2, 1.2, wallMat); // bay gap at (-18, 16)

    // SE garage block — north-facing bay
    this.addSolidBox('bldg_se_s', 'wall', 22, 28, 16, 2.2, 1.2, wallMat);
    this.addSolidBox('bldg_se_e', 'wall', 30, 22, 1.2, 2.2, 12, wallMat);
    this.addSolidBox('bldg_se_w', 'wall', 14, 24, 1.2, 2.2, 8, wallMat);
    this.addSolidBox('bldg_se_n_e', 'wall', 26, 16, 8, 2.2, 1.2, wallMat); // bay gap at (18, 16)

    // Central blast berms — create a north–south kill lane with side cover
    this.addSolidBox('berm_north', 'wall', 0, -34, 18, 2.0, 1.4, wallMat);
    this.addSolidBox('berm_mid_w', 'wall', -12, -8, 10, 1.9, 1.3, wallMat);
    this.addSolidBox('berm_mid_e', 'wall', 12, -8, 10, 1.9, 1.3, wallMat);
    this.addSolidBox('berm_cross_n', 'wall', 0, -16, 8, 1.8, 1.3, wallMat);

    // Flanking L-walls that break long east–west sightlines
    this.addSolidBox('flank_w_n', 'wall', -30, -6, 1.3, 1.9, 8, wallMat);
    this.addSolidBox('flank_w_s', 'wall', -26, 2, 8, 1.9, 1.3, wallMat);
    this.addSolidBox('flank_e_n', 'wall', 30, -6, 1.3, 1.9, 8, wallMat);
    this.addSolidBox('flank_e_s', 'wall', 26, 2, 8, 1.9, 1.3, wallMat);

    // South staging screen — tighter center gap so BLUEFOR pad isn't an open kill lane
    this.addSolidBox('screen_sw', 'wall', -10, 10, 14, 1.7, 1.2, wallMat);
    this.addSolidBox('screen_se', 'wall', 10, 10, 14, 1.7, 1.2, wallMat);
    // Extra mid-lane Jersey-height blockers just north of staging
    this.addSolidBox('screen_mid_w', 'wall', -5, 6, 6, 1.5, 1.1, wallMat);
    this.addSolidBox('screen_mid_e', 'wall', 5, 6, 6, 1.5, 1.1, wallMat);
  }

  /**
   * Jersey barriers — stacked BoxGeometry approximating the classic
   * concrete trapezoid profile. Low cover that blocks bullets & movement
   * but leaves upper sightlines for testing crouched vs standing LOS.
   */
  private buildJerseyBarriers(): void {
    // Rows that form choke corridors and staggered mid-field cover
    const rows: Array<{ x: number; z: number; rotY: number }> = [
      // North approach chokepoint (gate funnels)
      { x: -6, z: -38, rotY: 0 },
      { x: 6, z: -38, rotY: 0 },
      { x: -10, z: -30, rotY: Math.PI / 2 },
      { x: 10, z: -30, rotY: Math.PI / 2 },

      // Central courtyard staggered cover
      { x: -4, z: 0, rotY: 0 },
      { x: 4, z: 0, rotY: 0 },
      { x: -8, z: 4, rotY: Math.PI / 2 },
      { x: 8, z: 4, rotY: Math.PI / 2 },
      { x: 0, z: -4, rotY: 0 },

      // East / west alley chokes
      { x: -36, z: -12, rotY: Math.PI / 2 },
      { x: -36, z: 4, rotY: Math.PI / 2 },
      { x: 36, z: -12, rotY: Math.PI / 2 },
      { x: 36, z: 4, rotY: Math.PI / 2 },

      // Friendly staging forward cover
      { x: -6, z: 16, rotY: 0 },
      { x: 6, z: 16, rotY: 0 },
      { x: -10, z: 20, rotY: Math.PI / 2 },
      { x: 10, z: 20, rotY: Math.PI / 2 },
    ];

    rows.forEach((b, idx) => {
      this.addJerseyBarrier(`jersey_${idx}`, b.x, b.z, b.rotY);
    });
  }

  /** Movable wood crates for pushable cover tests. */
  private buildSupplyCrates(): void {
    const crateGeo = new THREE.BoxGeometry(2.2, 1.8, 2.2);
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.5,
      metalness: 0.1,
    });

    const crateLocations = [
      [-14, -14],
      [14, -14],
      [-18, 6],
      [18, 6],
      [-24, -2],
      [24, -2],
      [0, 8],
      [-8, -22],
      [8, -22],
    ];

    crateLocations.forEach(([x, z], idx) => {
      const crateMesh = new THREE.Mesh(crateGeo, crateMat);
      crateMesh.position.set(x, 0.9, z);
      crateMesh.castShadow = true;
      crateMesh.receiveShadow = true;
      this.scene.add(crateMesh);

      this.obstacles.push({
        id: `crate_${idx}`,
        mesh: crateMesh,
        type: 'crate',
        pos: { x, y: 0.9, z },
        vel: { x: 0, z: 0 },
        size: { x: 2.2, y: 1.8, z: 2.2 },
        movable: true,
        mass: 50,
      });
    });
  }

  /**
   * Designated friendly / enemy spawn pads — thin emissive ground markers
   * so testers can see staging areas while validating LOS & movement.
   */
  private buildSpawnZones(): void {
    this.spawnZones = TACTICAL_SPAWN_ZONES.map((z) => ({ ...z }));

    this.spawnZones.forEach((zone) => {
      const isFriendly = zone.faction === 'friendly';
      const color = isFriendly ? 0x22c55e : 0xef4444;
      const padGeo = new THREE.BoxGeometry(zone.halfSize.x * 2, 0.08, zone.halfSize.z * 2);
      const padMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.9,
        transparent: true,
        opacity: 0.45,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(zone.position.x, 0.06, zone.position.z);
      pad.receiveShadow = true;
      this.scene.add(pad);

      // Corner posts so the pad reads clearly from the tactical camera
      const postGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
      const postMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        roughness: 0.4,
      });
      const corners: Array<[number, number]> = [
        [-zone.halfSize.x, -zone.halfSize.z],
        [zone.halfSize.x, -zone.halfSize.z],
        [-zone.halfSize.x, zone.halfSize.z],
        [zone.halfSize.x, zone.halfSize.z],
      ];
      corners.forEach(([cx, cz]) => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(zone.position.x + cx, 0.45, zone.position.z + cz);
        post.castShadow = true;
        this.scene.add(post);
      });
    });
  }

  private buildCornerWatchtowers(): void {
    const towerGeo = new THREE.CylinderGeometry(1.2, 1.4, 4.5, 8);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const cornerPositions = [
      [-44, -44],
      [44, -44],
      [-44, 44],
      [44, 44],
    ];
    cornerPositions.forEach(([x, z]) => {
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(x, 2.25, z);
      tower.castShadow = true;
      this.scene.add(tower);
    });
  }

  /** Axis-aligned solid BoxGeometry wall registered for collision + ballistics. */
  private addSolidBox(
    id: string,
    type: TacticalObstacle['type'],
    x: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    mass = 1000
  ): void {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, sy / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.obstacles.push({
      id,
      mesh,
      type,
      pos: { x, y: sy / 2, z },
      vel: { x: 0, z: 0 },
      size: { x: sx, y: sy, z: sz },
      movable: false,
      mass,
    });
  }

  /**
   * Classic Jersey barrier approximated with two BoxGeometry sections:
   * wide base foot + narrower upper wall (~3.2m long × 0.85m tall).
   * Collision AABB uses the full footprint so movement & bullets both stop.
   */
  private addJerseyBarrier(id: string, x: number, z: number, rotY = 0): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.85,
      metalness: 0.05,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.55,
      emissive: 0xb45309,
      emissiveIntensity: 0.15,
    });

    // Base foot (wider)
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.7), concreteMat);
    base.position.y = 0.175;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Upper barrier body (narrower trapezoid stand-in)
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.38), concreteMat);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Hazard stripe on the face
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.4), stripeMat);
    stripe.position.y = 0.55;
    group.add(stripe);

    this.scene.add(group);

    // Collision uses the rotated AABB of the full barrier footprint
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const localW = 3.2;
    const localD = 0.7;
    const aabbX = localW * cos + localD * sin;
    const aabbZ = localW * sin + localD * cos;

    // Proxy mesh for obstacle bookkeeping (matches AABB center)
    const proxyGeo = new THREE.BoxGeometry(aabbX, 0.85, aabbZ);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
    proxyMesh.position.set(x, 0.425, z);
    this.scene.add(proxyMesh);

    this.obstacles.push({
      id,
      mesh: proxyMesh,
      type: 'barrier',
      pos: { x, y: 0.425, z },
      vel: { x: 0, z: 0 },
      size: { x: aabbX, y: 0.85, z: aabbZ },
      movable: false,
      mass: 800,
    });
  }

  /** Look up a spawn zone by id (used by AI director / test harnesses). */
  public getSpawnZone(id: string): SpawnZone | undefined {
    return this.spawnZones.find((z) => z.id === id);
  }

  public getSpawnZonesByFaction(faction: 'friendly' | 'enemy'): SpawnZone[] {
    return this.spawnZones.filter((z) => z.faction === faction);
  }

  /**
   * Axis-aligned LOS probe against solid obstacles (walls, barriers, perimeter, crates).
   * Returns true when the segment from A→B is unobstructed at chest height.
   */
  public hasLineOfSight(
    from: { x: number; z: number },
    to: { x: number; z: number },
    minCoverHeight = 0.7
  ): boolean {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;

    const steps = Math.max(4, Math.ceil(dist / 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = from.x + dx * t;
      const pz = from.z + dz * t;

      for (const obs of this.obstacles) {
        if (obs.size.y < minCoverHeight) continue;
        const halfX = obs.size.x / 2;
        const halfZ = obs.size.z / 2;
        if (Math.abs(px - obs.pos.x) <= halfX && Math.abs(pz - obs.pos.z) <= halfZ) {
          return false;
        }
      }
    }
    return true;
  }

  // --- PHYSICS ENGINE: CRATE MOMENTUM & DAMPING ---
  public updatePhysics(dt: number): void {
    const damping = Math.pow(0.85, dt * 60);

    for (const obs of this.obstacles) {
      if (!obs.movable) continue;

      obs.pos.x += obs.vel.x * dt;
      obs.pos.z += obs.vel.z * dt;

      obs.vel.x *= damping;
      obs.vel.z *= damping;

      if (Math.hypot(obs.vel.x, obs.vel.z) < 0.02) {
        obs.vel.x = 0;
        obs.vel.z = 0;
      }

      // Constrain crates inside compound
      obs.pos.x = Math.max(-41, Math.min(41, obs.pos.x));
      obs.pos.z = Math.max(-41, Math.min(41, obs.pos.z));

      obs.mesh.position.x = obs.pos.x;
      obs.mesh.position.z = obs.pos.z;
    }
  }

  /**
   * EXACT AABB COLLISION RESOLUTION:
   * Uses tight radius (0.55m) matching entity geometry to prevent invisible barrier overlap!
   */
  public resolveEntityCollision(
    entityPos: { x: number; z: number },
    entityRadius = 0.55,
    pushForce = 2.0
  ): { x: number; z: number } {
    let rx = entityPos.x;
    let rz = entityPos.z;

    for (const obs of this.obstacles) {
      const halfX = obs.size.x / 2 + entityRadius;
      const halfZ = obs.size.z / 2 + entityRadius;

      const dx = rx - obs.pos.x;
      const dz = rz - obs.pos.z;

      if (Math.abs(dx) < halfX && Math.abs(dz) < halfZ) {
        const overlapX = halfX - Math.abs(dx);
        const overlapZ = halfZ - Math.abs(dz);

        if (overlapX < overlapZ) {
          const sign = dx > 0 ? 1 : -1;
          rx = obs.pos.x + sign * halfX;
          if (obs.movable) {
            obs.vel.x -= sign * pushForce;
          }
        } else {
          const sign = dz > 0 ? 1 : -1;
          rz = obs.pos.z + sign * halfZ;
          if (obs.movable) {
            obs.vel.z -= sign * pushForce;
          }
        }
      }
    }

    return { x: rx, z: rz };
  }

  // --- SYNC FRIENDLIES (BLUEFOR) ---
  public syncFriendlies(friendlies: FriendlyCombatant[]): void {
    const friendlyBoxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const friendlyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });

    const barrelGeo = new THREE.BoxGeometry(0.3, 0.3, 1.3);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0369a1 });

    friendlies.forEach((friendly) => {
      let group = this.friendlyMeshes.get(friendly.id);
      if (!group) {
        group = new THREE.Group();
        const box = new THREE.Mesh(friendlyBoxGeo, friendlyMat);
        box.castShadow = true;
        group.add(box);

        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(0, 0.25, 0.9);
        group.add(barrel);

        this.scene.add(group);
        this.friendlyMeshes.set(friendly.id, group);
      }

      group.position.set(friendly.position.x, 0.75, friendly.position.z);
      group.rotation.y = friendly.rotationY;

      if (friendly.status === 'KIA') {
        group.scale.set(0.1, 0.1, 0.1);
        group.visible = false;
      } else {
        group.scale.set(1, 1, 1);
        group.visible = true;
      }
    });
  }

  // --- SYNC HOSTILE ENEMIES (RED SPHERES + COMMANDER CHEVRON) ---
  public syncEnemies(enemies: EnemyCombatant[]): void {
    const enemyGeo = new THREE.SphereGeometry(1.0, 24, 24);
    const enemyMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.2,
      emissive: 0xdc2626,
      emissiveIntensity: 0.6,
    });

    enemies.forEach((enemy) => {
      let group = this.enemyMeshes.get(enemy.id);
      if (!group) {
        group = new THREE.Group();
        const mesh = new THREE.Mesh(enemyGeo, enemyMat);
        mesh.castShadow = true;
        group.add(mesh);

        if (enemy.isCommander) {
          const crownGeo = new THREE.TorusGeometry(1.0, 0.14, 12, 24);
          const crownMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
          const crown = new THREE.Mesh(crownGeo, crownMat);
          crown.rotation.x = Math.PI / 2;
          crown.position.y = 1.25;
          group.add(crown);
        }

        this.scene.add(group);
        this.enemyMeshes.set(enemy.id, group);
      }

      group.position.set(enemy.position.x, 1.0, enemy.position.z);

      if (enemy.health <= 0) {
        group.scale.set(0.1, 0.1, 0.1);
        group.visible = false;
      } else {
        group.scale.set(1, 1, 1);
        group.visible = true;
      }
    });
  }

  // --- PROJECTILES & FAIR WEAPON BALLISTICS ---

  public shootPlayerBullet(targetPos: THREE.Vector3): void {
    const origin = this.playerGroup.position.clone();
    origin.y = 0.9;

    let dir = new THREE.Vector3().subVectors(targetPos, origin);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) {
      dir = new THREE.Vector3(Math.sin(this.playerGroup.rotation.y), 0, Math.cos(this.playerGroup.rotation.y));
    }
    dir.normalize();

    const bGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const bMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const mesh = new THREE.Mesh(bGeo, bMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      dir,
      speed: 36,
      life: 1.1, // Terminates after 1.1 seconds of flight
      isBluefor: true,
      shooterId: 'player',
    });
  }

  public shootBullet(
    fromPos: { x: number; y: number; z: number },
    toPos: { x: number; y: number; z: number },
    isBluefor: boolean,
    shooterId: string
  ): void {
    const from = new THREE.Vector3(fromPos.x, 0.9, fromPos.z);
    const to = new THREE.Vector3(toPos.x, 0.9, toPos.z);
    const dir = new THREE.Vector3().subVectors(to, from);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) return;
    dir.normalize();

    const bGeo = new THREE.SphereGeometry(isBluefor ? 0.35 : 0.4, 12, 12);
    const bMat = new THREE.MeshBasicMaterial({
      color: isBluefor ? 0x38bdf8 : 0xf97316,
    });
    const mesh = new THREE.Mesh(bGeo, bMat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      dir,
      speed: 36,
      life: 1.1, // Terminates after 1.1 seconds of flight
      isBluefor,
      shooterId,
    });
  }

  public setGodMode(active: boolean): void {
    this.godModeRing.visible = active;
  }

  /**
   * CONTINUOUS RAY PROJECTION & STABLE AIM:
   * Sets player rotation towards ground mouse intersection with zero rotational tilt or drift!
   */
  public updateAimFromMouse(normalizedX: number, normalizedY: number): void {
    this.lastMouseNorm = { x: normalizedX, y: normalizedY };
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);
    const intersection = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, intersection)) {
      this.aimPoint.copy(intersection);
      const lookDir = new THREE.Vector3().subVectors(this.aimPoint, this.playerGroup.position);
      lookDir.y = 0;
      if (lookDir.lengthSq() > 0.01) {
        this.playerGroup.rotation.y = Math.atan2(lookDir.x, lookDir.z);
      }
    }
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public render(
    dt: number,
    onPlayerHit: (shooterId: string) => void,
    onFriendlyHit: (friendlyId: string, shooterId: string) => void,
    onEnemyHit: (enemyId: string, shooterId: string) => void
  ): void {
    // 1. Camera Follow: Rigid 1:1 camera lock to player position
    // Eliminates camera position lag, camera orientation tilt, and aim drift while walking!
    this.camera.position.x = this.playerGroup.position.x;
    this.camera.position.z = this.playerGroup.position.z + 24;
    this.camera.position.y = 32;
    this.camera.lookAt(this.playerGroup.position.x, 0, this.playerGroup.position.z);

    // 2. Re-project aim raycast through locked camera so aim direction remains completely steady!
    this.updateAimFromMouse(this.lastMouseNorm.x, this.lastMouseNorm.y);

    // 3. Update Obstacle Physics
    this.updatePhysics(dt);

    // 4. Update Projectiles & Check Collision with Entities AND Obstacles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.life -= dt;

      let bulletAbsorbed = false;

      // Obstacle bullet collision (Box AABB check matching 1:1 mesh)
      for (const obs of this.obstacles) {
        const halfX = obs.size.x / 2 + 0.15;
        const halfZ = obs.size.z / 2 + 0.15;
        if (
          Math.abs(p.mesh.position.x - obs.pos.x) < halfX &&
          Math.abs(p.mesh.position.z - obs.pos.z) < halfZ
        ) {
          bulletAbsorbed = true;
          if (obs.movable) {
            obs.vel.x += p.dir.x * 2.8;
            obs.vel.z += p.dir.z * 2.8;
          }
          break;
        }
      }

      if (bulletAbsorbed) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check entity collisions
      if (!p.isBluefor) {
        // Hostile bullet: Can hit Player OR Friendly AI
        const distToPlayer = p.mesh.position.distanceTo(this.playerGroup.position);
        if (distToPlayer < 1.2) {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          this.projectiles.splice(i, 1);
          onPlayerHit(p.shooterId);
          continue;
        }

        for (const [fId, fGroup] of this.friendlyMeshes.entries()) {
          if (fGroup.visible && p.mesh.position.distanceTo(fGroup.position) < 1.2) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            this.projectiles.splice(i, 1);
            onFriendlyHit(fId, p.shooterId);
            break;
          }
        }
      } else {
        // Bluefor bullet: Hits Enemies
        for (const [eId, eGroup] of this.enemyMeshes.entries()) {
          if (eGroup.visible && p.mesh.position.distanceTo(eGroup.position) < 1.3) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            this.projectiles.splice(i, 1);
            onEnemyHit(eId, p.shooterId);
            break;
          }
        }
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.renderer.dispose();
    this.scene.clear();
  }
}
