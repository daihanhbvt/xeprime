'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { XP_BREAKPOINTS } from '@/styles/theme';

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

/**
 * Điểm gãy mobile của dự án (bottom-sheet vs modal) — Figma `14:183`, ≤640px.
 *
 * Con số lấy từ `XP_BREAKPOINTS` thay vì gõ tay: `.module.css` và JS phải gãy ở cùng một
 * chỗ. Trước Wave 1A hai bên lệch nhau (brief 00 §9.2 E2) vì CSS rải ~20 giá trị rời rạc;
 * các giá trị đó được dời dần khi chạm vào từng file (brief 00 §9.4), không dời hàng loạt.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${XP_BREAKPOINTS.mobile}px)`);
}

/** Tablet theo Figma `14:186`: 641–1024px. */
export function useIsTablet(): boolean {
  return useMediaQuery(
    `(min-width: ${XP_BREAKPOINTS.mobile + 1}px) and (max-width: ${XP_BREAKPOINTS.tablet}px)`,
  );
}

/** Desktop trở lên theo Figma `14:189`: >1024px. */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${XP_BREAKPOINTS.tablet + 1}px)`);
}
