import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeTacticalWorld } from '../game/threeTacticalWorld';
import { anatomySim } from '../game/anatomySimulation';
import { aiDirector } from '../game/aiGoap';
import { tacticalAudio } from '../audio/tacticalAudio';
import { suppressionSystem } from '../systems/suppression.js';
import { EnemyCombatant, FriendlyCombatant, WeaponState } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, getProjectileSpeed, getShotIntervalMs, getWeaponById } from '../data/weapons.js';
import { audioManager } from '../systems/audio.js';
import { equipmentManager, playerEquipment } from '../systems/equipment.js';
import { suppressionSystem } from '../systems/suppression.js';
        

interface TacticalViewportProps {
  weapon: WeaponState;
  godMode: boolean;
  isPaused: boolean;
  onToggleGodMode: () => void;
  onUpdateWeapon: (updater: (prev: WeaponState) => WeaponState) => void;
  onToggleMap: () => void;
  onCallCasevac: () => void;
  onOpenRoster: () => void;
  onOpenScoreboard: () => void;
  onOpenPauseMenu: () => void;
  onVitalsChanged: () => void;
  onEnemyEliminated: (enemyId: string, shooterId: string) => void;
  onFriendlyDown: (friendlyId: string, killerId: string) => void;
  onPlayerPositionChanged?: (pos: { x: number; z: number; rotationY: number }) => void;
  onSquadStateChanged?: (friendlies: FriendlyCombatant[], enemies: EnemyCombatant[]) => void;
  onOpenInventory?: () => void;
  loadoutOpen?: boolean;
        
}

