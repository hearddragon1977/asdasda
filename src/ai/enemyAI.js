/**
 * Decentralized enemy AI.
 * The cell hunts as a pack: one gunner walks fire forward, everyone else
 * hooks a flank and rushes. Wounded friendlies are finished. Nobody falls back.
 */

const ENGAGE_RANGE = 52;
const HOLD = { rush: 5.2, gunner: 11, marksman: 16 };
const MOVE = { flank: 8.1, advance: 7.2, rush: 8.8, creep: 4.6, strafe: 2.8 };

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{
 *   id: string,
 *   role: string,
 *   position: Vec3,
 *   rotationY: number,
 *   health: number,
 *   state: string,
 *   targetPosition: Vec3,
 *   shootCooldown?: number,
 *   burstRemaining?: number,
 *   isCommander?: boolean,
 *   seekingAngle?: boolean,
 *   strafePhase?: number,
 * }} Enemy
 * @typedef {{ pos: Vec3, bonus: number, dist?: number, score?: number }} Prey
 */

/**
 * @param {Vec3} a
 * @param {Vec3} b
 */
function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * @param {Enemy[]} alive
 * @param {Vec3} focus
 */
function electPeerRoles(alive, focus) {
  let suppressor = null;
  let bestSuppress = -Infinity;
  let flanker = null;
  let bestFlank = -Infinity;

  for (const e of alive) {
    const dist = dist2(e.position, focus);
    const isGunner = e.role.includes('RPK') || e.role.includes('Support');
    const isFlanker = e.role.includes('Flanker') || e.role.includes('Raider') || e.role.includes('Breacher');
    const isMarksman = e.role.includes('SVD') || e.role.includes('Marksman');

    let suppressScore = (isGunner ? 50 : isMarksman ? 4 : 8) - Math.abs(dist - 14);
    if (e.state === 'suppress') suppressScore += 6;

    const lateral = Math.abs(e.position.x - focus.x);
    let flankScore = (isFlanker ? 40 : 14) + lateral * 0.6 - dist * 0.05;
    if (e.state === 'flank_left' || e.state === 'flank_right') flankScore += 8;

    if (suppressScore > bestSuppress) {
      bestSuppress = suppressScore;
      suppressor = e;
    }
    if (flankScore > bestFlank) {
      bestFlank = flankScore;
      flanker = e;
    }
  }

  if (suppressor && flanker && suppressor.id === flanker.id && alive.length > 1) {
    const alt = alive.find((e) => e.id !== suppressor.id);
    if (alt) flanker = alt;
  }

  return {
    suppressorId: suppressor?.id ?? null,
    flankerId: flanker?.id ?? null,
  };
}

/**
 * Player plus every living friendly. Wounded operators are worth more than a healthy one.
 * @param {Vec3} playerPos
 * @param {{ position: Vec3, status?: string, health?: number, id?: string }[]} aliveFriendlies
 * @returns {Prey[]}
 */
function buildPrey(playerPos, aliveFriendlies) {
  /** @type {Prey[]} */
  const prey = [{ pos: playerPos, bonus: 24 }];
  for (const f of aliveFriendlies) {
    const health = f.health ?? 100;
    const wounded = f.status === 'WIA' || health <= 40;
    prey.push({
      pos: f.position,
      bonus: (wounded ? 72 : 8) + Math.max(0, 100 - health) * 0.3,
    });
  }
  return prey;
}

/**
 * @param {Vec3} origin
 * @param {Prey} candidate
 * @returns {Prey}
 */
function scorePrey(origin, candidate) {
  const dist = dist2(origin, candidate.pos);
  return { ...candidate, dist, score: candidate.bonus + 110 - dist };
}

/**
 * Pack picks one victim from the squad center, then each fighter peels
 * if someone is already in their face.
 * @param {Enemy} enemy
 * @param {Prey|null} squadPrey
 * @param {Prey[]} candidates
 */
function pickFocus(enemy, squadPrey, candidates) {
  let local = null;
  for (const c of candidates) {
    const scored = scorePrey(enemy.position, c);
    if (scored.dist <= 8 && (!local || scored.score > local.score)) local = scored;
  }
  if (local) return local;
  if (squadPrey) return scorePrey(enemy.position, squadPrey);

  let best = scorePrey(enemy.position, candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const scored = scorePrey(enemy.position, candidates[i]);
    if (scored.score > best.score) best = scored;
  }
  return best;
}

/**
 * @param {Enemy} enemy
 * @param {{ suppressorId: string|null }} peers
 * @param {Vec3} focus
 * @param {number} dist
 * @param {number} index
 * @param {number} aliveCount
 */
