/**
 * CHÍNH SÁCH PHÍ có phiên bản — ADR 0028 điều 2–3, ADR 0029 điều 1–2 (R3).
 *
 * Ba dòng phụ phí chuyến, mỗi dòng MỘT cổng bật riêng và MỘT người hưởng riêng:
 *
 *   | Dòng                    | Người hưởng          | Cổng bật                                   |
 *   | ----------------------- | -------------------- | ------------------------------------------ |
 *   | Phí dịch vụ XePrime     | XePrime              | bật được ngay (pilot 10%, tuyến gói 0%)    |
 *   | Thuế khấu trừ/nộp thay  | ngân sách            | tư vấn thuế chốt phân loại + tỷ lệ         |
 *   | Bảo hiểm chuyến đi      | doanh nghiệp bảo hiểm| hợp đồng + policy + chứng nhận (PVI dự kiến)|
 *
 * Phí nằm **PHÍA KHÁCH** (ADR 0029 điều 1): báo giá khách = giá thuê chủ xe + các dòng này.
 * KHÔNG khấu trừ vào tiền thuê của chủ xe — `ownerNetAmount` của một chuyến luôn bằng
 * `totalAmount` của bảng kê giá thuê, trừ khi một dòng có `bearer = owner` (bảo vệ xe — chưa
 * bật ở R3).
 *
 * Mọi giá trị ở đây là DỮ LIỆU của một dòng `fee_policies`; số cụ thể do admin cấu hình, có
 * phiên bản, có ngày hiệu lực, có audit. Booking snapshot toàn bộ lúc tạo (ADR 0024) — đổi
 * policy sau đó KHÔNG hồi tố.
 *
 * Framework-free: api tính, web/mobile hiển thị, worker đọc — cùng một phép tính.
 */

import { STATUS_COLOR, type StatusMeta } from './status/meta';
import { BILLING_MODE, type BillingMode } from './status/billing';

// ── Vòng đời một phiên bản chính sách ───────────────────────────────────────

/**
 * Chỉ có ĐÚNG MỘT bản `active` tại mọi thời điểm (unique một phần ở DB). Kích hoạt bản mới
 * tự lưu trữ bản đang hiệu lực — không có khoảng trống, không có hai bản cùng chạy.
 */
export const FEE_POLICY_STATUS = {
  /** Đang soạn — sửa được, chưa áp cho ai. */
  DRAFT: 'draft',
  /** Đang hiệu lực — BẤT BIẾN. Muốn đổi số thì tạo bản nháp mới rồi kích hoạt. */
  ACTIVE: 'active',
  /** Đã bị bản mới thay — giữ để đọc lại snapshot của đơn cũ. */
  ARCHIVED: 'archived',
} as const;

export type FeePolicyStatus = (typeof FEE_POLICY_STATUS)[keyof typeof FEE_POLICY_STATUS];
export const FEE_POLICY_STATUS_VALUES = Object.values(FEE_POLICY_STATUS) as FeePolicyStatus[];

export function isFeePolicyStatus(value: unknown): value is FeePolicyStatus {
  return typeof value === 'string' && (FEE_POLICY_STATUS_VALUES as string[]).includes(value);
}

