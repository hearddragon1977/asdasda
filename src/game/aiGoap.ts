import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';
import { TACTICAL_COVER_NODES, TACTICAL_SPAWN_ZONES } from './threeTacticalWorld';
import { CitySpawnLayout } from './cityCollision';
import { updateEnemySquad } from '../ai/enemyAI.js';
import { setHuntRoute, updateFriendlySquad } from '../ai/friendlyAI.js';
import { audioManager } from '../systems/audio.js';
import { equipmentManager } from '../systems/equipment.js';
import { radioChatter } from '../systems/radioChatter';

function spawnZonePos(id: string): { x: number; y: number; z: number } {
  const zone = TACTICAL_SPAWN_ZONES.find((z) => z.id === id);
  return { x: zone?.position.x ?? 0, y: 0, z: zone?.position.z ?? 0 };
}

function friendlyStagingAnchor(): { x: number; z: number } {
  const zone = TACTICAL_SPAWN_ZONES.find((z) => z.id === 'friendly_staging');
  return { x: zone?.position.x ?? 0, z: zone?.position.z ?? 22 };
}

export interface CoverNode {
  id: string;
  position: { x: number; y: number; z: number };
  isHighGround: boolean;
  occupantId: string | null;
}

export interface SquadBlackboard {
  playerLastKnownPosition: { x: number; y: number; z: number };
  playerVisible: boolean;
  activeSuppressorId: string | null;
  activeFlankerId: string | null;
  lastBark: { speaker: string; text: string; time: number };
  timeSincePlayerSpotted: number;
}

export class GuerrillaAiDirector {
  public coverNodes: CoverNode[] = [];
  public blackboard: SquadBlackboard = {
    playerLastKnownPosition: { x: 0, y: 0, z: 0 },
    playerVisible: false,
    activeSuppressorId: null,
    activeFlankerId: null,
    lastBark: { speaker: '', text: '', time: 0 },
    timeSincePlayerSpotted: 999,
  };

  public enemies: EnemyCombatant[] = [];
  public friendlies: FriendlyCombatant[] = [];
  /** Street points measured from the loaded city. Later waves reuse these. */
  private cityEnemySpawns: { x: number; y: number; z: number }[] = [];

  // Wave Respawn System
  public currentWave: number = 1;
  public waveSpawnPending: boolean = false;
  public waveSpawnTimer: number = 0;

  public onWaveAnnounce?: (msg: string) => void;
  public onCombatBark?: (speaker: string, text: string, isBluefor: boolean) => void;
  private lastStepPos = new Map<string, { x: number; z: number }>();

  constructor() {
    this.initCoverNodes();
    this.spawnFriendlySquad();
    this.spawnWave(1);
    radioChatter.onTransmission = (callsign, text, isBluefor) => {
      this.blackboard.lastBark = { speaker: callsign, text, time: performance.now() };
      this.onCombatBark?.(callsign, text, isBluefor);
    };
  }

  private initCoverNodes(): void {
    this.coverNodes = TACTICAL_COVER_NODES.map((n) => ({
      ...n,
      occupantId: null,
    }));
  }

