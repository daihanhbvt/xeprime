'use client';

import { zoneAuthRoutes } from '@/constants/routes';
import { useZone } from '@/zones/ZoneProvider';

import { useLogout } from './use-logout';

/**
 * Đăng xuất KHỎI CỔNG QUẢN LÝ.
 *
 * Đích là đăng nhập **cổng quản lý**, không phải marketplace: người đăng xuất từ đây là chủ
 * xe/nhân viên, đá họ ra trang tìm xe là sai ngữ cảnh. Ba bước còn lại ở `useLogout`.
 */
export function usePortalLogout(): () => Promise<void> {
  // Về trang đăng nhập của CHÍNH site đang đứng — partner hay quản trị (ADR 0053).
  return useLogout(zoneAuthRoutes(useZone()).login);
}
