import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const getSnapshot = () => onlineManager.isOnline();

/**
 * Máy có mạng dùng được không — đọc `onlineManager` của TanStack (nối NetInfo ở `lib/network.ts`).
 *
 * Dùng để KHOÁ nút của hành động phải tới server (gửi yêu cầu đặt xe, thanh toán, gửi tin, huỷ
 * chuyến) và hiện lý do bằng `<OfflineActionHint />`. Đây chỉ là UX: server vẫn là nơi quyết.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
