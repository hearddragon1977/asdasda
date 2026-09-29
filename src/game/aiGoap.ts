import { EnemyCombatant, EnemyAction, FriendlyCombatant } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';
<<<<<<< HEAD
import { tacticalLayout } from '../systems/mapGenerator';
import { radioChatter, type RadioCallout } from '../systems/radioChatter';
=======
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
>>>>>>> origin/main

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

  // Commander Tactical Orders
  public commanderOrderTimer: number = 2.5;

  public onWaveAnnounce?: (msg: string) => void;
  public onCombatBark?: (speaker: string, text: string, isBluefor: boolean) => void;
  private lastStepPos = new Map<string, { x: number; z: number }>();

  private scheduled: { remaining: number; run: () => void }[] = [];
  private enemyContactCalled = false;
  private friendlyContactCalled = false;

  constructor() {
    radioChatter.onTransmission = (callsign, text, isBluefor) => {
      this.blackboard.lastBark = { speaker: callsign, text, time: performance.now() };
      this.onCombatBark?.(callsign, text, isBluefor);
    };
    this.initCoverNodes();
    this.spawnFriendlySquad();
    this.spawnWave(1);
    radioChatter.onTransmission = (callsign, text, isBluefor) => {
      this.blackboard.lastBark = { speaker: callsign, text, time: performance.now() };
      this.onCombatBark?.(callsign, text, isBluefor);
    };
  }

  private initCoverNodes(): void {
<<<<<<< HEAD
    this.coverNodes = [];
    for (const placement of tacticalLayout?.placements ?? []) {
      const node = placement?.coverNode;
      if (!node?.position) continue;
      this.coverNodes.push({
        id: node.id,
        position: {
          x: node.position.x,
          y: node.position.y ?? 0,
          z: node.position.z,
        },
        isHighGround: Boolean(node.isHighGround),
        occupantId: null,
      });
    }
    if (this.coverNodes.length === 0) {
      this.coverNodes.push({
        id: 'fallback_cover',
        position: { x: -6, y: 0, z: -8 },
        isHighGround: false,
        occupantId: null,
      });
    }
=======
    this.coverNodes = TACTICAL_COVER_NODES.map((n) => ({
      ...n,
      occupantId: null,
    }));
>>>>>>> origin/main
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
    for (const friendly of this.friendlies) {
      friendly.magazineSize = friendly.currentAmmo;
      friendly.reloadTimer = 0;
    }
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

    for (const enemy of waveRoster) {
      enemy.magazineSize = enemy.currentAmmo;
      enemy.reloadTimer = 0;
      enemy.stateTimer = 0;
    }

    this.enemies = waveRoster;
    this.enemyContactCalled = false;
    this.friendlyContactCalled = false;
    this.scheduled = [];
    radioChatter.clearQueue();
    radioChatter.resetKind('contact');
    radioChatter.resetKind('squad_leader_casualty');

    const approachText =
      approach === 'east_flank'
        ? 'INCOMING HOSTILES BREACHING EAST SECTOR!'
        : approach === 'west_breach'
        ? 'INCOMING HOSTILES INFILTRATING WEST BERM!'
        : approach === 'pincer_ambush'
        ? 'ALERT: MULTI-VECTOR PINCER AMBUSH DETECTED!'
        : 'HOSTILE CELL ADVANCING FROM NORTH COMPLEX!';

    this.broadcastBark(
      'Sgt. Tariq Al-Masri',
      'General Tariq',
      `${approachText} Encircle and eliminate!`,
      false,
      1.2
    );

    for (const enemy of this.enemies) {
      if (enemy.state !== 'flank_left' && enemy.state !== 'flank_right') continue;
      this.emitCallout({
        kind: 'flanking',
        speakerId: enemy.id,
        callsign: enemy.callsign,
        isBluefor: false,
        from: enemy.position,
        to: { x: 0, z: 0 },
        side: enemy.state === 'flank_right' ? 'right' : 'left',
        delaySec: 2.8,
      });
    }
  }

  public spawnInitialSquad(): void {
    this.spawnFriendlySquad(friendlyStagingAnchor());
    this.spawnWave(1);
  }

