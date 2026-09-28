/**
 * Ballistic Penetration System
 *
 * Raycasts shots against environment geometry and resolves material-aware
 * interactions for wood, concrete, metal, and soil: velocity loss, ricochet
 * probability, and reduced damage through cover.
 */

/** @typedef {'wood' | 'concrete' | 'metal' | 'soil'} BallisticMaterial */

/**
 * Per-material ballistic response.
 * resistance: velocity drained per meter of travel through the material (m/s per m)
 * minVelocityToPenetrate: below this, the round stops inside the material
 * ricochetBase: chance of ricochet at a perfect grazing impact (0–1)
 * ricochetCriticalAngleDeg: incidence angle from surface (0 = flush) above which
 *   ricochet chance falls to near zero (degrees measured from the surface plane)
 * ricochetVelocityRetain: fraction of speed kept after a successful ricochet
 * hardness: scales thickness-effective resistance and damage attenuation
 */
export const MATERIAL_PROPERTIES = Object.freeze({
  wood: Object.freeze({
    resistance: 220,
    minVelocityToPenetrate: 140,
    ricochetBase: 0.18,
    ricochetCriticalAngleDeg: 22,
    ricochetVelocityRetain: 0.72,
    hardness: 0.35,
  }),
  concrete: Object.freeze({
    resistance: 1400,
    minVelocityToPenetrate: 320,
    ricochetBase: 0.55,
    ricochetCriticalAngleDeg: 35,
    ricochetVelocityRetain: 0.55,
    hardness: 0.9,
  }),
  metal: Object.freeze({
    resistance: 2800,
    minVelocityToPenetrate: 480,
    ricochetBase: 0.78,
    ricochetCriticalAngleDeg: 42,
    ricochetVelocityRetain: 0.48,
    hardness: 1.25,
  }),
  soil: Object.freeze({
    resistance: 480,
    minVelocityToPenetrate: 180,
    ricochetBase: 0.12,
    ricochetCriticalAngleDeg: 18,
    ricochetVelocityRetain: 0.4,
    hardness: 0.5,
  }),
});

/** Minimum remaining velocity (m/s) before a round is considered spent. */
export const TERMINAL_VELOCITY = 80;

/** Default muzzle velocity for 5.56×45 NATO-class rounds (m/s). */
export const DEFAULT_MUZZLE_VELOCITY = 900;

/** Default max ray distance when tracing a shot (meters). */
export const DEFAULT_MAX_RANGE = 200;

/**
 * @param {string} material
 * @returns {typeof MATERIAL_PROPERTIES[BallisticMaterial]}
 */
export function getMaterialProperties(material) {
  const props = MATERIAL_PROPERTIES[material];
  if (!props) {
    throw new Error(`Unknown ballistic material: ${material}`);
  }
  return props;
}

/**
 * Map obstacle / mesh type tags onto ballistic materials.
 * @param {string} type
 * @returns {BallisticMaterial}
 */
export function resolveMaterialFromType(type) {
  switch (type) {
    case 'crate':
    case 'wood':
    case 'plywood':
    case 'door':
      return 'wood';
    case 'wall':
    case 'perimeter':
    case 'concrete':
    case 'jersey':
    case 'bunker':
      return 'concrete';
    case 'metal':
    case 'steel':
    case 'plate':
    case 'vehicle':
    case 'tower':
      return 'metal';
    case 'soil':
    case 'dirt':
    case 'berm':
    case 'sandbag':
    case 'earth':
      return 'soil';
    default:
      return 'concrete';
  }
}

/**
 * Dot product for 3-component vectors.
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 */
function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Normalize a 3-vector in place conceptually (returns a new object).
 * @param {{x:number,y:number,z:number}} v
 */
export function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Reflect incident direction across a surface normal.
 * Both vectors should be normalized; result is normalized.
 * @param {{x:number,y:number,z:number}} incident
 * @param {{x:number,y:number,z:number}} normal
 */
