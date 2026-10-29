import { Appearance, Platform } from 'react-native';
import { getSecureItemSync, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';
import type { ColorScheme } from './tokens';

export type { ColorScheme } from './tokens';

/**
 * Giao diện của app — CÙNG mô hình với web (`apps/web/src/lib/theme.tsx`, #203): hai chế độ Sáng ·
 * Tối, mặc định SÁNG, lựa chọn của khách được nhớ (web: cookie `XP_THEME`; app: Keystore). Không
 * theo theme của máy — web cũng không.
 */
export const DEFAULT_SCHEME: ColorScheme = 'light';

function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark';
}

/** Lựa chọn đã lưu — đọc ĐỒNG BỘ để màn đầu tiên đã vẽ đúng giao diện, không nháy sáng rồi tối. */
export function readStoredScheme(): ColorScheme {
  const stored = getSecureItemSync(SECURE_KEY.THEME_PREFERENCE);
  return isColorScheme(stored) ? stored : DEFAULT_SCHEME;
}

export function saveScheme(scheme: ColorScheme): Promise<void> {
  return setSecureItem(SECURE_KEY.THEME_PREFERENCE, scheme);
}

/**
 * Ép phần NATIVE (bàn phím, bộ chọn ngày giờ, hộp thoại hệ thống) theo giao diện của app chứ không
 * theo máy — máy đang tối mà app sáng thì bàn phím tối đè lên form sáng.
 *
 * Trên Android, `Appearance.setColorScheme` gọi
 * `AppCompatDelegate.setDefaultNightMode` ⇒ DỰNG LẠI cả Activity: module native còn giữ Activity
 * cũ (`MissingActivity`), Modal đang mở và màn hiện tại thành MÀN TRẮNG (người dùng báo 28/10/2026).
 * Nên Android chỉ đổi theme ở JS (bàn phím/hộp thoại hệ thống theo chế độ máy); iOS vẫn đồng bộ.
 */
export function syncNativeScheme(scheme: ColorScheme): void {
  if (Platform.OS === 'web') return;
  // Android: KHÔNG gọi, kể cả lúc khởi động — mỗi lần gọi là một lượt dựng lại Activity.
  if (Platform.OS === 'android') return;
  Appearance.setColorScheme?.(scheme);
}