<<<<<<< HEAD
  public broadcastBark(
    speaker: string,
    callsign: string,
    barkText: string,
    isBluefor: boolean,
    delaySec = 0
  ): void {
    if (!callsign || !barkText) return;
    radioChatter.submitLine({
      speakerId: speaker || callsign,
      callsign,
      text: barkText,
      isBluefor,
      delaySec,
    });
  }

  private emitCallout(event: RadioCallout): void {
    radioChatter.callout(event);
  }

  private schedule(delay: number, run: () => void): void {
    this.scheduled.push({ remaining: Math.max(0, delay), run });
  }

  private tickSchedule(dt: number): void {
    const pending: { remaining: number; run: () => void }[] = [];
    for (const item of this.scheduled) {
      item.remaining -= dt;
      if (item.remaining <= 0) {
        try {
          item.run();
        } catch {
          // Orders captured from a cleared wave are ignored.
        }
      } else {
        pending.push(item);
      }
    }
    this.scheduled = pending;
  }

  private enemyMagazine(enemy: EnemyCombatant): number {
    if ((enemy.magazineSize ?? 0) > 0) return enemy.magazineSize as number;
    if (enemy.role?.includes('RPK')) return 75;
    if (enemy.role?.includes('SVD')) return 10;
    return 30;
  }

  private friendlyMagazine(friendly: FriendlyCombatant): number {
    if ((friendly.magazineSize ?? 0) > 0) return friendly.magazineSize as number;
    if (friendly.role?.includes('SAW')) return 100;
    if (friendly.role?.includes('Marksman')) return 20;
    return 30;
  }

  private stepToward(
    pos: { x: number; z: number } | null | undefined,
    targetX: number,
    targetZ: number,
    speed: number,
    dt: number
  ): number {
    if (!pos || !Number.isFinite(targetX) || !Number.isFinite(targetZ) || !Number.isFinite(speed) || !Number.isFinite(dt)) {
      return Infinity;
    }
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist) || dist < 0.001) return dist;
    pos.x += (dx / dist) * speed * dt;
    pos.z += (dz / dist) * speed * dt;
    return dist;