export function reflectDirection(incident, normal) {
  const d = 2 * dot3(incident, normal);
  return normalize3({
    x: incident.x - d * normal.x,
    y: incident.y - d * normal.y,
    z: incident.z - d * normal.z,
  });
}

/**
 * Angle between the shot direction and the surface plane, in degrees.
 * 0° = traveling parallel to the surface (grazing), 90° = perpendicular impact.
 * @param {{x:number,y:number,z:number}} direction normalized inbound direction
 * @param {{x:number,y:number,z:number}} normal outward surface normal
 */
export function impactAngleFromNormal(direction, normal) {
  const cosIncident = Math.abs(dot3(direction, normal));
  const clamped = Math.min(1, Math.max(0, cosIncident));
  // angle from surface = 90° − angle from normal
  return 90 - (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Slab-method ray vs axis-aligned box intersection.
 *
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} direction normalized
 * @param {{x:number,y:number,z:number}} center box center
 * @param {{x:number,y:number,z:number}} size full extents (width, height, depth)
 * @param {number} [maxDistance=Infinity]
 * @returns {null | {
 *   distance: number,
 *   exitDistance: number,
 *   point: {x:number,y:number,z:number},
 *   exitPoint: {x:number,y:number,z:number},
 *   normal: {x:number,y:number,z:number},
 *   thickness: number
 * }}
 */
export function raycastAABB(origin, direction, center, size, maxDistance = Infinity) {
  const half = { x: size.x * 0.5, y: size.y * 0.5, z: size.z * 0.5 };
  const min = { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z };
  const max = { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z };

  let tMin = 0;
  let tMax = maxDistance;
  /** @type {{x:number,y:number,z:number}} */
  let hitNormal = { x: 0, y: 1, z: 0 };

  const axes = /** @type {const} */ (['x', 'y', 'z']);
  for (const axis of axes) {
    const o = origin[axis];
    const d = direction[axis];
    const mn = min[axis];
    const mx = max[axis];

    if (Math.abs(d) < 1e-12) {
      if (o < mn || o > mx) return null;
      continue;
    }

    const invD = 1 / d;
    let t1 = (mn - o) * invD;
    let t2 = (mx - o) * invD;
    /** Normal for the near face (points outward from the box). */
    let nearSign = -1;

    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nearSign = 1;
    }

    if (t1 > tMin) {
      tMin = t1;
      hitNormal = {
        x: axis === 'x' ? nearSign : 0,
        y: axis === 'y' ? nearSign : 0,
        z: axis === 'z' ? nearSign : 0,
      };
    }
    if (t2 < tMax) {
      tMax = t2;
    }
    if (tMin > tMax) return null;
  }

  // Ray origin inside the box: treat entry at 0 with exit at tMax
  if (tMin < 0) {
    if (tMax < 0 || tMax > maxDistance) return null;
    tMin = 0;
    hitNormal = {
      x: -direction.x,
      y: -direction.y,
      z: -direction.z,
    };
    hitNormal = normalize3(hitNormal);
  }

  if (tMin > maxDistance) return null;

  const thickness = Math.max(0, tMax - tMin);
  const point = {
    x: origin.x + direction.x * tMin,
    y: origin.y + direction.y * tMin,
    z: origin.z + direction.z * tMin,
  };
  const exitPoint = {
    x: origin.x + direction.x * tMax,
    y: origin.y + direction.y * tMax,
    z: origin.z + direction.z * tMax,
  };

  return {
    distance: tMin,
    exitDistance: tMax,
    point,
    exitPoint,
    normal: hitNormal,
    thickness,
  };
}

/**
 * Raycast against a list of environment colliders and return the nearest hit.
 *
 * Each collider: { id?, material, center:{x,y,z}, size:{x,y,z} }
 *
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} direction
 * @param {Array<{id?:string, material:BallisticMaterial|string, center:{x:number,y:number,z:number}, size:{x:number,y:number,z:number}}>} colliders
 * @param {number} [maxDistance]
 * @param {Set<string>|null} [ignoreIds]
 */
