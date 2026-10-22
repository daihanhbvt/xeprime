/**
 * CHÍNH SÁCH PHÍ có phiên bản — LUỒNG TIỀN v2 (20/10/2026, bản thiết kế "New Financial
 * Architecture" v2.0), dựng trên nền ADR 0028 · 0032 · 0033 · 0046.
 *
 * Năm dòng tiền của một chuyến, mỗi dòng MỘT người chịu và MỘT người hưởng:
 *
 *   | Dòng                        | Người chịu | Người hưởng   | Cách tính                            |
 *   | --------------------------- | ---------- | ------------- | ------------------------------------ |
 *   | `S`  Phí sàn                | khách      | XePrime       | cố định MỖI ĐƠN theo loại xe         |
 *   | `H`  Hoa hồng chủ xe        | chủ xe     | XePrime       | lũy tiến theo ngày, chỉ tuyến hoa hồng |
 *   | `IV` Bảo hiểm vật chất xe   | khách      | hãng bảo hiểm | theo ngày, khách TÍCH CHỌN mới tính  |
 *   | `IP` Bảo hiểm tai nạn người | khách      | hãng bảo hiểm | theo ngày, khách TÍCH CHỌN mới tính  |
 *   | `T`  Thuế khấu trừ/nộp thay | chủ xe     | ngân sách     | GTGT% + TNCN% trên tiền thuê theo loại dịch vụ (ADR 0068) |
 *
 * ⚠️ So với ADR đang Accepted, v2 đổi hai điều: phí XePrime không còn chỉ nằm phía khách (ADR 0029
 * điều 1 — nay có `H` trừ vào tiền chủ xe), và tiền giữ chỗ online là TỔNG các phần có chủ
 * `S + H + IV + IP + D` với `D` = % trên TIỀN THUÊ (ADR 0066, thay "% trên tổng khách trả" của
 * ADR 0064 điều 5). Bất biến của ADR 0046 giữ nguyên: mã khuyến mãi chỉ trừ vào phần
 * khách chuyển online, không đổi một đồng nào của chủ xe, hãng bảo hiểm hay ngân sách.
 *
 * **Đúng tới đồng (ADR 0069).** Mọi khoản TÍNH RA từ tỷ lệ (hoa hồng `H`, phần giữ chỗ `D`, thuế
 * GTGT/TNCN) đi qua `roundVnd` — làm tròn tới 1 đồng, nửa đồng lên — để con số khớp đúng tỷ lệ đã
 * công bố (thuế là số nộp ngân sách). Bước 1.000đ chỉ còn ở hai chỗ: số CẤU HÌNH (phí sàn, biểu
 * phí bảo hiểm, các sàn tiền — `feePolicyActivationBlockers` chặn ở cổng kích hoạt) và khoản GIẢM
 * GIÁ theo % (`ceilToThousand`, làm tròn LÊN để khách không bao giờ được giảm ít hơn % đã hứa).
 * Số khách trả tay là PHẦN CÒN LẠI của phép trừ, không bao giờ làm tròn riêng, nên ba đẳng thức
 * bảo toàn đúng tới đồng.
 *
 * Mọi giá trị ở đây là DỮ LIỆU của một dòng `fee_policies`; số cụ thể do admin cấu hình, có
 * phiên bản, có ngày hiệu lực, có audit. Booking snapshot toàn bộ lúc tạo (ADR 0024) — đổi
 * policy sau đó KHÔNG hồi tố.
 *
 * Framework-free: api tính, web/mobile hiển thị, worker đọc — cùng một phép tính.
 */

import { HOLD_MIN_USABLE_WINDOW_MINUTES } from './holds';
import { STATUS_COLOR, type StatusMeta } from './status/meta';
import { BILLING_MODE, type BillingMode } from './status/billing';
import {
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type ServiceType,
  type VehicleType,
} from './status/vehicle';
import { SELLER_ENTITY_TYPE, SELLER_PROFILE_STATUS, type SellerEntityType } from './status/seller';
import {
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_OUTCOME_VALUES,
  isOutcomeAllowed,
  type BookingHoldOutcome,
  type BookingHoldPurpose,
} from './status/hold';
import type { PromoCodeSnapshot } from './promo-code';

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
  /**
   * `S` — PHÍ SÀN phía khách, XePrime hưởng: một số CỐ ĐỊNH mỗi đơn theo loại xe
   * (`customerPlatformFee`), áp cho CẢ HAI tuyến, không phụ thuộc số ngày thuê.
   *
   * Giữ khoá cũ `service_fee` dù cách tính đổi từ % sang cố định: người chịu (khách) và người hưởng
   * (XePrime) không đổi, cột `booking_holds.service_fee_amount` vẫn là cột của nó, và đổi khoá là
   * làm hỏng mọi snapshot đã ghi.
   */
  SERVICE_FEE: 'service_fee',
  /**
   * `H` — HOA HỒNG chủ xe, XePrime hưởng, **CHỦ XE chịu**: lũy tiến theo từng ngày thuê
   * (`computeTieredOwnerCommission`), chỉ tuyến hoa hồng. Tuyến gói 0% và không sinh dòng.
   *
   * Như thuế, dòng này KHÔNG cộng vào tổng khách: nó được giữ lại từ tiền giữ chỗ online (phần tiền thuê của chủ
   * xe khách trả trước), nên `ownerNetAmount = R − H − T` (`R` = tiền thuê, không gồm phí giao).
   */
  OWNER_COMMISSION: 'owner_commission',
  /**
   * `T` — thuế khấu trừ/nộp thay, ngân sách hưởng.
   *
   * **CHỦ XE chịu** (ADR 0032 điều 3): khấu trừ khỏi khoản XePrime phải trả chủ xe, KHÔNG bao
   * giờ cộng vào tổng khách. Chỉ phát sinh khi chuyến BẮT ĐẦU — huỷ trước chuyến không có thuế.
   *
   * MỘT dòng mang TỔNG `GTGT + TNCN` (ADR 0068), `percent` = tổng hai mức. Hai thành phần nằm ở
   * `CustomerFeeBreakdown.vatAmount`/`pitAmount` chứ không thành hai dòng: phân bổ khoản giữ chỗ
   * (`resolveHoldAllocation`), đích `TAX_LEDGER` và mọi snapshot cũ đều đọc đúng một khoá `tax`,
   * và tách dòng là làm hai nơi đó phải biết hai khoá mới chỉ để cộng chúng lại.
   */
  TAX: 'tax',
  /**
   * `IP` — bảo hiểm tai nạn người ngồi trên xe, **tuỳ chọn**, KHÁCH trả (ADR 0032 điều 2/4).
   * Biểu phí theo NGÀY và theo loại xe (`tripInsuranceDailyAmount`).
   *
   * Giữ khoá cũ `trip_insurance` thay vì đẻ khoá mới: cơ chế trùng khít (tuỳ chọn, khách trả,
   * bỏ chọn được trước khi thanh toán), và đổi khoá là làm hỏng mọi snapshot đã ghi.
   * Chỉ tính khi khách GIỮ lựa chọn — `personalAccidentSelected`.
   */
  TRIP_INSURANCE: 'trip_insurance',
  /**
   * `IV` — bảo hiểm vật chất xe, **tuỳ chọn** từ luồng tiền v2 (trước đó bắt buộc), KHÁCH trả.
   * Biểu phí theo NGÀY và theo loại xe (`vehicleProtectionDailyAmount`). Chỉ tính khi khách GIỮ
   * lựa chọn — `vehicleProtectionSelected`.
   *
   * ⚠️ Đổi người chịu so với ADR 0028: trước đây `bearer = owner` (trừ vào tiền chủ xe), nay là
   * `customer`. ADR 0032 mới hơn và thắng trong phạm vi này.
   */
  VEHICLE_PROTECTION: 'vehicle_protection',
  /**
   * `D` — PHẦN CỦA CHỦ XE trong tiền giữ chỗ online: `tiền giữ chỗ − S − H − IV − IP`. **Không phải
   * phụ phí**: nó là tiền thuê khách trả trước, nên không cộng vào tổng khách và **không bao giờ
   * xuất hiện trong `lines`** (xem `CustomerFeeBreakdown.depositAmount`).
   *
   * Khoá này tồn tại để `allocation_json` của hold và sổ ví gọi tên được dòng tiền đó.
   */
  DEPOSIT: 'deposit',
  /**
   * `P` — TÀI TRỢ mã khuyến mãi của XePrime (ADR 0046). **Không phải phụ phí và không bao giờ
   * nằm trong `lines`**: nó là một dòng CONTRA, mang dấu trừ trong hoá đơn của khách.
   *
   * Khoá này chỉ dùng để `allocation_json` gọi tên phần nền tảng đã bù, và để báo cáo tài trợ
   * tách được nó khỏi `service_fee` — hai con số ngược chiều nhau, gộp một khoá là mất luôn khả
   * năng trả lời "tháng này đã tài trợ bao nhiêu".
   */
  PROMO: 'promo',
  /**
   * `D + H` — "phần tiền thuê trả trước" trong khoản giữ chỗ, NHƯ KHÁCH THẤY. Chỉ sinh ở bề mặt
   * phía khách (`customerHoldAllocation`), không bao giờ ghi vào `allocation_json` hay snapshot.
   *
   * Lý do gộp: khách biết `amount`, `S`, `IV`, `IP`, `P`, nên để lộ RIÊNG `D` là để khách suy ra
   * `H = amount + P − D − S − IV − IP` — hoa hồng chủ xe bị thu (ADR 0064 điều 11). Gộp lại thì các
   * dòng vẫn cộng đúng bằng `amount` mà không dòng nào kể kinh tế của chủ xe.
   */
  RENT_PREPAID: 'rent_prepaid',
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
  /**
   * % áp lên `baseAmount` — giữ để giải thích con số. `null` khi dòng KHÔNG tính bằng một tỷ lệ
   * duy nhất: phí sàn cố định, bảo hiểm theo ngày, hoa hồng lũy tiến (nấc nằm ở `policy`).
   */
  percent: number | null;
  /** Đơn giá MỖI NGÀY — chỉ dòng tính theo ngày (bảo hiểm). */
  unitAmount?: string;
  /** Số ngày đã nhân với `unitAmount`. */
  quantity?: number;
  /**
   * VND string nguyên (đồng). Dòng tính từ tỷ lệ (hoa hồng, thuế) có thể lẻ tới đồng (ADR 0069);
   * dòng cấu hình (phí sàn, bảo hiểm theo ngày) là bội 1.000đ.
   */
  amount: string;
  /** Tên đối tác thật (hãng bảo hiểm) — chỉ có khi dòng đó bật. */
  partnerName?: string;
}

// ── Làm tròn tiền & hoa hồng lũy tiến ───────────────────────────────────────

/**
 * Bước giá của số CẤU HÌNH (phí sàn, biểu phí bảo hiểm, các sàn tiền, giá gói) và của khoản GIẢM
 * GIÁ theo % — ADR 0069 điều 2–3. KHÔNG phải bước của khoản tính ra từ tỷ lệ (xem `roundVnd`).
 */
export const MONEY_STEP_VND = 1000;

/**
 * Làm tròn tới **1 đồng** — hàm chuẩn của mọi khoản TÍNH RA từ tỷ lệ (ADR 0069 điều 1): hoa hồng
 * `H`, phần giữ chỗ `D`, thuế GTGT/TNCN, phí giao xe theo km. VND không có đơn vị nhỏ hơn đồng.
 *
 * Nửa đồng làm tròn LÊN (`Math.round`: `58.500,5 → 58.501`, `58.500,4 → 58.500`) — với số dương
 * đó đúng là "half-up". Mọi đầu vào ở đây không âm; số âm không đi qua hàm này.
 *
 * Nhân trước, chia sau ở caller (`(base × percent) / 100`) để sai số dấu phẩy động không đẩy một
 * kết quả nguyên thành `x,4999…`.
 */
export function roundVnd(n: number): number {
  return Math.round(n);
}

/**
 * Làm tròn LÊN tới bước 1.000đ — chỉ cho khoản GIẢM GIÁ theo % (khuyến mãi trực tiếp của xe, ưu
 * đãi cam kết dài hạn, mã khuyến mãi nền tảng theo %): khách KHÔNG BAO GIỜ được giảm ít hơn % đã
 * công bố (ADR 0069 điều 2). Trần (của mã, phần tài trợ được…) áp SAU phép này, và trần thấp hơn
 * thì lấy đúng trần — kết quả có thể lẻ nhưng đúng.
 *
 * Trừ trước một epsilon nhỏ để `65.000,0000001` (sai số của `x × % / 100`) không thành `66.000`.
 */
