import React from 'react';

interface PauseMenuModalProps {
  isOpen: boolean;
  onResume: () => void;
  onOpenScoreboard: () => void;
  onOpenMap: () => void;
  onOpenRoster: () => void;
  onCallCasevac: () => void;
  onRestartMission: () => void;
  godMode: boolean;
  onToggleGodMode: () => void;
}

export const PauseMenuModal: React.FC<PauseMenuModalProps> = ({
  isOpen,
  onResume,
  onOpenScoreboard,
  onOpenMap,
  onOpenRoster,
  onCallCasevac,
  onRestartMission,
  godMode,
  onToggleGodMode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 p-6 rounded-sm font-mono text-slate-100 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="border-b border-slate-800 pb-3 text-center">
          <span className="text-xs uppercase font-bold tracking-widest text-sky-400 block">
            SIMULATION SUSPENDED
          </span>
          <h2 className="text-xl font-bold tracking-wide mt-1">TACTICAL PAUSE MENU</h2>
        </div>

        {/* Buttons List */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={onResume}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded transition-colors cursor-pointer"
          >
            Resume Engagement [ESC]
          </button>

          <button
            onClick={() => {
              onResume();
              onOpenScoreboard();
            }}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-between px-4"
          >
            <span>Team Scoreboard & Kills</span>
            <span className="text-[10px] text-slate-400">[TAB]</span>
          </button>

          <button
            onClick={() => {
              onResume();
              onOpenMap();
            }}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-between px-4"
          >
            <span>Topographic Sector Map</span>
            <span className="text-[10px] text-slate-400">[M]</span>
          </button>

          <button
            onClick={onToggleGodMode}
            className={`w-full py-2 border text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-between px-4 ${
              godMode
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            <span>God Mode (Invincibility)</span>
            <span className="text-[10px] font-bold">{godMode ? 'ACTIVE [G]' : 'INACTIVE [G]'}</span>
          </button>

          <button
            onClick={() => {
              onResume();
              onOpenRoster();
            }}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-between px-4"
          >
            <span>Personnel Roster & Archives</span>
            <span className="text-[10px] text-slate-400">[P]</span>
          </button>

          <button
            onClick={() => {
              onResume();
              onCallCasevac();
            }}
            className="w-full py-2 bg-red-950/60 hover:bg-red-900/70 border border-red-800 text-red-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-between px-4"
          >
            <span>Emergency AI CASEVAC Extraction</span>
            <span className="text-[10px] text-red-400">[9]</span>
          </button>

          <button
            onClick={() => {
              onResume();
              onRestartMission();
            }}
            className="w-full py-2 bg-slate-950 hover:bg-stone-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer mt-2"
          >
            Restart Sector Engagement
          </button>
        </div>

        <p className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-800">
          All physiological hemodynamics and ballistics remain frozen while menu is active.
        </p>
      </div>
    </div>
  );
};