export function raycastEnvironment(origin, direction, colliders, maxDistance = DEFAULT_MAX_RANGE, ignoreIds = null) {
  const dir = normalize3(direction);
  let best = null;

  for (const col of colliders) {
    if (ignoreIds && col.id && ignoreIds.has(col.id)) continue;
    const hit = raycastAABB(origin, dir, col.center, col.size, maxDistance);
    if (!hit) continue;
    if (best && hit.distance >= best.distance) continue;

    const material =
      typeof col.material === 'string' && MATERIAL_PROPERTIES[col.material]
        ? col.material
        : resolveMaterialFromType(/** @type {string} */ (col.material));

    best = {
      ...hit,
      id: col.id ?? null,
      material,
      direction: dir,
    };
  }

  return best;
}

/**
 * Velocity lost while traveling `thickness` meters through a material.
 * Grazing (shallow) angles effectively increase path length.
 *
 * @param {number} velocity inbound speed (m/s)
 * @param {BallisticMaterial|string} material
 * @param {number} thickness meters along the ray
 * @param {number} impactAngleDeg angle from surface (0 = grazing, 90 = perpendicular)
 * @returns {{ exitVelocity: number, velocityLost: number, penetrated: boolean }}
 */
export function calculateVelocityLoss(velocity, material, thickness, impactAngleDeg = 90) {
  const props = getMaterialProperties(material);
  const angleRad = (Math.min(90, Math.max(1, impactAngleDeg)) * Math.PI) / 180;
  // Path length stretches when the round is not normal to the face
  const pathLength = thickness / Math.sin(angleRad);
  const effectiveResistance = props.resistance * (0.65 + 0.35 * props.hardness);
  const velocityLost = effectiveResistance * pathLength;
  const exitVelocity = Math.max(0, velocity - velocityLost);
  const penetrated = exitVelocity >= props.minVelocityToPenetrate;

  return {
    exitVelocity: penetrated ? exitVelocity : 0,
    velocityLost: penetrated ? velocityLost : velocity,
    penetrated,
  };
}

/**
 * Probability [0, 1] that a round ricochets instead of embedding / penetrating.
 * High when the impact is grazing and the material is hard; low for soft faces
 * struck head-on at high velocity.
 *
 * @param {BallisticMaterial|string} material
 * @param {number} impactAngleDeg angle from surface (0 = grazing)
 * @param {number} velocity inbound speed (m/s)
 * @returns {number}
 */
export function calculateRicochetProbability(material, impactAngleDeg, velocity) {
  const props = getMaterialProperties(material);
  const critical = props.ricochetCriticalAngleDeg;

  if (impactAngleDeg >= critical) {
    // Steep impact — only a tiny residual chance on very hard faces
    return props.ricochetBase * 0.05 * Math.min(1, props.hardness);
  }

  const grazingFactor = 1 - impactAngleDeg / critical;
  // Faster rounds dig in more; slower rounds glance more easily
  const speedFactor = 1 - Math.min(0.55, velocity / 2000);
  const p = props.ricochetBase * (0.35 + 0.65 * grazingFactor) * (0.55 + 0.45 * speedFactor);
  return Math.min(0.95, Math.max(0, p));
}

/**
 * Damage multiplier after losing velocity through cover.
 * Uses a kinetic-energy-style curve so residual energy maps to wounding power.
 *
 * @param {number} currentVelocity
 * @param {number} [muzzleVelocity=DEFAULT_MUZZLE_VELOCITY]
 * @returns {number} damage scale in [0, 1]
 */
export function calculateDamageMultiplier(currentVelocity, muzzleVelocity = DEFAULT_MUZZLE_VELOCITY) {
  if (currentVelocity <= TERMINAL_VELOCITY) return 0;
  if (muzzleVelocity <= 0) return 0;
  const ratio = currentVelocity / muzzleVelocity;
  // Squared ratio approximates KE drop-off; clamp for stability
  return Math.min(1, Math.max(0, ratio * ratio));
}