export function ceilToThousand(n: number): number {
  if (!(n > 0)) return 0;
  return Math.ceil(n / MONEY_STEP_VND - 1e-9) * MONEY_STEP_VND;
}

/**
 * `percent`% của `base`, đúng tới đồng (`roundVnd`) — phép nhân tỷ lệ DUY NHẤT của luồng tiền.
 *
 * Nhân với % đã quy về phần TRĂM NGHÌN nguyên (`percent × 100`, % có tối đa hai chữ số thập phân
 * ở mọi DTO) rồi mới chia 10.000: `base × 1,5` hay `base × 2,25` không còn đi qua một số thực
 * không biểu diễn đúng, nên nửa đồng thật (`x,5`) luôn làm tròn lên chứ không rơi xuống vì sai số.
 */
export function percentOfVnd(base: number, percent: number): number {
  return roundVnd((base * Math.round(percent * 100)) / 10_000);
}

/**
 * `n` là một bội không âm của 1.000đ — điều kiện của mọi số tiền cấu hình (chính sách phí, giá xe,
 * bậc giao xe, mã khuyến mãi). Nhận số lẫn chuỗi VND (ADR 0007); chuỗi rác/âm ⇒ `false`.
 */
export function isThousandStep(n: number | string): boolean {
  const value = typeof n === 'string' ? (n.trim() === '' ? Number.NaN : Number(n)) : n;
  return Number.isFinite(value) && value >= 0 && value % MONEY_STEP_VND === 0;
}

/**
 * Một NẤC hoa hồng: áp `percent` cho mọi ngày từ `fromDay` (tính từ 1) tới ngày liền trước
 * `fromDay` của nấc kế tiếp; nấc cuối kéo dài vô hạn.
 *
 * Chỉ khai mốc BẮT ĐẦU, không khai cặp `from–to`: dữ liệu như vậy không biểu diễn được một khoảng
 * hở hay hai nấc chồng nhau, nên không có cấu hình nào khiến một ngày thuê "không thuộc nấc nào".
 */
export interface OwnerCommissionTier {
  fromDay: number;
  percent: number;
}

/** Trần % của MỘT nấc — hàng rào chống gõ nhầm, không phải con số kinh doanh. */
export const OWNER_COMMISSION_PERCENT_MAX = 30;

/** Trần SỐ NẤC hoa hồng — chặn payload phình; nghiệp vụ thực tế 3–5 nấc. DTO và form admin đọc chung. */
export const OWNER_COMMISSION_TIERS_MAX = 12;

/** Trần `fromDay` của một nấc (~10 năm) — hàng rào gõ nhầm. DTO và form admin đọc chung. */
export const OWNER_COMMISSION_FROM_DAY_MAX = 3650;

/** % hoa hồng của ngày thứ `day` (tính từ 1). Không có nấc nào phủ ngày đó ⇒ 0. */
export function ownerCommissionPercentForDay(
  day: number,
  tiers: readonly OwnerCommissionTier[],
): number {
  let percent = 0;
  for (const tier of tiers) {
    if (tier.fromDay <= day) percent = tier.percent;
  }
  return percent;
}

/**
 * HOA HỒNG chủ xe lũy tiến theo từng ngày thuê — `Σ giá ngày i × % nấc của ngày i`.
 *
 * `dayAmounts[i]` là giá thuê của ngày thứ `i + 1`, nên giá ngày thường/cuối tuần khác nhau vẫn
 * tính đúng "% giá thuê ngày đó". Làm tròn tới ĐỒNG (`roundVnd`, ADR 0069) MỘT lần trên tổng, không
 * làm tròn từng ngày: 3 ngày × 333.333đ ở 10/10/7% ra 89.999,91đ ⇒ 90.000đ, còn tròn từng ngày sẽ
 * ra 33.333 + 33.333 + 23.333 = 89.999đ — lệch chỉ vì thứ tự phép tính.
 *
 * `tiers` phải theo thứ tự `fromDay` tăng dần (`feePolicyActivationBlockers` chặn bản lộn xộn).
 */