  // --- FRIENDLY AI SQUAD: RESPAWN & TACTICAL FIRETEAM INITIALIZATION ---
  public spawnFriendlySquad(_playerAnchor = friendlyStagingAnchor()): void {
    const prevDoc = this.friendlies.find((f) => f.id === 'doc_miller');
    const prevRuiz = this.friendlies.find((f) => f.id === 'sgt_ruiz');
    const prevOrtiz = this.friendlies.find((f) => f.id === 'cpl_ortiz');
    const prevHayes = this.friendlies.find((f) => f.id === 'dustoff_lead');

    this.friendlies = [
      {
        id: 'doc_miller',
        name: 'HM1 Nicholas Miller',
        callsign: 'Doc Miller',
        role: 'Corpsman / Wingman (Left Security)',
        position: { x: -24, y: 0, z: 8 },
        rotationY: 0,
        health: 100,
        kills: prevDoc?.kills ?? 0,
        deaths: prevDoc?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.2,
        targetEnemyId: null,
        formationOffset: { x: -24, z: 8 },
        state: 'bounding',
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        currentAmmo: 30,
      },
      {
        id: 'sgt_ruiz',
        name: 'Sgt. Mateo Ruiz',
        callsign: 'Gunner-6',
        role: 'Automatic Rifleman (SAW Heavy Suppression)',
        position: { x: 24, y: 0, z: 6 },
        rotationY: 0,
        health: 100,
        kills: prevRuiz?.kills ?? 0,
        deaths: prevRuiz?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 0.9,
        targetEnemyId: null,
        formationOffset: { x: 24, z: 6 },
        state: 'suppress',
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        currentAmmo: 100,
      },
      {
        id: 'cpl_ortiz',
        name: 'Cpl. Raymond Ortiz',
        callsign: 'Shadow-3',
        role: 'Designated Marksman (Rear Overwatch)',
        position: { x: -14, y: 0, z: 28 },
        rotationY: 0,
        health: 100,
        kills: prevOrtiz?.kills ?? 0,
        deaths: prevOrtiz?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.5,
        targetEnemyId: null,
        formationOffset: { x: -14, z: 28 },
        state: 'bounding',
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        currentAmmo: 20,
      },
      {
        id: 'dustoff_lead',
        name: 'Capt. Jonathan Hayes',
        callsign: 'Dustoff-Lead',
        role: 'Tactical Breacher (Right Flank Intercept)',
        position: { x: 12, y: 0, z: -8 },
        rotationY: 0,
        health: 100,
        kills: prevHayes?.kills ?? 0,
        deaths: prevHayes?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.4,
        targetEnemyId: null,
        formationOffset: { x: 12, z: -8 },
        state: 'bounding',
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        currentAmmo: 30,
      },
    ];

    // Register / refresh Bluefor equipment kits (vest / helmet / pack / rails)
    for (const friendly of this.friendlies) {
      const kit = equipmentManager.registerFriendly(friendly.id);
      // Marksman gets ACOG; SAW gunner gets heavier ruck
      if (friendly.id === 'cpl_ortiz') {
        kit.equip('acog_ta31');
      }
      if (friendly.id === 'sgt_ruiz') {
        kit.equip('molle_ruck_large');
      }
      friendly.loadout = kit.snapshot();
    }
  }

