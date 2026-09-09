'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CurrentUser } from '@/hooks/use-current-user';
import { fetchCurrentUser } from '@/services/auth.service';
import { queryKeys } from '@/services/query-keys';

/**
 * Dọn cache quanh ranh giới phiên — dùng chung cho mọi đường auth (modal khách, trang portal,
 * đăng xuất).
 *
 * Hai việc khác nhau và không được lẫn:
 *  - `refreshAfterAuth`: vừa đăng nhập → mọi dữ liệu đã fetch lúc chưa đăng nhập (hoặc của
 *    người khác trên cùng máy) đều sai. Sau đó nạp `/auth/me` NGAY và ghi thẳng vào cache để
 *    header/avatar đổi trong cùng một lượt render, không nhấp nháy.
 *  - `clearAfterLogout`: xoá sạch, không nạp lại gì.
 *
 * Cả hai đều đi qua `resetQueries()` — lý do ở docblock của `clearAfterLogout` bên dưới, và nó
 * áp dụng y hệt cho chiều đăng nhập: dữ liệu cũ phải biến mất khỏi màn hình ngay, không đợi một
 * lần render tình cờ nào đó.
 */
export function useAuthCache() {
  const queryClient = useQueryClient();

  const refreshAfterAuth = useCallback(
    async (user?: CurrentUser): Promise<CurrentUser | null> => {
      void queryClient.resetQueries();
      if (user) {
        queryClient.setQueryData(queryKeys.auth.me(), user);
        return user;
      }
      try {
        const fresh = await fetchCurrentUser();
        queryClient.setQueryData(queryKeys.auth.me(), fresh);
        return fresh;
      } catch {
        // Không chặn luồng vì một lần fetch hỏng — query sẽ tự thử lại khi component mount.
        return null;
      }
    },
    [queryClient],
  );

  /*
   * `resetQueries()` chứ KHÔNG phải `clear()` — khác biệt này là cả một lỗi có thật.
   *
   * `clear()` vứt cache nhưng KHÔNG đánh thức observer đang mount: `QueryObserver` (v5) chỉ
   * nghe chính `Query` mà nó gắn vào, không nghe sự kiện `removed` của cache. Header vì thế
   * vẫn cầm kết quả cũ trong `currentResult` cho tới lần render kế tiếp — mà đăng xuất tại chỗ
   * (`router.replace` về đúng trang đang đứng) không tạo ra lần render nào. Triệu chứng đã gặp:
   * bấm Đăng xuất, phiên phía server mất rồi, nhưng avatar vẫn còn tới khi F5.
   *
   * `resetQueries()` đưa MỌI query về trạng thái ban đầu (data biến mất, đúng thứ `clear()`
   * làm được) VÀ báo cho observer, nên giao diện đổi ngay trong cùng lượt render.
   *
   * Không `await`: query đang mount sẽ fetch lại và nhận 401 — kết quả đúng, nhưng người dùng
   * không phải đợi nó mới được đưa ra ngoài.
   */
  const clearAfterLogout = useCallback(() => {
    void queryClient.resetQueries();
  }, [queryClient]);

  return { refreshAfterAuth, clearAfterLogout };
}