export function computeTieredOwnerCommission(
  dayAmounts: readonly (string | number)[],
  tiers: readonly OwnerCommissionTier[],
): string {
  let weighted = 0;
  dayAmounts.forEach((raw, index) => {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Giá thuê ngày ${index + 1} không hợp lệ: ${raw}`);
    }
    // Nhân với % quy về phần trăm nghìn nguyên, chia 10.000 sau cùng — xem `percentOfVnd`.
    weighted += amount * Math.round(ownerCommissionPercentForDay(index + 1, tiers) * 100);
  });
  return String(roundVnd(weighted / 10_000));
}

// ── Thuế khấu trừ, nộp thay (ADR 0068) ──────────────────────────────────────

/**
 * NHÓM ngành nghề theo Nghị định 117/2025/NĐ-CP — quyết định cặp tỷ lệ GTGT/TNCN. Mã đi trên dây
 * và vào sổ thuế (`tax_withholdings.tax_category`), không dịch.
 */
export const TAX_CATEGORY = {
  /** Dịch vụ — 5% GTGT + 2% TNCN (tự lái, dài hạn). */
  SERVICE: 'service',
  /** Vận tải — 3% GTGT + 1,5% TNCN (xe có tài xế). */
  TRANSPORT: 'transport',
} as const;

export type TaxCategory = (typeof TAX_CATEGORY)[keyof typeof TAX_CATEGORY];
export const TAX_CATEGORY_VALUES = Object.values(TAX_CATEGORY) as TaxCategory[];

/**
 * Loại dịch vụ của đơn → nhóm NĐ 117 — QUY TẮC phân loại, không phải dữ liệu chính sách (tỷ lệ
 * mới là dữ liệu). Thuê xe tự lái/dài hạn là "dịch vụ", có tài xế là "vận tải" — tư vấn thuế phải
 * xác nhận trước khi mở release gate (ADR 0068 mục "Chưa quyết" 1).
 */
export const TAX_CATEGORY_BY_SERVICE_TYPE: Readonly<Record<ServiceType, TaxCategory>> = {
  [SERVICE_TYPE.SELF_DRIVE]: TAX_CATEGORY.SERVICE,
  [SERVICE_TYPE.LONG_TERM]: TAX_CATEGORY.SERVICE,
  [SERVICE_TYPE.WITH_DRIVER]: TAX_CATEGORY.TRANSPORT,
};

/** Cặp tỷ lệ khấu trừ của MỘT loại dịch vụ — % trên tiền thuê `R`, tối đa hai chữ số thập phân. */
export interface TaxRate {
  /** % thuế GTGT khấu trừ thay. */
  vatPercent: number;
  /** % thuế TNCN khấu trừ thay. */
  pitPercent: number;
}

/**
 * Bảng mức khấu trừ theo LOẠI DỊCH VỤ — `fee_policies.tax_rates` (jsonb). Đủ ba khoá: thiếu một
 * loại là lỗi kích hoạt, không phải 0% (một loại dịch vụ "quên" khai là không khấu trừ cả loại).
 */
export type TaxRatesByServiceType = Readonly<Record<ServiceType, TaxRate>>;

/**
 * Mức của NĐ 117/2025 (người bán cư trú) — giá trị khởi tạo cho form admin và migration v9, giống
 * Mioto (7% tự lái/dài hạn, 4,5% có tài xế). Chính sách đang hiệu lực mới là nguồn sự thật; đừng
 * đọc hằng này lúc tính tiền.
 */
export const TAX_RATES_DEFAULTS: TaxRatesByServiceType = {
  [SERVICE_TYPE.SELF_DRIVE]: { vatPercent: 5, pitPercent: 2 },
  [SERVICE_TYPE.LONG_TERM]: { vatPercent: 5, pitPercent: 2 },
  [SERVICE_TYPE.WITH_DRIVER]: { vatPercent: 3, pitPercent: 1.5 },
};

/** Căn cứ pháp lý mặc định của form admin. */
export const TAX_LEGAL_BASIS_DEFAULT = 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP';

/**
 * Trần MỖI sắc thuế — mức cao nhất trong bảng tỷ lệ của NĐ 117/2025 (GTGT dịch vụ 5%; TNCN người
 * không cư trú 5%). Vượt trần là gõ nhầm hoặc một căn cứ pháp lý mà code chưa biết — chặn ở cổng
 * kích hoạt và ở DTO, không để khấu trừ thừa tiền của chủ xe.
 */
export const TAX_VAT_PERCENT_MAX = 5;
export const TAX_PIT_PERCENT_MAX = 5;

/** Trần độ dài căn cứ pháp lý — khớp `fee_policies.tax_legal_basis VARCHAR(255)`. */
export const TAX_LEGAL_BASIS_MAX_LENGTH = 255;

/** Vì sao một đơn KHÔNG bị khấu trừ dù cổng thuế đang mở. */
export const TAX_EXEMPT_REASON = {
  /** Người bán là doanh nghiệp ĐÃ XÁC MINH — tự xuất hoá đơn, tự kê khai (ADR 0068 điều 2). */
  COMPANY: 'company',
} as const;

export type TaxExemptReason = (typeof TAX_EXEMPT_REASON)[keyof typeof TAX_EXEMPT_REASON];

/** Tổng hai sắc thuế của một cặp tỷ lệ. */
export function taxRateTotalPercent(rate: TaxRate): number {
  // Cộng trên phần trăm nghìn nguyên: 3 + 1,5 = 4,5 chứ không phải 4,499999…
  return (Math.round(rate.vatPercent * 100) + Math.round(rate.pitPercent * 100)) / 100;
}

/** Mức tổng CAO NHẤT trong bảng — sàn của `depositPercent` (`D ≥ T` ở mọi đơn, ADR 0068 điều 3). */
export function maxTaxRatePercent(rates: TaxRatesByServiceType): number {
  return Math.max(...SERVICE_TYPE_VALUES.map((type) => taxRateTotalPercent(rates[type])));
}

/**
 * Loại dịch vụ CHƯA XÁC ĐỊNH ⇒ mức cao nhất của bảng — đúng quy tắc "không xác định được nhóm
 * ngành nghề thì áp tỷ lệ cao nhất" của NĐ 117. Thiếu dữ liệu không bao giờ làm khấu trừ ít đi.
 */
export function taxRateFor(
  rates: TaxRatesByServiceType,
  serviceType: ServiceType | null | undefined,
): { rate: TaxRate; category: TaxCategory } {
  if (serviceType && SERVICE_TYPE_VALUES.includes(serviceType)) {
    return { rate: rates[serviceType], category: TAX_CATEGORY_BY_SERVICE_TYPE[serviceType] };
  }
  const highest = [...SERVICE_TYPE_VALUES].sort(
    (a, b) => taxRateTotalPercent(rates[b]) - taxRateTotalPercent(rates[a]),
  )[0]!;
  return { rate: rates[highest], category: TAX_CATEGORY_BY_SERVICE_TYPE[highest] };
}

/**
 * Đọc `fee_policies.tax_rates` (jsonb) — `null` khi vắng hoặc HỎNG ở bất kỳ khoá nào. Không vá
 * từng phần: một bảng thiếu một loại dịch vụ mà được coi là "0%" là không khấu trừ cả loại đó.
 * Bản nháp hỏng thì `feePolicyActivationBlockers` chặn kích hoạt; bản đã kích hoạt đã qua cổng đó.
 */
export function parseTaxRates(raw: unknown): TaxRatesByServiceType | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const out = {} as Record<ServiceType, TaxRate>;
  for (const type of SERVICE_TYPE_VALUES) {
    const entry = source[type];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const { vatPercent, pitPercent } = entry as Record<string, unknown>;
    if (
      typeof vatPercent !== 'number' ||
      typeof pitPercent !== 'number' ||
      !Number.isFinite(vatPercent) ||
      !Number.isFinite(pitPercent)
    ) {
      return null;
    }
    out[type] = { vatPercent, pitPercent };
  }
  return out;
}

/** Bảng mức hợp lệ: mỗi sắc thuế trong `[0, trần NĐ 117]`, tối đa hai chữ số thập phân. */
export function taxRatesValid(rates: TaxRatesByServiceType): boolean {
  const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
  return SERVICE_TYPE_VALUES.every((type) => {
    const { vatPercent, pitPercent } = rates[type];
    return (
      vatPercent >= 0 &&
      vatPercent <= TAX_VAT_PERCENT_MAX &&
      pitPercent >= 0 &&
      pitPercent <= TAX_PIT_PERCENT_MAX &&
      twoDecimals(vatPercent) &&
      twoDecimals(pitPercent)
    );
  });
}

/**
 * Nhãn của một cặp tỷ lệ — "GTGT 5% + TNCN 2%". Đây là DỮ LIỆU ghi vào sổ thuế
 * (`tax_withholdings.label`) và CSV kê khai (tiếng Việt, như tờ khai), không phải chuỗi giao diện:
 * web/mobile dựng nhãn của mình từ `vatPercent`/`pitPercent` qua i18n.
 */
export function taxRateLabel(vatPercent: number, pitPercent: number): string {
  const pct = (n: number) => `${String(n).replace('.', ',')}%`;
  return `GTGT ${pct(vatPercent)} + TNCN ${pct(pitPercent)}`;
}

/**
 * Chủ thể ÁP THUẾ của gian hàng — ADR 0068 điều 2.
 *
 * Chỉ một hồ sơ người bán ĐÃ XÁC MINH khai `company` mới được miễn khấu trừ. Mọi trường hợp khác
 * (chưa có hồ sơ, hồ sơ nháp/chờ duyệt/bị từ chối/cần bổ sung) đều là CÁ NHÂN: thiếu dữ liệu, hay
 * dữ liệu tự khai chưa ai kiểm, không được làm mất nghĩa vụ khấu trừ. Hồ sơ đã xác minh mà đổi loại
 * chủ thể/MST/CCCD tự rơi về chờ duyệt (`SellerProfileService.save`), nên nhãn "đã xác minh" luôn
 * nói về đúng loại chủ thể đang khai. Hộ kinh doanh giữ `household_business` (cùng mức cá nhân).
 */
export function taxSellerEntityOf(
  profile: { entityType: string; status: string } | null | undefined,
): SellerEntityType {
  if (!profile) return SELLER_ENTITY_TYPE.INDIVIDUAL;
  if (profile.entityType === SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS) {
    return SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS;
  }
  if (
    profile.entityType === SELLER_ENTITY_TYPE.COMPANY &&
    profile.status === SELLER_PROFILE_STATUS.VERIFIED
  ) {
    return SELLER_ENTITY_TYPE.COMPANY;
  }
  return SELLER_ENTITY_TYPE.INDIVIDUAL;
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
  /**
   * @deprecated Luồng tiền v2 thay % phí dịch vụ bằng phí sàn cố định (`customerPlatformFee`)
   * cộng hoa hồng lũy tiến (`ownerCommissionTiers`). `computeCustomerFees` không còn đọc trường
   * này; nó chỉ còn sống tới khi cột DB và form admin được gỡ.
   */
  serviceFeePercent: number;
  /**
   * Sàn khoản khách chuyển online SAU tài trợ mã khuyến mãi (VND). Dưới sàn thì phí chuyển khoản
   * + công đối soát vượt khoản thu.
   */
  holdMinAmount: string;
  /** Khách có bấy nhiêu phút để chuyển giữ chỗ sau khi chủ xe duyệt. */
  holdPaymentWindowMinutes: number;
  /** Huỷ trước mốc nhận xe bấy nhiêu giờ thì hoàn toàn bộ khoản giữ chỗ. */
  freeCancelHours: number;
  /**
   * % PHẦN CHỦ XE `D` trong tiền giữ chỗ, tính trên TIỀN THUÊ `B` (sau khuyến mãi trực tiếp của
   * xe, KHÔNG gồm phí giao xe `G`) — 15% từ ADR 0066 (trước đó là % trên tổng khách trả). **Nền
   * tảng đặt, không phải gian hàng** (ADR 0033 điều 7): để mỗi shop tự đặt thì cùng một hạng xe
   * lại có mức trả trước khác nhau mà khách không giải thích được.
   */
  depositPercent: number;
  /** Sàn của `D` (VND), áp sau phép nhân %: `D = max(depositPercent% × B, depositMinAmount)`. */
  depositMinAmount: string;
  /** Trần % của `D` — chặn tiền giữ chỗ biến thành thu tiền thuê trước (ADR 0025 điều 3). */
  depositMaxPercent: number;
  /** `S` — phí sàn CỐ ĐỊNH mỗi đơn, phía khách, theo loại xe. Áp cho cả hai tuyến. */
  customerPlatformFee: PerVehicleTypeAmount;
  /** `H` — nấc hoa hồng lũy tiến theo ngày của TUYẾN HOA HỒNG, `fromDay` tăng dần từ 1. */
  ownerCommissionTiers: readonly OwnerCommissionTier[];
  /** Cổng khấu trừ thuế (ADR 0068). Tắt ⇒ `T = 0` ở mọi đơn. */
  taxEnabled: boolean;
  /**
   * Bảng mức khấu trừ theo LOẠI DỊCH VỤ, tách GTGT/TNCN (ADR 0068 điều 1). Bắt buộc khi
   * `taxEnabled` (cổng kích hoạt + CHECK ở DB). `null` ở chính sách trước v9 — chúng chỉ còn được
   * đọc lại qua snapshot, không bao giờ tính tiền mới.
   */
  taxRates: TaxRatesByServiceType | null;
  /** Căn cứ pháp lý của việc khấu trừ — bắt buộc khi `taxEnabled`, ví dụ `TAX_LEGAL_BASIS_DEFAULT`. */
  taxLegalBasis: string | null;
  /**
   * @deprecated ADR 0068 — một mức cho mọi chuyến (chính sách ≤ v8). Thay bằng `taxRates`;
   * `computeCustomerFees` không còn đọc trường này. Giữ để snapshot cũ đọc lại được.
   */
  taxPercent: number | null;
  /**
   * @deprecated ADR 0068 — tên loại thuế của chính sách ≤ v8, thay bằng `taxLegalBasis`. Sổ thuế
   * ghi nhãn theo đúng cặp tỷ lệ đã áp (`taxRateLabel`), không đọc trường này.
   */
  taxLabel: string | null;
  tripInsuranceEnabled: boolean;
  /** @deprecated Bảo hiểm tính theo ngày — xem `tripInsuranceDailyAmount`. */
  tripInsurancePercent: number | null;
  /** `IP` — biểu phí bảo hiểm tai nạn người MỖI NGÀY, theo loại xe. */
  tripInsuranceDailyAmount: PerVehicleTypeAmount;
  vehicleProtectionEnabled: boolean;
  /** @deprecated Bảo hiểm tính theo ngày — xem `vehicleProtectionDailyAmount`. */
  vehicleProtectionPercent: number | null;
  /** `IV` — biểu phí bảo hiểm vật chất xe MỖI NGÀY, theo loại xe. */
  vehicleProtectionDailyAmount: PerVehicleTypeAmount;
  /** Đối tác bảo hiểm THẬT — bắt buộc khi một dòng bảo hiểm bật. Không điền trước khi có hợp đồng. */
  insurancePartnerName: string | null;
}

/** Một số tiền (VND string) cho TỪNG loại xe — thiếu một loại là lỗi biên dịch, không phải 0đ. */
export type PerVehicleTypeAmount = Readonly<Record<VehicleType, string>>;

/**
 * Bộ số mặc định của luồng tiền v2 — giá trị khởi tạo cho bản chính sách đầu tiên (seed/migration)
 * và form admin. Chính sách đang hiệu lực mới là nguồn sự thật; đừng đọc hằng này lúc tính tiền.
 */
export const FEE_SCHEDULE_DEFAULTS = {
  depositPercent: 15,
  depositMinAmount: '0',
  customerPlatformFee: { [VEHICLE_TYPE.CAR]: '50000', [VEHICLE_TYPE.MOTORBIKE]: '30000' },
  ownerCommissionTiers: [
    { fromDay: 1, percent: 10 },
    { fromDay: 3, percent: 7 },
    { fromDay: 8, percent: 3 },
    { fromDay: 31, percent: 0 },
  ],
  vehicleProtectionDailyAmount: { [VEHICLE_TYPE.CAR]: '50000', [VEHICLE_TYPE.MOTORBIKE]: '15000' },
  tripInsuranceDailyAmount: { [VEHICLE_TYPE.CAR]: '20000', [VEHICLE_TYPE.MOTORBIKE]: '5000' },
} as const satisfies Pick<
  FeePolicyValues,
  | 'depositPercent'
  | 'depositMinAmount'
  | 'customerPlatformFee'
  | 'ownerCommissionTiers'
  | 'vehicleProtectionDailyAmount'
  | 'tripInsuranceDailyAmount'
>;

/** Snapshot chính sách đóng băng lên đơn/hold — đủ để giải thích số tiền không cần join. */
export interface FeePolicySnapshot extends FeePolicyValues {
  policyId: string;
  version: number;
}

// ── Phép tính ───────────────────────────────────────────────────────────────

/**
 * Kết quả tính tiền cho MỘT chuyến — snapshot vào `bookings.price_snapshot_json.fees`.
 *
 * Luồng tiền v2 (tiền giữ chỗ theo ADR 0066), theo đúng thứ tự khách và chủ xe hỏi:
 *
 * ```text
 *   R  (tiền thuê)         = B − G      (G = phí giao nhận nằm trong B)
 *   H                      = roundVnd(Σ % nấc × giá thuê từng ngày)    (trên R, không trên G)
 *   GTGT                   = roundVnd(vat% × R)   ┐ mức theo LOẠI DỊCH VỤ (ADR 0068), 0 khi
 *   TNCN                   = roundVnd(pit% × R)   ┘ cổng tắt hoặc người bán là doanh nghiệp
 *   T                      = GTGT + TNCN
 *   grossCustomerTotal     = B + S + IV + IP                           ← tổng trước mã
 *   D_target               = max(roundVnd(depositPercent% × R), depositMinAmount)
 *   grossOnlineAmount      = min(grossCustomerTotal − G,
 *                                max(S + H + IV + IP + D_target,
 *                                    S + H + IV + IP + T,
 *                                    holdMinAmount))               ← tiền giữ chỗ trước mã
 *   onlineAmount           = grossOnlineAmount − P                     ← trả NGAY qua QR
 *   payAtPickupAmount      = grossCustomerTotal − grossOnlineAmount    ← trả TRỰC TIẾP chủ xe
 *   customerTotalAmount    = grossCustomerTotal − P                    ← tổng cả chuyến
 *   depositAmount (D)      = grossOnlineAmount − S − H − IV − IP       ← phần chủ xe giữ chỗ
 *   platformRetainedAmount = S + H                                     ← "sàn giữ lại"
 *   ownerPayableAmount     = D − T                                     ← sàn chuyển ví chủ xe
 *   taxableBaseAmount      = R                                         ← mẫu số của T
 *   ownerNetAmount         = R − H − T                                 ← chủ xe nhận cho TIỀN THUÊ
 *                          = payAtPickup + ownerPayable − G
 * ```
 *
 * Mọi khoản tính từ tỷ lệ đúng tới ĐỒNG (`roundVnd`, ADR 0069) — mã QR có thể mang số lẻ.
 *
 * Ba đẳng thức bảo toàn đúng ở MỌI đầu vào, nên không có đường nào lệch một đồng:
 * `onlineAmount + payAtPickupAmount = customerTotalAmount`,
 * `grossOnlineAmount = D + S + H + IV + IP`,
 * `payAtPickupAmount + ownerPayableAmount = ownerNetAmount + G` — phí giao `G` là tiền mặt chủ xe
 * nhận tận tay, hiện riêng ở `deliveryAmount`, không gộp vào "chủ xe nhận cho tiền thuê" (ADR 0064
 * điều 5: `ownerNet = B − H − T` với `B` không gồm `G`).
 *
 * `P` là TÀI TRỢ mã khuyến mãi của XePrime (ADR 0046). Nó chỉ trừ vào `onlineAmount` và
 * `customerTotalAmount`; tiền giữ chỗ được tính TRƯỚC mã, nên `B`, `S`, `H`, `T`, `IV`, `IP`,
 * `D`, `payAtPickupAmount`, `ownerPayableAmount` và `ownerNetAmount` KHÔNG đổi một đồng — đó là
 * điều làm nó khác `PRICE_ROW.DISCOUNT`, khuyến mãi trực tiếp mà CHỦ XE tự bớt vào doanh thu.
 *
 * Ba quy tắc không có núm xoay:
 *
 * 1. **`D` là tiền thuê trả trước, không phải phụ phí.** Nó không nằm trong `lines` và không cộng
 *    vào `customerTotalAmount` — cộng vào là tính tiền thuê hai lần.
 * 2. **`H` và `T` do CHỦ XE chịu** nên không vào `customerTotalAmount`. `H` là một khoản RIÊNG
 *    trong tiền giữ chỗ, cộng THÊM trên `D` (ADR 0066) — không cắt từ phần cam kết giữ xe của chủ
 *    xe; `T` được khấu trừ từ `D` lúc quyết toán. `S`/`IV`/`IP` thì ngược lại: KHÁCH trả, cộng vào
 *    tổng khách.
 * 3. **Tiền giữ chỗ luôn đủ trả mọi thứ không phải của chủ xe** (`S + H + IV + IP + T`). XePrime
 *    không thu hộ phần trả tay, nên một khoản nhỏ hơn số đó sẽ để lại một món nợ ngược từ chủ xe
 *    mà không có chỗ nào để đòi — `ownerPayableAmount` vì thế không âm chừng nào `H + T ≤ B`.
 *
 * 4. **Phí giao nhận `G` là tiền của chủ xe, trả TẬN TAY** (ADR 0064, giữ quyết định Wave 9). Nó
 *    nằm trong `B` (khách vẫn trả, chủ xe hưởng 100%) nhưng KHÔNG vào mẫu số `depositPercent`,
 *    KHÔNG vào mẫu số hoa hồng hay thuế, và tiền giữ chỗ bị kẹp ≤ `tổng − G` — nên `G` luôn rơi
 *    trọn vào `payAtPickupAmount`. XePrime không cầm hộ tiền xăng của người lái xe tới.
 *
 * Ba đẳng thức chỉ là cam kết khi chuyến CÓ thu online (`holdAmount ≠ null`). Báo giá tạm tính
 * không thu đồng nào: các con số của nó là "dự kiến" và sẽ được tính lại khi giá được chốt.
 */
export interface CustomerFeeBreakdown {
  /** Chế độ thu phí đã đóng băng — quyết định `H` có áp hay không. */
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  /** Loại xe đã đóng băng — quyết định mức `S` và biểu phí bảo hiểm. */
  vehicleType: VehicleType;
  /** Số ngày thuê tính phí — nhân biểu phí bảo hiểm và chia nấc hoa hồng. */
  rentalDays: number;
  /**
   * Giá thuê TỪNG ngày, ngày 1 trước — ĐÚNG mảng đã làm mẫu số hoa hồng lũy tiến `H` (sau khuyến
   * mãi trực tiếp của xe, KHÔNG gồm phí giao `G`), đóng băng cùng mọi con số khác (ADR 0024) để
   * chi tiết đơn biết đơn giá có đồng nhất không (đặc tả 05 §7.1).
   *
   * Vắng khi caller không truyền giá từng ngày (`H` chia đều `B − G`), và ở snapshot đóng băng
   * trước 22/10/2026 — chỗ đọc phải hiểu vắng mặt là "không biết", không phải "chia đều".
   */
  dayAmounts?: string[];
  /** `B`: `totalAmount` của bảng kê giá thuê (sau giảm, GỒM giao nhận `G`). */
  baseAmount: string;
  /**
   * `G` — phần phí giao nhận nằm trong `B`, trả tận tay chủ xe. `'0'` khi chuyến không giao tận
   * nơi. Tiền thuê chịu phí/thuế `R = B − G`.
   *
   * Tuỳ chọn ở kiểu đọc: snapshot đóng băng trước 21/10/2026 không có trường này (phí giao lúc
   * đó luôn 0 khi duyệt — Wave 9), và đọc lại chúng phải hiểu vắng mặt là `'0'`.
   */
  deliveryAmount?: string;
  /** Các dòng PHỤ PHÍ. Không bao giờ chứa `DEPOSIT` — xem `depositAmount`. */
  lines: FeeLine[];
  /** Tổng phụ phí KHÁCH gánh (`S + IV + IP`). */
  customerFeeTotal: string;
  /** Số KHÁCH TRẢ cả chuyến (chưa gồm cọc thế chấp của gian hàng). */
  customerTotalAmount: string;
  /** `D` — phần của CHỦ XE trong tiền giữ chỗ online. `'0'` khi chuyến không thu online. */
  depositAmount: string;
  /** `H` — hoa hồng lũy tiến trừ vào tiền chủ xe. `'0'` ở tuyến gói. */
  ownerCommissionAmount: string;
  /**
   * `S + H` — phần XePrime GIỮ LẠI từ tiền giữ chỗ online. Tính trước tài trợ mã: doanh thu thật của nền
   * tảng là con số này trừ `promoDiscountAmount`, và nó được phép âm (chi phí marketing thật).
   */
  platformRetainedAmount: string;
  /**
   * Tiền giữ chỗ online TRƯỚC tài trợ mã khuyến mãi = `D + S + H + IV + IP`, đã nâng đủ các sàn.
   *
   * Đây là con số phân bổ (`resolveHoldAllocation`) làm việc trên: quyền lợi của chủ xe, hãng
   * bảo hiểm và ngân sách KHÔNG đổi vì XePrime giảm giá cho khách (ADR 0046 điều 2).
   */
  grossOnlineAmount: string;
  /**
   * Phần tiền giữ chỗ online XePrime được phép TÀI TRỢ bằng mã khuyến mãi = `D + S + H` — mọi thứ trừ tiền
   * giữ hộ hãng bảo hiểm. `'0'` khi chuyến không thu online. Một nguồn cho trần tài trợ của
   * `computePromoDiscount`, thay vì để mỗi caller tự cộng các dòng.
   */
  sponsorableAmount: string;
  /**
   * `P` — số giảm của MÃ KHUYẾN MÃI nền tảng, đã áp cho chuyến này. `'0'` khi không có mã.
   *
   * Là một dòng CONTRA của XePrime, không phải một khoản phí: nó chỉ trừ vào phần khách chuyển
   * online, và không xuất hiện trong `lines` (xem docblock `promo-code.ts`).
   */
  promoDiscountAmount: string;
  /** Mã đã áp + điều kiện đóng băng. `null` khi chuyến không dùng mã. */
  promo: PromoCodeSnapshot | null;
  /** `grossOnlineAmount − P` — số quét QR trả ngay. Bằng `holdAmount` khi có giữ chỗ. */
  onlineAmount: string;
  /**
   * `grossCustomerTotal − grossOnlineAmount` — khách trả TRỰC TIẾP chủ xe lúc nhận xe. XePrime
   * không thu hộ, không đối soát. Là phần còn lại của phép trừ, không bao giờ làm tròn riêng.
   */
  payAtPickupAmount: string;
  /**
   * `T` = `vatAmount + pitAmount` — thuế khấu trừ khỏi tiền chủ xe. `'0'` khi cổng thuế chưa mở
   * hoặc người bán được miễn (`taxExemptReason`).
   */
  taxAmount: string;
  /*
   * ── Thuế tách GTGT/TNCN (ADR 0068) ──
   *
   * Tuỳ chọn ở kiểu ĐỌC: snapshot đóng băng trước 22/10/2026 không có các trường này (thuế lúc đó
   * là một mức duy nhất). `computeCustomerFees` luôn điền đủ. Chỗ đọc snapshot đi qua
   * `feeTaxDetailOf` để nhận một hình dạng đầy đủ, có `null` cho phần snapshot cũ không biết.
   */
  /** `R = B − G` — tiền THUÊ: mẫu số của hoa hồng, thuế và phần giữ chỗ `D`. */
  rentAmount?: string;
  /** Thuế GTGT khấu trừ thay = `roundVnd(vatPercent% × R)`; `'0'` khi không khấu trừ. */
  vatAmount?: string;
  /** Thuế TNCN khấu trừ thay = `roundVnd(pitPercent% × R)`; `'0'` khi không khấu trừ. */
  pitAmount?: string;
  /** % GTGT đã áp. `null` khi đơn không bị khấu trừ (cổng tắt / miễn). */
  vatPercent?: number | null;
  /** % TNCN đã áp. `null` khi đơn không bị khấu trừ (cổng tắt / miễn). */
  pitPercent?: number | null;
  /**
   * Nhóm NĐ 117 của đơn (`service` | `transport`). `null` khi đơn không bị khấu trừ — nhóm chỉ có
   * nghĩa với một khoản đã khấu trừ.
   */
  taxCategory?: TaxCategory | null;
  /** Vì sao không khấu trừ dù cổng thuế mở — `'company'`. `null` khi có khấu trừ hoặc cổng tắt. */
  taxExemptReason?: TaxExemptReason | null;
  /** Loại dịch vụ đã đóng băng — chọn cặp tỷ lệ. `null` khi caller không xác định được. */
  serviceType?: ServiceType | null;
  /** Chủ thể ÁP THUẾ đã đóng băng lúc nhận chuyến (`taxSellerEntityOf`, ADR 0024). */
  sellerEntityType?: SellerEntityType;
  /** `D − T` — khoản XePrime chuyển vào ví chủ xe khi chuyến hoàn thành (ADR 0033 điều 2). */
  ownerPayableAmount: string;
  /**
   * Số CHỦ XE thực nhận cho TIỀN THUÊ = `R − H − T` (gồm cả phần khách trả tay, KHÔNG gồm phí giao
   * `G` — khoản đó chủ xe nhận tận tay và hiện riêng ở `deliveryAmount`). Snapshot trước 21/10/2026
   * mang `B − H − T` (khi đó `G` luôn 0 lúc duyệt nên hai công thức trùng nhau).
   */
  ownerNetAmount: string;
  /**
   * Mẫu số của thuế `T` = tiền thuê `R = B − G` — đúng con số đã nhân `taxPercent`. Sổ thuế đọc
   * trường này, không tự suy lại (`taxableBaseOf`). Tuỳ chọn ở kiểu đọc: snapshot cũ không có.
   */
  taxableBaseAmount?: string;
  /**
   * Khoản giữ chỗ khách chuyển online = `onlineAmount`, đã kẹp sàn.
   * `null` khi chuyến KHÔNG thu cọc (tuyến gói tắt công tắc, hoặc báo giá tạm tính).
   */
  holdAmount: string | null;
}

/**
 * Số tiền của một loại xe trong một bảng cấu hình. Ném khi thiếu hoặc rác: `vehicleType` thường
 * đến từ một cột chuỗi của DB, và `Number(undefined)` là `NaN` — rơi vào nhánh "không thu" và
 * biến phí sàn hay bảo hiểm thành 0đ mà không ai thấy.
 */
function amountFor(amounts: PerVehicleTypeAmount, vehicleType: VehicleType, field: string): number {
  const amount = Number(amounts[vehicleType]);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Chính sách phí thiếu ${field} hợp lệ cho loại xe ${vehicleType}`);
  }
  return amount;
}

