import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, createUserWithEmailAndPassword, getAuth, linkWithCredential, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInAnonymously, signInWithEmailAndPassword, updateProfile, EmailAuthProvider, signOut } from 'firebase/auth';
import { getDatabase, ref, get, set, push, remove, update, runTransaction, onValue, off } from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getDatabase(app);

export const prepareAuth = () => setPersistence(auth, browserLocalPersistence);
export const loginAnonymous = () => signInAnonymously(auth);
export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());
export const createLinkedAccount = async (email, password, displayName) => {
  const credential = EmailAuthProvider.credential(email, password);
  const result = auth.currentUser?.isAnonymous
    ? await linkWithCredential(auth.currentUser, credential)
    : await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) await updateProfile(result.user, { displayName: displayName.trim() });
  return result.user;
};
export const logout = () => signOut(auth);
export { onAuthStateChanged, ref, get, set, push, remove, update, runTransaction, onValue, off };
