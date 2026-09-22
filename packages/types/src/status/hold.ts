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

// ── Ai thu cọc của chuyến này ───────────────────────────────────────────────

/**
 * AI thu khoản cọc `D` của một đơn — cột `bookings.deposit_collection_mode`.
 *
 * ⚠️ **ĐÓNG BĂNG lúc tạo đơn** (ADR 0025 ràng buộc 4). Gian hàng bật/tắt công tắc thu cọc về
 * sau KHÔNG được đổi cách hiểu một đơn đã chạy: hỏi lại công tắc lúc đọc là cách để một đơn
 * đang tranh chấp đổi câu trả lời về việc XePrime có giữ tiền của khách hay không.
 *
 * `null` = đơn gian hàng TỰ LẬP, ngoài luồng chợ (ADR 0028 điều 9) — cùng ngữ nghĩa với
 * `bookings.billing_mode` null. Ba giá trị dưới đây chỉ dành cho đơn sinh từ một yêu cầu thuê.
 */
export const DEPOSIT_COLLECTION_MODE = {
  /** XePrime giữ `D` qua `booking_holds`. Đơn chỉ ra đời khi tiền đã về. */
  PLATFORM: 'platform',
  /**
   * Chính sách CÓ cọc nhưng XePrime không thu — gian hàng tự thoả thuận trực tiếp với khách
   * (tuyến gói tắt công tắc). XePrime không thu hộ và không đối soát khoản này.
   */
  DIRECT: 'direct',
  /**
   * KHÔNG có cọc ở bất kỳ đâu: báo giá còn tạm tính lúc duyệt, hoặc chưa có chính sách phí
   * hiệu lực. Khác `direct` ở chỗ không có khoản nào để gian hàng đi thoả thuận.
   */
  NONE: 'none',
} as const;

export type DepositCollectionMode =
  (typeof DEPOSIT_COLLECTION_MODE)[keyof typeof DEPOSIT_COLLECTION_MODE];

export const DEPOSIT_COLLECTION_MODE_VALUES = Object.values(
  DEPOSIT_COLLECTION_MODE,
) as DepositCollectionMode[];

export function isDepositCollectionMode(value: unknown): value is DepositCollectionMode {
  return typeof value === 'string' && (DEPOSIT_COLLECTION_MODE_VALUES as string[]).includes(value);
}

/**
 * VÌ SAO chuyến này thu (hoặc không thu) cọc — kết quả của `DepositPolicyService`.
 *
 * Trả lý do chứ không chỉ trả boolean vì giao diện phải nói được câu khác nhau cho hai tình
 * huống trông giống hệt nhau từ phía khách: "gian hàng chọn không thu qua sàn" và "gói của
 * gian hàng chưa có năng lực này". Gộp thành một chữ "không" là bắt người dùng đoán.
 */
export const DEPOSIT_POLICY_REASON = {
  /**
   * GIAI ĐOẠN HIỆN TẠI: cả sàn thu cọc, không phân biệt tuyến (16/09/2026 — xem
   * `DEPOSIT_COLLECTION_PLATFORM_MANDATORY`). Đứng RIÊNG chứ không mượn
   * `commission_mandatory`: gian hàng tuyến gói cần đọc đúng lý do họ đang bị thu — "quy định
   * chung của sàn trong giai đoạn này", không phải "bạn đang ở tuyến hoa hồng" (sai) hay "gói
   * của bạn thiếu năng lực" (cũng sai).
   */
  PLATFORM_MANDATORY: 'platform_mandatory',
  /** Tuyến hoa hồng — BẮT BUỘC, không công tắc nào tắt được (ADR 0032 điều 2). */
  COMMISSION_MANDATORY: 'commission_mandatory',
  /** Tuyến gói: gói có `escrow_hold` và gian hàng đã bật công tắc. */
  PACKAGE_ENABLED: 'package_enabled',
  /** Tuyến gói: gói có năng lực nhưng gian hàng tắt công tắc. */
  PACKAGE_DISABLED: 'package_disabled',
  /** Tuyến gói: gói hiện hành không có `escrow_hold` — công tắc không bật được. */
  PACKAGE_FEATURE_MISSING: 'package_feature_missing',
  /**
   * KHÔNG xác định được tuyến (`BILLING_PHASE.UNCONFIGURED`) — danh mục gói rỗng, hoặc dòng
   * thuê bao gần nhất thiếu `billing_mode`.
   *
   * Đây là LỖI CẤU HÌNH, không phải một lựa chọn kinh doanh, nên nó có lý do riêng thay vì bị
   * gộp vào `package_disabled`. Gộp lại thì một danh mục gói hỏng trông y hệt một gian hàng cố
   * ý tắt thu cọc — và hệ quả là cả sàn lặng lẽ ngừng thu cọc lẫn phí dịch vụ mà không ai thấy
   * gì bất thường trên giao diện.
   */
  BILLING_NOT_CONFIGURED: 'billing_not_configured',
} as const;

