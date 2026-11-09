import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/**
 * "Có mạng dùng được" theo NetInfo. `isInternetReachable === null` nghĩa là NetInfo CHƯA đo xong
 * (vừa mở app, vừa đổi Wi-Fi) — coi là online, không thì app nháy banner offline ở mọi lần khởi
 * động. Chỉ `false` tường minh mới là "có sóng mà không ra được Internet" (Wi-Fi quán chưa đăng nhập).
 */
export function isNetInfoOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/*
 * Nối `onlineManager` vào NetInfo MỘT lần cho cả app (mẫu TanStack cho React Native), cạnh
 * `focusManager` ở `query-client.ts`. React Native không có `navigator.onLine` nên mặc định
 * TanStack coi app online MÃI MÃI: mất mạng thì query vẫn bắn, ăn hết lượt retry rồi rơi vào màn
 * lỗi. Có dòng này, query TẠM DỪNG khi offline (`fetchStatus: 'paused'`) và tự chạy lại lúc có
 * mạng. Mutation KHÔNG retry (query-client) nên không có lượt gửi lại nào bị nhân đôi.
 *
 * Mọi chỗ cần biết online/offline đọc `onlineManager` (qua `useIsOnline`) — một nguồn sự thật,
 * không mở listener NetInfo thứ hai.
 */
let wired = false;

export function wireOnlineManager(): void {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isNetInfoOnline(state));
    }),
  );
}

/*
 * Kênh "vừa đụng phải offline" — `NetworkBanner` nghe để hiện hộp thông báo tự tắt.
 *
 * Vì sao cần: khi offline TanStack TẠM DỪNG query/mutation (`fetchStatus: 'paused'`) chứ không
 * ném lỗi, nên khách bấm "Tìm kiếm" lúc mất mạng thì KHÔNG có gì xảy ra — như nút chết. Bắt đúng
 * lượt tạm dừng đó (`query-client.ts`) để báo "Không có kết nối mạng" ngay tại lúc khách thao tác.
 */
type OfflineListener = () => void;
const offlineListeners = new Set<OfflineListener>();

export function notifyOffline(): void {
  offlineListeners.forEach((listener) => listener());
}

export function subscribeOffline(listener: OfflineListener): () => void {
  offlineListeners.add(listener);
  return () => {
    offlineListeners.delete(listener);
  };
}
