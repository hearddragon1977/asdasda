import { EnemyCombatant, EnemyAction, FriendlyCombatant } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';
import { audioManager } from '../systems/audio';

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

  // --- FRIENDLY AI SQUAD: RESPAWN & TACTICAL FIRETEAM INITIALIZATION ---
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
        state: 'follow',
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
        position: { x: playerAnchor.x + 3.8, y: 0, z: playerAnchor.z + 3.8 },
        rotationY: 0,
        health: 100,
        kills: prevHayes?.kills ?? 0,
        deaths: prevHayes?.deaths ?? 0,
        status: 'ALIVE',
        shootCooldown: 1.4,
        targetEnemyId: null,
        formationOffset: { x: 3.8, z: 3.8 },
        state: 'follow',
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
    this.commanderOrderTimer = 3.0;

    // Pick a randomized infiltration approach so the player can never sit and camp one angle!
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
      // 360-degree split assault
      sgtPos = { x: 0, y: 0, z: -34 };
      rpkPos = { x: -26, y: 0, z: 0 };
      svdPos = { x: 26, y: 0, z: 0 };
      flankWPos = { x: -20, y: 0, z: 24 };
      flankEPos = { x: 20, y: 0, z: 24 };
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

  // --- SQUAD COMMANDER TACTICAL DIRECTIVES ---
  private updateCommanderTactics(dt: number, playerPos: { x: number; y: number; z: number }): void {
    const commander = this.enemies.find((e) => e.isCommander && e.health > 0);
    if (!commander) return;

    this.commanderOrderTimer -= dt;
    if (this.commanderOrderTimer <= 0) {
      this.commanderOrderTimer = 5.5 + Math.random() * 3.0;

      const orders = [
        {
          bark: 'Flankers, push the crates! Gunner, suppress the American leader!',
          action: () => {
            const fLeft = this.enemies.find((e) => e.state === 'flank_left' && e.health > 0);
            if (fLeft) fLeft.targetPosition = { x: -28, y: 0, z: playerPos.z - 4 };
            const gunner = this.enemies.find((e) => e.role.includes('RPK') && e.health > 0);
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
      this.broadcastBark('Sgt. Tariq', 'General Tariq', selected.bark, false);
      setTimeout(selected.action, 1000);
    }
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
    ) => void
  ): void {
    if (this.waveSpawnPending) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        this.spawnWave(this.currentWave + 1);
      }
    }

    this.updateCommanderTactics(dt, playerPos);

    const aliveEnemies = this.enemies.filter((e) => e.health > 0);
    const aliveFriendlies = this.friendlies.filter((f) => f.status !== 'KIA');

    // 1. ENEMY COMBATANTS: COOPERATION & INDEPENDENT FIRING
    for (const enemy of aliveEnemies) {
      let targetPos = playerPos;
      const distToPlayer = Math.hypot(playerPos.x - enemy.position.x, playerPos.z - enemy.position.z);

      if (distToPlayer > 18) {
        for (const f of aliveFriendlies) {
          const d = Math.hypot(f.position.x - enemy.position.x, f.position.z - enemy.position.z);
          if (d < 10) {
            targetPos = f.position;
            break;
          }
        }
      }

      const dx = targetPos.x - enemy.position.x;
      const dz = targetPos.z - enemy.position.z;
      const dist = Math.hypot(dx, dz);

      enemy.rotationY = Math.atan2(dx, dz);

      // Rapid burst shooting
      enemy.shootCooldown = (enemy.shootCooldown ?? 1.0) - dt;
      if (enemy.shootCooldown <= 0 && dist < 42) {
        const isRPK = enemy.role.includes('RPK');
        const isSVD = enemy.role.includes('SVD');

        enemy.burstRemaining = enemy.burstRemaining || (isRPK ? 6 : isSVD ? 1 : 3);

        const weaponId = isRPK ? 'rpk' : isSVD ? 'svd' : 'ak47';
        const spread = isSVD ? 0.35 : isRPK ? 1.4 : 0.8;
        const muzzle = { x: enemy.position.x, y: 0.9, z: enemy.position.z };
        const target = {
          x: targetPos.x + (Math.random() - 0.5) * spread,
          y: 0.9,
          z: targetPos.z + (Math.random() - 0.5) * spread,
        };
        audioManager.playGunfire({
          muzzle,
          target,
          listener: playerPos,
          weapon: weaponId,
          isPlayer: false,
        });

        onFireBullet(muzzle, target, false, enemy.id);

        enemy.burstRemaining -= 1;
        if (enemy.burstRemaining > 0) {
          enemy.shootCooldown = 0.1;
        } else {
          enemy.shootCooldown = isRPK ? 1.4 : isSVD ? 2.2 : 1.6 + Math.random() * 0.8;
          enemy.burstRemaining = isRPK ? 6 : isSVD ? 1 : 3;
        }
      }

      // Enemy Movement Tactics
      switch (enemy.state) {
        case 'flank_left': {
          const target = enemy.targetPosition || { x: -28, y: 0, z: playerPos.z };
          const fdx = target.x - enemy.position.x;
          const fdz = target.z - enemy.position.z;
          const fDist = Math.hypot(fdx, fdz);
          if (fDist > 1.2) {
            enemy.position.x += (fdx / fDist) * 5.2 * dt;
            enemy.position.z += (fdz / fDist) * 5.2 * dt;
            audioManager.updateFootsteps(
              enemy.id,
              { x: enemy.position.x, y: 0, z: enemy.position.z },
              5.2,
              { surface: 'dirt', dt }
            );
          } else {
            enemy.state = 'advance';
          }
          break;
        }
        case 'flank_right': {
          const target = enemy.targetPosition || { x: 28, y: 0, z: playerPos.z };
          const fdx = target.x - enemy.position.x;
          const fdz = target.z - enemy.position.z;
          const fDist = Math.hypot(fdx, fdz);
          if (fDist > 1.2) {
            enemy.position.x += (fdx / fDist) * 5.2 * dt;
            enemy.position.z += (fdz / fDist) * 5.2 * dt;
            audioManager.updateFootsteps(
              enemy.id,
              { x: enemy.position.x, y: 0, z: enemy.position.z },
              5.2,
              { surface: 'dirt', dt }
            );
          } else {
            enemy.state = 'advance';
          }
          break;
        }
        case 'commander':
        case 'overwatch': {
          if (distToPlayer < 12) {
            enemy.position.x -= (dx / dist) * 3.5 * dt;
            enemy.position.z -= (dz / dist) * 3.5 * dt;
            audioManager.updateFootsteps(
              enemy.id,
              { x: enemy.position.x, y: 0, z: enemy.position.z },
              3.5,
              { surface: 'dirt', dt }
            );
          }
          break;
        }
        default: {
          if (distToPlayer > 14) {
            enemy.position.x += (dx / dist) * 3.8 * dt;
            enemy.position.z += (dz / dist) * 3.8 * dt;
            audioManager.updateFootsteps(
              enemy.id,
              { x: enemy.position.x, y: 0, z: enemy.position.z },
              3.8,
              { surface: 'dirt', dt }
            );
          }
          break;
        }
      }
    }

    // 2. BLUEFOR FRIENDLY SQUAD: SQUAD-LEAD COHESION (NEVER GO OFF ON THEIR OWN!)
    for (const friendly of aliveFriendlies) {
      // Find nearest hostile threat
      let nearestEnemy: EnemyCombatant | null = null;
      let minEnemyDist = Infinity;
      for (const enemy of aliveEnemies) {
        const d = Math.hypot(enemy.position.x - friendly.position.x, enemy.position.z - friendly.position.z);
        if (d < minEnemyDist) {
          minEnemyDist = d;
          nearestEnemy = enemy;
        }
      }

      // Tactical Positioning: strictly tethered to Player's formation!
      // Base position is always anchored around player position
      let targetX = playerPos.x + friendly.formationOffset.x;
      let targetZ = playerPos.z + friendly.formationOffset.z;

      if (friendly.role.includes('SAW') && nearestEnemy && minEnemyDist < 30) {
        // Gunner Ruiz: Moves 3m to the player's right flank to create a crossfire angle
        const localCover = this.queryBestLocalCover(friendly.position, nearestEnemy.position, 6.0);
        if (localCover) {
          targetX = THREE_LERP(targetX, localCover.position.x, 0.4);
          targetZ = THREE_LERP(targetZ, localCover.position.z, 0.4);
        } else {
          targetX = playerPos.x + 3.8;
          targetZ = playerPos.z + 1.2;
        }
      } else if (friendly.role.includes('Marksman') && nearestEnemy) {
        // Marksman Ortiz: Stays 4m directly in overwatch behind the player
        targetX = playerPos.x - 3.5;
        targetZ = playerPos.z + 3.5;
      } else if (friendly.role.includes('Corpsman')) {
        // Doc Miller: Watches player's left flank within 2.5m
        targetX = playerPos.x - 2.5;
        targetZ = playerPos.z + 1.5;
      } else {
        // Dustoff-Lead: Guards right flank
        targetX = playerPos.x + 3.5;
        targetZ = playerPos.z + 3.0;
      }

      // Move towards formation target
      const fdx = targetX - friendly.position.x;
      const fdz = targetZ - friendly.position.z;
      const distToGoal = Math.hypot(fdx, fdz);

      // Fast catch-up speed so they never get separated from the player
      const moveSpeed = distToGoal > 4.0 ? 11.0 : 8.5;
      if (distToGoal > 0.4) {
        friendly.position.x += (fdx / distToGoal) * moveSpeed * dt;
        friendly.position.z += (fdz / distToGoal) * moveSpeed * dt;
        audioManager.updateFootsteps(
          friendly.id,
          { x: friendly.position.x, y: 0, z: friendly.position.z },
          moveSpeed,
          { surface: 'concrete', dt }
        );
      }

      // Aim and engage hostiles
      if (nearestEnemy) {
        friendly.targetEnemyId = nearestEnemy.id;

        const edx = nearestEnemy.position.x - friendly.position.x;
        const edz = nearestEnemy.position.z - friendly.position.z;
        friendly.rotationY = Math.atan2(edx, edz);

        friendly.shootCooldown -= dt;
        if (friendly.shootCooldown <= 0 && minEnemyDist < 42) {
          const isSAW = friendly.role.includes('SAW');
          friendly.shootCooldown = isSAW ? 1.0 : 1.4 + Math.random() * 0.6;

          const spreadX = (Math.random() - 0.5) * 0.9;
          const spreadZ = (Math.random() - 0.5) * 0.9;
          const muzzle = { x: friendly.position.x, y: 0.9, z: friendly.position.z };
          const target = {
            x: nearestEnemy.position.x + spreadX,
            y: 0.9,
            z: nearestEnemy.position.z + spreadZ,
          };

          audioManager.playGunfire({
            muzzle,
            target,
            listener: playerPos,
            weapon: isSAW ? 'm249' : 'm4a1',
            isPlayer: false,
          });

          onFireBullet(
            muzzle,
            target,
            true,
            friendly.id
          );

          // Coordinated tactical squad barks to give player the advantage
          if (Math.random() < 0.15) {
            const barks = isSAW
              ? [
                  `Ruiz laying down suppression! Push up, boss!`,
                  `SAW pinning down hostile squad! Move on their flank!`,
                  `Heavy fire on target! Keep your head down!`,
                ]
              : friendly.role.includes('Marksman')
              ? [
                  `Shadow-3 has overwatch. Sniping high-value targets.`,
                  `Target in crosshairs. Engaging hostile leader!`,
                  `Covering your advance, Viper!`,
                ]
              : [
                  `Doc Miller covering your left, boss! Stay alert!`,
                  `Hostiles bearing 340! Watch your spacing!`,
                  `Target suppressed! Check your six!`,
                ];

            const bark = barks[Math.floor(Math.random() * barks.length)];
            this.broadcastBark(friendly.id, friendly.callsign, bark, true);
          }
        }
      } else {
        // If no enemy nearby, aim in the direction the player is looking
        friendly.rotationY = Math.atan2(playerPos.x - friendly.position.x, playerPos.z - friendly.position.z);
      }
    }
  }
}

function THREE_LERP(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export const aiDirector = new GuerrillaAiDirector();
