import React, { useState } from 'react';
import { AnatomicalWound, MedicalKit, PlayerVitals } from '../types/game';
import { anatomySim } from '../game/anatomySimulation';

interface FieldMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  vitals: PlayerVitals;
  wounds: AnatomicalWound[];
  medKit: MedicalKit;
  onUpdateMedKit: (kit: MedicalKit) => void;
  onRefreshVitals: () => void;
}

export const FieldMedicineModal: React.FC<FieldMedicineModalProps> = ({
  isOpen,
  onClose,
  vitals,
  wounds,
  medKit,
  onUpdateMedKit,
  onRefreshVitals,
}) => {
  const [selectedWoundId, setSelectedWoundId] = useState<string | null>(null);
  const [actionProgress, setActionProgress] = useState<number>(0);
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedWound = wounds.find((w) => w.id === selectedWoundId) || (wounds.length > 0 ? wounds[0] : null);

  const performHoldAction = (label: string, durationMs: number, onComplete: () => void) => {
    setActiveActionLabel(label);
    setActionProgress(10);

    const startTime = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setActionProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setActiveActionLabel(null);
        setActionProgress(0);
        onComplete();
        onRefreshVitals();
      }
    }, 50);
  };

  const handleApplyTourniquet = (wound: AnatomicalWound) => {
    if (medKit.tourniquets <= 0) return;
    performHoldAction('Tightening Windlass Rod (CAT TQ)...', 1200, () => {
      anatomySim.applyTourniquet(wound.id);
      onUpdateMedKit({ ...medKit, tourniquets: medKit.tourniquets - 1 });
    });
  };

  const handlePackCombatGauze = (wound: AnatomicalWound) => {
    if (medKit.hemostaticGauze <= 0) return;
    performHoldAction('Packing Hemostatic Gauze & Holding Direct Pressure...', 1800, () => {
      anatomySim.packWoundWithGauze(wound.id);
      onUpdateMedKit({ ...medKit, hemostaticGauze: medKit.hemostaticGauze - 1 });
    });
  };

  const handleMudAndSpit = (wound: AnatomicalWound) => {
    performHoldAction('Scraping Field Mud & Tamping Deep Cavity...', 2200, () => {
      anatomySim.packMudAndSpit(wound.id);
    });
  };

  const handleApplyChestSeal = (wound: AnatomicalWound) => {
    if (medKit.chestSeals <= 0) return;
    performHoldAction('Wiping Blood & Adhering Vented Chest Seal...', 1400, () => {
      anatomySim.applyChestSeal(wound.id);
      onUpdateMedKit({ ...medKit, chestSeals: medKit.chestSeals - 1 });
    });
  };

  const handleNeedleDecompression = (wound: AnatomicalWound) => {
    if (medKit.decompressionNeedles <= 0) return;
    performHoldAction('Inserting 14G ARS Needle (2nd Intercostal Space)...', 1500, () => {
      anatomySim.decompressPneumothorax(wound.id);
      onUpdateMedKit({ ...medKit, decompressionNeedles: medKit.decompressionNeedles - 1 });
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-stone-900 border border-stone-700 shadow-2xl rounded-sm p-4 sm:p-6 flex flex-col gap-4 text-stone-200 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div>
            <span className="text-xs text-amber-500 uppercase tracking-widest block font-bold">TACTICAL FIELD MEDICINE // TCCC PROTOCOL</span>
            <span className="text-sm text-stone-300">Anatomical Trauma Assessment & Interventions</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 transition-colors uppercase tracking-wider"
          >
            Close IFAK [X]
          </button>
        </div>

        {/* Action progress bar */}
        {activeActionLabel && (
          <div className="bg-stone-950 border border-amber-600/70 p-3 rounded-sm animate-pulse">
            <div className="flex justify-between text-xs text-amber-400 mb-1">
              <span>{activeActionLabel}</span>
              <span>{actionProgress}%</span>
            </div>
            <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-75"
                style={{ width: `${actionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* IFAK Inventory Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-950 p-2.5 border border-stone-800 text-xs">
          <div className="flex flex-col">
            <span className="text-stone-500 uppercase text-[10px]">CAT Gen 7 TQ</span>
            <span className="text-amber-400 font-bold">{medKit.tourniquets} remaining</span>
          </div>
          <div className="flex flex-col">
            <span className="text-stone-500 uppercase text-[10px]">QuikClot Gauze</span>
            <span className="text-amber-400 font-bold">{medKit.hemostaticGauze} remaining</span>
          </div>
          <div className="flex flex-col">
            <span className="text-stone-500 uppercase text-[10px]">HyFin Chest Seal</span>
            <span className="text-amber-400 font-bold">{medKit.chestSeals} remaining</span>
          </div>
          <div className="flex flex-col">
            <span className="text-stone-500 uppercase text-[10px]">14G ARS Needle</span>
            <span className="text-amber-400 font-bold">{medKit.decompressionNeedles} remaining</span>
          </div>
        </div>

        {/* Main Trauma View */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Active Wounds List */}
          <div className="md:col-span-5 flex flex-col gap-2">
            <span className="text-xs uppercase text-stone-400 font-bold border-b border-stone-800 pb-1">
              Recorded Ballistic Wounds ({wounds.length})
            </span>

            {wounds.length === 0 ? (
              <div className="p-4 bg-stone-950/60 border border-stone-800/80 text-stone-400 text-xs text-center">
                No active ballistic trauma detected. Operator armor intact.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {wounds.map((w, index) => {
                  const isSelected = selectedWound?.id === w.id;
                  const isControlled = w.bleedingRate === 0;

                  return (
                    <button
                      key={`wound-${w.id}-${index}`}
                      onClick={() => setSelectedWoundId(w.id)}
                      className={`p-2.5 text-left border transition-all text-xs flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-amber-950/30 border-amber-500 text-amber-200'
                          : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{w.name}</span>
                        <span
                          className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                            isControlled
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                          }`}
                        >
                          {isControlled ? 'Halted' : `${Math.round(w.bleedingRate)} mL/s`}
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-400 line-clamp-1">{w.description}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Wound Details & Interventions */}
          <div className="md:col-span-7 flex flex-col gap-3 bg-stone-950 p-4 border border-stone-800">
            {selectedWound ? (
              <>
                <div className="border-b border-stone-800 pb-2">
                  <span className="text-xs text-stone-500 uppercase text-[10px] block">ANATOMICAL ZONE</span>
                  <span className="text-sm font-bold text-amber-300">{selectedWound.name}</span>
                  <p className="text-xs text-stone-400 mt-1">{selectedWound.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-stone-500 text-[10px] block uppercase">Bleeding Status</span>
                    <span className={selectedWound.bleedingRate > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                      {selectedWound.bleedingRate > 0 ? `Active Hemorrhage (${Math.round(selectedWound.bleedingRate)} mL/s)` : 'Hemorrhage Controlled'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 text-[10px] block uppercase">Intervention Applied</span>
                    <span className="text-stone-300">
                      {selectedWound.tourniquetApplied
                        ? 'CAT Tourniquet'
                        : selectedWound.packedStatus === 'combat_gauze'
                        ? 'Combat Gauze'
                        : selectedWound.packedStatus === 'mud_and_spit'
                        ? 'Mud & Spit Packed'
                        : selectedWound.sealed
                        ? 'Chest Seal'
                        : 'None'}
                    </span>
                  </div>
                </div>

                {/* Available Action Buttons */}
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-xs uppercase text-stone-400 font-bold">Field Procedures</span>

                  {/* Limb Tourniquet */}
                  {(selectedWound.zone.includes('limb_arm') || selectedWound.zone.includes('limb_leg')) && (
                    <button
                      disabled={selectedWound.tourniquetApplied || medKit.tourniquets <= 0 || activeActionLabel !== null}
                      onClick={() => handleApplyTourniquet(selectedWound)}
                      className={`p-2 text-xs font-mono border text-left transition-colors flex items-center justify-between ${
                        selectedWound.tourniquetApplied
                          ? 'border-emerald-700/60 bg-emerald-950/20 text-emerald-400'
                          : medKit.tourniquets > 0
                          ? 'border-amber-600 bg-amber-950/20 hover:bg-amber-900/30 text-amber-200'
                          : 'border-stone-800 text-stone-600 cursor-not-allowed'
                      }`}
                    >
                      <span>{selectedWound.tourniquetApplied ? '✓ Tourniquet Tightened (High & Tight)' : 'Apply CAT Tourniquet'}</span>
                      <span className="text-[10px] text-stone-400">Halts arterial bleed</span>
                    </button>
                  )}

                  {/* Junctional / Abdominal Gauze Packing */}
                  {(selectedWound.zone.includes('junctional') || selectedWound.zone === 'torso_abdomen') && (
                    <button
                      disabled={selectedWound.packedStatus === 'combat_gauze' || medKit.hemostaticGauze <= 0 || activeActionLabel !== null}
                      onClick={() => handlePackCombatGauze(selectedWound)}
                      className={`p-2 text-xs font-mono border text-left transition-colors flex items-center justify-between ${
                        selectedWound.packedStatus === 'combat_gauze'
                          ? 'border-emerald-700/60 bg-emerald-950/20 text-emerald-400'
                          : medKit.hemostaticGauze > 0
                          ? 'border-amber-600 bg-amber-950/20 hover:bg-amber-900/30 text-amber-200'
                          : 'border-stone-800 text-stone-600 cursor-not-allowed'
                      }`}
                    >
                      <span>{selectedWound.packedStatus === 'combat_gauze' ? '✓ Packed with QuikClot Gauze' : 'Pack Cavity with Hemostatic Gauze'}</span>
                      <span className="text-[10px] text-stone-400">Reduces bleed by 85%</span>
                    </button>
                  )}

                  {/* Desperate Mud & Spit Mechanic */}
                  {(selectedWound.zone.includes('junctional') || selectedWound.zone === 'torso_abdomen' || selectedWound.zone.includes('limb')) && (
                    <button
                      disabled={selectedWound.packedStatus !== 'none' || activeActionLabel !== null}
                      onClick={() => handleMudAndSpit(selectedWound)}
                      className="p-2 text-xs font-mono border border-stone-600 bg-stone-900 hover:bg-stone-800 text-stone-300 text-left transition-colors flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="text-amber-400 font-bold">Desperate "Mud & Spit" Packing</span>
                        <span className="text-[10px] text-stone-500">Scrape field dirt when out of supplies (Infection risk)</span>
                      </div>
                      <span className="text-[10px] text-stone-400">Reduces bleed 65%</span>
                    </button>
                  )}

                  {/* Thoracic Chest Seal */}
                  {selectedWound.zone === 'torso_lungs' && (
                    <>
                      <button
                        disabled={selectedWound.sealed || medKit.chestSeals <= 0 || activeActionLabel !== null}
                        onClick={() => handleApplyChestSeal(selectedWound)}
                        className={`p-2 text-xs font-mono border text-left transition-colors flex items-center justify-between ${
                          selectedWound.sealed
                            ? 'border-emerald-700/60 bg-emerald-950/20 text-emerald-400'
                            : 'border-amber-600 bg-amber-950/20 hover:bg-amber-900/30 text-amber-200'
                        }`}
                      >
                        <span>{selectedWound.sealed ? '✓ HyFin Chest Seal Applied' : 'Apply Vented Chest Seal'}</span>
                        <span className="text-[10px] text-stone-400">Stops tension pneumothorax suck</span>
                      </button>

                      <button
                        disabled={selectedWound.decompressed || medKit.decompressionNeedles <= 0 || activeActionLabel !== null}
                        onClick={() => handleNeedleDecompression(selectedWound)}
                        className={`p-2 text-xs font-mono border text-left transition-colors flex items-center justify-between ${
                          selectedWound.decompressed
                            ? 'border-emerald-700/60 bg-emerald-950/20 text-emerald-400'
                            : 'border-amber-600 bg-amber-950/20 hover:bg-amber-900/30 text-amber-200'
                        }`}
                      >
                        <span>{selectedWound.decompressed ? '✓ Pleura Decompressed' : 'Needle Thoracostomy (ARS 14G)'}</span>
                        <span className="text-[10px] text-stone-400">Relieves lung collapse</span>
                      </button>
                    </>
                  )}

                  {/* Spine Paralysis Warning */}
                  {selectedWound.zone === 'torso_spine' && (
                    <div className="p-2.5 bg-red-950/40 border border-red-700/80 text-red-300 text-xs">
                      <span className="font-bold block">VERTEBRAL CORD TRANSECTION</span>
                      Non-compressible neuro trauma. Lower extremities paralyzed. Combatant is immobile. Request immediate AI CASEVAC extraction!
                    </div>
                  )}
                </div>
              </>
            ) : (
              <span className="text-xs text-stone-500">Select a ballistic wound to begin TCCC intervention.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
