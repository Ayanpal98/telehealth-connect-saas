import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { MedicalCase, UserProfile } from '../types';
import { secureBackend, BackendCaseInput } from './secureBackend';
import { mockDb } from './mockDb';
import { getFirebaseClient } from './firebaseClient';

export const caseService = {
  subscribeToCases: (user: UserProfile, callback: (cases: MedicalCase[]) => void) => {
    if (!secureBackend.isAvailable()) return mockDb.subscribeToCases(callback);

    if (user.role === 'patient') {
      return secureBackend.subscribeToPatientCases(user.uid, callback);
    }

    if (user.role === 'clinician') {
      const client = getFirebaseClient();
      if (!client) return () => {};

      const assignmentsQuery = query(
        collection(client.db, 'caseAssignments'),
        where('clinicianId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const notificationsQuery = query(
        collection(client.db, 'clinicianNotifications'),
        where('clinicianId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      let assignmentReady = false;
      let notificationReady = false;
      let assignmentUnsubscribe: (() => void) | undefined;
      let notificationUnsubscribe: (() => void) | undefined;

      const emitCases = async (assignmentSnapshot: any) => {
        try {
          const caseSnapshots = await getDocs(
            query(
              collection(client.db, 'cases'),
              where('assignedConsultantId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(50)
            )
          );

          const primaryCases = caseSnapshots.docs.map(item => item.data() as MedicalCase);
          const assignedCaseIds = new Set(primaryCases.map(item => item.id));

          const routedCases = await Promise.all(
            assignmentSnapshot.docs.map(async (assignmentDoc: any) => {
              const assignment = assignmentDoc.data();
              if (assignedCaseIds.has(assignment.caseId)) return null;

              const caseSnapshot = await getDoc(doc(client.db, 'cases', assignment.caseId));
              return caseSnapshot.exists()
                ? caseSnapshot.data() as MedicalCase
                : null;
            })
          );

          const merged = [
            ...primaryCases,
            ...routedCases.filter(Boolean) as MedicalCase[]
          ];

          const unique = Array.from(
            new Map(merged.map(item => [item.id, item])).values()
          );

          unique.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
            const bTime = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
          });

          callback(unique);
        } catch (error) {
          console.error('Real-time clinician case subscription failed', error);
          callback([]);
        }
      };

      assignmentUnsubscribe = onSnapshot(assignmentsQuery, snapshot => {
        assignmentReady = true;
        void emitCases(snapshot);
      });

      notificationUnsubscribe = onSnapshot(notificationsQuery, snapshot => {
        if (!notificationReady) {
          notificationReady = true;
          return;
        }

        snapshot.docChanges()
          .filter(change => change.type === 'added')
          .forEach(change => {
            const notification = change.doc.data();

            window.dispatchEvent(new CustomEvent('clinova:consultation-notification', {
              detail: {
                caseId: notification.caseId,
                title: notification.title || 'New consultation request',
                message: notification.message || 'A new consultation request is available.',
                urgency: notification.urgency || 'routine'
              }
            }));

            if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              new Notification(notification.title || 'New consultation request', {
                body: notification.message || 'A new consultation request is available.',
                tag: notification.caseId || change.doc.id
              });
            }
          });
      });

      return () => {
        if (assignmentReady) assignmentUnsubscribe?.();
        if (notificationReady) notificationUnsubscribe?.();
      };
    }

    return () => {};
  },

  createCase: async (medicalCase: BackendCaseInput) => {
    if (!secureBackend.isAvailable()) {
      return mockDb.saveCase(medicalCase);
    }
    return secureBackend.createCase(medicalCase);
  },

  updateCase: async (caseId: string, updates: Partial<MedicalCase>) => {
    if (!secureBackend.isAvailable()) {
      mockDb.updateCase(caseId, updates);
      return;
    }
    await secureBackend.updateCase(caseId, updates);
  }
};
