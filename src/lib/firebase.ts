import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Firebase web config is a public identifier, not a secret. Access is protected by
// Firebase Auth + the Realtime Database security rules in /database.rules.json.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDLjBsWrI0zkpCUPm4eJt5eUGTZ6i11dDo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'accounts-b041c.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://accounts-b041c-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'accounts-b041c',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'accounts-b041c.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '694641238470',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:694641238470:web:4e173ee0c91a5f711f12c7',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-XYKT029EYE',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Analytics is optional and only loads where supported (not in private mode / some webviews)
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  import('firebase/analytics')
    .then(async ({ getAnalytics, isSupported }) => {
      if (await isSupported()) getAnalytics(app);
    })
    .catch(() => undefined);
}
