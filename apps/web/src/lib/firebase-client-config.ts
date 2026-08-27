import type { FirebaseOptions } from 'firebase/app';

/**
 * Cấu hình public dùng chung cho các Firebase client của web.
 *
 * Social Auth và chat dùng hai Firebase App riêng để phiên OAuth tạm thời không ghi đè phiên
 * custom-token mà chat cần để đọc Firestore. Cả hai app vẫn trỏ tới cùng Firebase project.
 */
export function readFirebaseClientConfig(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !authDomain || !appId) return null;
  return { apiKey, projectId, authDomain, appId };
}

export function isFirebaseClientConfigured(): boolean {
  return readFirebaseClientConfig() !== null;
}
