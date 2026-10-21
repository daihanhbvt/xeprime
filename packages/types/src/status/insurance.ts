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
export const INSURANCE_COVERAGE_STATUS_COLOR: Readonly<Record<InsuranceCoverageStatus, StatusColor>> =
  {
    [INSURANCE_COVERAGE_STATUS.PENDING_ISSUE]: STATUS_COLOR.WAITING,
    [INSURANCE_COVERAGE_STATUS.ISSUING]: STATUS_COLOR.PROCESSING,
    [INSURANCE_COVERAGE_STATUS.ISSUED]: STATUS_COLOR.SUCCESS,
    [INSURANCE_COVERAGE_STATUS.FAILED]: STATUS_COLOR.WARNING,
    [INSURANCE_COVERAGE_STATUS.VOIDED]: STATUS_COLOR.NEUTRAL,
    [INSURANCE_COVERAGE_STATUS.REFUNDED]: STATUS_COLOR.NEUTRAL,
  };
