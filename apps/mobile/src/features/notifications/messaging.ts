import { PermissionsAndroid, Platform } from 'react-native';
import type { Messaging, RemoteMessage } from '@react-native-firebase/messaging';
import { PUSH_DATA_KEY, isNotificationType, type NotificationType } from '@xeprime/types';
import { PUSH_TRIGGER, chatDebug } from '@/lib/chat-debug';
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

/**
 * Android 13 — bản đầu tiên bắt người dùng CẤP quyền thông báo lúc chạy (`POST_NOTIFICATIONS`).
 * Từ bản dưới trở xuống, quyền có sẵn lúc cài và không có gì để hỏi.
 */
const ANDROID_RUNTIME_NOTIFICATION_PERMISSION_API = 33;

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
 * Người dùng ĐÃ cấp quyền thông báo chưa — ĐỌC THÔI, không bao giờ hiện hộp thoại.
 *
 * Tồn tại để tách hai việc từng bị gộp làm một: ĐĂNG KÝ thiết bị (phải làm ngay khi có phiên, nếu
 * không máy im lặng) và XIN quyền (phải làm lúc người dùng hiểu vì sao — xem docblock của
 * `usePushNotifications`). Ai đã cấp quyền từ lần cài trước thì đăng ký thẳng, không hỏi lại gì.
 *
 * Android không phân biệt được 'chưa hỏi' với 'đã từ chối' qua `check()`, và ở đây không cần
 * phân biệt: cả hai đều nghĩa là 'chưa có quyền, phải đi qua cửa xin quyền'.
 */
export async function hasPushPermission(): Promise<boolean> {
  const f = fcm();
  if (!f) return false;

  if (Platform.OS === 'android') {
    if (
      typeof Platform.Version === 'number' &&
      Platform.Version < ANDROID_RUNTIME_NOTIFICATION_PERMISSION_API
    ) {
      return true;
    }
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch (error) {
      logger.warn('[push] không đọc được trạng thái quyền Android', { error: String(error) });
      return false;
    }
  }

  try {
    const status = await f.api.hasPermission(f.instance);
    return (
      status === f.api.AuthorizationStatus.AUTHORIZED ||
      status === f.api.AuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    logger.warn('[push] không đọc được trạng thái quyền', { error: String(error) });
    return false;
  }
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

  /*
   * ANDROID ĐI ĐƯỜNG RIÊNG — và đây là chỗ dễ mất cả tính năng mà không có lỗi nào.
   *
   * `messaging().requestPermission()` trên Android là một hàm RỖNG:
   *
   *     public void requestPermission(ReadableMap permissions, Promise promise) {
   *       promise.resolve(1);   // 1 = AUTHORIZED
   *     }
   *
   * Nó KHÔNG hiện hộp thoại `POST_NOTIFICATIONS` của Android 13+, chỉ trả "đã cho phép" vô điều
   * kiện. Hệ quả trên máy mới cài: hệ điều hành CHẶN thông báo theo mặc định, app tin là đã có
   * quyền, đăng ký token thành công, FCM giao tin — rồi hệ điều hành lặng lẽ vứt đi. Không một
   * dòng lỗi nào ở cả hai đầu. Đã gặp thật ngày 14/09/2026 sau một lần prebuild + cài lại.
   *
   * Nên ở đây hỏi thẳng hệ điều hành. Dưới API 33 thì quyền được cấp lúc cài, không có gì để hỏi.
   */
  if (Platform.OS === 'android') {
    if (
      typeof Platform.Version === 'number' &&
      Platform.Version < ANDROID_RUNTIME_NOTIFICATION_PERMISSION_API
    ) {
      return true;
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        // Người dùng đã từ chối hai lần ⇒ hệ điều hành không hiện hộp thoại nữa. Phân biệt với
        // "vừa bấm Không" vì cách xử KHÁC HẲN: chỉ còn đường mở màn Cài đặt của app.
        logger.warn('[push] quyền thông báo bị chặn vĩnh viễn — phải bật trong Cài đặt');
        return false;
      }
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      logger.warn('[push] xin quyền Android thất bại', { error: String(error) });
      return false;
    }
  }

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
  f.api.setBackgroundMessageHandler(f.instance, async (message) => {
    /*
     * KHÔNG hiển thị gì ở đây: payload của XePrime luôn kèm khối `notification`, nên hệ điều
     * hành đã tự vẽ lên khay. Handler này chỉ để chạm được vào payload — và để RNFirebase
     * không cảnh báo "no background handler" mỗi lần nhận tin.
     *
     * Hai dòng log dưới đây là đường DUY NHẤT thấy được một tin tới lúc app ở nền: ba nhánh
     * kia đều nằm trong một React hook, mà lúc này không có cây React nào.
     */
    chatDebug.pushBackgroundDelivered(Boolean(message.notification));
    chatDebug.pushRaw(PUSH_TRIGGER.BACKGROUND_DELIVERED, message);
  });
}

/** Đọc `data.url` từ payload — luôn là string hoặc không có gì (FCM `data` chỉ nhận string). */
export function urlOf(message: RemoteMessage | null): string | null {
  const url = message?.data?.['url'];
  return typeof url === 'string' ? url : null;
}

/**
 * LOẠI thông báo trong payload — thứ cho phép làm mới đúng danh sách thay vì làm mới tất cả.
 *
 * Worker đặt trường này ở `data` cho MỌI tin (`pushDataPayload`), nên đường push luôn biết sự
 * kiện là về chuyện gì — khác hẳn bản chiếu huy hiệu, thứ chỉ mang một con số.
 *
 * Đi qua `isNotificationType` chứ không ép kiểu: `data` là dữ liệu ĐẾN TỪ NGOÀI, và một bản build
 * cũ gặp loại mới của server phải lùi về `null` (làm mới rộng) chứ không được tra vào một bản đồ
 * bằng một khoá không tồn tại.
 */
export function notificationTypeOf(message: RemoteMessage | null): NotificationType | null {
  const type = message?.data?.[PUSH_DATA_KEY.TYPE];
  return isNotificationType(type) ? type : null;
}