/** `base` chia đều cho `days` ngày — mẫu số hoa hồng khi caller không có giá từng ngày. */
function evenDayAmounts(base: number, days: number): number[] {
  return Array.from({ length: days }, () => base / days);
}

/**
 * @deprecated Luồng tiền v2 không còn % phí dịch vụ: khách trả phí sàn cố định
 * (`customerPlatformFee`), chủ xe tuyến hoa hồng chịu hoa hồng lũy tiến
 * (`computeTieredOwnerCommission`), tuyến gói 0%. Hàm này chỉ còn phục vụ nội dung hiển thị cũ
 * (email hướng dẫn gói) cho tới khi chúng được viết lại theo mô hình mới.
 */
export function tripServiceFeePercent(
  billingMode: BillingMode,
  policyServiceFeePercent: number,
): number {
  return billingMode === BILLING_MODE.COMMISSION ? policyServiceFeePercent : 0;
}

/**
 * Bảo hiểm nào ĐANG được bán — theo từng sản phẩm (ADR 0064). `vehicleProtection` = `IV` (vật chất
 * xe), `tripInsurance` = `IP` (tai nạn người). Nguồn duy nhất ở API là `InsuranceOfferService`: đối
 * tác phát hành đã cắm VÀ sản phẩm đang bật trong danh mục `insurance_products`.
 */
export interface InsuranceOfferedByKind {
  vehicleProtection: boolean;
  tripInsurance: boolean;
}

/** Chuẩn hoá cổng bảo hiểm về dạng theo sản phẩm (`boolean` = cùng một câu trả lời cho cả hai). */
export function insuranceOfferedByKind(
  value: boolean | InsuranceOfferedByKind,
): InsuranceOfferedByKind {
  return typeof value === 'boolean' ? { vehicleProtection: value, tripInsurance: value } : value;
}

