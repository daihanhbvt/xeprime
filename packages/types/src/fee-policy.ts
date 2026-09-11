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
  /** `S` — phí dịch vụ chuyến đi, XePrime hưởng. Tuyến hoa hồng 10%; tuyến gói 0. */
  SERVICE_FEE: 'service_fee',
  /**
   * `T` — thuế khấu trừ/nộp thay, ngân sách hưởng.
   *
   * **CHỦ XE chịu** (ADR 0032 điều 3): khấu trừ khỏi khoản XePrime phải trả chủ xe, KHÔNG bao
   * giờ cộng vào tổng khách. Chỉ phát sinh khi chuyến BẮT ĐẦU — huỷ trước chuyến không có thuế.
   */
  TAX: 'tax',
  /**
   * `IP` — bảo hiểm tai nạn con người, **tuỳ chọn**, KHÁCH trả (ADR 0032 điều 2/4).
   *
   * Giữ khoá cũ `trip_insurance` thay vì đẻ khoá mới: cơ chế trùng khít (tuỳ chọn, khách trả,
   * bỏ chọn được trước khi thanh toán), và đổi khoá là làm hỏng mọi snapshot đã ghi.
   * Chỉ tính khi khách GIỮ lựa chọn — `personalAccidentSelected`.
   */
  TRIP_INSURANCE: 'trip_insurance',
  /**
   * `IV` — bảo hiểm xe/chuyến, **bắt buộc**, KHÁCH trả (ADR 0032 điều 2/4).
   *
   * ⚠️ Đổi người chịu so với ADR 0028: trước đây `bearer = owner` (trừ vào tiền chủ xe), nay là
   * `customer`. ADR 0032 mới hơn và thắng trong phạm vi này.
   */
  VEHICLE_PROTECTION: 'vehicle_protection',
  /**
   * `D` — CỌC đặt chuyến. **Không phải phụ phí**: nó là một PHẦN của giá thuê gốc `B`, nên không
   * cộng vào tổng khách và **không bao giờ xuất hiện trong `lines`**
   * (xem `CustomerFeeBreakdown.depositAmount`).
   *
   * Khoá này tồn tại để `allocation_json` của hold và sổ ví gọi tên được dòng tiền đó.
   */
  DEPOSIT: 'deposit',
} as const;

export type FeeLineKey = (typeof FEE_LINE)[keyof typeof FEE_LINE];
export const FEE_LINE_VALUES = Object.values(FEE_LINE) as FeeLineKey[];

