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

import { STATUS_COLOR, type StatusColor, type StatusMeta } from './meta';

// ── Sản phẩm ────────────────────────────────────────────────────────────────

export const INSURANCE_PRODUCT_KIND = {
  /** `IV` — bảo hiểm vật chất xe cho chuyến đi. Tuỳ chọn từ luồng tiền v2 (khách tích chọn). */
  VEHICLE_TRIP: 'vehicle_trip',
  /** `IP` — tai nạn người ngồi trên xe. Tuỳ chọn (khách tích chọn). */
  PERSONAL_ACCIDENT: 'personal_accident',
} as const;

export type InsuranceProductKind =
  (typeof INSURANCE_PRODUCT_KIND)[keyof typeof INSURANCE_PRODUCT_KIND];

export const INSURANCE_PRODUCT_KIND_VALUES = Object.values(
  INSURANCE_PRODUCT_KIND,
) as InsuranceProductKind[];

export function isInsuranceProductKind(value: unknown): value is InsuranceProductKind {
  return typeof value === 'string' && (INSURANCE_PRODUCT_KIND_VALUES as string[]).includes(value);
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
  return typeof value === 'string' && (INSURANCE_POLICY_STATUS_VALUES as string[]).includes(value);
}

/**
 * Lượt THU HỒI hợp đồng chia hai nhánh theo HIỆU LỰC — ADR 0093. Server quyết, client chỉ hiện.
 *
 *  - `cancel_refund`: hợp đồng chưa từng có hiệu lực ⇒ `cancelled` + hoàn phí vào Ví điểm khách.
 *  - `void_keep_payable`: hợp đồng đã có hiệu lực ⇒ `voided`, không hoàn, phí vẫn kê trả hãng.
 */
export const INSURANCE_VOID_BRANCH = {
  CANCEL_REFUND: 'cancel_refund',
  VOID_KEEP_PAYABLE: 'void_keep_payable',
} as const;

export type InsuranceVoidBranch =
  (typeof INSURANCE_VOID_BRANCH)[keyof typeof INSURANCE_VOID_BRANCH];
export const INSURANCE_VOID_BRANCH_VALUES = Object.values(
  INSURANCE_VOID_BRANCH,
) as InsuranceVoidBranch[];

/**
 * Khi nào khoản hoàn của nhánh `cancel_refund` vào ví — đi theo khoản giữ chỗ để không phân bổ hai lần.
 *
 *  - `now`: hold đã chốt `settled` ⇒ hoàn trong chính lượt thu hồi;
 *  - `after_settlement`: hold còn mở ⇒ vòng tự hoàn làm sau khi hold chốt `settled`;
 *  - `via_hold`: hold đã chốt kết cục khác ⇒ phí đã về khách qua chính hold;
 *  - `none`: không có hold / tài khoản khách, hoặc nhánh `void_keep_payable`.
 */
export const INSURANCE_VOID_REFUND_TIMING = {
  NOW: 'now',
  AFTER_SETTLEMENT: 'after_settlement',
  VIA_HOLD: 'via_hold',
  NONE: 'none',
} as const;

export type InsuranceVoidRefundTiming =
  (typeof INSURANCE_VOID_REFUND_TIMING)[keyof typeof INSURANCE_VOID_REFUND_TIMING];
export const INSURANCE_VOID_REFUND_TIMING_VALUES = Object.values(
  INSURANCE_VOID_REFUND_TIMING,
) as InsuranceVoidRefundTiming[];