function decideState(enemy, peers, focus, dist, index, aliveCount) {
  const isMarksman = enemy.role.includes('SVD') || enemy.role.includes('Marksman');
  const isGunner = eRoleGunner(enemy);
  const wounded = enemy.health > 0 && enemy.health <= 45;

  // A hurt fighter closes instead of running. Remnants don't set up a defense.
  if (wounded || aliveCount <= 2) return 'advance';

  if (enemy.seekingAngle) {
    return index % 2 === 0 ? 'flank_left' : 'flank_right';
  }

  if (enemy.id === peers.suppressorId && isGunner && dist < 34) return 'suppress';
  if (isMarksman && dist < 30 && dist > 8) return 'overwatch';

  // Pincer: even indexes wrap the side they already own, odd indexes cross.
  const onLeft = enemy.position.x <= focus.x;
  const cross = index % 2 === 1;
  const goLeft = cross ? !onLeft : onLeft;
  if (dist > HOLD.rush + 4) return goLeft ? 'flank_left' : 'flank_right';
  return 'advance';
}

/**
 * @param {Enemy} enemy
 */
function eRoleGunner(enemy) {
  return enemy.role.includes('RPK') || enemy.role.includes('Support');
}

/**
 * Point on a ring around the prey, shoved sideways so the pack doesn't stack.
 * @param {Vec3} from
 * @param {Vec3} focus
 * @param {number} standoff
 * @param {number} lateral
 */
function ringPoint(from, focus, standoff, lateral) {
  const dx = focus.x - from.x;
  const dz = focus.z - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const px = -dz / dist;
  const pz = dx / dist;
  return {
    x: focus.x - (dx / dist) * standoff + px * lateral,
    z: focus.z - (dz / dist) * standoff + pz * lateral,
  };
}

/**
 * @param {Enemy} enemy
 * @param {{ x: number, z: number }} goal
 * @param {number} speed
 * @param {number} dt
 */
function steer(enemy, goal, speed, dt) {
  const fdx = goal.x - enemy.position.x;
  const fdz = goal.z - enemy.position.z;
  const fDist = Math.hypot(fdx, fdz);
  enemy.targetPosition = { x: goal.x, y: 0, z: goal.z };
  if (fDist <= 0.4) return;
  enemy.position.x += (fdx / fDist) * speed * dt;
  enemy.position.z += (fdz / fDist) * speed * dt;
}

/**
 * @param {Enemy} enemy
 * @param {Vec3} focus
 * @param {number} dist
 * @param {number} dt
 */
function applyMovement(enemy, focus, dist, dt) {
  const rush = enemy.health <= 45 ? MOVE.rush : MOVE.advance;
  enemy.strafePhase = (enemy.strafePhase ?? enemy.position.x * 0.1) + dt * 1.3;
  const weave = Math.sin(enemy.strafePhase) * 3.5;

  switch (enemy.state) {
    case 'flank_left':
    case 'flank_right': {
      const sign = enemy.state === 'flank_left' ? -1 : 1;
      if (dist > 12) {
        steer(enemy, ringPoint(enemy.position, focus, 7, sign * 12), MOVE.flank, dt);
      } else {
        steer(enemy, ringPoint(enemy.position, focus, HOLD.rush, sign * 4 + weave), rush, dt);
      }
      break;
    }
    case 'overwatch': {
      const lateral = (enemy.seekingAngle ? 11 : 5) * (enemy.position.x <= focus.x ? -1 : 1);
      const standoff = dist < 5 ? 7 : HOLD.marksman;
      const speed = dist > HOLD.marksman ? MOVE.creep * 1.35 : MOVE.strafe;
      steer(enemy, ringPoint(enemy.position, focus, standoff, lateral + weave), speed, dt);
      break;
    }
    case 'suppress': {
      const lateral = (enemy.seekingAngle ? 8 : 2.5) + weave;
      if (dist > HOLD.gunner) {
        steer(enemy, ringPoint(enemy.position, focus, HOLD.gunner, lateral), MOVE.creep, dt);
      } else {
        steer(enemy, ringPoint(enemy.position, focus, HOLD.gunner, lateral), MOVE.strafe, dt);
      }
      break;
    }
    default: {
      const lateral = (enemy.seekingAngle ? 9 : weave);
      steer(enemy, ringPoint(enemy.position, focus, HOLD.rush, lateral), rush, dt);
      break;
    }
  }

  enemy.position.x = Math.max(-42.5, Math.min(42.5, enemy.position.x));
  enemy.position.z = Math.max(-42.5, Math.min(42.5, enemy.position.z));
}

/**
 * @param {Enemy[]} alive
 */
function separatePack(alive) {
  const minDist = 2.7;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i].position;
      const b = alive[j].position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= minDist || d < 0.05) continue;
      const push = (minDist - d) * 0.45;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
}

/**
 * @param {Enemy} enemy
 * @param {Vec3} targetPos
 * @param {number} dist
 * @param {number} dt
 * @param {(from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void} onFireBullet
 * @param {{ playEnemyAKFire: () => void }} audio
 * @param {((from: {x:number, z:number}, to: {x:number, z:number}) => boolean)|undefined} hasLineOfSight
 */