  // --- RANDOMIZED INFILTRATION SPAWNS (ANTI-CAMPING SYSTEM) ---
  public spawnWave(waveNum: number): void {
    this.currentWave = waveNum;
    this.waveSpawnPending = false;

    // Approaches map onto designated OPFOR spawn pads on the urban compound.
    const approaches = ['north_assault', 'east_flank', 'west_breach', 'pincer_ambush'] as const;
    const approach = approaches[Math.floor(Math.random() * approaches.length)];

    const north = spawnZonePos('enemy_north_gate');
    const west = spawnZonePos('enemy_west_alley');
    const east = spawnZonePos('enemy_east_alley');
    const nw = spawnZonePos('enemy_nw_warehouse');
    const ne = spawnZonePos('enemy_ne_warehouse');

    const streetSpot = (index: number, fallback: { x: number; y: number; z: number }) => {
      const spot = this.cityEnemySpawns[index];
      if (!spot) return { ...fallback };
      return { x: spot.x, y: spot.y, z: spot.z };
    };

    // On the city, every hostile stands on a measured street point.
    // The old pad offsets pushed them past the road into empty space.
    let sgtPos = streetSpot(0, north);
    let rpkPos = streetSpot(1, nw);
    let svdPos = streetSpot(2, ne);
    let flankWPos = streetSpot(3, west);
    let flankEPos = streetSpot(4, east);

    if (this.cityEnemySpawns.length === 0 && approach === 'east_flank') {
      sgtPos = { ...east };
      rpkPos = { x: east.x - 1, y: 0, z: east.z + 5 };
      svdPos = { ...ne };
      flankWPos = { x: east.x - 2, y: 0, z: east.z - 5 };
      flankEPos = { x: ne.x - 2, y: 0, z: ne.z + 3 };
    } else if (this.cityEnemySpawns.length === 0 && approach === 'west_breach') {
      sgtPos = { ...west };
      rpkPos = { x: west.x + 1, y: 0, z: west.z + 5 };
      svdPos = { ...nw };
      flankWPos = { x: nw.x + 2, y: 0, z: nw.z + 3 };
      flankEPos = { x: west.x + 2, y: 0, z: west.z - 5 };
    } else if (this.cityEnemySpawns.length === 0 && approach === 'pincer_ambush') {
      sgtPos = { ...north };
      rpkPos = { ...west };
      svdPos = { ...east };
      flankWPos = { ...nw };
      flankEPos = { ...ne };
    }

    const waveRoster: EnemyCombatant[] = [
      {
        id: `wave${waveNum}_sgt`,
        name: 'Sgt. Tariq Al-Masri',
        callsign: 'General Tariq',
        role: 'Cell Commander (AKM Auto Burst)',
        isCommander: true,
        position: sgtPos,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'commander',
        targetPosition: { x: 0, y: 0, z: 0 },
        shootCooldown: 0.9,
        burstRemaining: 3,
        currentAmmo: 30,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      },
      {
        id: `wave${waveNum}_rpk`,
        name: 'Kareem (Heavy Support)',
        callsign: 'Viper-Gunner',
        role: 'RPK Gunner (Heavy Suppression)',
        isCommander: false,
        position: rpkPos,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'suppress',
        targetPosition: { x: -14, y: 0, z: -16 },
        shootCooldown: 0.7,
        burstRemaining: 6,
        currentAmmo: 75,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      },
      {
        id: `wave${waveNum}_svd`,
        name: 'Faris (Marksman)',
        callsign: 'Ghost-Eye',
        role: 'SVD Marksman (High-Damage Sniper)',
        isCommander: false,
        position: svdPos,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'overwatch',
        targetPosition: { x: 14, y: 0, z: -26 },
        shootCooldown: 1.8,
        burstRemaining: 1,
        currentAmmo: 10,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      },
      {
        id: `wave${waveNum}_flank_w`,
        name: 'Malik (West Flanker)',
        callsign: 'Cobra-West',
        role: 'Assault Raider (Flanker)',
        isCommander: false,
        position: flankWPos,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'flank_left',
        targetPosition: { x: -10, y: 0, z: 0 },
        shootCooldown: 1.0,
        burstRemaining: 3,
        currentAmmo: 30,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      },
      {
        id: `wave${waveNum}_flank_e`,
        name: 'Bashir (East Flanker)',
        callsign: 'Cobra-East',
        role: 'Assault Raider (Flanker)',
        isCommander: false,
        position: flankEPos,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'flank_right',
        targetPosition: { x: 10, y: 0, z: 0 },
        shootCooldown: 1.0,
        burstRemaining: 3,
        currentAmmo: 30,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      },
    ];

    if (waveNum > 1) {
      const extra = streetSpot(5, {
        x: (north.x + east.x) / 2,
        y: 0,
        z: (north.z + east.z) / 2,
      });
      waveRoster.push({
        id: `wave${waveNum}_enforcer`,
        name: 'Jamil (Reinforcement)',
        callsign: 'Viper-Point',
        role: 'Breacher (AKM Heavy Burst)',
        isCommander: false,
        position: extra,
        rotationY: Math.PI,
        health: 100,
        kills: 0,
        deaths: 0,
        state: 'advance',
        targetPosition: { x: 0, y: 0, z: 0 },
        shootCooldown: 0.9,
        burstRemaining: 3,
        currentAmmo: 30,
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        alertLevel: 'combat',
      });
    }

    this.enemies = waveRoster;

    // Register OPFOR kits — commanders / flankers may draw suppressors
    for (const enemy of this.enemies) {
      const kit = equipmentManager.registerEnemy(enemy.id);
      if (enemy.role.toLowerCase().includes('flank')) {
        kit.equip('pbs1_suppressor');
      }
      if (enemy.role.toLowerCase().includes('marksman') || enemy.role.toLowerCase().includes('svd')) {
        kit.equip('pso1');
        kit.equip('6b47');
      }
      enemy.loadout = kit.snapshot();
    }

    const approachText =
      approach === 'east_flank'
        ? 'INCOMING HOSTILES BREACHING EAST SECTOR!'
        : approach === 'west_breach'
        ? 'INCOMING HOSTILES INFILTRATING WEST BERM!'
        : approach === 'pincer_ambush'
        ? 'ALERT: MULTI-VECTOR PINCER AMBUSH DETECTED!'
        : 'HOSTILE CELL ADVANCING FROM NORTH COMPLEX!';

    setTimeout(() => {
      this.broadcastBark('Sgt. Tariq Al-Masri', 'General Tariq', `${approachText} Encircle and eliminate!`, false);
    }, 1200);
  }

