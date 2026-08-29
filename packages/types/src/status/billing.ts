/**
 * Chế độ thu phí, hoá đơn gói, và sổ giao dịch ngân hàng — ADR 0020 / 0022 / 0024.
 *
 * Hai điều đóng đinh ở tầng từ vựng này:
 *
 *  - **Chế độ thu phí đọc từ GÓI, không bao giờ từ `tenants.tenant_type`.** ADR 0014 điều 2 giữ
 *    `tenant_type` là nhãn hiển thị. Ở đâu cần biết "tenant này ăn hoa hồng hay đã mua gói",
 *    câu trả lời là `subscription.billingMode` — cột snapshot, không đọc xuyên qua `plans`.
 *  - **Một sổ giao dịch ngân hàng, hai loại đích.** ADR 0022 điều 2: webhook phải ghi được một
 *    giao dịch TRƯỚC khi biết nó khớp vào đâu, nếu không giao dịch lạ sẽ bị bỏ và lần retry sau
 *    chèn lại lần nữa. Loại đích suy từ TIỀN TỐ của mã, không đoán.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Chế độ thu phí ──────────────────────────────────────────────────────────

/**
 * Nền tảng thu tiền của một tenant bằng cách nào — ADR 0020.
 *
 * `COMMISSION` là mặc định của tenant chưa mua gói. `PACKAGE` là tenant đã mua chỗ xe và
 * KHÔNG trả đồng nào trên chuyến.
 *
 * Không có gói hiện hành ⇒ coi là `PACKAGE` (0%), **không** phải `COMMISSION` (ADR 0024 điều 3):
 * an toàn khi hỏng nghĩa là đừng lấy tiền mà không giải thích được.
 */
export const BILLING_MODE = {
  /** Hoa hồng % trên mỗi chuyến, trừ PHÍA CHỦ XE, thu qua khoản giữ chỗ (ADR 0021). */
  COMMISSION: 'commission',
  /** Cước theo chỗ xe trả trước (ADR 0015). 0đ trên chuyến. */
  PACKAGE: 'package',
} as const;

export type BillingMode = (typeof BILLING_MODE)[keyof typeof BILLING_MODE];
export const BILLING_MODE_VALUES = Object.values(BILLING_MODE) as BillingMode[];

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === 'string' && (BILLING_MODE_VALUES as string[]).includes(value);
}

/**
 * Nhãn trên card chợ — nói về CÁCH ĐẶT, không nói về đẳng cấp gian hàng (ADR 0020 ràng buộc 2).
 * Xe tuyến `PACKAGE` là nhóm trả tiền nhiều nhất; không được thiết kế nhãn khiến họ trông kém
 * tin cậy hơn.
 */
export const BILLING_MODE_META: Readonly<Record<BillingMode, StatusMeta>> = {
  [BILLING_MODE.COMMISSION]: { label: 'Đặt & giữ chỗ ngay', color: STATUS_COLOR.SUCCESS },
  [BILLING_MODE.PACKAGE]: { label: 'Gian hàng đối tác', color: STATUS_COLOR.INFO },
};

/** Tenant ở chế độ này có phải trả hoa hồng trên chuyến không. */
export function chargesCommission(mode: BillingMode): boolean {
  return mode === BILLING_MODE.COMMISSION;
}

// ── Năng lực theo gói ───────────────────────────────────────────────────────

