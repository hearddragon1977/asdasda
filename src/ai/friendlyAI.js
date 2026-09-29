/**
 * Independent friendly operator AI.
 * The fireteam searches, closes, and starts the fight. They do not wait
 * on a sector or on the player. One gun keeps a lane while the rest bound in.
 */

import { clampToMap } from '../game/mapBounds';

const ENGAGE_RANGE = 52;
const MOVE = { bound: 8.4, cover: 7.4, suppress: 6.6 };

/** Enemy pads and the ground between them. The team sweeps these when contact drops. */
const HUNT_ROUTE = [
  { x: 0, z: 2 },
  { x: -18, z: -10 },
  { x: 18, z: -10 },
  { x: 0, z: -30 },
  { x: -28, z: -22 },
  { x: 28, z: -22 },
];

let huntCursor = 0;
let clearingContact = false;
/** @type {{ x: number, z: number }} */
let lastContact = { x: 0, z: -18 };

/** Point the search route at walkable spots on the loaded city. */
export function setHuntRoute(points) {
  if (!points?.length) return;
  HUNT_ROUTE.splice(0, HUNT_ROUTE.length, ...points.map((point) => ({ x: point.x, z: point.z })));
  huntCursor = 0;
}

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
 * @param {{ x: number, z: number }} a
 * @param {{ x: number, z: number }} b
 */
function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * @param {Friendly} friendly
 * @param {Enemy[]} aliveEnemies
 */
function nearestThreat(friendly, aliveEnemies) {
  let nearest = null;
  let minDist = Infinity;
  for (const enemy of aliveEnemies) {
    const d = dist2(enemy.position, friendly.position);
    if (d < minDist) {
      minDist = d;
      nearest = enemy;
    }
  }
  return { enemy: nearest, dist: minDist };
}

/**
 * Shared kill: lowest health, then the commander, then whoever is nearest the team.
 * A hostile inside 9m always wins for that operator.
 * @param {Enemy[]} aliveEnemies
 * @param {Friendly[]} aliveFriendlies
 */
