import React, { useMemo, useState } from 'react';
import {
  EquipmentSlot,
  InventoryState,
  WeaponEquipSlot,
  WeaponState,
} from '../types/game';
import { getWeaponsForSlot, getWeaponById } from '../data/weapons.js';
import { getGearById, getGearBySlot } from '../data/gear.js';
import {
  equipGear,
  equipWeapon,
  unequipGear,
  unequipWeaponSlot,
} from '../data/inventory.js';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryState;
  weapon: WeaponState;
  onChangeLoadout: (next: { inventory: InventoryState; weapon: WeaponState }) => void;
}

const SLOT_META: Record<
  EquipmentSlot,
  { label: string; hotkey?: string; hint: string }
> = {
  primary: {
    label: 'PRIMARY',
    hotkey: '1',
    hint: 'Rifle / carbine / LMG / DMR',
  },
  sidearm: {
    label: 'SIDEARM',
    hotkey: '2',
    hint: 'Pistol',
  },
  helmet: {
    label: 'HELMET',
    hint: 'Head protection',
  },
  vest: {
    label: 'VEST',
    hint: 'Torso armor / plate carrier',
  },
  backpack: {
    label: 'BACKPACK',
    hint: 'Ammo & sustainment pack',
  },
};

function SlotCard({
  slot,
  selected,
  title,
  subtitle,
  active,
  empty,
  onClick,
}: {
  slot: EquipmentSlot;
  selected: boolean;
  title: string;
  subtitle: string;
  active?: boolean;
  empty?: boolean;
  onClick: () => void;
}) {
  const meta = SLOT_META[slot];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 border rounded-sm transition-colors cursor-pointer ${
        selected
          ? 'border-sky-500 bg-sky-950/50'
          : empty
            ? 'border-dashed border-slate-700 bg-slate-950/40 hover:border-slate-500'
            : 'border-slate-700 bg-slate-900/80 hover:border-slate-500'
      } ${active ? 'ring-1 ring-emerald-500/60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-bold tracking-widest text-slate-400">
          {meta.label}
          {meta.hotkey ? ` [${meta.hotkey}]` : ''}
        </span>
        {active && (
          <span className="text-[9px] font-bold text-emerald-400 uppercase">In Hands</span>
        )}
      </div>
      <div
        className={`text-sm font-semibold ${empty ? 'text-slate-600 italic' : 'text-slate-100'}`}
      >
        {title}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</div>
    </button>
  );
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  inventory,
  weapon,
  onChangeLoadout,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot>('primary');

  const primaryDef = inventory.primary
    ? getWeaponById(inventory.primary.weaponId)
    : null;
  const sidearmDef = inventory.sidearm
    ? getWeaponById(inventory.sidearm.weaponId)
    : null;
  const helmet = inventory.helmetId ? getGearById(inventory.helmetId) : null;
  const vest = inventory.vestId ? getGearById(inventory.vestId) : null;
  const backpack = inventory.backpackId ? getGearById(inventory.backpackId) : null;

  const catalog = useMemo(() => {
    if (selectedSlot === 'primary' || selectedSlot === 'sidearm') {
      return getWeaponsForSlot(selectedSlot).filter((w) =>
        inventory.ownedWeaponIds.includes(w.id)
      );
    }
    return getGearBySlot(selectedSlot).filter((g) =>
      inventory.ownedGearIds.includes(g.id)
    );
  }, [selectedSlot, inventory.ownedWeaponIds, inventory.ownedGearIds]);

  if (!isOpen) return null;

  const equippedIdForSlot = (): string | null => {
    if (selectedSlot === 'primary') return inventory.primary?.weaponId ?? null;
    if (selectedSlot === 'sidearm') return inventory.sidearm?.weaponId ?? null;
    if (selectedSlot === 'helmet') return inventory.helmetId;
    if (selectedSlot === 'vest') return inventory.vestId;
    return inventory.backpackId;
  };

  const currentEquippedId = equippedIdForSlot();

  const handleEquipItem = (id: string) => {
    if (selectedSlot === 'primary' || selectedSlot === 'sidearm') {
      const result = equipWeapon(inventory, weapon, id);
      if (result) onChangeLoadout(result);
      return;
    }
    const result = equipGear(inventory, weapon, id);
    if (result) onChangeLoadout(result);
  };

  const handleUnequipSelected = () => {
    if (selectedSlot === 'primary' || selectedSlot === 'sidearm') {
      onChangeLoadout(unequipWeaponSlot(inventory, weapon, selectedSlot));
      return;
    }
    onChangeLoadout(unequipGear(inventory, weapon, selectedSlot));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-950 border border-slate-700 shadow-2xl flex flex-col font-mono text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 shrink-0">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-sky-400 font-bold block">
              Operator Loadout
            </span>
            <h2 className="text-lg font-bold tracking-wide">TACTICAL INVENTORY</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] text-slate-500">
              [1] primary · [2] sidearm · [I] close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs cursor-pointer"
            >
              CLOSE [I]
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-0">
          {/* Equipment silhouette / dedicated slots */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col gap-3 bg-gradient-to-b from-slate-900/80 to-slate-950">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              Dedicated Equipment Slots
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              {/* Abstract operator frame */}
              <div className="absolute inset-x-10 inset-y-6 border border-slate-800/80 rounded-full pointer-events-none opacity-40" />
              <div className="absolute left-1/2 top-10 -translate-x-1/2 w-16 h-16 rounded-full border border-slate-700/60 pointer-events-none" />
              <div className="absolute left-1/2 top-28 -translate-x-1/2 w-24 h-36 border border-slate-700/50 rounded-sm pointer-events-none" />

              <div className="relative flex flex-col gap-2.5 py-2">
                <SlotCard
                  slot="helmet"
                  selected={selectedSlot === 'helmet'}
                  title={helmet?.shortName ?? 'Empty'}
                  subtitle={helmet ? `${Math.round(helmet.protection * 100)}% head prot.` : SLOT_META.helmet.hint}
                  empty={!helmet}
                  onClick={() => setSelectedSlot('helmet')}
                />
                <SlotCard
                  slot="vest"
                  selected={selectedSlot === 'vest'}
                  title={vest?.shortName ?? 'Empty'}
                  subtitle={
                    vest
                      ? `${Math.round(vest.protection * 100)}% torso · ${vest.weightKg.toFixed(1)} kg`
                      : SLOT_META.vest.hint
                  }
                  empty={!vest}
                  onClick={() => setSelectedSlot('vest')}
                />
                <SlotCard
                  slot="primary"
                  selected={selectedSlot === 'primary'}
                  title={primaryDef?.shortName ?? 'Empty'}
                  subtitle={
                    primaryDef
                      ? `${primaryDef.caliber} · ${inventory.primary?.currentMagRounds ?? 0}/${primaryDef.magazineSize}`
                      : SLOT_META.primary.hint
                  }
                  empty={!primaryDef}
                  active={inventory.activeWeaponSlot === 'primary' && !!primaryDef}
                  onClick={() => setSelectedSlot('primary')}
                />
                <SlotCard
                  slot="sidearm"
                  selected={selectedSlot === 'sidearm'}
                  title={sidearmDef?.shortName ?? 'Empty'}
                  subtitle={
                    sidearmDef
                      ? `${sidearmDef.caliber} · ${inventory.sidearm?.currentMagRounds ?? 0}/${sidearmDef.magazineSize}`
                      : SLOT_META.sidearm.hint
                  }
                  empty={!sidearmDef}
                  active={inventory.activeWeaponSlot === 'sidearm' && !!sidearmDef}
                  onClick={() => setSelectedSlot('sidearm')}
                />
                <SlotCard
                  slot="backpack"
                  selected={selectedSlot === 'backpack'}
                  title={backpack?.shortName ?? 'Empty'}
                  subtitle={
                    backpack
                      ? `+${backpack.ammoBonusMags ?? 0} reserve mags`
                      : SLOT_META.backpack.hint
                  }
                  empty={!backpack}
                  onClick={() => setSelectedSlot('backpack')}
                />
              </div>
            </div>

            <div className="mt-auto pt-2 border-t border-slate-800 text-[10px] text-slate-500 leading-relaxed">
              Select a slot, then equip an item from your stash. Hotkeys{' '}
              <span className="text-slate-300">[1]</span> /{' '}
              <span className="text-slate-300">[2]</span> swap primary and sidearm in the field.
            </div>
          </div>

          {/* Stash / catalog */}
          <div className="lg:col-span-7 p-4 flex flex-col gap-3 min-h-[320px]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">
                  Stash — {SLOT_META[selectedSlot].label}
                </span>
                <p className="text-[11px] text-slate-500">{SLOT_META[selectedSlot].hint}</p>
              </div>
              {currentEquippedId && (
                <button
                  type="button"
                  onClick={handleUnequipSelected}
                  className="px-2.5 py-1 text-[10px] border border-slate-700 bg-slate-900 hover:bg-red-950 hover:border-red-700 text-slate-300 cursor-pointer"
                >
                  UNEQUIP SLOT
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 content-start pr-1">
              {catalog.length === 0 && (
                <div className="col-span-full text-center text-slate-600 text-xs py-10 border border-dashed border-slate-800">
                  No owned items for this slot.
                </div>
              )}

              {catalog.map((item) => {
                const isWeapon = 'caliber' in item;
                const equipped = item.id === currentEquippedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleEquipItem(item.id)}
                    className={`text-left p-3 border rounded-sm transition-colors cursor-pointer ${
                      equipped
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-slate-800 bg-slate-900/60 hover:border-sky-600 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{item.shortName}</div>
                        <div className="text-[10px] text-slate-500">{item.name}</div>
                      </div>
                      {equipped ? (
                        <span className="text-[9px] font-bold text-emerald-400 shrink-0">EQUIPPED</span>
                      ) : (
                        <span className="text-[9px] text-sky-400 shrink-0">EQUIP</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 line-clamp-2">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400 uppercase">
                      {isWeapon ? (
                        <>
                          <span>{item.caliber}</span>
                          <span>{item.magazineSize} rd</span>
                          <span>
                            {item.muzzleVelocity} m/s · {item.effectiveRange} m
                          </span>
                          <span>DMG {item.damage.baseDamage}</span>
                        </>
                      ) : (
                        <>
                          <span>{Math.round(item.protection * 100)}% prot.</span>
                          <span>{item.weightKg} kg</span>
                          {item.ammoBonusMags != null && (
                            <span>+{item.ammoBonusMags} mags</span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Narrow helper for TypeScript exhaustiveness in parent keybinds */
export type InventoryWeaponSlot = WeaponEquipSlot;
