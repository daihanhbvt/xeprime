import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { NOTIFICATION_TYPE, type NotificationType } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';

/**
 * Một chuyến đi có BA bề mặt nhìn vào nó, và một sự kiện đụng cả ba cùng lúc:
 *
 *  - `trips` — chuyến của KHÁCH (`/trips`);
 *  - `bookings` — cùng những chuyến đó, nhìn từ GIAN HÀNG (`/manage/bookings`);
 *  - `calendar` — ô lịch mà chuyến đang giữ. Huỷ một chuyến là trả lại một ô, và màn lịch không
 *    được phép còn hiện nó.
 *
 * Cùng một tài khoản có thể đang mở một trong ba (chủ xe tự thuê xe của người khác là chuyện
 * bình thường), nên không suy ra bề mặt từ vai người dùng — làm mới cả ba và để `invalidateQueries`
 * lọc: nó chỉ TẢI LẠI query đang có observer, phần còn lại chỉ bị đánh dấu cũ.
 */
const TRIP_BRANCHES = [
  queryKeys.trips.all,
  queryKeys.bookings.all,
  queryKeys.calendar.all,
] as const;

/** Yêu cầu thuê: thêm hộp thư chờ duyệt, vì duyệt xong nó BIẾN thành một chuyến. */
const REQUEST_BRANCHES = [queryKeys.bookingRequests.all, ...TRIP_BRANCHES] as const;

/** Giữ chỗ đổi trạng thái ⇒ đơn được tạo hoặc ô lịch được nhả. Cùng vòng đời với yêu cầu thuê. */
const HOLD_BRANCHES = REQUEST_BRANCHES;

/** Xe được duyệt/từ chối đổi cả kho xe lẫn thứ đang hiện trên chợ. */
const VEHICLE_BRANCHES = [queryKeys.vehicles.all, queryKeys.marketplace.all] as const;

/** Gian hàng được duyệt/từ chối đổi trạng thái tenant và mọi màn đọc nó. */
const SHOP_BRANCHES = [queryKeys.shop.all, queryKeys.tenants.all] as const;

/** Gói dịch vụ: trạng thái gói và hoá đơn đi liền nhau. */
const SUBSCRIPTION_BRANCHES = [queryKeys.subscription.all, queryKeys.billing.all] as const;

/**
 * KHÔNG làm mới gì.
 *
 * Dùng cho hai nhóm, vì hai lý do khác nhau:
 *  - tin nhắn — chat có đường tín hiệu riêng và màn hình của nó tự lo (ADR 0009). Nối thông báo
 *    vào việc tải lại hộp thư nghĩa là mỗi tin đến là một lượt gọi API cho một màn người dùng có
 *    thể đang không nhìn, và dòng dưới tay họ tự nhảy trong lúc đang cuộn;
 *  - những loại chỉ mang tin để ĐỌC (hồ sơ người bán, hỗ trợ) — không có danh sách nào đang mở
 *    nói sai vì thiếu chúng, còn danh sách thông báo thì đã được làm mới ở nơi gọi.
 */
const NONE: readonly QueryKey[] = [];

/**
 * Loại thông báo → những nhánh dữ liệu nó vừa làm đổi.
 *
 * Khai kiểu là `Record<NotificationType, …>` một cách CÓ CHỦ Ý: thêm một loại thông báo ở
 * `packages/types` mà quên ánh xạ ở đây thì typecheck đỏ ngay, thay vì im lặng rơi vào một nhánh
 * mặc định và để người dùng phát hiện hộ bằng một danh sách không chịu cập nhật.
 */
