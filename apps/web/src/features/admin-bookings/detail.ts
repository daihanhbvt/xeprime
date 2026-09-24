import { BOOKING_STATUS, type BookingStatus, type MoneyString } from '@xeprime/types';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import type { AdminBookingDetail } from './types';

/**
 * Mốc trên dòng thời gian của một đơn — suy từ `status` + các mốc thời gian API THẬT trả về.
 *
 * Chỉ có những mốc mà `PlatformBookingDetailDto` chứng minh được:
 *  - `created`   — `createdAt` của đơn.
 *  - `pickedUp`  — `actualPickupAt`: biên bản giao xe xác nhận, đơn sang `active` trong CÙNG
 *                  transaction (ADR 0047).
 *  - `completed` — biên bản trả xe xác nhận: đơn sang `completed` và ghi `actualReturnAt` trong
 *                  CÙNG transaction, nên đó chính là mốc hoàn thành.
 *  - `cancelled` / `noShow` — điểm cuối tiêu cực, thay cho hai mốc sau. API không có
 *                  `cancelledAt`, nên mốc này KHÔNG có giờ (không mượn `updatedAt`).
 *
 * Cố ý KHÔNG có "Tạo yêu cầu", "Chủ xe xác nhận", "Đã thanh toán giữ chỗ": DTO nền tảng không
 * mang giờ tạo yêu cầu, giờ duyệt hay giờ tiền về, và cũng không cho biết đơn có đi qua luồng
 * yêu cầu hay do gian hàng tự lập. Dựng các mốc đó là bịa lịch sử cho đơn.
 */
export const BOOKING_TIMELINE_STEP = {
  CREATED: 'created',
  PICKED_UP: 'pickedUp',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noShow',
} as const;

export type BookingTimelineStepKey =
  (typeof BOOKING_TIMELINE_STEP)[keyof typeof BOOKING_TIMELINE_STEP];

export const BOOKING_TIMELINE_STATE = {
  DONE: 'done',
  TODO: 'todo',
  FAILED: 'failed',
} as const;

export type BookingTimelineState =
  (typeof BOOKING_TIMELINE_STATE)[keyof typeof BOOKING_TIMELINE_STATE];

export interface BookingTimelineStep {
  key: BookingTimelineStepKey;
  state: BookingTimelineState;
  /** ISO-8601; `null` = mốc chưa tới, hoặc API không ghi giờ cho mốc này. */
  at: string | null;
}

type TimelineSource = Pick<
  AdminBookingDetail,
  'status' | 'createdAt' | 'actualPickupAt' | 'actualReturnAt'
>;

export function buildBookingTimeline(booking: TimelineSource): BookingTimelineStep[] {
  const status = booking.status as BookingStatus;
  const created: BookingTimelineStep = {
    key: BOOKING_TIMELINE_STEP.CREATED,
    state: BOOKING_TIMELINE_STATE.DONE,
    at: booking.createdAt,
  };

  // Huỷ và "khách không đến" chỉ đi ra từ đơn CHƯA giao xe (`BOOKING_STATUS_TRANSITIONS`), nên
  // không có mốc giao xe nào bị bỏ sót ở hai nhánh này.
  if (status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.NO_SHOW) {
    return [
      created,
      {
        key:
          status === BOOKING_STATUS.CANCELLED
            ? BOOKING_TIMELINE_STEP.CANCELLED
            : BOOKING_TIMELINE_STEP.NO_SHOW,
        state: BOOKING_TIMELINE_STATE.FAILED,
        at: null,
      },
    ];
  }

  const completed = status === BOOKING_STATUS.COMPLETED;
  const pickedUp = completed || status === BOOKING_STATUS.ACTIVE || booking.actualPickupAt != null;

  return [
    created,
    {
      key: BOOKING_TIMELINE_STEP.PICKED_UP,
      state: pickedUp ? BOOKING_TIMELINE_STATE.DONE : BOOKING_TIMELINE_STATE.TODO,
      at: pickedUp ? (booking.actualPickupAt ?? null) : null,
    },
    {
      key: BOOKING_TIMELINE_STEP.COMPLETED,
      state: completed ? BOOKING_TIMELINE_STATE.DONE : BOOKING_TIMELINE_STATE.TODO,
      at: completed ? (booking.actualReturnAt ?? null) : null,
    },
  ];
}

/**
 * Đơn có nằm trong phạm vi công nợ không.
 *
 * Cùng luật với `SQL_DEBT_SCOPE` phía API: đơn ĐÃ HUỶ không nằm trong bất kỳ phép tính công nợ
 * nào. DTO nền tảng vẫn trả `debtAmount = tổng − đã thu` cho đơn huỷ (tính không theo phạm vi),
 * nên hiện nó cạnh mốc "Đã hủy" là nói với admin rằng khách đang nợ một chuyến không tồn tại.
 */
export function isInDebtScope(booking: Pick<AdminBookingDetail, 'status'>): boolean {
  return booking.status !== BOOKING_STATUS.CANCELLED;
}

/**
 * Phần của "Tổng thanh toán" không nằm ở ba dòng tiền thuê / phí giao xe / giảm giá.
 *
 * `totalAmount` của DTO nền tảng là PHẢI THU (`bookingMoney().amountDue` phía API = giá thuê đã
 * chốt + phụ phí phát sinh còn hiệu lực: quá giờ, vệ sinh, hư hại…). DTO không tách từng khoản,
 * nên phần chênh được hiện thành MỘT dòng để bảng tiền cộng khớp thay vì hở một khoảng không lời
 * giải thích. Phép trừ chạy trên chuỗi (ADR 0007). `null` khi không có phần chênh dương.
 */
export function otherChargesAmount(
  booking: Pick<
    AdminBookingDetail,
    'totalAmount' | 'baseAmount' | 'deliveryFee' | 'discountAmount'
  >,
): MoneyString | null {
  const rest = subtractMoney(
    subtractMoney(booking.totalAmount, booking.baseAmount),
    subtractMoney(booking.deliveryFee, booking.discountAmount),
  );
  return isZeroMoney(rest) || isNegativeMoney(rest) ? null : rest;
}

/**
 * Còn nợ có đáng tô màu cảnh báo không.
 *
 * Còn nợ > 0 trên một chuyến CHƯA kết thúc là chuyện bình thường (phần còn lại trả lúc nhận/trả
 * xe), tô đỏ nó là báo động giả trên gần như mọi dòng. Chỉ khi chuyến đã HOÀN THÀNH mà vẫn còn
 * nợ thì khoản đó mới thật sự quá hạn.
 */
export function isDebtOverdue(booking: Pick<AdminBookingDetail, 'status' | 'debtAmount'>): boolean {
  return (
    booking.status === BOOKING_STATUS.COMPLETED &&
    !isZeroMoney(booking.debtAmount) &&
    !isNegativeMoney(booking.debtAmount)
  );
}