/**
 * Damage remaining after a single cover interaction (penetration or partial).
 *
 * @param {number} baseDamage
 * @param {number} entryVelocity
 * @param {number} exitVelocity
 * @param {number} [muzzleVelocity]
 */
export function reduceDamageThroughCover(baseDamage, entryVelocity, exitVelocity, muzzleVelocity = DEFAULT_MUZZLE_VELOCITY) {
  const before = calculateDamageMultiplier(entryVelocity, muzzleVelocity);
  const after = calculateDamageMultiplier(exitVelocity, muzzleVelocity);
  // Preserve relative KE drop across the barrier while scaling absolute damage
  const factor = before > 1e-6 ? after / before : 0;
  return baseDamage * factor;
}

/**
 * Resolve one surface interaction: ricochet, penetrate, or stop.
 *
 * @param {object} opts
 * @param {BallisticMaterial|string} opts.material
 * @param {number} opts.velocity
 * @param {number} opts.thickness
 * @param {{x:number,y:number,z:number}} opts.direction
 * @param {{x:number,y:number,z:number}} opts.normal
 * @param {() => number} [opts.rng] unit random, injectable for tests
 */
export function resolveSurfaceImpact({
  material,
  velocity,
  thickness,
  direction,
  normal,
  rng = Math.random,
}) {
  const props = getMaterialProperties(material);
  const impactAngle = impactAngleFromNormal(direction, normal);
  const ricochetChance = calculateRicochetProbability(material, impactAngle, velocity);
  const didRicochet = rng() < ricochetChance;

  if (didRicochet) {
    const outbound = reflectDirection(direction, normal);
    const exitVelocity = velocity * props.ricochetVelocityRetain;
    return {
      outcome: /** @type {const} */ ('ricochet'),
      impactAngle,
      ricochetChance,
      exitVelocity,
      exitDirection: outbound,
      penetrated: false,
      damageMultiplier: calculateDamageMultiplier(exitVelocity),
    };
  }

  const loss = calculateVelocityLoss(velocity, material, thickness, impactAngle);
  if (!loss.penetrated) {
    return {
      outcome: /** @type {const} */ ('stopped'),
      impactAngle,
      ricochetChance,
      exitVelocity: 0,
      exitDirection: direction,
      penetrated: false,
      damageMultiplier: 0,
    };
  }

  return {
    outcome: /** @type {const} */ ('penetrated'),
    impactAngle,
    ricochetChance,
    exitVelocity: loss.exitVelocity,
    exitDirection: direction,
    penetrated: true,
    velocityLost: loss.velocityLost,
    damageMultiplier: calculateDamageMultiplier(loss.exitVelocity),
  };
}

/**
 * Trace a ballistic shot through environment geometry.
 *
 * Walks the ray, applying velocity loss / ricochet / stop at each hit until
 * the round is spent, ricochets off-path (single bounce then continues), or
 * clears maxRange with no further hits.
 *
 * @param {object} shot
 * @param {{x:number,y:number,z:number}} shot.origin
 * @param {{x:number,y:number,z:number}} shot.direction
 * @param {Array<{id?:string, material:string, center:{x:number,y:number,z:number}, size:{x:number,y:number,z:number}}>} shot.colliders
 * @param {number} [shot.muzzleVelocity]
 * @param {number} [shot.baseDamage]
 * @param {number} [shot.maxRange]
 * @param {number} [shot.maxPenetrations]
 * @param {() => number} [shot.rng]
 * @returns {{
 *   events: Array<object>,
 *   finalOrigin: {x:number,y:number,z:number},
 *   finalDirection: {x:number,y:number,z:number},
 *   finalVelocity: number,
 *   damageMultiplier: number,
 *   remainingDamage: number,
 *   stopped: boolean,
 *   ricochetCount: number,
 *   penetrationCount: number
 * }}
 */
