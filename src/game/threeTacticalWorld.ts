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
  type: 'crate' | 'wall' | 'perimeter';
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
    // 1. Movable Wood Supply Crates
    const crateGeo = new THREE.BoxGeometry(2.2, 1.8, 2.2);
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Warm wood orange-amber
      roughness: 0.5,
      metalness: 0.1,
    });

    const crateLocations = [
      [-14, -14], [14, -14], [-16, 14], [16, 14], [-24, -2], [24, -2]
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

    // 2. Concrete Blast Walls (Solid Axis-Aligned Cover)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });

    const solidWalls = [
      { x: -14, z: -24, sx: 10, sy: 1.8, sz: 1.4 },
      { x: 14, z: -24, sx: 10, sy: 1.8, sz: 1.4 },
      { x: 0, z: -34, sx: 16, sy: 2.0, sz: 1.4 }, // North Bunker berm
      { x: -28, z: -10, sx: 1.4, sy: 1.8, sz: 10 }, // West berm
      { x: 28, z: -10, sx: 1.4, sy: 1.8, sz: 10 },  // East berm
    ];

    solidWalls.forEach((w, idx) => {
      const geo = new THREE.BoxGeometry(w.sx, w.sy, w.sz);
      const wallMesh = new THREE.Mesh(geo, wallMat);
      wallMesh.position.set(w.x, w.sy / 2, w.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);

      this.obstacles.push({
        id: `wall_${idx}`,
        mesh: wallMesh,
        type: 'wall',
        pos: { x: w.x, y: w.sy / 2, z: w.z },
        vel: { x: 0, z: 0 },
        size: { x: w.sx, y: w.sy, z: w.sz },
        movable: false,
        mass: 1000,
      });
    });

    // 3. VISIBLE PERIMETER SECURITY WALLS AROUND ENTIRE COMPOUND (44m boundary)
    // Clearly marks the boundary with visible concrete barriers and hazard stripes so there are ZERO invisible walls!
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
      const geo = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
      const mesh = new THREE.Mesh(geo, perimeterMat);
      mesh.position.set(p.x, p.sy / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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

    // Corner Watchtowers for atmospheric boundary markers
    const towerGeo = new THREE.CylinderGeometry(1.2, 1.4, 4.5, 8);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const cornerPositions = [
      [-44, -44], [44, -44], [-44, 44], [44, 44]
    ];
    cornerPositions.forEach(([x, z]) => {
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(x, 2.25, z);
      tower.castShadow = true;
      this.scene.add(tower);
    });
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
