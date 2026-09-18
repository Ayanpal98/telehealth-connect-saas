import { UserProfile } from '../types';
import { getFirebaseClient } from './firebaseClient';
import { secureBackend } from './secureBackend';
import { mockAuth } from './mockDb';

export const authService = {
  isProductionAuthEnabled: () => secureBackend.isAvailable(),

  getCurrentUser: async (): Promise<UserProfile | null> => {
    if (!secureBackend.isAvailable()) return mockAuth.getCurrentUser();
    const client = getFirebaseClient();
    if (!client) return null;
    const user = client.auth.currentUser;
    if (!user) return null;
    return secureBackend.getProfile(user.uid);
  },

  signIn: async (email: string, password: string, displayName: string, role: 'patient' | 'clinician'): Promise<UserProfile> => {
    if (!secureBackend.isAvailable()) {
      return mockAuth.login(email, displayName, role);
    }

    const credential = await secureBackend.signIn(email, password);
    const existing = await secureBackend.getProfile(credential.user.uid);
    if (!existing) {
      throw new Error('Your account is authenticated, but no Clinova profile is provisioned yet. Ask an administrator to create your profile.');
    }

    if (existing.role !== role) {
      throw new Error(`This account is provisioned as ${existing.role}, not ${role}.`);
    }

    return existing;
  },

  signOut: async () => {
    if (!secureBackend.isAvailable()) {
      mockAuth.logout();
      return;
    }
    await secureBackend.signOut();
  },

  updateProfile: async (updates: Partial<UserProfile>) => {
    if (!secureBackend.isAvailable()) {
      mockAuth.updateProfile(updates);
      return mockAuth.getCurrentUser();
    }

    const client = getFirebaseClient();
    if (!client?.auth.currentUser) throw new Error('You are not signed in.');
    const current = await secureBackend.getProfile(client.auth.currentUser.uid);
    if (!current) throw new Error('Clinova profile not found.');
    const next = { ...current, ...updates, uid: current.uid, role: current.role };
    await secureBackend.saveProfile(next);
    return next;
  }
};
