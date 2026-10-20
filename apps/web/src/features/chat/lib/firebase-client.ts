'use client';

import { getApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signInWithCustomToken,
  signOut,
  type Auth,
} from 'firebase/auth';
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

let auth: Auth | null = null;

/**
 * Phiên Firebase chỉ sống trong BỘ NHỚ của tab — cùng lựa chọn với app native.
 *
 * `getAuth()` mặc định lưu phiên vào IndexedDB, và phiên đó SỐNG SÓT qua lần đăng xuất XePrime:
 * trên một máy dùng chung (máy quầy của gian hàng), người ngồi sau mở devtools là dùng được phiên
 * của người trước để đọc huy hiệu và các tin gần nhất trong hội thoại của họ, cho tới khi refresh
 * token bị thu hồi. Không có gì để mất khi bỏ nó: mỗi lần tải trang `ChatRealtimeProvider` vẫn
 * xin custom token mới, nên phiên lưu bền chưa bao giờ được dùng lại.
 */
function getChatAuth(): Auth | null {
  if (auth) return auth;
  const instance = getFirebaseApp();
  if (!instance) return null;
  dropLegacyPersistedSession();
  try {
    auth = initializeAuth(instance, { persistence: inMemoryPersistence });
  } catch (err) {
    // CHỈ nhánh HMR ở dev: module nạp lại nhưng Firebase app vẫn còn, mà `initializeAuth` chỉ gọi
    // được một lần mỗi app — lấy lại đúng instance đã khởi tạo (vẫn là bản trong bộ nhớ). Lỗi
    // khác mà rơi về `getAuth()` thì sẽ âm thầm tạo đúng bản lưu bền vừa được gỡ.
    if ((err as { code?: unknown })?.code !== 'auth/already-initialized') throw err;
    auth = getAuth(instance);
  }
  return auth;
}

/**
 * Xoá phiên mà bản trước (`getAuth()` lưu IndexedDB) để lại trên máy. Bộ nhớ trong không bao giờ
 * đọc hay dọn chỗ đó, nên không có bước này thì người dùng chat cuối cùng trên một máy dùng chung
 * TRƯỚC lần deploy này vẫn để lại một refresh token sống lâu. Best-effort: tab cũ còn mở thì lệnh
 * xoá đợi tới khi nó đóng; trên máy chưa từng có phiên thì đây là no-op.
 */
function dropLegacyPersistedSession(): void {
  try {
    globalThis.indexedDB?.deleteDatabase('firebaseLocalStorageDb');
  } catch {
    // Trình duyệt chặn IndexedDB (chế độ riêng tư) — không có gì để dọn.
  }
}

/** Đăng nhập Firebase bằng custom token backend mint (uid = user id) để nghe Firestore. */
export async function signInChat(token: string): Promise<void> {
  const current = getChatAuth();
  if (!current) return;
  await signInWithCustomToken(current, token);
}

/**
 * Rời phiên Firebase của ĐÚNG tài khoản `uid` — gọi khi tài khoản XePrime đó rời đi (đăng xuất,
 * đổi tài khoản). Listener của người trước mất quyền đọc ngay, thay vì chờ tab đóng.
 *
 * So `uid` để một lượt đăng nhập chậm của người trước không đá văng phiên của người sau.
 */
export async function signOutChat(uid: string): Promise<void> {
  if (!auth || auth.currentUser?.uid !== uid) return;
  await signOut(auth);
}
