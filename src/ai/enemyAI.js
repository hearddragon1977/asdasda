/**
 * Decentralized enemy AI.
 * Each combatant elects suppress / flank / advance roles from local peer cues —
 * no global commander node issues orders.
 */

const ENGAGE_RANGE = 42;
const PREFERRED_RANGE = { close: 10, mid: 16, far: 28 };
const MOVE = { flank: 5.4, advance: 3.9, retreat: 3.6 };

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
 * }} Enemy
 */

/**
 * Soft peer coordination: who currently owns suppress / flank slots.
 * Claimed locally by the best-fit living combatant each tick.
 * @param {Enemy[]} alive
 * @param {Vec3} focus
 */
function electPeerRoles(alive, focus) {
  let suppressor = null;
  let bestSuppress = -Infinity;
  let flanker = null;
  let bestFlank = -Infinity;

  for (const e of alive) {
    const dist = Math.hypot(e.position.x - focus.x, e.position.z - focus.z);
    const isGunner = e.role.includes('RPK') || e.role.includes('Support');
    const isFlanker = e.role.includes('Flanker') || e.role.includes('Raider') || e.role.includes('Breacher');
    const isMarksman = e.role.includes('SVD') || e.role.includes('Marksman');

    // Prefer heavy weapons and mid-range for suppression
    let suppressScore = (isGunner ? 40 : isMarksman ? 10 : 15) + (28 - Math.abs(dist - 18));
    if (e.state === 'suppress' || e.state === 'overwatch') suppressScore += 8;

    // Prefer flankers and lateral offset for flanking
    const lateral = Math.abs(e.position.x - focus.x);
    let flankScore = (isFlanker ? 45 : 12) + lateral * 0.8 - dist * 0.15;
    if (e.state === 'flank_left' || e.state === 'flank_right') flankScore += 10;

    if (suppressScore > bestSuppress) {
      bestSuppress = suppressScore;
      suppressor = e;
    }
    if (flankScore > bestFlank) {
      bestFlank = flankScore;
      flanker = e;
    }
  }

  // Avoid double-booking the same unit when multiple peers exist
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
 * Pick engagement focus: player, or a nearby friendly if player is far.
 * @param {Enemy} enemy
 * @param {Vec3} playerPos
 * @param {{ position: Vec3 }[]} aliveFriendlies
 */
function pickFocus(enemy, playerPos, aliveFriendlies) {
  const distPlayer = Math.hypot(playerPos.x - enemy.position.x, playerPos.z - enemy.position.z);
  if (distPlayer <= 18) return { pos: playerPos, dist: distPlayer };

  let best = { pos: playerPos, dist: distPlayer };
  for (const f of aliveFriendlies) {
    const d = Math.hypot(f.position.x - enemy.position.x, f.position.z - enemy.position.z);
    if (d < 10 && d < best.dist) best = { pos: f.position, dist: d };
  }
  return best;
}

/**
 * Decide autonomous state from peer elections + own role/geometry.
 * @param {Enemy} enemy
 * @param {{ suppressorId: string|null, flankerId: string|null }} peers
 * @param {Vec3} focus
 * @param {number} dist
 */
function decideState(enemy, peers, focus, dist) {
  const isMarksman = enemy.role.includes('SVD') || enemy.role.includes('Marksman');

  if (enemy.id === peers.suppressorId) {
    return isMarksman ? 'overwatch' : 'suppress';
  }

  if (enemy.id === peers.flankerId) {
    return focus.x >= enemy.position.x ? 'flank_right' : 'flank_left';
  }

  if (isMarksman) return 'overwatch';
  if (dist > PREFERRED_RANGE.mid) return 'advance';
  if (dist < PREFERRED_RANGE.close) return 'take_cover';
  return 'suppress';
}

/**
 * Lateral flank anchor opposite the peer suppressor when possible.
 * @param {Enemy} enemy
 * @param {Vec3} focus
 * @param {'flank_left'|'flank_right'} side
 * @param {Enemy[]} alive
 */
function flankAnchor(enemy, focus, side, alive) {
  const sign = side === 'flank_left' ? -1 : 1;
  const baseX = focus.x + sign * (18 + Math.random() * 6);
  const baseZ = focus.z + (Math.random() - 0.5) * 8 - 2;

  // Soft deconflict: nudge away from other living peers
  let x = baseX;
  let z = baseZ;
  for (const peer of alive) {
    if (peer.id === enemy.id) continue;
    const dx = x - peer.position.x;
    const dz = z - peer.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 4 && d > 0.01) {
      x += (dx / d) * 2.5;
      z += (dz / d) * 2.5;
    }
  }

  return { x, y: 0, z: baseZ };
}

/**
 * Move according to autonomous state.
 * @param {Enemy} enemy
 * @param {Vec3} focus
 * @param {number} dist
 * @param {number} dt
 * @param {Enemy[]} alive
 */
