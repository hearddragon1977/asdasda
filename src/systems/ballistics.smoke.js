/**
 * Smoke tests for the ballistic penetration system.
 * Run: bun src/systems/ballistics.smoke.js
 */
import {
  MATERIAL_PROPERTIES,
  calculateVelocityLoss,
  calculateRicochetProbability,
  calculateDamageMultiplier,
  reduceDamageThroughCover,
  raycastAABB,
  raycastEnvironment,
  resolveSurfaceImpact,
  traceShot,
  obstaclesToColliders,
  stepProjectileThroughCover,
  reflectDirection,
} from './ballistics.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('Material catalog');
assert(!!MATERIAL_PROPERTIES.wood, 'wood material defined');
assert(!!MATERIAL_PROPERTIES.concrete, 'concrete material defined');
assert(!!MATERIAL_PROPERTIES.metal, 'metal material defined');
assert(!!MATERIAL_PROPERTIES.soil, 'soil material defined');

console.log('Velocity loss');
const woodLoss = calculateVelocityLoss(900, 'wood', 0.05, 90);
assert(woodLoss.penetrated, '5cm wood is penetrable at 900 m/s');
assert(woodLoss.exitVelocity < 900, 'wood reduces velocity');

const metalLoss = calculateVelocityLoss(900, 'metal', 0.02, 90);
assert(metalLoss.exitVelocity < woodLoss.exitVelocity, 'metal drains more than wood at similar thickness');

const thickConcrete = calculateVelocityLoss(900, 'concrete', 0.8, 90);
assert(!thickConcrete.penetrated, '80cm concrete stops a 5.56-class round');
assert(thickConcrete.exitVelocity === 0, 'stopped round has zero exit velocity');

const thinConcrete = calculateVelocityLoss(900, 'concrete', 0.12, 90);
assert(thinConcrete.penetrated, '12cm concrete can be punched by 5.56');
assert(thinConcrete.exitVelocity < 800, 'thin concrete still bleeds velocity');

console.log('Ricochet probability');
const grazingMetal = calculateRicochetProbability('metal', 5, 600);
const flushWood = calculateRicochetProbability('wood', 85, 900);
assert(grazingMetal > 0.4, `grazing metal ricochets often (${grazingMetal.toFixed(2)})`);
assert(flushWood < 0.1, `perpendicular wood rarely ricochets (${flushWood.toFixed(2)})`);

console.log('Damage through cover');
const dmgMul = calculateDamageMultiplier(450, 900);
assert(dmgMul > 0.2 && dmgMul < 0.3, `half-speed KE ~0.25 got ${dmgMul.toFixed(3)}`);
const reduced = reduceDamageThroughCover(45, 900, 450, 900);
assert(Math.abs(reduced - 45 * 0.25) < 0.01, 'cover damage scales with KE ratio');

console.log('Raycast AABB');
const hit = raycastAABB(
  { x: -5, y: 1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 2, y: 2, z: 2 }
);
assert(!!hit, 'ray hits box');
assert(Math.abs(hit.distance - 4) < 0.01, `entry distance ~4 got ${hit.distance}`);
assert(Math.abs(hit.thickness - 2) < 0.01, `thickness ~2 got ${hit.thickness}`);
assert(hit.normal.x === -1, 'entry normal faces -X');

const miss = raycastAABB(
  { x: -5, y: 10, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 2, y: 2, z: 2 }
);
assert(!miss, 'high ray misses box');

console.log('Reflect');
const bounced = reflectDirection({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 });
assert(Math.abs(bounced.x + 1) < 1e-6, 'reflect reverses against -X wall');

console.log('Forced ricochet via rng');
const rico = resolveSurfaceImpact({
  material: 'metal',
  velocity: 700,
  thickness: 0.05,
  direction: { x: 1, y: 0, z: 0 },
  normal: { x: -1, y: 0, z: 0 },
  rng: () => 0, // always ricochet if chance > 0
});
assert(rico.outcome === 'ricochet', 'rng=0 forces ricochet when chance > 0');
assert(rico.exitDirection.x < 0, 'ricochet reverses X');

console.log('Forced penetration via rng');
const pen = resolveSurfaceImpact({
  material: 'wood',
  velocity: 900,
  thickness: 0.1,
  direction: { x: 1, y: 0, z: 0 },
  normal: { x: -1, y: 0, z: 0 },
  rng: () => 0.99, // never ricochet
});
assert(pen.outcome === 'penetrated', 'thin wood penetrates when not ricocheting');

console.log('traceShot through wood crate');
const colliders = obstaclesToColliders([
  {
    id: 'crate_0',
    type: 'crate',
    material: 'wood',
    pos: { x: 0, y: 0.9, z: 0 },
    size: { x: 2.2, y: 1.8, z: 2.2 },
  },
]);
const traced = traceShot({
  origin: { x: -10, y: 0.9, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
  colliders,
  rng: () => 0.99,
});
assert(traced.penetrationCount === 1, 'shot penetrates one wood crate');
assert(traced.finalVelocity < 900, 'exit velocity reduced');
assert(traced.remainingDamage < 45, 'damage reduced through cover');
assert(!traced.stopped, 'round still lethal after thin wood');

console.log('stepProjectileThroughCover');
const stepped = stepProjectileThroughCover({
  origin: { x: -2, y: 0.9, z: 0 },
  next: { x: 2, y: 0.9, z: 0 },
  direction: { x: 1, y: 0, z: 0 },
  velocity: 900,
  colliders,
  rng: () => 0.99,
});
assert(!!stepped.event, 'segment reports cover event');
assert(stepped.event.outcome === 'penetrated', 'segment penetrated wood');
assert(stepped.damageMultiplier < 1, 'damage multiplier reduced');

console.log('Environment nearest-hit selection');
const multi = raycastEnvironment(
  { x: -20, y: 1, z: 0 },
  { x: 1, y: 0, z: 0 },
  [
    { id: 'far', material: 'metal', center: { x: 10, y: 1, z: 0 }, size: { x: 1, y: 2, z: 1 } },
    { id: 'near', material: 'soil', center: { x: 0, y: 1, z: 0 }, size: { x: 1, y: 2, z: 1 } },
  ]
);
assert(multi?.id === 'near', 'nearest collider wins');
assert(multi?.material === 'soil', 'soil material preserved');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
