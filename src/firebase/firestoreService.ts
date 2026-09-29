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
            name: d.name,
            callsign: d.callsign,
            rank: d.rank,
            unit: d.unit,
            bloodType: d.bloodType,
            status: d.status,
            deployments: d.deployments,
            hostilesEliminated: d.hostilesEliminated,
            injuriesSustained: d.injuriesSustained || [],
            dischargeReason: d.dischargeReason,
            purpleHeartAwarded: Boolean(d.purpleHeartAwarded),
            timestamp: d.createdAt,
          };
        });
        onUpdate(ops);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
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
      operatorName: report.operatorName.slice(0, 100),
      callsign: report.callsign.slice(0, 60),
      outcome: report.outcome,
      finalBloodVolume: Math.max(0, Math.min(5000, Math.round(report.finalBloodVolume))),
      woundsCount: Math.max(0, report.woundsCount),
      woundsSummary: (report.woundsSummary || []).slice(0, 20),
      boardFindings: report.boardFindings.slice(0, 1000),
      createdAt: report.createdAt || new Date().toISOString(),
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
            userId: d.userId,
            operatorName: d.operatorName,
            callsign: d.callsign,
            outcome: d.outcome,
            finalBloodVolume: d.finalBloodVolume,
            woundsCount: d.woundsCount,
            woundsSummary: d.woundsSummary || [],
            boardFindings: d.boardFindings,
            createdAt: d.createdAt,
          };
        });
        onUpdate(reports);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}
