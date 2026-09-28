import type { Href } from 'expo-router';
import {
  NOTIFICATION_AUDIENCE,
  notificationDeepLink,
  type NotificationAudience,
} from '@xeprime/domain';
import { NOTIFICATION_TYPE, type NotificationType } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { notificationHref as hrefFromPath } from './deep-link';

/** Ngữ cảnh xem thông báo — quyết định link click-through (khu quản lý vs khu khách). */
export const NOTIFICATION_CONTEXT = {
  MANAGE: 'manage',
  CUSTOMER: 'customer',
  /** Chủ xe tuyến hoa hồng — xem `NOTIFICATION_AUDIENCE.OWNER` (ADR 0038 điều 10). */
  OWNER: 'owner',
} as const;

export type NotificationContext =
  (typeof NOTIFICATION_CONTEXT)[keyof typeof NOTIFICATION_CONTEXT];

/**
 * Bề mặt đang xem → audience của `@xeprime/domain`.
 *
 * Hai hằng số mang CÙNG hai giá trị ('customer' | 'manage') và cùng một nghĩa, nhưng khai ở hai
 * nơi: `NOTIFICATION_CONTEXT` là của client (bề mặt nào đang mở), `NOTIFICATION_AUDIENCE` là
 * của domain (thông báo phát cho vai nào). Ánh xạ TƯỜNG MINH thay vì cast — trùng giá trị hôm
 * nay không phải lời hứa cho ngày mai, và một phép cast sẽ im lặng khi một bên thêm giá trị mới.
 */
const AUDIENCE_OF: Readonly<Record<NotificationContext, NotificationAudience>> = {
  [NOTIFICATION_CONTEXT.CUSTOMER]: NOTIFICATION_AUDIENCE.CUSTOMER,
  [NOTIFICATION_CONTEXT.MANAGE]: NOTIFICATION_AUDIENCE.MANAGE,
  [NOTIFICATION_CONTEXT.OWNER]: NOTIFICATION_AUDIENCE.OWNER,
};

/**
 * Biểu tượng theo loại thông báo — gương của `ICONS` trong `notification-display.tsx` bên web,
 * dịch sang Ionicons.
 *
 * CÙNG ngữ nghĩa, khác bộ hình: người dùng bấm một thông báo rồi sẽ gặp lại đúng khái niệm đó
 * trong menu, nên hình ở hai chỗ phải cùng họ (`manage-nav.ts` cũng dịch icon web sang Ionicons
 * theo cách này). Chép hẳn bộ AntD sang đây thì app phải kéo thêm một thư viện icon thứ hai —
 * đúng thứ CLAUDE.md mục 4 cấm.
 *
 * `Record` ĐẦY ĐỦ chứ không `Partial`: thêm một loại thông báo ở `@xeprime/types` mà quên ánh xạ
 * là lỗi biên dịch tại đây, không phải một cái chuông trống trơn trên máy người dùng.
 */