/**
 * Nhóm tính năng NÂNG CAO, mở ra khi tenant mua gói — ADR 0027 điều 1.
 *
 * ⚠️ **Đây là TRỤC THỨ HAI, độc lập với `PERMISSION`.** Hai câu hỏi khác nhau và phải trả lời
 * riêng, rồi kiểm tra nối tiếp nhau:
 *
 *   - *Gian hàng này CÓ tính năng thu chi không?* → cờ ở đây, đọc từ gói hiện hành.
 *   - *Người này ĐƯỢC xem thu chi không?* → `PERMISSION` + vai (ADR 0002).
 *
 * Nhét cờ tính năng vào bảng permission, hoặc suy quyền của một người từ gói, là cách chắc chắn
 * để một `shop_staff` không có `finance.view` vẫn vào được sổ, hoặc để một `shop_owner` mất quyền
 * vì gói hết hạn thay vì bị chuyển sang chỉ-đọc.
 *
 * Một cờ gác **cả một nhóm** endpoint, không phải từng endpoint (ADR 0027 ràng buộc 3): cắt nhỏ
 * quá thì sinh trạng thái nửa vời mà không ai giải thích nổi.
 *
 * Những gì KHÔNG nằm ở đây thì thuộc bộ cơ bản, chủ xe nào cũng có: xe, giấy tờ xe, đưa xe lên
 * chợ, lịch, yêu cầu thuê, đơn thuê, giao/nhận xe, sổ khách, đánh giá, chat, hồ sơ gian hàng.
 */
export const PLAN_FEATURE = {
  /** Sổ thu chi, phiếu thu/chi, sổ quỹ, và báo cáo tổng hợp theo kỳ/xe/khách. */
  FINANCE: 'finance',
  /** Sổ công nợ và đối chiếu. */
  DEBTS: 'debts',
  /** Lịch bảo dưỡng và chi phí bảo dưỡng. */
  MAINTENANCE: 'maintenance',
  /** Mời nhân viên và phân quyền trong gian hàng. */
  MEMBERS: 'members',
  /** Nhiều chi nhánh. */
  BRANCHES: 'branches',
  /** Quản lý tài xế cho dịch vụ có tài xế. */
  DRIVERS: 'drivers',
  /** Sinh và quản lý hợp đồng thuê. */
  CONTRACTS: 'contracts',
  /** Thu khoản giữ chỗ của khách qua sàn — ADR 0025 điều 2. */
  ESCROW_HOLD: 'escrow_hold',
} as const;

export type PlanFeature = (typeof PLAN_FEATURE)[keyof typeof PLAN_FEATURE];
export const PLAN_FEATURE_VALUES = Object.values(PLAN_FEATURE) as PlanFeature[];

export function isPlanFeature(value: unknown): value is PlanFeature {
  return typeof value === 'string' && (PLAN_FEATURE_VALUES as string[]).includes(value);
}

/** Nhãn cho màn "Gói của tôi" — viết bằng ngôn ngữ người dùng, không phải tên module. */
export const PLAN_FEATURE_LABEL: Readonly<Record<PlanFeature, string>> = {
  [PLAN_FEATURE.FINANCE]: 'Sổ thu chi và báo cáo',
  [PLAN_FEATURE.DEBTS]: 'Theo dõi công nợ',
  [PLAN_FEATURE.MAINTENANCE]: 'Lịch bảo dưỡng và chi phí',
  [PLAN_FEATURE.MEMBERS]: 'Nhân viên và phân quyền',
  [PLAN_FEATURE.BRANCHES]: 'Nhiều chi nhánh',
  [PLAN_FEATURE.DRIVERS]: 'Quản lý tài xế',
  [PLAN_FEATURE.CONTRACTS]: 'Hợp đồng thuê xe',
  [PLAN_FEATURE.ESCROW_HOLD]: 'Thu giữ chỗ qua sàn',
};

/**
 * Ba trạng thái của một tính năng với một tenant — ADR 0027 điều 3.
 *
 * Trạng thái giữa là điều quan trọng nhất: **hết hạn gói KHÔNG BAO GIỜ được làm người ta mất
 * quyền xem sổ sách của chính mình.** Ẩn hẳn thì dữ liệu vẫn còn nhưng người dùng tin là đã mất,
 * và việc đầu tiên họ làm là gọi hỗ trợ chứ không phải gia hạn.
 */
