/**
 * Bảo hiểm chuyến — ADR 0032 điều 4, ADR 0028 điều 5 (Phase 7).
 *
 * Hai sản phẩm, hai bản chất khác nhau:
 *
 *  - `IV` **bảo hiểm xe cho chuyến** — BẮT BUỘC, khách trả.
 *  - `IP` **bảo hiểm tai nạn người ngồi trên xe** — TUỲ CHỌN, chỉ tính khi khách GIỮ lựa chọn,
 *    và lựa chọn đó phải có bằng chứng (`consentAt`/`consentSource`).
 *
 * Cả hai do **KHÁCH** trả (ADR 0032 ghi đè ADR 0028 ở điểm này), nên chúng cộng vào tổng khách
 * và nằm trong khoản chuyển online — không phải khấu trừ khỏi tiền chủ xe.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Sản phẩm ────────────────────────────────────────────────────────────────

export const INSURANCE_PRODUCT_KIND = {
  /** `IV` — bảo hiểm xe cho chuyến đi. Bắt buộc khi cổng bảo hiểm mở. */
  VEHICLE_TRIP: 'vehicle_trip',
  /** `IP` — tai nạn người ngồi trên xe. Tuỳ chọn, cần bằng chứng khách đã chọn. */
  PERSONAL_ACCIDENT: 'personal_accident',
} as const;

export type InsuranceProductKind =
  (typeof INSURANCE_PRODUCT_KIND)[keyof typeof INSURANCE_PRODUCT_KIND];

export const INSURANCE_PRODUCT_KIND_VALUES = Object.values(
  INSURANCE_PRODUCT_KIND,
) as InsuranceProductKind[];

export function isInsuranceProductKind(value: unknown): value is InsuranceProductKind {
  return (
    typeof value === 'string' && (INSURANCE_PRODUCT_KIND_VALUES as string[]).includes(value)
  );
}

// ── Trạng thái ──────────────────────────────────────────────────────────────

/**
 * Vòng đời một hợp đồng bảo hiểm chuyến.
 *
 * ⚠️ **KHÔNG dùng boolean `issued`** (ADR 0032 điều 4). Một cờ đúng/sai không phân biệt được
 * "chưa tới lúc phát hành", "đang gọi đối tác", "đối tác từ chối" và "đã huỷ sau khi phát hành" —
 * bốn tình huống đòi bốn hành động khác nhau của người trực, và gộp chúng là cách chắc chắn để
 * một khoản phí đã thu không ai biết phải xử lý thế nào.
 *
 * ```text
 *   reserved ──► issuing ──► issued ──► claim
 *                   │           │
 *                   ▼           ▼
 *                failed      voided      (huỷ SAU khi đã phát hành)
 *                   │
 *                   └─► (nextAttemptAt) ─► issuing
 *
 *   reserved/failed ──► cancelled        (huỷ TRƯỚC bàn giao — hoàn 100% cho khách)
 * ```
 */
export const INSURANCE_POLICY_STATUS = {
  /** Phí đã thu, CHƯA gọi đối tác. Trạng thái của mọi chuyến chưa tới mốc bàn giao. */
  RESERVED: 'reserved',
  /** Worker đã CHIẾM để gọi đối tác. Trạng thái ngắn — nó tồn tại để hai worker không gọi đôi. */
  ISSUING: 'issuing',
  /** Đối tác đã cấp chứng nhận. Từ đây phí trở thành khoản PHẢI TRẢ hãng bảo hiểm. */
  ISSUED: 'issued',
  /** Gọi đối tác hỏng. Có `nextAttemptAt` để thử lại; hiện ở hàng đợi admin. */
  FAILED: 'failed',
  /** Huỷ TRƯỚC bàn giao — hợp đồng chưa bao giờ được mua, phí hoàn 100% cho khách. */
  CANCELLED: 'cancelled',
  /** Huỷ SAU khi đã phát hành — phải làm việc với đối tác, không tự hoàn được. */
  VOIDED: 'voided',
  /** Đang có yêu cầu bồi thường. Không chốt quyết toán với đối tác khi còn ở đây. */
  CLAIM: 'claim',
} as const;

export type InsurancePolicyStatus =
  (typeof INSURANCE_POLICY_STATUS)[keyof typeof INSURANCE_POLICY_STATUS];

export const INSURANCE_POLICY_STATUS_VALUES = Object.values(
  INSURANCE_POLICY_STATUS,
) as InsurancePolicyStatus[];

export function isInsurancePolicyStatus(value: unknown): value is InsurancePolicyStatus {
  return (
    typeof value === 'string' && (INSURANCE_POLICY_STATUS_VALUES as string[]).includes(value)
  );
}

export const INSURANCE_POLICY_STATUS_META: Readonly<
  Record<InsurancePolicyStatus, StatusMeta>
> = {
  [INSURANCE_POLICY_STATUS.RESERVED]: { label: 'Đã thu phí, chờ bàn giao', color: STATUS_COLOR.WAITING },
  [INSURANCE_POLICY_STATUS.ISSUING]: { label: 'Đang cấp chứng nhận', color: STATUS_COLOR.PROCESSING },
  [INSURANCE_POLICY_STATUS.ISSUED]: { label: 'Đã cấp chứng nhận', color: STATUS_COLOR.SUCCESS },
  [INSURANCE_POLICY_STATUS.FAILED]: { label: 'Cấp thất bại', color: STATUS_COLOR.DANGER },
  [INSURANCE_POLICY_STATUS.CANCELLED]: { label: 'Đã huỷ trước chuyến', color: STATUS_COLOR.NEUTRAL },
  [INSURANCE_POLICY_STATUS.VOIDED]: { label: 'Đã thu hồi', color: STATUS_COLOR.WARNING },
  [INSURANCE_POLICY_STATUS.CLAIM]: { label: 'Đang bồi thường', color: STATUS_COLOR.INFO },
};

