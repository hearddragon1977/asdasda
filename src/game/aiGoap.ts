import { EnemyCombatant, EnemyAction, FriendlyCombatant } from '../types/game';
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

  // Wave Respawn System
  public currentWave: number = 1;
  public waveSpawnPending: boolean = false;
  public waveSpawnTimer: number = 0;

  // Commander Tactical Orders
  public commanderOrderTimer: number = 2.5;

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
  }

  // --- RANDOMIZED INFILTRATION SPAWNS (ANTI-CAMPING SYSTEM) ---
  public spawnWave(waveNum: number): void {
    this.currentWave = waveNum;
    this.waveSpawnPending = false;
    this.commanderOrderTimer = 0.4;

    // Approaches map onto designated OPFOR spawn pads on the urban compound.
    const approaches = ['north_assault', 'east_flank', 'west_breach', 'pincer_ambush'] as const;
    const approach = approaches[Math.floor(Math.random() * approaches.length)];

    const north = spawnZonePos('enemy_north_gate');
    const west = spawnZonePos('enemy_west_alley');
    const east = spawnZonePos('enemy_east_alley');
    const nw = spawnZonePos('enemy_nw_warehouse');
    const ne = spawnZonePos('enemy_ne_warehouse');

    // All OPFOR start on marked enemy pads — never inside the BLUEFOR staging courtyard.
    let sgtPos = { ...north };
    let rpkPos = { x: nw.x + 3, y: 0, z: nw.z + 2 };
    let svdPos = { x: ne.x - 3, y: 0, z: ne.z + 2 };
    let flankWPos = { x: west.x + 2, y: 0, z: west.z - 4 };
    let flankEPos = { x: east.x - 2, y: 0, z: east.z - 4 };

    if (approach === 'east_flank') {
      sgtPos = { ...east };
      rpkPos = { x: east.x - 1, y: 0, z: east.z + 5 };
      svdPos = { ...ne };
      flankWPos = { x: east.x - 2, y: 0, z: east.z - 5 };
      flankEPos = { x: ne.x - 2, y: 0, z: ne.z + 3 };
    } else if (approach === 'west_breach') {
      sgtPos = { ...west };
      rpkPos = { x: west.x + 1, y: 0, z: west.z + 5 };
      svdPos = { ...nw };
      flankWPos = { x: nw.x + 2, y: 0, z: nw.z + 3 };
      flankEPos = { x: west.x + 2, y: 0, z: west.z - 5 };
    } else if (approach === 'pincer_ambush') {
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
      const randomPerimeterX = (Math.random() - 0.5) * 60;
      const randomPerimeterZ = (Math.random() - 0.5) * 60;
      waveRoster.push({
        id: `wave${waveNum}_enforcer`,
        name: 'Jamil (Reinforcement)',
        callsign: 'Viper-Point',
        role: 'Breacher (AKM Heavy Burst)',
        isCommander: false,
        position: { x: randomPerimeterX, y: 0, z: randomPerimeterZ },
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

  /**
   * Cover that can actually see the threat, biased to one side of the compound
   * so a guerrilla cell can split base-of-fire and assault elements.
   */
  private pickFightingCover(
    selfPos: { x: number; y: number; z: number },
    threat: { x: number; z: number },
    hasLineOfSight: ((from: { x: number; z: number }, to: { x: number; z: number }) => boolean) | undefined,
    options: {
      maxTravel?: number;
      side?: 'left' | 'right';
      preferHigh?: boolean;
      minStandoff?: number;
      maxStandoff?: number;
    } = {}
  ): CoverNode | null {
    const maxTravel = options.maxTravel ?? 22;
    const minStandoff = options.minStandoff ?? 10;
    const maxStandoff = options.maxStandoff ?? 30;
    let best: CoverNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.coverNodes) {
      if (options.side === 'left' && node.position.x > threat.x - 4) continue;
      if (options.side === 'right' && node.position.x < threat.x + 4) continue;

      const travel = Math.hypot(node.position.x - selfPos.x, node.position.z - selfPos.z);
      if (travel > maxTravel) continue;

      const standoff = Math.hypot(node.position.x - threat.x, node.position.z - threat.z);
      const sees =
        !hasLineOfSight ||
        hasLineOfSight({ x: node.position.x, z: node.position.z }, { x: threat.x, z: threat.z });

      let score = sees ? 48 : 4;
      score -= travel * 0.7;
      if (standoff >= minStandoff && standoff <= maxStandoff) score += 26;
      if (options.preferHigh && node.isHighGround) score += 18;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  /**
   * Guerrilla fireteam: one element pins from cover, one holds, one bounds the opposite alley.
   */
  private assignGuerrillaPlan(
    playerPos: { x: number; y: number; z: number },
    hasLineOfSight?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean
  ): void {
    const alive = this.enemies.filter((e) => e.health > 0 && e.position);
    if (alive.length === 0) return;

    const gunner = alive.find((e) => e.role.includes('RPK')) ?? alive[0];
    const marksman = alive.find((e) => e.role.includes('SVD') && e.id !== gunner.id);
    const rest = alive.filter((e) => e.id !== gunner.id && e.id !== marksman?.id);

    gunner.state = 'suppress';
    const gunnerCover = this.pickFightingCover(gunner.position, playerPos, hasLineOfSight, {
      maxTravel: 28,
      minStandoff: 14,
      maxStandoff: 30,
    });
    if (gunnerCover) gunner.targetPosition = { ...gunnerCover.position };

    if (marksman) {
      marksman.state = 'overwatch';
      const nest = this.pickFightingCover(marksman.position, playerPos, hasLineOfSight, {
        maxTravel: 32,
        preferHigh: true,
        minStandoff: 18,
        maxStandoff: 42,
      });
      if (nest) marksman.targetPosition = { ...nest.position };
    }

    rest.forEach((enemy) => {
      const side: 'left' | 'right' = enemy.position.x <= playerPos.x ? 'left' : 'right';
      enemy.state = side === 'left' ? 'flank_left' : 'flank_right';
      const lane = this.pickFightingCover(enemy.position, playerPos, hasLineOfSight, {
        maxTravel: 36,
        side,
        minStandoff: 8,
        maxStandoff: 22,
      });
      if (lane) {
        enemy.targetPosition = { ...lane.position };
      } else {
        const sign = side === 'left' ? -1 : 1;
        enemy.targetPosition = { x: playerPos.x + sign * 16, y: 0, z: playerPos.z - 6 };
      }
    });

    if (rest.length > 1) {
      const sorted = [...rest].sort((a, b) => {
        const da = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z);
        const db = Math.hypot(b.position.x - playerPos.x, b.position.z - playerPos.z);
        return da - db;
      });
      const holder = sorted[0];
      holder.state = 'suppress';
      const hold = this.pickFightingCover(holder.position, playerPos, hasLineOfSight, {
        maxTravel: 10,
        minStandoff: 12,
        maxStandoff: 34,
      });
      if (hold) holder.targetPosition = { ...hold.position };
    }

    this.blackboard.activeSuppressorId = gunner.id;
    this.blackboard.activeFlankerId = rest.find((e) => e.state === 'flank_left' || e.state === 'flank_right')?.id ?? null;

    this.broadcastBark(
      'Sgt. Tariq',
      'General Tariq',
      'Gunner pins the courtyard. One man holds, the other bounds the alley. Do not stack.',
      false
    );
  }

  private pushApart(
    units: { position: { x: number; z: number } }[],
    minDist: number
  ): void {
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i].position;
        const b = units[j].position;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= minDist || dist < 0.05) continue;
        const push = (minDist - dist) * 0.5;
        a.x -= (dx / dist) * push;
        a.z -= (dz / dist) * push;
        b.x += (dx / dist) * push;
        b.z += (dz / dist) * push;
      }
    }
  }

  // --- HIT DETECTION & REAL KILL ATTRIBUTION ---
  public hitEnemy(enemyId: string, damage: number, shooterId: string): boolean {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (!enemy || enemy.health <= 0) return false;

    enemy.health -= damage;

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

    friendly.health -= damage;
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

  // --- GUERRILLA FIRETEAM ORDERS (base of fire + one bound at a time) ---
  private updateCommanderTactics(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    hasLineOfSight?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean
  ): void {
    const alive = this.enemies.some((e) => e.health > 0);
    if (!alive) return;

    this.commanderOrderTimer -= dt;
    if (this.commanderOrderTimer > 0) return;
    this.commanderOrderTimer = 4.0 + Math.random() * 1.6;
    this.assignGuerrillaPlan(playerPos, hasLineOfSight);
  }

  // --- MAIN SIMULATION LOOP: SQUAD COHESION & BALANCED BALLISTICS ---
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
