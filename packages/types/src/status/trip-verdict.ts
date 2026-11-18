/**
 * KẾT LUẬN CHUYẾN của nhân sự nền tảng — ADR 0094 (16/11/2026).
 *
 * Hai case do worker mở khi CẢ HAI bên im lặng ở một mốc bàn giao (`handover_unconfirmed` sau giờ
 * nhận, `return_unconfirmed` sau giờ trả) chỉ kết thúc được bằng một trong các kết luận dưới đây —
 * không bằng nút "Kết luận" trần. Kết luận trần đóng case mà để đơn treo ở "Chờ giao xe" /
 * "Đang thuê" mãi: lịch xe bị chiếm, và tiền giữ chỗ không bao giờ tự chốt vì đơn không kết thúc.
 *
 * Mỗi kết luận đi qua ĐÚNG đường mà gian hàng hay khách sẽ đi (biên bản bàn giao, chuyển trạng thái
 * đơn), nên thuế, bảo hiểm, nhả lịch và quyết toán chạy y như thường — không có đường tiền thứ hai.
 */

import { BOOKING_STATUS, type BookingStatus } from './booking';
import { SUPPORT_CASE_CATEGORY, type SupportCaseCategory } from './support';

export const TRIP_VERDICT = {
  /** Xe ĐÃ giao — lập biên bản giao xe (nguồn `platform`), đơn sang `active`. */
  HANDED_OVER: 'handed_over',
  /** Khách không đến nhận xe — đơn sang `no_show`, tiền chốt như huỷ muộn. */
  CUSTOMER_NO_SHOW: 'customer_no_show',
  /** Chủ xe không giao được xe — đơn huỷ, hoàn khách 100%, trách nhiệm ghi cho chủ xe. */
  HOST_NOT_DELIVERED: 'host_not_delivered',
  /** Xe ĐÃ trả — lập biên bản trả xe (nguồn `platform`), đơn hoàn thành và quyết toán. */
  RETURNED: 'returned',
  /**
   * Chuyến hỏng mà không bên nào có lỗi xác minh được (hai bên thoả thuận huỷ, sự cố khách quan) —
   * đơn huỷ, hoàn khách 100%, lượt huỷ ghi phía `platform` nên không trừ uy tín chủ xe (ADR 0095).
   */
  PLATFORM_CANCELLED: 'platform_cancelled',
} as const;

export type TripVerdict = (typeof TRIP_VERDICT)[keyof typeof TRIP_VERDICT];
export const TRIP_VERDICT_VALUES = Object.values(TRIP_VERDICT) as TripVerdict[];

export function isTripVerdict(value: unknown): value is TripVerdict {
  return typeof value === 'string' && (TRIP_VERDICT_VALUES as string[]).includes(value);
}

interface TripVerdictCase {
  /** Trạng thái đơn mà câu hỏi của case còn để ngỏ. Đơn đã đi tiếp thì không còn gì để kết luận. */
  bookingStatuses: readonly BookingStatus[];
  verdicts: readonly TripVerdict[];
  /**
   * Case CHỈ khép được bằng một kết luận chuyến (kết luận/đóng trần bị chặn). Tranh chấp thì không:
   * nó có thể khép bằng thoả thuận mà chuyến vẫn diễn ra (ADR 0095 điều 2).
   */
  required: boolean;
  /**
   * Trạng thái đơn THÊM VÀO `bookingStatuses` khi case là lời báo "Chưa nhận được xe" của khách
   * (ADR 0104 điều 3): chủ xe đã bấm giao xe (`active`) nhưng khách nói không nhận được. Kết luận
   * chuyến khi đó GỠ biên bản giao xe trước rồi đi tiếp như đơn chưa giao.
   */
  tripNotReceivedStatuses?: readonly BookingStatus[];
}