/**
 * Tính tiền cho một chuyến. Hàm THUẦN — cùng đầu vào cho cùng đầu ra ở api, web, mobile, worker.
 *
 * `baseAmount` là chuỗi VND nguyên (không thập phân) — bảng kê giá thuê đã làm tròn.
 *
 * Phí sàn `S` áp cho CẢ HAI tuyến; hoa hồng `H` chỉ tuyến hoa hồng — tuyến gói **không sinh dòng**
 * "hoa hồng 0đ" lấp lửng. Thuế/bảo hiểm (khi bật) áp cho cả hai tuyến như nhau.
 *
 * `quoteIsEstimate = true` ⇒ **không thu online**: không thu tiền trên một con số chưa chốt. Các
 * dòng phí vẫn tính để hiển thị "dự kiến", nhưng `holdAmount = null` và `depositAmount = '0'`.
 */
export function computeCustomerFees(input: {
  billingMode: BillingMode;
  policy: FeePolicySnapshot;
  vehicleType: VehicleType;
  baseAmount: string;
  /**
   * `G` — phần PHÍ GIAO NHẬN đã nằm trong `baseAmount` (dòng `PRICE_ROW.DELIVERY`). Bỏ trống = 0.
   *
   * Không phải một khoản cộng thêm: `baseAmount` đã gồm nó. Hàm này chỉ cần biết nó để TÁCH ra —
   * thuế, hoa hồng và phần giữ chỗ của chủ xe tính trên tiền thuê `B − G`, còn `G` rơi trọn vào
   * phần khách trả tận tay chủ xe (ADR 0064 · ADR 0066).
   */
  deliveryAmount?: string;
  /**
   * Nền tảng có ĐANG bán bảo hiểm chuyến không — có đối tác phát hành thật được cắm vào (ADR 0028
   * điều 5, ADR 0032 điều 4). Bắt buộc và tường minh: một caller quên truyền không được phép rơi
   * về "có", vì đó là thu tiền bảo hiểm cho một hợp đồng không ai phát hành.
   *
   * `false` ⇒ KHÔNG BAO GIỜ có dòng `IV`/`IP`, dù khách đã tích và cổng ở chính sách đang mở.
   *
   * Theo TỪNG sản phẩm (ADR 0064): đối tác đã cắm VÀ sản phẩm đó đang bật trong danh mục
   * `insurance_products`. Admin tắt một sản phẩm thì client cũ gửi `selected = true` vẫn không bị
   * thu. `boolean` = cùng một câu trả lời cho cả hai sản phẩm.
   */
  insuranceOffered: boolean | InsuranceOfferedByKind;
  /**
   * Số ngày thuê TÍNH PHÍ (nguyên, ≥ 1): nhân biểu phí bảo hiểm theo ngày và chọn nấc hoa hồng.
   * Đơn dài hạn truyền số ngày lịch của gói.
   */
  rentalDays: number;
  /**
   * Loại dịch vụ của chuyến — chọn cặp tỷ lệ GTGT/TNCN (ADR 0068 điều 1). Bỏ trống/`null` ⇒ mức
   * CAO NHẤT của bảng (NĐ 117: không xác định được nhóm thì áp tỷ lệ cao nhất) — mọi caller của
   * API phải truyền tường minh.
   */
  serviceType?: ServiceType | null;
  /**
   * Chủ thể áp thuế của người bán — đã qua `taxSellerEntityOf` (ADR 0068 điều 2). `company` ⇒
   * không khấu trừ. Bỏ trống/`null` ⇒ cá nhân: thiếu dữ liệu không làm mất nghĩa vụ.
   */
  sellerEntityType?: SellerEntityType | null;
  /**
   * Giá thuê TỪNG ngày, ngày 1 trước — mẫu số của hoa hồng lũy tiến. Bỏ trống ⇒ chia đều
   * `baseAmount` cho `rentalDays` ngày. Có thì độ dài phải đúng bằng `rentalDays`.
   */
  dayAmounts?: readonly string[];
  quoteIsEstimate?: boolean;
  /**
   * Chuyến này có thu CỌC qua XePrime không.
   *
   * Mặc định suy từ tuyến vì đó là QUY TẮC, không phải lựa chọn: tuyến hoa hồng **luôn** thu cọc
   * (ADR 0032 điều 2, không tắt được). Tuyến gói chỉ thu khi gian hàng bật công tắc, nên caller
   * của tuyến đó phải truyền tường minh (`DepositPolicyService`).
   *
   * `false` KHÔNG có nghĩa là không thu gì: phí sàn, bảo hiểm và thuế không phải tiền của chủ xe,
   * và XePrime không thu hộ phần trả tay — nên khoản online khi đó đúng bằng chừng ấy.
   */
  depositRequired?: boolean;
  /** Khách có GIỮ lựa chọn bảo hiểm vật chất xe (`IV`) không. Mặc định: không. */
  vehicleProtectionSelected?: boolean;
  /** Khách có GIỮ lựa chọn bảo hiểm tai nạn người (`IP`) không. Mặc định: không. */
  personalAccidentSelected?: boolean;
  /**
   * MÃ KHUYẾN MÃI nền tảng đã áp — snapshot có sẵn `discountApplied` (ADR 0046).
   *
   * Số tiền ở đây do `computePromoDiscount` tính TRƯỚC (nó cần `grossOnlineAmount`, mà con số
   * đó lại là kết quả của chính hàm này — nên caller chạy hai lượt: lượt một không mã để lấy
   * `grossOnlineAmount`, lượt hai có mã). Hàm này vẫn KẸP LẠI một lần nữa: bất biến
   * "`onlineAmount` không bao giờ xuống dưới sàn đối soát" không được phép phụ thuộc vào việc
   * mọi caller đều nhớ kẹp.
   */
  promo?: PromoCodeSnapshot | null;
}): CustomerFeeBreakdown {
  const base = Number(input.baseAmount);
  if (!Number.isFinite(base) || base < 0) {
    throw new Error(`baseAmount không hợp lệ: ${input.baseAmount}`);
  }
  const days = input.rentalDays;
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`rentalDays không hợp lệ: ${input.rentalDays}`);
  }
  if (input.dayAmounts && input.dayAmounts.length !== days) {
    throw new Error(
      `dayAmounts có ${input.dayAmounts.length} ngày trong khi rentalDays là ${days}`,
    );
  }
  const delivery = Number(input.deliveryAmount ?? 0);
  if (!Number.isFinite(delivery) || delivery < 0 || delivery > base) {
    throw new Error(`deliveryAmount không hợp lệ: ${input.deliveryAmount} (baseAmount ${base})`);
  }
  /** `R` — tiền THUÊ: mẫu số của hoa hồng, thuế và phần giữ chỗ `D`. Không gồm phí giao. */
  const rent = base - delivery;
  const vehicleType = input.vehicleType;
  if (!VEHICLE_TYPE_VALUES.includes(vehicleType)) {
    throw new Error(`vehicleType không hợp lệ: ${vehicleType}`);
  }
  const p = input.policy;
  const insurer = p.insurancePartnerName ? { partnerName: p.insurancePartnerName } : {};
  const lines: FeeLine[] = [];

  /* S — phí sàn cố định, cả hai tuyến. Admin đặt 0 cho một loại xe ⇒ không sinh dòng 0đ. */
  const platformFee = amountFor(p.customerPlatformFee, vehicleType, 'phí sàn');
  if (platformFee > 0) {
    lines.push({
      key: FEE_LINE.SERVICE_FEE,
      beneficiary: FEE_BENEFICIARY.PLATFORM,
      bearer: FEE_BEARER.CUSTOMER,
      percent: null,
      amount: String(platformFee),
    });
  }
  /* H — hoa hồng lũy tiến, chỉ tuyến hoa hồng; tuyến gói 0% (không phải một nấc cấu hình). */
  if (input.billingMode === BILLING_MODE.COMMISSION) {
    const commission = computeTieredOwnerCommission(
      input.dayAmounts ?? evenDayAmounts(rent, days),
      p.ownerCommissionTiers,
    );
    if (Number(commission) > 0) {
      lines.push({
        key: FEE_LINE.OWNER_COMMISSION,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.OWNER,
        percent: null,
        amount: commission,
      });
    }
  }
  /*
   * Thuế: bearer = OWNER (ADR 0032 điều 3). Trước ADR 0032 dòng này mang bearer = customer —
   * cộng thuế vào giá khách vừa sai bản chất (nghĩa vụ của người bán) vừa làm giá hiển thị đắt
   * lên một cách không giải thích được.
   *
   * MẪU SỐ là TIỀN THUÊ `R = B − G` (sau khuyến mãi trực tiếp của xe), không phải `B` (ADR 0064):
   * ADR 0032 điều 3 nói thuế tính trên "giá trị thuê chịu thuế", và phí giao là khoản bù xăng/công
   * lái xe tới — trước 21/10/2026 dòng này nhân % trên cả phí giao. Cùng mẫu số với hoa hồng `H`.
   *
   * ADR 0068: mức theo LOẠI DỊCH VỤ, GTGT và TNCN tính RIÊNG, mỗi khoản làm tròn tới đồng — đó là
   * hai số nộp hai sắc thuế, phải khớp đúng tỷ lệ × doanh thu. Doanh nghiệp đã xác minh không bị
   * khấu trừ (tự xuất hoá đơn, tự kê khai); thiếu hồ sơ ⇒ cá nhân. Tuyến (hoa hồng/gói) KHÔNG
   * quyết định thuế. Chính sách bật thuế mà không có bảng mức (≤ v8) không tính được thuế mới —
   * cổng kích hoạt và CHECK ở DB đã chặn ca đó, nên ở đây nó là "không khấu trừ".
   */
  const sellerEntityType = input.sellerEntityType ?? SELLER_ENTITY_TYPE.INDIVIDUAL;
  const taxRates = p.taxEnabled ? p.taxRates : null;
  const taxExemptReason: TaxExemptReason | null =
    taxRates && sellerEntityType === SELLER_ENTITY_TYPE.COMPANY ? TAX_EXEMPT_REASON.COMPANY : null;
  let vatAmount = 0;
  let pitAmount = 0;
  let appliedRate: TaxRate | null = null;
  let taxCategory: TaxCategory | null = null;
  if (taxRates && !taxExemptReason) {
    const resolved = taxRateFor(taxRates, input.serviceType);
    vatAmount = percentOfVnd(rent, resolved.rate.vatPercent);
    pitAmount = percentOfVnd(rent, resolved.rate.pitPercent);
    appliedRate = resolved.rate;
    taxCategory = resolved.category;
    if (vatAmount + pitAmount > 0) {
      lines.push({
        key: FEE_LINE.TAX,
        beneficiary: FEE_BENEFICIARY.TAX_AUTHORITY,
        bearer: FEE_BEARER.OWNER,
        percent: taxRateTotalPercent(resolved.rate),
        amount: String(vatAmount + pitAmount),
      });
    }
  }
  /*
   * Bảo hiểm có được bán không là AND của ba cổng: nền tảng có đối tác phát hành (`insuranceOffered`),
   * chính sách đang mở dòng đó, và khách giữ lựa chọn. Cổng của nền tảng đứng đầu: chưa có ai phát
   * hành thì không được thu đồng nào, bất kể cấu hình chính sách nói gì (ADR 0028 điều 5).
   */
  const offered = insuranceOfferedByKind(input.insuranceOffered);
  const offersVehicleProtection = offered.vehicleProtection && p.vehicleProtectionEnabled;
  const offersPersonalAccident = offered.tripInsurance && p.tripInsuranceEnabled;
  /*
   * IV và IP — tuỳ chọn, theo ngày. Chỉ tính khi khách GIỮ lựa chọn VÀ cổng ở chính sách đang mở:
   * cổng thắng lựa chọn, vì chưa có hợp đồng bảo hiểm thật thì không được thu đồng nào (ADR 0028).
   */
  const vehicleDaily = amountFor(
    p.vehicleProtectionDailyAmount,
    vehicleType,
    'biểu phí bảo hiểm vật chất xe',
  );
  if (input.vehicleProtectionSelected && offersVehicleProtection && vehicleDaily > 0) {
    lines.push({
      key: FEE_LINE.VEHICLE_PROTECTION,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: null,
      unitAmount: String(vehicleDaily),
      quantity: days,
      amount: String(vehicleDaily * days),
      ...insurer,
    });
  }
  const personalDaily = amountFor(
    p.tripInsuranceDailyAmount,
    vehicleType,
    'biểu phí bảo hiểm tai nạn người',
  );
  if (input.personalAccidentSelected && offersPersonalAccident && personalDaily > 0) {
    lines.push({
      key: FEE_LINE.TRIP_INSURANCE,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: null,
      unitAmount: String(personalDaily),
      quantity: days,
      amount: String(personalDaily * days),
      ...insurer,
    });
  }

  const lineAmount = (key: FeeLineKey): number =>
    Number(lines.find((l) => l.key === key)?.amount ?? 0);
  const serviceFee = lineAmount(FEE_LINE.SERVICE_FEE);
  const commission = lineAmount(FEE_LINE.OWNER_COMMISSION);
  const taxAmount = lineAmount(FEE_LINE.TAX);
  const insuranceTotal =
    lineAmount(FEE_LINE.VEHICLE_PROTECTION) + lineAmount(FEE_LINE.TRIP_INSURANCE);
  const customerFeeTotal = serviceFee + insuranceTotal;
  const grossCustomerTotal = base + customerFeeTotal;

  /*
   * TIỀN GIỮ CHỖ (ADR 0066). Báo giá tạm tính thì không thu đồng nào — CLAUDE.md cấm thu phần
   * trăm trên một con số chưa chốt.
   *
   * Nó là TỔNG các phần có chủ: `S` của XePrime, `H` XePrime giữ lại từ phía chủ xe, `IV + IP` của
   * hãng bảo hiểm, cộng phần CAM KẾT GIỮ XE của chủ xe `D_target = max(depositPercent% × R, sàn)`
   * — `D` tính trên TIỀN THUÊ `R`, không trên tổng khách trả, nên hoa hồng không ăn vào phần đền
   * chủ xe khi khách huỷ muộn.
   *
   * Sàn của nó là mọi thứ KHÔNG phải tiền của chủ xe (`S + H + IV + IP + T`): XePrime không thu
   * hộ phần trả tay, nên đó là lần duy nhất nó cầm được tiền của chính mình, của hãng bảo hiểm và
   * của ngân sách. CHECK `fee_policies_deposit_covers_tax_check` (`depositPercent ≥` mức thuế tổng
   * cao nhất của bảng) đã làm `D_target ≥ T` ở mọi chính sách hợp lệ; sàn này vẫn đứng riêng để bất
   * biến không phụ thuộc vào một CHECK ở bảng khác.
   *
   * Không thu cọc (tuyến gói tắt công tắc) thì khoản online đúng bằng phần không phải của chủ xe
   * và không hơn.
   *
   * TRẦN của khoản online là tổng khách trả TRỪ phí giao `G` (ADR 0064): phí giao là tiền mặt của
   * người lái xe tới, trả tận tay, XePrime không cầm hộ. Kẹp trần ở đó (thay vì ở cả tổng) còn
   * giữ bất biến cũ: một policy cấu hình sai (sàn lớn hơn cả chuyến) không được phép sinh
   * `payAtPickupAmount` âm — và cũng không được phép kéo phí giao vào mã QR.
   */
  const collectsOnline = !input.quoteIsEstimate;
  const depositRequired =
    (input.depositRequired ?? input.billingMode === BILLING_MODE.COMMISSION) && collectsOnline;
  const notOwnersMoney = serviceFee + commission + insuranceTotal + taxAmount;
  const onlineBase = grossCustomerTotal - delivery;
  let grossOnline = 0;
  if (collectsOnline) {
    const ownerHoldTarget = Math.max(
      percentOfVnd(rent, p.depositPercent),
      Number(p.depositMinAmount),
    );
    const floor = depositRequired
      ? Math.max(serviceFee + commission + insuranceTotal + ownerHoldTarget, notOwnersMoney)
      : notOwnersMoney;
    grossOnline = floor > 0 ? Math.min(onlineBase, Math.max(floor, Number(p.holdMinAmount))) : 0;
  }
  const deposit = grossOnline > 0 ? grossOnline - serviceFee - commission - insuranceTotal : 0;

  /*
   * TÀI TRỢ của XePrime (ADR 0046 điều 2). Kẹp bằng `grossOnline − holdMinAmount`, không bằng
   * `grossOnline`: một mã ăn hết khoản online sẽ sinh ra mã QR 0đ — tức là một chuyến không ai
   * phải chuyển đồng nào mà vẫn chiếm chỗ hai giờ, đúng thứ ADR 0044 điều 4 cấm. Kẹp cả bằng phần
   * tài trợ được (`D + S + H`): tiền giữ hộ hãng bảo hiểm không phải chỗ để giảm giá.
   *
   * Chuyến KHÔNG thu online (báo giá tạm tính) có `grossOnline = 0` nên trần về 0: một snapshot mã
   * lọt vào đây không trừ được `customerTotalAmount` khi XePrime không cầm đồng nào — phần chênh
   * sẽ rơi xuống tiền mặt chủ xe nhận tận tay, đúng thứ ADR 0046 điều 2 cấm. Tầng đánh giá
   * (`promoContextFor`) đã chặn ca này; chặn LẠI ở đây vì bất biến không được phụ thuộc vào việc
   * mọi caller đều nhớ làm đúng.
   */
  const sponsorable = grossOnline > 0 ? grossOnline - insuranceTotal : 0;
  const promoRoom = Math.max(0, Math.min(grossOnline - Number(p.holdMinAmount), sponsorable));
  const promoDiscount = input.promo
    ? Math.max(0, Math.min(Number(input.promo.discountApplied), promoRoom))
    : 0;
  const online = grossOnline - promoDiscount;

  return {
    billingMode: input.billingMode,
    policy: p,
    vehicleType,
    rentalDays: days,
    ...(input.dayAmounts ? { dayAmounts: [...input.dayAmounts] } : {}),
    baseAmount: String(base),
    deliveryAmount: String(delivery),
    lines,
    customerFeeTotal: String(customerFeeTotal),
    customerTotalAmount: String(grossCustomerTotal - promoDiscount),
    depositAmount: String(deposit),
    ownerCommissionAmount: String(commission),
    platformRetainedAmount: String(serviceFee + commission),
    grossOnlineAmount: String(grossOnline),
    sponsorableAmount: String(sponsorable),
    promoDiscountAmount: String(promoDiscount),
    /*
     * Snapshot đi kèm số đã KẸP, không phải số mã hứa: mọi màn hình đọc lại đơn cũ phải thấy
     * đúng con số đã trừ vào tiền khách trả, kể cả khi mã hứa nhiều hơn phần trừ được.
     */
    promo:
      input.promo && promoDiscount > 0
        ? { ...input.promo, discountApplied: String(promoDiscount) }
        : null,
    onlineAmount: String(online),
    payAtPickupAmount: String(grossCustomerTotal - grossOnline),
    taxAmount: String(taxAmount),
    ownerPayableAmount: String(deposit - taxAmount),
    ownerNetAmount: String(rent - commission - taxAmount),
    taxableBaseAmount: String(rent),
    holdAmount: grossOnline > 0 ? String(online) : null,
    rentAmount: String(rent),
    vatAmount: String(vatAmount),
    pitAmount: String(pitAmount),
    vatPercent: appliedRate ? appliedRate.vatPercent : null,
    pitPercent: appliedRate ? appliedRate.pitPercent : null,
    taxCategory,
    taxExemptReason,
    serviceType: input.serviceType ?? null,
    sellerEntityType,
  };
}