function applyFire(enemy, targetPos, dist, dt, onFireBullet, audio, hasLineOfSight) {
  enemy.shootCooldown = (enemy.shootCooldown ?? 0.35) - dt;
  if (dist >= ENGAGE_RANGE) {
    enemy.seekingAngle = false;
    return;
  }

  const blocked =
    !!hasLineOfSight &&
    !hasLineOfSight({ x: enemy.position.x, z: enemy.position.z }, { x: targetPos.x, z: targetPos.z });
  enemy.seekingAngle = blocked;
  if (blocked) {
    if (enemy.shootCooldown < 0.12) enemy.shootCooldown = 0.12;
    return;
  }
  if (enemy.shootCooldown > 0) return;

  const isRPK = enemy.role.includes('RPK');
  const isSVD = enemy.role.includes('SVD');
  if (!enemy.burstRemaining) enemy.burstRemaining = isRPK ? 7 : isSVD ? 2 : 4;

  audio.playEnemyAKFire();

  const spread = isSVD ? 0.24 : isRPK ? 1.05 : 0.5;
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
    enemy.shootCooldown = isRPK ? 0.08 : isSVD ? 0.16 : 0.1;
  } else {
    enemy.shootCooldown = isRPK ? 1.05 : isSVD ? 1.35 : 0.95 + Math.random() * 0.3;
    enemy.burstRemaining = isRPK ? 7 : isSVD ? 2 : 4;
  }
}

/**
 * @param {Enemy} enemy
 * @param {(speaker: string, callsign: string, text: string, isBluefor: boolean) => void} [broadcastBark]
 */
function maybeBark(enemy, broadcastBark) {
  if (!broadcastBark || Math.random() > 0.06) return;

  const lines =
    enemy.state === 'suppress'
      ? ['Walking fire — push under it!', 'Pin them, we are closing!', 'Do not let them move!']
      : enemy.state === 'flank_left' || enemy.state === 'flank_right'
        ? ['Flank is committed — cut them off!', 'On their blind side, rushing!', 'Close the pocket!']
        : enemy.health <= 45
          ? ['Still in the fight — on them!', 'Wounded and closing!', 'No break, finish it!']
          : ['Assaulting now!', 'On the target, do not stall!', 'Kill them where they stand!'];

  broadcastBark(enemy.id, enemy.callsign || enemy.name, lines[Math.floor(Math.random() * lines.length)], false);
}

/**
 * Tick decentralized enemy squad AI.
 *
 * @param {{
 *   dt: number,
 *   enemies: Enemy[],
 *   friendlies: { position: Vec3, status?: string, health?: number }[],
 *   playerPos: Vec3,
 *   blackboard?: {
 *     activeSuppressorId: string|null,
 *     activeFlankerId: string|null,
 *     playerLastKnownPosition: Vec3,
 *     playerVisible: boolean,
 *     timeSincePlayerSpotted: number,
 *   },
 *   onFireBullet: (from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void,
 *   audio: { playEnemyAKFire: () => void },
 *   broadcastBark?: (speaker: string, callsign: string, text: string, isBluefor: boolean) => void,
 *   hasLineOfSight?: (from: {x:number, z:number}, to: {x:number, z:number}) => boolean,
 * }} ctx
 */
export function updateEnemySquad(ctx) {
  const { dt, enemies, friendlies, playerPos, blackboard, onFireBullet, audio, broadcastBark, hasLineOfSight } = ctx;

  const alive = enemies.filter((e) => e.health > 0);
  if (alive.length === 0) return;

  const aliveFriendlies = friendlies.filter((f) => f.status !== 'KIA');
  const candidates = buildPrey(playerPos, aliveFriendlies);

  let cx = 0;
  let cz = 0;
  for (const e of alive) {
    cx += e.position.x;
    cz += e.position.z;
  }
  cx /= alive.length;
  cz /= alive.length;

  let squadPrey = scorePrey({ x: cx, y: 0, z: cz }, candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const scored = scorePrey({ x: cx, y: 0, z: cz }, candidates[i]);
    if (scored.score > squadPrey.score) squadPrey = scored;
  }

  const peers = electPeerRoles(alive, squadPrey.pos);

  if (blackboard) {
    blackboard.activeSuppressorId = peers.suppressorId;
    blackboard.activeFlankerId = peers.flankerId;
    blackboard.playerLastKnownPosition = { ...squadPrey.pos };
    blackboard.playerVisible = true;
    blackboard.timeSincePlayerSpotted = 0;
  }

  alive.forEach((enemy, index) => {
    const focusHit = pickFocus(enemy, squadPrey, candidates);
    const focus = focusHit.pos;
    const dist = focusHit.dist ?? dist2(enemy.position, focus);
    const dx = focus.x - enemy.position.x;
    const dz = focus.z - enemy.position.z;

    enemy.rotationY = Math.atan2(dx, dz);
    enemy.state = decideState(enemy, peers, focus, dist, index, alive.length);

    applyFire(enemy, focus, dist, dt, onFireBullet, audio, hasLineOfSight);
    applyMovement(enemy, focus, dist, dt);
    maybeBark(enemy, broadcastBark);
  });

  separatePack(alive);
}