export function traceShot({
  origin,
  direction,
  colliders,
  muzzleVelocity = DEFAULT_MUZZLE_VELOCITY,
  baseDamage = 45,
  maxRange = DEFAULT_MAX_RANGE,
  maxPenetrations = 4,
  rng = Math.random,
}) {
  let pos = { x: origin.x, y: origin.y, z: origin.z };
  let dir = normalize3(direction);
  let velocity = muzzleVelocity;
  let remainingRange = maxRange;
  let penetrations = 0;
  let ricochets = 0;
  /** @type {Array<object>} */
  const events = [];
  const consumed = new Set();

  while (remainingRange > 0.01 && velocity > TERMINAL_VELOCITY) {
    const hit = raycastEnvironment(pos, dir, colliders, remainingRange, consumed);
    if (!hit) break;

    if (hit.id) consumed.add(hit.id);

    const impact = resolveSurfaceImpact({
      material: hit.material,
      velocity,
      thickness: hit.thickness,
      direction: dir,
      normal: hit.normal,
      rng,
    });

    const event = {
      id: hit.id,
      material: hit.material,
      point: hit.point,
      exitPoint: hit.exitPoint,
      normal: hit.normal,
      thickness: hit.thickness,
      entryVelocity: velocity,
      ...impact,
    };
    events.push(event);

    remainingRange -= hit.distance;

    if (impact.outcome === 'ricochet') {
      ricochets += 1;
      // Nudge off the surface to avoid re-hitting the same face
      pos = {
        x: hit.point.x + impact.exitDirection.x * 0.02,
        y: hit.point.y + impact.exitDirection.y * 0.02,
        z: hit.point.z + impact.exitDirection.z * 0.02,
      };
      dir = impact.exitDirection;
      velocity = impact.exitVelocity;
      remainingRange -= 0.02;
      // Allow the same collider to be hit again on a different face after bounce
      if (hit.id) consumed.delete(hit.id);
      continue;
    }

    if (impact.outcome === 'stopped') {
      return {
        events,
        finalOrigin: hit.point,
        finalDirection: dir,
        finalVelocity: 0,
        damageMultiplier: 0,
        remainingDamage: 0,
        stopped: true,
        ricochetCount: ricochets,
        penetrationCount: penetrations,
      };
    }

    // Penetrated — continue from the exit face
    penetrations += 1;
    pos = {
      x: hit.exitPoint.x + dir.x * 0.02,
      y: hit.exitPoint.y + dir.y * 0.02,
      z: hit.exitPoint.z + dir.z * 0.02,
    };
    velocity = impact.exitVelocity;
    remainingRange -= hit.thickness + 0.02;

    if (penetrations >= maxPenetrations) {
      break;
    }
  }

  const damageMultiplier = calculateDamageMultiplier(velocity, muzzleVelocity);
  return {
    events,
    finalOrigin: pos,
    finalDirection: dir,
    finalVelocity: velocity,
    damageMultiplier,
    remainingDamage: baseDamage * damageMultiplier,
    stopped: velocity <= TERMINAL_VELOCITY,
    ricochetCount: ricochets,
    penetrationCount: penetrations,
  };
}

/**
 * Convert world obstacles (crate/wall/perimeter style) into ballistic colliders.
 *
 * @param {Array<{id?:string, type?:string, material?:string, pos:{x:number,y?:number,z:number}, size:{x:number,y?:number,z:number}}>} obstacles
 */
export function obstaclesToColliders(obstacles) {
  return obstacles.map((obs) => ({
    id: obs.id,
    material: obs.material
      ? obs.material
      : resolveMaterialFromType(obs.type || 'concrete'),
    center: {
      x: obs.pos.x,
      y: obs.pos.y ?? (obs.size.y ? obs.size.y * 0.5 : 1),
      z: obs.pos.z,
    },
    size: {
      x: obs.size.x,
      y: obs.size.y ?? 2,
      z: obs.size.z,
    },
  }));
}

