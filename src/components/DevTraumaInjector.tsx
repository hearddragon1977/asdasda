import React, { useState } from 'react';
import { AnatomicalZone } from '../types/game';

interface DevTraumaInjectorProps {
  onInjectTrauma: (zone: AnatomicalZone) => void;
  onResetTrauma: () => void;
  onSpawnHostile: () => void;
}

export const DevTraumaInjector: React.FC<DevTraumaInjectorProps> = ({
  onInjectTrauma,
  onResetTrauma,
  onSpawnHostile,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute bottom-6 left-6 z-30 font-mono text-xs">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-2.5 py-1.5 bg-black/60 hover:bg-black/90 text-stone-400 hover:text-amber-400 border border-stone-700/80 backdrop-blur-sm transition-colors text-[11px] flex items-center gap-1.5"
        >
          <span>TRAUMA INJECTOR</span>
          <span className="text-[10px] text-stone-500">[DEV]</span>
        </button>
      ) : (
        <div className="bg-stone-950/95 border border-stone-700 p-3 shadow-2xl backdrop-blur-md max-w-xs flex flex-col gap-2 rounded-sm text-stone-300">
          <div className="flex items-center justify-between border-b border-stone-800 pb-1.5">
            <span className="text-amber-400 font-bold uppercase text-[11px]">DEV TRAUMA INJECTOR</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-stone-400 hover:text-stone-100 text-xs px-1"
            >
              ✕
            </button>
          </div>

          <span className="text-[10px] text-stone-500 uppercase">Inject Specific Anatomical Trauma</span>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onInjectTrauma('head_brain')}
              className="p-1.5 bg-red-950/50 hover:bg-red-900/60 border border-red-800 text-red-300 text-[10px] text-left"
            >
              Brain (Instant KIA)
            </button>
            <button
              onClick={() => onInjectTrauma('head_carotid')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Carotid Bleed (Neck)
            </button>
            <button
              onClick={() => onInjectTrauma('torso_lungs')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Lung (Pneumothorax)
            </button>
            <button
              onClick={() => onInjectTrauma('torso_spine')}
              className="p-1.5 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800 text-amber-300 text-[10px] text-left"
            >
              Spine (Paralysis!)
            </button>
            <button
              onClick={() => onInjectTrauma('junctional_groin')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Junctional Groin
            </button>
            <button
              onClick={() => onInjectTrauma('limb_leg_left')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Femoral Artery (Leg)
            </button>
            <button
              onClick={() => onInjectTrauma('limb_arm_right')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Brachial Artery (Arm)
            </button>
            <button
              onClick={() => onInjectTrauma('torso_abdomen')}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-[10px] text-left"
            >
              Abdomen Internal
            </button>
          </div>

          <div className="flex gap-2 pt-1 border-t border-stone-800 text-[10px]">
            <button
              onClick={onResetTrauma}
              className="flex-1 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300"
            >
              Reset Vitals & Blood
            </button>
            <button
              onClick={onSpawnHostile}
              className="flex-1 py-1 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300"
            >
              Respawn AI Squad
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
