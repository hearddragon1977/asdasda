import React from 'react';
import { PlayerVitals, WeaponState } from '../types/game';

interface DiegeticBodycamHUDProps {
  vitals: PlayerVitals;
  weapon: WeaponState;
  operatorCallsign: string;
  isInspectingBody: boolean;
  isMapOpen: boolean;
  onCloseMap: () => void;
  lastSquadBark: string;
}

export const DiegeticBodycamHUD: React.FC<DiegeticBodycamHUDProps> = ({
  vitals,
  weapon,
  operatorCallsign,
  isInspectingBody,
  isMapOpen,
  onCloseMap,
  lastSquadBark,
}) => {
  // Calculate tunnel vision vignette radius based on blood volume (5000 -> 1500)
  const bloodRatio = Math.max(0, Math.min(1, (vitals.bloodVolume - 1500) / 3500));
  // At 1.0 (5000mL): subtle vignette. At 0.0 (1500mL): heavy tunnel constriction
  const vignetteStop = Math.round(25 + bloodRatio * 55);

  // Hypovolemia desaturation and blur
  const desaturation = Math.round((1 - bloodRatio) * 85);
  const blurAmount = vitals.bloodPressureSystolic < 85 ? (85 - vitals.bloodPressureSystolic) * 0.12 : 0;

  const currentDate = new Date().toISOString().slice(0, 10);
  const currentTime = new Date().toISOString().slice(11, 19);

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-20"
      style={{
        filter: `grayscale(${desaturation}%) blur(${blurAmount}px)`,
      }}
    >
      {/* Dynamic Tunnel Vision Vignette based on Blood Volume Loss */}
      <div
        className="absolute inset-0 transition-all duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, transparent ${vignetteStop}%, rgba(0, 0, 0, 0.96) ${Math.max(vignetteStop + 20, 95)}%)`,
        }}
      />

      {/* Bodycam Lens Distortion & CRT Scanlines */}
      <div className="absolute inset-0 bodycam-crt-scanline opacity-75 pointer-events-none" />

      {/* Bodycam Optical Watermark / Telemetry Timestamp Header */}
      <div className="absolute top-4 left-6 flex flex-col gap-0.5 text-xs font-mono tracking-wider text-slate-300 drop-shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
          <span className="font-bold text-red-500">REC</span>
          <span className="text-slate-400">·</span>
          <span>AXON BODY 3</span>
          <span className="text-slate-400">·</span>
          <span className="text-amber-400">{operatorCallsign}</span>
        </div>
        <div className="text-[11px] text-slate-400">
          <span>{currentDate} {currentTime}Z</span>
          <span className="mx-1.5">·</span>
          <span>34°22'09"N 69°11'44"E</span>
        </div>
      </div>

      {/* Diegetic Radio Squad Barks Banner (Simulated tactical comms receiver) */}
      {lastSquadBark && (
        <div className="absolute top-4 right-6 max-w-sm pointer-events-none animate-fadeIn">
          <div className="bg-black/60 border border-slate-700/60 px-3 py-1.5 backdrop-blur-sm text-xs font-mono text-amber-300">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider block">SQUAD COMMS // CH-1</span>
            "{lastSquadBark}"
          </div>
        </div>
      )}

      {/* Physical Magazine Inspection Feedback Overlay */}
      {weapon.isInspectingMag && weapon.magCheckInspectionText && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-black/80 border border-slate-600/80 px-4 py-2 rounded text-center backdrop-blur-md animate-scaleUp">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-widest block">TACTILE MAG CHECK</span>
          <span className="text-sm font-bold font-mono text-slate-100">{weapon.magCheckInspectionText}</span>
        </div>
      )}

      {/* Body Inspection Indicator */}
      {isInspectingBody && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/70 border border-amber-500/40 px-3 py-1 rounded text-center backdrop-blur-sm">
          <span className="text-xs font-mono text-amber-300">INSPECTING FIELD BODY & VEST</span>
        </div>
      )}

      {/* Physical Topographic Combat Paper Map Modal */}
      {isMapOpen && (
        <div className="absolute inset-0 pointer-events-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="relative max-w-2xl w-full bg-stone-900 border border-stone-700 p-4 shadow-2xl rounded-sm">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-amber-500 uppercase tracking-wider">SECTOR GRID 44-B // TOPOGRAPHIC MAP</span>
              </div>
              <button
                onClick={onCloseMap}
                className="px-3 py-1 text-xs font-mono bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 transition-colors"
              >
                STOW MAP [M]
              </button>
            </div>

            <div className="relative mt-3 aspect-[4/3] bg-stone-950 border border-stone-800 overflow-hidden flex items-center justify-center">
              <img
                src="/src/assets/images/tactical_topo_map_1790567901436.jpg"
                alt="Tactical Topographic Map"
                className="w-full h-full object-cover opacity-90 contrast-125"
                referrerPolicy="no-referrer"
              />
              {/* Tactical overlay markers */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-black/75 px-2.5 py-1 border border-amber-500 text-[11px] font-mono text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>OPERATING COMPOUND (OBJ FALCON)</span>
              </div>

              <div className="absolute bottom-3 left-3 bg-black/80 px-2 py-1 border border-stone-700 text-[10px] font-mono text-stone-300">
                <span>ELEVATION: 1,820m · GRID 34S 482 192</span>
              </div>
            </div>

            <p className="mt-2 text-xs font-mono text-stone-400 text-center">
              No GPS beacon on paper maps. Navigate by compound blast walls and observation tower landmarks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