const ICONS: Readonly<Record<NotificationType, IconName>> = {
  [NOTIFICATION_TYPE.BOOKING_CREATED]: 'calendar-outline',
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: 'car-outline',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: 'car-outline',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: 'checkmark-circle-outline',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: 'close-circle-outline',
  // Khách RÚT lại yêu cầu — khác chiều với shop từ chối, nên khác icon.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: 'arrow-undo-outline',
  // Hạn phản hồi 60 phút: đồng hồ cho lời nhắc, đồng hồ cát cho lúc hết giờ.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING]: 'time-outline',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED]: 'hourglass-outline',
  // Xe đã có khách khác: không ai từ chối, chỉ là chỗ đã hết — icon TRUNG TÍNH, không phải dấu X.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_TAKEN]: 'calendar-clear-outline',
  /*
   * Chiếc xe RẢNH LẠI (ADR 0045 điều 6) — người thắng không thanh toán. Tin VUI, nên nó phải
   * trông khác hẳn dòng "chỗ đã hết" ngay trên: cùng icon lịch thì hai tin ngược nghĩa nhau
   * lại nhìn y hệt.
   *
   * KHÔNG dùng `notifications-outline`: đó là icon DỰ PHÒNG cho loại lạ (bản backend mới hơn
   * app). Gán nó cho một loại đã khai làm bài test "mọi loại đều có icon riêng" mất tác dụng —
   * một loại bị quên sau này sẽ trốn được sau đúng cái icon đó.
   */
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED]: 'sparkles-outline',
  // Chủ xe rút lại chuyến ĐÃ NHẬN — dấu X, khác hẳn mũi tên "khách rút" ở trên.
  [NOTIFICATION_TYPE.BOOKING_CANCELLED_BY_HOST]: 'close-circle-outline',
  // Hệ thống tự nhận chuyến theo thiết lập của chủ xe — tia sét, không phải dấu tích của người duyệt.
  [NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED]: 'flash-outline',
  [NOTIFICATION_TYPE.SHOP_APPROVED]: 'storefront-outline',
  [NOTIFICATION_TYPE.SHOP_REJECTED]: 'storefront-outline',
  [NOTIFICATION_TYPE.SHOP_NEEDS_REVISION]: 'storefront-outline',
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: 'car-outline',
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: 'car-outline',
  [NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION]: 'car-outline',
  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: 'star-outline',
  // Vòng đời gói (W2, ADR 0015/0026) — cùng icon thẻ với màn "Gói của tôi".
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING]: 'card-outline',
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED]: 'card-outline',
  [NOTIFICATION_TYPE.SUBSCRIPTION_LAPSED]: 'card-outline',
  [NOTIFICATION_TYPE.FREE_TRIPS_EXHAUSTED]: 'gift-outline',
  [NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED]: 'card-outline',
  // Khoản giữ chỗ (R3, ADR 0028): cùng họ icon TIỀN, phân biệt bằng chặng của nó.
  [NOTIFICATION_TYPE.HOLD_REQUESTED]: 'cash-outline',
  [NOTIFICATION_TYPE.HOLD_PAID]: 'checkmark-circle-outline',
  // Sắp hết hạn và ĐÃ hết hạn dùng chung đồng hồ cát — cùng cặp icon web dùng.
  [NOTIFICATION_TYPE.HOLD_EXPIRING]: 'hourglass-outline',
  [NOTIFICATION_TYPE.HOLD_EXPIRED]: 'hourglass-outline',
  [NOTIFICATION_TYPE.HOLD_REFUNDED]: 'arrow-undo-outline',
  [NOTIFICATION_TYPE.HOLD_REFUND_PAID]: 'arrow-undo-outline',
  /* Mã khuyến mãi không còn áp được (ADR 0046) — icon QUÀ, cùng ký hiệu với ô áp mã ở luồng đặt xe. */
  [NOTIFICATION_TYPE.PROMO_CODE_DROPPED]: 'gift-outline',
  // Hồ sơ người bán — icon chứng nhận, không phải icon gian hàng: đây là danh tính pháp lý.
  [NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED]: 'chatbubble-ellipses-outline',
  [NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED]: 'chatbubble-ellipses-outline',
};

export function notificationIcon(type: string): IconName {
  return ICONS[type as NotificationType] ?? 'notifications-outline';
}

/**
 * ĐƯỜNG LÙI cho dòng thông báo KHÔNG có `url`.
 *
 * ⚠️ Đây KHÔNG phải nguồn đúng. `GET /notifications` lọc theo `userId` chứ không theo audience,
 * nên một tài khoản vừa thuê xe vừa làm chủ gian hàng thấy CẢ HAI loại trong cùng một chuông —
 * và "bề mặt đang đứng" khi đó không nói lên được thông báo này phát cho vai nào. Nguồn đúng là
 * `NotificationDto.url`, do server giải lúc phát; xem `destinationOf` ở `NotificationBell`.
 *
 * Giữ lại vì dòng phát TRƯỚC 10/09/2026 chưa có `data_json`, nên `url` của chúng là `null`.
 *
 * KHÔNG tự dựng bảng phân nhánh ở đây. Nó đi qua ĐÚNG hai bước mà một thông báo đẩy đi:
 *
 *   1. `notificationDeepLink` của `@xeprime/domain` — cùng hàm server gọi lúc đóng băng
 *      `data_json.url`, nên dòng cũ và dòng mới dẫn tới cùng một chỗ;
 *   2. `notificationHref` của `./deep-link` — cùng allowlist mà payload FCM phải qua.
 *
 * Bản trước chép lại bảng đó và hai bản ĐÃ LỆCH NHAU: ở khu quản lý, domain trả
 * `/manage/bookings/:id` và `/manage/vehicles/:id` còn bản chép tay trả về màn DANH SÁCH, vứt
 * mất `targetId`. Cùng một thông báo mở ra hai nơi khác nhau tuỳ người dùng bấm từ khay hệ điều
 * hành hay từ chuông trong app.
 */
export function notificationHref(
  /**
   * `type` đi kèm vì một đích KHÔNG suy được từ `targetType` một mình: "xe bạn hỏi đã rảnh lại"
   * trỏ vào một chiếc xe nhưng đi tới trang xe CÔNG KHAI, không phải trang quản lý xe như mọi
   * thông báo `vehicle` khác (ADR 0045 điều 6). Bỏ nó ở đây là để dòng cũ mở sai chỗ.
   */
  notification: { targetType?: string | null; targetId?: string | null; type?: string | null },
  context: NotificationContext,
): Href | null {
  return hrefFromPath(notificationDeepLink(notification, AUDIENCE_OF[context]));
}
