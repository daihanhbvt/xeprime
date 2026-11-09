import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { STALE_TIME } from '@xeprime/api-client';
import { isRetriableError } from '@/lib/api-client';
import { notifyOffline, wireOnlineManager } from '@/lib/network';

const MAX_RETRIES = 2;

/*
 * Nối `focusManager` vào `AppState` MỘT lần cho cả app (mẫu TanStack cho React Native). Không có
 * `document.visibilityState` thì TanStack coi app focus MÃI MÃI, và mọi `refetchInterval` (overview
 * 60s, lượt cổng thanh toán, …) chạy cả khi máy nằm trong túi. Có dòng này, nhịp poll tự dừng ở
 * nền (`refetchIntervalInBackground` mặc định false). `refetchOnWindowFocus` vẫn TẮT bên dưới nên
 * quay lại tiền cảnh KHÔNG kéo theo một loạt refetch — query nào cần thì tự đặt
 * `refetchOnWindowFocus: 'always'` (vd. danh sách chuyến, lượt cổng thanh toán); "focus" ở đây
 * chính là AppState chuyển sang `active`.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

// Offline ⇒ query tạm dừng và tự chạy lại khi có mạng — xem docblock ở `lib/network.ts`.
wireOnlineManager();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tắt mặc định — xem khối focusManager ở trên; query nào cần tự bật `always`.
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

/*
 * Lượt TẠM DỪNG vì offline (query lẫn mutation) ⇒ báo `NetworkBanner` hiện hộp "Không có kết nối
 * mạng". Chỉ bắt hành động `pause` — query đang ngủ ở cache không phát gì, nên hộp chỉ hiện khi
 * thật sự có một request vừa định đi. `NetworkBanner` tự giãn nhịp để vài query song song không
 * bật hộp nhiều lần.
 */
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'pause') notifyOffline();
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated' && event.action.type === 'pause') notifyOffline();
});