function applyMovement(enemy, focus, dist, dt, alive) {
  const dx = focus.x - enemy.position.x;
  const dz = focus.z - enemy.position.z;

  switch (enemy.state) {
    case 'flank_left':
    case 'flank_right': {
      if (!enemy.targetPosition || Math.hypot(
        enemy.targetPosition.x - enemy.position.x,
        enemy.targetPosition.z - enemy.position.z
      ) < 1.2) {
        enemy.targetPosition = flankAnchor(enemy, focus, enemy.state, alive);
      }
      const fdx = enemy.targetPosition.x - enemy.position.x;
      const fdz = enemy.targetPosition.z - enemy.position.z;
      const fDist = Math.hypot(fdx, fdz);
      if (fDist > 1.2) {
        enemy.position.x += (fdx / fDist) * MOVE.flank * dt;
        enemy.position.z += (fdz / fDist) * MOVE.flank * dt;
      } else {
        enemy.state = 'advance';
      }
      break;
    }
    case 'overwatch':
    case 'take_cover': {
      if (dist < PREFERRED_RANGE.close && dist > 0.01) {
        enemy.position.x -= (dx / dist) * MOVE.retreat * dt;
        enemy.position.z -= (dz / dist) * MOVE.retreat * dt;
      }
      break;
    }
    case 'suppress': {
      // Hold mid-range firing lane
      if (dist > PREFERRED_RANGE.far && dist > 0.01) {
        enemy.position.x += (dx / dist) * MOVE.advance * 0.7 * dt;
        enemy.position.z += (dz / dist) * MOVE.advance * 0.7 * dt;
      } else if (dist < PREFERRED_RANGE.mid && dist > 0.01) {
        enemy.position.x -= (dx / dist) * MOVE.retreat * 0.5 * dt;
        enemy.position.z -= (dz / dist) * MOVE.retreat * 0.5 * dt;
      }
      break;
    }
    default: {
      if (dist > PREFERRED_RANGE.mid && dist > 0.01) {
        enemy.position.x += (dx / dist) * MOVE.advance * dt;
        enemy.position.z += (dz / dist) * MOVE.advance * dt;
      }
      break;
    }
  }
}

/**
 * Role-aware burst fire.
 * @param {Enemy} enemy
 * @param {Vec3} targetPos
 * @param {number} dist
 * @param {number} dt
 * @param {(from: Vec3, to: Vec3, isBluefor: boolean, shooterId: string) => void} onFireBullet
 * @param {{ playEnemyAKFire: () => void }} audio
 */
function applyFire(enemy, targetPos, dist, dt, onFireBullet, audio) {
  enemy.shootCooldown = (enemy.shootCooldown ?? 1.0) - dt;
  if (enemy.shootCooldown > 0 || dist >= ENGAGE_RANGE) return;

  const isRPK = enemy.role.includes('RPK');
  const isSVD = enemy.role.includes('SVD');
  enemy.burstRemaining = enemy.burstRemaining || (isRPK ? 6 : isSVD ? 1 : 3);

  audio.playEnemyAKFire();

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
    enemy.burstRemaining = isRPK ? 6 : isSVD ? 1 : 3;
  }
}

/**
 * Occasional peer-local combat bark (not commander directives).
 * @param {Enemy} enemy
 * @param {(speaker: string, callsign: string, text: string, isBluefor: boolean) => void} [broadcastBark]
 */
function maybeBark(enemy, broadcastBark) {
  if (!broadcastBark || Math.random() > 0.04) return;

  const lines =
    enemy.state === 'suppress' || enemy.state === 'overwatch'
      ? ['Laying fire! Pin them!', 'Suppressing contact!', 'Keep their heads down!']
      : enemy.state === 'flank_left' || enemy.state === 'flank_right'
        ? ['Moving on the flank!', 'Wrapping their side!', 'Pushing lateral!']
        : ['Advancing!', 'Closing distance!', 'Push up!'];

  broadcastBark(enemy.id, enemy.callsign || enemy.name, lines[Math.floor(Math.random() * lines.length)], false);
}

/**
 * Tick decentralized enemy squad AI.
 *
 * @param {{
 *   dt: number,
 *   enemies: Enemy[],
 *   friendlies: { position: Vec3, status?: string }[],
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
 * }} ctx
 */
export function updateEnemySquad(ctx) {
  const { dt, enemies, friendlies, playerPos, blackboard, onFireBullet, audio, broadcastBark } = ctx;

  const alive = enemies.filter((e) => e.health > 0);
  if (alive.length === 0) return;

  const aliveFriendlies = friendlies.filter((f) => f.status !== 'KIA');
  const peers = electPeerRoles(alive, playerPos);

  if (blackboard) {
    blackboard.activeSuppressorId = peers.suppressorId;
    blackboard.activeFlankerId = peers.flankerId;
    blackboard.playerLastKnownPosition = { ...playerPos };
    blackboard.playerVisible = true;
    blackboard.timeSincePlayerSpotted = 0;
  }

  for (const enemy of alive) {
    const { pos: focus, dist } = pickFocus(enemy, playerPos, aliveFriendlies);
    const dx = focus.x - enemy.position.x;
    const dz = focus.z - enemy.position.z;

    enemy.rotationY = Math.atan2(dx, dz);
    enemy.state = decideState(enemy, peers, focus, dist);

    applyFire(enemy, focus, dist, dt, onFireBullet, audio);
    applyMovement(enemy, focus, dist, dt, alive);
    maybeBark(enemy, broadcastBark);
  }
}
