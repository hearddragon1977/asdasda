import React from 'react';
import { CasevacState, OperatorRecord, PlayerVitals } from '../types/game';

interface CasevacSequenceProps {
  casevac: CasevacState;
  vitals: PlayerVitals;
  operator: OperatorRecord;
  onCallCasevac: () => void;
  onConfirmCasualtyOutcome: () => void;
}

export const CasevacSequence: React.FC<CasevacSequenceProps> = ({
  casevac,
  vitals,
  operator,
  onCallCasevac,
  onConfirmCasualtyOutcome,
}) => {
  const isParalyzedOrCritical =
    vitals.paralyzed || vitals.shockStage === 'decompensated' || vitals.shockStage === 'irreversible';

  if (casevac.status === 'idle') {
    return (
      <div className="absolute top-16 right-4 z-30">
        <button
          onClick={onCallCasevac}
          className={`px-3 py-2 text-xs font-mono border transition-all flex items-center gap-2 cursor-pointer shadow-lg backdrop-blur-md ${
            isParalyzedOrCritical
              ? 'bg-red-950/90 border-red-600 text-red-200 animate-pulse hover:bg-red-900'
              : 'bg-slate-950/80 border-slate-700 hover:border-slate-500 text-slate-300'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>CALL MEDEVAC (9-LINE) [9]</span>
        </button>
      </div>
    );
  }

  // Active CASEVAC Extraction in progress
  if (
    casevac.status === 'calling' ||
    casevac.status === 'inbound' ||
    casevac.status === 'arrived' ||
    casevac.status === 'treating' ||
    casevac.status === 'extracting'
  ) {
    return (
      <div className="absolute top-16 right-4 max-w-sm w-full bg-slate-950/95 border border-amber-600/80 p-3.5 z-30 font-mono text-xs shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <span className="font-bold text-amber-400 uppercase">TACTICAL MEDEVAC INBOUND</span>
          </div>
          <span className="text-slate-400 font-bold">{Math.round(casevac.progress)}%</span>
        </div>

        <p className="text-slate-300 text-[11px] mb-2 leading-relaxed">{casevac.message}</p>

        {/* Extraction Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3">
          <div
            className="bg-amber-500 h-full transition-all duration-300"
            style={{ width: `${casevac.progress}%` }}
          />
        </div>

        {/* Triage Protocol Notice */}
        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-[10px] text-slate-400 flex flex-col gap-0.5">
          <span className="font-bold text-sky-400 uppercase">TRIAGE PROTOCOL ENFORCED:</span>
          <span>Only WIA & KIA casualties are loaded. Healthy uninjured operators remain on perimeter defense.</span>
        </div>
      </div>
    );
  }

  // Outcome Resolution (Casualty Disposition Report)
  if (casevac.status === 'extracted' || casevac.status === 'dia') {
    const isPlayerDia = casevac.status === 'dia' || vitals.shockStage === 'cardiac_arrest';
    const evacuated = casevac.evacuatedCasualties || [];
    const retained = casevac.retainedSecurity || [];

    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 select-none">
        <div className="relative max-w-xl w-full bg-slate-950 border border-slate-700 p-6 font-mono text-slate-200 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-slate-800 pb-3">
            <span className="text-xs uppercase text-amber-500 tracking-wider block font-bold">
              ROLE 3 SURGICAL CASUALTY EVACUATION REPORT // DUSTOFF-4
            </span>
            <h2 className={`text-xl font-bold mt-1 ${isPlayerDia ? 'text-red-500' : 'text-emerald-400'}`}>
              {isPlayerDia
                ? 'CASUALTY STATUS: DEAD IN ACTION (KIA)'
                : evacuated.some((c) => c.id === 'player')
                ? 'WOUNDED CASUALTIES EXTRACTED TO FIELD HOSPITAL'
                : 'MISSION CONTINUES: NO CASUALTIES EVACUATED'}
            </h2>
          </div>

          {/* EVACUATED CASUALTIES LIST (WOUNDED OR DEAD ONLY) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase text-red-400 flex items-center gap-2">
              <span>EVACUATED CASUALTIES (WIA / KIA ONLY)</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-red-950 border border-red-800 rounded">
                {evacuated.length} Loaded on Helo
              </span>
            </span>

            {evacuated.length === 0 ? (
              <div className="p-3 bg-slate-900/60 rounded border border-slate-800 text-xs text-slate-400">
                No wounded or deceased personnel identified. All squad members remain combat-effective. Evacuation aborted; bird returned to base.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {evacuated.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 bg-red-950/20 border border-red-900/60 rounded flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.status === 'KIA'
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {c.status}
                        </span>
                        <span className="font-bold text-slate-200">
                          {c.name} ("{c.callsign}")
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{c.injurySummary}</span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-400">ROLE 3 SURGERY</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RETAINED UNINJURED SECURITY SQUADMATES */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-2">
              <span>RETAINED ON PERIMETER (HEALTHY OPERATORS)</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 rounded">
                {retained.length} Holding Line
              </span>
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {retained.map((r) => (
                <div
                  key={r.id}
                  className="p-2 bg-slate-900/60 border border-slate-800 rounded flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-slate-200 block">{r.callsign}</span>
                    <span className="text-[10px] text-slate-500">{r.role}</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-[10px]">100% COMBAT READY</span>
                </div>
              ))}
            </div>
          </div>

          {/* Medical Consequences / Next Action */}
          <div className="text-xs text-slate-300 bg-slate-900/60 p-3 border border-slate-800 rounded mt-1">
            <span className="text-amber-400 font-bold uppercase text-[10px] block mb-1">
              DISPOSITION INSTRUCTIONS
            </span>
            {isPlayerDia ? (
              <p>
                Operator succumbed to catastrophic hypovolemic exsanguination. Body evacuated for dignified transfer. Deploy the next recruit from the roster to continue operations.
              </p>
            ) : vitals.paralyzed ? (
              <p className="text-amber-200">
                Thoracic vertebral transection resulting in permanent paraplegia. Casualty awarded Purple Heart and granted Honorable Medical Discharge.
              </p>
            ) : evacuated.some((c) => c.id === 'player') ? (
              <p>
                Operator sustained significant ballistic trauma and was evacuated for vascular surgical repair. Wounded personnel resting at combat hospital.
              </p>
            ) : (
              <p>
                Operator and squad members are unharmed and holding the sector perimeter. Ready for next tactical engagement.
              </p>
            )}
          </div>

          <button
            onClick={onConfirmCasualtyOutcome}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded transition-colors cursor-pointer"
          >
            {isPlayerDia || vitals.paralyzed
              ? 'ENLIST NEXT RECRUIT FROM ROSTER'
              : 'CONFIRM TRIAGE & CONTINUE ENGAGEMENT'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