export const INSURANCE_POLICY_STATUS_META: Readonly<Record<InsurancePolicyStatus, StatusMeta>> = {
  [INSURANCE_POLICY_STATUS.RESERVED]: {
    label: 'Đã thu phí, chờ bàn giao',
    color: STATUS_COLOR.WAITING,
  },
  [INSURANCE_POLICY_STATUS.ISSUING]: {
    label: 'Đang cấp chứng nhận',
    color: STATUS_COLOR.PROCESSING,
  },
  [INSURANCE_POLICY_STATUS.ISSUED]: { label: 'Đã cấp chứng nhận', color: STATUS_COLOR.SUCCESS },
  [INSURANCE_POLICY_STATUS.FAILED]: { label: 'Cấp thất bại', color: STATUS_COLOR.DANGER },
  [INSURANCE_POLICY_STATUS.CANCELLED]: {
    label: 'Đã huỷ trước chuyến',
    color: STATUS_COLOR.NEUTRAL,
  },
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
 * Thời hạn THUÊ của một lượt chiếm `issuing` — quá mốc này kể từ `lastAttemptAt` mà hợp đồng vẫn
 * `issuing` thì worker đã chết giữa chừng (deploy, OOM, mất mạng), và hợp đồng được nhặt lại.
 *
 * Phải DÀI HƠN hẳn thời gian chờ tối đa một lần gọi đối tác (`INSURANCE_PARTNER_TIMEOUT_MS`):
 * nhặt lại một lượt còn đang chờ phản hồi là gọi đôi. Gọi đôi vẫn an toàn — `idempotencyKey` không
 * đổi qua các lần thử, đối tác trả lại đúng GCN cũ — nhưng không có lý do để mời nó.
 */
export const INSURANCE_ISSUING_LEASE_MINUTES = 10;

/**
 * Tình trạng hợp đồng phía MIC (`ttrang`) mà XePrime phải theo dõi sau khi cấp (ADR 0091 điều 7):
 * `3` = MIC chưa nhận ảnh xe, `4` = thành công. Ảnh gửi TRƯỚC khi cấp nên thường ra 4 ngay; còn 3
 * thì tra cứu lại theo nhịp dưới đây.
 */
export const INSURANCE_PARTNER_STATUS = {
  PENDING_PHOTOS: '3',
  ISSUED: '4',
} as const;

/** Số lần tra cứu lại một hợp đồng còn chờ ảnh — quá số này thì để admin liên hệ đối tác. */
export const INSURANCE_PENDING_CHECKS_MAX = 4;

/** Khoảng giữa hai lần tra cứu lại hợp đồng chờ ảnh. */
export const INSURANCE_PENDING_CHECK_INTERVAL_SECONDS = 15;

/** Quá chừng này sau mốc giao xe mà hợp đồng chưa cấp ⇒ báo khẩn admin MỘT lần (ADR 0091 điều 7). */
export const INSURANCE_ESCALATE_AFTER_MINUTES = 120;

/** Trần % phí thu hộ bảo hiểm của nền tảng trên `IV` (ADR 0091 điều 3) — khớp CHECK ở DB (nâng 50 → 100 ngày 17/11/2026). */
export const INSURANCE_SERVICE_FEE_PERCENT_MAX = 100;

/** Trần chờ một lần gọi đối tác phát hành — adapter thật phải tôn trọng nó. */
export const INSURANCE_PARTNER_TIMEOUT_MS = 60_000;

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

// ── Danh mục sản phẩm (ADR 0064) ───────────────────────────────────────────

/**
 * Hãng bảo hiểm của một sản phẩm trong `insurance_products`. Mã đi trên dây, không phải tên hiện
 * cho khách (tên sống ở `name_vi`/`name_en` của chính sản phẩm). Một hãng có tối đa MỘT sản phẩm
 * mỗi loại — DB canh `UNIQUE (provider, kind)`.
 */
export const INSURANCE_PROVIDER = {
  /** Tổng Công ty CP Bảo hiểm Quân đội. Chưa có hợp đồng thật: chỉ `mic_mock` phát hành được. */
  MIC: 'mic',
} as const;

export type InsuranceProvider = (typeof INSURANCE_PROVIDER)[keyof typeof INSURANCE_PROVIDER];

export const INSURANCE_PROVIDER_VALUES = Object.values(INSURANCE_PROVIDER) as InsuranceProvider[];

/**
 * Tiền tố số GCN do adapter GIẢ LẬP cấp. Có mặt ở đây (không chỉ trong adapter) để mọi bề mặt
 * đọc được một GCN thử nghiệm mà không cần biết adapter nào đã cấp nó — số `TEST-…` không bao
 * giờ là một hợp đồng có hiệu lực, kể cả khi ai đó quên đọc cờ `is_test`.
 */
export const INSURANCE_TEST_CERTIFICATE_PREFIX = 'TEST-';

/** Chỗ thay số GCN trong `insurance_products.certificate_url_template`. */
export const INSURANCE_CERTIFICATE_URL_PLACEHOLDER = '{certCode}';

/**
 * Dựng URL tra cứu GCN từ mẫu của sản phẩm. Số GCN được mã hoá URL — nó đến từ đối tác, không
 * phải từ một chuỗi mình tự dựng, nên không được tin là an toàn để ghép thẳng.
 */
export function insuranceCertificateUrl(template: string, certificateNumber: string): string {
  return template
    .split(INSURANCE_CERTIFICATE_URL_PLACEHOLDER)
    .join(encodeURIComponent(certificateNumber));
}

// ── Quản trị (ADR 0064) ────────────────────────────────────────────────────

/**
 * Giá trị đặc biệt của bộ lọc trạng thái ở hàng đợi hợp đồng của admin: xem MỌI trạng thái. Bỏ
 * trống `status` vẫn là hàng đợi VIỆC CẦN LÀM (`failed`) — xem toàn bộ lịch sử là lựa chọn có chủ
 * đích, không phải mặc định. Server (DTO) và web (công tắc góc nhìn) đọc cùng một hằng.
 */
export const INSURANCE_QUEUE_STATUS_ANY = 'any';

export type InsuranceQueueStatusFilter = InsurancePolicyStatus | typeof INSURANCE_QUEUE_STATUS_ANY;

/**
 * Giới hạn trường khi admin sửa một sản phẩm bảo hiểm — DTO server và form web đọc cùng bảng này,
 * nên hai bên không lệch nhau một ký tự. Tiền là chuỗi số nguyên đồng tối đa `amountMaxDigits`
 * chữ số, bội của `MONEY_STEP_VND` (kiểm ở service; CHECK ở DB là chốt chặn thứ hai).
 */
export const INSURANCE_PRODUCT_LIMITS = {
  partnerProductCode: { min: 2, max: 100 },
  name: { min: 2, max: 255 },
  coverage: { min: 5, max: 2000 },
  maxPayoutNote: { max: 255 },
  certificateUrlTemplate: { max: 500 },
  displayOrder: { min: 0, max: 1000 },
  amountMaxDigits: 12,
} as const;

/**
 * Snapshot một sản phẩm của danh mục (ADR 0064) — tên, quyền lợi, khấu trừ, mức bồi thường, mẫu
 * URL GCN như khách đã thấy. Tiền là chuỗi (ADR 0007): snapshot sống trong JSON.
 *
 * Đóng băng LÚC DUYỆT (cùng lúc giá — ADR 0024) vào `BookingPriceSnapshot.insuranceProducts` của
 * hold, rồi sang `booking_insurance_policies.product_snapshot_json` lúc đơn ra đời. Admin sửa hay
 * tắt sản phẩm giữa lúc duyệt và lúc khách trả không viết lại lời hứa đã hiện cho khách.
 */
export interface InsuranceProductSnapshot {
  id: string;
  kind: InsuranceProductKind;
  provider: string;
  partnerProductCode: string;
  nameVi: string;
  nameEn: string;
  coverageVi: string;
  coverageEn: string;
  deductibleCar: string | null;
  deductibleMotorbike: string | null;
  maxPayoutCar: string | null;
  maxPayoutMotorbike: string | null;
  maxPayoutNoteVi: string | null;
  maxPayoutNoteEn: string | null;
  certificateUrlTemplate: string;
  /** Cách tính phí (ADR 0088). Vắng = snapshot cũ = `daily`. */
  premiumBasis?: InsurancePremiumBasis;
  /** Biểu phí bậc — chỉ có khi `premiumBasis = value_tier`. */
  premiumTiers?: InsurancePremiumTier[] | null;
  /** Hotline báo sự cố / bồi thường của hãng. */
  claimHotline?: string | null;
}

// ── Tình trạng bảo hiểm như KHÁCH/CHỦ XE thấy (ADR 0064) ───────────────────

/**
 * Tình trạng của MỘT sản phẩm bảo hiểm khách đã trả tiền, cho chi tiết chuyến (khách) và chi tiết
 * đơn (gian hàng). Gọn hơn `INSURANCE_POLICY_STATUS`: người ngoài nền tảng không cần phân biệt
 * `issued` với `claim`, nhưng PHẢI thấy được khi GCN chưa có — trả tiền rồi mà màn hình im lặng
 * là thứ sinh ra cuộc gọi hỗ trợ.
 */
export const INSURANCE_COVERAGE_STATUS = {
  /** Phí đã thu, chờ mốc bàn giao để phát hành (`reserved`). */
  PENDING_ISSUE: 'pending_issue',
  /** Đang gọi đối tác phát hành (`issuing`). */
  ISSUING: 'issuing',
  /** Đã có GCN (`issued`, hoặc `claim` — vẫn là hợp đồng có hiệu lực). */
  ISSUED: 'issued',
  /** Phát hành lỗi — XePrime đang xử lý (`failed`). */
  FAILED: 'failed',
  /** Hợp đồng đã cấp rồi bị thu hồi (`voided`). */
  VOIDED: 'voided',
  /** Huỷ trước bàn giao — phí đã hoàn 100% cho khách (`cancelled`). */
  REFUNDED: 'refunded',
} as const;

export type InsuranceCoverageStatus =
  (typeof INSURANCE_COVERAGE_STATUS)[keyof typeof INSURANCE_COVERAGE_STATUS];

export const INSURANCE_COVERAGE_STATUS_VALUES = Object.values(
  INSURANCE_COVERAGE_STATUS,
) as InsuranceCoverageStatus[];

const COVERAGE_BY_POLICY_STATUS: Readonly<Record<InsurancePolicyStatus, InsuranceCoverageStatus>> =
  {
    [INSURANCE_POLICY_STATUS.RESERVED]: INSURANCE_COVERAGE_STATUS.PENDING_ISSUE,
    [INSURANCE_POLICY_STATUS.ISSUING]: INSURANCE_COVERAGE_STATUS.ISSUING,
    [INSURANCE_POLICY_STATUS.ISSUED]: INSURANCE_COVERAGE_STATUS.ISSUED,
    [INSURANCE_POLICY_STATUS.CLAIM]: INSURANCE_COVERAGE_STATUS.ISSUED,
    [INSURANCE_POLICY_STATUS.FAILED]: INSURANCE_COVERAGE_STATUS.FAILED,
    [INSURANCE_POLICY_STATUS.VOIDED]: INSURANCE_COVERAGE_STATUS.VOIDED,
    [INSURANCE_POLICY_STATUS.CANCELLED]: INSURANCE_COVERAGE_STATUS.REFUNDED,
  };

/** Trạng thái hợp đồng (sổ nội bộ) → tình trạng hiển thị. Một bảng, đủ mọi trạng thái. */
export function insuranceCoverageStatusOf(status: InsurancePolicyStatus): InsuranceCoverageStatus {
  return COVERAGE_BY_POLICY_STATUS[status];
}

/** Màu nhãn của từng tình trạng — web/mobile đọc ở đây, không tự chọn màu trong component. */
export const INSURANCE_COVERAGE_STATUS_COLOR: Readonly<
  Record<InsuranceCoverageStatus, StatusColor>
> = {
  [INSURANCE_COVERAGE_STATUS.PENDING_ISSUE]: STATUS_COLOR.WAITING,
  [INSURANCE_COVERAGE_STATUS.ISSUING]: STATUS_COLOR.PROCESSING,
  [INSURANCE_COVERAGE_STATUS.ISSUED]: STATUS_COLOR.SUCCESS,
  [INSURANCE_COVERAGE_STATUS.FAILED]: STATUS_COLOR.WARNING,
  [INSURANCE_COVERAGE_STATUS.VOIDED]: STATUS_COLOR.NEUTRAL,
  [INSURANCE_COVERAGE_STATUS.REFUNDED]: STATUS_COLOR.NEUTRAL,
};

// ── Phí theo BẬC giá trị xe — bảo hiểm vật chất xe theo chuyến của MIC (ADR 0088) ──────────────

/**
 * Chủ xe chọn bảo hiểm vật chất xe theo bậc là BẮT BUỘC hay TUỲ CHỌN cho xe của mình (ADR 0091 điều 1)
 * — cột `rental_policies.insurance_mode`, CHECK ở DB. Mặc định Tuỳ chọn.
 *
 *  - `required` — xe đủ điều kiện ⇒ mọi chuyến tự lái có `IV`, khách không bỏ được; xe chưa đủ
 *    điều kiện ⇒ KHÔNG nhận đặt tự lái.
 *  - `optional` — ô tích mặc định chưa tích; xe chưa đủ điều kiện ⇒ không có ô, vẫn nhận đặt.
 */
export const INSURANCE_MODE = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
} as const;

