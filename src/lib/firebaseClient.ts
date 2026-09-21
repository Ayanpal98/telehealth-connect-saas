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

let firebaseClient: { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } | null = null;
let persistenceReady: Promise<void> | null = null;

export function getFirebaseClient(): { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } | null {
  if (!isFirebaseConfigured) return null;
  if (firebaseClient) return firebaseClient;

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);

  // Configure persistence once, before authentication operations begin.
  // This avoids racing sign-in/auth-state listeners against Firebase persistence setup.
  persistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
    console.warn('Clinova: browser auth persistence could not be enabled.', error);
  });

  firebaseClient = { app, auth, db: getFirestore(app), storage: getStorage(app) };
  return firebaseClient;
}

export async function waitForFirebasePersistence(): Promise<void> {
  await persistenceReady;
}
