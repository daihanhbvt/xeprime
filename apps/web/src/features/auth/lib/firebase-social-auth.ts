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
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  type AuthProvider,
} from '@/features/auth/constants';
import { readFirebaseClientConfig } from '@/lib/firebase-client-config';

const SOCIAL_FIREBASE_APP_NAME = 'xeprime-social-auth';
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Đăng nhập mạng xã hội chưa được cấu hình. Vui lòng liên hệ bộ phận hỗ trợ.';

class FirebaseClientConfigurationError extends Error {
  constructor() {
    super(FIREBASE_NOT_CONFIGURED_MESSAGE);
    this.name = 'FirebaseClientConfigurationError';
  }
}

const FIREBASE_AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.',
  'auth/cancelled-popup-request': 'Yêu cầu đăng nhập trước đó đã được thay thế. Vui lòng thử lại.',
  'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.',
  'auth/unauthorized-domain':
    'Tên miền hiện tại chưa được cho phép trong Firebase Authentication.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trên Firebase.',
  'auth/account-exists-with-different-credential':
    'Email này đã được đăng ký bằng phương thức khác. Hãy đăng nhập bằng phương thức đã dùng trước đó.',
  'auth/network-request-failed': 'Không thể kết nối dịch vụ đăng nhập. Hãy kiểm tra mạng rồi thử lại.',
  'auth/too-many-requests': 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  'auth/user-disabled': 'Tài khoản đăng nhập này đã bị vô hiệu hóa.',
};

let socialApp: FirebaseApp | null = null;
let socialAuthPromise: Promise<Auth> | null = null;

function getSocialFirebaseApp(): FirebaseApp {
  if (socialApp) return socialApp;

  const config = readFirebaseClientConfig();
  if (!config) throw new FirebaseClientConfigurationError();

  socialApp =
    getApps().find((candidate) => candidate.name === SOCIAL_FIREBASE_APP_NAME) ??
    initializeApp(config, SOCIAL_FIREBASE_APP_NAME);
  return socialApp;
}

async function getSocialFirebaseAuth(): Promise<Auth> {
  if (socialAuthPromise) return socialAuthPromise;

  socialAuthPromise = (async () => {
    const auth = getAuth(getSocialFirebaseApp());
    auth.languageCode = 'vi';
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

function socialAuthError(error: unknown, provider: AuthProvider): Error {
  if (error instanceof FirebaseClientConfigurationError) return error;

  const code = firebaseErrorCode(error);
  const mapped = code ? FIREBASE_AUTH_ERROR_MESSAGES[code] : null;
  return new Error(
    mapped ?? `Không thể đăng nhập bằng ${AUTH_PROVIDER_LABEL[provider]}. Vui lòng thử lại.`,
  );
}

/** Lấy Firebase ID token đúng một lần để backend đổi thành session cookie XePrime. */
export async function getFirebaseProviderIdToken(provider: AuthProvider): Promise<string> {
  let auth: Auth | null = null;

  try {
    auth = await getSocialFirebaseAuth();
    const credential = await signInWithPopup(auth, createProvider(provider));
    return await credential.user.getIdToken();
  } catch (error) {
    throw socialAuthError(error, provider);
  } finally {
    // Không giữ phiên provider trong browser: session thật của XePrime là cookie httpOnly.
    if (auth?.currentUser) await signOut(auth).catch(() => undefined);
  }
}