/** Ai HƯỞNG dòng tiền — tên hiển thị phải theo đúng người hưởng (ADR 0028 điều 3). */
export const FEE_BENEFICIARY = {
  PLATFORM: 'platform',
  TAX_AUTHORITY: 'tax_authority',
  INSURER: 'insurer',
  /** Chủ xe/gian hàng — người hưởng dòng CỌC (`D` là tiền thuê, XePrime chỉ giữ hộ). */
  OWNER: 'owner',
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
  /**
   * `D` — % CỌC trên giá thuê gốc. **Nền tảng đặt, không phải gian hàng** (ADR 0033 điều 7):
   * cọc nay là một phần giá thuê, để mỗi shop tự đặt thì cùng một hạng xe lại có mức trả trước
   * khác nhau mà khách không giải thích được.
   */
  depositPercent: number;
  /** Sàn tiền cọc (VND) — cọc quá nhỏ thì công đối soát vượt giá trị giữ chỗ. */
  depositMinAmount: string;
  /** Trần % cọc — chặn "cọc giữ chỗ" biến thành thu tiền thuê trước (ADR 0025 điều 3). */
  depositMaxPercent: number;
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
 * Kết quả tính tiền cho MỘT chuyến — snapshot vào `bookings.price_snapshot_json.fees`.
 *
 * Bốn con số khách cần, theo đúng thứ tự họ hỏi (ADR 0032 điều 2):
 *
 * ```text
 *   customerTotalAmount  = baseAmount + Σ(lines có bearer = customer)   ← tổng cả chuyến
 *   onlineAmount         = D + S + IV + IP                              ← trả NGAY qua QR
 *   payAtPickupAmount    = baseAmount − D                               ← trả TRỰC TIẾP chủ xe
 *   ownerPayableAmount   = D − T                                        ← XePrime nợ chủ xe
 * ```
 *
 * Hai quy tắc không có núm xoay:
 *
 * 1. **Cọc `D` là một PHẦN của `baseAmount`, không phải phụ phí.** Nó không nằm trong `lines`
 *    và không cộng vào `customerTotalAmount` — cộng vào là tính tiền thuê hai lần.
 * 2. **Thuế `T` do CHỦ XE chịu** (ADR 0032 điều 3) nên không vào `customerTotalAmount`; nó trừ
 *    khỏi khoản XePrime phải trả. `IV`/`IP` thì ngược lại: KHÁCH trả, cộng vào tổng khách.
 */
export interface CustomerFeeBreakdown {
  /** Chế độ thu phí đã đóng băng — quyết định `serviceFee` có áp hay không. */
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  /** Mẫu số `B`: `totalAmount` của bảng kê giá thuê (sau giảm, gồm giao nhận). */
  baseAmount: string;
  /** Các dòng PHỤ PHÍ. Không bao giờ chứa `DEPOSIT` — xem `depositAmount`. */
  lines: FeeLine[];
  /** Tổng phụ phí KHÁCH gánh (`S + IV + IP`). */
  customerFeeTotal: string;
  /** Số KHÁCH TRẢ cả chuyến (chưa gồm cọc thế chấp của gian hàng). */
  customerTotalAmount: string;
  /** `D` — cọc khách chuyển cho XePrime. `'0'` khi chuyến không thu cọc. */
  depositAmount: string;
  /** `D + S + IV + IP` — số quét QR trả ngay. Bằng `holdAmount` khi có giữ chỗ. */
  onlineAmount: string;
  /** `B − D` — khách trả TRỰC TIẾP chủ xe lúc nhận xe. XePrime không thu hộ, không đối soát. */
  payAtPickupAmount: string;
  /** `T` — thuế khấu trừ khỏi tiền chủ xe. `'0'` khi cổng thuế chưa mở. */
  taxAmount: string;
  /** `D − T` — khoản XePrime phải trả chủ xe khi chuyến hoàn thành (ADR 0033 điều 2). */
  ownerPayableAmount: string;
  /** Số CHỦ XE thực nhận từ chuyến = `B − T` (gồm cả phần khách trả tay). */
  ownerNetAmount: string;
  /**
   * Khoản giữ chỗ khách chuyển online = `onlineAmount`, đã kẹp sàn.
   * `null` khi chuyến KHÔNG thu cọc (tuyến gói tắt công tắc, hoặc báo giá tạm tính).
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
 * Tính tiền cho một chuyến. Hàm THUẦN — cùng đầu vào cho cùng đầu ra ở api, web, mobile, worker.
 *
 * `baseAmount` là chuỗi VND nguyên (không thập phân) — bảng kê giá thuê đã làm tròn.
 *
 * Tuyến GÓI: `serviceFee` = 0 và **không sinh dòng** (ADR 0029 điều 2) — bảng kê của khách thuê
 * gian hàng không có dòng "phí dịch vụ 0đ" lấp lửng. Thuế/bảo hiểm (khi bật) áp cho cả hai
 * tuyến như nhau.
 *
 * `quoteIsEstimate = true` ⇒ **không thu cọc**: không thu tiền trên một con số chưa chốt. Các
 * dòng phí vẫn tính để hiển thị "dự kiến", nhưng `holdAmount = null` và `depositAmount = '0'`.
 */
export function computeCustomerFees(input: {
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  baseAmount: string;
  quoteIsEstimate?: boolean;
  /**
   * Chuyến này có thu cọc qua XePrime không.
   *
   * Mặc định suy từ tuyến vì đó là QUY TẮC, không phải lựa chọn: tuyến hoa hồng **luôn** thu cọc
   * (ADR 0032 điều 2, không tắt được). Tuyến gói chỉ thu khi gian hàng bật công tắc, nên caller
   * của tuyến đó phải truyền tường minh (`DepositPolicyService` — Phase 6).
   */
  depositRequired?: boolean;
  /** Khách có GIỮ lựa chọn bảo hiểm tai nạn người (`IP`) không. Mặc định: không. */
  personalAccidentSelected?: boolean;
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
  /*
   * Thuế: bearer = OWNER (ADR 0032 điều 3). Trước ADR 0032 dòng này mang bearer = customer —
   * cộng thuế vào giá khách vừa sai bản chất (nghĩa vụ của người bán) vừa làm giá hiển thị đắt
   * lên một cách không giải thích được.
   */
  if (p.taxEnabled && p.taxPercent != null && p.taxPercent > 0) {
    lines.push({
      key: FEE_LINE.TAX,
      beneficiary: FEE_BENEFICIARY.TAX_AUTHORITY,
      bearer: FEE_BEARER.OWNER,
      percent: p.taxPercent,
      amount: String(percentOf(base, p.taxPercent)),
    });
  }
  /* IV — bắt buộc, KHÁCH trả (ADR 0032 điều 4). Trước đây bearer = owner. */
  if (
    p.vehicleProtectionEnabled &&
    p.vehicleProtectionPercent != null &&
    p.vehicleProtectionPercent > 0
  ) {
    lines.push({
      key: FEE_LINE.VEHICLE_PROTECTION,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: p.vehicleProtectionPercent,
      amount: String(percentOf(base, p.vehicleProtectionPercent)),
      ...(p.insurancePartnerName ? { partnerName: p.insurancePartnerName } : {}),
    });
  }
  /* IP — tuỳ chọn: chỉ tính khi khách GIỮ lựa chọn, và lựa chọn đó được lưu vào snapshot. */
  if (
    input.personalAccidentSelected &&
    p.tripInsuranceEnabled &&
    p.tripInsurancePercent != null &&
    p.tripInsurancePercent > 0
  ) {
    lines.push({
      key: FEE_LINE.TRIP_INSURANCE,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: p.tripInsurancePercent,
      amount: String(percentOf(base, p.tripInsurancePercent)),
      ...(p.insurancePartnerName ? { partnerName: p.insurancePartnerName } : {}),
    });
  }

  const customerFeeTotal = lines
    .filter((l) => l.bearer === FEE_BEARER.CUSTOMER)
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const ownerDeductions = lines
    .filter((l) => l.bearer === FEE_BEARER.OWNER)
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const taxAmount = Number(lines.find((l) => l.key === FEE_LINE.TAX)?.amount ?? 0);

  /*
   * CỌC. Tuyến hoa hồng luôn thu; tuyến gói theo công tắc của gian hàng. Báo giá tạm tính thì
   * không thu đồng nào — CLAUDE.md cấm thu phần trăm trên một con số chưa chốt.
   *
   * Kẹp trần bằng `base`: một policy cấu hình sai (sàn cọc lớn hơn cả giá thuê một chuyến ngắn)
   * không được phép sinh ra `payAtPickupAmount` âm.
   */
  const depositRequired =
    (input.depositRequired ?? input.billingMode === BILLING_MODE.COMMISSION) &&
    !input.quoteIsEstimate;
  const deposit = depositRequired
    ? Math.min(base, Math.max(percentOf(base, p.depositPercent), Number(p.depositMinAmount)))
    : 0;

  const insuranceTotal = lines
    .filter((l) => l.key === FEE_LINE.VEHICLE_PROTECTION || l.key === FEE_LINE.TRIP_INSURANCE)
    .reduce((sum, l) => sum + Number(l.amount), 0);
  const serviceFee = Number(lines.find((l) => l.key === FEE_LINE.SERVICE_FEE)?.amount ?? 0);

  /*
   * Số quét QR = D + S + IV + IP. Sàn `holdMinAmount` áp lên TỔNG này, không lên riêng `D`:
   * sàn tồn tại để một lần chuyển khoản đáng công đối soát, và công đó tính trên cả giao dịch.
   */
  const onlineRaw = deposit + serviceFee + insuranceTotal;
  const online = onlineRaw > 0 ? Math.max(onlineRaw, Number(p.holdMinAmount)) : 0;

  return {
    billingMode: input.billingMode,
    policy: p,
    baseAmount: String(base),
    lines,
    customerFeeTotal: String(customerFeeTotal),
    customerTotalAmount: String(base + customerFeeTotal),
    depositAmount: String(deposit),
    onlineAmount: String(online),
    payAtPickupAmount: String(base - deposit),
    taxAmount: String(taxAmount),
    ownerPayableAmount: String(deposit - taxAmount),
    ownerNetAmount: String(base - ownerDeductions),
    holdAmount: depositRequired && online > 0 ? String(online) : null,
  };
}

/** Nhãn hiển thị mặc định — web/mobile dịch qua `Domain.feeLine`, đây là bản tiếng Việt gốc. */
export const FEE_LINE_LABEL: Readonly<Record<FeeLineKey, string>> = {
  [FEE_LINE.SERVICE_FEE]: 'Phí dịch vụ XePrime',
  [FEE_LINE.TAX]: 'Thuế khấu trừ/nộp thay',
  [FEE_LINE.TRIP_INSURANCE]: 'Bảo hiểm tai nạn người ngồi trên xe',
  [FEE_LINE.VEHICLE_PROTECTION]: 'Bảo hiểm xe cho chuyến đi',
  [FEE_LINE.DEPOSIT]: 'Cọc đặt chuyến',
};

// ── Ràng buộc kích hoạt ─────────────────────────────────────────────────────

/** Biên của % phí dịch vụ — QUY TẮC; con số cụ thể là DỮ LIỆU. */
export const SERVICE_FEE_PERCENT_MIN = 0;
export const SERVICE_FEE_PERCENT_MAX = 30;

/**
 * Biên của % cọc — QUY TẮC; con số cụ thể là DỮ LIỆU của từng bản chính sách.
 *
 * Trần 50% là hàng rào cuối: trên mức đó "cọc giữ chỗ" thành thu tiền thuê trước, và XePrime
 * đang giữ hộ gần như cả chuyến tiền của người khác (ADR 0025 điều 3).
 */
export const DEPOSIT_PERCENT_MIN = 0;
export const DEPOSIT_PERCENT_MAX = 50;

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
  if (
    values.depositPercent < DEPOSIT_PERCENT_MIN ||
    values.depositPercent > values.depositMaxPercent ||
    values.depositMaxPercent > DEPOSIT_PERCENT_MAX
  ) {
    blockers.push('deposit_percent_out_of_range');
  }
  /*
   * Thuế tính trên GIÁ THUÊ `B` nhưng chỉ khấu trừ được từ phần XePrime đang cầm là `D`. Nếu
   * `D < T` thì `ownerPayableAmount` âm: nền tảng đã nhận nghĩa vụ nộp thay một khoản lớn hơn
   * số tiền nó giữ, và không có chỗ nào lấy phần chênh. Chặn ở cổng kích hoạt, không để phát
   * hiện ra lúc quyết toán chuyến đầu tiên.
   */
  if (values.taxEnabled && values.taxPercent != null && values.depositPercent < values.taxPercent) {
    blockers.push('deposit_percent_below_tax_percent');
  }
  /*
   * Cửa sổ huỷ miễn phí ngắn hơn cửa sổ trả tiền là một cấu hình vô nghĩa: khách trả ở phút cuối
   * của hạn thanh toán sẽ mất quyền huỷ ngay khi vừa trả xong.
   */
  if (values.freeCancelHours * 60 < values.holdPaymentWindowMinutes) {
    blockers.push('free_cancel_shorter_than_payment_window');
  }
  return blockers;
}

// ── Phân bổ khoản giữ chỗ khi chốt kết cục ──────────────────────────────────

/**
 * Tiền của một hold đi về đâu khi chốt — ADR 0033 điều 3.
 *
 * Không có `platform_balance`: XePrime không có ví. Phần của nền tảng được ghi nhận là DOANH THU
 * và suy ra lúc đọc từ cột tiền của hold, không qua sổ ví (ADR 0033 điều 3).
 */
export const ALLOCATION_TARGET = {
  /** Ví điểm của khách. */
  CUSTOMER_BALANCE: 'customer_balance',
  /** Ví điểm của chủ xe/gian hàng. */
  OWNER_BALANCE: 'owner_balance',
  /** Doanh thu XePrime — ghi nhận, không phải nghĩa vụ với ai. */
  PLATFORM_REVENUE: 'platform_revenue',
  /** Phải trả doanh nghiệp bảo hiểm cho hợp đồng đã phát hành. */
  INSURER_PAYABLE: 'insurer_payable',
} as const;

export type AllocationTarget = (typeof ALLOCATION_TARGET)[keyof typeof ALLOCATION_TARGET];

/** Bốn dòng tiền của một hold — đọc từ CỘT, không suy từ `purpose` (ADR 0033 điều 4). */
export interface HoldMoneyLines {
  /** `D` */ deposit: string;
  /** `S` */ serviceFee: string;
  /** `IV` */ vehicleInsurance: string;
  /** `IP` */ personalInsurance: string;
}

export interface AllocationEntry {
  key: FeeLineKey;
  target: AllocationTarget;
  amount: string;
}

/** Kết cục cần phân bổ. Union hẹp thay vì `BookingHoldOutcome` để gói này không phụ thuộc vòng. */
export type HoldSettlementKind =
  /** Huỷ trong cửa sổ miễn phí · chủ xe huỷ · hold hết hạn còn tiền — hoàn tất cả. */
  | 'refund_all'
  /** Huỷ muộn hoặc no-show — `D + S` chia đôi, `IV + IP` hoàn đủ. */
  | 'split_late_cancel'
  /** Chuyến hoàn thành — mỗi dòng về đúng người hưởng. */
  | 'settled';

/**
 * Chia một khoản giữ chỗ thành các bút toán — hàm THUẦN, dùng chung api/worker/preview admin.
 *
 * Vì sao là hàm chứ không phải bảng tra: nhánh `split_late_cancel` cần một phép chia đôi có
 * **phần dư xác định**. Chia `D + S` cho 2 rồi làm tròn hai lần độc lập sẽ làm tổng lệch 1đ so
 * với số đã thu — và một đồng lệch trên sổ cái là một đồng không ai đối chiếu được. Ở đây phần
 * của nền tảng lấy phần dư (`total − nửa của chủ xe`), nên tổng luôn khớp tuyệt đối.
 *
 * `taxAmount` chỉ dùng ở nhánh `settled`: thuế khấu trừ khỏi phần chủ xe nhận (ADR 0032 điều 3),
 * và chỉ phát sinh khi chuyến đã bắt đầu — hai nhánh huỷ không bao giờ có thuế.
 */
export function resolveHoldAllocation(
  lines: HoldMoneyLines,
  kind: HoldSettlementKind,
  taxAmount: string = '0',
): AllocationEntry[] {
  const d = Number(lines.deposit);
  const s = Number(lines.serviceFee);
  const iv = Number(lines.vehicleInsurance);
  const ip = Number(lines.personalInsurance);
  const out: AllocationEntry[] = [];
  const push = (key: FeeLineKey, target: AllocationTarget, amount: number) => {
    if (amount > 0) out.push({ key, target, amount: String(amount) });
  };

  if (kind === 'refund_all') {
    push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.CUSTOMER_BALANCE, d);
    push(FEE_LINE.SERVICE_FEE, ALLOCATION_TARGET.CUSTOMER_BALANCE, s);
    push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.CUSTOMER_BALANCE, iv);
    push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.CUSTOMER_BALANCE, ip);
    return out;
  }

  if (kind === 'split_late_cancel') {
    // Bảo hiểm chưa mua ⇒ hoàn 100%, không phụ thuộc khả năng hoàn của đối tác (ADR 0032 điều 4).
    push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.CUSTOMER_BALANCE, iv);
    push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.CUSTOMER_BALANCE, ip);
    const splittable = d + s;
    const toOwner = Math.floor(splittable / 2);
    push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.OWNER_BALANCE, toOwner);
    push(FEE_LINE.SERVICE_FEE, ALLOCATION_TARGET.PLATFORM_REVENUE, splittable - toOwner);
    return out;
  }

  // settled — chuyến hoàn thành.
  const tax = Number(taxAmount);
  push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.OWNER_BALANCE, Math.max(0, d - tax));
  push(FEE_LINE.SERVICE_FEE, ALLOCATION_TARGET.PLATFORM_REVENUE, s);
  push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.INSURER_PAYABLE, iv);
  push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.INSURER_PAYABLE, ip);
  return out;
}
