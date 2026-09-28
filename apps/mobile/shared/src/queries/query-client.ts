import { QueryClient } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { isRetriableError } from '@/lib/api-client';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // React Native không có window focus — refetch theo AppState/NetInfo cắm sau.
      refetchOnWindowFocus: false,
      // Gọi lại một request 4xx thì vẫn 4xx — chỉ thử lại lỗi mạng/timeout/5xx.
      retry: (failureCount, error) => failureCount < MAX_RETRIES && isRetriableError(error),
      staleTime: STALE_TIME.TRANSACTIONAL,
    },
    mutations: {
      // Mutation KHÔNG tự thử lại: gửi lại một POST đã tới server là tạo bản ghi trùng.
      retry: false,
    },
  },
});
