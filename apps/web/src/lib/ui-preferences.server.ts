import { cookies } from 'next/headers';

import {
  parseNavPreferences,
  UI_PREFERENCES_COOKIE,
  type NavPreferences,
} from './ui-preferences';

/**
 * Tuỳ chọn hiển thị của vỏ quản lý, đọc PHÍA SERVER trước khi render.
 *
 * Cùng khuôn với `getServerLocale`: `next/headers` khiến file này tự nó là server-only, và giá
 * trị đi vào store Redux ngay từ HTML đầu tiên nên không có pha "mở rộng rồi giật về thu gọn"
 * sau hydrate.
 */
export async function getServerNavPreferences(): Promise<NavPreferences> {
  const store = await cookies();
  const raw = store.get(UI_PREFERENCES_COOKIE)?.value;
  return parseNavPreferences(raw ? decodeURIComponent(raw) : undefined);
}