export type InsuranceMode = (typeof INSURANCE_MODE)[keyof typeof INSURANCE_MODE];

export const INSURANCE_MODE_VALUES = Object.values(INSURANCE_MODE) as InsuranceMode[];

/** Giá trị của chính sách chưa khai / dòng cũ — khớp DEFAULT của cột. */
export const INSURANCE_MODE_DEFAULT: InsuranceMode = INSURANCE_MODE.OPTIONAL;

export function isInsuranceMode(value: unknown): value is InsuranceMode {
  return typeof value === 'string' && (INSURANCE_MODE_VALUES as string[]).includes(value);
}

/**
 * Cách một sản phẩm bảo hiểm tính phí.
 *
 *  - `daily` — biểu phí THEO NGÀY ở `fee_policies` (luồng tiền v2), khách tự tích chọn.
 *  - `value_tier` — phí = giá trị xe × % của BẬC thời lượng chuyến (biểu phí VCX theo chuyến của
 *    MIC, loại xe `M1.11`). Sản phẩm kiểu này là **BẮT BUỘC** với xe đủ điều kiện (ADR 0088 điều 2):
 *    khách không bỏ chọn được, xe thiếu dữ liệu thì không bán kèm.
 */
export const INSURANCE_PREMIUM_BASIS = {
  DAILY: 'daily',
  VALUE_TIER: 'value_tier',
} as const;

