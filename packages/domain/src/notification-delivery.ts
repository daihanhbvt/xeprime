import {
  ANDROID_NOTIFICATION_CHANNEL,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PUSH_DATA_KEY,
  PUSH_PRIORITY,
  type AndroidNotificationChannel,
  type NotificationType,
  type PushPriority,
} from '@xeprime/types';

/**
 * Thông báo đi ĐÂU, ồn tới mức nào, và gộp với tin nào — luật dùng chung cho mọi nơi phát
 * thông báo (API, worker) và mọi nơi tiêu thụ nó (app native).
 *
 * Ở `@xeprime/domain` chứ không nằm riêng bên API vì có BA phía cùng phải đồng ý một câu trả
 * lời: server đóng gói `data.url` vào payload FCM, worker gửi nó, và app native kiểm rồi điều
 * hướng theo. Ba bản kiểm khác nhau một dấu gạch chéo nghĩa là một thông báo mở ra màn trắng —
 * và không ai phát hiện được cho tới khi có người bấm vào nó.
 *
 * Đường dẫn ở đây là đường dẫn của APP NATIVE (cây `app/` của Expo Router). Web có bảng riêng
 * (`apps/web/src/features/notifications/lib/notification-display.tsx`) vì vài route của nó thật
 * sự khác — `/manage/booking-requests` bên web, `/manage/requests` bên app — và ép chung một
 * bảng sẽ khiến một trong hai bên trỏ vào 404.
 */

/**
 * Người nhận đang đứng ở BỀ MẶT nào. Cùng một `targetType` dẫn tới hai nơi khác nhau: khách xem
 * chuyến của mình ở `/trips/:id`, nhân viên gian hàng xử lý đúng đơn đó ở `/manage/bookings/:id`.
 */
export const NOTIFICATION_AUDIENCE = {
  CUSTOMER: 'customer',
  MANAGE: 'manage',
} as const;

export type NotificationAudience =
  (typeof NOTIFICATION_AUDIENCE)[keyof typeof NOTIFICATION_AUDIENCE];

export interface NotificationTargetRef {
  targetType?: string | null | undefined;
  targetId?: string | null | undefined;
}

/**
 * `targetId` được ghép thẳng vào đường dẫn, nên nó phải là một ID chứ không phải một chuỗi tuỳ ý.
 *
 * Mọi id trong hệ thống là ULID char(26) (ADR 0001), nhưng kiểm rộng hơn một chút để một mã
 * tham chiếu (`code`) lỡ lọt vào cũng không phá: chỉ chữ-số-gạch, độ dài có trần. Cái bị chặn là
 * `..`, `/`, `?`, `#` và khoảng trắng — tức là mọi cách biến một id thành một đường dẫn khác.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function idOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : null;
}

/**
 * Đích của một thông báo, dưới dạng đường dẫn NỘI BỘ bắt đầu bằng `/`.
 *
 * `null` = không có đích hợp lý (chỉ đánh dấu đã đọc). Nơi gọi KHÔNG được tự bịa một đường dẫn
 * thay thế: thà mở hộp thư còn hơn mở một trang 404 mang tên đúng.
 *
 * Thiếu `targetId` thì lùi về màn DANH SÁCH tương ứng chứ không dựng `/trips/undefined` —
 * thông báo cũ (phát trước khi một loại có id) vẫn phải bấm được.
 */
export function notificationDeepLink(
  target: NotificationTargetRef,
  audience: NotificationAudience,
): string | null {
  const id = idOrNull(target.targetId);

  // Chat KHÔNG phụ thuộc bề mặt: một hội thoại có đúng một địa chỉ, và app mở nó ở đúng vai của
  // người đang đăng nhập (`side` giải ở server, xem ChatService.resolveAccess).
  if (target.targetType === NOTIFICATION_TARGET_TYPE.CONVERSATION) {
    return id ? `/chat/${id}` : '/chat';
  }

  if (audience === NOTIFICATION_AUDIENCE.CUSTOMER) {
    switch (target.targetType) {
      // Backend nhận CẢ id yêu cầu lẫn id đơn cho `/trips/:id` — một chuyến, hai giai đoạn.
      case NOTIFICATION_TARGET_TYPE.BOOKING:
      case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
        return id ? `/trips/${id}` : '/trips';
      // `targetId` của review là id ĐÁNH GIÁ, không phải id chuyến — dừng ở danh sách.
      case NOTIFICATION_TARGET_TYPE.REVIEW:
        return '/trips';
      default:
        return null;
    }
  }

  switch (target.targetType) {
    case NOTIFICATION_TARGET_TYPE.BOOKING:
      return id ? `/manage/bookings/${id}` : '/manage/bookings';
    // Hộp thư yêu cầu không có màn chi tiết riêng ở app: mọi thao tác duyệt/từ chối nằm ngay
    // trong danh sách.
    case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
      return '/manage/requests';
    case NOTIFICATION_TARGET_TYPE.VEHICLE:
      return id ? `/manage/vehicles/${id}` : '/manage/vehicles';
    case NOTIFICATION_TARGET_TYPE.TENANT:
      return '/manage/shop';
    default:
      return null;
  }
}