function electSquadTarget(aliveEnemies, aliveFriendlies) {
  if (aliveEnemies.length === 0) return null;
  let cx = 0;
  let cz = 0;
  for (const f of aliveFriendlies) {
    cx += f.position.x;
    cz += f.position.z;
  }
  cx /= Math.max(1, aliveFriendlies.length);
  cz /= Math.max(1, aliveFriendlies.length);

  let best = null;
  let bestScore = -Infinity;
  for (const enemy of aliveEnemies) {
    const d = Math.hypot(enemy.position.x - cx, enemy.position.z - cz);
    let score = 120 - d + (100 - enemy.health) * 0.85;
    if (enemy.isCommander) score += 18;
    if (enemy.role.includes('RPK') || enemy.role.includes('SVD')) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

/**
 * @param {Enemy[]} aliveEnemies
 * @param {Friendly} friendly
 * @param {Enemy|null} squadTarget
 */
function pickPriorityTarget(aliveEnemies, friendly, squadTarget) {
  const close = nearestThreat(friendly, aliveEnemies);
  if (close.enemy && close.dist <= 9) return close;

  const isMarksman = friendly.role.includes('Marksman');
  if (isMarksman) {
    const hvt =
      aliveEnemies.find((e) => e.isCommander) ||
      aliveEnemies.find((e) => e.role.includes('SVD') || e.role.includes('RPK'));
    if (hvt) return { enemy: hvt, dist: dist2(hvt.position, friendly.position) };
  }

  if (squadTarget) return { enemy: squadTarget, dist: dist2(squadTarget.position, friendly.position) };
  return close;
}

/**
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
    const distToSelf = dist2(node.position, entityPos);
    if (distToSelf > maxDist) continue;

    const distToThreat = dist2(node.position, threatPos);
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
 * Cover that is actually closer to the threat than the operator is.
 * @param {CoverNode[]} coverNodes
 * @param {Vec3} entityPos
 * @param {Vec3} threatPos
 * @param {string} selfId
 */
function queryForwardCover(coverNodes, entityPos, threatPos, selfId) {
  const selfDist = dist2(entityPos, threatPos);
  let bestNode = null;
  let bestScore = 2;

  for (const node of coverNodes) {
    if (node.occupantId && node.occupantId !== selfId) continue;
    const travel = dist2(node.position, entityPos);
    if (travel > 18 || travel < 1.2) continue;
    const gain = selfDist - dist2(node.position, threatPos);
    if (gain < 2.5) continue;
    const score = gain * 3 - travel * 0.35 + (node.isHighGround ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }
  return bestNode;
}

/**
 * @param {Friendly} friendly
 */
function roleNudge(friendly) {
  if (friendly.role.includes('SAW')) return { x: 5, z: 1 };
  if (friendly.role.includes('Marksman')) return { x: -4, z: 6 };
  if (friendly.role.includes('Breacher')) return { x: 4, z: -5 };
  return { x: -5, z: 2 };
}

/**
 * @param {Friendly} friendly
 * @param {{ enemy: Enemy|null, dist: number }} threat
 * @param {Friendly[]} aliveFriendlies
 */
function decideObjective(friendly, threat, aliveFriendlies) {
  const role = friendly.role;
  const woundedPeer = aliveFriendlies.find((f) => f.id !== friendly.id && f.status === 'WIA');

  if (role.includes('Corpsman') && woundedPeer && threat.dist > 11) {
    return { state: 'bounding', anchor: woundedPeer.position, reason: 'aid' };
  }

  if (!threat.enemy) {
    return { state: 'bounding', anchor: null, reason: 'hunt' };
  }

  if (role.includes('SAW')) return { state: 'suppress', anchor: null, reason: 'suppress' };
  if (role.includes('Marksman')) return { state: 'bounding', anchor: null, reason: 'overwatch' };
  if (role.includes('Breacher') || role.includes('Flank')) return { state: 'bounding', anchor: null, reason: 'flank' };
  return { state: 'bounding', anchor: null, reason: 'pressure' };
}

/**
 * @param {Vec3} from
 * @param {Vec3} threat
 * @param {number} standoff
 * @param {number} lateral
 */
function assaultPoint(from, threat, standoff, lateral) {
  const dx = threat.x - from.x;
  const dz = threat.z - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const px = -dz / dist;
  const pz = dx / dist;
  return {
    x: threat.x - (dx / dist) * standoff + px * lateral,
    z: threat.z - (dz / dist) * standoff + pz * lateral,
  };
}

/**
 * @param {Friendly} friendly
 * @param {{ state: string, anchor: Vec3|null, reason: string }} objective
 * @param {Enemy|null} threat
 * @param {CoverNode[]} coverNodes
 * @param {boolean} blocked
 */
function resolveGoal(friendly, objective, threat, coverNodes, blocked) {
  if (objective.reason === 'aid' && objective.anchor) {
    return { x: objective.anchor.x, z: objective.anchor.z };
  }

  if (objective.reason === 'hunt' || !threat) {
    const nudge = roleNudge(friendly);
    const wp = clearingContact ? lastContact : HUNT_ROUTE[huntCursor % HUNT_ROUTE.length];
    return { x: wp.x + nudge.x, z: wp.z + nudge.z };
  }

  const side = friendly.position.x >= threat.position.x ? 1 : -1;
  let standoff = 8;
  let lateral = side * 4;

  if (objective.reason === 'suppress') {
    standoff = 13;
    lateral = side * (blocked ? 8 : 3);
  } else if (objective.reason === 'overwatch') {
    standoff = threat && dist2(friendly.position, threat.position) < 8 ? 12 : 18;
    lateral = -side * (blocked ? 12 : 6);
  } else if (objective.reason === 'flank') {
    standoff = 5.5;
    lateral = side * (blocked ? 14 : 10);
  } else {
    standoff = 7.5;
    lateral = side * (blocked ? 9 : 4);
  }

  const point = assaultPoint(friendly.position, threat.position, standoff, lateral);
  const selfDist = dist2(friendly.position, threat.position);

  if (objective.reason !== 'flank' && selfDist > standoff + 6) {
    const cover = queryForwardCover(coverNodes, friendly.position, threat.position, friendly.id);
    if (cover) return { x: cover.position.x, z: cover.position.z };
  }

  return point;
}

/**
 * @param {CoverNode[]} coverNodes
 * @param {Friendly} friendly
 * @param {{ x: number, z: number }} goal
 */
function updateCoverClaim(coverNodes, friendly, goal) {
  for (const node of coverNodes) {
    if (node.occupantId === friendly.id) node.occupantId = null;
  }
  const near = coverNodes.find(
    (n) => dist2(n.position, goal) < 2.5 && (!n.occupantId || n.occupantId === friendly.id)
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

  const speed = state === 'bounding' ? MOVE.bound : state === 'suppress' ? MOVE.suppress : MOVE.cover;
  friendly.position.x += (fdx / distToGoal) * speed * dt;
  friendly.position.z += (fdz / distToGoal) * speed * dt;
  clampToMap(friendly.position);
}

/**
 * @param {Friendly[]} alive
 */
function separateTeam(alive) {
  const minDist = 3.1;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i].position;
      const b = alive[j].position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= minDist || d < 0.05) continue;
      const push = (minDist - d) * 0.4;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
}

/**
 * @param {Friendly} friendly
 * @param {Enemy} enemy
 * @param {number} dist
 * @param {number} dt
 * @param {(from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void} onFireBullet
 * @param {{ playM4Fire: () => void }} audio
 * @param {(speaker: string, callsign: string, text: string, isBluefor: boolean) => void} [broadcastBark]
 * @param {((from: {x:number, z:number}, to: {x:number, z:number}) => boolean)|undefined} hasLineOfSight
 */
function engageTarget(friendly, enemy, dist, dt, onFireBullet, audio, broadcastBark, hasLineOfSight) {
  friendly.targetEnemyId = enemy.id;
  friendly.shootCooldown -= dt;

  if (
    hasLineOfSight &&
    !hasLineOfSight(
      { x: friendly.position.x, z: friendly.position.z },
      { x: enemy.position.x, z: enemy.position.z }
    )
  ) {
    if (friendly.shootCooldown < 0.15) friendly.shootCooldown = 0.15;
    const edx = enemy.position.x - friendly.position.x;
    const edz = enemy.position.z - friendly.position.z;
    friendly.rotationY = Math.atan2(edx, edz);
    return;
  }

  const edx = enemy.position.x - friendly.position.x;
  const edz = enemy.position.z - friendly.position.z;
  friendly.rotationY = Math.atan2(edx, edz);

  if (friendly.shootCooldown > 0 || dist >= ENGAGE_RANGE) return;

  const isSAW = friendly.role.includes('SAW');
  const isMarksman = friendly.role.includes('Marksman');
  friendly.shootCooldown = isSAW ? 0.48 : isMarksman ? 0.95 : 0.62 + Math.random() * 0.2;
  audio.playM4Fire();

  const spread = isMarksman ? 0.28 : isSAW ? 0.72 : 0.48;
  const spreadX = (Math.random() - 0.5) * spread;
  const spreadZ = (Math.random() - 0.5) * spread;

  onFireBullet(
    { x: friendly.position.x, y: (friendly.position.y || 0) + 1.15, z: friendly.position.z },
    { x: enemy.position.x + spreadX, y: (enemy.position.y || 0) + 1.15, z: enemy.position.z + spreadZ },
    true,
    friendly.id
  );

  if (broadcastBark && Math.random() < 0.1) {
    const barks = isSAW
      ? [
          'Gunner moving the base of fire up!',
          'Suppressing and closing the lane!',
          'They are pinned — push now!',
        ]
      : isMarksman
        ? [
            'Shifting overwatch, taking the shot!',
            'HVT in the open — engaging!',
            'New angle, sending it!',
          ]
        : friendly.role.includes('Breacher')
          ? [
              'Breacher is in on the flank!',
              'Closing the gap, stay on them!',
              'Point is assaulting — with me!',
            ]
          : [
              'Contact — we are pushing!',
              'Moving on the hostile, do not stall!',
              'Wingman bounding up!',
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
 *   hasLineOfSight?: (from: {x:number, z:number}, to: {x:number, z:number}) => boolean,
 * }} ctx
 */
export function updateFriendlySquad(ctx) {
  const { dt, friendlies, enemies, coverNodes, playerPos, onFireBullet, audio, broadcastBark, hasLineOfSight } = ctx;

  const aliveFriendlies = friendlies.filter((f) => f.status !== 'KIA');
  const aliveEnemies = enemies.filter((e) => e.health > 0);
  const squadTarget = electSquadTarget(aliveEnemies, aliveFriendlies);

  if (squadTarget) {
    clearingContact = true;
    lastContact = { x: squadTarget.position.x, z: squadTarget.position.z };
  } else if (aliveFriendlies.length > 0) {
    const lead = aliveFriendlies[0];
    const wp = clearingContact ? lastContact : HUNT_ROUTE[huntCursor % HUNT_ROUTE.length];
    if (dist2(lead.position, wp) < 6) {
      if (clearingContact) clearingContact = false;
      else huntCursor = (huntCursor + 1) % HUNT_ROUTE.length;
    }
  }

  for (const friendly of aliveFriendlies) {
    const threat = pickPriorityTarget(aliveEnemies, friendly, squadTarget);
    const blocked =
      !!threat.enemy &&
      !!hasLineOfSight &&
      !hasLineOfSight(
        { x: friendly.position.x, z: friendly.position.z },
        { x: threat.enemy.position.x, z: threat.enemy.position.z }
      );

    const objective = decideObjective(friendly, threat, aliveFriendlies);
    friendly.state = /** @type {Friendly['state']} */ (objective.state);

    const goal = resolveGoal(friendly, objective, threat.enemy, coverNodes, blocked);
    updateCoverClaim(coverNodes, friendly, goal);
    moveToward(friendly, goal, dt, friendly.state);

    const px = playerPos?.x ?? 0;
    const pz = playerPos?.z ?? 0;
    const awayX = friendly.position.x - px;
    const awayZ = friendly.position.z - pz;
    const away = Math.hypot(awayX, awayZ);
    if (away < 4.2 && away > 0.05) {
      friendly.position.x += (awayX / away) * (4.2 - away) * 0.28;
      friendly.position.z += (awayZ / away) * (4.2 - away) * 0.28;
    }

    if (threat.enemy) {
      engageTarget(friendly, threat.enemy, threat.dist, dt, onFireBullet, audio, broadcastBark, hasLineOfSight);
    } else {
      friendly.targetEnemyId = null;
      const face = clearingContact ? lastContact : HUNT_ROUTE[huntCursor % HUNT_ROUTE.length];
      friendly.rotationY = Math.atan2(face.x - friendly.position.x, face.z - friendly.position.z);
    }
  }

  separateTeam(aliveFriendlies);
}
