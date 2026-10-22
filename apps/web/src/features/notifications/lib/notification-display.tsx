import type { ReactNode } from 'react';
import {
  BellOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CreditCardOutlined,
  GiftOutlined,
  HourglassOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  MessageOutlined,
  NotificationOutlined,
  DollarOutlined,
  ShopOutlined,
  StarOutlined,
  ThunderboltOutlined,
  IdcardOutlined,
  SolutionOutlined,
} from '@ant-design/icons';
import { NOTIFICATION_TARGET_TYPE, NOTIFICATION_TYPE, type NotificationType } from '@xeprime/types';
import {
  ACCOUNT_SECTION,
  accountSectionPath,
  listingPath,
  ROUTES,
  tripPath,
  drivingTripPath,
} from '@/constants/routes';

/**
 * BỀ MẶT mà người dùng đang đứng khi bấm một thông báo — nó quyết định ĐÍCH, không quyết định
 * nội dung (ADR 0051 · ADR 0053):
 *
 *  - `customer` — site khách: chuyến của mình ở `/trips`, hộp thư khách ở `/chat`;
 *  - `manage`   — site partner, tuyến gói (và site quản trị): màn vận hành tương ứng;
 *  - `owner`    — site partner, tuyến hoa hồng (Owner Lite): CÙNG màn vận hành của site partner, trừ
 *    "gian hàng" dẫn về hồ sơ chủ xe (họ không có trang Cửa hàng của tuyến gói).
 *
 * Mỗi realm một tài khoản, nên một thông báo chỉ tới người ở đúng một bề mặt — không còn người
 * "hai vai" nhận cả thông báo khách lẫn thông báo chủ xe trong một hộp.
 */
export type NotificationContext = 'manage' | 'customer' | 'owner';

