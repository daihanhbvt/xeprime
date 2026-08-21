'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { ROUTES } from '@/constants/routes';
import { destroySession } from '@/services/auth.service';

import { useAuthCache } from './use-auth-actions';

/**
 * Đăng xuất KHỎI MARKETPLACE — cặp song sinh của `usePortalLogout`, khác đúng một thứ: đích đến.
 *
 * Người đăng xuất từ khu công khai là KHÁCH đang xem xe, nên trả họ về trang chủ; người đăng
 * xuất từ `/manage` là chủ xe/nhân viên, nên trả về đăng nhập cổng quản lý. Cùng ba bước còn
 * lại (huỷ phiên server → dọn cache → điều hướng), và ba bước đó là lý do hook này tồn tại:
 * `MarketHeader` từng chép tay chúng, và menu tài khoản sắp là bản chép thứ ba.
 *
 * Lỗi mà nó chặn: quên bước dọn cache ở một bản sao → dữ liệu người vừa thoát còn nằm lại cho
 * người đăng nhập kế tiếp trên cùng máy.
 */
export function useMarketLogout(): () => Promise<void> {
  const router = useRouter();
  const { clearAfterLogout } = useAuthCache();

  return useCallback(async () => {
    try {
      await destroySession();
    } catch {
      // Cookie có thể đã hết hạn phía server — vẫn phải dọn cache và đưa người dùng đi.
    }
    clearAfterLogout();
    router.replace(ROUTES.HOME);
  }, [router, clearAfterLogout]);
}
