'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type AuthProvider as FirebaseAuthProvider,
} from 'firebase/auth';
import { AUTH_PROVIDER, type AuthProvider } from '@/features/auth/constants';
import type { AppLocale } from '@/i18n/config';
import { readFirebaseClientConfig } from '@/lib/firebase-client-config';

const SOCIAL_FIREBASE_APP_NAME = 'xeprime-social-auth';

/**
 * Lý do đăng nhập mạng xã hội hỏng — MÃ, không phải câu.
 *
 * Cùng lý lẽ với mã lỗi API (ADR 0012): mô-đun này không biết người dùng đang đọc ngôn ngữ
 * nào, và nó là hàm thuần nên không gọi được hook. Nó nêu chuyện gì đã xảy ra; `AuthPanel`
 * chọn chữ qua `Auth.socialError.*`.
 */
export type SocialAuthErrorKey =
  | 'notConfigured'
  | 'popupClosed'
  | 'cancelled'
  | 'popupBlocked'
  | 'unauthorizedDomain'
  | 'operationNotAllowed'
  | 'accountExists'
  | 'network'
  | 'tooManyRequests'
  | 'userDisabled'
  | 'generic';

export class SocialAuthError extends Error {
  readonly key: SocialAuthErrorKey;
  readonly provider: AuthProvider | null;

  constructor(key: SocialAuthErrorKey, provider: AuthProvider | null = null) {
    // `message` chỉ để đọc trong log/stack — giao diện KHÔNG bao giờ hiện nó.
    super(`social-auth:${key}`);
    this.name = 'SocialAuthError';
    this.key = key;
    this.provider = provider;
  }
}

const FIREBASE_ERROR_KEYS: Readonly<Record<string, SocialAuthErrorKey>> = {
  'auth/popup-closed-by-user': 'popupClosed',
  'auth/cancelled-popup-request': 'cancelled',
  'auth/popup-blocked': 'popupBlocked',
  'auth/unauthorized-domain': 'unauthorizedDomain',
  'auth/operation-not-allowed': 'operationNotAllowed',
  'auth/account-exists-with-different-credential': 'accountExists',
  'auth/network-request-failed': 'network',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/user-disabled': 'userDisabled',
};

let socialApp: FirebaseApp | null = null;
let socialAuthPromise: Promise<Auth> | null = null;

function getSocialFirebaseApp(): FirebaseApp {
  if (socialApp) return socialApp;

  const config = readFirebaseClientConfig();
  if (!config) throw new SocialAuthError('notConfigured');

  socialApp =
    getApps().find((candidate) => candidate.name === SOCIAL_FIREBASE_APP_NAME) ??
    initializeApp(config, SOCIAL_FIREBASE_APP_NAME);
  return socialApp;
}

async function getSocialFirebaseAuth(locale: AppLocale): Promise<Auth> {
  if (socialAuthPromise) return socialAuthPromise;

  socialAuthPromise = (async () => {
    const auth = getAuth(getSocialFirebaseApp());
    /*
     * Màn đồng ý của Google/Facebook do FIREBASE render, không phải app này — nên ngôn ngữ của
     * nó phải được nói ra ở đây, nếu không khách đang đọc tiếng Anh sẽ nhảy sang một popup
     * tiếng Việt giữa luồng đăng nhập.
     */
    auth.languageCode = locale;
    // ADR 0002: Firebase chỉ dùng để lấy ID token lúc đăng nhập; XePrime giữ phiên bằng cookie.
    await setPersistence(auth, inMemoryPersistence);
    return auth;
  })();

  try {
    return await socialAuthPromise;
  } catch (error) {
    // Cho phép thử lại nếu lần khởi tạo đầu thất bại tạm thời.
    socialAuthPromise = null;
    throw error;
  }
}

function createProvider(provider: AuthProvider): FirebaseAuthProvider {
  if (provider === AUTH_PROVIDER.GOOGLE) {
    const google = new GoogleAuthProvider();
    google.setCustomParameters({ prompt: 'select_account' });
    return google;
  }

  const facebook = new FacebookAuthProvider();
  facebook.setCustomParameters({ display: 'popup' });
  return facebook;
}

function firebaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function socialAuthError(error: unknown, provider: AuthProvider): SocialAuthError {
  if (error instanceof SocialAuthError) return error;

  const code = firebaseErrorCode(error);
  return new SocialAuthError(
    (code ? FIREBASE_ERROR_KEYS[code] : null) ?? 'generic',
    provider,
  );
}

/** Lấy Firebase ID token đúng một lần để backend đổi thành session cookie XePrime. */
export async function getFirebaseProviderIdToken(
  provider: AuthProvider,
  locale: AppLocale,
): Promise<string> {
  let auth: Auth | null = null;

  try {
    auth = await getSocialFirebaseAuth(locale);
    const credential = await signInWithPopup(auth, createProvider(provider));
    return await credential.user.getIdToken();
  } catch (error) {
    throw socialAuthError(error, provider);
  } finally {
    // Không giữ phiên provider trong browser: session thật của XePrime là cookie httpOnly.
    if (auth?.currentUser) await signOut(auth).catch(() => undefined);
  }
}
