import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseClient } from './firebaseClient';
import { MedicalCase, UserProfile, AuditLog } from '../types';

export interface BackendCaseInput extends Omit<MedicalCase, 'id' | 'createdAt' | 'updatedAt'> {}

export const secureBackend = {
  isAvailable: () => Boolean(getFirebaseClient()),

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
    const snapshot = await getDoc(doc(client.db, 'profiles', uid));
    return snapshot.exists() ? snapshot.data() as UserProfile : null;
  },

  saveProfile: async (profile: UserProfile) => {
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
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
