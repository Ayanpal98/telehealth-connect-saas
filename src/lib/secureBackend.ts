import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseClient } from './firebaseClient';
import { MedicalCase, UserProfile, AuditLog } from '../types';

export interface BackendCaseInput extends Omit<MedicalCase, 'id' | 'createdAt' | 'updatedAt'> {}

export const secureBackend = {
  isAvailable: () => Boolean(getFirebaseClient()),

  registerPatient: async (email: string, password: string, displayName: string) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    const credential = await createUserWithEmailAndPassword(client.auth, email.trim().toLowerCase(), password);
    await setDoc(doc(client.db, 'profiles', credential.user.uid), {
      uid: credential.user.uid,
      email: credential.user.email || email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role: 'patient',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return credential.user;
  },

  submitClinicianApplication: async (application: {
    fullName: string;
    email: string;
    phone: string;
    specialty: string;
    registrationNumber: string;
    locality: string;
    consultationModes: string[];
    qualifications: string;
    experience: string;
  }) => {
    const client = getFirebaseClient();
    if (!client?.auth.currentUser) throw new Error('Please create your clinician application account first.');
    const uid = client.auth.currentUser.uid;
    await setDoc(doc(client.db, 'clinicianApplications', uid), {
      ...application,
      uid,
      email: client.auth.currentUser.email || application.email.trim().toLowerCase(),
      status: 'pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return uid;
  },

  signIn: async (email: string, password: string) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    return signInWithEmailAndPassword(client.auth, email, password);
  },

  signOut: async () => {
    const client = getFirebaseClient();
    if (client) await signOut(client.auth);
  },

  getProfile: async (uid: string): Promise<UserProfile | null> => {
    const client = getFirebaseClient();
    if (!client) return null;
    if (client.auth.currentUser && client.auth.currentUser.uid !== uid) {
      throw new Error('You are not authorized to access this profile.');
    }
    const snapshot = await getDoc(doc(client.db, 'profiles', uid));
    return snapshot.exists() ? snapshot.data() as UserProfile : null;
  },

  saveProfile: async (profile: UserProfile) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    if (!client.auth.currentUser || client.auth.currentUser.uid !== profile.uid) {
      throw new Error('You are not authorized to update this profile.');
    }
    await setDoc(doc(client.db, 'profiles', profile.uid), {
      ...profile,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  createCase: async (medicalCase: BackendCaseInput) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    const ref = doc(collection(client.db, 'cases'));
    let imageUrl = medicalCase.imageUrl;
    if (imageUrl?.startsWith('data:')) {
      const imageRef = storageRef(client.storage, `case-uploads/${client.auth.currentUser?.uid || 'unknown'}/${ref.id}`);
      await uploadString(imageRef, imageUrl, 'data_url', { contentType: imageUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg' });
      imageUrl = await getDownloadURL(imageRef);
    }

    await setDoc(ref, {
      ...medicalCase,
      imageUrl,
      id: ref.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const actorUid = client.auth.currentUser?.uid;
    if (actorUid) {
      await secureBackend.writeAuditLog({
        caseId: ref.id,
        action: 'case.created',
        performedBy: actorUid,
      });
    }
    return ref.id;
  },

  subscribeToPatientCases: (patientId: string, callback: (cases: MedicalCase[]) => void) => {
    const client = getFirebaseClient();
    if (!client) return () => {};
    const q = query(
      collection(client.db, 'cases'),
      where('patientId', '==', patientId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snapshot => {
      callback(snapshot.docs.map(item => item.data() as MedicalCase));
    });
  },

  subscribeToAssignedCases: (consultantId: string, callback: (cases: MedicalCase[]) => void) => {
    const client = getFirebaseClient();
    if (!client) return () => {};
    const q = query(
      collection(client.db, 'cases'),
      where('assignedConsultantId', '==', consultantId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snapshot => {
      callback(snapshot.docs.map(item => item.data() as MedicalCase));
    });
  },

  updateCase: async (caseId: string, updates: Partial<MedicalCase>) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    await updateDoc(doc(client.db, 'cases', caseId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    const actorUid = client.auth.currentUser?.uid;
    if (actorUid) {
      await secureBackend.writeAuditLog({
        caseId,
        action: updates.status ? `case.updated.status.${updates.status}` : 'case.updated',
        performedBy: actorUid,
      });
    }
  },

  writeAuditLog: async (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    const ref = doc(collection(client.db, 'auditLogs'));
    await setDoc(ref, { ...log, id: ref.id, timestamp: serverTimestamp() });
  },
};