export type InsurancePremiumBasis =
  (typeof INSURANCE_PREMIUM_BASIS)[keyof typeof INSURANCE_PREMIUM_BASIS];

export const INSURANCE_PREMIUM_BASIS_VALUES = Object.values(
  INSURANCE_PREMIUM_BASIS,
) as InsurancePremiumBasis[];

export function isInsurancePremiumBasis(value: unknown): value is InsurancePremiumBasis {
  return typeof value === 'string' && (INSURANCE_PREMIUM_BASIS_VALUES as string[]).includes(value);
}

/**
 * Một bậc phí: chuyến dài TỐI ĐA `maxDays` ngày (24 giờ/ngày, giờ lẻ làm tròn LÊN tới bậc) thì phí
 * = `percent`% giá trị xe. `percent` là chuỗi thập phân (tối đa 4 chữ số lẻ), đã gồm VAT — đúng con
 * số MIC thu (`ttoan` = `phi` + `thue`).
 */
export interface InsurancePremiumTier {
  maxDays: number;
  percent: string;
}

/** Giới hạn biểu phí bậc + giá trị xe — DTO server và form web đọc cùng bảng. */
export const INSURANCE_VALUE_TIER_LIMITS = {
  maxTiers: 10,
  /** MIC chỉ bán VCX theo chuyến tới 30 ngày. */
  maxDays: 30,
  percentMax: '10',
  percentDecimals: 4,
  /** Giá trị xe nhận bảo hiểm — bội 1.000.000đ, trong khoảng này. */
  insuredValueMin: 50_000_000,
  insuredValueMax: 20_000_000_000,
  insuredValueStep: 1_000_000,
  claimHotline: { max: 30 },
} as const;

/**
 * Biểu phí VCX theo chuyến MIC (loại xe `M1.11` — xe cho thuê tự lái), đo trên sandbox ngày
 * 11/11/2026 với xe 340.000.000đ: 44.200 · 112.200 · 224.400 · 333.200 · 680.000. Chỉ là GIÁ TRỊ
 * KHỞI TẠO của seed — và chỉ đúng xe đời 2018-2020: % của MIC đổi theo năm sản xuất. Môi trường cắm MIC
 * thật đồng bộ biểu phí đầy đủ (mốc bậc + nhóm năm) từ `phi_vcx` mỗi ngày (ADR 0106).
 */
