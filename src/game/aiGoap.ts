import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';
import { updateEnemySquad } from '../ai/enemyAI.js';
import { updateFriendlySquad, queryBestLocalCover } from '../ai/friendlyAI.js';

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

/**
 * World / wave director. Combat cognition lives in src/ai/{enemy,friendly}AI.js —
 * this class owns spawning, hit attribution, cover layout, and the sim tick glue.
 */
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

  public currentWave: number = 1;
  public waveSpawnPending: boolean = false;
  public waveSpawnTimer: number = 0;

  public onWaveAnnounce?: (msg: string) => void;
  public onCombatBark?: (speaker: string, text: string, isBluefor: boolean) => void;

  constructor() {
    this.initCoverNodes();
    this.spawnFriendlySquad();
    this.spawnWave(1);
  }

  private initCoverNodes(): void {
    this.coverNodes = [
      { id: 'c1_west_berm', position: { x: -14, y: 0, z: -24 }, isHighGround: false, occupantId: null },
      { id: 'c2_east_berm', position: { x: 14, y: 0, z: -24 }, isHighGround: false, occupantId: null },
      { id: 'c3_center_crates_w', position: { x: -14, y: 0, z: -14 }, isHighGround: false, occupantId: null },
      { id: 'c4_center_crates_e', position: { x: 14, y: 0, z: -14 }, isHighGround: false, occupantId: null },
      { id: 'c5_north_bunker', position: { x: 0, y: 0, z: -34 }, isHighGround: true, occupantId: null },
      { id: 'c6_west_crates', position: { x: -24, y: 0, z: -2 }, isHighGround: false, occupantId: null },
      { id: 'c7_east_crates', position: { x: 24, y: 0, z: -2 }, isHighGround: false, occupantId: null },
      { id: 'c8_south_cover_w', position: { x: -16, y: 0, z: 14 }, isHighGround: false, occupantId: null },
      { id: 'c9_south_cover_e', position: { x: 16, y: 0, z: 14 }, isHighGround: false, occupantId: null },
    ];
  }

  /** Independent bluefor fireteam — spawn near the LZ, then pursue own objectives. */
  public spawnFriendlySquad(playerAnchor = { x: 0, z: 0 }): void {
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
        position: { x: playerAnchor.x - 2.8, y: 0, z: playerAnchor.z + 2.0 },
        rotationY: 0,
        health: 100,
        kills: prevDoc?.kills ?? 0,
        deaths: prevDoc?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.2,
        targetEnemyId: null,
        formationOffset: { x: -2.8, z: 2.0 },
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
        position: { x: playerAnchor.x + 3.2, y: 0, z: playerAnchor.z + 1.8 },
        rotationY: 0,
        health: 100,
        kills: prevRuiz?.kills ?? 0,
        deaths: prevRuiz?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 0.9,
        targetEnemyId: null,
        formationOffset: { x: 3.2, z: 1.8 },
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
        position: { x: playerAnchor.x - 3.8, y: 0, z: playerAnchor.z + 3.8 },
        rotationY: 0,
        health: 100,
        kills: prevOrtiz?.kills ?? 0,
        deaths: prevOrtiz?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.5,
        targetEnemyId: null,
        formationOffset: { x: -3.8, z: 3.8 },
        state: 'take_cover',
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
        position: { x: playerAnchor.x + 3.8, y: 0, z: playerAnchor.z + 3.8 },
        rotationY: 0,
        health: 100,
        kills: prevHayes?.kills ?? 0,
        deaths: prevHayes?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.4,
        targetEnemyId: null,
        formationOffset: { x: 3.8, z: 3.8 },
        state: 'bounding',
        isShooting: false,
        lastBark: '',
        lastBarkTime: 0,
        currentAmmo: 30,
      },
    ];
  }

  public spawnWave(waveNum: number): void {
    this.currentWave = waveNum;
    this.waveSpawnPending = false;

    const approaches = ['north_assault', 'east_flank', 'west_breach', 'pincer_ambush'] as const;
    const approach = approaches[Math.floor(Math.random() * approaches.length)];

    let sgtPos = { x: 0, y: 0, z: -32 };
    let rpkPos = { x: -14, y: 0, z: -25 };
    let svdPos = { x: 14, y: 0, z: -30 };
    let flankWPos = { x: -26, y: 0, z: -15 };
    let flankEPos = { x: 26, y: 0, z: -15 };

    if (approach === 'east_flank') {
      sgtPos = { x: 28, y: 0, z: -10 };
      rpkPos = { x: 32, y: 0, z: 5 };
      svdPos = { x: 34, y: 0, z: -25 };
      flankWPos = { x: 15, y: 0, z: 20 };
      flankEPos = { x: 28, y: 0, z: -20 };
    } else if (approach === 'west_breach') {
      sgtPos = { x: -28, y: 0, z: -10 };
      rpkPos = { x: -32, y: 0, z: 5 };
      svdPos = { x: -34, y: 0, z: -25 };
      flankWPos = { x: -28, y: 0, z: -20 };
      flankEPos = { x: -15, y: 0, z: 20 };
    } else if (approach === 'pincer_ambush') {
      sgtPos = { x: 0, y: 0, z: -34 };
      rpkPos = { x: -26, y: 0, z: 0 };
      svdPos = { x: 26, y: 0, z: 0 };
      flankWPos = { x: -20, y: 0, z: 24 };
      flankEPos = { x: 20, y: 0, z: 24 };
    }

    // isCommander is roster flavor only — combat AI is fully peer-elected, no order node.
    const waveRoster: EnemyCombatant[] = [
      {
        id: `wave${waveNum}_sgt`,
        name: 'Sgt. Tariq Al-Masri',
        callsign: 'General Tariq',
        role: 'Cell Assault Lead (AKM Auto Burst)',
        isCommander: true,
        position: sgtPos,
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
    this.blackboard.activeSuppressorId = null;
    this.blackboard.activeFlankerId = null;

    const approachText =
      approach === 'east_flank'
        ? 'INCOMING HOSTILES BREACHING EAST SECTOR!'
        : approach === 'west_breach'
          ? 'INCOMING HOSTILES INFILTRATING WEST BERM!'
          : approach === 'pincer_ambush'
            ? 'ALERT: MULTI-VECTOR PINCER AMBUSH DETECTED!'
            : 'HOSTILE CELL ADVANCING FROM NORTH COMPLEX!';

    setTimeout(() => {
      this.broadcastBark('Hostile Cell', 'Viper-Net', `${approachText} No central lead — suppress and wrap!`, false);
    }, 1200);
  }

  public spawnInitialSquad(): void {
    this.spawnFriendlySquad({ x: 0, z: 0 });
    this.spawnWave(1);
  }

  public broadcastBark(speaker: string, callsign: string, barkText: string, isBluefor: boolean): void {
    const now = performance.now();
    this.blackboard.lastBark = { speaker: callsign, text: barkText, time: now };
    tacticalAudio.playRadioSquelchChirp();
    if (this.onCombatBark) {
      this.onCombatBark(callsign, barkText, isBluefor);
    }
  }

  public queryBestLocalCover(
    entityPos: { x: number; y: number; z: number },
    threatPos: { x: number; y: number; z: number },
    maxDist = 9.0
  ): CoverNode | null {
    return queryBestLocalCover(this.coverNodes, entityPos, threatPos, maxDist) as CoverNode | null;
  }

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
            'Lead element down! Cell continues — suppress and flank independently!',
            false
          );
        }, 500);
      }

      if (shooterId !== 'player') {
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

  public update(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    onFireBullet: (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      isBluefor: boolean,
      shooterId: string
    ) => void
  ): void {
    if (this.waveSpawnPending) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        this.spawnWave(this.currentWave + 1);
      }
    }

    const bark = (speaker: string, callsign: string, text: string, isBluefor: boolean) =>
      this.broadcastBark(speaker, callsign, text, isBluefor);

    updateEnemySquad({
      dt,
      enemies: this.enemies,
      friendlies: this.friendlies,
      playerPos,
      blackboard: this.blackboard,
      onFireBullet,
      audio: tacticalAudio,
      broadcastBark: bark,
    });

    updateFriendlySquad({
      dt,
      friendlies: this.friendlies,
      enemies: this.enemies,
      coverNodes: this.coverNodes,
      playerPos,
      onFireBullet,
      audio: tacticalAudio,
      broadcastBark: bark,
    });
  }
}

export const aiDirector = new GuerrillaAiDirector();