/** Trạng thái CUỐI — không còn việc gì để worker hay admin làm. */
export const INSURANCE_POLICY_STATUS_FINAL: readonly InsurancePolicyStatus[] = [
  INSURANCE_POLICY_STATUS.CANCELLED,
  INSURANCE_POLICY_STATUS.VOIDED,
];

export function isInsuranceFinal(status: InsurancePolicyStatus): boolean {
  return INSURANCE_POLICY_STATUS_FINAL.includes(status);
}

/**
 * Phí của hợp đồng này có còn là NGHĨA VỤ của nền tảng không — dùng ở đối soát ba vế.
 *
 * `reserved`/`issuing`/`failed`: tiền đã thu của khách, chưa trả ai ⇒ giữ hộ.
 * `issued`/`claim`: đã thành khoản phải trả hãng bảo hiểm ⇒ vẫn giữ hộ, chỉ đổi chủ nợ.
 * `cancelled`: đã hoàn khách ⇒ thôi.  `voided`: quyết toán riêng với đối tác ⇒ thôi.
 */
export function isInsurancePremiumCustodied(status: InsurancePolicyStatus): boolean {
  return !isInsuranceFinal(status);
}

// ── Thử lại ─────────────────────────────────────────────────────────────────

/** Trần số phút giữa hai lần thử — ADR 0032: `min(2^n, 60)`. */
export const INSURANCE_RETRY_MAX_MINUTES = 60;

/**
 * Chờ bao lâu trước lần thử thứ `attempts + 1`.
 *
 * Backoff luỹ thừa có TRẦN: đối tác sập nửa ngày thì lần thử thứ 15 không được rơi vào năm sau.
 * Trần 60 phút nghĩa là khi họ sống lại, mọi hợp đồng đang chờ đều được thử trong vòng một giờ.
 */
export function insuranceRetryDelayMinutes(attempts: number): number {
  const n = Math.max(0, Math.floor(attempts));
  // `2 ** 31` trở lên là Infinity trong phép so sánh — kẹp mũ trước khi luỹ thừa.
  const raw = n >= 6 ? INSURANCE_RETRY_MAX_MINUTES : 2 ** n;
  return Math.min(raw, INSURANCE_RETRY_MAX_MINUTES);
}

/**
 * Mã lỗi của cổng phát hành. Đây là MÃ đi trên dây, không phải câu hiển thị (ADR 0012).
 *
 * `partner_not_configured` tách riêng khỏi mọi lỗi khác có chủ đích: nó là vấn đề CẤU HÌNH của
 * nền tảng, không phải sự cố của một chuyến. Gộp nó vào lỗi chung sẽ đẻ ra một support case cho
 * mỗi chuyến trong khi chỉ có đúng một việc phải làm — cắm đối tác vào.
 */
export const INSURANCE_ISSUE_ERROR = {
  /** Chưa cắm adapter đối tác thật. Không phải lỗi của chuyến nào cả. */
  PARTNER_NOT_CONFIGURED: 'partner_not_configured',
  /** Đối tác từ chối (xe/khách không đủ điều kiện). Cần người xử lý. */
  PARTNER_REJECTED: 'partner_rejected',
  /** Lỗi mạng/timeout — thử lại thường là đủ. */
  PARTNER_UNAVAILABLE: 'partner_unavailable',
  /** Dữ liệu chuyến thiếu thứ đối tác đòi. Cần sửa rồi thử lại. */
  INVALID_REQUEST: 'invalid_request',
} as const;

export type InsuranceIssueError =
  (typeof INSURANCE_ISSUE_ERROR)[keyof typeof INSURANCE_ISSUE_ERROR];

export const INSURANCE_ISSUE_ERROR_VALUES = Object.values(
  INSURANCE_ISSUE_ERROR,
) as InsuranceIssueError[];

/**
 * Lỗi này có đáng mở support case cho KHÁCH không.
 *
 * Chỉ khi nó là sự cố của CHUYẾN ĐÓ. Chưa cắm đối tác là việc của nền tảng — nó thuộc hàng đợi
 * admin, không thuộc hộp thư của khách, và mở case cho từng chuyến chỉ làm ngập kênh hỗ trợ
 * bằng cùng một thông tin.
 */
export function insuranceErrorNeedsSupportCase(code: InsuranceIssueError): boolean {
  return code !== INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED;
}

/** Bằng chứng khách CHỌN `IP` đến từ đâu — ADR 0028 điều 5 đòi lưu lại. */
export const INSURANCE_CONSENT_SOURCE = {
  /** Khách giữ lựa chọn ở form gửi yêu cầu thuê trên web. */
  WEB_BOOKING_FORM: 'web_booking_form',
  /** Khách giữ lựa chọn trên app native. */
  MOBILE_BOOKING_FORM: 'mobile_booking_form',
  /** Nhân viên gian hàng ghi nhận hộ (đơn lập tay) — phải có người chịu trách nhiệm. */
  SHOP_STAFF: 'shop_staff',
} as const;

export type InsuranceConsentSource =
  (typeof INSURANCE_CONSENT_SOURCE)[keyof typeof INSURANCE_CONSENT_SOURCE];

export const INSURANCE_CONSENT_SOURCE_VALUES = Object.values(
  INSURANCE_CONSENT_SOURCE,
) as InsuranceConsentSource[];
