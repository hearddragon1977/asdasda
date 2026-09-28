/**
 * Independent friendly operator AI.
 * Each bluefor combatant pursues role-based tactical objectives —
 * they do not tether to or follow the player.
 */

const ENGAGE_RANGE = 42;
const MOVE = { bound: 7.2, cover: 6.4, suppress: 5.0 };

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{
 *   id: string,
 *   callsign: string,
 *   role: string,
 *   position: Vec3,
 *   rotationY: number,
 *   health: number,
 *   status: string,
 *   shootCooldown: number,
 *   targetEnemyId: string|null,
 *   formationOffset: { x: number, z: number },
 *   state: string,
 *   currentAmmo: number,
 * }} Friendly
 * @typedef {{
 *   id: string,
 *   position: Vec3,
 *   health: number,
 *   isCommander?: boolean,
 *   role: string,
 * }} Enemy
 * @typedef {{
 *   id: string,
 *   position: Vec3,
 *   occupantId: string|null,
 *   isHighGround?: boolean,
 * }} CoverNode
 */

/**
 * Nearest living hostile to an operator.
 * @param {Friendly} friendly
 * @param {Enemy[]} aliveEnemies
 */
function nearestThreat(friendly, aliveEnemies) {
  let nearest = null;
  let minDist = Infinity;
  for (const enemy of aliveEnemies) {
    const d = Math.hypot(enemy.position.x - friendly.position.x, enemy.position.z - friendly.position.z);
    if (d < minDist) {
      minDist = d;
      nearest = enemy;
    }
  }
  return { enemy: nearest, dist: minDist };
}

/**
 * Prefer HVT / commander when available for marksman roles.
 * @param {Enemy[]} aliveEnemies
 * @param {Friendly} friendly
 */
function pickPriorityTarget(aliveEnemies, friendly) {
  const isMarksman = friendly.role.includes('Marksman');
  if (isMarksman) {
    const hvt = aliveEnemies.find((e) => e.isCommander) ||
      aliveEnemies.find((e) => e.role.includes('SVD') || e.role.includes('RPK'));
    if (hvt) {
      const d = Math.hypot(hvt.position.x - friendly.position.x, hvt.position.z - friendly.position.z);
      return { enemy: hvt, dist: d };
    }
  }
  return nearestThreat(friendly, aliveEnemies);
}

/**
 * Local cover query constrained to operator proximity.
 * @param {CoverNode[]} coverNodes
 * @param {Vec3} entityPos
 * @param {Vec3} threatPos
 * @param {number} maxDist
 * @param {string} selfId
 */
export function queryBestLocalCover(coverNodes, entityPos, threatPos, maxDist = 14, selfId = '') {
  let bestNode = null;
  let bestScore = -Infinity;

  for (const node of coverNodes) {
    if (node.occupantId && node.occupantId !== selfId) continue;
    const distToSelf = Math.hypot(node.position.x - entityPos.x, node.position.z - entityPos.z);
    if (distToSelf > maxDist) continue;

    const distToThreat = Math.hypot(node.position.x - threatPos.x, node.position.z - threatPos.z);
    let score = 50 - distToSelf;
    if (distToThreat > 8 && distToThreat < 28) score += 30;
    if (node.isHighGround) score += 12;

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }
  return bestNode;
}

/**
 * Role → independent tactical objective.
 * @param {Friendly} friendly
 * @param {{ enemy: Enemy|null, dist: number }} threat
 * @param {Friendly[]} aliveFriendlies
 */
function decideObjective(friendly, threat, aliveFriendlies) {
  const role = friendly.role;
  const woundedPeer = aliveFriendlies.find((f) => f.id !== friendly.id && f.status === 'WIA');

  if (role.includes('Corpsman') && woundedPeer) {
    return { state: 'bounding', anchor: woundedPeer.position, reason: 'aid' };
  }

  if (!threat.enemy) {
    // Sector security without a contact — hold independent AO
    const sector = {
      Corpsman: { x: -12, z: 8 },
      SAW: { x: 10, z: 4 },
      Marksman: { x: -8, z: 16 },
      Breacher: { x: 14, z: 10 },
    };
    const key = role.includes('Corpsman')
      ? 'Corpsman'
      : role.includes('SAW')
        ? 'SAW'
        : role.includes('Marksman')
          ? 'Marksman'
          : 'Breacher';
    return { state: 'take_cover', anchor: sector[key], reason: 'secure' };
  }

  if (role.includes('SAW')) {
    return { state: 'suppress', anchor: null, reason: 'suppress' };
  }
  if (role.includes('Marksman')) {
    return { state: 'take_cover', anchor: null, reason: 'overwatch' };
  }
  if (role.includes('Breacher') || role.includes('Flank')) {
    return { state: 'bounding', anchor: null, reason: 'flank' };
  }
  // Corpsman / wingman: cover-to-cover pressure on contact
  return { state: 'bounding', anchor: null, reason: 'pressure' };
}