/** Thuế của một bảng tiền đã đóng băng, ở hình dạng ĐẦY ĐỦ — xem `feeTaxDetailOf`. */
export interface FeeTaxDetail {
  /** `R` — tiền thuê, mẫu số của thuế. */
  rentAmount: string;
  /** `T` = GTGT + TNCN. */
  taxAmount: string;
  /** `null` = snapshot trước ADR 0068 (một mức duy nhất, không tách sắc thuế). */
  vatAmount: string | null;
  pitAmount: string | null;
  vatPercent: number | null;
  pitPercent: number | null;
  /** Tổng % đã áp (`vat + pit`, hoặc mức đơn của snapshot cũ). `null` khi không khấu trừ. */
  totalPercent: number | null;
  taxCategory: TaxCategory | null;
  taxExemptReason: TaxExemptReason | null;
  sellerEntityType: SellerEntityType | null;
}

/**
 * Thuế của một bảng tiền đã đóng băng — chỗ DUY NHẤT đọc nó cho bề mặt đối tác/quản trị và sổ
 * thuế, để snapshot cũ (trước 22/10/2026, một mức `taxPercent`) và mới cùng ra một hình dạng.
 *
 * Snapshot cũ: `vat*`/`pit*` là `null` — không bịa ra một phép tách mà lúc đó không ai tính.
 */
export function feeTaxDetailOf(fees: CustomerFeeBreakdown): FeeTaxDetail {
  const taxLine = fees.lines.find((line) => line.key === FEE_LINE.TAX) ?? null;
  const split = fees.vatAmount != null && fees.pitAmount != null;
  return {
    rentAmount: fees.rentAmount ?? taxableBaseOf(fees),
    // Dòng `TAX` là nguồn gốc của `taxAmount` ở mọi phiên bản — đọc nó trước, như sổ thuế luôn làm.
    taxAmount: taxLine?.amount ?? fees.taxAmount ?? '0',
    vatAmount: split ? fees.vatAmount! : null,
    pitAmount: split ? fees.pitAmount! : null,
    vatPercent: fees.vatPercent ?? null,
    pitPercent: fees.pitPercent ?? null,
    totalPercent: taxLine ? (taxLine.percent ?? fees.policy.taxPercent ?? null) : null,
    taxCategory: fees.taxCategory ?? null,
    taxExemptReason: fees.taxExemptReason ?? null,
    sellerEntityType: fees.sellerEntityType ?? null,
  };
}

/**
 * Mẫu số thuế của một bảng tiền đã đóng băng — chỗ DUY NHẤT đọc nó.
 *
 * Snapshot mới mang `taxableBaseAmount` (đúng số đã nhân %). Snapshot cũ không có: bản trước
 * 21/10/2026 không có cả `deliveryAmount` và khi đó thuế nhân trên cả `B` (phí giao luôn 0 lúc
 * duyệt), bản 20–21/10 có `deliveryAmount` và thuế nhân trên `B − G`.
 */
export function taxableBaseOf(
  fees: Pick<CustomerFeeBreakdown, 'baseAmount' | 'deliveryAmount' | 'taxableBaseAmount'>,
): string {
  if (fees.taxableBaseAmount != null) return fees.taxableBaseAmount;
  return String(Number(fees.baseAmount) - Number(fees.deliveryAmount ?? 0));
}

// ── Bản CÔNG KHAI của bảng tiền (cho khách) ────────────────────────────────

/**
 * Phần chính sách phí KHÁCH được đọc — đủ để giải thích các dòng khách trả (phí sàn, bảo hiểm,
 * cửa sổ thanh toán/huỷ, % cọc), không có nấc hoa hồng hay thuế của chủ xe.
 */
export type PublicFeePolicySnapshot = Pick<
  FeePolicySnapshot,
  | 'policyId'
  | 'version'
  | 'holdMinAmount'
  | 'holdPaymentWindowMinutes'
  | 'freeCancelHours'
  | 'depositPercent'
  | 'customerPlatformFee'
  | 'tripInsuranceEnabled'
  | 'tripInsuranceDailyAmount'
  | 'vehicleProtectionEnabled'
  | 'vehicleProtectionDailyAmount'
  | 'insurancePartnerName'
>;

/**
 * Bảng tiền của một chuyến như KHÁCH được thấy — báo giá công khai, xem trước mã khuyến mãi.
 *
 * Không có KINH TẾ CỦA CHỦ XE (ADR 0064): hoa hồng `H`, thuế `T`, phần chủ xe trong cọc `D`, khoản
 * chuyển ví, số chủ xe thực nhận, "sàn giữ lại", phần tài trợ được (`D + S + H`) và nấc hoa hồng
 * của chính sách. Đó là chuyện giữa chủ xe và nền tảng; một khách cộng trừ được chúng là biết chủ
 * xe này bị thu bao nhiêu và còn lại bao nhiêu — và `lines` cũng chỉ còn dòng KHÁCH chịu.
 *
 * Các trường còn lại GIỮ NGUYÊN tên và nghĩa với `CustomerFeeBreakdown`, nên một bảng đầy đủ dùng
 * được ở mọi chỗ đọc bảng công khai (kiểu con), còn chiều ngược lại thì không.
 */
export type PublicCustomerFeeBreakdown = Pick<
  CustomerFeeBreakdown,
  | 'vehicleType'
  | 'rentalDays'
  | 'baseAmount'
  | 'deliveryAmount'
  | 'customerFeeTotal'
  | 'customerTotalAmount'
  | 'grossOnlineAmount'
  | 'promoDiscountAmount'
  | 'promo'
  | 'onlineAmount'
  | 'payAtPickupAmount'
  | 'holdAmount'
> & {
  policy: PublicFeePolicySnapshot;
  /** Chỉ dòng KHÁCH chịu (`bearer = customer`). */
  lines: FeeLine[];
};

