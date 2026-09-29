import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import { obstaclesToColliders, stepProjectileThroughCover } from '../systems/ballistics.js';
import { suppressionSystem } from '../systems/suppression.js';
import { structuralAssets } from '../systems/assetLoader';
import { mountNightfang, NightfangAnimator } from './nightfangAnimator';
import { loadGhostCity, loadNightfangTemplate, tintActor } from '../systems/sceneAssets';
import { CityCollision, CitySpawnLayout } from './cityCollision';
import { mapBounds } from './mapBounds';
import { cameraRelativeWish } from './playerMovement';

export interface TacticalProjectile {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  isBluefor: boolean;
  shooterId: string;
  velocity: number;
  damageMultiplier: number;
  muzzleVelocity: number;
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
  ballisticMaterial?: 'wood' | 'concrete' | 'metal' | 'soil';
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
  public playerMesh: THREE.Object3D;
  public playerGroup: THREE.Group;
  public barrelMesh: THREE.Mesh;
  public godModeRing: THREE.Mesh;
  public tacticalLight: THREE.SpotLight;
  private baseFov = 72;
  private propUpgradeCancels: Array<() => void> = [];
  private city: CityCollision | null = null;
  private characterTemplate: THREE.Object3D | null = null;
  private playerVelocity = new THREE.Vector3();
  private playerOnGround = true;
  private playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 22), new THREE.Vector3(0, 1.5, 22), 0.3);
  private spawnPoint = new THREE.Vector3(0, 0, 22);
  private lookYaw = 0;
  private lookPitch = 0;
  private swayX = 0;
  private swayZ = 0;
  private disposed = false;
  private readonly localActorLayer = 1;
  private playerAnimator: NightfangAnimator | null = null;
  private adsActive = false;
  public onMapReady?: (layout: CitySpawnLayout, overheadMap: string | null) => void;
  public onMapFailed?: (message: string) => void;

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
    this.scene.background = new THREE.Color(0x8ea4b8);
    this.scene.fog = new THREE.Fog(0x8ea4b8, 24, 145);

    const width = container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
    const height = container.clientHeight > 0 ? container.clientHeight : window.innerHeight - 48;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.08, 600);
    this.camera.layers.disable(this.localActorLayer);
    this.camera.position.set(0, 1.62, 22);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    this.groundMesh.visible = false;
    this.gridHelper.visible = false;

    // Player feet sit on the ground. The body model is attached once Nightfang loads.
    // It is kept off the first-person camera layer so the view is from the eyes.
    this.playerGroup = new THREE.Group();
    const friendlyPad = TACTICAL_SPAWN_ZONES.find((z) => z.id === 'friendly_staging');
    this.playerGroup.position.set(friendlyPad?.position.x ?? 0, 0, friendlyPad?.position.z ?? 22);
    this.playerMesh = new THREE.Group();
    this.playerGroup.add(this.playerMesh);
    this.barrelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshBasicMaterial({ visible: false })
    );

    this.tacticalLight = new THREE.SpotLight(0xfff2cc, 0, 24, (18 * Math.PI) / 180, 0.45, 1);
    this.tacticalLight.position.set(0.12, 1.48, 0.25);
    this.tacticalLight.target.position.set(0, 1.4, 10);
    this.tacticalLight.castShadow = false;
    this.playerGroup.add(this.tacticalLight);
    this.playerGroup.add(this.tacticalLight.target);

    // God Mode Shield Ring
    const ringGeo = new THREE.RingGeometry(1.5, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    this.godModeRing = new THREE.Mesh(ringGeo, ringMat);
    this.godModeRing.rotation.x = Math.PI / 2;
    this.godModeRing.position.y = 0.05;
    this.godModeRing.visible = false;
    this.playerGroup.add(this.godModeRing);

    this.scene.add(this.playerGroup);
    this.syncFeetFromCollider();
    void this.loadAuthoredCity();

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

  private async loadAuthoredCity(): Promise<void> {
    try {
      const [mapRoot, character] = await Promise.all([loadGhostCity(), loadNightfangTemplate()]);
      if (this.disposed) return;

      this.characterTemplate = character;
      this.attachLocalPlayerModel(character);

      mapRoot.name = 'ghost_city';
      this.scene.add(mapRoot);

      const city = new CityCollision();
      city.buildFrom(mapRoot);
      if (this.disposed) return;
      this.city = city;

      try {
        this.buildCityWalls();
      } catch (wallError) {
        console.error(wallError);
      }
      let layout: CitySpawnLayout;
      try {
        layout = city.collectSpawns(4, 6, 12);
      } catch (spawnError) {
        console.error(spawnError);
        const spot = {
          x: (mapBounds.minX + mapBounds.maxX) / 2,
          y: 0,
          z: (mapBounds.minZ + mapBounds.maxZ) / 2,
        };
        layout = { player: spot, friendlies: [spot, spot, spot, spot], enemies: [spot], covers: [spot] };
      }
      this.spawnPoint.set(layout.player.x, layout.player.y, layout.player.z);
      this.placePlayerCapsule(layout.player.x, layout.player.y, layout.player.z);
      const aim = layout.enemies[0] ?? layout.covers[0] ?? layout.player;
      this.lookYaw = Math.atan2(aim.x - layout.player.x, aim.z - layout.player.z);
      this.lookPitch = 0;
      this.playerVelocity.set(0, 0, 0);
      this.syncFeetFromCollider();
      let overheadMap: string | null = null;
      try {
        overheadMap = this.captureOverheadMap();
      } catch (captureError) {
        console.error(captureError);
      }
      this.onMapReady?.(layout, overheadMap);
    } catch (error) {
      if (this.disposed) return;
      console.error(error);
      const message = error instanceof Error ? error.message : 'Ghost city failed to load';
      this.onMapFailed?.(message);
    }
  }

  private attachLocalPlayerModel(template: THREE.Object3D): void {
    const { pose, animator } = mountNightfang(template);
    // Keep our own body off the camera's layer so the view is from the eyes.
    pose.traverse((obj) => obj.layers.set(this.localActorLayer));
    this.playerMesh.add(pose);
    this.playerAnimator = animator;
  }

  /** Walk / sprint from movement, plus reload and hand-signal one-shots. */
  public setPlayerLocomotion(speed: number, sprinting: boolean): void {
    this.playerAnimator?.setLocomotion(speed, sprinting);
  }

  public triggerPlayerReload(): void {
    this.playerAnimator?.triggerReload(1.15);
  }

  public triggerPlayerSignal(): void {
    this.playerAnimator?.triggerSignal(1.2);
  }

  private placePlayerCapsule(x: number, y: number, z: number): void {
    const radius = this.playerCollider.radius;
    this.playerCollider.start.set(x, y + radius + 0.02, z);
    this.playerCollider.end.set(x, y + 1.5, z);
  }

  private syncFeetFromCollider(): void {
    const radius = this.playerCollider.radius;
    this.playerGroup.position.set(
      this.playerCollider.start.x,
      this.playerCollider.start.y - radius,
      this.playerCollider.start.z
    );
    this.playerGroup.rotation.y = this.lookYaw;
  }

  /** Mouse look. dx/dy are pointer-lock movement deltas in pixels. */
  public applyLook(dx: number, dy: number): void {
    const sensitivity = 0.0022;
    this.lookYaw -= dx * sensitivity;
    this.lookPitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.08;
    this.lookPitch = Math.max(-limit, Math.min(limit, this.lookPitch));
    this.playerGroup.rotation.y = this.lookYaw;
  }

  /**
   * First-person move. forward/strafe are in look space (W = +forward, D = +strafe).
   * Space jumps while the capsule is on the ground. Gravity pulls it back down.
   */
  public movePlayer(forward: number, strafe: number, dt: number, speed: number, jump = false): void {
    if (!this.city?.ready) return;

    const wish = cameraRelativeWish(this.lookYaw, forward, strafe);
    const wishX = wish.x;
    const wishZ = wish.z;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      this.playerVelocity.x = (wishX / wishLen) * speed;
      this.playerVelocity.z = (wishZ / wishLen) * speed;
    } else {
      this.playerVelocity.x = 0;
      this.playerVelocity.z = 0;
    }

    if (jump && this.playerOnGround) {
      this.playerVelocity.y = 8.4;
      this.playerOnGround = false;
    } else {
      this.playerVelocity.y -= 28 * dt;
    }
    this.playerOnGround = this.city.moveCapsule(this.playerCollider, this.playerVelocity, dt);
    this.syncFeetFromCollider();

    if (this.playerGroup.position.y < -12) {
      this.placePlayerCapsule(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
      this.playerVelocity.set(0, 0, 0);
      this.playerOnGround = true;
      this.syncFeetFromCollider();
    }
  }

  /** Plant an actor on the city mesh. Returns false when the spot is inside a wall. */
  public settleActor(pos: { x: number; y?: number; z: number }, radius = 0.3): boolean {
    if (this.city?.ready) {
      const planted = this.city.settle(pos, radius);
      if (!planted) return false;
      pos.x = Math.min(mapBounds.maxX, Math.max(mapBounds.minX, pos.x));
      pos.z = Math.min(mapBounds.maxZ, Math.max(mapBounds.minZ, pos.z));
      return true;
    }
    const resolved = this.resolveEntityCollision(pos, radius, 0);
    pos.x = resolved.x;
    pos.z = resolved.z;
    return true;
  }

  private makeActorModel(emissive: number): { pose: THREE.Group; animator: NightfangAnimator } {
    const template = this.characterTemplate;
    if (!template) {
      const pose = new THREE.Group();
      return { pose, animator: new NightfangAnimator(pose) };
    }
    const { pose, animator } = mountNightfang(template);
    tintActor(pose, emissive);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.03, 8, 18),
      new THREE.MeshBasicMaterial({ color: emissive })
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.02;
    pose.add(band);
    return { pose, animator };
  }

  private driveActor(
    group: THREE.Group,
    speed: number,
    sprint: boolean,
    shootCooldown: number,
    signal: boolean
  ): void {
    const animator = group.userData.animator as NightfangAnimator | undefined;
    if (!animator) return;
    const previousCooldown = group.userData.shootCooldown as number | undefined;
    if (previousCooldown !== undefined && shootCooldown > previousCooldown + 0.2) {
      animator.triggerReload();
    }
    group.userData.shootCooldown = shootCooldown;
    const previousSignal = group.userData.signaling === true;
    if (signal && !previousSignal) animator.triggerSignal();
    group.userData.signaling = signal;
    animator.setLocomotion(speed, sprint);
  }

  private actorSpeed(group: THREE.Group, x: number, z: number): number {
    const now = performance.now();
    const prev = group.userData.step as { x: number; z: number; t: number } | undefined;
    group.userData.step = { x, z, t: now };
    if (!prev) return 0;
    const elapsed = (now - prev.t) / 1000;
    if (elapsed <= 0.0001) return 0;
    return Math.hypot(x - prev.x, z - prev.z) / elapsed;
  }

  private updateFirstPersonCamera(): void {
    const feet = this.playerGroup.position;
    const yaw = this.lookYaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const eye = this.adsActive ? 1.58 : 1.62;
    this.camera.position.set(feet.x + this.swayX * 0.04, feet.y + eye, feet.z + this.swayZ * 0.04);
    const cosPitch = Math.cos(this.lookPitch);
    const look = new THREE.Vector3(sin * cosPitch, Math.sin(this.lookPitch), cos * cosPitch);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camera.position.clone().add(look));
    // Shots go where the crosshair points.
    this.aimPoint.copy(this.camera.position).addScaledVector(look, 48);
    this.tacticalLight.target.position.set(0, 1.48 + Math.sin(this.lookPitch) * 6, Math.max(0.2, cosPitch) * 8);
  }

  private bodyContains(point: THREE.Vector3, feet: THREE.Vector3): boolean {
    const dx = point.x - feet.x;
    const dz = point.z - feet.z;
    if (dx * dx + dz * dz > 0.45 * 0.45) return false;
    const y = point.y - feet.y;
    return y >= -0.05 && y <= 1.9;
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

  /**
   * Walls follow the outline of the city meshes that touch the ground,
   * so the barrier sits on the real map edge instead of a loose rectangle.
   */
  /**
   * Renders the city straight down over mapBounds into a PNG for the tactical map.
   * Only the city and lights are drawn; image top is -Z and image right is +X,
   * matching the map's canvas axes.
   */
  private captureOverheadMap(size = 768): string | null {
    const cityRoot = this.scene.getObjectByName('ghost_city');
    if (!cityRoot) return null;

    const hidden: THREE.Object3D[] = [];
    for (const child of this.scene.children) {
      if (child === cityRoot || (child as THREE.Light).isLight || !child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }
    const fog = this.scene.fog;
    const background = this.scene.background;
    this.scene.fog = null;
    this.scene.background = new THREE.Color(0x090d16);

    const cx = (mapBounds.minX + mapBounds.maxX) / 2;
    const cz = (mapBounds.minZ + mapBounds.maxZ) / 2;
    const half = Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ) / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 400);
    cam.position.set(cx, 200, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);

    const target = new THREE.WebGLRenderTarget(size, size);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(size * size * 4);
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, cam);
      this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
      this.renderer.setRenderTarget(null);
      target.dispose();
      this.scene.fog = fog;
      this.scene.background = background;
      for (const child of hidden) child.visible = true;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(size, size);
    const row = size * 4;
    // WebGL rows start at the bottom.
    for (let y = 0; y < size; y++) {
      image.data.set(pixels.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private buildCityWalls(): void {
    const cityRoot = this.scene.getObjectByName('ghost_city');
    if (!cityRoot || !this.city) return;

    const footprints: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
    cityRoot.updateWorldMatrix(true, true);
    cityRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const label = `${mesh.name} ${mesh.parent?.name ?? ''}`;
      if (/bake|vhc|mobil|car/i.test(label)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const local = mesh.geometry.boundingBox;
      if (!local) return;
      const bb = local.clone().applyMatrix4(mesh.matrixWorld);
      if (bb.min.y > 1.2) return;
      if (Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) < 4) return;
      footprints.push({ minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z });
    });
    if (footprints.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const foot of footprints) {
      minX = Math.min(minX, foot.minX);
      maxX = Math.max(maxX, foot.maxX);
      minZ = Math.min(minZ, foot.minZ);
      maxZ = Math.max(maxZ, foot.maxZ);
    }

    const cell = 2;
    const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    if (cols * rows > 250_000) return;
    const solid = new Uint8Array(cols * rows);
    const index = (c: number, r: number) => r * cols + c;
    for (const foot of footprints) {
      const c0 = Math.max(0, Math.floor((foot.minX - minX) / cell));
      const c1 = Math.min(cols - 1, Math.floor((foot.maxX - minX) / cell));
      const r0 = Math.max(0, Math.floor((foot.minZ - minZ) / cell));
      const r1 = Math.min(rows - 1, Math.floor((foot.maxZ - minZ) / cell));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) solid[index(c, r)] = 1;
      }
    }

    // Bridge small cracks between street meshes, then keep walls on the outside
    // of the city only. An interior seam must not grow a barrier across the road.
    let grown = solid;
    for (let pass = 0; pass < 2; pass++) {
      const next = new Uint8Array(cols * rows);
      next.set(grown);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grown[index(c, r)] !== 1) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nc = c + dc;
              const nr = r + dr;
              if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) next[index(nc, nr)] = 1;
            }
          }
        }
      }
      grown = next;
    }

    const exterior = new Uint8Array(cols * rows);
    const stack: number[] = [];
    const markOutside = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = index(c, r);
      if (grown[i] === 1 || exterior[i] === 1) return;
      exterior[i] = 1;
      stack.push(i);
    };
    for (let c = 0; c < cols; c++) {
      markOutside(c, 0);
      markOutside(c, rows - 1);
    }
    for (let r = 0; r < rows; r++) {
      markOutside(0, r);
      markOutside(cols - 1, r);
    }
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const c = i % cols;
      const r = (i - c) / cols;
      markOutside(c + 1, r);
      markOutside(c - 1, r);
      markOutside(c, r + 1);
      markOutside(c, r - 1);
    }

    const isSolid = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < cols && r < rows && grown[index(c, r)] === 1;
    const isOutside = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return true;
      return exterior[index(c, r)] === 1;
    };

    const material = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.92 });
    const height = 4.2;
    const thick = 0.85;
    const baseY = -0.35;
    const meshes: THREE.Mesh[] = [];
    let wallId = 0;
    const addWall = (x: number, z: number, sx: number, sz: number) => {
      const geo = new THREE.BoxGeometry(Math.max(sx, 0.3), height, Math.max(sz, 0.3));
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, baseY + height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
      wallId += 1;
      this.obstacles.push({
        id: `city_edge_${wallId}`,
        mesh,
        type: 'perimeter',
        pos: { x, y: baseY + height / 2, z },
        vel: { x: 0, z: 0 },
        size: { x: Math.max(sx, 0.3), y: height, z: Math.max(sz, 0.3) },
        movable: false,
        mass: 9999,
        ballisticMaterial: 'concrete',
      });
    };

    for (let r = 0; r < rows; r++) {
      let run = -1;
      const closeNorth = (end: number) => {
        if (run < 0) return;
        const x0 = minX + run * cell;
        const x1 = minX + (end + 1) * cell;
        addWall((x0 + x1) / 2, minZ + r * cell - thick / 2, x1 - x0, thick);
        run = -1;
      };
      let south = -1;
      const closeSouth = (end: number) => {
        if (south < 0) return;
        const x0 = minX + south * cell;
        const x1 = minX + (end + 1) * cell;
        addWall((x0 + x1) / 2, minZ + (r + 1) * cell + thick / 2, x1 - x0, thick);
        south = -1;
      };
      for (let c = 0; c <= cols; c++) {
        const northEdge = c < cols && isSolid(c, r) && isOutside(c, r - 1);
        if (northEdge) {
          if (run < 0) run = c;
        } else if (run >= 0) closeNorth(c - 1);
        const southEdge = c < cols && isSolid(c, r) && isOutside(c, r + 1);
        if (southEdge) {
          if (south < 0) south = c;
        } else if (south >= 0) closeSouth(c - 1);
      }
    }

    for (let c = 0; c < cols; c++) {
      let west = -1;
      const closeWest = (end: number) => {
        if (west < 0) return;
        const z0 = minZ + west * cell;
        const z1 = minZ + (end + 1) * cell;
        addWall(minX + c * cell - thick / 2, (z0 + z1) / 2, thick, z1 - z0);
        west = -1;
      };
      let east = -1;
      const closeEast = (end: number) => {
        if (east < 0) return;
        const z0 = minZ + east * cell;
        const z1 = minZ + (end + 1) * cell;
        addWall(minX + (c + 1) * cell + thick / 2, (z0 + z1) / 2, thick, z1 - z0);
        east = -1;
      };
      for (let r = 0; r <= rows; r++) {
        const westEdge = r < rows && isSolid(c, r) && isOutside(c - 1, r);
        if (westEdge) {
          if (west < 0) west = r;
        } else if (west >= 0) closeWest(r - 1);
        const eastEdge = r < rows && isSolid(c, r) && isOutside(c + 1, r);
        if (eastEdge) {
          if (east < 0) east = r;
        } else if (east >= 0) closeEast(r - 1);
      }
    }

    let sc0 = cols;
    let sc1 = 0;
    let sr0 = rows;
    let sr1 = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (solid[index(c, r)] !== 1) continue;
        sc0 = Math.min(sc0, c);
        sc1 = Math.max(sc1, c);
        sr0 = Math.min(sr0, r);
        sr1 = Math.max(sr1, r);
      }
    }
    if (sc1 >= sc0 && sr1 >= sr0) {
      mapBounds.minX = minX + sc0 * cell + 1.4;
      mapBounds.maxX = minX + (sc1 + 1) * cell - 1.4;
      mapBounds.minZ = minZ + sr0 * cell + 1.4;
      mapBounds.maxZ = minZ + (sr1 + 1) * cell - 1.4;
    }

    this.city.addColliders(meshes);
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
    this.addSolidBox('berm_north', 'wall', 0, -34, 18, 2.0, 1.4, wallMat, 1000, 'soil');
    this.addSolidBox('berm_mid_w', 'wall', -12, -8, 10, 1.9, 1.3, wallMat, 1000, 'soil');
    this.addSolidBox('berm_mid_e', 'wall', 12, -8, 10, 1.9, 1.3, wallMat, 1000, 'soil');
    this.addSolidBox('berm_cross_n', 'wall', 0, -16, 8, 1.8, 1.3, wallMat, 1000, 'soil');

    // Flanking L-walls that break long east–west sightlines
    this.addSolidBox('flank_w_n', 'wall', -30, -6, 1.3, 1.9, 8, wallMat);
    this.addSolidBox('flank_w_s', 'wall', -26, 2, 8, 1.9, 1.3, wallMat);
    this.addSolidBox('flank_e_n', 'wall', 30, -6, 1.3, 1.9, 8, wallMat);
    this.addSolidBox('flank_e_s', 'wall', 26, 2, 8, 1.9, 1.3, wallMat);

    // South staging screen — staggered chicane so BLUEFOR pad has no long-range LOS lane
    this.addSolidBox('screen_sw', 'wall', -11, 10, 12, 1.7, 1.2, wallMat);
    this.addSolidBox('screen_se', 'wall', 11, 10, 12, 1.7, 1.2, wallMat);
    this.addSolidBox('screen_mid_w', 'wall', -4, 7, 5, 1.6, 1.1, wallMat);
    this.addSolidBox('screen_mid_e', 'wall', 4, 4, 5, 1.6, 1.1, wallMat);
    this.addSolidBox('screen_chicane', 'wall', 0, 13, 4, 1.5, 1.1, wallMat);
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
        ballisticMaterial: 'wood',
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
    mass = 1000,
    ballisticMaterial?: TacticalObstacle['ballisticMaterial']
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
      ballisticMaterial: ballisticMaterial ?? (type === 'crate' ? 'wood' : 'concrete'),
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
      ballisticMaterial: 'concrete',
    });

    this.propUpgradeCancels.push(
      structuralAssets.requestUpgrade('concrete_barrier', { x: aabbX, y: 0.85, z: aabbZ }, (imported) => {
        imported.position.set(x, 0, z);
        imported.rotation.y = rotY;
        this.scene.add(imported);
        group.visible = false;
      })
    );
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
    if (this.city?.ready) {
      const chestFrom = new THREE.Vector3(from.x, 1.25, from.z);
      const chestTo = new THREE.Vector3(to.x, 1.25, to.z);
      if (this.city.blocksSegment(chestFrom, chestTo, 0.4)) return false;
    }

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
    friendlies.forEach((friendly) => {
      let group = this.friendlyMeshes.get(friendly.id);
      if (!group && this.characterTemplate) {
        const actor = this.makeActorModel(0x0284c7);
        group = new THREE.Group();
        group.add(actor.pose);
        group.userData.animator = actor.animator;
        this.scene.add(group);
        this.friendlyMeshes.set(friendly.id, group);
      }
      if (!group) return;

      group.position.set(friendly.position.x, friendly.position.y || 0, friendly.position.z);
      group.rotation.y = friendly.rotationY;
      const speed = this.actorSpeed(group, friendly.position.x, friendly.position.z);
      this.driveActor(
        group,
        speed,
        speed > 5.4 || friendly.state === 'bounding',
        friendly.shootCooldown,
        friendly.state === 'suppress' || friendly.state === 'take_cover'
      );

      if (friendly.status === 'KIA') {
        group.visible = false;
      } else {
        group.visible = true;
        group.scale.set(1, 1, 1);
      }
    });
  }

  public syncEnemies(enemies: EnemyCombatant[]): void {
    enemies.forEach((enemy) => {
      let group = this.enemyMeshes.get(enemy.id);
      if (!group && this.characterTemplate) {
        const actor = this.makeActorModel(0xb91c1c);
        group = new THREE.Group();
        group.add(actor.pose);
        group.userData.animator = actor.animator;

        if (enemy.isCommander) {
          const crownGeo = new THREE.TorusGeometry(0.28, 0.045, 8, 18);
          const crownMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
          const crown = new THREE.Mesh(crownGeo, crownMat);
          crown.rotation.x = Math.PI / 2;
          crown.position.y = 1.95;
          group.add(crown);
        }

        this.scene.add(group);
        this.enemyMeshes.set(enemy.id, group);
      }
      if (!group) return;

      group.position.set(enemy.position.x, enemy.position.y || 0, enemy.position.z);
      group.rotation.y = enemy.rotationY;
      const speed = this.actorSpeed(group, enemy.position.x, enemy.position.z);
      const sprinting =
        speed > 5.2 ||
        enemy.state === 'advance' ||
        enemy.state === 'flank_left' ||
        enemy.state === 'flank_right';
      this.driveActor(
        group,
        speed,
        sprinting,
        enemy.shootCooldown ?? 0,
        enemy.state === 'suppress' || enemy.state === 'overwatch'
      );

      if (enemy.health <= 0) {
        group.visible = false;
      } else {
        group.visible = true;
        group.scale.set(1, 1, 1);
      }
    });
  }

  // --- PROJECTILES & FAIR WEAPON BALLISTICS ---

  public shootPlayerBullet(
    _targetPos: THREE.Vector3,
    ballistics?: { speed?: number; velocity?: number; muzzleVelocity?: number }
  ): void {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (dir.lengthSq() < 0.001) {
      dir.set(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw));
    }
    dir.normalize();
    // Fire along the crosshair from the eye, starting clear of the near plane.
    const origin = this.camera.position.clone();
    origin.addScaledVector(dir, 1.0);

    const bGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const bMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const mesh = new THREE.Mesh(bGeo, bMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const muzzleVelocity = ballistics?.muzzleVelocity ?? 884;
    this.projectiles.push({
      mesh,
      dir,
      speed: ballistics?.speed ?? 36,
      life: 1.1, // Terminates after 1.1 seconds of flight
      isBluefor: true,
      shooterId: 'player',
      velocity: ballistics?.velocity ?? muzzleVelocity,
      damageMultiplier: 1,
      muzzleVelocity,
    });
  }

  public shootBullet(
    fromPos: { x: number; y: number; z: number },
    toPos: { x: number; y: number; z: number },
    isBluefor: boolean,
    shooterId: string
  ): void {
    const from = new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z);
    const to = new THREE.Vector3(toPos.x, toPos.y, toPos.z);
    const dir = new THREE.Vector3().subVectors(to, from);
    if (dir.lengthSq() < 0.001) return;
    dir.normalize();

    const bGeo = new THREE.SphereGeometry(isBluefor ? 0.35 : 0.4, 12, 12);
    const bMat = new THREE.MeshBasicMaterial({
      color: isBluefor ? 0x38bdf8 : 0xf97316,
    });
    const mesh = new THREE.Mesh(bGeo, bMat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    const muzzleVelocity = isBluefor ? 884 : 715;
    this.projectiles.push({
      mesh,
      dir,
      speed: 36,
      life: 1.1, // Terminates after 1.1 seconds of flight
      isBluefor,
      shooterId,
      velocity: muzzleVelocity,
      damageMultiplier: 1,
      muzzleVelocity,
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

  public setTacticalLight(
    enabled: boolean,
    opts?: { intensity?: number; distance?: number; angleDeg?: number; color?: number }
  ): void {
    if (!this.tacticalLight) return;
    this.tacticalLight.intensity = enabled ? (opts?.intensity ?? 6) : 0;
    this.tacticalLight.distance = opts?.distance ?? 24;
    this.tacticalLight.angle = ((opts?.angleDeg ?? 18) * Math.PI) / 180;
    if (opts?.color) this.tacticalLight.color.setHex(opts.color);
  }

  public setAdsZoom(zoom: number, aiming: boolean): void {
    this.adsActive = aiming;
    const next = this.baseFov / (aiming ? Math.max(1, zoom) : 1);
    if (Math.abs(this.camera.fov - next) > 0.05) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  public applySuppressionSway(offsetX: number, offsetZ: number): void {
    this.swayX = offsetX;
    this.swayZ = offsetZ;
  }

  public render(
    dt: number,
    onPlayerHit: (shooterId: string, damageScale?: number) => void,
    onFriendlyHit: (friendlyId: string, shooterId: string, damageScale?: number) => void,
    onEnemyHit: (enemyId: string, shooterId: string, damageScale?: number) => void
  ): void {
    this.playerAnimator?.update(dt);
    this.friendlyMeshes.forEach((group) => {
      (group.userData.animator as NightfangAnimator | undefined)?.update(dt);
    });
    this.enemyMeshes.forEach((group) => {
      (group.userData.animator as NightfangAnimator | undefined)?.update(dt);
    });

    this.updateFirstPersonCamera();

    // 3. Update Obstacle Physics
    this.updatePhysics(dt);

    // 4. Update Projectiles & Check Collision with Entities AND Obstacles
    const colliders = obstaclesToColliders(
      this.obstacles.map((obs) => ({
        id: obs.id,
        type: obs.type,
        material: obs.ballisticMaterial,
        pos: obs.pos,
        size: obs.size,
      }))
    );

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const segmentStart = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.life -= dt;

      const step = stepProjectileThroughCover({
        origin: { x: segmentStart.x, y: segmentStart.y, z: segmentStart.z },
        next: { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z },
        direction: { x: p.dir.x, y: p.dir.y, z: p.dir.z },
        velocity: p.velocity,
        damageMultiplier: p.damageMultiplier,
        muzzleVelocity: p.muzzleVelocity,
        colliders,
      });

      p.mesh.position.set(step.position.x, step.position.y, step.position.z);
      p.dir.set(step.direction.x, step.direction.y, step.direction.z);
      if (p.dir.lengthSq() > 0.0001) p.dir.normalize();
      p.velocity = step.velocity;
      p.damageMultiplier = step.damageMultiplier;

      if (step.absorbed) {
        if (!p.isBluefor) {
          suppressionSystem.registerWorldImpact(
            { x: step.position.x, z: step.position.z },
            { x: this.playerGroup.position.x, z: this.playerGroup.position.z }
          );
        }
        const hitId = step.event && 'id' in step.event ? step.event.id : null;
        const struck = hitId ? this.obstacles.find((obs) => obs.id === hitId) : undefined;
        if (struck?.movable) {
          struck.vel.x += p.dir.x * 2.8;
          struck.vel.z += p.dir.z * 2.8;
        }
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (this.city?.ready && this.city.blocksSegment(segmentStart, p.mesh.position, 0.05)) {
        if (!p.isBluefor) {
          suppressionSystem.registerWorldImpact(
            { x: p.mesh.position.x, z: p.mesh.position.z },
            { x: this.playerGroup.position.x, z: this.playerGroup.position.z }
          );
        }
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check entity collisions
      if (!p.isBluefor) {
        // Hostile bullet: Can hit Player OR Friendly AI
        if (this.bodyContains(p.mesh.position, this.playerGroup.position)) {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          this.projectiles.splice(i, 1);
          onPlayerHit(p.shooterId, p.damageMultiplier);
          continue;
        }

        for (const [fId, fGroup] of this.friendlyMeshes.entries()) {
          if (fGroup.visible && this.bodyContains(p.mesh.position, fGroup.position)) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            this.projectiles.splice(i, 1);
            onFriendlyHit(fId, p.shooterId, p.damageMultiplier);
            break;
          }
        }
      } else {
        // Bluefor bullet: Hits Enemies
        for (const [eId, eGroup] of this.enemyMeshes.entries()) {
          if (eGroup.visible && this.bodyContains(p.mesh.position, eGroup.position)) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            this.projectiles.splice(i, 1);
            onEnemyHit(eId, p.shooterId, p.damageMultiplier);
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
    this.disposed = true;
    this.onMapReady = undefined;
    this.onMapFailed = undefined;
    for (const cancel of this.propUpgradeCancels) cancel();
    this.propUpgradeCancels = [];
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.renderer.dispose();
    this.scene.clear();
  }
}
