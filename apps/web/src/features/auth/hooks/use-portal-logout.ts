'use client';

import { ROUTES } from '@/constants/routes';

import { useLogout } from './use-logout';

/**
 * Đăng xuất KHỎI CỔNG QUẢN LÝ.
 *
 * Đích là đăng nhập **cổng quản lý**, không phải marketplace: người đăng xuất từ đây là chủ
 * xe/nhân viên, đá họ ra trang tìm xe là sai ngữ cảnh. Ba bước còn lại ở `useLogout`.
 */
export function usePortalLogout(): () => Promise<void> {
  return useLogout(ROUTES.MANAGE.LOGIN);
}