/**
 * Khoá GỘP trên khay thông báo: tin mới thay chỗ tin cũ CÙNG khoá thay vì xếp chồng.
 *
 * Quan trọng nhất với chat — mười tin trong một hội thoại phải là MỘT dòng trên khay, không
 * phải mười dòng đẩy hết mọi thứ khác ra khỏi màn hình. Cũng đúng với một đơn đang đổi trạng
 * thái liên tục: người dùng chỉ cần biết trạng thái MỚI NHẤT.
 *
 * `null` = không gộp (mỗi tin đứng riêng), dùng cho loại mà mỗi lần phát là một việc khác nhau.
 */
export function pushCollapseKey(
  type: NotificationType,
  target: NotificationTargetRef,
): string | null {
  const id = idOrNull(target.targetId);
  if (!id) return null;

  switch (target.targetType) {
    case NOTIFICATION_TARGET_TYPE.CONVERSATION:
      return `conversation:${id}`;
    case NOTIFICATION_TARGET_TYPE.BOOKING:
      // Chỉ gộp các tin CẬP NHẬT của một đơn. "Đơn thuê mới" không gộp: nó là một việc mới xuất
      // hiện, và nuốt nó vào một dòng cũ là cách bỏ lỡ một chuyến.
      return type === NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED ? `booking:${id}` : null;
    case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
      // Nhắc "sắp hết hạn" phát hai lần cho cùng một yêu cầu (mốc 20' và 45') — hai dòng giống
      // hệt nhau nằm cạnh nhau chỉ dạy người trực cách bỏ qua cả hai.
      return type === NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING ? `request:${id}` : null;
    default:
      return null;
  }
}

/**
 * Loại nào đáng ĐÁNH THỨC máy.
 *
 * `high` là tài nguyên có hạn thật, không phải một cờ trang trí: Android bỏ qua Doze một nhịp
 * cho nó, và một app dùng `high` cho mọi thứ sẽ bị OS/nhà mạng hạ ưu tiên toàn cục. Vì vậy chỉ
 * những tin có ĐỒNG HỒ ĐẾM NGƯỢC hoặc cần trả lời trong vài phút mới được dùng.
 */
export function pushPriority(type: NotificationType): PushPriority {
  switch (type) {
    case NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED:
    case NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED:
    case NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING:
    case NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED:
    case NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED:
    case NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED:
    case NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED:
    case NOTIFICATION_TYPE.HOLD_REQUESTED:
    case NOTIFICATION_TYPE.HOLD_PAID:
      return PUSH_PRIORITY.HIGH;
    default:
      return PUSH_PRIORITY.NORMAL;
  }
}

/**
 * Kênh Android. Tách chat khỏi phần còn lại để người dùng tắt được tiếng tin nhắn mà vẫn nhận
 * tin về đơn — gộp một kênh thì lựa chọn duy nhất họ có là tắt hết.
 */
export function androidChannelFor(type: NotificationType): AndroidNotificationChannel {
  return type === NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED
    ? ANDROID_NOTIFICATION_CHANNEL.MESSAGES
    : ANDROID_NOTIFICATION_CHANNEL.OPERATIONS;
}

export interface PushDataInput {
  notificationId: string;
  type: NotificationType;
  url: string | null;
}

/**
 * `data` payload của FCM — CHỈ string, và chỉ ba trường.
 *
 * Không có tên khách, số điện thoại, biển số hay số tiền ở đây, kể cả khi chúng đã nằm trong
 * `title`/`body`: `data` được OS ghi log và đọc lại được từ một bản sao lưu máy, còn
 * `title`/`body` thì người dùng nhìn thấy rồi vuốt đi. Cả hai đều đi qua hạ tầng của Google —
 * ranh giới ở đây là "cái gì Ở LẠI trên máy", không phải "cái gì Google thấy".
 */
export function pushDataPayload(input: PushDataInput): Record<string, string> {
  return {
    [PUSH_DATA_KEY.NOTIFICATION_ID]: input.notificationId,
    [PUSH_DATA_KEY.TYPE]: input.type,
    ...(input.url ? { [PUSH_DATA_KEY.URL]: input.url } : {}),
  };
}