export const MIC_VCX_TRIP_DEFAULT_TIERS: readonly InsurancePremiumTier[] = [
  { maxDays: 2, percent: '0.013' },
  { maxDays: 5, percent: '0.033' },
  { maxDays: 10, percent: '0.066' },
  { maxDays: 15, percent: '0.098' },
  { maxDays: 30, percent: '0.2' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const PERCENT_RE = /^\d{1,2}(\.\d{1,4})?$/;

/**
 * Biểu phí bậc hợp lệ không — `null` = hợp lệ, ngược lại là lý do. Bậc tăng dần ngặt cả số ngày lẫn
 * %, ngày nguyên 1..30, % > 0 và ≤ `percentMax`.
 */
export function insurancePremiumTiersProblem(
  tiers: readonly InsurancePremiumTier[],
): string | null {
  if (tiers.length === 0) return 'Cần ít nhất một bậc phí';
  if (tiers.length > INSURANCE_VALUE_TIER_LIMITS.maxTiers) {
    return `Tối đa ${INSURANCE_VALUE_TIER_LIMITS.maxTiers} bậc phí`;
  }
  let prevDays = 0;
  let prevPercent = 0;
  for (const tier of tiers) {
    if (
      !Number.isInteger(tier.maxDays) ||
      tier.maxDays < 1 ||
      tier.maxDays > INSURANCE_VALUE_TIER_LIMITS.maxDays
    ) {
      return `Số ngày của bậc phải là số nguyên 1-${INSURANCE_VALUE_TIER_LIMITS.maxDays}`;
    }
    if (!PERCENT_RE.test(tier.percent)) return `Tỷ lệ phí "${tier.percent}" không hợp lệ`;
    const percent = Number(tier.percent);
    if (!(percent > 0) || percent > Number(INSURANCE_VALUE_TIER_LIMITS.percentMax)) {
      return `Tỷ lệ phí phải lớn hơn 0 và không quá ${INSURANCE_VALUE_TIER_LIMITS.percentMax}%`;
    }
    if (tier.maxDays <= prevDays) return 'Số ngày các bậc phải tăng dần';
    if (percent <= prevPercent) return 'Tỷ lệ phí các bậc phải tăng dần';
    prevDays = tier.maxDays;
    prevPercent = percent;
  }
  return null;
}

/** Đọc biểu phí bậc từ JSON (cột `premium_tiers_json`, snapshot) — hỏng hình dạng ⇒ `null`. */
export function readInsurancePremiumTiers(value: unknown): InsurancePremiumTier[] | null {
  if (!Array.isArray(value)) return null;
  const tiers: InsurancePremiumTier[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { maxDays, percent } = item as Record<string, unknown>;
    if (typeof maxDays !== 'number' || typeof percent !== 'string') return null;
    tiers.push({ maxDays, percent });
  }
  return insurancePremiumTiersProblem(tiers) === null ? tiers : null;
}

/**
 * Biểu phí theo NĂM SẢN XUẤT (ADR 0106). Phí VCX theo chuyến của MIC = giá trị xe × % bậc, nhưng %
 * của mỗi bậc đổi theo năm sản xuất của xe (đo sandbox 18/11/2026). Một nhóm năm liền nhau cùng một
 * bộ %: `percents[i]` ứng với bậc thứ i của `premium_tiers_json` (cùng mốc ngày cho mọi nhóm).
 *
 * `yearFrom = null` = mọi năm cũ hơn `yearTo`; `yearTo = null` = mọi năm mới hơn `yearFrom` (xe đời
 * mới ra sau lần đồng bộ cuối vẫn có giá). Năm không thuộc nhóm nào ⇒ hãng không bán cho xe đó.
 */
export interface InsurancePremiumYearBand {
  yearFrom: number | null;
  yearTo: number | null;
  percents: string[];
}

/** Trạng thái biểu phí so với hãng (ADR 0106). `null` = chưa từng đồng bộ, nhập tay. */
export const INSURANCE_PREMIUM_SYNC_STATUS = {
  /** Lấy được trọn biểu phí từ hãng ⇒ biểu phí KHOÁ, admin không sửa tay. */
  SYNCED: 'synced',
  /** Lần đồng bộ gần nhất hỏng ⇒ giữ biểu phí cũ, admin được sửa tay tới lần đồng bộ được kế tiếp. */
  FAILED: 'failed',
  /**
   * Một lượt duyệt đơn hỏi hãng ra phí KHÁC biểu phí đang lưu (hãng đổi giá) ⇒ mở sửa tay và nhắc admin
   * đồng bộ lại. Không tốn thêm lượt hỏi: lượt duyệt vốn đã hỏi hãng (ADR 0097).
   */
  DRIFTED: 'drifted',
} as const;

export type InsurancePremiumSyncStatus =
  (typeof INSURANCE_PREMIUM_SYNC_STATUS)[keyof typeof INSURANCE_PREMIUM_SYNC_STATUS];

export const INSURANCE_PREMIUM_SYNC_STATUS_VALUES = Object.values(
  INSURANCE_PREMIUM_SYNC_STATUS,
) as InsurancePremiumSyncStatus[];

const YEAR_MIN = 1900;
const YEAR_MAX = 2200;
const isYear = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= YEAR_MIN && v <= YEAR_MAX;

const bandCovers = (band: InsurancePremiumYearBand, year: number) =>
  (band.yearFrom === null || year >= band.yearFrom) &&
  (band.yearTo === null || year <= band.yearTo);

/**
 * Nhóm năm hợp lệ không — `null` = hợp lệ. Mỗi nhóm: số % đúng bằng số bậc, bộ (mốc ngày, %) qua
 * được `insurancePremiumTiersProblem`; các nhóm không chồng năm lên nhau.
 */
export function insurancePremiumYearBandsProblem(
  bands: readonly InsurancePremiumYearBand[],
  tiers: readonly InsurancePremiumTier[],
): string | null {
  if (bands.length === 0) return 'Cần ít nhất một nhóm năm';
  for (const band of bands) {
    if (band.yearFrom !== null && !isYear(band.yearFrom))
      return 'Năm bắt đầu của nhóm không hợp lệ';
    if (band.yearTo !== null && !isYear(band.yearTo)) return 'Năm kết thúc của nhóm không hợp lệ';
    if (band.yearFrom !== null && band.yearTo !== null && band.yearFrom > band.yearTo) {
      return 'Năm bắt đầu của nhóm không được sau năm kết thúc';
    }
    if (band.percents.length !== tiers.length) return 'Số tỷ lệ của nhóm phải bằng số bậc phí';
    const problem = insurancePremiumTiersProblem(
      tiers.map((t, i) => ({ maxDays: t.maxDays, percent: band.percents[i] ?? '' })),
    );
    if (problem) return problem;
  }
  const sorted = [...bands].sort(
    (a, b) => (a.yearFrom ?? Number.MIN_SAFE_INTEGER) - (b.yearFrom ?? Number.MIN_SAFE_INTEGER),
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (prev.yearTo === null || next.yearFrom === null || next.yearFrom <= prev.yearTo) {
      return 'Các nhóm năm không được chồng lên nhau';
    }
  }
  return null;
}

/** Đọc nhóm năm từ JSON (`premium_year_bands_json`) — vắng/rỗng ⇒ `null`; hỏng hình dạng ⇒ `null`. */
export function readInsurancePremiumYearBands(
  value: unknown,
  tiers: readonly InsurancePremiumTier[] | null,
): InsurancePremiumYearBand[] | null {
  if (!tiers || !Array.isArray(value) || value.length === 0) return null;
  const bands: InsurancePremiumYearBand[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { yearFrom, yearTo, percents } = item as Record<string, unknown>;
    if (yearFrom !== null && typeof yearFrom !== 'number') return null;
    if (yearTo !== null && typeof yearTo !== 'number') return null;
    if (!Array.isArray(percents) || percents.some((p) => typeof p !== 'string')) return null;
    bands.push({ yearFrom, yearTo, percents: percents as string[] });
  }
  return insurancePremiumYearBandsProblem(bands, tiers) === null ? bands : null;
}

/**
 * Biểu phí bậc áp cho MỘT xe theo năm sản xuất (ADR 0106):
 *  - chưa có nhóm năm (chưa từng đồng bộ) ⇒ biểu phí chung `tiers`;
 *  - xe thiếu năm sản xuất ⇒ biểu phí chung (xe đó vốn chưa đủ điều kiện bảo hiểm);
 *  - có nhóm phủ năm đó ⇒ mốc ngày chung + % của nhóm;
 *  - không nhóm nào phủ ⇒ `null`: hãng không bán cho xe đời đó.
 */
export function insurancePremiumTiersForYear(
  tiers: readonly InsurancePremiumTier[],
  bands: readonly InsurancePremiumYearBand[] | null,
  manufactureYear: number | null | undefined,
): InsurancePremiumTier[] | null {
  if (!bands || bands.length === 0 || manufactureYear == null) return [...tiers];
  const band = bands.find((b) => bandCovers(b, manufactureYear));
  if (!band) return null;
  return tiers.map((t, i) => ({ maxDays: t.maxDays, percent: band.percents[i]! }));
}

/**
 * Bậc phí phủ một chuyến `pickupAt → returnAt`: bậc ĐẦU TIÊN có `maxDays × 24h ≥ thời lượng`.
 * `null` khi chuyến dài hơn bậc cuối (ngoài phạm vi sản phẩm) hoặc thời lượng không dương.
 */
export function insurancePremiumTierFor(
  tiers: readonly InsurancePremiumTier[],
  pickupAt: Date,
  returnAt: Date,
): InsurancePremiumTier | null {
  const duration = returnAt.getTime() - pickupAt.getTime();
  if (!(duration > 0)) return null;
  return tiers.find((tier) => tier.maxDays * DAY_MS >= duration) ?? null;
}

/**
 * Phí = giá trị xe × `percent`% — đúng tới ĐỒNG, làm tròn nửa lên (ADR 0069: khoản tính ra từ tỷ
 * lệ không làm tròn 1.000đ). Tính bằng BigInt: giá trị xe 20 tỷ × tỷ lệ 4 chữ số lẻ vượt độ chính
 * xác của `number` nếu nhân trên số thực.
 */
export function computeValueTierPremium(insuredValue: string, percent: string): string {
  if (!/^\d+$/.test(insuredValue)) throw new Error(`insuredValue không hợp lệ: ${insuredValue}`);
  if (!PERCENT_RE.test(percent)) throw new Error(`percent không hợp lệ: ${percent}`);
  const [whole = '0', frac = ''] = percent.split('.');
  const scaled = BigInt(`${whole}${frac.padEnd(4, '0')}`); // percent × 10^4
  const denominator = BigInt(100 * 10_000);
  const numerator = BigInt(insuredValue) * scaled;
  return ((numerator * BigInt(2) + denominator) / (BigInt(2) * denominator)).toString();
}

/**
 * Báo giá bảo hiểm vật chất xe THEO BẬC cho một chuyến — đầu vào của `computeCustomerFees`
 * (`vehicleProtectionTier`). Có mặt nghĩa là xe MUA ĐƯỢC; có thu hay không là do chế độ của chủ xe
 * (`INSURANCE_MODE`) và lựa chọn của khách (ADR 0091 điều 1).
 */
export interface VehicleProtectionTierQuote {
  amount: string;
  insuredValue: string;
  maxDays: number;
  percent: string;
  /**
   * Nguồn của `amount` (ADR 0097). Chỉ lượt DUYỆT hỏi đối tác; báo giá công khai và ước tính để
   * trống (= công thức, chưa chốt). Snapshot cũ không có trường này.
   */
  source?: InsurancePremiumSource;
  /** Phí theo công thức bậc — luôn có khi `source` có, để so với số đối tác báo. */
  formulaAmount?: string;
  /** Vì sao dùng công thức thay vì số của đối tác — chỉ khi `source = formula`. */
  fallbackReason?: InsurancePremiumFallbackReason;
}

/**
 * Phí bảo hiểm vật chất xe của một hợp đồng đến từ đâu (ADR 0097): đối tác báo lúc duyệt, hay công
 * thức bậc của hệ thống khi đối tác không trả lời kịp / trả lỗi / trả số bất thường.
 */
export const INSURANCE_PREMIUM_SOURCE = {
  PARTNER: 'partner',
  FORMULA: 'formula',
} as const;

export type InsurancePremiumSource =
  (typeof INSURANCE_PREMIUM_SOURCE)[keyof typeof INSURANCE_PREMIUM_SOURCE];

export const INSURANCE_PREMIUM_SOURCE_VALUES = Object.values(
  INSURANCE_PREMIUM_SOURCE,
) as InsurancePremiumSource[];

/** Lý do rơi về công thức — DB canh CHECK cùng danh sách. */
export const INSURANCE_PREMIUM_FALLBACK_REASON = {
  /** Quá `INSURANCE_PARTNER_QUOTE_TIMEOUT_MS`. */
  TIMEOUT: 'timeout',
  /** Mạng lỗi, HTTP 5xx, không lấy được token. */
  UNAVAILABLE: 'unavailable',
  /** Đối tác trả mã lỗi nghiệp vụ (ví dụ chưa khai biểu phí). */
  REJECTED: 'rejected',
  /** Số đối tác báo lệch quá `INSURANCE_PARTNER_QUOTE_MAX_RATIO` lần so với công thức. */
  OUT_OF_RANGE: 'out_of_range',
  /** Adapter đang chạy không có API tính phí. */
  NOT_SUPPORTED: 'not_supported',
} as const;

export type InsurancePremiumFallbackReason =
  (typeof INSURANCE_PREMIUM_FALLBACK_REASON)[keyof typeof INSURANCE_PREMIUM_FALLBACK_REASON];

export const INSURANCE_PREMIUM_FALLBACK_REASON_VALUES = Object.values(
  INSURANCE_PREMIUM_FALLBACK_REASON,
) as InsurancePremiumFallbackReason[];

/**
 * Thời gian chờ tối đa khi hỏi phí đối tác lúc DUYỆT (ADR 0097) — quá mốc này dùng công thức, lượt
 * duyệt không chờ thêm. Sandbox MIC trả ~0,2s/lượt (đo 17/11/2026).
 */
export const INSURANCE_PARTNER_QUOTE_TIMEOUT_MS = 1500;

/**
 * Số đối tác báo chỉ được nhận khi nằm trong [công thức ÷ N, công thức × N]. Ngoài khoảng đó gần như
 * chắc chắn là lỗi dữ liệu (sai đơn vị, sai bậc) — dùng công thức, admin thấy lý do `out_of_range`.
 */
export const INSURANCE_PARTNER_QUOTE_MAX_RATIO = 2;

/**
 * Nhận hay bỏ số phí đối tác báo — `null` = nhận; ngược lại là lý do bỏ. Một hàm cho API (lượt duyệt)
 * và màn đối chiếu của admin, nên "bất thường" có đúng một định nghĩa.
 */
export function partnerPremiumProblem(
  partnerAmount: string,
  formulaAmount: string,
): InsurancePremiumFallbackReason | null {
  if (!/^\d+$/.test(partnerAmount) || BigInt(partnerAmount) <= BigInt(0)) {
    return INSURANCE_PREMIUM_FALLBACK_REASON.OUT_OF_RANGE;
  }
  if (!/^\d+$/.test(formulaAmount) || BigInt(formulaAmount) <= BigInt(0)) return null;
  const partner = BigInt(partnerAmount);
  const formula = BigInt(formulaAmount);
  const ratio = BigInt(INSURANCE_PARTNER_QUOTE_MAX_RATIO);
  if (partner > formula * ratio || partner * ratio < formula) {
    return INSURANCE_PREMIUM_FALLBACK_REASON.OUT_OF_RANGE;
  }
  return null;
}

/**
 * Lý do một chiếc xe CHƯA đủ điều kiện bán kèm bảo hiểm vật chất xe theo bậc (ADR 0088 điều 2).
 * Mã đi trên dây — giao diện chủ xe dịch từng mã thành một việc cần làm.
 */
export const INSURANCE_ELIGIBILITY_GAP = {
  /** Chỉ ô tô — MIC chưa có sản phẩm theo chuyến cho xe máy. */
  NOT_CAR: 'not_car',
  /** Chưa nhập giá trị xe. */
  INSURED_VALUE_MISSING: 'insured_value_missing',
  /** Thiếu một trong các ảnh bắt buộc của thư viện xe. */
  PHOTOS_MISSING: 'photos_missing',
  /** Chưa có cà vẹt mang số khung + tên chủ đăng ký. */
  REGISTRATION_MISSING: 'registration_missing',
  /** Thiếu hãng / mẫu / năm sản xuất / số chỗ. */
  VEHICLE_INFO_MISSING: 'vehicle_info_missing',
} as const;

export type InsuranceEligibilityGap =
  (typeof INSURANCE_ELIGIBILITY_GAP)[keyof typeof INSURANCE_ELIGIBILITY_GAP];

/** Bộ lọc danh sách ô tô ở màn Bảo hiểm của admin (ADR 0097) — đủ / chưa đủ điều kiện. */
export const INSURANCE_VEHICLE_ELIGIBILITY_FILTER = {
  ELIGIBLE: 'eligible',
  MISSING: 'missing',
} as const;

export type InsuranceVehicleEligibilityFilter =
  (typeof INSURANCE_VEHICLE_ELIGIBILITY_FILTER)[keyof typeof INSURANCE_VEHICLE_ELIGIBILITY_FILTER];

export const INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES = Object.values(
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER,
) as InsuranceVehicleEligibilityFilter[];

export const INSURANCE_ELIGIBILITY_GAP_VALUES = Object.values(
  INSURANCE_ELIGIBILITY_GAP,
) as InsuranceEligibilityGap[];

// ── Bảng kê trả phí cho hãng bảo hiểm (ADR 0088 điều 6) ───────────────────────────────────────

/**
 * Vòng đời một bảng kê tháng:
 *
 * ```text
 *   draft ──► finalized ──► paid
 *     │
 *     └── xoá (chỉ khi còn draft) — hợp đồng được nhả về "chưa kê"
 * ```
 *
 * `finalized` = đã chốt số, gửi hãng đối chiếu; không thêm/bớt hợp đồng được nữa. `paid` = đã ghi
 * nhận chuyển khoản cho hãng (số tiền, ngày, mã giao dịch).
 */
export const INSURANCE_REMITTANCE_STATUS = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  PAID: 'paid',
} as const;

export type InsuranceRemittanceStatus =
  (typeof INSURANCE_REMITTANCE_STATUS)[keyof typeof INSURANCE_REMITTANCE_STATUS];

export const INSURANCE_REMITTANCE_STATUS_VALUES = Object.values(
  INSURANCE_REMITTANCE_STATUS,
) as InsuranceRemittanceStatus[];

export function isInsuranceRemittanceStatus(value: unknown): value is InsuranceRemittanceStatus {
  return (
    typeof value === 'string' && (INSURANCE_REMITTANCE_STATUS_VALUES as string[]).includes(value)
  );
}

export const INSURANCE_REMITTANCE_STATUS_COLOR: Readonly<
  Record<InsuranceRemittanceStatus, StatusColor>
> = {
  [INSURANCE_REMITTANCE_STATUS.DRAFT]: STATUS_COLOR.WAITING,
  [INSURANCE_REMITTANCE_STATUS.FINALIZED]: STATUS_COLOR.PROCESSING,
  [INSURANCE_REMITTANCE_STATUS.PAID]: STATUS_COLOR.SUCCESS,
};

/** Giới hạn trường của bảng kê. Hoa hồng đại lý là % trên tổng phí, 0..100, tối đa 2 chữ số lẻ. */
export const INSURANCE_REMITTANCE_LIMITS = {
  commissionPercentMax: 100,
  bankReference: { max: 100 },
  note: { max: 1000 },
} as const;

/** Hoa hồng đại lý = tổng phí × % — đúng tới đồng (ADR 0069). */
export function insuranceRemittanceCommission(
  grossPremium: string,
  commissionPercent: string,
): string {
  if (!/^\d+$/.test(grossPremium)) throw new Error(`grossPremium không hợp lệ: ${grossPremium}`);
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(commissionPercent)) {
    throw new Error(`commissionPercent không hợp lệ: ${commissionPercent}`);
  }
  return computeValueTierPremium(grossPremium, commissionPercent);
}
