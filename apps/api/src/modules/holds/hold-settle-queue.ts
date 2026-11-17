import { openSupportCaseWhere, type Prisma } from '@xeprime/prisma';
import {
  BOOKING_HOLD_STATUS,
  BOOKING_STATUS_VALUES,
  HOLD_SETTLE_REASON,
  SUPPORT_CASE_CATEGORY,
  isBookingFinal,
  type BookingStatus,
  type HoldSettleReason,
  type SupportCaseCategory,
} from '@xeprime/types';

/**
 * Hàng đợi CHỐT TAY khoản giữ chỗ — MỘT định nghĩa cho cả ba nơi đọc nó: danh sách
 * (`BookingHoldsService.listForPlatform` với `unsettled=true`), số đếm của dải thẻ Tài chính
 * (`PlatformMoneySummaryService`) và chốt chặn của `HoldSettlementService.adminSettle`. Ba nơi tự
 * viết điều kiện là ba nơi lệch nhau: thẻ đếm 12 mà danh sách hiện 3, hay nút chốt hiện mà server
 * từ chối.
 *
 * Luật (`HOLD_SETTLE_REASON`): hold đã trả, chưa có kết cục, VÀ đơn của nó hoặc đang có case giữ
 * quyết toán mở, hoặc đã kết thúc. Đơn còn chạy bình thường thì kết cục tự chốt khi đơn kết thúc —
 * người không có gì để làm ở đó, và chốt sớm là trả tiền cho chủ xe trước khi chuyến diễn ra.
 */

/** Trạng thái cuối của đơn — suy từ bảng chuyển trạng thái, không liệt kê tay (`isBookingFinal`). */
const BOOKING_FINAL_STATUSES: readonly BookingStatus[] =
  BOOKING_STATUS_VALUES.filter(isBookingFinal);

/** Điều kiện Prisma của hàng đợi chốt tay. */
export function holdAwaitingManualSettlementWhere(): Prisma.BookingHoldWhereInput {
  return {
    status: BOOKING_HOLD_STATUS.PAID,
    outcome: null,
    booking: {
      OR: [
        { status: { in: [...BOOKING_FINAL_STATUSES] } },
        { supportCases: { some: openSupportCaseWhere() } },
      ],
    },
  };
}

/** Đơn không có case giữ quyết toán nào mở (hay hold chưa gắn đơn). */
export const NO_OPEN_SETTLEMENT_CASES: ReadonlySet<SupportCaseCategory> = new Set();

/**
 * Vì sao MỘT hold cần người chốt — `null` khi không cần (chưa trả, đã chốt, hay đơn còn chạy mà
 * không có case). Hàm thuần, cùng luật với `holdAwaitingManualSettlementWhere`.
 *
 * Case mở đứng trước: đơn đã kết thúc mà case vẫn mở thì người chốt phải đọc case trước đã. Giữa
 * hai loại case, tranh chấp thắng — nó là việc nặng hơn của người trực.
 *
 * `openCaseCategories` là tập loại case GIỮ quyết toán còn mở trên đơn
 * (`openSupportCaseCategoriesByBooking`); loại khác lọt vào đây bị bỏ qua.
 */
export function holdSettleReason(input: {
  status: string;
  outcome: string | null;
  bookingStatus: string | null;
  openCaseCategories: ReadonlySet<SupportCaseCategory>;
}): HoldSettleReason | null {
  if (input.status !== BOOKING_HOLD_STATUS.PAID || input.outcome !== null) return null;
  if (input.bookingStatus === null) return null;
  if (input.openCaseCategories.has(SUPPORT_CASE_CATEGORY.DISPUTE)) {
    return HOLD_SETTLE_REASON.DISPUTE_OPEN;
  }
  if (input.openCaseCategories.has(SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED)) {
    return HOLD_SETTLE_REASON.HANDOVER_UNCONFIRMED;
  }
  if (BOOKING_FINAL_STATUSES.includes(input.bookingStatus as BookingStatus)) {
    return HOLD_SETTLE_REASON.BOOKING_ENDED;
  }
  return null;
}
