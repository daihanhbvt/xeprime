'use client';

import { useEffect } from 'react';
import { persistNavPreferences } from '@/lib/ui-preferences';
import { useAppSelector } from '@/store/hooks';

/**
 * Ghi tuỳ chọn điều hướng xuống cookie mỗi khi nó đổi.
 *
 * Một chỗ ghi duy nhất, đặt ở vỏ portal, thay vì rải `persistNavPreferences` vào từng nút bấm:
 * sidebar desktop và Drawer mobile cùng sửa một state, và nút nào mới thêm sau này cũng tự
 * được lưu mà không phải nhớ gọi thêm gì.
 *
 * Chiều ĐỌC nằm ở phía server (`getServerNavPreferences` → `makeStore`), nên ở đây không có
 * bước "nạp lại từ cookie" — nếu có, nó sẽ chạy sau hydrate và làm sidebar nhấp nháy.
 */
export function useNavPreferencesSync(): void {
  const sidebarCollapsed = useAppSelector((s) => s.app.sidebarCollapsed);
  const navSectionsCollapsed = useAppSelector((s) => s.app.navSectionsCollapsed);

  useEffect(() => {
    persistNavPreferences({ sidebarCollapsed, navSectionsCollapsed });
  }, [sidebarCollapsed, navSectionsCollapsed]);
}
