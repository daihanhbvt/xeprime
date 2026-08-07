'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { ROUTES } from '@/constants/routes';
import { destroySession } from '@/services/auth.service';

import { useAuthCache } from './use-auth-actions';

/**
 * Đăng xuất KHỎI CỔNG QUẢN LÝ — một bản cài đặt duy nhất.
 *
 * Trước Wave 1D-B, `Topbar` và `ManageUserCard` mỗi nơi tự viết lại đúng ba bước này. Hai bản
 * sao của một luồng bảo mật là chỗ để chúng trôi khỏi nhau: sửa một bên (ví dụ thêm bước dọn
 * cache) mà quên bên kia thì dữ liệu người vừa thoát còn nằm lại cho người đăng nhập kế tiếp
 * trên cùng máy.
 *
 * Ba bước, đúng thứ tự:
 *  1. xoá phiên phía server (cookie httpOnly — client không tự xoá được, ADR 0002);
 *  2. xoá cache TanStack Query;
 *  3. về đăng nhập **cổng quản lý**, không phải marketplace — người đăng xuất từ đây là chủ
 *     xe/nhân viên, đá họ ra trang tìm xe là sai ngữ cảnh.
 */
export function usePortalLogout(): () => Promise<void> {
  const router = useRouter();
  const { clearAfterLogout } = useAuthCache();

  return useCallback(async () => {
    await destroySession();
    clearAfterLogout();
    router.replace(ROUTES.MANAGE.LOGIN);
  }, [router, clearAfterLogout]);
}