/**
 * Step a projectile segment against cover and return the post-step ballistic state.
 * Intended for per-frame integration with discrete projectile meshes.
 *
 * @param {object} state
 * @param {{x:number,y:number,z:number}} state.origin previous position
 * @param {{x:number,y:number,z:number}} state.next next candidate position
 * @param {{x:number,y:number,z:number}} state.direction flight direction
 * @param {number} state.velocity current speed (m/s)
 * @param {number} [state.damageMultiplier]
 * @param {number} [state.muzzleVelocity]
 * @param {Array<object>} state.colliders
 * @param {() => number} [state.rng]
 */
export function stepProjectileThroughCover({
  origin,
  next,
  direction,
  velocity,
  damageMultiplier = 1,
  muzzleVelocity = DEFAULT_MUZZLE_VELOCITY,
  colliders,
  rng = Math.random,
}) {
  const dx = next.x - origin.x;
  const dy = next.y - origin.y;
  const dz = next.z - origin.z;
  const segmentLength = Math.hypot(dx, dy, dz);
  if (segmentLength < 1e-8) {
    return {
      position: { ...next },
      direction: normalize3(direction),
      velocity,
      damageMultiplier,
      absorbed: false,
      ricocheted: false,
      event: null,
    };
  }

  const dir = normalize3(direction);
  const hit = raycastEnvironment(origin, dir, colliders, segmentLength + 0.05);
  if (!hit || hit.distance > segmentLength + 0.001) {
    return {
      position: { ...next },
      direction: dir,
      velocity,
      damageMultiplier,
      absorbed: false,
      ricocheted: false,
      event: null,
    };
  }

  const impact = resolveSurfaceImpact({
    material: hit.material,
    velocity,
    thickness: hit.thickness,
    direction: dir,
    normal: hit.normal,
    rng,
  });

  if (impact.outcome === 'ricochet') {
    return {
      position: {
        x: hit.point.x + impact.exitDirection.x * 0.05,
        y: hit.point.y + impact.exitDirection.y * 0.05,
        z: hit.point.z + impact.exitDirection.z * 0.05,
      },
      direction: impact.exitDirection,
      velocity: impact.exitVelocity,
      damageMultiplier: calculateDamageMultiplier(impact.exitVelocity, muzzleVelocity),
      absorbed: impact.exitVelocity <= TERMINAL_VELOCITY,
      ricocheted: true,
      event: { ...hit, ...impact },
    };
  }

  if (impact.outcome === 'stopped') {
    return {
      position: { ...hit.point },
      direction: dir,
      velocity: 0,
      damageMultiplier: 0,
      absorbed: true,
      ricocheted: false,
      event: { ...hit, ...impact },
    };
  }

  // Penetrated — place the projectile just past the exit face this frame
  const exitVelocity = impact.exitVelocity;
  return {
    position: {
      x: hit.exitPoint.x + dir.x * 0.05,
      y: hit.exitPoint.y + dir.y * 0.05,
      z: hit.exitPoint.z + dir.z * 0.05,
    },
    direction: dir,
    velocity: exitVelocity,
    damageMultiplier: calculateDamageMultiplier(exitVelocity, muzzleVelocity),
    absorbed: exitVelocity <= TERMINAL_VELOCITY,
    ricocheted: false,
    event: { ...hit, ...impact },
  };
}

export default {
  MATERIAL_PROPERTIES,
  TERMINAL_VELOCITY,
  DEFAULT_MUZZLE_VELOCITY,
  DEFAULT_MAX_RANGE,
  getMaterialProperties,
  resolveMaterialFromType,
  normalize3,
  reflectDirection,
  impactAngleFromNormal,
  raycastAABB,
  raycastEnvironment,
  calculateVelocityLoss,
  calculateRicochetProbability,
  calculateDamageMultiplier,
  reduceDamageThroughCover,
  resolveSurfaceImpact,
  traceShot,
  obstaclesToColliders,
  stepProjectileThroughCover,
};
