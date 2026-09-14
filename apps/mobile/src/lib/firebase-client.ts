import { getApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  inMemoryPersistence,
  initializeAuth,
  signInWithCustomToken,
  signOut,
  type Auth,
} from 'firebase/auth';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { isFirebaseConfigured, readFirebaseConfig } from './firebase-config';

/**
 * Firebase client của app native — CHỈ để nghe realtime chat (ADR 0009).
 *
 * Không có Firebase nào trên đường đăng nhập (ADR 0019): phiên của app là cặp token của XePrime,
 * và Firebase chỉ nhận một custom token do backend mint để Security Rules biết `request.auth.uid`.
 *
 * Chưa cấu hình thì mọi hàm trả `null`/no-op và chat chạy trọn vẹn trên REST — đó là cả lý do
 * Firestore chỉ là projection.
 */
export { isFirebaseConfigured };

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  const config = readFirebaseConfig();
  if (!config) return null;
  try {
    app = getApp();
  } catch {
    app = initializeApp(config);
  }
  return app;
}

/**
 * Firestore với `experimentalForceLongPolling`.
 *
 * Transport mặc định của Firestore là WebChannel trên `fetch` streaming, thứ Hermes/RN không
 * cung cấp đầy đủ — triệu chứng là listener im lặng vĩnh viễn rồi
 * "Could not reach Cloud Firestore backend" sau vài chục giây, trong khi mọi lời gọi REST khác
 * của app vẫn chạy. Long-polling là đường chính thức cho React Native.
 *
 * `initializeFirestore` (không phải `getFirestore`) vì settings chỉ nhận được ở lần dựng ĐẦU
 * TIÊN; gọi `getFirestore` trước là khoá luôn cấu hình mặc định cho cả tiến trình.
 */
export function getChatDb(): Firestore | null {
  if (db) return db;
  const instance = getFirebaseApp();
  if (!instance) return null;
  db = initializeFirestore(instance, { experimentalForceLongPolling: true });
  return db;
}

/**
 * Auth với persistence TRONG BỘ NHỚ — cố ý.
 *
 * `getReactNativePersistence` ghi credential Firebase vào AsyncStorage, mà CLAUDE.md cấm để
 * token ở đó (ADR 0017), và ở đây nó cũng không mua được gì: app xin một custom token mới từ
 * `POST /chat/firebase-token` ở mỗi lần có phiên, nên một phiên Firebase còn sót lại qua các
 * lần mở app chỉ là credential thừa nằm trên đĩa.
 *
 * `initializeAuth` chứ không `getAuth`: bản RN của `getAuth` in cảnh báo "no persistence" và
 * chốt luôn persistence mặc định, không nhận settings nữa.
 */
function getChatAuth(): Auth | null {
  if (auth) return auth;
  const instance = getFirebaseApp();
  if (!instance) return null;
  auth = initializeAuth(instance, { persistence: inMemoryPersistence });
  return auth;
}

/** Đăng nhập Firebase bằng custom token backend mint (uid = user id) để nghe Firestore. */
export async function signInChat(token: string): Promise<void> {
  const instance = getChatAuth();
  if (!instance) return;
  await signInWithCustomToken(instance, token);
}

/**
 * Đăng xuất Firebase — gọi khi phiên XePrime kết thúc hoặc đổi người dùng.
 *
 * Bỏ bước này thì uid cũ còn nguyên trong tiến trình: người kế tiếp đăng nhập trên cùng máy sẽ
 * nghe Firestore bằng danh tính của người trước cho tới khi custom token mới được đổi vào.
 */
export async function signOutChat(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}
