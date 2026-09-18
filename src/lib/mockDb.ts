import { UserProfile, MedicalCase, UserRole, CaseStatus } from '../types';
import { SPECIALTIES, Specialty } from '../constants';

const STORAGE_KEYS = {
  USER: 'telehealth_current_user',
  PROFILES: 'telehealth_profiles',
  CASES: 'telehealth_cases',
};

// Internal event system for same-window updates
const caseListeners: Set<() => void> = new Set();
const notifyCaseChange = () => {
  caseListeners.forEach(l => l());
  // Standard storage event for other windows
  window.dispatchEvent(new Event('storage'));
};

// Initial mock clinicians for testing
const MOCK_CLINICIANS: UserProfile[] = [
  {
    uid: 'c1',
    email: 'dr.smith@clinova.com',
    displayName: 'Dr. Sarah Smith',
    role: 'clinician',
    specialty: 'Cardiology',
    isAvailable: true,
    verificationStatus: 'verified',
    verificationSource: 'Demo registry review',
    registrationNumber: 'DEMO-CARD-001',
    languages: ['English', 'Hindi'],
    consultationModes: ['video', 'audio', 'chat'],
    serviceRadiusKm: 50,
    locality: 'San Francisco',
    acceptingNewCases: true,
    location: { latitude: 37.7749, longitude: -122.4194 }, // San Francisco
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'c2',
    email: 'dr.jones@clinova.com',
    displayName: 'Dr. Michael Jones',
    role: 'clinician',
    specialty: 'Pediatrics',
    isAvailable: true,
    verificationStatus: 'verified',
    verificationSource: 'Demo registry review',
    registrationNumber: 'DEMO-PED-002',
    languages: ['English', 'Hindi'],
    consultationModes: ['video', 'chat'],
    serviceRadiusKm: 40,
    locality: 'Los Angeles',
    acceptingNewCases: true,
    location: { latitude: 34.0522, longitude: -118.2437 }, // Los Angeles
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'c3',
    email: 'dr.lee@clinova.com',
    displayName: 'Dr. Emily Lee',
    role: 'clinician',
    specialty: 'Dermatology',
    isAvailable: true,
    verificationStatus: 'pending',
    verificationSource: 'Demo registry review',
    registrationNumber: 'DEMO-DERM-003',
    languages: ['English'],
    consultationModes: ['video', 'audio'],
    serviceRadiusKm: 50,
    locality: 'New York',
    acceptingNewCases: true,
    location: { latitude: 40.7128, longitude: -74.0060 }, // New York
    createdAt: new Date().toISOString(),
  }
];

export const mockAuth = {
  getCurrentUser: (): UserProfile | null => {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  },
  login: (email: string, displayName: string, role: UserRole): UserProfile => {
    const profiles = mockDb.getProfiles();
    let profile = profiles.find(p => p.email === email);
    
    if (!profile) {
      profile = {
        uid: Math.random().toString(36).substring(7),
        email,
        displayName,
        role,
        createdAt: new Date().toISOString(),
      };

      // Assign random specialty and location for clinicians for demo
      if (role === 'clinician') {
        profile.specialty = SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];
        profile.isAvailable = true;
        profile.location = {
          latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
          longitude: -122.4194 + (Math.random() - 0.5) * 0.1
        };
      }
      
      mockDb.saveProfile(profile);
    }
    
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile));
    return profile;
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
  updateProfile: (updates: Partial<UserProfile>) => {
    const user = mockAuth.getCurrentUser();
    if (user) {
      const updatedUser = { ...user, ...updates };
      mockDb.saveProfile(updatedUser);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('auth-change'));
    }
  }
};

export const mockDb = {
  getProfiles: (): UserProfile[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILES);
    let profiles = data ? JSON.parse(data) : [];
    
    // Seed with mock clinicians if empty
    if (profiles.length === 0) {
      profiles = [...MOCK_CLINICIANS];
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    }
    
    return profiles;
  },
  saveProfile: (profile: UserProfile) => {
    const profiles = mockDb.getProfiles();
    const index = profiles.findIndex(p => p.uid === profile.uid);
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  },
  getCases: (): MedicalCase[] => {
    const data = localStorage.getItem(STORAGE_KEYS.CASES);
    return data ? JSON.parse(data) : [];
  },
  saveCase: (newCase: Omit<MedicalCase, 'id'>): MedicalCase => {
    const cases = mockDb.getCases();
    const caseWithId: MedicalCase = {
      ...newCase,
      id: Math.random().toString(36).substring(7),
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };
    cases.push(caseWithId);
    localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
    notifyCaseChange();
    return caseWithId;
  },
  updateCase: (caseId: string, updates: Partial<MedicalCase>) => {
    const cases = mockDb.getCases();
    const index = cases.findIndex(c => c.id === caseId);
    if (index >= 0) {
      cases[index] = { 
        ...cases[index], 
        ...updates, 
        updatedAt: new Date().toISOString() as any 
      };
      localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
      notifyCaseChange();
    }
  },
  subscribeToCases: (callback: (cases: MedicalCase[]) => void) => {
    const handler = () => {
      callback(mockDb.getCases());
    };
    
    caseListeners.add(handler);
    window.addEventListener('storage', handler);
    
    // Initial call
    handler();
    
    return () => {
      caseListeners.delete(handler);
      window.removeEventListener('storage', handler);
    };
  }
};
