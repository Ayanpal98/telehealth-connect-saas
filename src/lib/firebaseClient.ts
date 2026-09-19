import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(config).every(Boolean);

export function getFirebaseClient(): { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } | null {
  if (!isFirebaseConfigured) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);

  // Keep the authenticated session across page refreshes/browser restarts.
  // This is Firebase-managed persistence; no credentials are stored in localStorage by Clinova.
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

  return { app, auth, db: getFirestore(app), storage: getStorage(app) };
}
