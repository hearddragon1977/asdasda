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

import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import type { CoverPropKind } from '../systems/mapGenerator';
import { tacticalLayout } from '../systems/mapGenerator';
import {
  createCoverMaterials,
  createProceduralCover,
  disposeOwnedGeometries,
  structuralAssets,
  type CoverMaterialLibrary,
} from '../systems/assetLoader';


export interface TacticalProjectile {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  isBluefor: boolean;
  shooterId: string;
}

export type TacticalCoverKind = CoverPropKind | 'wall' | 'perimeter';

export interface TacticalObstacle {
  id: string;
  mesh: THREE.Object3D;
  type: TacticalCoverKind;
  pos: { x: number; y: number; z: number };
  vel: { x: number; z: number };
  size: { x: number; y: number; z: number };
  movable: boolean;
  mass: number;
}

export class ThreeTacticalWorld {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  // Player & Visuals
  public playerMesh: THREE.Object3D;
  public playerMesh: THREE.Mesh;

  public playerGroup: THREE.Group;
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
  public onMapReady?: (layout: CitySpawnLayout) => void;
  public onMapFailed?: (message: string) => void;


  // Ground & Grid
  public groundMesh: THREE.Mesh;
  public gridHelper: THREE.GridHelper;

  // Combat Entities Meshes
  public enemyMeshes: Map<string, THREE.Group> = new Map();
  public friendlyMeshes: Map<string, THREE.Group> = new Map();

  private gltfLoader = new GLTFLoader();
  private friendlyTemplate: THREE.Object3D | null = null;
  private enemyTemplate: THREE.Object3D | null = null;
  private characterLoadState: 'loading' | 'ready' | 'failed' = 'loading';

  // Physical Obstacles with 1:1 Visual Mesh & AABB Collision (ZERO INVISIBLE OBSTACLES)
  public obstacles: TacticalObstacle[] = [];

  // Projectiles
  public projectiles: TacticalProjectile[] = [];

  // Mouse Raycaster plane for top-down aim
  public groundPlane: THREE.Plane;
  public raycaster: THREE.Raycaster;
  public aimPoint: THREE.Vector3 = new THREE.Vector3(0, 0, -5);
  public lastMouseNorm: { x: number; y: number } = { x: 0, y: 0 };

  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private propUnsubs: Array<() => void> = [];
  private sharedGeometries: THREE.BufferGeometry[] = [];
  private sharedMaterials: THREE.Material[] = [];
  private coverMaterials: CoverMaterialLibrary | null = null;
  private friendlyBodyGeo!: THREE.BoxGeometry;
  private friendlyBodyMat!: THREE.MeshStandardMaterial;
  private friendlyBarrelGeo!: THREE.BoxGeometry;
  private friendlyBarrelMat!: THREE.MeshStandardMaterial;
  private enemyBodyGeo!: THREE.SphereGeometry;
  private enemyBodyMat!: THREE.MeshStandardMaterial;
  private commanderRingGeo!: THREE.TorusGeometry;
  private commanderRingMat!: THREE.MeshBasicMaterial;
  private bulletGeoBlue!: THREE.SphereGeometry;
  private bulletGeoHostile!: THREE.SphereGeometry;
  private bulletMatPlayer!: THREE.MeshBasicMaterial;
  private bulletMatFriendly!: THREE.MeshBasicMaterial;
  private bulletMatHostile!: THREE.MeshBasicMaterial;

  constructor(container: HTMLDivElement) {
    if (!container) {
      throw new Error('Tactical viewport container is missing.');
    }
    this.initSharedResources();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    const width = container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
    const height = container.clientHeight > 0 ? container.clientHeight : window.innerHeight - 48;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 32, 24);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

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
    this.groundMesh.userData.ownsGeometry = true;
    this.scene.add(this.groundMesh);
    this.sharedMaterials.push(groundMat);

    this.gridHelper = new THREE.GridHelper(96, 48, 0x94a3b8, 0x475569);
    this.gridHelper.position.y = 0.02;
    this.gridHelper.userData.ownsGeometry = true;
    this.scene.add(this.gridHelper);

