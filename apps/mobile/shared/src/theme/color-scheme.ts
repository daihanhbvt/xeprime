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
 */
export function syncNativeScheme(scheme: ColorScheme): void {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme?.(scheme);
}
