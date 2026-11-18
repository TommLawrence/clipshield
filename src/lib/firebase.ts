/**
 * ClipShield — Firebase initialization.
 *
 * Firebase config comes from NEXT_PUBLIC_* env vars (see .env.example).
 * App Check (reCAPTCHA v3) is initialized before any AI Logic request.
 * Anonymous auth is used only for opt-in saved reports; Firestore stores
 * SANITIZED report text only — never originals, never rehydration vaults.
 *
 * Everything is lazily initialized client-side so SSR never touches Firebase.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

/** True when the required public Firebase config is present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let cachedApp: FirebaseApp | null = null;
let cachedAppCheck: AppCheck | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'ClipShield Firebase config is missing. Set the NEXT_PUBLIC_FIREBASE_* variables.',
    );
  }
  if (!cachedApp) {
    cachedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

/**
 * App Check with the existing reCAPTCHA v3 provider. Initialized once,
 * before any AI Logic request is made. In local dev (no site key) we fall
 * back to the debug provider so the app still runs — debug tokens are only
 * printed to the console, never committed.
 */
export function getAppCheck(): AppCheck {
  const app = getFirebaseApp();
  if (!cachedAppCheck) {
    if (RECAPTCHA_SITE_KEY) {
      cachedAppCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Local development only, using Google's public reCAPTCHA test key.
      // A real debug token, if printed by the SDK, stays in the console and
      // must never be committed.
      cachedAppCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'),
        isTokenAutoRefreshEnabled: true,
      });
      console.warn(
        '[ClipShield] App Check running with a placeholder debug provider (development only).',
      );
    } else {
      throw new Error(
        'App Check site key missing. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY for production.',
      );
    }
  }
  return cachedAppCheck;
}

/** Lazily initializes App Check; call before first AI request. */
export async function ensureAppCheckReady(): Promise<void> {
  getAppCheck();
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

/** Signs in anonymously (best effort) and returns the current user. */
export async function ensureAnonymousUser(): Promise<User | null> {
  const auth = getFirebaseAuth();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch(() => {
      // Already signed in, or auth unavailable; the listener handles it.
    });
    // Timeout fallback: resolve with whatever we have after 5s.
    setTimeout(() => {
      unsub();
      resolve(auth.currentUser);
    }, 5000);
  });
}

export type { User };
