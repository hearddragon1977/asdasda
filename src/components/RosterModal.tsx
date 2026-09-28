import React from 'react';
import { OperatorRecord } from '../types/game';
import { rosterManager } from '../game/rosterSystem';
import { useAuth } from '../firebase/AuthContext';
import { CasualtyReportRecord } from '../firebase/firestoreService';

interface RosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: OperatorRecord;
  cloudCasualtyReports?: CasualtyReportRecord[];
  onEnlistNewRecruit?: () => void;
}

export const RosterModal: React.FC<RosterModalProps> = ({
  isOpen,
  onClose,
  activeOperator,
  cloudCasualtyReports = [],
  onEnlistNewRecruit,
}) => {
  const { user, signInWithGoogle, signOutUser } = useAuth();

  if (!isOpen) return null;

  const memorialList = rosterManager.memorialRoster;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative max-w-3xl w-full bg-stone-900 border border-stone-700 p-6 font-mono text-stone-200 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div>
            <span className="text-xs uppercase text-amber-500 tracking-wider block font-bold">
              PERSONNEL ROSTER & CASUALTY RECORDS
            </span>
            <span className="text-sm text-stone-400">Tactical Operator Service Records</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs border border-stone-600 transition-colors"
          >
            CLOSE [ESC]
          </button>
        </div>

        {/* Firebase Cloud Sync Banner */}
        <div className="bg-stone-950 p-3 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-stone-300">
              {user ? `Firebase Cloud Synced: ${user.email}` : 'Local Tactical Dossier (Unsaved to Cloud)'}
            </span>
          </div>
          {user ? (
            <button
              onClick={() => signOutUser()}
              className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[11px] text-stone-400 hover:text-stone-200"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-[11px] transition-colors"
            >
              Sign In with Google to Sync Roster
            </button>
          )}
        </div>

        {/* Active Operator Card */}
        <div className="bg-stone-950 p-4 border border-amber-600/60 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-amber-500 font-bold tracking-widest">
              ACTIVE FIELD OPERATOR
            </span>
            <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5">
              DEPLOYED IN COMBAT
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
            <div>
              <h3 className="text-lg font-bold text-stone-100">
                {activeOperator.rank} {activeOperator.name}
              </h3>
              <span className="text-xs text-amber-400">Callsign: "{activeOperator.callsign}"</span>
              <p className="text-xs text-stone-400">{activeOperator.unit}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-stone-900/80 p-2.5 border border-stone-800">
              <div>
                <span className="text-[10px] text-stone-500 block uppercase">Blood Group</span>
                <span className="text-stone-200 font-bold">{activeOperator.bloodType}</span>
              </div>
              <div>
                <span className="text-[10px] text-stone-500 block uppercase">Deployments</span>
                <span className="text-stone-200 font-bold">{activeOperator.deployments} tours</span>
              </div>
              <div>
                <span className="text-[10px] text-stone-500 block uppercase">Hostiles Neutralized</span>
                <span className="text-stone-200 font-bold">{activeOperator.hostilesEliminated}</span>
              </div>
              <div>
                <span className="text-[10px] text-stone-500 block uppercase">Status</span>
                <span className="text-emerald-400 font-bold uppercase">{activeOperator.status}</span>
              </div>
            </div>
          </div>

          {onEnlistNewRecruit && (
            <div className="mt-2 pt-2 border-t border-stone-800 flex justify-end">
              <button
                onClick={onEnlistNewRecruit}
                className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs border border-stone-600 transition-colors"
              >
                + Enlist Replacement Recruit
              </button>
            </div>
          )}
        </div>

        {/* Casualty / Medical Discharge Memorial Roster */}
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase text-stone-400 font-bold border-b border-stone-800 pb-1">
            CASUALTY & MEDICAL DISCHARGE ARCHIVES ({memorialList.length + cloudCasualtyReports.length})
          </span>

          {memorialList.length === 0 && cloudCasualtyReports.length === 0 ? (
            <div className="p-4 bg-stone-950/50 border border-stone-800/60 text-stone-500 text-xs text-center">
              No fallen or medically retired operators in records. Current operator is first deployer.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {cloudCasualtyReports.map((rep, idx) => (
                <div
                  key={`cloud-rep-${rep.id}-${idx}`}
                  className="bg-stone-950 p-3 border border-stone-800 flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-200">
                      {rep.operatorName} ("{rep.callsign}")
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                        rep.outcome === 'dia'
                          ? 'bg-red-950/80 text-red-400 border border-red-800'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {rep.outcome === 'dia' ? 'DEAD IN ACTION (DIA)' : 'MEDICALLY DISCHARGED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400">{rep.boardFindings}</p>
                  <div className="flex items-center gap-3 text-[10px] text-stone-500 mt-0.5">
                    <span>Blood Volume: {rep.finalBloodVolume} mL</span>
                    <span>Wounds: {rep.woundsCount}</span>
                    <span>Date: {new Date(rep.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}

              {memorialList.map((rec, idx) => (
                <div
                  key={`local-rec-${rec.id}-${idx}`}
                  className="bg-stone-950 p-3 border border-stone-800 flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-200">
                      {rec.rank} {rec.name} ("{rec.callsign}")
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                        rec.status === 'dia'
                          ? 'bg-red-950/80 text-red-400 border border-red-800'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {rec.status === 'dia' ? 'DEAD IN ACTION (DIA)' : 'MEDICALLY DISCHARGED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400">{rec.dischargeReason}</p>
                  <div className="flex items-center gap-3 text-[10px] text-stone-500 mt-0.5">
                    <span>Date: {rec.timestamp}</span>
                    <span>Blood: {rec.bloodType}</span>
                    {rec.purpleHeartAwarded && <span className="text-purple-400 font-bold">★ Purple Heart Recipient</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