export const FEE_POLICY_STATUS_META: Readonly<Record<FeePolicyStatus, StatusMeta>> = {
  [FEE_POLICY_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [FEE_POLICY_STATUS.ACTIVE]: { label: 'Đang hiệu lực', color: STATUS_COLOR.SUCCESS },
  [FEE_POLICY_STATUS.ARCHIVED]: { label: 'Đã lưu trữ', color: STATUS_COLOR.NEUTRAL },
};

// ── Dòng phụ phí ────────────────────────────────────────────────────────────

/**
 * Khoá từng dòng phụ phí trong breakdown của KHÁCH. Tách khỏi `PRICE_ROW` (bảng kê giá THUÊ)
 * có chủ đích: `PRICE_ROW` là hoá đơn của chủ xe với khách — `totalAmount = Σ rows` là doanh
 * thu gian hàng, và sổ thu chi của họ đọc con số đó. Phụ phí là tiền của NGƯỜI KHÁC (XePrime,
 * ngân sách, hãng bảo hiểm) và không được lẫn vào doanh thu của gian hàng.
 */
export const FEE_LINE = {
  /** Phí dịch vụ chuyến đi — XePrime hưởng. */
  SERVICE_FEE: 'service_fee',
  /** Thuế khấu trừ/nộp thay — ngân sách. CHƯA bật ở R3. */
  TAX: 'tax',
  /** Bảo hiểm chuyến đi (tuỳ chọn, người thuê trả) — hãng bảo hiểm. CHƯA bật ở R3. */
  TRIP_INSURANCE: 'trip_insurance',
  /**
   * Bảo vệ xe (bắt buộc, CHỦ XE chịu) — hãng bảo hiểm. CHƯA bật ở R3.
   * Đây là dòng duy nhất có `bearer = owner`: nó KHÔNG cộng vào tổng khách, mà trừ vào tiền
   * phải trả chủ xe.
   */
  VEHICLE_PROTECTION: 'vehicle_protection',
} as const;

export type FeeLineKey = (typeof FEE_LINE)[keyof typeof FEE_LINE];
export const FEE_LINE_VALUES = Object.values(FEE_LINE) as FeeLineKey[];

/** Ai HƯỞNG dòng tiền — tên hiển thị phải theo đúng người hưởng (ADR 0028 điều 3). */
export const FEE_BENEFICIARY = {
  PLATFORM: 'platform',
  TAX_AUTHORITY: 'tax_authority',
  INSURER: 'insurer',
} as const;

export type FeeBeneficiary = (typeof FEE_BENEFICIARY)[keyof typeof FEE_BENEFICIARY];

/** Ai CHỊU dòng tiền. */
export const FEE_BEARER = {
  /** Cộng vào tổng khách trả. */
  CUSTOMER: 'customer',
  /** Trừ vào tiền phải trả chủ xe. */
  OWNER: 'owner',
} as const;

export type FeeBearer = (typeof FEE_BEARER)[keyof typeof FEE_BEARER];

/** Một dòng phụ phí đã tính — snapshot vào đơn/hold. */
export interface FeeLine {
  key: FeeLineKey;
  beneficiary: FeeBeneficiary;
  bearer: FeeBearer;
  /** % áp lên `baseAmount` — giữ để giải thích con số. */
  percent: number;
  /** VND string, đã làm tròn HALF_UP tới đồng. */
  amount: string;
  /** Tên đối tác thật (hãng bảo hiểm) — chỉ có khi dòng đó bật. */
  partnerName?: string;
}

// ── Chính sách (dạng đọc) ───────────────────────────────────────────────────

/**
 * Bộ số của MỘT phiên bản chính sách — dạng JSON đi trên dây và snapshot vào đơn.
 *
 * Mọi `*Enabled = false` là một CỔNG chưa mở, không phải một tỷ lệ 0: UI phải nói "chưa áp
 * dụng", không nói "0%". Bật một cổng mà chưa có căn cứ thật (tư vấn thuế, hợp đồng bảo hiểm)
 * là vi phạm ADR 0028 điều 4–5 — `FeePoliciesService.activate` chặn ở server.
 */
export interface FeePolicyValues {
  /** % phí dịch vụ áp cho TUYẾN HOA HỒNG. Tuyến gói luôn 0 — không phải trường cấu hình. */
  serviceFeePercent: number;
  /** Sàn khoản giữ chỗ (VND). Dưới sàn thì phí chuyển khoản + công đối soát vượt khoản thu. */
  holdMinAmount: string;
  /** Khách có bấy nhiêu phút để chuyển giữ chỗ sau khi chủ xe duyệt. */
  holdPaymentWindowMinutes: number;
  /** Huỷ trước mốc nhận xe bấy nhiêu giờ thì hoàn toàn bộ khoản giữ chỗ. */
  freeCancelHours: number;
  taxEnabled: boolean;
  taxPercent: number | null;
  /** Tên loại thuế do tư vấn thuế chốt — bắt buộc khi `taxEnabled`. */
  taxLabel: string | null;
  tripInsuranceEnabled: boolean;
  tripInsurancePercent: number | null;
  vehicleProtectionEnabled: boolean;
  vehicleProtectionPercent: number | null;
  /** Đối tác bảo hiểm THẬT — bắt buộc khi một dòng bảo hiểm bật. Không điền trước khi có hợp đồng. */
  insurancePartnerName: string | null;
}

/** Snapshot chính sách đóng băng lên đơn/hold — đủ để giải thích số tiền không cần join. */
export interface FeePolicySnapshot extends FeePolicyValues {
  policyId: string;
  version: number;
}

// ── Phép tính ───────────────────────────────────────────────────────────────

/**
 * Kết quả tính phụ phí cho MỘT chuyến — snapshot vào `bookings.price_snapshot_json.fees`.
 *
 * `customerTotalAmount = baseAmount + Σ(lines có bearer = customer)`
 * `ownerNetAmount      = baseAmount − Σ(lines có bearer = owner)`
 *
 * Hai công thức này là QUY TẮC trong code, không phải dữ liệu: ADR 0029 điều 1 chốt phí nằm
 * phía khách, và không có núm nào chuyển nó sang phía chủ xe.
 */
export interface CustomerFeeBreakdown {
  /** Chế độ thu phí đã đóng băng — quyết định `serviceFee` có áp hay không. */
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  /** Mẫu số: `totalAmount` của bảng kê giá thuê (sau giảm, gồm giao nhận). */
  baseAmount: string;
  lines: FeeLine[];
  /** Tổng phụ phí KHÁCH gánh. */
  customerFeeTotal: string;
  /** Số KHÁCH TRẢ cả chuyến (chưa gồm cọc thế chấp). */
  customerTotalAmount: string;
  /** Số CHỦ XE thực nhận từ chuyến. */
  ownerNetAmount: string;
  /**
   * Khoản giữ chỗ khách chuyển online cho XePrime — ADR 0028 điều 6: KHÔNG đồng nhất với phí.
   * Ở R3 phân bổ 100% cho phí dịch vụ (XePrime chỉ giữ tiền của mình — "giới hạn lượng tiền
   * XePrime giữ"). `null` khi chuyến không cần giữ chỗ (tuyến gói, báo giá tạm tính).
   */
  holdAmount: string | null;
}

/** Làm tròn HALF_UP tới đồng — cùng quy tắc với `@xeprime/domain` money. */
function roundHalfUp(value: number): number {
  return Math.round(value + Number.EPSILON);
}

function percentOf(base: number, percent: number): number {
  return roundHalfUp((base * percent) / 100);
}

/**
 * Tính phụ phí cho một chuyến. Hàm THUẦN — cùng một đầu vào cho cùng một đầu ra ở api, web,
 * mobile, worker.
 *
 * `baseAmount` là chuỗi VND nguyên (không thập phân) — bảng kê giá thuê đã làm tròn.
 *
 * Tuyến GÓI: `serviceFee` = 0 và **không sinh dòng** (ADR 0029 điều 2) — bảng kê của khách
 * thuê gian hàng không có dòng "phí dịch vụ 0đ" lấp lửng. Thuế/bảo hiểm (khi bật) áp cho cả
 * hai tuyến như nhau.
 *
 * `quoteIsEstimate = true` ⇒ **không thu giữ chỗ** (CLAUDE.md: không thu phần trăm trên một
 * báo giá tạm tính). Các dòng phí vẫn được tính để hiển thị "dự kiến", nhưng `holdAmount = null`.
 */
export function computeCustomerFees(input: {
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  baseAmount: string;
  quoteIsEstimate?: boolean;
}): CustomerFeeBreakdown {
  const base = Number(input.baseAmount);
  if (!Number.isFinite(base) || base < 0) {
    throw new Error(`baseAmount không hợp lệ: ${input.baseAmount}`);
  }
  const p = input.policy;
  const lines: FeeLine[] = [];

  if (input.billingMode === BILLING_MODE.COMMISSION && p.serviceFeePercent > 0) {
    lines.push({
      key: FEE_LINE.SERVICE_FEE,
      beneficiary: FEE_BENEFICIARY.PLATFORM,
      bearer: FEE_BEARER.CUSTOMER,
      percent: p.serviceFeePercent,
      amount: String(percentOf(base, p.serviceFeePercent)),
    });
  }
  if (p.taxEnabled && p.taxPercent != null && p.taxPercent > 0) {
    lines.push({
      key: FEE_LINE.TAX,
      beneficiary: FEE_BENEFICIARY.TAX_AUTHORITY,
      bearer: FEE_BEARER.CUSTOMER,
      percent: p.taxPercent,
      amount: String(percentOf(base, p.taxPercent)),
    });
  }
  if (p.tripInsuranceEnabled && p.tripInsurancePercent != null && p.tripInsurancePercent > 0) {
    lines.push({
      key: FEE_LINE.TRIP_INSURANCE,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: p.tripInsurancePercent,
      amount: String(percentOf(base, p.tripInsurancePercent)),
      ...(p.insurancePartnerName ? { partnerName: p.insurancePartnerName } : {}),
    });
  }
  if (
    p.vehicleProtectionEnabled &&
    p.vehicleProtectionPercent != null &&
    p.vehicleProtectionPercent > 0
  ) {
    lines.push({
      key: FEE_LINE.VEHICLE_PROTECTION,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.OWNER,
      percent: p.vehicleProtectionPercent,
      amount: String(percentOf(base, p.vehicleProtectionPercent)),
      ...(p.insurancePartnerName ? { partnerName: p.insurancePartnerName } : {}),
    });
  }

  const customerFeeTotal = lines
    .filter((l) => l.bearer === FEE_BEARER.CUSTOMER)
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const ownerDeductions = lines
    .filter((l) => l.bearer === FEE_BEARER.OWNER)
    .reduce((sum, l) => sum + Number(l.amount), 0);

  const serviceFee = lines.find((l) => l.key === FEE_LINE.SERVICE_FEE);
  /*
   * Giữ chỗ = phí dịch vụ (R3). Có phí mà dưới sàn thì nâng lên sàn — sàn là SÀN, không phải
   * làm tròn (ADR 0021 ràng buộc 3, ADR 0028 vẫn giữ): phần chênh vẫn là tiền XePrime giữ và
   * được ghi rõ ở `holdAmount ≠ serviceFee.amount`.
   */
  let holdAmount: string | null = null;
  if (serviceFee && !input.quoteIsEstimate) {
    holdAmount = String(Math.max(Number(serviceFee.amount), Number(p.holdMinAmount)));
  }

  return {
    billingMode: input.billingMode,
    policy: p,
    baseAmount: String(base),
    lines,
    customerFeeTotal: String(customerFeeTotal),
    customerTotalAmount: String(base + customerFeeTotal),
    ownerNetAmount: String(base - ownerDeductions),
    holdAmount,
  };
}

/** Nhãn hiển thị mặc định — web/mobile dịch qua `Domain.feeLine`, đây là bản tiếng Việt gốc. */
export const FEE_LINE_LABEL: Readonly<Record<FeeLineKey, string>> = {
  [FEE_LINE.SERVICE_FEE]: 'Phí dịch vụ XePrime',
  [FEE_LINE.TAX]: 'Thuế khấu trừ/nộp thay',
  [FEE_LINE.TRIP_INSURANCE]: 'Bảo hiểm chuyến đi',
  [FEE_LINE.VEHICLE_PROTECTION]: 'Bảo vệ xe',
};

// ── Ràng buộc kích hoạt ─────────────────────────────────────────────────────

/** Biên của % phí dịch vụ — QUY TẮC; con số cụ thể là DỮ LIỆU. */
export const SERVICE_FEE_PERCENT_MIN = 0;
export const SERVICE_FEE_PERCENT_MAX = 30;

/**
 * Lý do một bản chính sách KHÔNG được kích hoạt — ADR 0028 điều 4–5, mỗi cổng một lý do.
 * Trả mảng rỗng = được. Dùng chung cho server (chặn thật) và form admin (báo sớm).
 */
export function feePolicyActivationBlockers(values: FeePolicyValues): string[] {
  const blockers: string[] = [];
  if (
    values.serviceFeePercent < SERVICE_FEE_PERCENT_MIN ||
    values.serviceFeePercent > SERVICE_FEE_PERCENT_MAX
  ) {
    blockers.push('service_fee_out_of_range');
  }
  if (values.taxEnabled && (values.taxPercent == null || !values.taxLabel?.trim())) {
    blockers.push('tax_requires_rate_and_label');
  }
  const insuranceOn = values.tripInsuranceEnabled || values.vehicleProtectionEnabled;
  if (insuranceOn && !values.insurancePartnerName?.trim()) {
    blockers.push('insurance_requires_partner');
  }
  if (values.tripInsuranceEnabled && values.tripInsurancePercent == null) {
    blockers.push('trip_insurance_requires_rate');
  }
  if (values.vehicleProtectionEnabled && values.vehicleProtectionPercent == null) {
    blockers.push('vehicle_protection_requires_rate');
  }
  if (values.holdPaymentWindowMinutes < 5 || values.holdPaymentWindowMinutes > 7 * 24 * 60) {
    blockers.push('hold_window_out_of_range');
  }
  if (values.freeCancelHours < 0 || values.freeCancelHours > 24 * 30) {
    blockers.push('free_cancel_out_of_range');
  }
  return blockers;
}
