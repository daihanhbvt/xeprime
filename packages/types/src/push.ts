/**
 * Thông báo ĐẨY (push) — hằng số của tầng giao vận, không phải của nghiệp vụ.
 *
 * Ranh giới cần giữ rõ: một `Notification` là BẢN GHI LOGIC trong hộp thư (nó có `readAt`,
 * nó sống trong `GET /notifications`). Một `PushDelivery` chỉ là "bản ghi đó đã tới THIẾT BỊ
 * nào chưa" — nhiều thiết bị thì nhiều dòng giao vận cho cùng MỘT thông báo. Vì thế
 * `NOTIFICATION_CHANNEL` không mọc thêm giá trị `push`: kênh mô tả loại bản ghi, và đẻ ra một
 * `Notification` thứ hai cho cùng sự kiện là nhân đôi hộp thư của người dùng.
 */

/** Nhà cung cấp. Hôm nay chỉ FCM (ADR 0009 dùng lại đúng Firebase project của chat). */
export const PUSH_PROVIDER = {
  FCM: 'fcm',
} as const;

export type PushProvider = (typeof PUSH_PROVIDER)[keyof typeof PUSH_PROVIDER];

export const PUSH_PROVIDER_VALUES = Object.values(PUSH_PROVIDER) as PushProvider[];

/**
 * Nền tảng của thiết bị đã đăng ký. Chỉ hai giá trị vì chỉ hai nền tảng có app native —
 * web nhận thông báo qua hộp thư in-app, không qua FCM.
 */
export const PUSH_PLATFORM = {
  ANDROID: 'android',
  IOS: 'ios',
} as const;

export type PushPlatform = (typeof PUSH_PLATFORM)[keyof typeof PUSH_PLATFORM];

export const PUSH_PLATFORM_VALUES = Object.values(PUSH_PLATFORM) as PushPlatform[];

export function isPushPlatform(value: unknown): value is PushPlatform {
  return typeof value === 'string' && (PUSH_PLATFORM_VALUES as string[]).includes(value);
}

/**
 * Vòng đời một lượt giao tới MỘT thiết bị.
 *
 *   pending → processing → sent
 *                        ↘ retry → processing → …
 *                        ↘ failed
 *
 * `processing` tồn tại để hai worker không cùng gửi một dòng: worker CHIẾM dòng bằng một
 * `UPDATE … WHERE status IN ('pending','retry')` rồi mới gọi FCM. Không có trạng thái trung
 * gian đó thì hai tiến trình đều đọc thấy `pending` và người dùng nhận hai lần cùng một tin.
 */
export const PUSH_DELIVERY_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  RETRY: 'retry',
  FAILED: 'failed',
} as const;

export type PushDeliveryStatus =
  (typeof PUSH_DELIVERY_STATUS)[keyof typeof PUSH_DELIVERY_STATUS];

export const PUSH_DELIVERY_STATUS_VALUES = Object.values(
  PUSH_DELIVERY_STATUS,
) as PushDeliveryStatus[];

/**
 * Mã lỗi ghi vào `push_deliveries.last_error_code`.
 *
 * Lưu MÃ chứ không lưu message của provider: message của FCM có chứa registration token trong
 * một số nhánh, và cột này thì được đọc trong màn hỗ trợ. Một tập mã hữu hạn cũng là thứ đếm
 * được — "bao nhiêu % thất bại vì token chết" là một câu hỏi vận hành thật.
 */
export const PUSH_ERROR_CODE = {
  /** Token không còn hợp lệ (gỡ app, khôi phục máy) — thiết bị bị tắt, không retry. */
  TOKEN_UNREGISTERED: 'token_unregistered',
  /** Token sai định dạng / sai project — cũng là lỗi vĩnh viễn của THIẾT BỊ. */
  TOKEN_INVALID: 'token_invalid',
  /** FCM tạm thời không phục vụ được (5xx, quota) — retry. */
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  /** Credential/quyền của service account sai — lỗi CẤU HÌNH, retry không cứu được. */
  PROVIDER_AUTH: 'provider_auth',
  /** Đã quá `expires_at` trước khi tới lượt gửi — tin đã hết giá trị, không gửi muộn. */
  EXPIRED: 'expired',
  /** Hết số lần thử. */
  MAX_ATTEMPTS: 'max_attempts',
  /** Không phân loại được — giữ một ô cho phần còn lại thay vì ghi nguyên lỗi vào DB. */
  UNKNOWN: 'unknown',
} as const;

export type PushErrorCode = (typeof PUSH_ERROR_CODE)[keyof typeof PUSH_ERROR_CODE];

/**
 * Độ ưu tiên gửi. `high` đánh thức máy ngay (Android bỏ qua Doze một nhịp, iOS đặt
 * `apns-priority: 10`) — dành cho tin CẦN PHẢN HỒI trong vài phút: yêu cầu thuê mới, tin nhắn,
 * đơn đổi trạng thái. Dùng cho mọi thứ là cách nhanh nhất để nhà mạng/OS bắt đầu hạ ưu tiên
 * của cả app.
 */
export const PUSH_PRIORITY = {
  NORMAL: 'normal',
  HIGH: 'high',
} as const;

export type PushPriority = (typeof PUSH_PRIORITY)[keyof typeof PUSH_PRIORITY];

/**
 * Kênh thông báo Android (`NotificationChannel`).
 *
 * ⚠️ App native CHƯA khai hai kênh này (`docs/push-notifications.md` §6, §9) — SDK của Firebase
 * rơi về kênh dự phòng của nó, nên thông báo vẫn hiện nhưng chưa tách được âm báo. Server vẫn gửi
 * đúng id để ngày app khai kênh thì không phải sửa gì ở phía gửi.
 */
export const ANDROID_NOTIFICATION_CHANNEL = {
  /** Việc cần người thật xử lý: yêu cầu thuê, đơn đổi trạng thái, tiền. */
  OPERATIONS: 'xeprime-operations',
  /** Tin nhắn chat — tách kênh để người dùng tắt riêng mà không tắt luôn tin về đơn. */
  MESSAGES: 'xeprime-messages',
} as const;

export type AndroidNotificationChannel =
  (typeof ANDROID_NOTIFICATION_CHANNEL)[keyof typeof ANDROID_NOTIFICATION_CHANNEL];

/**
 * Khoá của các trường trong `data` payload — client đọc theo đúng những tên này.
 *
 * `data` của FCM chỉ nhận string, và KHÔNG mang PII (tên, email, SĐT) hay số tiền: nó nằm lại
 * trong log của hệ điều hành và đọc lại được từ một bản sao lưu máy, trong khi `title`/`body`
 * thì người dùng nhìn thấy rồi vuốt đi. Ba trường dưới đây là đủ để app mở đúng chỗ và đối chiếu
 * lại với hộp thư.
 *
 * Lưu ý phạm vi: luật này áp cho `data`, KHÔNG phải cho `title`/`body` — vài loại thông báo
 * nghiệp vụ cố ý đặt tên khách hay số tiền vào phần chữ, và phần chữ đó cũng đi qua Google.
 */
export const PUSH_DATA_KEY = {
  NOTIFICATION_ID: 'notificationId',
  TYPE: 'type',
  URL: 'url',
} as const;
