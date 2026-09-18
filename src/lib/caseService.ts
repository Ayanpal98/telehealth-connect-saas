import { MedicalCase, UserProfile } from '../types';
import { secureBackend, BackendCaseInput } from './secureBackend';
import { mockDb } from './mockDb';

export const caseService = {
  subscribeToCases: (user: UserProfile, callback: (cases: MedicalCase[]) => void) => {
    if (!secureBackend.isAvailable()) return mockDb.subscribeToCases(callback);
    if (user.role === 'patient') {
      return secureBackend.subscribeToPatientCases(user.uid, callback);
    }
    if (user.role === 'clinician') {
      return secureBackend.subscribeToAssignedCases(user.uid, callback);
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