/**
 * Compute world-space move goal for the current objective.
 * @param {Friendly} friendly
 * @param {{ state: string, anchor: Vec3|null, reason: string }} objective
 * @param {Enemy|null} threat
 * @param {CoverNode[]} coverNodes
 * @param {Friendly[]} aliveFriendlies
 */
function resolveGoal(friendly, objective, threat, coverNodes, aliveFriendlies) {
  if (objective.anchor) {
    return { x: objective.anchor.x, z: objective.anchor.z };
  }

  if (!threat) {
    return { x: friendly.position.x, z: friendly.position.z };
  }

  const cover = queryBestLocalCover(
    coverNodes,
    friendly.position,
    threat.position,
    objective.reason === 'overwatch' ? 18 : 12,
    friendly.id
  );

  if (objective.reason === 'flank') {
    const sign = friendly.position.x >= threat.position.x ? 1 : -1;
    const flankX = threat.position.x + sign * 12;
    const flankZ = threat.position.z + 4;
    if (cover) {
      // Blend cover with flank vector so operators still use terrain
      return {
        x: cover.position.x * 0.35 + flankX * 0.65,
        z: cover.position.z * 0.35 + flankZ * 0.65,
      };
    }
    return { x: flankX, z: flankZ };
  }

  if (objective.reason === 'suppress' || objective.reason === 'overwatch') {
    if (cover) return { x: cover.position.x, z: cover.position.z };
    // Offset firing position lateral to the threat, independent of player
    const peerBias = aliveFriendlies.reduce((acc, f) => acc + (f.id === friendly.id ? 0 : f.position.x), 0);
    const side = peerBias >= 0 ? -1 : 1;
    return {
      x: threat.position.x + side * 10,
      z: threat.position.z + (objective.reason === 'overwatch' ? 14 : 8),
    };
  }

  if (cover) return { x: cover.position.x, z: cover.position.z };

  // Pressure: close to mid engagement without stacking on the threat
  const dx = threat.position.x - friendly.position.x;
  const dz = threat.position.z - friendly.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  const hold = 11;
  return {
    x: threat.position.x - (dx / dist) * hold,
    z: threat.position.z - (dz / dist) * hold,
  };
}

/**
 * Claim / release cover occupants for soft deconflict.
 * @param {CoverNode[]} coverNodes
 * @param {Friendly} friendly
 * @param {{ x: number, z: number }} goal
 */
function updateCoverClaim(coverNodes, friendly, goal) {
  for (const node of coverNodes) {
    if (node.occupantId === friendly.id) node.occupantId = null;
  }
  const near = coverNodes.find(
    (n) => Math.hypot(n.position.x - goal.x, n.position.z - goal.z) < 2.5 && (!n.occupantId || n.occupantId === friendly.id)
  );
  if (near) near.occupantId = friendly.id;
}

/**
 * @param {Friendly} friendly
 * @param {{ x: number, z: number }} goal
 * @param {number} dt
 * @param {string} state
 */
function moveToward(friendly, goal, dt, state) {
  const fdx = goal.x - friendly.position.x;
  const fdz = goal.z - friendly.position.z;
  const distToGoal = Math.hypot(fdx, fdz);
  if (distToGoal <= 0.45) return;

  const speed =
    state === 'bounding' ? MOVE.bound : state === 'suppress' ? MOVE.suppress : MOVE.cover;
  friendly.position.x += (fdx / distToGoal) * speed * dt;
  friendly.position.z += (fdz / distToGoal) * speed * dt;
}