/** Loại case nào cần kết luận chuyến, và kết luận nào hợp lệ cho nó. */
export const TRIP_VERDICT_CASES: Readonly<Partial<Record<SupportCaseCategory, TripVerdictCase>>> = {
  [SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED]: {
    bookingStatuses: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED],
    verdicts: [
      TRIP_VERDICT.HANDED_OVER,
      TRIP_VERDICT.CUSTOMER_NO_SHOW,
      TRIP_VERDICT.HOST_NOT_DELIVERED,
    ],
    required: true,
  },
  [SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED]: {
    bookingStatuses: [BOOKING_STATUS.ACTIVE],
    verdicts: [TRIP_VERDICT.RETURNED],
    required: true,
  },
  /*
   * Tranh chấp ở mốc nhận xe (ADR 0095): worker không mở `handover_unconfirmed` khi khách đã lên
   * tiếng, nên đây là lối DUY NHẤT để nền tảng khép một chuyến mà chủ xe bỏ mặc. Đơn đang chạy thì
   * CHỈ khi case là lời báo "Chưa nhận được xe" (ADR 0104 điều 3, thu hẹp "Không làm" của ADR 0095):
   * một tranh chấp khác giữa chuyến vẫn không huỷ được đơn `active` (ADR 0045 điều 1).
   */
  [SUPPORT_CASE_CATEGORY.DISPUTE]: {
    bookingStatuses: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED],
    tripNotReceivedStatuses: [BOOKING_STATUS.ACTIVE],
    verdicts: [
      TRIP_VERDICT.HANDED_OVER,
      TRIP_VERDICT.CUSTOMER_NO_SHOW,
      TRIP_VERDICT.HOST_NOT_DELIVERED,
      TRIP_VERDICT.PLATFORM_CANCELLED,
    ],
    required: false,
  },
};

/** Ngữ cảnh của case mà `tripVerdictsFor` cần ngoài loại case và trạng thái đơn. */
export interface TripVerdictCaseContext {
  /** Case là lời báo "Chưa nhận được xe" của khách (dấu `reason` trên dòng audit mở case). */
  tripNotReceived?: boolean;
}

/**
 * Kết luận này trên đơn này có phải GỠ biên bản giao xe trước không (ADR 0104 điều 3): đơn `active`
 * mà kết luận nói chuyến chưa từng bắt đầu. `handed_over` trên đơn `active` thì không gỡ gì - nó
 * chỉ xác nhận lượt giao xe đã có là thật.
 */
export function tripVerdictRevertsPickup(
  verdict: TripVerdict,
  bookingStatus: string | null | undefined,
): boolean {
  return (
    bookingStatus === BOOKING_STATUS.ACTIVE &&
    (verdict === TRIP_VERDICT.CUSTOMER_NO_SHOW ||
      verdict === TRIP_VERDICT.HOST_NOT_DELIVERED ||
      verdict === TRIP_VERDICT.PLATFORM_CANCELLED)
  );
}

/**
 * Các kết luận dùng được cho case này NGAY BÂY GIỜ — rỗng khi loại case không cần kết luận chuyến,
 * hoặc đơn đã rời trạng thái mà câu hỏi của case để ngỏ (chủ xe vừa xác nhận, vừa huỷ…).
 *
 * Một hàm cho cả hai phía: API (cổng thật của lượt kết luận và chốt chặn nút "Kết luận" trần) và
 * màn hỗ trợ (hiện nút nào).
 */
export function tripVerdictsFor(
  category: string,
  bookingStatus: string | null | undefined,
  context: TripVerdictCaseContext = {},
): readonly TripVerdict[] {
  const spec = TRIP_VERDICT_CASES[category as SupportCaseCategory];
  if (!spec || !bookingStatus) return [];
  const statuses: readonly string[] = context.tripNotReceived
    ? [...spec.bookingStatuses, ...(spec.tripNotReceivedStatuses ?? [])]
    : spec.bookingStatuses;
  return statuses.includes(bookingStatus) ? spec.verdicts : [];
}

/**
 * Case này CÒN PHẢI kết luận chuyến — kết luận/đóng trần bị chặn (`SUPPORT_CASE_TRIP_VERDICT_REQUIRED`).
 * Đúng khi có kết luận dùng được VÀ loại case bắt buộc nó (ADR 0094); tranh chấp không bắt buộc
 * (ADR 0095 điều 2). Một hàm cho chốt chặn ở server và cho màn hỗ trợ (ẩn nút trần).
 */
export function tripVerdictRequired(
  category: string,
  bookingStatus: string | null | undefined,
): boolean {
  const spec = TRIP_VERDICT_CASES[category as SupportCaseCategory];
  return spec?.required === true && tripVerdictsFor(category, bookingStatus).length > 0;
}
