import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config';
import { OperatorRecord } from '../types/game';

export interface CasualtyReportRecord {
  id: string;
  userId: string;
  operatorName: string;
  callsign: string;
  outcome: 'extracted_active' | 'extracted_discharged' | 'dia';
  finalBloodVolume: number;
  woundsCount: number;
  woundsSummary: string[];
  boardFindings: string;
  createdAt: string;
}

export async function saveOperatorToFirestore(operator: OperatorRecord, userId: string): Promise<void> {
  const path = `operators/${operator.id}`;
  try {
    const docRef = doc(db, 'operators', operator.id);
    await setDoc(docRef, {
      userId,
      name: operator.name.slice(0, 100),
      callsign: operator.callsign.slice(0, 60),
      rank: operator.rank.slice(0, 60),
      unit: operator.unit.slice(0, 150),
      bloodType: operator.bloodType.slice(0, 10),
      status: operator.status,
      deployments: Math.max(0, operator.deployments),
      hostilesEliminated: Math.max(0, operator.hostilesEliminated),
      injuriesSustained: (operator.injuriesSustained || []).slice(0, 20),
      dischargeReason: (operator.dischargeReason || '').slice(0, 500),
      purpleHeartAwarded: Boolean(operator.purpleHeartAwarded),
      createdAt: operator.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateOperatorInFirestore(operator: OperatorRecord, userId: string): Promise<void> {
  const path = `operators/${operator.id}`;
  try {
    const docRef = doc(db, 'operators', operator.id);
    await updateDoc(docRef, {
      userId,
      name: operator.name.slice(0, 100),
      callsign: operator.callsign.slice(0, 60),
      rank: operator.rank.slice(0, 60),
      unit: operator.unit.slice(0, 150),
      bloodType: operator.bloodType.slice(0, 10),
      status: operator.status,
      deployments: Math.max(0, operator.deployments),
      hostilesEliminated: Math.max(0, operator.hostilesEliminated),
      injuriesSustained: (operator.injuriesSustained || []).slice(0, 20),
      dischargeReason: (operator.dischargeReason || '').slice(0, 500),
      purpleHeartAwarded: Boolean(operator.purpleHeartAwarded),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeToUserOperators(
  userId: string,
  onUpdate: (operators: OperatorRecord[]) => void
): Unsubscribe {
  const path = 'operators';
  try {
    const q = query(collection(db, 'operators'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snapshot) => {
        const ops: OperatorRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name: asString(d.name, 'Unknown Operator'),
            callsign: asString(d.callsign, 'Unknown'),
            rank: asString(d.rank, 'Operator'),
            unit: asString(d.unit, 'Unassigned'),
            bloodType: (asString(d.bloodType, 'O+') as OperatorRecord['bloodType']),
            status: (asString(d.status, 'active') as OperatorRecord['status']),
            deployments: asNumber(d.deployments),
            hostilesEliminated: asNumber(d.hostilesEliminated),
            injuriesSustained: Array.isArray(d.injuriesSustained) ? d.injuriesSustained.filter((item) => typeof item === 'string') : [],
            dischargeReason: asString(d.dischargeReason),
            purpleHeartAwarded: Boolean(d.purpleHeartAwarded),
            timestamp: asString(d.createdAt),
          };
        });
        onUpdate(ops);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch {
          // Snapshot listeners must not surface a second exception.
        }
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function saveCasualtyReportToFirestore(
  report: CasualtyReportRecord,
  userId: string
): Promise<void> {
  const path = `casualty_reports/${report.id}`;
  try {
    const docRef = doc(db, 'casualty_reports', report.id);
    await setDoc(docRef, {
      userId,
      operatorName: asString(report?.operatorName).slice(0, 100),
      callsign: asString(report?.callsign).slice(0, 60),
      outcome: report?.outcome ?? 'dia',
      finalBloodVolume: Math.max(0, Math.min(5000, Math.round(asNumber(report?.finalBloodVolume)))),
      woundsCount: Math.max(0, asNumber(report?.woundsCount)),
      woundsSummary: (report?.woundsSummary || []).filter((item) => typeof item === 'string').slice(0, 20),
      boardFindings: asString(report?.boardFindings).slice(0, 1000),
      createdAt: asString(report?.createdAt, new Date().toISOString()),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeToCasualtyReports(
  userId: string,
  onUpdate: (reports: CasualtyReportRecord[]) => void
): Unsubscribe {
  const path = 'casualty_reports';
  try {
    const q = query(collection(db, 'casualty_reports'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snapshot) => {
        const reports: CasualtyReportRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: asString(d.userId),
            operatorName: asString(d.operatorName, 'Unknown Operator'),
            callsign: asString(d.callsign, 'Unknown'),
            outcome: (asString(d.outcome, 'dia') as CasualtyReportRecord['outcome']),
            finalBloodVolume: asNumber(d.finalBloodVolume),
            woundsCount: asNumber(d.woundsCount),
            woundsSummary: Array.isArray(d.woundsSummary) ? d.woundsSummary.filter((item) => typeof item === 'string') : [],
            boardFindings: asString(d.boardFindings),
            createdAt: asString(d.createdAt),
          };
        });
        onUpdate(reports);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch {
          // Snapshot listeners must not surface a second exception.
        }
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}
