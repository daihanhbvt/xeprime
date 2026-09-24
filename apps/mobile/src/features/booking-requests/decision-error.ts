import { API_ERROR_CODE } from '@xeprime/types';

/**
 * Khoá message của những lỗi QUYẾT ĐỊNH có LỐI ĐI TIẾP riêng — hàm thuần, soi gương
 * `decisionErrorText` / `cancelErrorText` của `use-booking-request-decisions` bên web.
 *
 * ## Vì sao tách ra khỏi component
 *
 * Mobile có BA bề mặt cùng duyệt/từ chối/huỷ một yêu cầu (hộp thư gian hàng, danh sách chuyến,
 * chi tiết chuyến) trong khi web chỉ có MỘT hook dùng chung. Ba bản chép tay là ba cơ hội để một
 * nhánh lỗi biến mất ở đúng một màn — và lỗi biến mất không làm test đỏ, nó chỉ làm người trực
 * đọc "Có lỗi xảy ra" rồi gọi hỗ trợ.
 *
 * Trả về KHOÁ chứ không trả chuỗi: hàm thuần thì test được toàn bộ bảng mà không cần dựng
 * provider i18n, và nơi gọi vẫn dịch bằng `t()` của chính namespace nó đang mở.
 *
 * `null` = không có câu riêng ⇒ nơi gọi rơi về `useErrorMessage()` (ánh xạ chung theo MÃ,
 * ADR 0012).
 */

/** Khoá thuộc namespace `BookingRequests`. */
export type DecisionErrorKey =
  | 'approve.scheduleConflict'
  | 'approve.expired'
  | 'cancel.raceLost'
  | 'cancel.notAllowed';

/**
 * DUYỆT và TỪ CHỐI — hai lỗi có lối đi tiếp riêng, nên chúng không được rơi vào câu chung:
 *
 *  - trùng lịch (409, từ constraint DB — ADR 0006): chọn khung giờ khác hoặc xe khác;
 *  - quá hạn phản hồi: không còn gì để bấm, việc cần làm là gọi cho khách.
 *
 * Dùng chung cho CẢ duyệt lẫn từ chối vì cả hai đi qua cùng cửa `claimPending` ở server — đúng
 * như bản web.
 */
export function decisionErrorKey(code: string | null): DecisionErrorKey | null {
  if (code === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) return 'approve.scheduleConflict';
  if (code === API_ERROR_CODE.BOOKING_REQUEST_EXPIRED) return 'approve.expired';
  return null;
}

/**
 * HUỶ có một nhánh mà duyệt/từ chối không có: **cuộc đua với đồng tiền**.
 *
 * Khách chuyển khoản đúng lúc người trực đang mở tấm trượt ⇒ webhook thắng, yêu cầu đã thành đơn
 * thuê, và lệnh huỷ không claim được gì (409). Câu chung ("có lỗi xảy ra") sẽ khiến họ bấm lại
 * vài lần rồi gọi hỗ trợ; câu đúng nói thẳng rằng tiền vừa về và việc cần làm nay nằm ở ĐƠN.
 *
 * `BOOKING_CANCEL_NOT_ALLOWED` là chặng đã trôi qua — cũng là một CÂU TRẢ LỜI có hướng đi
 * (ADR 0045 điều 1), không phải một lời từ chối cụt.
 */
export function cancelErrorKey(code: string | null): DecisionErrorKey | null {
  if (code === API_ERROR_CODE.CONFLICT) return 'cancel.raceLost';
  if (code === API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED) return 'cancel.notAllowed';
  return null;
}