/**
 * @param {Friendly} friendly
 * @param {Enemy} enemy
 * @param {number} dist
 * @param {number} dt
 * @param {(from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void} onFireBullet
 * @param {{ playM4Fire: () => void }} audio
 * @param {(speaker: string, callsign: string, text: string, isBluefor: boolean) => void} [broadcastBark]
 */
function engageTarget(friendly, enemy, dist, dt, onFireBullet, audio, broadcastBark) {
  friendly.targetEnemyId = enemy.id;
  const edx = enemy.position.x - friendly.position.x;
  const edz = enemy.position.z - friendly.position.z;
  friendly.rotationY = Math.atan2(edx, edz);

  friendly.shootCooldown -= dt;
  if (friendly.shootCooldown > 0 || dist >= ENGAGE_RANGE) return;

  const isSAW = friendly.role.includes('SAW');
  const isMarksman = friendly.role.includes('Marksman');
  friendly.shootCooldown = isSAW ? 0.95 : isMarksman ? 1.7 : 1.35 + Math.random() * 0.5;
  audio.playM4Fire();

  const spread = isMarksman ? 0.45 : isSAW ? 1.1 : 0.85;
  const spreadX = (Math.random() - 0.5) * spread;
  const spreadZ = (Math.random() - 0.5) * spread;

  onFireBullet(
    { x: friendly.position.x, y: 0.9, z: friendly.position.z },
    { x: enemy.position.x + spreadX, y: 0.9, z: enemy.position.z + spreadZ },
    true,
    friendly.id
  );

  if (broadcastBark && Math.random() < 0.12) {
    const barks = isSAW
      ? [
          'Ruiz suppressing! Working my own lane!',
          'SAW pinning hostiles — bounding on my mark!',
          'Heavy fire on contact, independent base of fire!',
        ]
      : isMarksman
        ? [
            'Shadow-3 overwatch — engaging HVT.',
            'Target acquired from overwatch nest.',
            'Covering the sector, not stacking on you.',
          ]
        : friendly.role.includes('Breacher')
          ? [
              'Dustoff pushing the flank on my objective!',
              'Breaching lateral — hostiles displacing!',
              'Independent bound on the right!',
            ]
          : [
              'Doc holding left security!',
              'Contact — treating this as my sector!',
              'Wingman pressure, not glued to point!',
            ];
    broadcastBark(friendly.id, friendly.callsign, barks[Math.floor(Math.random() * barks.length)], true);
  }
}

/**
 * Tick independent friendly squad AI.
 *
 * @param {{
 *   dt: number,
 *   friendlies: Friendly[],
 *   enemies: Enemy[],
 *   coverNodes: CoverNode[],
 *   playerPos: Vec3,
 *   onFireBullet: (from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void,
 *   audio: { playM4Fire: () => void },
 *   broadcastBark?: (speaker: string, callsign: string, text: string, isBluefor: boolean) => void,
 * }} ctx
 */
export function updateFriendlySquad(ctx) {
  const { dt, friendlies, enemies, coverNodes, playerPos, onFireBullet, audio, broadcastBark } = ctx;

  const aliveFriendlies = friendlies.filter((f) => f.status !== 'KIA');
  const aliveEnemies = enemies.filter((e) => e.health > 0);

  for (const friendly of aliveFriendlies) {
    const threat = pickPriorityTarget(aliveEnemies, friendly);
    const objective = decideObjective(friendly, threat, aliveFriendlies);
    friendly.state = /** @type {Friendly['state']} */ (objective.state);

    const goal = resolveGoal(friendly, objective, threat.enemy, coverNodes, aliveFriendlies);
    updateCoverClaim(coverNodes, friendly, goal);
    moveToward(friendly, goal, dt, friendly.state);

    if (threat.enemy) {
      engageTarget(friendly, threat.enemy, threat.dist, dt, onFireBullet, audio, broadcastBark);
    } else {
      friendly.targetEnemyId = null;
      // Face outward from own sector, not toward the player
      const outwardX = goal.x - (playerPos?.x ?? 0) * 0.05;
      const outwardZ = goal.z - 4;
      friendly.rotationY = Math.atan2(outwardX - friendly.position.x, outwardZ - friendly.position.z);
    }
  }
}
