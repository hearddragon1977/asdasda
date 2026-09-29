import { EnemyCombatant, EnemyAction, FriendlyCombatant } from '../types/game';
import { tacticalAudio } from '../audio/tacticalAudio';
import { tacticalLayout } from '../systems/mapGenerator';
import { radioChatter, type RadioCallout } from '../systems/radioChatter';

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
  }

  private initCoverNodes(): void {
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
    this.spawnFriendlySquad({ x: 0, z: 0 });
    this.spawnWave(1);
  }

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

    const armor = equipmentManager.resolveArmorHit(friendlyId, 'torso_heart', 0.55);
    const applied = armor.stopped
      ? Math.max(2, damage * (armor.bluntTrauma ? armor.bleedMultiplier : 0.15))
      : damage;
    friendly.health -= applied;
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
    ) => void
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

    this.updateCommanderTactics(dt, playerPos);

    const aliveEnemies = this.enemies.filter((e) => e.health > 0);
    const aliveFriendlies = this.friendlies.filter((f) => f.status !== 'KIA');

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
      }

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
  }
}

function THREE_LERP(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export const aiDirector = new GuerrillaAiDirector();