  public spawnInitialSquad(): void {
    this.spawnFriendlySquad(friendlyStagingAnchor());
    this.spawnWave(1);
  }

  /** Move the squads onto walkable street points after the city mesh loads. */
  public relocateToCity(layout: CitySpawnLayout): void {
    const staging = TACTICAL_SPAWN_ZONES.find((zone) => zone.id === 'friendly_staging');
    if (staging) {
      staging.position.x = layout.player.x;
      staging.position.z = layout.player.z;
    }

    this.cityEnemySpawns = layout.enemies.map((spot) => ({ x: spot.x, y: spot.y, z: spot.z }));

    const enemyZones = TACTICAL_SPAWN_ZONES.filter((zone) => zone.faction === 'enemy');
    layout.enemies.forEach((spot, index) => {
      const zone = enemyZones[index];
      if (!zone) return;
      zone.position.x = spot.x;
      zone.position.z = spot.z;
    });

    this.friendlies.forEach((friendly, index) => {
      const spot = layout.friendlies[index] ?? layout.player;
      friendly.position.x = spot.x;
      friendly.position.y = spot.y;
      friendly.position.z = spot.z;
    });

    this.enemies.forEach((enemy, index) => {
      const spot = layout.enemies[index % Math.max(1, layout.enemies.length)];
      if (!spot) return;
      enemy.position.x = spot.x;
      enemy.position.y = spot.y;
      enemy.position.z = spot.z;
      enemy.targetPosition = { x: layout.player.x, y: layout.player.y, z: layout.player.z };
    });

    if (layout.covers.length > 0) {
      this.coverNodes = layout.covers.map((cover, index) => ({
        id: `city_cover_${index}`,
        position: { x: cover.x, y: cover.y, z: cover.z },
        isHighGround: cover.y > 1.2,
        occupantId: null,
      }));
      setHuntRoute(layout.covers);
    }
  }

  public broadcastBark(speaker: string, callsign: string, barkText: string, isBluefor: boolean): void {
    radioChatter.submitLine({
      speakerId: speaker,
      callsign,
      text: barkText,
      isBluefor,
    });
  }

  /**
   * COVER SEARCH CONSTRAINED TO SQUAD PROXIMITY:
   * Only returns cover within maxDist of entity so friendlies never abandon the squad!
   */
  public queryBestLocalCover(
    entityPos: { x: number; y: number; z: number },
    threatPos: { x: number; y: number; z: number },
    maxDist = 9.0
  ): CoverNode | null {
    let bestNode: CoverNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.coverNodes) {
      const distToSelf = Math.hypot(node.position.x - entityPos.x, node.position.z - entityPos.z);
      if (distToSelf > maxDist) continue; // STRICTLY LOCAL! Never run across the map!

      const distToThreat = Math.hypot(node.position.x - threatPos.x, node.position.z - threatPos.z);
      let score = 50 - distToSelf;
      if (distToThreat > 8 && distToThreat < 28) score += 30;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
    return bestNode;
  }

