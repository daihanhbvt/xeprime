import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => {
  const googleSetCustomParameters = vi.fn();
  const facebookSetCustomParameters = vi.fn();

  class GoogleAuthProvider {
    setCustomParameters = googleSetCustomParameters;
  }

  class FacebookAuthProvider {
    setCustomParameters = facebookSetCustomParameters;
  }

  return {
    GoogleAuthProvider,
    FacebookAuthProvider,
    googleSetCustomParameters,
    facebookSetCustomParameters,
    getApps: vi.fn(),
    initializeApp: vi.fn(),
    getAuth: vi.fn(),
    setPersistence: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    inMemoryPersistence: { type: 'NONE' },
    auth: { languageCode: null as string | null, currentUser: { uid: 'firebase-user' } },
  };
});

vi.mock('firebase/app', () => ({
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  FacebookAuthProvider: firebase.FacebookAuthProvider,
  getAuth: firebase.getAuth,
  GoogleAuthProvider: firebase.GoogleAuthProvider,
  inMemoryPersistence: firebase.inMemoryPersistence,
  setPersistence: firebase.setPersistence,
  signInWithPopup: firebase.signInWithPopup,
  signOut: firebase.signOut,
}));

const FIREBASE_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIza-test-key-for-social-auth',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'xe-prime-test',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'xe-prime-test.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123:web:test',
} as const;

const ORIGINAL_FIREBASE_ENV = Object.fromEntries(
  Object.keys(FIREBASE_ENV).map((key) => [key, process.env[key]]),
) as Record<keyof typeof FIREBASE_ENV, string | undefined>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(process.env, FIREBASE_ENV);

  firebase.getApps.mockReturnValue([]);
  firebase.initializeApp.mockReturnValue({ name: 'xeprime-social-auth' });
  firebase.getAuth.mockReturnValue(firebase.auth);
  firebase.setPersistence.mockResolvedValue(undefined);
  firebase.signInWithPopup.mockResolvedValue({
    user: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') },
  });
  firebase.signOut.mockResolvedValue(undefined);
  firebase.auth.languageCode = null;
  firebase.auth.currentUser = { uid: 'firebase-user' };
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_FIREBASE_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Firebase Social Auth', () => {
  it('đăng nhập Google bằng popup và trả ID token cho backend', async () => {
    const { getFirebaseProviderIdToken } = await import('./firebase-social-auth');

    await expect(getFirebaseProviderIdToken('google')).resolves.toBe('firebase-id-token');

    expect(firebase.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: FIREBASE_ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID }),
      'xeprime-social-auth',
    );
    expect(firebase.setPersistence).toHaveBeenCalledWith(
      firebase.auth,
      firebase.inMemoryPersistence,
    );
    expect(firebase.googleSetCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(firebase.signInWithPopup.mock.calls[0]?.[1]).toBeInstanceOf(
      firebase.GoogleAuthProvider,
    );
    expect(firebase.auth.languageCode).toBe('vi');
    expect(firebase.signOut).toHaveBeenCalledWith(firebase.auth);
  });

  it('khởi tạo đúng Facebook provider', async () => {
    const { getFirebaseProviderIdToken } = await import('./firebase-social-auth');

    await expect(getFirebaseProviderIdToken('facebook')).resolves.toBe('firebase-id-token');

    expect(firebase.facebookSetCustomParameters).toHaveBeenCalledWith({ display: 'popup' });
    expect(firebase.signInWithPopup.mock.calls[0]?.[1]).toBeInstanceOf(
      firebase.FacebookAuthProvider,
    );
  });

  it('đổi lỗi Firebase kỹ thuật thành hướng dẫn tiếng Việt', async () => {
    firebase.signInWithPopup.mockRejectedValue({ code: 'auth/unauthorized-domain' });
    const { getFirebaseProviderIdToken } = await import('./firebase-social-auth');

    await expect(getFirebaseProviderIdToken('google')).rejects.toThrow(
      'Tên miền hiện tại chưa được cho phép trong Firebase Authentication.',
    );
  });

  it('báo cấu hình thiếu mà không mở popup', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const { getFirebaseProviderIdToken } = await import('./firebase-social-auth');

    await expect(getFirebaseProviderIdToken('google')).rejects.toThrow(
      'Đăng nhập mạng xã hội chưa được cấu hình.',
    );
    expect(firebase.signInWithPopup).not.toHaveBeenCalled();
  });
});
