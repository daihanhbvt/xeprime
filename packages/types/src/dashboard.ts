/**
 * TỔNG QUAN — từ vựng chung của ba bảng điều khiển: site partner (gian hàng tuyến gói, chủ xe tuyến
 * hoa hồng) và site quản trị.
 *
 * Hằng số ở đây là HỢP ĐỒNG giữa API và giao diện: API dùng để cắt dữ liệu, web dùng để nói đúng
 * phạm vi đó thành chữ ("7 ngày tới", "6 tháng gần nhất"). Hai bên đọc cùng một hằng thì không thể
 * có chuyện màn hình nói "7 ngày" trong khi server chỉ trả 3.
 */

/** Hai loại mốc trên lịch giao/nhận xe — mã đi trên dây, nhãn ở namespace `Dashboard`. */
export const DASHBOARD_AGENDA_KIND = {
  /** Đơn đã có, xe CHƯA rời bãi — mốc là giờ hẹn giao xe. */
  PICKUP: 'pickup',
  /** Xe đang ở với khách — mốc là giờ hẹn trả xe. */
  RETURN: 'return',
} as const;

export type DashboardAgendaKind = (typeof DASHBOARD_AGENDA_KIND)[keyof typeof DASHBOARD_AGENDA_KIND];

export const DASHBOARD_AGENDA_KIND_VALUES = Object.values(
  DASHBOARD_AGENDA_KIND,
) as DashboardAgendaKind[];

/**
 * Lịch giao/nhận nhìn xa bao nhiêu NGÀY LỊCH Việt Nam, tính cả hôm nay. Mốc đã QUÁ GIỜ luôn nằm
 * trong lịch dù cũ bao nhiêu: đó là việc cần làm nhất, không được tự rụng khỏi màn hình.
 */
export const DASHBOARD_AGENDA_DAYS = 7;

/**
 * Số mốc tối đa trên lịch giao/nhận. Tổng quan là bản xem nhanh "việc kế tiếp", không phải danh
 * sách đơn — phần còn lại nằm ở màn đơn thuê, và API báo `hasMore` để giao diện mời sang đó.
 */
export const DASHBOARD_AGENDA_LIMIT = 8;

/** Xu hướng chuyến thuê của gian hàng tuyến gói: số THÁNG LỊCH gần nhất, gồm tháng hiện tại. */
export const DASHBOARD_TREND_MONTHS = 6;

/** Xu hướng giao dịch của nền tảng: số NGÀY LỊCH gần nhất, gồm hôm nay. */
export const PLATFORM_DASHBOARD_TREND_DAYS = 30;
