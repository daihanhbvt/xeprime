import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { isUnauthenticated } from '@/lib/api-client';
import { addErrorInterceptor } from '@/lib/http-interceptors';
import { logger } from '@/lib/logger';
import { resetSessionScopedCache } from '@/queries/reset-session-cache';
import { AUTH_PATHS } from './api';

/**
 * Tầng DUY NHẤT phát hiện phiên hết hạn.
 *
 * Bất kỳ endpoint nào trả 401 cũng đi qua đây: dọn cache của phiên rồi bắt `auth.me` chạy
 * lại. Màn hình KHÔNG tự kiểm 401 — chúng chỉ đọc `useCurrentUser`, và route guard ở
 * `app/(app)/_layout.tsx` là nơi duy nhất điều hướng. Tách làm hai vì interceptor nằm ngoài
 * cây React (không gọi được `useRouter`), còn guard thì không thấy lỗi của request lẻ.
 */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      addErrorInterceptor((error, request) => {
        if (!isUnauthenticated(error)) return;

        // Bỏ qua chính các endpoint auth, nếu không `/auth/me` trả 401 sẽ tự làm mình chạy lại
        // vô hạn. 401 từ chúng đã là câu trả lời cuối cùng rồi.
        if (AUTH_PATHS.includes(request.path)) return;

        logger.warn('Phiên hết hạn', { path: request.path, code: error.code });
        resetSessionScopedCache(queryClient);
      }),
    [queryClient],
  );

  return children;
}