const ICONS: Readonly<Record<NotificationType, ReactNode>> = {
  [NOTIFICATION_TYPE.BOOKING_CREATED]: <CalendarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: <CarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: <CarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: <CloseCircleOutlined />,
  // Khách RÚT lại yêu cầu — khác chiều với shop từ chối, nên khác icon.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: <RollbackOutlined />,
  // Hạn phản hồi (động, ADR 0066): đồng hồ cho lời nhắc, đồng hồ-đã-dừng cho lúc hết giờ.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING]: <ClockCircleOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED]: <HourglassOutlined />,
  // Xe đã có khách khác: không ai từ chối, chỉ là chỗ đã hết — icon TRUNG TÍNH, không phải dấu X.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_TAKEN]: <CalendarOutlined />,
  /*
   * Chiếc xe RẢNH LẠI (ADR 0045 điều 6) — người thắng không thanh toán.
   *
   * Đây là tin VUI, và nó phải trông khác hẳn tin "chỗ đã hết" ở ngay trên: cùng icon lịch thì
   * hai dòng ngược nghĩa nhau lại nhìn y hệt. Tia sét cũng không đúng (đó là tự-nhận), nên đây
   * là chuông mở — một lời mời quay lại.
   */
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED]: <NotificationOutlined />,
  // Chủ xe rút lại chuyến ĐÃ NHẬN — dấu X, khác hẳn mũi tên "khách rút" ở trên.
  [NOTIFICATION_TYPE.BOOKING_CANCELLED_BY_HOST]: <CloseCircleOutlined />,
  // Hệ thống tự nhận chuyến theo thiết lập của chủ xe — tia sét, không phải dấu tích của người duyệt.
  [NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED]: <ThunderboltOutlined />,
  [NOTIFICATION_TYPE.SHOP_APPROVED]: <ShopOutlined />,
  [NOTIFICATION_TYPE.SHOP_REJECTED]: <ShopOutlined />,
  [NOTIFICATION_TYPE.SHOP_NEEDS_REVISION]: <ShopOutlined />,
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: <CarOutlined />,
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: <CarOutlined />,
  [NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION]: <CarOutlined />,
  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: <StarOutlined />,
  // Vòng đời gói (W2, ADR 0015/0026) — cùng icon thẻ với màn "Gói của tôi".
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING]: <CreditCardOutlined />,
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED]: <CreditCardOutlined />,
  [NOTIFICATION_TYPE.SUBSCRIPTION_LAPSED]: <CreditCardOutlined />,
  [NOTIFICATION_TYPE.FREE_TRIPS_EXHAUSTED]: <GiftOutlined />,
  [NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED]: <CreditCardOutlined />,
  // Khoản giữ chỗ (R3, ADR 0028): cùng họ icon TIỀN, phân biệt bằng chặng của nó.
  [NOTIFICATION_TYPE.HOLD_REQUESTED]: <DollarOutlined />,
  [NOTIFICATION_TYPE.HOLD_PAID]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.HOLD_EXPIRING]: <HourglassOutlined />,
  [NOTIFICATION_TYPE.HOLD_EXPIRED]: <HourglassOutlined />,
  [NOTIFICATION_TYPE.HOLD_REFUNDED]: <RollbackOutlined />,
  [NOTIFICATION_TYPE.HOLD_REFUND_PAID]: <RollbackOutlined />,
  /*
   * Mã khuyến mãi không còn áp được (ADR 0046) — icon QUÀ, cùng ký hiệu với ô áp mã ở luồng đặt
   * xe, để khách nhận ra ngay tin này nói về cái gì. Không dùng icon cảnh báo: đây là tin về một
   * ưu đãi, không phải về một sự cố của chuyến.
   */
  [NOTIFICATION_TYPE.PROMO_CODE_DROPPED]: <GiftOutlined />,
  // Hồ sơ người bán — dùng icon chứng nhận, không phải icon gian hàng: đây là danh tính pháp lý.
  [NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED]: <SafetyCertificateOutlined />,
  [NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED]: <SafetyCertificateOutlined />,
  [NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED]: <SafetyCertificateOutlined />,
  [NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED]: <MessageOutlined />,
  [NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED]: <MessageOutlined />,
  // Tài xế (ADR 0063): lời mời/liên kết = thẻ tài xế · chuyến được gán = xe.
  [NOTIFICATION_TYPE.DRIVER_INVITED]: <IdcardOutlined />,
  [NOTIFICATION_TYPE.DRIVER_INVITE_ACCEPTED]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.DRIVER_INVITE_DECLINED]: <CloseCircleOutlined />,
  [NOTIFICATION_TYPE.DRIVER_LINK_ENDED]: <SolutionOutlined />,
  [NOTIFICATION_TYPE.DRIVER_TRIP_ASSIGNED]: <CarOutlined />,
  [NOTIFICATION_TYPE.DRIVER_TRIP_UNASSIGNED]: <RollbackOutlined />,
  [NOTIFICATION_TYPE.DRIVER_TRIP_COMPLETED]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.DRIVER_TRIP_ACCEPTED]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED]: <CloseCircleOutlined />,
  // Hết hạn trả lời (ADR 0066) — đồng hồ cát, cùng họ với "quá hạn phản hồi" của yêu cầu thuê.
  [NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED]: <HourglassOutlined />,
  // Chuyến sắp nhận chưa có tài xế (ADR 0067) — việc có đồng hồ, cùng biểu tượng nhắc giờ.
  [NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING]: <ClockCircleOutlined />,
};

export function notificationIcon(type: string): ReactNode {
  return ICONS[type as NotificationType] ?? <BellOutlined />;
}

/**
 * Link click-through theo `targetType`. Người xem ở khu /manage đi tới màn shop tương ứng;
 * khách đi thẳng tới ĐÚNG chuyến. Trả null khi không có đích hợp lý (chỉ đánh dấu đã đọc).
 *
 * Phía khách, `booking` và `booking_request` đều phân giải về `/trips/:id`: backend nhận cả hai
 * loại id cho cùng một chuyến (Wave 11), nên thông báo cũ phát trước khi có đơn vẫn tới đúng
 * nơi. `review` thì không — `targetId` của nó là id đánh giá, không phải id chuyến, nên link
 * dừng ở danh sách thay vì dẫn tới một trang 404.
 */
