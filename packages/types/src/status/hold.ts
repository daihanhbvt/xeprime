/**
 * Khoản GIỮ CHỖ của tuyến hoa hồng — ADR 0021.
 *
 * Ba điều đóng đinh ở tầng từ vựng này:
 *
 *  - **Khoản giữ chỗ KHÔNG phải cọc.** Cọc xe là tài sản giữ hộ giữa khách và gian hàng, hai bên
 *    tự thoả thuận, nền tảng không đụng tới (ADR 0020 điều 4) — nó có bộ từ vựng riêng ở
 *    `settlement.ts`. Khoản này là **phí dịch vụ của chính nền tảng**. Gọi lẫn tên là cách nhanh
 *    nhất để ai đó viết code hoàn nhầm khoản.
 *  - **`status` và `outcome` là HAI câu hỏi khác nhau.** *Tiền đã về chưa* và *cuối cùng tiền về
 *    tay ai* sống ở hai thời điểm khác nhau: `status` chốt trong vài phút đầu, `outcome` chốt khi
 *    chuyến kết thúc hoặc bị huỷ. Gộp lại là mất một trong hai.
 *  - **`BOOKING_STATUS` không có trạng thái nào ở đây.** ADR 0013 ràng buộc 2 cấm trạng thái
 *    "chờ thanh toán" trên đơn thuê, và ADR 0021 giữ đúng nghĩa đen của lệnh cấm đó.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Mục đích: tiền này của AI ───────────────────────────────────────────────

/**
 * Khoản giữ chỗ có hai mục đích, và chúng khác nhau ở chỗ quan trọng nhất — **tiền của ai**
 * (ADR 0025 điều 1).
 *
 * ⚠️ **Đây là một CỘT đóng băng lúc tạo hold, không phải thứ suy từ `billingMode` lúc đọc.**
 * Chế độ thu phí của một tenant đổi được; mục đích của một khoản tiền đã nhận thì không. Viết
 * `mode === 'package' ? 'escrow' : 'commission'` khi đọc một hold đã tồn tại là cách để một
 * khoản tiền đổi chủ vì ai đó bấm nâng cấp gói.
 */
export const BOOKING_HOLD_PURPOSE = {
  /** Tiền CỦA NỀN TẢNG — chính là phí dịch vụ (ADR 0021). Giữ lại khi chuyến hoàn thành. */
  COMMISSION: 'commission',
  /** Tiền CỦA GIAN HÀNG, nền tảng chỉ giữ hộ (ADR 0025). **Không bao giờ** giữ lại. */
  ESCROW: 'escrow',
} as const;

export type BookingHoldPurpose =
  (typeof BOOKING_HOLD_PURPOSE)[keyof typeof BOOKING_HOLD_PURPOSE];

export const BOOKING_HOLD_PURPOSE_VALUES = Object.values(
  BOOKING_HOLD_PURPOSE,
) as BookingHoldPurpose[];

export function isBookingHoldPurpose(value: unknown): value is BookingHoldPurpose {
  return typeof value === 'string' && (BOOKING_HOLD_PURPOSE_VALUES as string[]).includes(value);
}

/** Khoản này có phải nợ phải trả của nền tảng không — dùng khi tách quỹ (ADR 0025 điều 6). */
export function isHeldForSomeoneElse(purpose: BookingHoldPurpose): boolean {
  return purpose === BOOKING_HOLD_PURPOSE.ESCROW;
}

// ── Trạng thái: tiền đã về chưa ─────────────────────────────────────────────

export const BOOKING_HOLD_STATUS = {
  /** Đã phát VietQR, đang chờ khách chuyển. Chiếm lịch (khoá mềm — ADR 0021 điều 6). */
  PENDING: 'pending',
  /** Tiền về nhưng THIẾU — không tạo đơn, giữ nguyên mã để khách chuyển bù (ADR 0022 điều 5). */
  UNDERPAID: 'underpaid',
  /** Đã đủ tiền. Đơn thuê được tạo trong CÙNG transaction, nên không có khoảng "đã trả mà chưa có đơn". */
  PAID: 'paid',
  /** Quá cửa sổ chuyển khoản mà chưa đủ tiền — worker ghi, nhả lịch. */
  EXPIRED: 'expired',
  /** Khách bỏ trước khi chuyển tiền. Không có gì để hoàn. */
  CANCELLED: 'cancelled',
  /** Đã chốt kết cục — xem `outcome`. Đây là trạng thái cuối của mọi hold đã từng `PAID`. */
  RELEASED: 'released',
} as const;

export type BookingHoldStatus = (typeof BOOKING_HOLD_STATUS)[keyof typeof BOOKING_HOLD_STATUS];

export const BOOKING_HOLD_STATUS_VALUES = Object.values(
  BOOKING_HOLD_STATUS,
) as BookingHoldStatus[];

export function isBookingHoldStatus(value: unknown): value is BookingHoldStatus {
  return typeof value === 'string' && (BOOKING_HOLD_STATUS_VALUES as string[]).includes(value);
}

