import type { FirebaseOptions } from 'firebase/app';

/**
 * Cấu hình Firebase PUBLIC của app native — song sinh của `firebase-client-config.ts` bên web.
 *
 * Bốn biến `EXPO_PUBLIC_FIREBASE_*` được NHÚNG CỨNG lúc bundle (như mọi `EXPO_PUBLIC_*`), nên
 * thêm chúng vào `.env` khi Metro đang chạy thì bundle cũ vẫn không thấy — phải khởi động lại.
 *
 * Chúng lộ thiên trong bundle và điều đó là bình thường: quyền đọc thật do Firestore Security
 * Rules quyết định (`firestore.rules` — chỉ `memberUids` đọc được, client không ghi được gì),
 * còn danh tính đến từ custom token mà backend mint theo phiên (ADR 0009 §4).
 *
 * Đọc BẰNG TÊN ĐẦY ĐỦ chứ không dựng khoá động: Metro thay `process.env.EXPO_PUBLIC_X` bằng
 * hằng lúc transform, nên `process.env[name]` trả `undefined` ở bản build thật.
 */
export function readFirebaseConfig(): FirebaseOptions | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim();

  if (!apiKey || !projectId || !authDomain || !appId) return null;
  return { apiKey, projectId, authDomain, appId };
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null;
}