    // Player feet sit on the ground. The body model is attached once Nightfang loads.
    // It is kept off the first-person camera layer so the view is from the eyes.
    // 3. Player: Bright Green Box + Directional Aim Barrel
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, 0.9, 0);

    const playerGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const playerMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.2,
      emissive: 0x16a34a,
      emissiveIntensity: 0.5,
    });
    this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this.playerMesh.castShadow = true;
    this.playerMesh.userData.ownsGeometry = true;
    this.playerGroup.add(this.playerMesh);
 cursor/glb-character-models-59f4
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

    this.sharedMaterials.push(playerMat);

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
    this.barrelMesh.userData.ownsGeometry = true;
    this.playerGroup.add(this.barrelMesh);
    this.sharedMaterials.push(barrelMat);

    // Weapon tactical flashlight — casts a dynamic beam when activated
    this.tacticalSpot = new THREE.SpotLight(0xfff2cc, 0, 40, THREE.MathUtils.degToRad(28), 0.45, 1.2);
    this.tacticalSpot.position.set(0, 0.35, 1.35);
    this.tacticalSpot.castShadow = true;
    this.tacticalSpotVisibleGuard();
    this.tacticalSpotTarget = new THREE.Object3D();
    this.tacticalSpotTarget.position.set(0, 0.2, 12);
    this.playerGroup.add(this.tacticalSpotTarget);
    this.tacticalSpot.target = this.tacticalSpotTarget;
    this.playerGroup.add(this.tacticalSpot);


    // God Mode Shield Ring
    const ringGeo = new THREE.RingGeometry(1.5, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    this.godModeRing = new THREE.Mesh(ringGeo, ringMat);
    this.godModeRing.rotation.x = Math.PI / 2;
    this.godModeRing.position.y = 0.05;
    this.godModeRing.visible = false;
    this.godModeRing.userData.ownsGeometry = true;
    this.playerGroup.add(this.godModeRing);
    this.sharedMaterials.push(ringMat);

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

  private initSharedResources(): void {
    this.coverMaterials = createCoverMaterials();
    this.sharedMaterials.push(...Object.values(this.coverMaterials));

    this.friendlyBodyGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    this.friendlyBodyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });
    this.friendlyBarrelGeo = new THREE.BoxGeometry(0.3, 0.3, 1.3);
    this.friendlyBarrelMat = new THREE.MeshStandardMaterial({ color: 0x0369a1 });
    this.enemyBodyGeo = new THREE.SphereGeometry(1.0, 24, 24);
    this.enemyBodyMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.2,
      emissive: 0xdc2626,
      emissiveIntensity: 0.6,
    });
    this.commanderRingGeo = new THREE.TorusGeometry(1.0, 0.14, 12, 24);
    this.commanderRingMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    this.bulletGeoBlue = new THREE.SphereGeometry(0.35, 10, 10);
    this.bulletGeoHostile = new THREE.SphereGeometry(0.4, 10, 10);
    this.bulletMatPlayer = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    this.bulletMatFriendly = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.bulletMatHostile = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    this.sharedGeometries.push(
      this.friendlyBodyGeo,
      this.friendlyBarrelGeo,
      this.enemyBodyGeo,
      this.commanderRingGeo,
      this.bulletGeoBlue,
      this.bulletGeoHostile
    );
    this.sharedMaterials.push(
      this.friendlyBodyMat,
      this.friendlyBarrelMat,
      this.enemyBodyMat,
      this.commanderRingMat,
      this.bulletMatPlayer,
      this.bulletMatFriendly,
      this.bulletMatHostile
    );
  }

  // --- PHYSICAL OBSTACLES: EVERY COLLISION OBJECT HAS A 1:1 VISIBLE 3D MESH ---
  private buildPhysicalCompound(): void {
    this.buildGeneratedCover();
    this.buildPerimeter();
    this.buildWatchtowers();
  }

  private buildGeneratedCover(): void {
    const placements = tacticalLayout?.placements ?? [];
    for (const placement of placements) {
      if (!placement?.position || !placement.size) continue;
      const visual = createProceduralCover(placement.kind, placement.size, this.coverMaterials);
      visual.position.set(placement.position.x, placement.position.y, placement.position.z);
      visual.rotation.y = placement.rotationY || 0;
      this.scene.add(visual);

      const swapped = Math.abs(Math.sin(visual.rotation.y)) > 0.5;
      const obstacle: TacticalObstacle = {
        id: placement.id,
        mesh: visual,
        type: placement.kind,
        pos: { x: placement.position.x, y: placement.position.y, z: placement.position.z },
        vel: { x: 0, z: 0 },
        size: {
          x: swapped ? placement.size.z : placement.size.x,
          y: placement.size.y,
          z: swapped ? placement.size.x : placement.size.z,
        },
        movable: placement.movable,
        mass: placement.mass > 0 ? placement.mass : 50,
      };
      this.obstacles.push(obstacle);

      if (!placement.glbKey) continue;
      const cancel = structuralAssets.requestUpgrade(placement.glbKey, placement.size, (imported) => {
        if (this.disposed || !imported) return;
        imported.position.copy(visual.position);
        imported.rotation.copy(visual.rotation);
        this.scene.add(imported);
        this.scene.remove(visual);
        disposeOwnedGeometries(visual);
        if (obstacle.mesh === visual) obstacle.mesh = imported;
      });
      this.propUnsubs.push(cancel);
    }
  }

  private buildPerimeter(): void {
    const perimeterMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
    });
    this.sharedMaterials.push(perimeterMat);

    const perimeters = [
      { id: 'perim_north', x: 0, z: -44, sx: 88, sy: 2.2, sz: 1.2 },
      { id: 'perim_south', x: 0, z: 44, sx: 88, sy: 2.2, sz: 1.2 },
      { id: 'perim_west', x: -44, z: 0, sx: 1.2, sy: 2.2, sz: 88 },
      { id: 'perim_east', x: 44, z: 0, sx: 1.2, sy: 2.2, sz: 88 },
    ];

    perimeters.forEach((p) => {
      const geo = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
      const mesh = new THREE.Mesh(geo, perimeterMat);
      mesh.position.set(p.x, p.sy / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.ownsGeometry = true;
      this.scene.add(mesh);

      this.obstacles.push({
        id: p.id,
        mesh,
        type: 'perimeter',
        pos: { x: p.x, y: p.sy / 2, z: p.z },
        vel: { x: 0, z: 0 },
        size: { x: p.sx, y: p.sy, z: p.sz },
        movable: false,
        mass: 9999,
      });
    });
  }

  private buildWatchtowers(): void {
    const towerGeo = new THREE.CylinderGeometry(1.2, 1.4, 4.5, 8);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    this.sharedGeometries.push(towerGeo);
    this.sharedMaterials.push(towerMat);
    const cornerPositions = [
      [-44, -44], [44, -44], [-44, 44], [44, 44],
    ];
    cornerPositions.forEach(([x, z]) => {
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(x, 2.25, z);
      tower.castShadow = true;
      tower.userData.ownsGeometry = false;
      this.scene.add(tower);
    });

    this.loadCharacterModels();
  }

  private loadCharacterModels(): void {
    Promise.all([
      this.gltfLoader.loadAsync(FRIENDLY_MODEL_URL),
      this.gltfLoader.loadAsync(ENEMY_MODEL_URL),
    ])
      .then(([friendly, enemy]) => {
        this.friendlyTemplate = fitModelToHitbox(friendly.scene, FRIENDLY_HITBOX);
        this.enemyTemplate = fitModelToHitbox(enemy.scene, ENEMY_HITBOX);
        this.characterLoadState = 'ready';
        this.attachPlayerModel();
      })
      .catch((error: unknown) => {
        this.characterLoadState = 'failed';
        console.error('Failed to load character models from /models', error);
      });
  }

  private attachCharacter(
    group: THREE.Group,
    template: THREE.Object3D | null,
    createFallback: () => THREE.Object3D
  ): void {
    if (group.getObjectByName('character')) return;
    if (this.characterLoadState === 'loading') return;

    const character =
      this.characterLoadState === 'ready' && template ? template.clone(true) : createFallback();
    character.name = 'character';
    group.add(character);
  }

  /** Same clone path as a friendly: the operator GLB fitted to the squad hitbox. */
  private attachPlayerModel(): void {
    if (!this.friendlyTemplate || this.playerGroup.getObjectByName('character')) return;

    const character = this.friendlyTemplate.clone(true);
    character.name = 'character';
    this.playerGroup.add(character);
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

      if (obs.mesh?.position) {
        obs.mesh.position.x = obs.pos.x;
        obs.mesh.position.z = obs.pos.z;
      }
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
  public syncFriendlies(friendlies: FriendlyCombatant[] | null | undefined): void {
    const live = friendlies ?? [];
    const liveIds = new Set<string>();

    live.forEach((friendly) => {
      if (!friendly?.id) return;
      liveIds.add(friendly.id);
      let group = this.friendlyMeshes.get(friendly.id);
      if (!group) {
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

        const box = new THREE.Mesh(this.friendlyBodyGeo, this.friendlyBodyMat);
        box.castShadow = true;
        box.userData.ownsGeometry = false;
        group.add(box);

        const barrel = new THREE.Mesh(this.friendlyBarrelGeo, this.friendlyBarrelMat);
        barrel.position.set(0, 0.25, 0.9);
        barrel.userData.ownsGeometry = false;
        group.add(barrel);

        this.scene.add(group);
        this.friendlyMeshes.set(friendly.id, group);
      }

      const px = friendly.position?.x ?? 0;
      const pz = friendly.position?.z ?? 0;
      group.position.set(px, 0.75, pz);
      group.rotation.y = Number.isFinite(friendly.rotationY) ? friendly.rotationY : 0;


      if (friendly.status === 'KIA') {
        group.visible = false;
      } else {
        group.scale.set(1, 1, 1);
        group.visible = true;
      }
    });

    this.dropMissing(this.friendlyMeshes, liveIds);
  }

  public syncEnemies(enemies: EnemyCombatant[]): void {
    enemies.forEach((enemy) => {

  // --- SYNC HOSTILE ENEMIES (RED SPHERES + COMMANDER CHEVRON) ---
  public syncEnemies(enemies: EnemyCombatant[] | null | undefined): void {
    const live = enemies ?? [];
    const liveIds = new Set<string>();

    live.forEach((enemy) => {
      if (!enemy?.id) return;
      liveIds.add(enemy.id);

      let group = this.enemyMeshes.get(enemy.id);
      if (!group) {
        group = new THREE.Group();
        group.add(actor.pose);
        group.userData.animator = actor.animator;

        const mesh = new THREE.Mesh(this.enemyBodyGeo, this.enemyBodyMat);
        mesh.castShadow = true;
        mesh.userData.ownsGeometry = false;
        group.add(mesh);


        if (enemy.isCommander) {
          const crown = new THREE.Mesh(this.commanderRingGeo, this.commanderRingMat);
          crown.rotation.x = Math.PI / 2;
          crown.position.y = 1.95;

          crown.position.y = 1.25;
          crown.userData.ownsGeometry = false;

          group.add(crown);
        }

        this.scene.add(group);
        this.enemyMeshes.set(enemy.id, group);
      }
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


      group.position.set(enemy.position?.x ?? 0, 1.0, enemy.position?.z ?? 0);

      if ((enemy.health ?? 0) <= 0) {

        group.visible = false;
      } else {
        group.scale.set(1, 1, 1);
        group.visible = true;
      }
    });

    this.dropMissing(this.enemyMeshes, liveIds);
  }

  private dropMissing(meshes: Map<string, THREE.Group>, liveIds: Set<string>): void {
    for (const [id, group] of meshes) {
      if (liveIds.has(id) || !group) continue;
      this.scene.remove(group);
      disposeOwnedGeometries(group);
      meshes.delete(id);
    }
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

    const mesh = new THREE.Mesh(this.bulletGeoBlue, this.bulletMatPlayer);
    mesh.userData.ownsGeometry = false;
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
    if (!fromPos || !toPos) return;
    const from = new THREE.Vector3(fromPos.x, 0.9, fromPos.z);
    const to = new THREE.Vector3(toPos.x, 0.9, toPos.z);
    if (!Number.isFinite(from.x) || !Number.isFinite(to.x) || !Number.isFinite(from.z) || !Number.isFinite(to.z)) return;
    const dir = new THREE.Vector3().subVectors(to, from);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) return;
    dir.normalize();

    const mesh = new THREE.Mesh(
      isBluefor ? this.bulletGeoBlue : this.bulletGeoHostile,
      isBluefor ? this.bulletMatFriendly : this.bulletMatHostile
    );
    mesh.userData.ownsGeometry = false;
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

  /** Ensures spotlight starts disabled (intensity 0). */
  private tacticalSpotVisibleGuard(): void {
    this.tacticalSpot.intensity = 0;
  }

  /**
   * Toggle / configure the weapon-mounted tactical flashlight from
   * equipment attachment stats (src/data/gear.js flashlight profiles).
   */
  public setTacticalLight(
    enabled: boolean,
    profile?: {
      intensity?: number;
      rangeM?: number;
      coneAngleDeg?: number;
      color?: number;
    }
  ): void {
    if (!enabled) {
      this.tacticalSpot.intensity = 0;
      return;
    }
    const intensity = profile?.intensity ?? 3.2;
    const rangeM = profile?.rangeM ?? 36;
    const cone = profile?.coneAngleDeg ?? 28;
    const color = profile?.color ?? 0xfff2cc;
    this.tacticalSpot.color.setHex(color);
    this.tacticalSpot.distance = rangeM;
    this.tacticalSpot.angle = THREE.MathUtils.degToRad(cone);
    this.tacticalSpot.intensity = intensity;
    this.tacticalSpotTarget.position.set(0, 0.15, Math.max(8, rangeM * 0.45));
  }

  /**
   * ADS zoom from equipped optic — pulls the tactical camera in and
   * tightens FOV while aimingDownSights is active.
   */
  public setAdsZoom(zoomMul: number, aiming: boolean): void {
    this.adsZoomMul = aiming ? Math.max(1, zoomMul) : 1;
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
    onPlayerHit: (shooterId: string, damageScale?: number) => void,
    onFriendlyHit: (friendlyId: string, shooterId: string, damageScale?: number) => void,
    onEnemyHit: (enemyId: string, shooterId: string, damageScale?: number) => void

    onPlayerHit: (shooterId: string) => void,
    onFriendlyHit: (friendlyId: string, shooterId: string) => void,
    onEnemyHit: (enemyId: string, shooterId: string) => void

  ): void {
    this.playerAnimator?.update(dt);
    this.friendlyMeshes.forEach((group) => {
      (group.userData.animator as NightfangAnimator | undefined)?.update(dt);
    });
    this.enemyMeshes.forEach((group) => {
      (group.userData.animator as NightfangAnimator | undefined)?.update(dt);
    });


    // 2. Re-project aim raycast through locked camera so aim direction remains completely steady!
    this.updateAimFromMouse(this.lastMouseNorm.x, this.lastMouseNorm.y);

    // 3. Update Obstacle Physics
    this.updatePhysics(dt);

    // 4. Update Projectiles & Check Collision with Entities AND Obstacles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p?.mesh || !p.dir) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.life -= dt;

      let bulletAbsorbed = false;

      // Obstacle bullet collision (Box AABB check matching 1:1 mesh)
      for (const obs of this.obstacles) {
        if (!obs?.size || !obs.pos) continue;
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

      if (bulletAbsorbed) {
        this.retireProjectile(i);

        continue;
      }

      // Check entity collisions
      if (!p.isBluefor) {
        // Hostile bullet: Can hit Player OR Friendly AI
        const distToPlayer = p.mesh.position.distanceTo(this.playerGroup.position);
        if (distToPlayer < 1.2) {
          this.retireProjectile(i);
          if (typeof onPlayerHit === 'function') onPlayerHit(p.shooterId);
          continue;
        }

        let friendlyHit = false;
        for (const [fId, fGroup] of this.friendlyMeshes.entries()) {
          if (fGroup?.visible && p.mesh.position.distanceTo(fGroup.position) < 1.2) {
            this.retireProjectile(i);
            if (typeof onFriendlyHit === 'function') onFriendlyHit(fId, p.shooterId);
            friendlyHit = true;
            break;
          }
        }
        if (friendlyHit) continue;
      } else {
        // Bluefor bullet: Hits Enemies
        let enemyHit = false;
        for (const [eId, eGroup] of this.enemyMeshes.entries()) {
          if (eGroup?.visible && p.mesh.position.distanceTo(eGroup.position) < 1.3) {
            this.retireProjectile(i);
            if (typeof onEnemyHit === 'function') onEnemyHit(eId, p.shooterId);
            enemyHit = true;
            break;
          }
        }
        if (enemyHit) continue;
      }

      if (p.life <= 0) {
        this.retireProjectile(i);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private retireProjectile(index: number): void {
    const projectile = this.projectiles[index];
    if (!projectile) return;
    if (projectile.mesh) this.scene.remove(projectile.mesh);
    this.projectiles.splice(index, 1);
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.propUnsubs) cancel();
    this.propUnsubs = [];
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    for (const projectile of this.projectiles) {
      if (projectile?.mesh) this.scene.remove(projectile.mesh);
    }
    this.projectiles = [];
    this.friendlyMeshes.clear();
    this.enemyMeshes.clear();
    this.obstacles = [];
    disposeOwnedGeometries(this.scene);
    for (const geometry of this.sharedGeometries) geometry.dispose();
    for (const material of this.sharedMaterials) material.dispose();
    this.sharedGeometries = [];
    this.sharedMaterials = [];
    this.coverMaterials = null;
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement?.remove();
  }
}
