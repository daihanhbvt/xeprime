import { Platform } from 'react-native';
import type { Messaging, RemoteMessage } from '@react-native-firebase/messaging';
import { logger } from '@/lib/logger';

/**
 * Lớp mỏng bọc `@react-native-firebase/messaging` (API modular, bản 26).
 *
 * Tồn tại vì module native có thể KHÔNG có trong bản build đang chạy, và đó là trạng thái bình
 * thường chứ không phải sự cố:
 *  - Expo Go và bản web không có module native nào cả;
 *  - `app.config.ts` chỉ thêm plugin Firebase khi `google-services.json` /
 *    `GoogleService-Info.plist` tồn tại, nên một bản build không có credential cũng không có nó.
 *
 * `import` tĩnh sẽ NÉM ngay lúc nạp bundle trong cả ba trường hợp — tức là app chết ở màn trắng
 * vì một tính năng phụ. Vì vậy: `require` lười, bọc try/catch, và mọi hàm dưới đây trở thành
 * no-op khi không có module.
 */

type MessagingApi = typeof import('@react-native-firebase/messaging');

let cached: { api: MessagingApi; instance: Messaging } | null | undefined;

function fcm(): { api: MessagingApi; instance: Messaging } | null {
  if (cached !== undefined) return cached;

  // Web không có FCM native; ở đó thông báo đi qua hộp thư in-app như trên trình duyệt.
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp LƯỜI có chủ đích: xem docblock.
    const api = require('@react-native-firebase/messaging') as MessagingApi;
    // `getMessaging()` ném nếu app Firebase mặc định chưa được khởi tạo — tức là bản build
    // không có file credential. Cùng nhánh catch, cùng kết quả: không có push.
    cached = { api, instance: api.getMessaging() };
  } catch (error) {
    logger.debug('[push] không có module Firebase Messaging trong bản build này', {
      error: String(error),
    });
    cached = null;
  }
  return cached;
}

/** Bản build hiện tại có gửi/nhận được thông báo đẩy không. */
export function isPushAvailable(): boolean {
  return fcm() !== null;
}

/**
 * Xin quyền và trả về `true` nếu người dùng ĐỒNG Ý.
 *
 * Trên iOS `requestPermission()` chỉ hiện hộp thoại lần ĐẦU; các lần sau nó trả lại quyết định
 * đã lưu mà không làm phiền ai — nên không cần tự đếm số lần hỏi. Android 13+ cũng vậy: hệ điều
 * hành tự chặn sau khi người dùng từ chối hai lần.
 */
export async function requestPushPermission(): Promise<boolean> {
  const f = fcm();
  if (!f) return false;

  try {
    const status = await f.api.requestPermission(f.instance);
    // PROVISIONAL (iOS) vẫn tính là CÓ: thông báo vào Trung tâm thông báo, im lặng — người dùng
    // được hỏi "giữ hay tắt" sau vài tin, thay vì bị chặn ngay từ đầu.
    return (
      status === f.api.AuthorizationStatus.AUTHORIZED ||
      status === f.api.AuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    logger.warn('[push] xin quyền thất bại', { error: String(error) });
    return false;
  }
}

/**
 * Registration token của bản cài này, hoặc `null`.
 *
 * ⚠️ Giá trị trả về là BÍ MẬT ở mức "ai có nó thì gửi được thông báo tới máy này". Không log nó,
 * không đưa vào state Redux, không ghi ra file — chỉ POST thẳng lên API.
 */
export async function getPushToken(): Promise<string | null> {
  const f = fcm();
  if (!f) return null;

  try {
    return await f.api.getToken(f.instance);
  } catch (error) {
    logger.warn('[push] không lấy được token', { error: String(error) });
    return null;
  }
}

/** FCM tự xoay token (khôi phục máy, cài lại app). Trả về hàm huỷ đăng ký. */
export function onPushTokenRefresh(handler: (token: string) => void): () => void {
  const f = fcm();
  if (!f) return () => {};
  return f.api.onTokenRefresh(f.instance, handler);
}

/** Thông báo tới khi app ĐANG MỞ — hệ điều hành không tự hiện gì, app tự quyết. */
export function onPushMessage(handler: (message: RemoteMessage) => void): () => void {
  const f = fcm();
  if (!f) return () => {};
  return f.api.onMessage(f.instance, handler);
}

/** Người dùng BẤM vào thông báo khi app đang chạy nền. */
export function onPushOpened(handler: (message: RemoteMessage) => void): () => void {
  const f = fcm();
  if (!f) return () => {};
  return f.api.onNotificationOpenedApp(f.instance, handler);
}

/**
 * Thông báo đã MỞ app từ trạng thái tắt hẳn (cold start).
 *
 * Nhánh riêng vì `onNotificationOpenedApp` không bao giờ bắn trong trường hợp này: lúc thông
 * báo được bấm thì chưa có JS nào chạy để mà lắng nghe. Bỏ nhánh này nghĩa là bấm thông báo khi
 * app đã tắt sẽ mở ra trang chủ — triệu chứng mà người dùng mô tả là "thông báo không hoạt động".
 */
export async function getInitialPushMessage(): Promise<RemoteMessage | null> {
  const f = fcm();
  if (!f) return null;
  try {
    return await f.api.getInitialNotification(f.instance);
  } catch (error) {
    logger.warn('[push] không đọc được thông báo khởi động', { error: String(error) });
    return null;
  }
}

/**
 * Đăng ký handler cho thông báo tới khi app ở NỀN hoặc đã bị hệ điều hành thu hồi.
 *
 * Gọi ở phạm vi module (ngoài mọi component), không trong `useEffect`: khi Android đánh thức
 * app bằng một headless task, không có cây React nào được dựng.
 *
 * Nó KHÔNG chịu trách nhiệm hiển thị: payload của XePrime luôn kèm khối `notification`, nên hệ
 * điều hành tự vẽ thông báo lên khay. Handler này chỉ để chạm được vào payload (đo đếm, đồng bộ
 * sau này) — và để RNFirebase không cảnh báo "no background handler" mỗi lần nhận tin.
 */
export function registerPushBackgroundHandler(): void {
  const f = fcm();
  if (!f) return;
  f.api.setBackgroundMessageHandler(f.instance, async () => {
    // Cố ý rỗng — xem docblock. Không log payload: nó đi vào logcat của máy người dùng.
  });
}

/** Đọc `data.url` từ payload — luôn là string hoặc không có gì (FCM `data` chỉ nhận string). */
export function urlOf(message: RemoteMessage | null): string | null {
  const url = message?.data?.['url'];
  return typeof url === 'string' ? url : null;
}