const BY_TYPE: Record<NotificationType, readonly QueryKey[]> = {
  // Vòng đời chuyến — đây là nhóm bạn thấy nhiều nhất: duyệt, huỷ, đổi trạng thái, nhắc nhận/trả.
  [NOTIFICATION_TYPE.BOOKING_CREATED]: TRIP_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: TRIP_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED]: REQUEST_BRANCHES,

  // Yêu cầu thuê — vừa là danh sách chờ duyệt, vừa là con số trên menu quản lý.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: REQUEST_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: REQUEST_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: REQUEST_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: REQUEST_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING]: REQUEST_BRANCHES,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED]: REQUEST_BRANCHES,

  // Giữ chỗ (ADR 0028/0032).
  [NOTIFICATION_TYPE.HOLD_REQUESTED]: HOLD_BRANCHES,
  [NOTIFICATION_TYPE.HOLD_PAID]: HOLD_BRANCHES,
  [NOTIFICATION_TYPE.HOLD_EXPIRING]: HOLD_BRANCHES,
  [NOTIFICATION_TYPE.HOLD_EXPIRED]: HOLD_BRANCHES,
  [NOTIFICATION_TYPE.HOLD_REFUND_PAID]: HOLD_BRANCHES,

  // Duyệt xe và duyệt gian hàng.
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: VEHICLE_BRANCHES,
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: VEHICLE_BRANCHES,
  [NOTIFICATION_TYPE.SHOP_APPROVED]: SHOP_BRANCHES,
  [NOTIFICATION_TYPE.SHOP_REJECTED]: SHOP_BRANCHES,

  // Gói dịch vụ.
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING]: SUBSCRIPTION_BRANCHES,
  [NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED]: SUBSCRIPTION_BRANCHES,
  [NOTIFICATION_TYPE.SUBSCRIPTION_LAPSED]: SUBSCRIPTION_BRANCHES,
  [NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED]: SUBSCRIPTION_BRANCHES,
  [NOTIFICATION_TYPE.FREE_TRIPS_EXHAUSTED]: SUBSCRIPTION_BRANCHES,

  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: [queryKeys.reviews.all],
  [NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED]: [queryKeys.sellerProfile.all],
  [NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED]: [queryKeys.sellerProfile.all],
  [NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED]: [queryKeys.sellerProfile.all],
  [NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED]: [queryKeys.supportCases.all],

  // Chat tự lo — xem `NONE`.
  [NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED]: NONE,
};

/**
 * Hợp của MỌI nhánh trong bản đồ — dùng khi KHÔNG biết loại.
 *
 * Bản chiếu huy hiệu (`user_badges/{uid}`) chỉ mang CON SỐ: nó nói "có thêm một thông báo chưa
 * đọc", không nói về chuyện gì. Loại chỉ đọc được từ `GET /notifications`, mà danh sách đó chỉ
 * tải khi người dùng MỞ chuông — tới lúc biết được loại thì đã quá muộn để làm mới màn đang xem.
 *
 * Dựng từ chính `BY_TYPE` chứ không chép tay một danh sách thứ hai: thêm một loại mới là tập này
 * tự rộng ra theo, không có chỗ nào để hai bên trôi khỏi nhau.
 */
const ALL_BRANCHES: readonly QueryKey[] = Array.from(
  new Map(
    Object.values(BY_TYPE)
      .flat()
      .map((queryKey) => [JSON.stringify(queryKey), queryKey] as const),
  ).values(),
);

/**
 * Làm mới đúng những danh sách mà một thông báo vừa làm đổi.
 *
 * `type = null` ⇒ làm mới rộng. Làm mới rộng là RẺ, và đây là lý do: `invalidateQueries` chỉ tải
 * lại những query đang có observer (màn hình đang mở); phần còn lại chỉ bị đánh dấu là cũ và sẽ
 * tự tải ở lần dùng kế tiếp. Nên chi phí thật là **tối đa một request cho màn đang mở**, không
 * phải một request cho mỗi nhánh.
 *
 * MỘT hàm cho cả hai đường tin tới — bản chiếu huy hiệu và payload FCM ở tiền cảnh. Hai đường đó
 * độc lập và đều có thể tới trước, nên nếu mỗi bên tự liệt kê thì sớm muộn một bên sẽ thiếu một
 * nhánh, và lỗi chỉ hiện ra ở đúng một trong hai lối.
 */
export function refreshForNotification(
  queryClient: QueryClient,
  type: NotificationType | null,
): void {
  for (const queryKey of type ? BY_TYPE[type] : ALL_BRANCHES) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
