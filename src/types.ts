import { Specialty } from './constants';

export type UserRole = 'patient' | 'clinician' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  specialty?: Specialty;
  isAvailable?: boolean;
  availabilityLastChanged?: string; // ISO string
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  verificationSource?: string;
  registrationNumber?: string;
  languages?: string[];
  consultationModes?: ('video' | 'audio' | 'chat' | 'in-person')[];
  serviceRadiusKm?: number;
  locality?: string;
  acceptingNewCases?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: any; // ISO string or Timestamp
}

export type CaseStatus = 'pending' | 'assigned' | 'in-progress' | 'completed';

export interface MedicalCase {
  id: string;
  patientId: string;
  patientName: string;
  symptoms: string;
  requiredSpecialty?: Specialty;
  intelligence?: import('./intelligence/types').IntelligenceResult;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  imageUrl?: string;
  status: CaseStatus;
  assignedConsultantId?: string;
  assignedConsultantName?: string;
  diagnosis?: string;
  medications?: string[];
  clinicianNotes?: string;
  treatmentPlan?: string[];
  medicalAssistanceMeasures?: string;
  consultationSteps?: {
    consulted: boolean;
    analyzed: boolean;
    updated: boolean;
  };
  createdAt: any; // ISO string or Timestamp
  updatedAt: any; // ISO string or Timestamp
}

export interface AuditLog {
  id: string;
  caseId: string;
  action: string;
  performedBy: string;
  timestamp: any; // Firestore Timestamp
}
