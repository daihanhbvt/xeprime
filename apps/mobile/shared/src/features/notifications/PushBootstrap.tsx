import { usePushNotifications } from './use-push-notifications';

/**
 * Cắm vòng đời thông báo đẩy vào cây React — không vẽ gì.
 *
 * Là component chứ không phải một lời gọi hook thẳng trong `RootLayout` vì nó phải nằm BÊN
 * TRONG các provider: nó đọc phiên (TanStack Query), bắn toast (ToastProvider) và ghi
 * `pendingDeepLink` (Redux). Hook ở `RootLayout` sẽ chạy trước khi những thứ đó tồn tại.
 */
export function PushBootstrap(): null {
  usePushNotifications();
  return null;
}
