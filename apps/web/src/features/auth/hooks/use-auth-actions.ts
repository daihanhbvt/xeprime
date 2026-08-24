'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CurrentUser } from '@/hooks/use-current-user';
import { authApi } from '@xeprime/api-client';
import { queryKeys } from '@/services/query-keys';

/**
 * Dọn cache quanh ranh giới phiên — dùng chung cho mọi đường auth (modal khách, trang portal,
 * đăng xuất).
 *
 * Hai việc khác nhau và không được lẫn:
 *  - `refreshAfterAuth`: vừa đăng nhập → mọi dữ liệu đã fetch lúc chưa đăng nhập (hoặc của
 *    người khác trên cùng máy) đều sai. `clear()` thay vì `invalidateQueries()` để không có
 *    khoảnh khắc UI hiện dữ liệu cũ trong lúc refetch. Sau đó nạp `/auth/me` NGAY và ghi
 *    thẳng vào cache để header/avatar đổi trong cùng một lượt render, không nhấp nháy.
 *  - `clearAfterLogout`: xoá sạch, không nạp lại gì.
 */
export function useAuthCache() {
  const queryClient = useQueryClient();

  const refreshAfterAuth = useCallback(
    async (user?: CurrentUser): Promise<CurrentUser | null> => {
      queryClient.clear();
      if (user) {
        queryClient.setQueryData(queryKeys.auth.me(), user);
        return user;
      }
      try {
        const fresh = await authApi.me();
        queryClient.setQueryData(queryKeys.auth.me(), fresh);
        return fresh;
      } catch {
        // Không chặn luồng vì một lần fetch hỏng — query sẽ tự thử lại khi component mount.
        return null;
      }
    },
    [queryClient],
  );

  const clearAfterLogout = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  return { refreshAfterAuth, clearAfterLogout };
}
