import React from 'react';
import { EnemyCombatant, FriendlyCombatant, OperatorRecord } from '../types/game';

interface ScoreboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: OperatorRecord;
  playerKills: number;
  playerDeaths: number;
  isPlayerAlive: boolean;
  friendlies: FriendlyCombatant[];
  enemies: EnemyCombatant[];
  currentWave: number;
  killFeed: string[];
  equippedWeaponName?: string;
}

export const ScoreboardModal: React.FC<ScoreboardModalProps> = ({
  isOpen,
  onClose,
  activeOperator,
  playerKills,
  playerDeaths,
  isPlayerAlive,
  friendlies,
  enemies,
  currentWave,
  killFeed,
  equippedWeaponName = 'Unarmed',
}) => {
  if (!isOpen) return null;

  // Real Bluefor team score: Player kills + Friendly AI kills
  const friendlyKillsTotal = friendlies.reduce((acc, f) => acc + f.kills, 0);
  const blueforTotalScore = playerKills + friendlyKillsTotal;

  // Real OPFOR score: Total kills scored by live enemies
  const opforTotalScore = enemies.reduce((acc, e) => acc + e.kills, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-sm shadow-2xl p-6 font-mono text-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-sky-400 block">
              LIVE SECTOR ENGAGEMENT SCOREBOARD // WAVE {currentWave}
            </span>
            <span className="text-sm text-slate-300">
              Joint Special Operations Task Force vs. Insurgent Network
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-600 rounded transition-colors cursor-pointer"
          >
            CLOSE [ESC]
          </button>
        </div>

        {/* Live Team Score Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-sky-950/40 border border-sky-800/80 p-3 rounded flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-sky-400 block">
                TASK FORCE ALPHA (BLUEFOR)
              </span>
              <span className="text-xs text-slate-300">{activeOperator.unit}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase">CONFIRMED KILLS</span>
              <span className="text-2xl font-bold text-sky-400">{blueforTotalScore}</span>
            </div>
          </div>

          <div className="bg-red-950/40 border border-red-800/80 p-3 rounded flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase text-red-400 block">
                OPFOR NETWORK (RED) - WAVE {currentWave}
              </span>
              <span className="text-xs text-slate-300">Hostile Insurgent Sector Cell</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase">HOSTILE KILLS</span>
              <span className="text-2xl font-bold text-red-400">{opforTotalScore}</span>
            </div>
          </div>
        </div>

        {/* BLUEFOR Roster Table (Real live entities) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>TEAM 1: TASK FORCE ALPHA (BLUEFOR)</span>
            <span className="text-[11px] text-slate-400">
              {friendlies.filter((f) => f.status === 'ALIVE').length + (isPlayerAlive ? 1 : 0)} / 5 Combatants Active
            </span>
          </span>

          <div className="bg-slate-950 rounded border border-slate-800 overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-900/90 p-2 font-bold text-slate-400 text-[11px] border-b border-slate-800">
              <div className="col-span-5">OPERATOR & CALLSIGN</div>
              <div className="col-span-3">ROLE</div>
              <div className="col-span-1 text-center">K</div>
              <div className="col-span-1 text-center">D</div>
              <div className="col-span-2 text-right">STATUS</div>
            </div>

            {/* Real Player Entry */}
            <div className="grid grid-cols-12 p-2.5 items-center border-b border-slate-800/60 bg-sky-950/30 font-bold text-sky-200">
              <div className="col-span-5 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isPlayerAlive ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                <span>{activeOperator.rank} {activeOperator.name}</span>
                <span className="text-[11px] text-sky-400">"{activeOperator.callsign}" (YOU)</span>
              </div>
              <div className="col-span-3 text-slate-300 text-[11px]">
                Point Man / Operator ({equippedWeaponName})
              </div>
              <div className="col-span-1 text-center font-bold text-emerald-400">{playerKills}</div>
              <div className="col-span-1 text-center text-slate-400">{playerDeaths}</div>
              <div className="col-span-2 text-right">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isPlayerAlive
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-red-950 text-red-400 border border-red-800'
                  }`}
                >
                  {isPlayerAlive ? 'ALIVE' : 'KIA'}
                </span>
              </div>
            </div>

            {/* Real Friendly AI Squadmates */}
            {friendlies.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-12 p-2.5 items-center border-b border-slate-800/40 text-slate-300"
              >
                <div className="col-span-5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${f.status === 'ALIVE' ? 'bg-sky-400' : f.status === 'WIA' ? 'bg-amber-400' : 'bg-red-600'}`} />
                  <span>{f.name}</span>
                  <span className="text-[11px] text-sky-400">"{f.callsign}"</span>
                </div>
                <div className="col-span-3 text-slate-400 text-[11px]">{f.role}</div>
                <div className="col-span-1 text-center font-bold text-emerald-400">{f.kills}</div>
                <div className="col-span-1 text-center text-slate-400">{f.deaths}</div>
                <div className="col-span-2 text-right">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      f.status === 'ALIVE'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : f.status === 'WIA'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-stone-900 text-stone-500 border border-stone-800 line-through'
                    }`}
                  >
                    {f.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OPFOR Roster Table (Real live enemies in current wave) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-red-400 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>TEAM 2: OPFOR HOSTILE NETWORK (RED) - WAVE {currentWave}</span>
            <span className="text-[11px] text-slate-400">
              {enemies.filter((e) => e.health > 0).length} / {enemies.length} Combatants Alive
            </span>
          </span>

          <div className="bg-slate-950 rounded border border-slate-800 overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-900/90 p-2 font-bold text-slate-400 text-[11px] border-b border-slate-800">
              <div className="col-span-5">HOSTILE COMBATANT</div>
              <div className="col-span-3">TACTICAL ASSIGNMENT</div>
              <div className="col-span-1 text-center">K</div>
              <div className="col-span-1 text-center">D</div>
              <div className="col-span-2 text-right">STATUS</div>
            </div>

            {enemies.map((e) => {
              const isAlive = e.health > 0;
              return (
                <div
                  key={e.id}
                  className="grid grid-cols-12 p-2.5 items-center border-b border-slate-800/40 text-slate-300"
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isAlive ? 'bg-red-500' : 'bg-stone-600'}`} />
                    <span className={isAlive ? 'text-slate-200' : 'text-stone-500 line-through'}>{e.name}</span>
                    <span className="text-[11px] text-red-400">"{e.callsign}"</span>
                  </div>
                  <div className="col-span-3 text-slate-400 text-[11px]">{e.role}</div>
                  <div className="col-span-1 text-center font-bold text-red-400">{e.kills}</div>
                  <div className="col-span-1 text-center text-slate-400">{e.deaths}</div>
                  <div className="col-span-2 text-right">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isAlive
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-stone-900 text-stone-500 border border-stone-800 line-through'
                      }`}
                    >
                      {isAlive ? 'ALIVE' : 'KIA'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Combat Event Feed */}
        {killFeed.length > 0 && (
          <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex flex-col gap-1 text-[11px]">
            <span className="text-slate-400 font-bold uppercase text-[10px]">LIVE TACTICAL COMBAT LOG</span>
            <div className="flex flex-col gap-0.5 text-slate-300">
              {killFeed.slice(-4).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-amber-400">⚡</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
