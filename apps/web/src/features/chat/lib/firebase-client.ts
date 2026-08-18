'use client';

import { getApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  isFirebaseClientConfigured,
  readFirebaseClientConfig,
} from '@/lib/firebase-client-config';

/**
 * Firebase client singleton cho chat realtime (ADR 0009). Config public từ NEXT_PUBLIC_FIREBASE_*
 * — quyền thật do Firestore Security Rules quyết định, không phải config này. Chưa cấu hình thì
 * mọi hàm trả null và chat rơi về REST (không realtime).
 */
export function isFirebaseConfigured(): boolean {
  return isFirebaseClientConfigured();
}

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  const config = readFirebaseClientConfig();
  if (!config) return null;
  try {
    app = getApp();
  } catch {
    app = initializeApp(config);
  }
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
