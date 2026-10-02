// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

import { buildPeriodRange } from '@xeprime/domain';

/**
 * Tổng quan gian hàng KHÔNG có endpoint riêng — nó COMPOSE từ chính các endpoint của module
 * nguồn, y như web: đội xe từ `/vehicles`, đơn từ `/bookings`, tiền từ `/finance` + `/receipts`.
 *
 * Đó là lý do file này chỉ có KHOẢNG THỜI GIAN và HẰNG SỐ, không có hàm gọi mạng nào: mọi truy
 * vấn đi qua đúng hàm mà màn nguồn dùng, nên hai bề mặt không thể nói hai con số khác nhau cho
 * cùng một câu hỏi (và cache dùng chung, không gọi trùng).
 */

/** Số dòng phiếu thu/chi hiện ở khối "Thu Chi hôm nay" — bản xem nhanh, không phải sổ. */
export const DASHBOARD_RECEIPT_LIMIT = 5;

/** Số đơn mỗi khối mini-list. */
export const DASHBOARD_BOOKING_LIMIT = 6;

/**
 * Kỳ của thẻ "Doanh thu": THÁNG NÀY theo giờ Việt Nam.
 *
 * Đi qua `buildPeriodRange` chứ không tự dựng `dayjs().startOf('month')` — cùng một hàm với bộ
 * lọc kỳ ở màn Tổng quan doanh thu, nên hai bề mặt không thể hiểu "tháng này" lệch nhau một ngày
 * ở biên múi giờ.
 */
export const dashboardMonthRange = (): { from: string; to: string } => buildPeriodRange('this_month');

/** Kỳ của khối "Thu Chi hôm nay" — trọn ngày hôm nay theo giờ Việt Nam. */
export const dashboardTodayRange = (): { from: string; to: string } => buildPeriodRange('today');