export const TacticalViewport: React.FC<TacticalViewportProps> = ({
  weapon,
  godMode,
  isPaused,
  onToggleGodMode,
  onUpdateWeapon,
  onToggleMap,
  onCallCasevac,
  onOpenRoster,
  onOpenScoreboard,
  onOpenPauseMenu,
  onVitalsChanged,
  onEnemyEliminated,
  onFriendlyDown,
  onPlayerPositionChanged,
  onSquadStateChanged,
  onOpenInventory,
  loadoutOpen = false,

}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ThreeTacticalWorld | null>(null);
  const miniRadarCanvasRef = useRef<HTMLCanvasElement>(null);

  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const isMouseDown = useRef<boolean>(false);
  const lastShotTime = useRef<number>(0);
  const godModeRef = useRef(godMode);
  const isPausedRef = useRef(isPaused);
  godModeRef.current = godMode;
  isPausedRef.current = isPaused;
  const handlersRef = useRef({
    onUpdateWeapon,
    onToggleMap,
    onCallCasevac,
    onOpenRoster,
    onVitalsChanged,
    onEnemyEliminated,
    onFriendlyDown,
    onPlayerPositionChanged,
    onSquadStateChanged,
  });
  handlersRef.current = {
    onUpdateWeapon,
    onToggleMap,
    onCallCasevac,
    onOpenRoster,
    onVitalsChanged,
    onEnemyEliminated,
    onFriendlyDown,
    onPlayerPositionChanged,
    onSquadStateChanged,
  };

  // Sync weapon ref to avoid stale closure in simulation loop and event listeners
  const weaponRef = useRef<WeaponState>(weapon);
  useEffect(() => {
    weaponRef.current = weapon;
  }, [weapon]);

  // Sync attachment-driven light / ADS visuals into the 3D world
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const fx = playerEquipment.getAttachmentEffects();
    world.setTacticalLight(Boolean(weapon.tacticalLight) && fx.hasFlashlight, {
      intensity: fx.lightIntensity,
      rangeM: fx.lightRangeM,
      coneAngleDeg: fx.lightConeAngleDeg,
      color: fx.lightColor,
    });
    world.setAdsZoom(weapon.adsZoom ?? fx.adsZoom, Boolean(weapon.aimingDownSights));
  }, [
    weapon.tacticalLight,
    weapon.aimingDownSights,
    weapon.adsZoom,
    weapon.attachments?.opticId,
    weapon.attachments?.flashlightId,
    weapon.attachments?.muzzleId,
  ]);

  const syncWeaponFromEquipment = (lightEnabled?: boolean, ads?: boolean) => {
    onUpdateWeapon((prev) =>
      playerEquipment.applyToWeaponState(prev, {
        lightEnabled: lightEnabled !== undefined ? lightEnabled : prev.tacticalLight,
        aimingDownSights: ads !== undefined ? ads : prev.aimingDownSights,
      }) as WeaponState
    );
    onLoadoutChanged?.(playerEquipment.snapshot());
  };

  // Reload state
  const [reloadProgress, setReloadProgress] = useState<number>(0);
  const reloadTimerRef = useRef<number | null>(null);

  // Combat wave banner notification
  const [waveBanner, setWaveBanner] = useState<string | null>(null);
  const [combatBarkBanner, setCombatBarkBanner] = useState<{ speaker: string; text: string; isBluefor: boolean } | null>(null);

  // Suppression / stress sensory feedback (blur intensity + heavy-fire flag)
  const [suppressionBlur, setSuppressionBlur] = useState(0);
  const [underHeavyFire, setUnderHeavyFire] = useState(false);
  const lastSuppressionUiSync = useRef(0);

  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Virtual Joystick for Mobile
  const leftTouchId = useRef<number | null>(null);
  const leftStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const leftMoveDelta = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joystickPos, setJoystickPos] = useState<{ active: boolean; currentX: number; currentY: number; baseX: number; baseY: number }>({
    active: false,
    currentX: 0,
    currentY: 0,
    baseX: 0,
    baseY: 0,
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 850);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync God Mode visual ring
  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.setGodMode(godMode);
    }
  }, [godMode]);

  // Hook into AI Director events
  useEffect(() => {
    let waveTimer = 0;
    let barkTimer = 0;
    aiDirector.onWaveAnnounce = (msg) => {
      setWaveBanner(msg);
      window.clearTimeout(waveTimer);
      waveTimer = window.setTimeout(() => setWaveBanner(null), 5000);
    };

    aiDirector.onCombatBark = (speaker, text, isBluefor) => {
      setCombatBarkBanner({ speaker, text, isBluefor });
      window.clearTimeout(barkTimer);
      barkTimer = window.setTimeout(() => setCombatBarkBanner(null), 4000);
    };

    return () => {
      window.clearTimeout(waveTimer);
      window.clearTimeout(barkTimer);
      aiDirector.onWaveAnnounce = undefined;
      aiDirector.onCombatBark = undefined;
    };
  }, []);

  // --- AUTHENTIC M4A1 RELOAD SYSTEM (1.8s TACTICAL RELOAD) ---
  const triggerReload = () => {
    const curWep = weaponRef.current;
    const reserve = curWep.reserveRounds ?? 120;
    if (curWep.isReloading || curWep.currentMagRounds >= 30 || reserve <= 0) return;

    handlersRef.current.onUpdateWeapon((prev) => ({ ...prev, isReloading: true }));
    tacticalAudio.playMagCheck();
    setReloadProgress(0);

    const startTime = performance.now();
    const duration = 1800; // 1.8 seconds

    if (reloadTimerRef.current) clearInterval(reloadTimerRef.current);

    reloadTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setReloadProgress(pct);

      if (elapsed >= duration) {
        if (reloadTimerRef.current) clearInterval(reloadTimerRef.current);
        reloadTimerRef.current = null;
        setReloadProgress(0);

        handlersRef.current.onUpdateWeapon((prev) => {
          const prevReserve = prev.reserveRounds ?? 120;
          const needed = 30 - prev.currentMagRounds;
          const available = Math.min(needed, prevReserve);
          return {
            ...prev,
            currentMagRounds: prev.currentMagRounds + available,
            reserveRounds: Math.max(0, prevReserve - available),
            isReloading: false,
          };
        });
      }
    }, 30);
  };

  // --- M4A1 CYCLIC FIRING (STRICT AMMO CHECK & ZERO INFINITE AMMO BUG) ---
  const fireM4Round = () => {
    const curWep = weaponRef.current;
    if (curWep.isReloading) return; // Strictly blocked during reload!

    // Check actual magazine ammo
    if (curWep.currentMagRounds <= 0) {
      // Empty magazine -> Dry fire click & trigger reload!
      tacticalAudio.playDryFire();
      triggerReload();
      return;
    }

    const world = worldRef.current;
    if (!world) return;

    const now = performance.now();
    // Balanced M4A1 fire rate: 110ms (~550 RPM) ensures fair combat parity
    if (now - lastShotTime.current < 110) return;
    lastShotTime.current = now;

    tacticalAudio.init();
    audioManager.init();
    const fx = playerEquipment.getAttachmentEffects();
    const muzzle = {
      x: world.playerGroup.position.x,
      y: 0.9,
      z: world.playerGroup.position.z,
    };
    audioManager.setListenerFromPlayer(
      muzzle.x,
      muzzle.z,
      world.playerGroup.rotation.y
    );
    audioManager.playGunfire({
      muzzle,
      target: { x: world.aimPoint.x, y: 0.9, z: world.aimPoint.z },
      weapon: def.id,
      isPlayer: true,
      intensity: fx.soundSignature ?? 1,
      supersonic: !fx.isSuppressed && def.muzzleVelocity > 343,
      listener: muzzle,
    });
        

    // Decrement magazine count immediately!
    handlersRef.current.onUpdateWeapon((prev) => ({
      ...prev,
      currentMagRounds: Math.max(0, prev.currentMagRounds - 1),
    }));

    world.shootPlayerBullet(world.aimPoint, {
      speed: getProjectileSpeed(def),
      muzzleVelocity: def.muzzleVelocity,
      velocity: Math.max(80, def.muzzleVelocity - (fx.velocityLossMps ?? 0)),
    });

    // Shoot player bullet towards mouse aim
    world.shootPlayerBullet(world.aimPoint);

  };

  useEffect(() => {
    if (!containerRef.current) return;

    tacticalAudio.init();
    audioManager.init();
    const world = new ThreeTacticalWorld(containerRef.current);
    worldRef.current = world;
    world.setGodMode(godMode);
    let mapLoadActive = true;
    setMapStatus('loading');
    world.onMapReady = (layout) => {
      if (!mapLoadActive) return;
      aiDirector.relocateToCity(layout);
      setMapStatus('ready');
    };
    world.onMapFailed = () => {
      if (!mapLoadActive) return;
      setMapStatus('error');
    };


    // Seed weapon attachment fields from default player kit
    const seeded = playerEquipment.applyToWeaponState(weaponRef.current) as WeaponState;
    onUpdateWeapon(() => seeded);
    onLoadoutChanged?.(playerEquipment.snapshot());
    const fx0 = playerEquipment.getAttachmentEffects();
    world.setTacticalLight(Boolean(seeded.tacticalLight) && fx0.hasFlashlight, {
      intensity: fx0.lightIntensity,
      rangeM: fx0.lightRangeM,
      coneAngleDeg: fx0.lightConeAngleDeg,
      color: fx0.lightColor,
    });


    const initialWidth = containerRef.current.clientWidth || window.innerWidth;
    const initialHeight = containerRef.current.clientHeight || (window.innerHeight - 48);
    world.resize(initialWidth, initialHeight);

    const handleResize = () => {
      if (!containerRef.current || !worldRef.current) return;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = containerRef.current.clientHeight || (window.innerHeight - 48);
      worldRef.current.resize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current[e.code] = true;
      keysPressed.current[key] = true;

      if (e.code === 'KeyR' || key === 'r') triggerReload();
      if (e.code === 'KeyM' || key === 'm') onToggleMap();
      if (e.code === 'Digit9') onCallCasevac();
      if (e.code === 'KeyP' || key === 'p') onOpenRoster();
      if (e.code === 'KeyI' || key === 'i') onOpenInventoryRef.current?.();
      if (e.code === 'KeyV' || key === 'v') {
        onUpdateWeapon((prev) => ({ ...prev, aimingDownSights: !prev.aimingDownSights }));
      }
      if ((e.code === 'KeyH' || key === 'h') && !e.repeat) worldRef.current?.triggerPlayerSignal();
      if (e.code === 'KeyL' || key === 'l') {
        const fx = playerEquipment.getAttachmentEffects();
        if (!fx.hasFlashlight) return;
        onUpdateWeapon((prev) => ({ ...prev, tacticalLight: !prev.tacticalLight }));
      }
        
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current[e.code] = false;
      keysPressed.current[key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Mouse Aim and Continuous M4 Fire
    const canvas = world.renderer.domElement;

    const updateAimFromEvent = (clientX: number, clientY: number) => {
      if (!containerRef.current || !worldRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      worldRef.current.updateAimFromMouse(nx, ny);
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateAimFromEvent(e.clientX, e.clientY);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = true;
        updateAimFromEvent(e.clientX, e.clientY);
        fireM4Round();
      }
      if (e.button === 2) {
        onUpdateWeapon((prev) => ({ ...prev, aimingDownSights: !prev.aimingDownSights }));
      }
        
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = false;
      }
      if (e.button === 2) {
        syncWeaponFromEquipment(undefined, false);
      }
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('contextmenu', handleContextMenu);

    // Main Simulation Loop
    let lastTime = performance.now();
    let lastVitalsSync = 0;
    let animFrame: number;

    const loop = (currentTime: number) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      if (!isPausedRef.current) {
        // Continuous M4 Auto Fire if mouse held down
        if (isMouseDown.current) {
          fireM4Round();
        }

        // 1. Update Anatomy if not in god mode
        if (!godModeRef.current) {
          anatomySim.update(dt);
        }

        if (currentTime - lastVitalsSync > 120) {
          lastVitalsSync = currentTime;
          handlersRef.current.onVitalsChanged();

          handlersRef.current.onPlayerPositionChanged?.({
            x: world.playerGroup.position.x,
            z: world.playerGroup.position.z,
            rotationY: world.playerGroup.rotation.y,
          });

          handlersRef.current.onSquadStateChanged?.(aiDirector.friendlies, aiDirector.enemies);
        }

        // 2. Update AI GOAP Director with Friendlies and Enemies
        const playerPos = world.playerGroup.position;
        aiDirector.update(
          dt,
          { x: playerPos.x, y: playerPos.y, z: playerPos.z },
          (from, to, isBluefor, shooterId) => {
            world.shootBullet(from, to, isBluefor, shooterId);
          }
        );

        // Sync 3D Meshes
        world.syncFriendlies(aiDirector.friendlies);
        world.syncEnemies(aiDirector.enemies);

        // Sync AI equipment registries with live combatant rosters
        equipmentManager.syncCombatants(aiDirector.friendlies, aiDirector.enemies);

        // 3. Update Player Movement
        updatePlayerMovement(dt, world);

        // 4. Render Frame with Precise Entity Collision Callbacks
        world.render(
          dt,
          (enemyShooterId, damageScale = 1) => {
            if (damageScale <= 0.05) return;
            if (!godMode) {
        
              const zones = [
                'head_carotid',
                'torso_lungs',
                'limb_arm_right',
                'limb_leg_left',
                'junctional_groin',
                'limb_arm_left',
                'limb_leg_right',
                'torso_heart',
                'head_brain',
                'head_facial',
              ] as const;
              const hitZone = zones[Math.floor(Math.random() * zones.length)];
              const pen = getWeaponById('akm')?.damage?.armorPenetration ?? 0.62;
              const armor = equipmentManager.resolveArmorHit('player', hitZone, pen);
              if (!armor?.stopped) {
                anatomySim.inflictTrauma(hitZone);
              }
              suppressionSystem.registerImpact('hit', damageScale);
              audioManager.playSonicCrack(
                { x: playerPos.x, y: 1.0, z: playerPos.z },
                'ak47',
                { missDistance: 0.4, intensity: 1.2 }
              );
              onVitalsChanged();
        

              // If player flatlined, credit enemy shooter
              if (anatomySim.vitals.shockStage === 'cardiac_arrest') {
                const enemy = aiDirector.enemies.find((e) => e.id === enemyShooterId);
                if (enemy) enemy.kills += 1;
              }
            } else {
              audioManager.playSonicCrack(
                { x: playerPos.x, y: 1.0, z: playerPos.z },
                'ak47',
                { missDistance: 0.5, intensity: 1.0 }
              );
            }
          },
          (friendlyId, enemyShooterId) => {
            // Friendly AI hit by hostile bullet
            const killed = aiDirector.hitFriendly(friendlyId, 35, enemyShooterId);
            tacticalAudio.playBulletCrack();
            if (killed) {
              handlersRef.current.onFriendlyDown(friendlyId, enemyShooterId);
            }
          },
          (enemyId, shooterId) => {
            // Enemy hit by Bluefor bullet
            const killed = aiDirector.hitEnemy(enemyId, 45, shooterId);
            tacticalAudio.playEnemyAKFire();
            if (killed) {
              handlersRef.current.onEnemyEliminated(enemyId, shooterId);
            }
          },
          (impactPos, isBluefor) => {
            // Nearby cover / terrain impacts from hostile fire rattle the player
            if (!isBluefor) {
              suppressionSystem.registerWorldImpact(impactPos, {
                x: world.playerGroup.position.x,
                z: world.playerGroup.position.z,
              });
            }
          }
        );

        const stress = suppressionSystem.update(dt);
        tacticalAudio.setSuppressionMuffle(stress.muffle);
        world.applySuppressionSway(stress.swayOffsetX, stress.swayOffsetZ);
        if (suppressionVeilRef.current) {
          suppressionVeilRef.current.style.opacity = stress.blurPx > 0.4 ? '1' : '0';
          suppressionVeilRef.current.style.backdropFilter = `blur(${stress.blurPx.toFixed(1)}px)`;
        }

=======

        // Render Live Mini-Radar
        renderMiniRadar(world.playerGroup.position, world.playerGroup.rotation.y);
      } else {
        world.render(0, () => {}, () => {}, () => {});
        tacticalAudio.setSuppressionMuffle(0);
      }

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
      if (reloadTimerRef.current) clearInterval(reloadTimerRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      tacticalAudio.cleanup();
      world.destroy();
    };
  }, []);

  // Mini-Radar Render function
  const renderMiniRadar = (playerPos: THREE.Vector3, playerRotY: number) => {
    if (!miniRadarCanvasRef.current) return;
    const canvas = miniRadarCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Coordinate mapping: (-45 to 45) -> (0 to w, 0 to h)
    const toRadarX = (wx: number) => ((wx + 48) / 96) * w;
    const toRadarY = (wz: number) => ((wz + 48) / 96) * h;

    // Outer radar ring
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w / 2, h - 4);
    ctx.moveTo(4, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();

    for (const placement of tacticalLayout?.placements ?? []) {
      if (!placement?.position || !placement.size) continue;
      const swapped = Math.abs(Math.sin(placement.rotationY || 0)) > 0.5;
      const rw = ((swapped ? placement.size.z : placement.size.x) / 96) * w;
      const rh = ((swapped ? placement.size.x : placement.size.z) / 96) * h;
      ctx.fillStyle = placement.kind === 'trench'
        ? '#3f6212'
        : placement.kind === 'ruined_brick'
        ? '#9a3412'
        : placement.kind === 'shipping_container'
        ? '#c2410c'
        : placement.kind === 'crate'
        ? '#d97706'
        : '#64748b';
      ctx.fillRect(toRadarX(placement.position.x) - rw / 2, toRadarY(placement.position.z) - rh / 2, rw, rh);
    }

    // Draw Enemies (RED)
    aiDirector.enemies.forEach((e) => {
      if (!e?.position || e.health <= 0) return;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(toRadarX(e.position.x), toRadarY(e.position.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Friendlies (BLUE)
    aiDirector.friendlies.forEach((f) => {
      if (!f?.position || f.status === 'KIA') return;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(toRadarX(f.position.x), toRadarY(f.position.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Player (GREEN)
    const px = toRadarX(playerPos.x);
    const py = toRadarY(playerPos.z);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Heading arrow
    const angle = playerRotY + Math.PI / 2;
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(angle) * 7, py + Math.sin(angle) * 7);
    ctx.stroke();
  };

  const updatePlayerMovement = (dt: number, world: ThreeTacticalWorld) => {
    let moveX = 0;
    let moveZ = 0;

    if (keysPressed.current['KeyW'] || keysPressed.current['w'] || keysPressed.current['ArrowUp']) moveZ -= 1;
    if (keysPressed.current['KeyS'] || keysPressed.current['s'] || keysPressed.current['ArrowDown']) moveZ += 1;
    if (keysPressed.current['KeyA'] || keysPressed.current['a'] || keysPressed.current['ArrowLeft']) moveX -= 1;
    if (keysPressed.current['KeyD'] || keysPressed.current['d'] || keysPressed.current['ArrowRight']) moveX += 1;

    if (leftMoveDelta.current.x !== 0 || leftMoveDelta.current.y !== 0) {
      moveX += leftMoveDelta.current.x;
      moveZ += leftMoveDelta.current.y;
    }

    const sprinting =
      !anatomySim.vitals.paralyzed &&
      !anatomySim.vitals.limping &&
      (keysPressed.current['ShiftLeft'] || keysPressed.current['ShiftRight']);
    let speed = (sprinting ? 10.6 : 6.2) * playerEquipment.getMoveSpeedMultiplier();
        main
    if (!godMode) {
      if (anatomySim.vitals.paralyzed) {
        speed = 2.4; // Spine paralysis crawl
      } else if (anatomySim.vitals.limping) {
        speed = 3.6 * playerEquipment.getMoveSpeedMultiplier();
        
      }
    }

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      let nextX = world.playerGroup.position.x + (moveX / len) * speed * dt;
      let nextZ = world.playerGroup.position.z + (moveZ / len) * speed * dt;

      // Obstacle physics resolution: blocks walking through cover & pushes movable crates with tight precision (no invisible barrier overlap)
      const resolved = world.resolveEntityCollision({ x: nextX, z: nextZ }, 0.55, 2.0);
      nextX = resolved.x;
      nextZ = resolved.z;

      // Clamped cleanly within the visible perimeter concrete barrier walls (±42.5m)
      world.playerGroup.position.x = Math.max(-42.5, Math.min(42.5, nextX));
      world.playerGroup.position.z = Math.max(-42.5, Math.min(42.5, nextZ));
    }
  };

  // Mobile Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth / 2 && leftTouchId.current === null) {
        leftTouchId.current = touch.identifier;
        leftStartPos.current = { x: touch.clientX, y: touch.clientY };
        leftMoveDelta.current = { x: 0, y: 0 };
        setJoystickPos({
          active: true,
          baseX: touch.clientX,
          baseY: touch.clientY,
          currentX: touch.clientX,
          currentY: touch.clientY,
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === leftTouchId.current) {
        const dx = touch.clientX - leftStartPos.current.x;
        const dy = touch.clientY - leftStartPos.current.y;
        const dist = Math.hypot(dx, dy);
        const maxRadius = 45;
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);

        const cx = Math.cos(angle) * clampedDist;
        const cy = Math.sin(angle) * clampedDist;

        leftMoveDelta.current = {
          x: cx / maxRadius,
          y: cy / maxRadius,
        };

        setJoystickPos((prev) => ({
          ...prev,
          currentX: leftStartPos.current.x + cx,
          currentY: leftStartPos.current.y + cy,
        }));
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === leftTouchId.current) {
        leftTouchId.current = null;
        leftMoveDelta.current = { x: 0, y: 0 };
        setJoystickPos((prev) => ({ ...prev, active: false }));
      }
    }
  };

  return (
    <div
      className="relative flex-1 w-full h-full overflow-hidden select-none bg-slate-900"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0 cursor-crosshair"
      />

      {/* Suppression: backdrop blur + vignette (blurs the canvas underneath) */}
      {suppressionBlur > 0.05 && (
        <div
          className="absolute inset-0 pointer-events-none z-[5] transition-[backdrop-filter,opacity] duration-75"
          style={{
            backdropFilter: `blur(${suppressionBlur.toFixed(2)}px)`,
            WebkitBackdropFilter: `blur(${suppressionBlur.toFixed(2)}px)`,
            background: underHeavyFire
              ? 'radial-gradient(circle at center, rgba(15,23,42,0.05) 28%, rgba(15, 23, 42, 0.45) 72%, rgba(2, 6, 23, 0.82) 100%)'
              : `radial-gradient(circle at center, transparent 42%, rgba(15, 23, 42, ${Math.min(0.5, 0.12 + suppressionBlur * 0.06)}) 100%)`,
          }}
          aria-hidden
        />
      )}

      {/* Top Left Quick Indicator Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-slate-950/85 backdrop-blur-md px-3.5 py-1.5 rounded border border-slate-800 text-xs font-mono text-slate-300">
        <span>WASD: Move</span>
        <span>·</span>
        <span>SPACE: Jump</span>
        <span>·</span>
        <span>SHIFT: Sprint</span>
        <span>·</span>
        <span>H: Hand signal</span>
        <span>·</span>
        <span className="text-amber-300 font-bold">L-Click: Auto M4 Fire</span>
        origin/main
        <span>·</span>
        <span className="text-sky-300">RMB/V: ADS</span>
        <span>·</span>
        <span className="text-yellow-200">L: Light</span>
        <span>·</span>
        <span className="text-violet-300">O: Optic</span>
        <button
          onClick={onToggleGodMode}
          className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
            godMode ? 'bg-emerald-600 text-white animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
        >
          {godMode ? '★ GOD MODE ON [G]' : 'GOD MODE OFF [G]'}
        </button>
      </div>

      {/* Top Center Wave Banner Notification */}
      {waveBanner && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-950/90 border border-red-500 text-red-200 px-5 py-2 rounded text-xs font-mono font-bold uppercase tracking-wider shadow-2xl animate-pulse">
          ⚡ {waveBanner}
        </div>
      )}

      {/* Combat Radio Bark Callout Overlay (Telegraphs Enemy Squad Tactics!) */}
      {combatBarkBanner && (
        <div
          className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded text-xs font-mono flex items-center gap-2.5 backdrop-blur-md shadow-2xl border ${
            combatBarkBanner.isBluefor
              ? 'bg-sky-950/90 border-sky-600 text-sky-200'
              : 'bg-amber-950/95 border-amber-500 text-amber-200 ring-2 ring-amber-500/30 animate-pulse'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${combatBarkBanner.isBluefor ? 'bg-sky-400' : 'bg-amber-400 animate-ping'}`} />
          <span className="font-bold uppercase tracking-wide">
            {combatBarkBanner.isBluefor ? `[SQUAD RADIO // ${combatBarkBanner.speaker}]` : `[TACTICAL INTERCEPT // ${combatBarkBanner.speaker}]`}:
          </span>
          <span className="font-semibold italic">"{combatBarkBanner.text}"</span>
        </div>
      )}

      {/* Top-Right Live Tactical Mini-Radar */}
      <div
        onClick={onToggleMap}
        className="absolute top-4 right-4 z-20 bg-slate-950/90 backdrop-blur-md p-2 rounded border border-slate-800 flex flex-col items-center gap-1 cursor-pointer hover:border-sky-500 transition-colors shadow-xl"
        title="Click to expand Topographic Sector Map [M]"
      >
        <div className="flex items-center justify-between w-full text-[10px] font-mono text-slate-400 px-1">
          <span className="text-sky-400 font-bold">MINI-RADAR</span>
          <span className="text-[9px] text-slate-500">[M] EXPAND</span>
        </div>
        <canvas
          ref={miniRadarCanvasRef}
          width={110}
          height={110}
          className="rounded border border-slate-800 bg-slate-950"
        />
        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400 mt-0.5">
          <span className="text-emerald-400">● You</span>
          <span className="text-sky-400">● Blue</span>
          <span className="text-red-400">● Red</span>
        </div>
      </div>

      {/* Bottom Right Authentic Weapon HUD (Magazine & Ammo Counter) */}
      <div className="absolute bottom-4 right-4 z-20 bg-slate-950/90 backdrop-blur-md p-3.5 rounded border border-slate-800 font-mono text-xs flex flex-col gap-1.5 shadow-2xl min-w-[210px]">
        <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase border-b border-slate-800 pb-1">
          <span className="font-bold text-slate-200">M4A1 CARBINE 5.56mm</span>
          <span className="text-emerald-400 font-semibold">AUTO (800 RPM)</span>
        </div>

        {/* Magazine Count */}
        <div className="flex items-baseline justify-between pt-0.5">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tabular-nums ${
                weapon.currentMagRounds <= 5
                  ? 'text-red-500 animate-pulse'
                  : weapon.currentMagRounds <= 12
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {weapon.currentMagRounds}
            </span>
            <span className="text-slate-500 text-sm">/ 30</span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase">RESERVE</span>
            <span className="text-slate-200 font-bold tabular-nums">120 RDS</span>
          </div>
        </div>

        {/* Reload button and Progress Bar */}
        {weapon.isReloading ? (
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex justify-between items-center text-[10px] text-amber-400 font-bold">
              <span>RELOADING M4A1...</span>
              <span>{Math.round(reloadProgress)}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-75"
                style={{ width: `${reloadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={triggerReload}
            className={`w-full py-1 mt-1 rounded text-[11px] font-bold border transition-colors cursor-pointer text-center ${
              weapon.currentMagRounds === 0
                ? 'bg-red-950 border-red-500 text-red-300 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            {weapon.currentMagRounds === 0 ? 'EMPTY - PRESS [R] TO RELOAD' : 'RELOAD [R]'}
          </button>
        )}

        {/* Attachment / gear strip from equipment system */}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-slate-500 border-t border-slate-800 pt-1.5 mt-0.5 uppercase tracking-wide">
          <span className="text-slate-300">
            {(weapon.reticle ?? 'iron').toString().replace('_', ' ')}
            {weapon.aimingDownSights ? ` ×${(weapon.adsZoom ?? 1).toFixed(1)}` : ''}
          </span>
          <span>·</span>
          <span className={weapon.tacticalLight ? 'text-yellow-300' : ''}>
            LIGHT {weapon.tacticalLight ? 'ON' : 'OFF'}
          </span>
          <span>·</span>
          <span className={weapon.isSuppressed ? 'text-emerald-400' : ''}>
            {weapon.isSuppressed ? 'SUPPRESSED' : 'UNSUPPRESSED'}
          </span>
        </div>
      </div>

      {/* Mobile Virtual Joystick */}
      {joystickPos.active && (
        <div
          className="absolute rounded-full border-2 border-emerald-500/40 bg-black/30 pointer-events-none -translate-x-1/2 -translate-y-1/2 z-30"
          style={{
            left: `${joystickPos.baseX}px`,
            top: `${joystickPos.baseY}px`,
            width: '90px',
            height: '90px',
          }}
        >
          <div
            className="absolute rounded-full bg-emerald-500/70 border border-white/50 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${45 + (joystickPos.currentX - joystickPos.baseX)}px`,
              top: `${45 + (joystickPos.currentY - joystickPos.baseY)}px`,
              width: '38px',
              height: '38px',
            }}
          />
        </div>
      )}

      {/* Mobile Quick Action Buttons */}
      {isMobile && (
        <div className="absolute bottom-24 right-4 z-40 flex flex-col gap-2">
          <button
            onPointerDown={() => {
              isMouseDown.current = true;
              fireM4Round();
            }}
            onPointerUp={() => {
              isMouseDown.current = false;
            }}
            className="w-16 h-16 rounded-full bg-red-600 active:scale-95 text-white font-mono font-bold text-sm shadow-xl flex items-center justify-center border-2 border-red-300"
          >
            FIRE
          </button>
          <button
            onClick={triggerReload}
            className="px-3 py-1.5 bg-slate-900/80 border border-slate-700 text-xs font-mono text-slate-200 rounded"
          >
            RELOAD
          </button>
        </div>
      )}
    </div>
  );
};