/**
 * Cắt một bảng tiền đầy đủ thành bản công khai — chỗ DUY NHẤT quyết định khách thấy gì.
 *
 * Dựng object MỚI bằng danh sách trường cho phép (allow-list), không `delete` trên bản gốc: thêm
 * một trường kinh tế chủ xe vào `CustomerFeeBreakdown` ngày mai thì nó mặc định KHÔNG lọt ra ngoài.
 */
export function toPublicFeeBreakdown(fees: CustomerFeeBreakdown): PublicCustomerFeeBreakdown {
  const p = fees.policy;
  return {
    vehicleType: fees.vehicleType,
    rentalDays: fees.rentalDays,
    baseAmount: fees.baseAmount,
    deliveryAmount: fees.deliveryAmount ?? '0',
    lines: fees.lines.filter((line) => line.bearer === FEE_BEARER.CUSTOMER),
    customerFeeTotal: fees.customerFeeTotal,
    customerTotalAmount: fees.customerTotalAmount,
    grossOnlineAmount: fees.grossOnlineAmount,
    promoDiscountAmount: fees.promoDiscountAmount,
    promo: fees.promo,
    onlineAmount: fees.onlineAmount,
    payAtPickupAmount: fees.payAtPickupAmount,
    holdAmount: fees.holdAmount,
    policy: {
      policyId: p.policyId,
      version: p.version,
      holdMinAmount: p.holdMinAmount,
      holdPaymentWindowMinutes: p.holdPaymentWindowMinutes,
      freeCancelHours: p.freeCancelHours,
      depositPercent: p.depositPercent,
      customerPlatformFee: p.customerPlatformFee,
      tripInsuranceEnabled: p.tripInsuranceEnabled,
      tripInsuranceDailyAmount: p.tripInsuranceDailyAmount,
      vehicleProtectionEnabled: p.vehicleProtectionEnabled,
      vehicleProtectionDailyAmount: p.vehicleProtectionDailyAmount,
      insurancePartnerName: p.insurancePartnerName,
    },
  };
}

/** Nhãn hiển thị mặc định — web/mobile dịch qua `Domain.feeLine`, đây là bản tiếng Việt gốc. */
export const FEE_LINE_LABEL: Readonly<Record<FeeLineKey, string>> = {
  [FEE_LINE.SERVICE_FEE]: 'Phí đặt xe',
  [FEE_LINE.OWNER_COMMISSION]: 'Phí dịch vụ – Chủ xe',
  [FEE_LINE.TAX]: 'Thuế khấu trừ/nộp thay',
  [FEE_LINE.TRIP_INSURANCE]: 'Bảo hiểm tai nạn người ngồi trên xe',
  [FEE_LINE.VEHICLE_PROTECTION]: 'Bảo hiểm vật chất xe',
  [FEE_LINE.DEPOSIT]: 'Cọc đặt chuyến',
  [FEE_LINE.PROMO]: 'Mã khuyến mãi XePrime',
  [FEE_LINE.RENT_PREPAID]: 'Phần tiền thuê trả trước',
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

// Biên NHẬP LIỆU của một bản chính sách — hàng rào gõ nhầm mà DTO server và form admin cùng đọc
// (không phải luật kinh doanh; luật nằm ở `feePolicyActivationBlockers`).

/** Trần cửa sổ thanh toán: 7 ngày. */
export const HOLD_PAYMENT_WINDOW_MINUTES_MAX = 7 * 24 * 60;
/** Trần số giờ huỷ miễn phí: 30 ngày. */
export const FREE_CANCEL_HOURS_MAX = 24 * 30;

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
  /*
   * Thuế (ADR 0068 điều 7): bật thì phải có BẢNG MỨC đủ ba loại dịch vụ và CĂN CỨ PHÁP LÝ; mỗi
   * sắc thuế không vượt trần của NĐ 117. Bảng hỏng/thiếu khoá đã thành `null` ở `parseTaxRates`.
   */
  if (values.taxEnabled && (values.taxRates == null || !values.taxLegalBasis?.trim())) {
    blockers.push('tax_requires_rates_and_basis');
  }
  if (values.taxEnabled && values.taxRates != null && !taxRatesValid(values.taxRates)) {
    blockers.push('tax_rate_out_of_range');
  }
  const insuranceOn = values.tripInsuranceEnabled || values.vehicleProtectionEnabled;
  if (insuranceOn && !values.insurancePartnerName?.trim()) {
    blockers.push('insurance_requires_partner');
  }
  /* Cổng bảo hiểm mở thì MỌI loại xe phải có biểu phí — thiếu một loại là thu 0đ mà vẫn hứa bảo hiểm. */
  const hasEveryRate = (amounts: PerVehicleTypeAmount) =>
    VEHICLE_TYPE_VALUES.every((type) => Number(amounts[type]) > 0);
  if (values.tripInsuranceEnabled && !hasEveryRate(values.tripInsuranceDailyAmount)) {
    blockers.push('trip_insurance_requires_rate');
  }
  if (values.vehicleProtectionEnabled && !hasEveryRate(values.vehicleProtectionDailyAmount)) {
    blockers.push('vehicle_protection_requires_rate');
  }
  /*
   * Bước giá 1.000đ là của SỐ CẤU HÌNH (ADR 0069 điều 3): phép tính cho ra số đúng tới đồng, còn
   * phí sàn, biểu phí bảo hiểm và các sàn tiền đi thẳng vào mã QR — giữ chúng tròn là cách CHÍNH
   * SÁCH hạn chế số lẻ mà không làm sai một con số nào.
   */
  const configuredAmounts = [
    ...VEHICLE_TYPE_VALUES.flatMap((type) => [
      values.customerPlatformFee[type],
      values.vehicleProtectionDailyAmount[type],
      values.tripInsuranceDailyAmount[type],
    ]),
    values.holdMinAmount,
    values.depositMinAmount,
  ];
  if (!configuredAmounts.every((amount) => isThousandStep(Number(amount)))) {
    blockers.push('amount_not_thousand_step');
  }
  if (!ownerCommissionTiersValid(values.ownerCommissionTiers)) {
    blockers.push('owner_commission_tiers_invalid');
  }
  /*
   * Sàn là `HOLD_MIN_USABLE_WINDOW_MINUTES`, KHÔNG phải một con số gõ tay.
   *
   * `createForApprovedRequestWithinTx` từ chối mọi hold còn ít hơn ngần ấy phút, và
   * `expiresAt − now` không bao giờ vượt quá cửa sổ của chính sách. Một chính sách có cửa sổ NHỎ
   * HƠN ngưỡng vì thế không phát nổi một mã QR nào — cả sàn ngừng nhận đơn, im lặng, ngay khi nó
   * được kích hoạt. Chặn ở cổng kích hoạt thay vì để phát hiện ra lúc khách đầu tiên bấm đặt.
   */
  if (
    values.holdPaymentWindowMinutes < HOLD_MIN_USABLE_WINDOW_MINUTES ||
    values.holdPaymentWindowMinutes > 7 * 24 * 60
  ) {
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
   * Thuế tính trên TIỀN THUÊ `B` nhưng chỉ khấu trừ được từ phần của chủ xe `D` trong tiền giữ
   * chỗ. Cùng mẫu số (ADR 0066) nên `depositPercent ≥` mức thuế tổng CAO NHẤT của bảng bảo đảm
   * `D ≥ T` ở mọi đơn, mọi loại dịch vụ (ADR 0068 điều 3). Phép tính vẫn nâng tiền giữ chỗ lên đủ
   * giữ `T` (`computeCustomerFees`), nhưng một chính sách có % giữ chỗ dưới % thuế thì sàn đó kích
   * hoạt trên mọi đơn và mức % công bố với khách không còn đúng ở đơn nào. Chặn ở cổng kích hoạt
   * (và CHECK cùng tên ở DB), không để phát hiện ra lúc quyết toán chuyến đầu tiên.
   */
  if (
    values.taxEnabled &&
    values.taxRates != null &&
    values.depositPercent < maxTaxRatePercent(values.taxRates)
  ) {
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

/**
 * Nấc hoa hồng hợp lệ: 1–`OWNER_COMMISSION_TIERS_MAX` nấc, bắt đầu từ ngày 1, `fromDay` nguyên,
 * TĂNG NGHIÊM NGẶT và ≤ `OWNER_COMMISSION_FROM_DAY_MAX`, mỗi % trong `[0, OWNER_COMMISSION_PERCENT_MAX]`.
 * Không bắt % giảm dần — "lũy tiến" là chính sách kinh doanh của bản hiện hành, không phải ràng
 * buộc của phép tính. Dùng chung cổng kích hoạt (server) và form admin (báo sớm).
 */
export function ownerCommissionTiersValid(tiers: readonly OwnerCommissionTier[]): boolean {
  if (tiers.length === 0 || tiers.length > OWNER_COMMISSION_TIERS_MAX) return false;
  if (tiers[0]!.fromDay !== 1) return false;
  return tiers.every(
    (tier, index) =>
      Number.isInteger(tier.fromDay) &&
      tier.fromDay <= OWNER_COMMISSION_FROM_DAY_MAX &&
      (index === 0 || tier.fromDay > tiers[index - 1]!.fromDay) &&
      Number.isFinite(tier.percent) &&
      tier.percent >= 0 &&
      tier.percent <= OWNER_COMMISSION_PERCENT_MAX,
  );
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
  /**
   * Thuế khấu trừ của chủ xe — nền tảng giữ để nộp thay, KHÔNG phải doanh thu của nó.
   *
   * Trước 14/09/2026 phần thuế chỉ bị TRỪ khỏi dòng về ví chủ xe rồi không được đẩy đi đâu, nên
   * tổng phân bổ nhỏ hơn số tiền đã nhận đúng bằng tiền thuế — và phép đối soát ba vế sẽ báo
   * một chênh lệch không ai giải thích được. Có đích riêng thì tổng phân bổ luôn bằng `amount`.
   */
  TAX_LEDGER: 'tax_ledger',
} as const;

export type AllocationTarget = (typeof ALLOCATION_TARGET)[keyof typeof ALLOCATION_TARGET];

/** Bốn dòng tiền của một hold — đọc từ CỘT, không suy từ `purpose` (ADR 0033 điều 4). */
export interface HoldMoneyLines {
  /** `D` — phần của chủ xe trong tiền giữ chỗ online, gồm cả `T` sẽ khấu trừ khi quyết toán. */
  deposit: string;
  /** `S` — phí sàn phía khách. */
  serviceFee: string;
  /**
   * `H` — hoa hồng lũy tiến XePrime giữ lại từ phần của chủ xe (luồng tiền v2).
   *
   * Bỏ trống ⇒ `'0'`: hold sinh trước luồng tiền v2 không có hoa hồng, và hold tuyến gói cũng vậy.
   */
  ownerCommission?: string;
  /** `IV` */ vehicleInsurance: string;
  /** `IP` */ personalInsurance: string;
  /**
   * `P` — tài trợ mã khuyến mãi (ADR 0046). Khách đã chuyển ÍT hơn bốn dòng trên đúng bằng con
   * số này, nên nó là hiệu giữa QUYỀN LỢI (bốn dòng) và TIỀN MẶT (`booking_holds.amount`).
   *
   * Bỏ trống ⇒ `'0'`: hold sinh trước ADR 0046 không có mã nào.
   */
  promoDiscount?: string;
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
  /**
   * Huỷ muộn hoặc no-show — chủ xe nhận trọn `D`, XePrime giữ `S + H − P`, `IV + IP` hoàn đủ
   * (ADR 0066). Tên giữ nguyên vì đó là giá trị đã lưu ở DB, không còn là phép chia đôi.
   */
  | 'split_late_cancel'
  /** Chuyến hoàn thành — mỗi dòng về đúng người hưởng. */
  | 'settled';

/**
 * Kết cục nào cần phân bổ, và theo luật nào — `null` = kết cục LEGACY (`kept`, `forfeited`,
 * `released_to_shop`): giữ nguyên hành vi cũ, không sinh dòng phân bổ nào.
 *
 * Dùng chung cho service chốt kết cục và màn xem trước của admin: hai nơi mà đọc hai bảng ánh xạ
 * khác nhau thì màn xem trước sẽ hứa một con số mà lúc chốt không bao giờ ra.
 */
export function holdSettlementKindFor(outcome: BookingHoldOutcome): HoldSettlementKind | null {
  if (outcome === BOOKING_HOLD_OUTCOME.REFUNDED) return 'refund_all';
  if (outcome === BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL) return 'split_late_cancel';
  if (outcome === BOOKING_HOLD_OUTCOME.SETTLED) return 'settled';
  return null;
}

/**
 * Kết cục admin được phép CHỐT TAY cho một khoản giữ chỗ — dùng chung cho màn chốt và
 * `HoldSettlementService.adminSettle`.
 *
 * Khoản mang BỐN DÒNG TIỀN (ADR 0032 trở đi) chứa tiền của nhiều người: chỉ những kết cục có
 * PHÂN BỔ (`holdSettlementKindFor` ≠ null — quyết toán, huỷ muộn, hoàn khách) mới chia
 * đúng phần của từng người. Ba kết cục LEGACY (`kept`, `forfeited`, `released_to_shop`) không
 * phân bổ gì — chốt chúng trên khoản mới là để nền tảng giữ trọn cả cọc của chủ xe lẫn phí bảo
 * hiểm của hãng. Khoản đời cũ (bốn dòng đều 0) vẫn theo luật cũ `isOutcomeAllowed`.
 */
export function adminSettleOutcomes(
  purpose: BookingHoldPurpose,
  lines: Pick<
    HoldMoneyLines,
    'deposit' | 'serviceFee' | 'ownerCommission' | 'vehicleInsurance' | 'personalInsurance'
  >,
): BookingHoldOutcome[] {
  const hasMoneyLines = [
    lines.deposit,
    lines.serviceFee,
    lines.ownerCommission ?? '0',
    lines.vehicleInsurance,
    lines.personalInsurance,
  ].some((value) => Number(value) > 0);
  return BOOKING_HOLD_OUTCOME_VALUES.filter(
    (outcome) =>
      isOutcomeAllowed(purpose, outcome) &&
      (!hasMoneyLines || holdSettlementKindFor(outcome) !== null),
  );
}

/**
 * Chia một khoản giữ chỗ thành các bút toán — hàm THUẦN, dùng chung api/worker/preview admin.
 *
 * Vì sao là hàm chứ không phải bảng tra: phần tài trợ mã khuyến mãi `P` phải rơi vào đúng một dòng
 * ở mỗi kết cục (thứ tự trừ ở `refund_all`, dòng nền tảng ÂM ĐƯỢC ở hai nhánh còn lại) để tổng
 * phân bổ khớp TUYỆT ĐỐI với tiền mặt đã thu — một đồng lệch trên sổ cái là một đồng không ai đối
 * chiếu được.
 *
 * Ba kết cục của luồng tiền v2 (huỷ muộn theo ADR 0066):
 *  - `refund_all` — hoàn 100% số khách đã chuyển (huỷ trong cửa sổ miễn phí, chủ xe huỷ).
 *  - `split_late_cancel` — `IV + IP` hoàn đủ (chưa phát hành bảo hiểm), chủ xe nhận TRỌN `D`,
 *    XePrime giữ `S + H − P`.
 *  - `settled` — chủ xe nhận `D − T`, XePrime giữ `S + H − P`, ngân sách nhận `T`, hãng bảo hiểm
 *    nhận `IV + IP`.
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
  const h = Number(lines.ownerCommission ?? 0);
  const iv = Number(lines.vehicleInsurance);
  const ip = Number(lines.personalInsurance);
  /*
   * TÀI TRỢ mã khuyến mãi (ADR 0046 điều 4). Kẹp `min(d + s + h, …)` để bất biến "tổng phân bổ =
   * tiền mặt đã nhận" không phụ thuộc vào dữ liệu của một bảng khác — cùng lý do `tax` ở dưới
   * kẹp bằng `d`.
   *
   * Phần tài trợ luôn do NỀN TẢNG gánh, ở cả ba kết cục: quyền lợi của chủ xe, hãng bảo hiểm và
   * ngân sách không được đổi vì XePrime giảm giá cho khách. Hệ quả là dòng
   * `PLATFORM_REVENUE` ÂM ĐƯỢC khi khoản tài trợ lớn hơn phí dịch vụ của chuyến — đó là một
   * khoản chi marketing thật, không phải một lỗi làm tròn.
   */
  const promo = Math.max(0, Math.min(Number(lines.promoDiscount ?? 0), d + s + h));
  const out: AllocationEntry[] = [];
  const push = (key: FeeLineKey, target: AllocationTarget, amount: number) => {
    if (amount > 0) out.push({ key, target, amount: String(amount) });
  };
  /** Dòng nền tảng — dòng DUY NHẤT được phép âm, vì nó là dòng gánh tài trợ. */
  const pushPlatform = (key: FeeLineKey, amount: number) => {
    if (amount !== 0)
      out.push({ key, target: ALLOCATION_TARGET.PLATFORM_REVENUE, amount: String(amount) });
  };

  if (kind === 'refund_all') {
    /*
     * Khách chỉ được hoàn ĐÚNG số họ đã chuyển (`D + S + H + IV + IP − P`), không phải quyền lợi
     * gộp. Hoàn cả `P` là biến một mã khuyến mãi thành tiền mặt: đặt xe, huỷ trong cửa sổ miễn
     * phí, và rút phần XePrime tài trợ về ví.
     *
     * Trừ theo thứ tự CỌC → HOA HỒNG → PHÍ SÀN và không bao giờ trừ vào bảo hiểm, đúng phần
     * `sponsorableAmount` đã dùng để tính trần — nên mọi dòng ở đây luôn ≥ 0.
     */
    const fromDeposit = Math.min(promo, d);
    const fromCommission = Math.min(promo - fromDeposit, h);
    push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.CUSTOMER_BALANCE, d - fromDeposit);
    push(FEE_LINE.OWNER_COMMISSION, ALLOCATION_TARGET.CUSTOMER_BALANCE, h - fromCommission);
    push(
      FEE_LINE.SERVICE_FEE,
      ALLOCATION_TARGET.CUSTOMER_BALANCE,
      s - (promo - fromDeposit - fromCommission),
    );
    push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.CUSTOMER_BALANCE, iv);
    push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.CUSTOMER_BALANCE, ip);
    return out;
  }

  if (kind === 'split_late_cancel') {
    // Bảo hiểm chưa mua ⇒ hoàn 100%, không phụ thuộc khả năng hoàn của đối tác (ADR 0032 điều 4).
    push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.CUSTOMER_BALANCE, iv);
    push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.CUSTOMER_BALANCE, ip);
    /*
     * Chủ xe nhận TRỌN phần cam kết giữ xe `D` (ADR 0066 — thay phép chia đôi `D + S + H` của ADR
     * 0064 điều 8): đó là khoản đền cho lịch đã giữ mà khách bỏ. Không có thuế — chuyến không
     * diễn ra. Nhận đủ QUYỀN LỢI, không phải phần tiền mặt: khoản đền không có lý do gì nhỏ đi vì
     * nền tảng đã giảm giá cho khách.
     */
    push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.OWNER_BALANCE, d);
    /*
     * XePrime giữ `S + H − P`: phần tài trợ trừ vào dòng phí sàn — cùng chỗ với nhánh `settled` —
     * nên dòng đó ÂM ĐƯỢC khi mã lớn hơn phí sàn, còn tổng phân bổ vẫn đúng bằng tiền mặt
     * `D + S + H + IV + IP − P`. Hai dòng nền tảng giữ khoá riêng để báo cáo tách phí sàn khỏi
     * hoa hồng.
     */
    pushPlatform(FEE_LINE.SERVICE_FEE, s - promo);
    push(FEE_LINE.OWNER_COMMISSION, ALLOCATION_TARGET.PLATFORM_REVENUE, h);
    return out;
  }

  // settled — chuyến hoàn thành.
  const tax = Math.min(d, Number(taxAmount));
  push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.OWNER_BALANCE, d - tax);
  /*
   * Thuế đi về đích RIÊNG, không tan biến. Kẹp `min(d, tax)` vì phần vượt quá cọc không nằm
   * trong số tiền nền tảng đang giữ — CHECK `fee_policies_deposit_covers_tax_check` đã chặn
   * cấu hình sinh ra ca đó, nhưng bất biến "tổng phân bổ = số đã nhận" không được phép phụ
   * thuộc vào một CHECK ở bảng khác.
   */
  push(FEE_LINE.TAX, ALLOCATION_TARGET.TAX_LEDGER, tax);
  /*
   * "Sàn giữ lại" = phí sàn + hoa hồng, TRỪ tài trợ vào dòng phí sàn — chủ xe, ngân sách và hãng
   * bảo hiểm ở trên/dưới nhận đủ quyền lợi. Hai dòng nền tảng giữ khoá riêng để báo cáo doanh thu
   * tách được phí phía khách khỏi hoa hồng phía chủ xe.
   */
  pushPlatform(FEE_LINE.SERVICE_FEE, s - promo);
  push(FEE_LINE.OWNER_COMMISSION, ALLOCATION_TARGET.PLATFORM_REVENUE, h);
  push(FEE_LINE.VEHICLE_PROTECTION, ALLOCATION_TARGET.INSURER_PAYABLE, iv);
  push(FEE_LINE.TRIP_INSURANCE, ALLOCATION_TARGET.INSURER_PAYABLE, ip);
  return out;
}

