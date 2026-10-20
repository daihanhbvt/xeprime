import { cookies } from 'next/headers';
import { DEFAULT_THEME, THEME_COOKIE, type ThemeMode } from './theme';

/**
 * Đọc tuỳ chọn giao diện sáng/tối từ cookie PHÍA SERVER.
 * Giúp HTML render ra mang sẵn data-theme đúng, loại bỏ hoàn toàn hiện tượng nhấp nháy (FOUC).
 */
export async function getServerTheme(): Promise<ThemeMode> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === 'dark' ? 'dark' : DEFAULT_THEME;
}