export const FEATURE_STATE = {
  /** Gói hiện hành có cờ — dùng bình thường. */
  ENABLED: 'enabled',
  /** Không có cờ nhưng tenant ĐÃ CÓ dữ liệu từ kỳ trước — xem được hết, ghi bị chặn. */
  READ_ONLY: 'read_only',
  /** Không có cờ và chưa bao giờ có dữ liệu — không hiện menu, sản phẩm trông gọn chứ không cụt. */
  HIDDEN: 'hidden',
} as const;

export type FeatureState = (typeof FEATURE_STATE)[keyof typeof FEATURE_STATE];
export const FEATURE_STATE_VALUES = Object.values(FEATURE_STATE) as FeatureState[];

/** Có được GHI không. `read_only` trả `false`, và điều đó phải chặn ở SERVER, không chỉ ẩn nút. */
export function canWriteFeature(state: FeatureState): boolean {
  return state === FEATURE_STATE.ENABLED;
}

/** Có hiện menu không — `read_only` vẫn hiện, kèm băng báo hết hạn và nút gia hạn. */
export function isFeatureVisible(state: FeatureState): boolean {
  return state !== FEATURE_STATE.HIDDEN;
}

/**
 * Suy trạng thái từ hai dữ kiện. Tách thành hàm thuần để api, web và mobile không tự diễn giải
 * mỗi nơi một kiểu.
 *
 * `hasLegacyData` là câu hỏi "tenant này đã từng dùng tính năng đó chưa" — mỗi module tự trả lời
 * bằng một phép đếm rẻ trên bảng của mình.
 */
export function featureState(enabled: boolean, hasLegacyData: boolean): FeatureState {
  if (enabled) return FEATURE_STATE.ENABLED;
  return hasLegacyData ? FEATURE_STATE.READ_ONLY : FEATURE_STATE.HIDDEN;
}

// ── Hoá đơn gói ─────────────────────────────────────────────────────────────

/**
 * Vòng đời một hoá đơn gói — ADR 0015 điều 5.
 *
 * `PARTIALLY_PAID` là trạng thái ADR 0016 điều 6 bắt buộc phải có: chuyển thiếu thì ghi nhận
 * số đã về nhưng **không kích hoạt gói**. Gộp nó vào `ISSUED` là mất dấu tiền đã nhận; gộp vào
 * `PAID` là mở gói cho người chưa trả đủ.
 */
export const SUBSCRIPTION_INVOICE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  VOID: 'void',
} as const;

export type SubscriptionInvoiceStatus =
  (typeof SUBSCRIPTION_INVOICE_STATUS)[keyof typeof SUBSCRIPTION_INVOICE_STATUS];

export const SUBSCRIPTION_INVOICE_STATUS_VALUES = Object.values(
  SUBSCRIPTION_INVOICE_STATUS,
) as SubscriptionInvoiceStatus[];

export function isSubscriptionInvoiceStatus(value: unknown): value is SubscriptionInvoiceStatus {
  return (
    typeof value === 'string' &&
    (SUBSCRIPTION_INVOICE_STATUS_VALUES as string[]).includes(value)
  );
}

export const SUBSCRIPTION_INVOICE_STATUS_META: Readonly<
  Record<SubscriptionInvoiceStatus, StatusMeta>