=======
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
>>>>>>> origin/main
  }

  /**
   * COVER SEARCH CONSTRAINED TO SQUAD PROXIMITY:
   * Only returns cover within maxDist of entity so friendlies never abandon the squad!
   */
  public queryBestLocalCover(
    entityPos: { x: number; y: number; z: number } | null | undefined,
    threatPos: { x: number; y: number; z: number } | null | undefined,
    maxDist = 9.0
  ): CoverNode | null {
    if (!entityPos || !threatPos || !this.coverNodes?.length) return null;
    let bestNode: CoverNode | null = null;
    let bestScore = -Infinity;

    const threatX = threatPos.x - entityPos.x;
    const threatZ = threatPos.z - entityPos.z;
    const threatLen = Math.hypot(threatX, threatZ) || 1;

    for (const node of this.coverNodes) {
      if (!node?.position) continue;
      const distToSelf = Math.hypot(node.position.x - entityPos.x, node.position.z - entityPos.z);
      if (!Number.isFinite(distToSelf) || distToSelf > maxDist) continue;

      const distToThreat = Math.hypot(node.position.x - threatPos.x, node.position.z - threatPos.z);
      let score = 50 - distToSelf;
      if (distToThreat > 8 && distToThreat < 28) score += 30;

      const nodeX = node.position.x - entityPos.x;
      const nodeZ = node.position.z - entityPos.z;
      const nodeLen = Math.hypot(nodeX, nodeZ) || 1;
      const alignment = (threatX / threatLen) * (nodeX / nodeLen) + (threatZ / threatLen) * (nodeZ / nodeLen);
      if (alignment > 0.35) score += 12;
      if (node.isHighGround) score += 8;

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
        const speaker = this.enemies.find((unit) => unit.health > 0 && unit.id !== enemy.id);
        this.emitCallout({
          kind: 'squad_leader_casualty',
          speakerId: speaker?.id ?? 'viper_net',
          callsign: speaker?.callsign ?? 'Viper-Net',
          isBluefor: false,
          targetCallsign: enemy.callsign || 'General Tariq',
          delaySec: 0.45,
        });
      }

      if (shooterId === 'player') {
        // Player kill is attributed by the viewport.
      } else {
        const friendly = this.friendlies.find((f) => f.id === shooterId);
        if (friendly) {
          friendly.kills += 1;
          this.emitCallout({
            kind: 'neutralized',
            speakerId: friendly.id,
            callsign: friendly.callsign,
            isBluefor: true,
            from: friendly.position,
            to: enemy.position,
          });
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

    if (enemy.state !== 'dead') {
      enemy.resumeState = enemy.state === 'take_cover' ? enemy.resumeState ?? 'advance' : enemy.state;
      enemy.state = 'take_cover';
      enemy.stateTimer = 3.2;
    }
    return false;
  }

  public hitFriendly(friendlyId: string, damage: number, shooterId: string): boolean {
    const friendly = this.friendlies.find((f) => f.id === friendlyId);
    if (!friendly || friendly.status === 'KIA') return false;

    friendly.health -= damage;
    if (friendly.health <= 35 && friendly.status === 'ALIVE') {
      friendly.status = 'WIA';
      this.emitCallout({
        kind: 'wounded',
        speakerId: friendly.id,
        callsign: friendly.callsign,
        isBluefor: true,
      });
    }

    if (friendly.health <= 0) {
      friendly.health = 0;
      friendly.deaths += 1;
      friendly.status = 'KIA';

      if (friendly.id === 'dustoff_lead') {
        const speaker = this.friendlies.find((unit) => unit.status !== 'KIA' && unit.id !== friendly.id);
        this.emitCallout({
          kind: 'squad_leader_casualty',
          speakerId: speaker?.id ?? 'bluefor_net',
          callsign: speaker?.callsign ?? 'Bluefor-Net',
          isBluefor: true,
          targetCallsign: friendly.callsign || 'Dustoff-Lead',
        });
      }

      const enemy = this.enemies.find((e) => e.id === shooterId);
      if (enemy) {
        enemy.kills += 1;
        this.emitCallout({
          kind: 'neutralized',
          speakerId: enemy.id,
          callsign: enemy.callsign,
          isBluefor: false,
          text: 'Bluefor operator neutralized! Keep pushing!',
        });
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
<<<<<<< HEAD
    if (this.commanderOrderTimer <= 0) {
      this.commanderOrderTimer = 5.5 + Math.random() * 3.0;

      const orders = [
        {
          bark: 'Flankers, push the crates! Gunner, suppress the American leader!',
          action: () => {
            const fLeft = this.enemies.find((e) => e.state === 'flank_left' && e.health > 0);
            if (fLeft) fLeft.targetPosition = { x: -28, y: 0, z: playerPos.z - 4 };
            const gunner = this.enemies.find((e) => e.role?.includes('RPK') && e.health > 0);
            if (gunner) gunner.burstRemaining = 6;
          },
        },
        {
          bark: 'Target is in the open! Focus fire on the point man!',
          action: () => {
            this.enemies.forEach((e) => {
              if (e.health > 0) e.shootCooldown = 0.2;
            });
          },
        },
        {
          bark: 'He is ducking behind cover! Lay down heavy suppression on his position!',
          action: () => {
            this.enemies.forEach((e) => {
              if (e.health > 0) e.burstRemaining = Math.max(e.burstRemaining || 0, 3);
            });
          },
        },
      ];

      const selected = orders[Math.floor(Math.random() * orders.length)];
      if (!selected) return;
      this.broadcastBark('Sgt. Tariq', 'General Tariq', selected.bark, false);
      this.schedule(1, selected.action);
    }
=======
    if (this.commanderOrderTimer > 0) return;
    this.commanderOrderTimer = 4.0 + Math.random() * 1.6;
    this.assignGuerrillaPlan(playerPos, hasLineOfSight);
>>>>>>> origin/main
  }

  // --- MAIN SIMULATION LOOP: SQUAD COHESION & BALANCED BALLISTICS ---
  public update(
    dt: number,
    playerPos: { x: number; y: number; z: number } | null | undefined,
    onFireBullet: (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      isBluefor: boolean,
      shooterId: string
    ) => void,
    hasLineOfSight?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean
  ): void {
    radioChatter.update();
    if (!Number.isFinite(dt) || dt <= 0 || !playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) {
      return;
    }
    this.tickSchedule(dt);

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

<<<<<<< HEAD
    // 1. ENEMY COMBATANTS: COOPERATION & INDEPENDENT FIRING
    for (const enemy of aliveEnemies) {
      if (!enemy.position) continue;
      const previousState = enemy.state;
      let targetPos = playerPos;
      const distToPlayer = Math.hypot(playerPos.x - enemy.position.x, playerPos.z - enemy.position.z);

      if (!this.enemyContactCalled && distToPlayer < 30 && distToPlayer > 0.5) {
        this.enemyContactCalled = true;
        this.emitCallout({
          kind: 'contact',
          speakerId: enemy.id,
          callsign: enemy.callsign,
          isBluefor: false,
          from: enemy.position,
          to: playerPos,
          targetCallsign: 'point man',
        });
      }

      if (distToPlayer > 18) {
        for (const f of aliveFriendlies) {
          if (!f.position) continue;
          const d = Math.hypot(f.position.x - enemy.position.x, f.position.z - enemy.position.z);
          if (d < 10) {
            targetPos = f.position;
            break;
          }
        }
=======
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
>>>>>>> origin/main
      }
      const prev = this.lastStepPos.get(id);
      const speed = prev && dt > 0 ? Math.hypot(pos.x - prev.x, pos.z - prev.z) / dt : 0;
      audioManager.updateFootsteps(id, { x: pos.x, y: 0, z: pos.z }, speed, { surface: 'concrete' });
      this.lastStepPos.set(id, { x: pos.x, z: pos.z });
    };
    for (const enemy of this.enemies) stepUnit(enemy.id, enemy.position, enemy.health > 0);
    for (const friendly of this.friendlies) stepUnit(friendly.id, friendly.position, friendly.status !== 'KIA');

<<<<<<< HEAD
      const dx = targetPos.x - enemy.position.x;
      const dz = targetPos.z - enemy.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) enemy.rotationY = Math.atan2(dx, dz);

      const role = enemy.role ?? '';
      const isRPK = role.includes('RPK');
      const isSVD = role.includes('SVD');

      if ((enemy.reloadTimer ?? 0) > 0) {
        enemy.reloadTimer = (enemy.reloadTimer ?? 0) - dt;
        enemy.isShooting = false;
        if (enemy.reloadTimer <= 0) {
          enemy.reloadTimer = 0;
          enemy.currentAmmo = this.enemyMagazine(enemy);
        }
      } else {
        enemy.shootCooldown = (enemy.shootCooldown ?? 1.0) - dt;
        if (enemy.shootCooldown <= 0 && dist > 0.05 && dist < 42) {
          if ((enemy.currentAmmo ?? 0) <= 0) {
            enemy.reloadTimer = isRPK ? 2.6 : isSVD ? 2.4 : 1.9;
            enemy.shootCooldown = enemy.reloadTimer;
            enemy.isShooting = false;
            this.emitCallout({
              kind: 'reloading',
              speakerId: enemy.id,
              callsign: enemy.callsign,
              isBluefor: false,
            });
          } else if (typeof onFireBullet === 'function') {
            const burstSize = isRPK ? 6 : isSVD ? 1 : 3;
            enemy.burstRemaining = enemy.burstRemaining || burstSize;
            if (isRPK && enemy.burstRemaining >= burstSize) {
              this.emitCallout({
                kind: 'suppression',
                speakerId: enemy.id,
                callsign: enemy.callsign,
                isBluefor: false,
                from: enemy.position,
                to: targetPos,
              });
            }

            tacticalAudio.playEnemyAKFire();
            enemy.isShooting = true;
            enemy.currentAmmo = Math.max(0, (enemy.currentAmmo ?? 1) - 1);

            const spread = isSVD ? 0.35 : isRPK ? 1.4 : 0.8;
            const spreadX = (Math.random() - 0.5) * spread;
            const spreadZ = (Math.random() - 0.5) * spread;

            onFireBullet(
              { x: enemy.position.x, y: 0.9, z: enemy.position.z },
              { x: targetPos.x + spreadX, y: 0.9, z: targetPos.z + spreadZ },
              false,
              enemy.id
            );

            enemy.burstRemaining -= 1;
            if (enemy.burstRemaining > 0) {
              enemy.shootCooldown = 0.1;
            } else {
              enemy.shootCooldown = isRPK ? 1.4 : isSVD ? 2.2 : 1.6 + Math.random() * 0.8;
              enemy.burstRemaining = burstSize;
            }
          }
        } else {
          enemy.isShooting = false;
        }
      }

      switch (enemy.state) {
        case 'flank_left': {
          const target = enemy.targetPosition || { x: -28, y: 0, z: playerPos.z };
          const fDist = this.stepToward(enemy.position, target.x, target.z, 5.2, dt);
          if (fDist <= 1.2) enemy.state = 'advance';
          break;
        }
        case 'flank_right': {
          const target = enemy.targetPosition || { x: 28, y: 0, z: playerPos.z };
          const fDist = this.stepToward(enemy.position, target.x, target.z, 5.2, dt);
          if (fDist <= 1.2) enemy.state = 'advance';
          break;
        }
        case 'take_cover': {
          const node = this.queryBestLocalCover(enemy.position, playerPos, 16);
          if (node) this.stepToward(enemy.position, node.position.x, node.position.z, 4.2, dt);
          enemy.stateTimer = (enemy.stateTimer ?? 3.2) - dt;
          if ((enemy.stateTimer ?? 0) <= 0) {
            const resume = enemy.resumeState;
            enemy.state = resume && resume !== 'take_cover' && resume !== 'dead'
              ? resume
              : enemy.isCommander
              ? 'commander'
              : 'advance';
            enemy.stateTimer = 0;
          }
          break;
        }
        case 'commander':
        case 'overwatch': {
          if (distToPlayer < 12 && dist > 0.05) {
            enemy.position.x -= (dx / dist) * 3.5 * dt;
            enemy.position.z -= (dz / dist) * 3.5 * dt;
          }
          break;
        }
        case 'dead':
          break;
        default: {
          if (distToPlayer > 14 && dist > 0.05) {
            enemy.position.x += (dx / dist) * 3.8 * dt;
            enemy.position.z += (dz / dist) * 3.8 * dt;
          }
          break;
        }
      }

      if (
        enemy.state !== previousState &&
        (enemy.state === 'flank_left' || enemy.state === 'flank_right')
      ) {
        this.emitCallout({
          kind: 'flanking',
          speakerId: enemy.id,
          callsign: enemy.callsign,
          isBluefor: false,
          from: enemy.position,
          to: playerPos,
          side: enemy.state === 'flank_right' ? 'right' : 'left',
        });
      }
    }

    // 2. BLUEFOR FRIENDLY SQUAD: SQUAD-LEAD COHESION (NEVER GO OFF ON THEIR OWN!)
    for (const friendly of aliveFriendlies) {
      if (!friendly.position) continue;
      const previousState = friendly.state;
      const role = friendly.role ?? '';
      // Find nearest hostile threat
      let nearestEnemy: EnemyCombatant | null = null;
      let minEnemyDist = Infinity;
      for (const enemy of aliveEnemies) {
        if (!enemy.position) continue;
        const d = Math.hypot(enemy.position.x - friendly.position.x, enemy.position.z - friendly.position.z);
        if (d < minEnemyDist) {
          minEnemyDist = d;
          nearestEnemy = enemy;
        }
      }

      if (!this.friendlyContactCalled && nearestEnemy && minEnemyDist < 32) {
        this.friendlyContactCalled = true;
        this.emitCallout({
          kind: 'contact',
          speakerId: friendly.id,
          callsign: friendly.callsign,
          isBluefor: true,
          from: friendly.position,
          to: nearestEnemy.position,
          targetCallsign: nearestEnemy.callsign,
        });
      }

      // Tactical Positioning: strictly tethered to Player's formation!
      const offX = friendly.formationOffset?.x ?? 0;
      const offZ = friendly.formationOffset?.z ?? 0;
      let targetX = playerPos.x + offX;
      let targetZ = playerPos.z + offZ;
      let usingCover = false;

      if (role.includes('SAW') && nearestEnemy && minEnemyDist < 30) {
        const localCover = this.queryBestLocalCover(friendly.position, nearestEnemy.position, 6.0);
        if (localCover) {
          targetX = THREE_LERP(targetX, localCover.position.x, 0.4);
          targetZ = THREE_LERP(targetZ, localCover.position.z, 0.4);
          usingCover = true;
        } else {
          targetX = playerPos.x + 3.8;
          targetZ = playerPos.z + 1.2;
        }
      } else if (role.includes('Marksman') && nearestEnemy) {
        targetX = playerPos.x - 3.5;
        targetZ = playerPos.z + 3.5;
      } else if (role.includes('Corpsman')) {
        targetX = playerPos.x - 2.5;
        targetZ = playerPos.z + 1.5;
      } else {
        targetX = playerPos.x + 3.5;
        targetZ = playerPos.z + 3.0;
      }

      const reloading = (friendly.reloadTimer ?? 0) > 0;
      const nextState: FriendlyCombatant['state'] = reloading
        ? previousState
        : role.includes('Marksman') && nearestEnemy
        ? 'bounding'
        : role.includes('SAW') && nearestEnemy && minEnemyDist < 30
        ? 'suppress'
        : usingCover || (nearestEnemy != null && minEnemyDist < 12)
        ? 'take_cover'
        : 'follow';
      if (nextState !== previousState && nextState === 'suppress' && nearestEnemy) {
        this.emitCallout({
          kind: 'suppression',
          speakerId: friendly.id,
          callsign: friendly.callsign,
          isBluefor: true,
          from: friendly.position,
          to: nearestEnemy.position,
        });
      }
      friendly.state = nextState;

      // Move towards formation target
      const fdx = targetX - friendly.position.x;
      const fdz = targetZ - friendly.position.z;
      const distToGoal = Math.hypot(fdx, fdz);

      // Fast catch-up speed so they never get separated from the player
      const moveSpeed = distToGoal > 4.0 ? 11.0 : 8.5;
      if (distToGoal > 0.4 && Number.isFinite(distToGoal)) {
        friendly.position.x += (fdx / distToGoal) * moveSpeed * dt;
        friendly.position.z += (fdz / distToGoal) * moveSpeed * dt;
      }

      if ((friendly.reloadTimer ?? 0) > 0) {
        friendly.reloadTimer = (friendly.reloadTimer ?? 0) - dt;
        friendly.isShooting = false;
        if (friendly.reloadTimer <= 0) {
          friendly.reloadTimer = 0;
          friendly.currentAmmo = this.friendlyMagazine(friendly);
        }
      } else if (nearestEnemy?.position) {
        friendly.targetEnemyId = nearestEnemy.id;

        const edx = nearestEnemy.position.x - friendly.position.x;
        const edz = nearestEnemy.position.z - friendly.position.z;
        if (edx !== 0 || edz !== 0) friendly.rotationY = Math.atan2(edx, edz);

        friendly.shootCooldown -= dt;
        if (friendly.shootCooldown <= 0 && minEnemyDist < 42 && typeof onFireBullet === 'function') {
          if ((friendly.currentAmmo ?? 0) <= 0) {
            friendly.reloadTimer = role.includes('SAW') ? 3.1 : 1.8;
            friendly.shootCooldown = friendly.reloadTimer;
            friendly.isShooting = false;
            this.emitCallout({
              kind: 'reloading',
              speakerId: friendly.id,
              callsign: friendly.callsign,
              isBluefor: true,
            });
          } else {
            const isSAW = role.includes('SAW');
            friendly.shootCooldown = isSAW ? 1.0 : 1.4 + Math.random() * 0.6;
            friendly.isShooting = true;
            friendly.currentAmmo = Math.max(0, (friendly.currentAmmo ?? 1) - 1);
            tacticalAudio.playM4Fire();

            const spreadX = (Math.random() - 0.5) * 0.9;
            const spreadZ = (Math.random() - 0.5) * 0.9;

            onFireBullet(
              { x: friendly.position.x, y: 0.9, z: friendly.position.z },
              {
                x: nearestEnemy.position.x + spreadX,
                y: 0.9,
                z: nearestEnemy.position.z + spreadZ,
              },
              true,
              friendly.id
            );

            if (isSAW) {
              this.emitCallout({
                kind: 'suppression',
                speakerId: friendly.id,
                callsign: friendly.callsign,
                isBluefor: true,
                from: friendly.position,
                to: nearestEnemy.position,
              });
            } else if (Math.random() < 0.12) {
              const barks = role.includes('Marksman')
                ? [
                    'Shadow-3 has overwatch. Sniping high-value targets.',
                    'Target in crosshairs. Engaging hostile leader!',
                    'Covering your advance, Viper!',
                  ]
                : [
                    'Doc Miller covering your left, boss! Stay alert!',
                    'Watch your spacing!',
                    'Target suppressed! Check your six!',
                  ];
              const bark = barks[Math.floor(Math.random() * barks.length)];
              if (bark) this.broadcastBark(friendly.id, friendly.callsign, bark, true);
            }
          }
        }
      } else {
        friendly.isShooting = false;
        friendly.targetEnemyId = null;
        const aimX = playerPos.x - friendly.position.x;
        const aimZ = playerPos.z - friendly.position.z;
        if (aimX !== 0 || aimZ !== 0) friendly.rotationY = Math.atan2(aimX, aimZ);
      }
    }
=======
    radioChatter.update();
>>>>>>> origin/main
  }
}

export const aiDirector = new GuerrillaAiDirector();
