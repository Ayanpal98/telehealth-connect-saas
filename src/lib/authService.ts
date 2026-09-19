import { UserProfile } from '../types';
import { onAuthStateChanged, sendPasswordResetEmail, User as FirebaseUser } from 'firebase/auth';
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

  waitForAuthState: (): Promise<FirebaseUser | null> => {
    if (!secureBackend.isAvailable()) {
      return Promise.resolve(null);
    }
    const client = getFirebaseClient();
    if (!client) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      let settled = false;
      const unsubscribe = onAuthStateChanged(
        client.auth,
        user => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve(user);
          }
        },
        error => {
          if (!settled) {
            settled = true;
            unsubscribe();
            reject(error);
          }
        }
      );
    });
  },

  subscribeToAuthState: (callback: (user: FirebaseUser | null) => void) => {
    if (!secureBackend.isAvailable()) return () => {};
    const client = getFirebaseClient();
    if (!client) return () => {};
    return onAuthStateChanged(client.auth, callback);
  },

  resetPassword: async (email: string) => {
    if (!secureBackend.isAvailable()) {
      throw new Error('Password reset is available when Firebase authentication is enabled.');
    }
    const client = getFirebaseClient();
    if (!client) throw new Error('Firebase backend is not configured.');
    await sendPasswordResetEmail(client.auth, email);
  },

  signIn: async (email: string, password: string, displayName: string, role: 'patient' | 'clinician'): Promise<UserProfile> => {
    if (!secureBackend.isAvailable()) {
      return mockAuth.login(email, displayName, role);
    }

    if (!email.trim()) throw new Error('Enter your email address.');
    if (!password) throw new Error('Enter your password.');

    let credential;
    try {
      credential = await secureBackend.signIn(email.trim().toLowerCase(), password);
    } catch (error: any) {
      const code = error?.code || '';
      const messages: Record<string, string> = {
        'auth/invalid-credential': 'The email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/user-disabled': 'This account has been disabled. Contact Clinova support.',
        'auth/too-many-requests': 'Too many sign-in attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed': 'Unable to reach the authentication service. Check your connection and try again.'
      };
      throw new Error(messages[code] || 'Sign in failed. Please check your credentials and try again.');
    }
    const existing = await secureBackend.getProfile(credential.user.uid);
    if (!existing) {
      await secureBackend.signOut();
      throw new Error('Your account is authenticated, but no Clinova profile is provisioned yet. Ask an administrator to create your profile.');
    }

    if (existing.role !== role) {
      await secureBackend.signOut();
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