  // --- HIT DETECTION & REAL KILL ATTRIBUTION ---
  public hitEnemy(enemyId: string, damage: number, shooterId: string): boolean {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (!enemy || enemy.health <= 0) return false;

    // Plate / helmet mitigation from equipment system
    const armor = equipmentManager.resolveArmorHit(enemyId, 'torso_heart', 0.55);
    const applied = armor.stopped
      ? Math.max(2, damage * (armor.bluntTrauma ? armor.bleedMultiplier : 0.15))
      : damage;
    enemy.health -= applied;

    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.deaths += 1;
      enemy.state = 'dead';

      if (enemy.isCommander) {
        setTimeout(() => {
          this.broadcastBark(
            'Hostile Squad',
            'Viper-East',
            'General Tariq is down! The commander has fallen! Attack independently!',
            false
          );
        }, 500);
      }

      if (shooterId === 'player') {
        // Player kill
      } else {
        const friendly = this.friendlies.find((f) => f.id === shooterId);
        if (friendly) {
          friendly.kills += 1;
          this.broadcastBark(friendly.id, friendly.callsign, `Hostile neutralized! Clean hit!`, true);
        }
      }

      const aliveEnemies = this.enemies.filter((e) => e.health > 0);
      if (aliveEnemies.length === 0 && !this.waveSpawnPending) {
        this.waveSpawnPending = true;
        this.waveSpawnTimer = 4.0;
        if (this.onWaveAnnounce) {
          this.onWaveAnnounce(
            `SECTOR CLEAR! HOSTILE WAVE ${this.currentWave + 1} SQUAD APPROACHING IN 4 SECONDS!`
          );
        }
      }

      return true;
    }
    return false;
  }

  public hitFriendly(friendlyId: string, damage: number, shooterId: string): boolean {
    const friendly = this.friendlies.find((f) => f.id === friendlyId);
    if (!friendly || friendly.status === 'KIA') return false;

    const armor = equipmentManager.resolveArmorHit(friendlyId, 'torso_heart', 0.55);
    const applied = armor.stopped
      ? Math.max(2, damage * (armor.bluntTrauma ? armor.bleedMultiplier : 0.15))
      : damage;
    friendly.health -= applied;
    if (friendly.health <= 35 && friendly.status === 'ALIVE') {
      friendly.status = 'WIA';
      this.broadcastBark(friendly.id, friendly.callsign, `I'm hit! Taking heavy fire!`, true);
    }

    if (friendly.health <= 0) {
      friendly.health = 0;
      friendly.deaths += 1;
      friendly.status = 'KIA';

      const enemy = this.enemies.find((e) => e.id === shooterId);
      if (enemy) {
        enemy.kills += 1;
        this.broadcastBark(enemy.id, enemy.callsign, `Bluefor operator neutralized! Keep pushing!`, false);
      }
      return true;
    }
    return false;
  }

  // --- MAIN SIMULATION LOOP: delegates combat AI to src/ai modules ---
  public update(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    onFireBullet: (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      isBluefor: boolean,
      shooterId: string
    ) => void,
    hasLineOfSight?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean
  ): void {
    if (this.waveSpawnPending) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        this.spawnWave(this.currentWave + 1);
      }
    }

    equipmentManager.syncCombatants(this.friendlies, this.enemies);

    const fire = (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      isBluefor: boolean,
      shooterId: string
    ) => {
      audioManager.playGunfire({
        muzzle: from,
        target: to,
        weapon: isBluefor ? 'm4a1' : 'ak47',
        isPlayer: false,
        listener: { x: playerPos.x, y: playerPos.y || 1.6, z: playerPos.z },
      });
      onFireBullet(from, to, isBluefor, shooterId);
    };

    const bark = (speaker: string, callsign: string, text: string, isBluefor: boolean) => {
      this.broadcastBark(speaker, callsign, text, isBluefor);
    };

    updateEnemySquad({
      dt,
      enemies: this.enemies,
      friendlies: this.friendlies,
      playerPos,
      blackboard: this.blackboard,
      hasLineOfSight,
      onFireBullet: fire,
      audio: tacticalAudio,
      broadcastBark: bark,
    });

    updateFriendlySquad({
      dt,
      friendlies: this.friendlies,
      enemies: this.enemies,
      coverNodes: this.coverNodes,
      playerPos,
      hasLineOfSight,
      onFireBullet: fire,
      audio: tacticalAudio,
      broadcastBark: bark,
    });

    const stepUnit = (id: string, pos: { x: number; z: number }, alive: boolean) => {
      if (!alive) {
        this.lastStepPos.delete(id);
        return;
      }
      const prev = this.lastStepPos.get(id);
      const speed = prev && dt > 0 ? Math.hypot(pos.x - prev.x, pos.z - prev.z) / dt : 0;
      audioManager.updateFootsteps(id, { x: pos.x, y: 0, z: pos.z }, speed, { surface: 'concrete' });
      this.lastStepPos.set(id, { x: pos.x, z: pos.z });
    };
    for (const enemy of this.enemies) stepUnit(enemy.id, enemy.position, enemy.health > 0);
    for (const friendly of this.friendlies) stepUnit(friendly.id, friendly.position, friendly.status !== 'KIA');

    radioChatter.update();
  }
}

export const aiDirector = new GuerrillaAiDirector();
