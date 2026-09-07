'use client';

import { ROUTES } from '@/constants/routes';

import { useLogout } from './use-logout';

/**
 * Đăng xuất KHỎI MARKETPLACE — cặp song sinh của `usePortalLogout`, khác đúng một thứ: đích đến.
 *
 * Người đăng xuất từ khu công khai là KHÁCH đang xem xe, nên trả họ về trang chủ; người đăng
 * xuất từ `/manage` là chủ xe/nhân viên, nên trả về đăng nhập cổng quản lý. Toàn bộ phần còn
 * lại nằm ở `useLogout` — hai bản chép tay của một luồng bảo mật là chỗ để chúng trôi khỏi nhau.
 */
export function useMarketLogout(): () => Promise<void> {
  return useLogout(ROUTES.HOME);
}
