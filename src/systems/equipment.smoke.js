/**
 * Smoke tests for the modular equipment & attachment system.
 * Run: bun src/systems/equipment.smoke.js
 */
import {
  GEAR_BY_ID,
  IOTV_GEN2,
  ACH_MICH,
  SOCOM556_RC2,
  SUREFIRE_M600,
  AIMPOINT_T2,
  DEFAULT_PLAYER_GEAR_IDS,
  getGearById,
  resolveSlotForGear,
} from '../data/gear.js';
import {
  UnitEquipment,
  EquipmentManager,
  PLAYER_UNIT_ID,
  defaultAttachmentEffects,
} from './equipment.js';

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

console.log('Gear catalog');
assert(!!GEAR_BY_ID.iotv_gen2, 'IOTV defined');
assert(!!GEAR_BY_ID.ach_mich, 'ACH helmet defined');
assert(!!GEAR_BY_ID.socom556_rc2, 'RC2 suppressor defined');
assert(resolveSlotForGear('aimpoint_t2') === 'optic', 'optic slot resolve');
assert(resolveSlotForGear('surefire_m600') === 'flashlight', 'flashlight slot resolve');
assert(getGearById('missing') === undefined, 'unknown gear is undefined');

console.log('Default player loadout');
const player = new UnitEquipment(PLAYER_UNIT_ID, {
  faction: 'US',
  defaultKit: DEFAULT_PLAYER_GEAR_IDS,
});
assert(player.equipment.vest === IOTV_GEN2.id, 'default vest equipped');
assert(player.equipment.helmet === ACH_MICH.id, 'default helmet equipped');
assert(player.attachments.optic === AIMPOINT_T2.id, 'default optic equipped');
assert(player.attachments.flashlight === SUREFIRE_M600.id, 'default light equipped');
assert(player.getMoveSpeedMultiplier() < 1, 'encumbrance reduces move speed');
assert(player.getCapacityKg() > 0, 'backpack grants capacity');

console.log('Armor hit resolution');
const alwaysStop = () => 0; // rng → always succeed protection rolls
const plateStop = player.resolveArmorHit('torso_heart', 0.4, alwaysStop);
assert(plateStop.stopped, `ESAPI stops mid pen: ${plateStop.message}`);
assert(plateStop.blockedBy === IOTV_GEN2.id, 'blocked by IOTV');

const helmetStop = player.resolveArmorHit('head_brain', 0.3, alwaysStop);
assert(helmetStop.stopped, `helmet stops cranial: ${helmetStop.message}`);

const limb = player.resolveArmorHit('limb_arm_left', 0.55, alwaysStop);
assert(!limb.covered && !limb.stopped, 'limbs uncovered by plate carrier');

const overmatch = player.resolveArmorHit('torso_heart', 0.95, () => 0.99);
assert(!overmatch.stopped, `high pen can defeat plates: ${overmatch.message}`);

console.log('Attachments');
const fx = player.getAttachmentEffects();
assert(fx.adsZoom > 1, `optic zoom ${fx.adsZoom}`);
assert(fx.hasFlashlight, 'flashlight present');
assert(fx.lightIntensity > 0, 'light intensity > 0');
assert(fx.soundSignature === 1, 'A2 flash hider keeps full signature');

const suppressed = player.equip(SOCOM556_RC2.id);
assert(suppressed.ok, 'equip suppressor');
const sfx = player.getAttachmentEffects();
assert(sfx.isSuppressed, 'suppressor flag set');
assert(sfx.soundSignature < 0.5, `signature reduced to ${sfx.soundSignature}`);
assert(sfx.muzzleFlashScale < 0.2, `flash reduced to ${sfx.muzzleFlashScale}`);

const weaponPatch = player.applyToWeaponState({
  currentMagRounds: 30,
  chambered: true,
  tacticalLight: true,
  aimingDownSights: false,
});
assert(weaponPatch.attachments.muzzleId === SOCOM556_RC2.id, 'weapon state muzzle synced');
assert(weaponPatch.tacticalLight === true, 'light toggle preserved when attachment present');
assert(weaponPatch.isSuppressed === true, 'weapon state suppressed');

console.log('Inventory equip / swap / drop');
const bare = new UnitEquipment('tester', { defaultKit: null });
assert(bare.equipment.vest === null, 'null kit starts empty');
const eq = bare.equip(IOTV_GEN2.id);
assert(eq.ok && bare.equipment.vest === IOTV_GEN2.id, 'equip vest');
bare.equip('assault_pack_3day');
const swap = bare.swap('vest', 'ciras_land');
assert(swap.ok && bare.equipment.vest === 'ciras_land', 'swap vest');
assert(
  bare.inventory.some((i) => i.id === IOTV_GEN2.id),
  'previous vest stowed in pack'
);
const dropped = bare.drop('vest');
assert(dropped.ok && dropped.itemId === 'ciras_land', 'drop vest');
assert(bare.equipment.vest === null, 'vest slot empty after drop');

console.log('Manager player + AI hooks');
const mgr = new EquipmentManager();
assert(mgr.getPlayer().unitId === PLAYER_UNIT_ID, 'manager has player');
mgr.registerFriendly('f1');
mgr.registerEnemy('e1');
assert(mgr.get('f1')?.equipment.vest === DEFAULT_PLAYER_GEAR_IDS.vest, 'friendly kit');
assert(mgr.get('e1')?.faction === 'OPFOR', 'enemy faction');
mgr.equip('e1', 'pbs1_suppressor');
assert(mgr.get('e1')?.attachments.muzzle === 'pbs1_suppressor', 'AI equip muzzle');
mgr.drop('e1', 'muzzle');
assert(mgr.get('e1')?.attachments.muzzle === null, 'AI drop muzzle');
mgr.syncCombatants([{ id: 'f1' }, { id: 'f2' }], [{ id: 'e1' }]);
assert(!!mgr.get('f2'), 'sync creates missing friendly');
mgr.pruneMissing(['f1', 'e1']);
assert(!mgr.get('f2'), 'prune removes missing');
assert(!!mgr.get(PLAYER_UNIT_ID), 'player never pruned');

console.log('Baseline effects');
const baseline = defaultAttachmentEffects();
assert(baseline.reticle === 'iron', 'default reticle iron');
assert(!baseline.hasFlashlight, 'default no light');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
