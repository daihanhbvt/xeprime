'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Theo dõi một media query ở client bằng `useSyncExternalStore` — cách chuẩn cho external store
 * (matchMedia), tránh setState-trong-effect. SSR-safe: server snapshot trả `false` (mặc định
 * desktop), client đồng bộ đúng ngay khi hydrate; tự cập nhật khi query đổi kết quả.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Điểm gãy mobile của dự án (bottom-sheet vs modal). Khớp breakpoint form ở CSS (≤640px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 640px)');
}