export function notificationHref(
  notification: { targetType?: string | null; targetId?: string | null; type?: string | null },
  context: NotificationContext,
): string | null {
  const target = notification.targetType;

  /*
   * "Xe bạn hỏi đã rảnh lại" (ADR 0045 điều 6) là thông báo DUY NHẤT mà đích không suy được từ
   * `targetType` một mình.
   *
   * Nó trỏ vào một chiếc XE, và với mọi thông báo xe khác thì đích là trang quản lý xe của
   * chính chủ. Ở đây người nhận là KHÁCH, và việc họ cần làm là đặt lại — nên đích là trang xe
   * CÔNG KHAI. Yêu cầu cũ cố ý không sống lại (nó vẫn đóng ở `slot_taken`): giá và lịch phải
   * được chốt lại ở thời điểm hiện tại, không phải khôi phục từ một bản ghi đã nguội.
   */
  if (notification.type === NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED) {
    return notification.targetId ? listingPath.detail(notification.targetId) : null;
  }

  // Hội thoại mở ở ĐÚNG hộp thư của bề mặt đang xem — `?c=` mở sẵn thread kể cả khi nó không
  // nằm ở trang đầu danh sách. Hai hộp thư là hai trang khác nhau (ADR 0009), nên không có
  // "một địa chỉ dùng chung" như bên app native.
  if (target === NOTIFICATION_TARGET_TYPE.CONVERSATION) {
    // Khách → hộp thư khách; gian hàng (cả hai tuyến) → hộp thư phía gian hàng ở site partner.
    const base = context === 'customer' ? ROUTES.CHAT : ROUTES.MANAGE.CHAT;
    return notification.targetId ? `${base}?c=${encodeURIComponent(notification.targetId)}` : base;
  }

  if (context === 'customer') {
    switch (target) {
      case NOTIFICATION_TARGET_TYPE.BOOKING:
      case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
        return notification.targetId ? tripPath.detail(notification.targetId) : ROUTES.TRIPS;
      // `targetId` của review là id ĐÁNH GIÁ, không phải id chuyến — dừng ở danh sách.
      case NOTIFICATION_TARGET_TYPE.REVIEW:
        return ROUTES.TRIPS;
      // Tài xế là tài khoản KHÁCH (ADR 0063) — cùng đích với `notification-delivery.ts`.
      case NOTIFICATION_TARGET_TYPE.DRIVER_TRIP:
        return notification.targetId
          ? drivingTripPath.detail(notification.targetId)
          : drivingTripPath.list;
      case NOTIFICATION_TARGET_TYPE.DRIVER_LINK:
        return ROUTES.ACCOUNT.DRIVING;
      // Thông báo về XE/GIAN HÀNG chỉ tới tài khoản đối tác — khách không bao giờ nhận.
      default:
        return null;
    }
  }
  /*
   * Owner Lite: "Hồ sơ chủ xe" thay cho trang Cửa hàng, và "Chuyến cho thuê" thay cho CẢ hộp thư
   * yêu cầu lẫn bảng đơn (hai URL đó tự chuyển chủ xe sang đây — đi thẳng đỡ một lần chớp trang).
   * Còn lại CÙNG màn với tuyến gói.
   */
  if (context === 'owner') {
    if (target === NOTIFICATION_TARGET_TYPE.TENANT)
      return accountSectionPath(ACCOUNT_SECTION.PROFILE);
    if (
      target === NOTIFICATION_TARGET_TYPE.BOOKING ||
      target === NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST
    ) {
      return ROUTES.MANAGE.TRIPS;
    }
  }
  switch (target) {
    case NOTIFICATION_TARGET_TYPE.BOOKING:
      return ROUTES.MANAGE.BOOKINGS;
    case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
      return ROUTES.MANAGE.BOOKING_REQUESTS;
    case NOTIFICATION_TARGET_TYPE.TENANT:
      return ROUTES.MANAGE.SHOP;
    case NOTIFICATION_TARGET_TYPE.VEHICLE:
      return ROUTES.MANAGE.VEHICLES;
    // Cả hai tuyến quản lý tài xế ở cùng một trang (ADR 0063).
    case NOTIFICATION_TARGET_TYPE.DRIVER_LINK:
      return ROUTES.MANAGE.DRIVERS;
    default:
      return null;
  }
}
