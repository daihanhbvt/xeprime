import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Khoá trong Keychain (iOS) / Keystore (Android). Khai báo tập trung vì `expo-secure-store`
 * chỉ nhận `[A-Za-z0-9._-]` — ký tự khác ném lỗi lúc CHẠY, không phải lúc biên dịch.
 *
 * `REFRESH_TOKEN` là bí mật DUY NHẤT được ghi xuống đĩa (ADR 0017): access token sống 15 phút
 * và ở lại trong bộ nhớ, ghi nó xuống chỉ thêm một chỗ để rò.
 */
export const SECURE_KEY = {
  REFRESH_TOKEN: 'xp.refresh.token',
  LOCALE: 'xp.locale',
  SHELL_SCOPE: 'xp.shell.scope',
} as const;

export type SecureKey = (typeof SECURE_KEY)[keyof typeof SECURE_KEY];

/**
 * `expo-secure-store` không có bản cài cho web; `expo start --web` sẽ nổ ngay lần gọi đầu.
 * Bản web lùi về `localStorage` — KHÔNG an toàn, nên web chỉ dùng để xem giao diện.
 */
const isWeb = Platform.OS === 'web';

/**
 * ADR 0017: refresh token chỉ sống ở Keychain/Keystore. Nó đổi được thành phiên đầy đủ, mà mọi
 * script trên trang đều đọc được `localStorage`. Thà `expo start --web` không đăng nhập được
 * (nó chỉ để xem giao diện) còn hơn có một đường rò chỉ tồn tại ở nhánh web.
 */
const NEVER_ON_WEB: readonly SecureKey[] = [SECURE_KEY.REFRESH_TOKEN];

function blockedOnWeb(key: SecureKey): boolean {
  return isWeb && NEVER_ON_WEB.includes(key);
}

export async function getSecureItem(key: SecureKey): Promise<string | null> {
  if (blockedOnWeb(key)) return null;
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;

  // Keychain/Keystore có thể từ chối đọc khi thiết bị vừa khởi động và chưa mở khoá lần nào.
  // Lỗi ở đây luôn có nghĩa "chưa có giá trị dùng được", không phải lỗi cần đẩy lên UI.
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSecureItem(key: SecureKey, value: string): Promise<void> {
  if (blockedOnWeb(key)) return;
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteSecureItem(key: SecureKey): Promise<void> {
  if (blockedOnWeb(key)) return;
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Xoá thứ không tồn tại không phải lỗi — đăng xuất phải luôn đi tới cùng.
  }
}
