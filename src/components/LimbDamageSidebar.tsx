import React from 'react';
import { AnatomicalWound, AnatomicalZone, MedicalKit, PlayerVitals } from '../types/game';
import { anatomySim } from '../game/anatomySimulation';

interface LimbDamageSidebarProps {
  vitals: PlayerVitals;
  wounds: AnatomicalWound[];
  medKit: MedicalKit;
  godMode: boolean;
  onToggleGodMode: () => void;
  onRefreshVitals: () => void;
  onOpenRoster: () => void;
  onCallCasevac: () => void;
}

export const LimbDamageSidebar: React.FC<LimbDamageSidebarProps> = ({
  vitals,
  wounds,
  medKit,
  godMode,
  onToggleGodMode,
  onRefreshVitals,
  onOpenRoster,
  onCallCasevac,
}) => {
  // Compute approximate limb HP based on active ballistic wounds
  const getLimbHealth = (zoneSubstring: string) => {
    const limbWounds = wounds.filter((w) => w.zone.includes(zoneSubstring));
    if (limbWounds.length === 0) return 100;
    // Each unhalted wound reduces limb integrity
    let health = 100;
    for (const w of limbWounds) {
      health -= w.tourniquetApplied ? 25 : w.bleedingRate > 0 ? 45 : 20;
    }
    return Math.max(0, health);
  };

  const headHp = getLimbHealth('head');
  const torsoHp = getLimbHealth('torso');
  const armLHp = getLimbHealth('limb_arm_left');
  const armRHp = getLimbHealth('limb_arm_right');
  const legLHp = getLimbHealth('limb_leg_left');
  const legRHp = getLimbHealth('limb_leg_right');
  const groinHp = getLimbHealth('junctional_groin');

  const bloodPct = Math.max(0, Math.min(100, (vitals.bloodVolume / 5000) * 100));

  const handleApplyTQ = (zone: string) => {
    const wound = wounds.find((w) => w.zone.includes(zone) && !w.tourniquetApplied);
    if (wound) {
      anatomySim.applyTourniquet(wound.id);
      onRefreshVitals();
    }
  };

  const handleChestSeal = () => {
    const wound = wounds.find((w) => w.zone === 'torso_lungs' && !w.sealed);
    if (wound) {
      anatomySim.applyChestSeal(wound.id);
      onRefreshVitals();
    }
  };

  const handleMudSpit = () => {
    const wound = wounds.find((w) => w.packedStatus === 'none' && w.bleedingRate > 0);
    if (wound) {
      anatomySim.packMudAndSpit(wound.id);
      onRefreshVitals();
    }
  };

  const handleInjectDamage = (zone: AnatomicalZone) => {
    if (godMode) return;
    anatomySim.inflictTrauma(zone);
    onRefreshVitals();
  };

  const handleFullRestore = () => {
    anatomySim.reset();
    onRefreshVitals();
  };

  return (
    <aside className="w-80 sm:w-96 bg-slate-950/90 backdrop-blur-md border-l border-slate-800/80 p-4 h-full flex flex-col gap-3 overflow-y-auto text-slate-100 font-mono text-xs select-none z-30 shrink-0">
      {/* GOD MODE TOGGLE */}
      <button
        onClick={onToggleGodMode}
        className={`w-full py-2.5 px-3 rounded font-bold text-center border transition-all text-xs flex items-center justify-center gap-2 cursor-pointer ${
          godMode
            ? 'bg-emerald-600/90 border-emerald-400 text-white shadow-lg shadow-emerald-950 animate-pulse'
            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
        }`}
      >
        <span>{godMode ? '★ GOD MODE: ACTIVE [G]' : 'TOGGLE GOD MODE [G]'}</span>
      </button>

      {/* Hemodynamics Panel */}
      <div className="bg-slate-900/60 p-3 rounded border border-slate-800/70 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
            HEMODYNAMICS & VITALS
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              vitals.shockStage === 'normal'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
            }`}
          >
            {vitals.shockStage.toUpperCase()}
          </span>
        </div>

        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-slate-400">Blood Volume</span>
            <span className="font-bold text-red-400">{Math.round(vitals.bloodVolume)} / 5,000 mL</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                bloodPct > 70 ? 'bg-emerald-500' : bloodPct > 40 ? 'bg-amber-500' : 'bg-red-600'
              }`}
              style={{ width: `${bloodPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] text-slate-300">
          <div>
            <span className="text-[9px] text-slate-500 block">HEART RATE</span>
            <span className="text-sky-300 font-bold">{vitals.heartRate} BPM</span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 block">PRESSURE</span>
            <span className="font-bold">{vitals.bloodPressureSystolic}/{vitals.bloodPressureDiastolic}</span>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 block">SPO2</span>
            <span className="text-emerald-400 font-bold">{Math.round(vitals.spO2)}%</span>
          </div>
        </div>
      </div>

      {/* Hardcore Per-Limb Damage System */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
          ANATOMICAL LIMB INTEGRITY ({wounds.length} ACTIVE TRAUMA)
        </span>

        {/* Head / Neck */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Head & Neck (Cranial/Carotid)</span>
            <span className={headHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{headHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${headHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('head_carotid')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Neck
            </button>
          </div>
        </div>

        {/* Torso & Lungs */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Thoracic Cavity & Lungs</span>
            <span className={torsoHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{torsoHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${torsoHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('torso_lungs')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Lungs
            </button>
            <button
              onClick={handleChestSeal}
              className="px-2 py-0.5 bg-sky-900/70 hover:bg-sky-800 text-sky-200 text-[10px] rounded cursor-pointer font-bold"
            >
              Apply Chest Seal
            </button>
          </div>
        </div>

        {/* Spinal Column */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex justify-between items-center">
          <div>
            <span className="font-semibold text-slate-200 block">Spinal Column</span>
            <span className={vitals.paralyzed ? 'text-red-400 font-bold' : 'text-emerald-400'}>
              {vitals.paralyzed ? 'PARALYZED (Ground Crawl Only)' : 'Intact (Full Mobility)'}
            </span>
          </div>
          <button
            onClick={() => handleInjectDamage('torso_spine')}
            className="px-2 py-1 bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-800 text-[10px] rounded cursor-pointer"
          >
            Transect
          </button>
        </div>

        {/* Left Arm */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Left Arm (Brachial)</span>
            <span className={armLHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{armLHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${armLHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('limb_arm_left')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Arm
            </button>
            <button
              onClick={() => handleApplyTQ('limb_arm_left')}
              className="px-2 py-0.5 bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] rounded cursor-pointer font-bold"
            >
              Apply TQ
            </button>
          </div>
        </div>

        {/* Right Arm */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Right Arm (Brachial)</span>
            <span className={armRHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{armRHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${armRHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('limb_arm_right')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Arm
            </button>
            <button
              onClick={() => handleApplyTQ('limb_arm_right')}
              className="px-2 py-0.5 bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] rounded cursor-pointer font-bold"
            >
              Apply TQ
            </button>
          </div>
        </div>

        {/* Left Leg */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Left Leg (Femoral)</span>
            <span className={legLHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{legLHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${legLHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('limb_leg_left')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Femoral
            </button>
            <button
              onClick={() => handleApplyTQ('limb_leg_left')}
              className="px-2 py-0.5 bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] rounded cursor-pointer font-bold"
            >
              Apply TQ
            </button>
          </div>
        </div>

        {/* Right Leg */}
        <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200">Right Leg (Femoral)</span>
            <span className={legRHp < 50 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{legRHp}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${legRHp}%` }} />
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button
              onClick={() => handleInjectDamage('limb_leg_right')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
            >
              Hit Femoral
            </button>
            <button
              onClick={() => handleApplyTQ('limb_leg_right')}
              className="px-2 py-0.5 bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] rounded cursor-pointer font-bold"
            >
              Apply TQ
            </button>
          </div>
        </div>

        {/* Desperate Mud & Spit & Stabilize */}
        <div className="bg-amber-950/20 p-2.5 rounded border border-amber-800/60 flex flex-col gap-1.5">
          <span className="text-[10px] text-amber-400 font-bold uppercase">Emergency Field Interventions</span>
          <div className="flex gap-2">
            <button
              onClick={handleMudSpit}
              className="flex-1 py-1.5 bg-amber-900/60 hover:bg-amber-800 text-amber-200 text-[10px] rounded border border-amber-700 font-bold cursor-pointer"
            >
              Pack Mud & Spit
            </button>
            <button
              onClick={handleFullRestore}
              className="flex-1 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-[10px] rounded border border-emerald-700 font-bold cursor-pointer"
            >
              Full Restore
            </button>
          </div>
        </div>

        {/* Tactical Actions */}
        <div className="pt-2 border-t border-slate-800 flex gap-2">
          <button
            onClick={onCallCasevac}
            className="flex-1 py-2 bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-bold rounded cursor-pointer"
          >
            AI CASEVAC [9]
          </button>
          <button
            onClick={onOpenRoster}
            className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded cursor-pointer"
          >
            Roster [P]
          </button>
        </div>
      </div>
    </aside>
  );
};