/**
 * Tổng phân bổ theo TỪNG đích — đúng thứ đối soát ba vế cần đóng băng lên `booking_holds`.
 *
 * Bất biến: tổng năm đích LUÔN bằng `D + S + H + IV + IP − P` = số tiền mặt hold đã nhận (ADR
 * 0046 điều 4 — không có mã khuyến mãi thì `P = 0` và con số đó đúng bằng các dòng tiền). Không
 * có đường nào cho một đồng biến mất giữa chừng, và đó là điều khiến phép đối soát có nghĩa.
 */
export function allocationTotals(allocation: AllocationEntry[]): Record<AllocationTarget, string> {
  const totals: Record<AllocationTarget, number> = {
    [ALLOCATION_TARGET.CUSTOMER_BALANCE]: 0,
    [ALLOCATION_TARGET.OWNER_BALANCE]: 0,
    [ALLOCATION_TARGET.PLATFORM_REVENUE]: 0,
    [ALLOCATION_TARGET.INSURER_PAYABLE]: 0,
    [ALLOCATION_TARGET.TAX_LEDGER]: 0,
  };
  for (const line of allocation) totals[line.target] += Number(line.amount);
  return Object.fromEntries(
    Object.entries(totals).map(([target, amount]) => [target, String(amount)]),
  ) as Record<AllocationTarget, string>;
}

// ── Khoản giữ chỗ NHƯ KHÁCH THẤY ───────────────────────────────────────────

/** Một dòng tiền của khoản giữ chỗ — hình dạng `booking_holds.allocation_json`. */
export interface HoldAllocationLine {
  key: string;
  beneficiary: string;
  bearer: string;
  amount: string;
}

/**
 * Các dòng của khoản giữ chỗ cho bề mặt KHÁCH — chỗ DUY NHẤT quyết định khách thấy gì ở đây.
 *
 * Gộp `D` (phần chủ xe) và `H` (hoa hồng, chủ xe chịu) thành MỘT dòng `RENT_PREPAID`: lọc bỏ
 * riêng dòng `H` không đủ, vì `H = amount + P − D − S − IV − IP` suy ngược được từ các dòng còn
 * lại (ADR 0064 điều 11). Sau khi gộp, các dòng vẫn cộng đúng bằng `amount` (`PROMO` là dòng trừ),
 * và không dòng nào kể riêng `D` hay `H`.
 *
 * Dòng khác không thuộc phía khách (chủ xe/đối tác chịu) bị bỏ — allow-list theo `bearer`, nên một
 * khoá phía chủ xe mới thêm ngày mai mặc định KHÔNG lọt ra.
 */
export function customerHoldAllocation(
  lines: readonly HoldAllocationLine[] | null | undefined,
): HoldAllocationLine[] {
  const all = lines ?? [];
  const rentPrepaid = all
    .filter((line) => line.key === FEE_LINE.DEPOSIT || line.key === FEE_LINE.OWNER_COMMISSION)
    .reduce((sum, line) => sum + Number(line.amount), 0);
  const rest = all.filter(
    (line) =>
      line.key !== FEE_LINE.DEPOSIT &&
      line.key !== FEE_LINE.OWNER_COMMISSION &&
      line.bearer === FEE_BEARER.CUSTOMER,
  );
  return [
    ...(rentPrepaid > 0
      ? [
          {
            key: FEE_LINE.RENT_PREPAID,
            beneficiary: FEE_BENEFICIARY.OWNER,
            bearer: FEE_BEARER.CUSTOMER,
            amount: String(rentPrepaid),
          },
        ]
      : []),
    ...rest,
  ];
}
