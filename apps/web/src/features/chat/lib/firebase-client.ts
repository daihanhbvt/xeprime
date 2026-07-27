'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase client singleton cho chat realtime (ADR 0009). Config public từ NEXT_PUBLIC_FIREBASE_*
 * — quyền thật do Firestore Security Rules quyết định, không phải config này. Chưa cấu hình thì
 * mọi hàm trả null và chat rơi về REST (không realtime).
 */
interface FirebaseClientConfig {
  apiKey: string;
  projectId: string;
  authDomain: string;
  appId: string;
}

function readConfig(): FirebaseClientConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !authDomain || !appId) return null;
  return { apiKey, projectId, authDomain, appId };
}

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  const config = readConfig();
  if (!config) return null;
  app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function getChatDb(): Firestore | null {
  const instance = getFirebaseApp();
  return instance ? getFirestore(instance) : null;
}

function getChatAuth(): Auth | null {
  const instance = getFirebaseApp();
  return instance ? getAuth(instance) : null;
}

/** Đăng nhập Firebase bằng custom token backend mint (uid = user id) để nghe Firestore. */
export async function signInChat(token: string): Promise<void> {
  const auth = getChatAuth();
  if (!auth) return;
  await signInWithCustomToken(auth, token);
}
