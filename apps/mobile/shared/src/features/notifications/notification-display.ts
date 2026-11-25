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
  /**
   * CHỦ xe tuyến hoa hồng (Owner Lite) trong app Partner — gương `context === 'owner'` của web:
   * yêu cầu + đơn mở "Chuyến cho thuê", còn lại CÙNG màn với tuyến gói (audience MANAGE).
   */
  OWNER: 'owner',
} as const;

export type NotificationContext = (typeof NOTIFICATION_CONTEXT)[keyof typeof NOTIFICATION_CONTEXT];

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
  // Từ ADR 0053 Owner Lite sống ở site/app PARTNER — đích còn lại là đích của khu quản lý.
  [NOTIFICATION_CONTEXT.OWNER]: NOTIFICATION_AUDIENCE.MANAGE,
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
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: 'return-up-back-outline',
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
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED]: 'megaphone-outline',
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
  [NOTIFICATION_TYPE.HOLD_REFUNDED]: 'return-up-back-outline',
  [NOTIFICATION_TYPE.HOLD_REFUND_PAID]: 'return-up-back-outline',
  [NOTIFICATION_TYPE.WITHDRAWAL_PAID]: 'wallet-outline',
  [NOTIFICATION_TYPE.WITHDRAWAL_REJECTED]: 'wallet-outline',
  [NOTIFICATION_TYPE.WITHDRAWAL_REVERSED]: 'wallet-outline',
  /* Mã khuyến mãi không còn áp được (ADR 0046) — icon QUÀ, cùng ký hiệu với ô áp mã ở luồng đặt xe. */
  [NOTIFICATION_TYPE.PROMO_CODE_DROPPED]: 'gift-outline',
  // Hồ sơ người bán — icon chứng nhận, không phải icon gian hàng: đây là danh tính pháp lý.
  [NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED]: 'shield-checkmark-outline',
  [NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED]: 'chatbubble-ellipses-outline',
  [NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED]: 'chatbubble-ellipses-outline',
  // Tài xế liên kết (ADR 0063) — gương bộ icon web: thẻ cho lời mời, xe cho chuyến được gán.
  [NOTIFICATION_TYPE.DRIVER_INVITED]: 'id-card-outline',
  [NOTIFICATION_TYPE.DRIVER_INVITE_ACCEPTED]: 'checkmark-circle-outline',
  [NOTIFICATION_TYPE.DRIVER_INVITE_DECLINED]: 'close-circle-outline',
  [NOTIFICATION_TYPE.DRIVER_LINK_ENDED]: 'reader-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_ASSIGNED]: 'car-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_UNASSIGNED]: 'return-up-back-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_COMPLETED]: 'checkmark-circle-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_WAGE_CHANGED]: 'cash-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_ACCEPTED]: 'checkmark-circle-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED]: 'close-circle-outline',
  [NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED]: 'hourglass-outline',
  [NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING]: 'time-outline',
};

/**
 * HÌNH của một thông báo theo design v2 (Figma "Notification Item", tấm Thông báo `24512:124878`,
 * người dùng chốt 20/11/2026 cho cả hai app): Figma chỉ có bốn hình - tờ đơn CAM (việc thường),
 * tờ đơn ĐỎ (gấp/không thành), xe XANH (xe · chuyến · bàn giao), tin nhắn CAM (hỗ trợ · chat) -
 * thêm ví cam cho các khoản tiền (icon ví của cùng file Figma). Chỉ là TRÌNH BÀY, đích bấm vẫn do
 * `notificationHref` quyết.
 *
 * `Record` ĐẦY ĐỦ như `ICONS`: thêm loại mới mà quên xếp nhóm là lỗi biên dịch.
 */
export type NotificationLook = 'doc' | 'urgent' | 'car' | 'chat' | 'money';

const LOOKS: Readonly<Record<NotificationType, NotificationLook>> = {
  [NOTIFICATION_TYPE.BOOKING_CREATED]: 'doc',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: 'doc',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: 'doc',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED]: 'doc',
  [NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED]: 'doc',
  [NOTIFICATION_TYPE.SHOP_APPROVED]: 'doc',
  [NOTIFICATION_TYPE.SHOP_NEEDS_REVISION]: 'doc',
  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: 'doc',
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING]: 'doc',
  [NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED]: 'doc',
  [NOTIFICATION_TYPE.FREE_TRIPS_EXHAUSTED]: 'doc',
  [NOTIFICATION_TYPE.PROMO_CODE_DROPPED]: 'doc',
  [NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED]: 'doc',
  [NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED]: 'doc',
  [NOTIFICATION_TYPE.DRIVER_INVITED]: 'doc',
  [NOTIFICATION_TYPE.DRIVER_INVITE_ACCEPTED]: 'doc',
  [NOTIFICATION_TYPE.DRIVER_LINK_ENDED]: 'doc',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_TAKEN]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_CANCELLED_BY_HOST]: 'urgent',
  [NOTIFICATION_TYPE.SHOP_REJECTED]: 'urgent',
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: 'urgent',
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED]: 'urgent',
  [NOTIFICATION_TYPE.SUBSCRIPTION_LAPSED]: 'urgent',
  [NOTIFICATION_TYPE.HOLD_EXPIRING]: 'urgent',
  [NOTIFICATION_TYPE.HOLD_EXPIRED]: 'urgent',
  [NOTIFICATION_TYPE.WITHDRAWAL_REJECTED]: 'urgent',
  [NOTIFICATION_TYPE.WITHDRAWAL_REVERSED]: 'urgent',
  [NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED]: 'urgent',
  [NOTIFICATION_TYPE.DRIVER_INVITE_DECLINED]: 'urgent',
  [NOTIFICATION_TYPE.DRIVER_TRIP_UNASSIGNED]: 'urgent',
  [NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED]: 'urgent',
  [NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING]: 'urgent',
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: 'car',
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: 'car',
  [NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION]: 'car',
  [NOTIFICATION_TYPE.DRIVER_TRIP_ASSIGNED]: 'car',
  [NOTIFICATION_TYPE.DRIVER_TRIP_COMPLETED]: 'car',
  [NOTIFICATION_TYPE.DRIVER_TRIP_ACCEPTED]: 'car',
  [NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED]: 'chat',
  [NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED]: 'chat',
  [NOTIFICATION_TYPE.HOLD_REQUESTED]: 'money',
  [NOTIFICATION_TYPE.HOLD_PAID]: 'money',
  [NOTIFICATION_TYPE.HOLD_REFUNDED]: 'money',
  [NOTIFICATION_TYPE.HOLD_REFUND_PAID]: 'money',
  [NOTIFICATION_TYPE.WITHDRAWAL_PAID]: 'money',
  [NOTIFICATION_TYPE.DRIVER_TRIP_WAGE_CHANGED]: 'money',
};

export function notificationLook(type: string): NotificationLook {
  return LOOKS[type as NotificationType] ?? 'doc';
}

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
  /*
   * Chủ xe tuyến hoa hồng dùng CÙNG hộp thư + màn Đơn thuê với gian hàng từ web PR #278 — đơn và
   * yêu cầu đi đúng đích của khu quản lý, không còn "Chuyến cho thuê" riêng.
   */
  return hrefFromPath(notificationDeepLink(notification, AUDIENCE_OF[context]));
}