export type DepositPolicyReason =
  (typeof DEPOSIT_POLICY_REASON)[keyof typeof DEPOSIT_POLICY_REASON];

export const DEPOSIT_POLICY_REASON_VALUES = Object.values(
  DEPOSIT_POLICY_REASON,
) as DepositPolicyReason[];

/**
 * CẢ SÀN THU CỌC trong giai đoạn này — công tắc của gian hàng tạm mất tiếng nói.
 *
 * Vì sao là một HẰNG SỐ trong mã chứ không phải biến môi trường: đây là một luật về TIỀN của
 * khách. Một biến env đổi được trên VPS nghĩa là hành vi thu tiền của cả sàn đổi mà không có
 * commit nào, không có review nào và không có dòng nào trong lịch sử giải thích vì sao tháng
 * trước thu còn tháng này không. Mở lại = sửa đúng dòng này (`false`), chạy test, merge — và
 * lúc đó `tenant_payment_settings.deposit_collection_enabled` đã có sẵn giá trị của từng gian
 * hàng để quay về, vì migration `20260916…` đã ghi `true` cho tất cả.
 *
 * Khi `false`, `DepositPolicyService` quay lại đúng luật hai trục của ADR 0027 điều 2 — không
 * có nhánh chết nào phải dọn.
 */
export const DEPOSIT_COLLECTION_PLATFORM_MANDATORY = true;

// ── Trạng thái: tiền đã về chưa ─────────────────────────────────────────────

export const BOOKING_HOLD_STATUS = {
  /**
   * Chuyến ĐÃ ĐƯỢC NHẬN, VietQR đã phát, đang chờ khách chuyển (ADR 0044 điều 2). Chiếm lịch —
   * chỗ đã thuộc về đúng một người.
   */
  PENDING: 'pending',
  /** Tiền về nhưng THIẾU — không tạo đơn, giữ nguyên mã để khách chuyển bù (ADR 0022 điều 5). */
  UNDERPAID: 'underpaid',
  /**
   * Đã đủ tiền.
   *
   * Ở luồng hiện hành (ADR 0044) đơn thuê được tạo trong CÙNG transaction, nên không có khoảng
   * "đã trả mà chưa có đơn". Hold LEGACY của ADR 0039 — sinh trước khi ai duyệt, nhận ra bằng
   * `booking_requests.decided_at IS NULL` — vẫn có thể nằm ở `paid` mà chưa có đơn cho tới khi
   * gian hàng bấm nhận.
   */
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
  /**
   * Chuyến HOÀN THÀNH — mỗi dòng tiền về đúng người hưởng (ADR 0033 điều 3).
   *
   * Thay `kept` cho hold sinh từ ADR 0032 trở đi: `kept` mang nghĩa "nền tảng giữ toàn bộ,
   * không sinh dòng ví nào", điều không còn đúng khi hold chứa `D` — một phần giá thuê, tức
   * tiền của chủ xe. Phân bổ cụ thể do `resolveHoldAllocation` quyết.
   */
  SETTLED: 'settled',
  /**
   * Khách huỷ MUỘN hoặc không đến — `D + S` chia đôi chủ xe/XePrime, `IV + IP` hoàn 100%
   * (ADR 0032 điều 5, ADR 0033 điều 3).
   *
   * Không dùng `forfeited` vì nó nói "toàn bộ khoản giữ chỗ về gian hàng" — sai ở hai chỗ: phần
   * bảo hiểm phải trả lại khách (hợp đồng chưa mua), và phần còn lại chia đôi chứ không về hết
   * một phía.
   */
  SPLIT_LATE_CANCEL: 'split_late_cancel',
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
  [BOOKING_HOLD_OUTCOME.SETTLED]: { label: 'Đã quyết toán', color: STATUS_COLOR.SUCCESS },
  [BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL]: {
    label: 'Huỷ muộn — chia đôi',
    color: STATUS_COLOR.WARNING,
  },
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
  /*
   * `settled` và `split_late_cancel` hợp lệ với CẢ HAI mục đích: từ ADR 0032, hold của cả hai
   * tuyến đều chứa tiền của nhiều người, nên phân bổ — chứ không phải `purpose` — mới là thứ
   * quyết định tiền đi đâu (ADR 0033 điều 4).
   */
  if (
    outcome === BOOKING_HOLD_OUTCOME.SETTLED ||
    outcome === BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL
  ) {
    return true;
  }
  if (purpose === BOOKING_HOLD_PURPOSE.ESCROW) return outcome !== BOOKING_HOLD_OUTCOME.KEPT;
  return outcome !== BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP;
}

/** Kết cục này có ghi có vào ví gian hàng không — dùng khi dựng bút toán. */
export function creditsShopWallet(outcome: BookingHoldOutcome): boolean {
  return (
    outcome === BOOKING_HOLD_OUTCOME.FORFEITED ||
    outcome === BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP ||
    outcome === BOOKING_HOLD_OUTCOME.SETTLED ||
    outcome === BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL
  );
}