export const BOOKING_HOLD_STATUS_META: Readonly<Record<BookingHoldStatus, StatusMeta>> = {
  [BOOKING_HOLD_STATUS.PENDING]: { label: 'Chờ chuyển giữ chỗ', color: STATUS_COLOR.WAITING },
  [BOOKING_HOLD_STATUS.UNDERPAID]: { label: 'Chuyển còn thiếu', color: STATUS_COLOR.WARNING },
  [BOOKING_HOLD_STATUS.PAID]: { label: 'Đã giữ chỗ', color: STATUS_COLOR.SUCCESS },
  [BOOKING_HOLD_STATUS.EXPIRED]: { label: 'Hết hạn chuyển', color: STATUS_COLOR.NEUTRAL },
  [BOOKING_HOLD_STATUS.CANCELLED]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
  [BOOKING_HOLD_STATUS.RELEASED]: { label: 'Đã chốt', color: STATUS_COLOR.INFO },
};

/** Hold còn đang chờ tiền — chiếm lịch và đếm vào giới hạn số hold mở của một khách. */
export const BOOKING_HOLD_STATUS_AWAITING: readonly BookingHoldStatus[] = [
  BOOKING_HOLD_STATUS.PENDING,
  BOOKING_HOLD_STATUS.UNDERPAID,
];

export function isAwaitingPayment(status: BookingHoldStatus): boolean {
  return BOOKING_HOLD_STATUS_AWAITING.includes(status);
}

// ── Kết cục: tiền về tay ai ─────────────────────────────────────────────────

/**
 * Ba khả năng, không có khả năng thứ tư — ADR 0021 điều 10.
 *
 * `null` (chưa chốt) là trạng thái hợp lệ suốt chuyến đi; nó chỉ được điền trong cùng transaction
 * với bước chuyển trạng thái của đơn thuê.
 */
export const BOOKING_HOLD_OUTCOME = {
  /**
   * Chuyến hoàn thành — nền tảng giữ. Không chuyển đi đâu, không sinh dòng ví nào.
   *
   * ⚠️ **CHỈ hợp lệ với `purpose = commission`.** Một escrow mang `kept` nghĩa là nền tảng vừa
   * giữ tiền của gian hàng — đó là lỗi kế toán, không phải một trạng thái, nên nó bị chặn bằng
   * `CHECK` ở migration chứ không bằng quy ước trong code (ADR 0025 điều 4).
   */
  KEPT: 'kept',
  /** Huỷ trước mốc miễn phí, hoặc chủ xe huỷ, hoặc khách chuyển thừa — ghi có VÍ KHÁCH. */
  REFUNDED: 'refunded',
  /** Huỷ muộn hoặc khách không đến — ghi có VÍ GIAN HÀNG làm bồi thường. */
  FORFEITED: 'forfeited',
  /**
   * Chuyến hoàn thành và khoản này vốn là tiền của gian hàng — trả về VÍ GIAN HÀNG (ADR 0025).
   *
   * Tách khỏi `forfeited` dù cùng đích đến: `forfeited` là **bồi thường vì khách sai hẹn**, còn
   * đây là **trả lại tiền của chính họ**. Gộp hai cái làm báo cáo của gian hàng nói sai về việc
   * khách của họ có đáng tin hay không.
   */
  RELEASED_TO_SHOP: 'released_to_shop',
} as const;

export type BookingHoldOutcome = (typeof BOOKING_HOLD_OUTCOME)[keyof typeof BOOKING_HOLD_OUTCOME];

export const BOOKING_HOLD_OUTCOME_VALUES = Object.values(
  BOOKING_HOLD_OUTCOME,
) as BookingHoldOutcome[];

export function isBookingHoldOutcome(value: unknown): value is BookingHoldOutcome {
  return typeof value === 'string' && (BOOKING_HOLD_OUTCOME_VALUES as string[]).includes(value);
}

export const BOOKING_HOLD_OUTCOME_META: Readonly<Record<BookingHoldOutcome, StatusMeta>> = {
  [BOOKING_HOLD_OUTCOME.KEPT]: { label: 'Đã dùng cho chuyến', color: STATUS_COLOR.SUCCESS },
  [BOOKING_HOLD_OUTCOME.REFUNDED]: { label: 'Đã hoàn khách', color: STATUS_COLOR.INFO },
  [BOOKING_HOLD_OUTCOME.FORFEITED]: { label: 'Bồi thường chủ xe', color: STATUS_COLOR.WARNING },
  [BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP]: {
    label: 'Đã chuyển gian hàng',
    color: STATUS_COLOR.SUCCESS,
  },
};

/**
 * Kết cục này có hợp lệ với mục đích kia không — ADR 0025 điều 4.
 *
 * Đây là bản sao ở tầng ứng dụng của ràng buộc `CHECK` trong migration, để giao diện và service
 * không dựng ra một lựa chọn mà database sẽ từ chối. **Nó không thay thế ràng buộc DB** — chống
 * ghi sai tiền luôn là việc của database (cùng kỷ luật ADR 0006).
 */
export function isOutcomeAllowed(
  purpose: BookingHoldPurpose,
  outcome: BookingHoldOutcome,
): boolean {
  if (purpose === BOOKING_HOLD_PURPOSE.ESCROW) return outcome !== BOOKING_HOLD_OUTCOME.KEPT;
  return outcome !== BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP;
}

/** Kết cục này có ghi có vào ví gian hàng không — dùng khi dựng bút toán. */
export function creditsShopWallet(outcome: BookingHoldOutcome): boolean {
  return (
    outcome === BOOKING_HOLD_OUTCOME.FORFEITED ||
    outcome === BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP
  );
}