> = {
  [SUBSCRIPTION_INVOICE_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [SUBSCRIPTION_INVOICE_STATUS.ISSUED]: { label: 'Chờ thanh toán', color: STATUS_COLOR.WAITING },
  [SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID]: {
    label: 'Đã nhận một phần',
    color: STATUS_COLOR.WARNING,
  },
  [SUBSCRIPTION_INVOICE_STATUS.PAID]: { label: 'Đã thanh toán', color: STATUS_COLOR.SUCCESS },
  [SUBSCRIPTION_INVOICE_STATUS.VOID]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
};

// ── Sổ giao dịch ngân hàng ──────────────────────────────────────────────────

/**
 * Trạng thái KHỚP của một giao dịch tiền vào — ADR 0022 điều 2.
 *
 * Mặc định `UNMATCHED`: webhook ghi thô trước, khớp sau. `MANUAL` khác `MATCHED` vì admin khớp
 * tay là một sự kiện cần truy được về sau — ADR 0022 điều 4 cấm khớp tự động theo số tiền, nên
 * mọi dòng `MANUAL` đều là một lần con người chịu trách nhiệm.
 */
export const BANK_MATCH_STATUS = {
  UNMATCHED: 'unmatched',
  MATCHED: 'matched',
  MANUAL: 'manual',
  IGNORED: 'ignored',
} as const;

export type BankMatchStatus = (typeof BANK_MATCH_STATUS)[keyof typeof BANK_MATCH_STATUS];
export const BANK_MATCH_STATUS_VALUES = Object.values(BANK_MATCH_STATUS) as BankMatchStatus[];

export function isBankMatchStatus(value: unknown): value is BankMatchStatus {
  return typeof value === 'string' && (BANK_MATCH_STATUS_VALUES as string[]).includes(value);
}

export const BANK_MATCH_STATUS_META: Readonly<Record<BankMatchStatus, StatusMeta>> = {
  [BANK_MATCH_STATUS.UNMATCHED]: { label: 'Chưa khớp', color: STATUS_COLOR.WARNING },
  [BANK_MATCH_STATUS.MATCHED]: { label: 'Đã khớp', color: STATUS_COLOR.SUCCESS },
  [BANK_MATCH_STATUS.MANUAL]: { label: 'Khớp tay', color: STATUS_COLOR.INFO },
  [BANK_MATCH_STATUS.IGNORED]: { label: 'Bỏ qua', color: STATUS_COLOR.NEUTRAL },
};

/** Một giao dịch tiền vào khớp vào loại đối tượng nào. */
export const BANK_MATCH_TARGET_TYPE = {
  SUBSCRIPTION_INVOICE: 'subscription_invoice',
  BOOKING_HOLD: 'booking_hold',
} as const;

export type BankMatchTargetType =
  (typeof BANK_MATCH_TARGET_TYPE)[keyof typeof BANK_MATCH_TARGET_TYPE];

export const BANK_MATCH_TARGET_TYPE_VALUES = Object.values(
  BANK_MATCH_TARGET_TYPE,
) as BankMatchTargetType[];

// ── Mã đối soát ─────────────────────────────────────────────────────────────

/**
 * TIỀN TỐ quyết định loại đích, không có bước đoán — ADR 0022 điều 3.
 *
 * Mã **unique toàn sàn** (không unique theo tenant): webhook chỉ có chuỗi nội dung chuyển khoản,
 * không có ngữ cảnh tenant nào để thu hẹp. Hai bảng dùng CHUNG không gian tên này — mã trùng
 * nhau giữa `subscription_invoices` và `booking_holds` là khớp nhầm tiền.
 */
export const REFERENCE_CODE_PREFIX = {
  [BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE]: 'XPG',
  [BANK_MATCH_TARGET_TYPE.BOOKING_HOLD]: 'XPH',
} as const;

/**
 * Bảng chữ cái sinh mã — ADR 0016 điều 5: không dấu, **bỏ `0`/`O` và `1`/`I`** vì người đọc lại
 * mã từ màn hình ngân hàng sẽ nhầm, và một ký tự sai là một khoản tiền không khớp được.
 */
export const REFERENCE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Số ký tự phần ngẫu nhiên sau tiền tố. Ngắn để gõ lại được, đủ dài để không đụng nhau. */
export const REFERENCE_CODE_BODY_LENGTH = 8;

/**
 * Loại đích của một mã đối soát — `null` khi không nhận ra tiền tố.
 *
 * `null` **không phải lỗi**: nó là đường dẫn tới hàng đợi khớp tay của admin (ADR 0022 điều 4).
 */
export function referenceCodeTarget(code: string | null | undefined): BankMatchTargetType | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  for (const target of BANK_MATCH_TARGET_TYPE_VALUES) {
    if (upper.startsWith(REFERENCE_CODE_PREFIX[target])) return target;
  }
  return null;
}
