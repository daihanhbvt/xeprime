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
 *   | `T`  Thuế khấu trừ/nộp thay | chủ xe     | ngân sách     | % trên giá thuê, cổng tư vấn thuế    |
 *
 * ⚠️ So với ADR đang Accepted, v2 đổi hai điều: phí XePrime không còn chỉ nằm phía khách (ADR 0029
 * điều 1 — nay có `H` trừ vào tiền chủ xe), và cọc online tính trên TỔNG KHÁCH TRẢ thay vì trên
 * giá thuê (ADR 0032 điều 2). Bất biến của ADR 0046 giữ nguyên: mã khuyến mãi chỉ trừ vào phần
 * khách chuyển online, không đổi một đồng nào của chủ xe, hãng bảo hiểm hay ngân sách.
 *
 * **Bước giá 1.000đ.** Mọi phép chia tỷ lệ đi qua `roundToThousand`; số cấu hình (phí sàn, biểu
 * phí bảo hiểm, các sàn tiền) phải là bội 1.000đ — `feePolicyActivationBlockers` chặn ở cổng kích
 * hoạt. Số khách trả tay là PHẦN CÒN LẠI của phép trừ, không bao giờ làm tròn riêng, nên không có
 * đường nào lệch 1.000đ.
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
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from './status/vehicle';
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
   * Như thuế, dòng này KHÔNG cộng vào tổng khách: nó được giữ lại từ phần cọc online thuộc về chủ
   * xe, nên `ownerNetAmount = R − H − T` (`R` = tiền thuê, không gồm phí giao).
   */
  OWNER_COMMISSION: 'owner_commission',
  /**
   * `T` — thuế khấu trừ/nộp thay, ngân sách hưởng.
   *
   * **CHỦ XE chịu** (ADR 0032 điều 3): khấu trừ khỏi khoản XePrime phải trả chủ xe, KHÔNG bao
   * giờ cộng vào tổng khách. Chỉ phát sinh khi chuyến BẮT ĐẦU — huỷ trước chuyến không có thuế.
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
   * `D` — PHẦN CỦA CHỦ XE trong khoản cọc online: `cọc online − S − H − IV − IP`. **Không phải
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
  /** VND string, bội của 1.000đ. */
  amount: string;
  /** Tên đối tác thật (hãng bảo hiểm) — chỉ có khi dòng đó bật. */
  partnerName?: string;
}

// ── Bước giá & hoa hồng lũy tiến ────────────────────────────────────────────

/** Bước giá của mọi khoản tiền XePrime tính ra. */
export const MONEY_STEP_VND = 1000;

/**
 * Làm tròn tới bước giá 1.000đ — hàm chuẩn của luồng tiền v2: `Math.round(n / 1000) * 1000`.
 * Nửa bước làm tròn LÊN (`1.500 → 2.000`).
 */
export function roundToThousand(n: number): number {
  return Math.round(n / MONEY_STEP_VND) * MONEY_STEP_VND;
}

/**
 * Làm tròn XUỐNG tới bước giá 1.000đ — chỉ cho số tiền là một KHOẢN GIẢM bị trần chặn trên
 * (mã khuyến mãi theo %). Làm tròn lên ở đó có thể đẩy số giảm vượt chính cái trần vừa kẹp nó
 * (`maxDiscountAmount`, phần tài trợ được) — nền tảng hứa "giảm tối đa 50.000đ" rồi giảm 50.500đ.
 */
export function floorToThousand(n: number): number {
  return Math.floor(n / MONEY_STEP_VND) * MONEY_STEP_VND;
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
 * tính đúng "% giá thuê ngày đó". Làm tròn 1.000đ MỘT lần trên tổng, không làm tròn từng ngày:
 * 3 ngày × 333.333đ ở 10/10/7% ra 89.999,9đ ⇒ 90.000đ, còn tròn từng ngày sẽ ra 89.000đ — lệch
 * 1.000đ chỉ vì thứ tự phép tính.
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
    // Nhân trước, chia 100 sau cùng: giữ phép cộng trên số nguyên chừng nào đầu vào còn nguyên.
    weighted += amount * ownerCommissionPercentForDay(index + 1, tiers);
  });
  return String(roundToThousand(weighted / 100));
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
   * % CỌC ONLINE trên TỔNG KHÁCH TRẢ trước mã khuyến mãi (`B + S + IV + IP`) — 30% ở luồng tiền
   * v2. **Nền tảng đặt, không phải gian hàng** (ADR 0033 điều 7): để mỗi shop tự đặt thì cùng
   * một hạng xe lại có mức trả trước khác nhau mà khách không giải thích được.
   */
  depositPercent: number;
  /** Sàn cọc online (VND) — cọc quá nhỏ thì công đối soát vượt giá trị giữ chỗ. */
  depositMinAmount: string;
  /** Trần % cọc — chặn "cọc giữ chỗ" biến thành thu tiền thuê trước (ADR 0025 điều 3). */
  depositMaxPercent: number;
  /** `S` — phí sàn CỐ ĐỊNH mỗi đơn, phía khách, theo loại xe. Áp cho cả hai tuyến. */
  customerPlatformFee: PerVehicleTypeAmount;
  /** `H` — nấc hoa hồng lũy tiến theo ngày của TUYẾN HOA HỒNG, `fromDay` tăng dần từ 1. */
  ownerCommissionTiers: readonly OwnerCommissionTier[];
  taxEnabled: boolean;
  taxPercent: number | null;
  /** Tên loại thuế do tư vấn thuế chốt — bắt buộc khi `taxEnabled`. */
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
  depositPercent: 30,
  depositMinAmount: '50000',
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
 * Luồng tiền v2, theo đúng thứ tự khách và chủ xe hỏi:
 *
 * ```text
 *   R  (tiền thuê)         = B − G      (G = phí giao nhận nằm trong B)
 *   H                      = Σ % nấc × giá thuê từng ngày   (trên R, không trên G)
 *   T                      = taxPercent% × R                (trên R, không trên G — ADR 0064)
 *   grossCustomerTotal     = B + S + IV + IP                           ← tổng trước mã
 *   grossOnlineAmount      = roundToThousand(depositPercent% × (grossCustomerTotal − G)),
 *                            nâng lên đủ S + H + IV + IP + T,
 *                            kẹp ≤ grossCustomerTotal − G               ← cọc online trước mã
 *   onlineAmount           = grossOnlineAmount − P                     ← trả NGAY qua QR
 *   payAtPickupAmount      = grossCustomerTotal − grossOnlineAmount    ← trả TRỰC TIẾP chủ xe
 *   customerTotalAmount    = grossCustomerTotal − P                    ← tổng cả chuyến
 *   depositAmount (D)      = grossOnlineAmount − S − H − IV − IP       ← phần chủ xe trong cọc
 *   platformRetainedAmount = S + H                                     ← "sàn giữ lại"
 *   ownerPayableAmount     = D − T                                     ← sàn chuyển ví chủ xe
 *   taxableBaseAmount      = R                                         ← mẫu số của T
 *   ownerNetAmount         = R − H − T                                 ← chủ xe nhận cho TIỀN THUÊ
 *                          = payAtPickup + ownerPayable − G
 * ```
 *
 * Ba đẳng thức bảo toàn đúng ở MỌI đầu vào, nên không có đường nào lệch 1.000đ:
 * `onlineAmount + payAtPickupAmount = customerTotalAmount`,
 * `grossOnlineAmount = D + S + H + IV + IP`,
 * `payAtPickupAmount + ownerPayableAmount = ownerNetAmount + G` — phí giao `G` là tiền mặt chủ xe
 * nhận tận tay, hiện riêng ở `deliveryAmount`, không gộp vào "chủ xe nhận cho tiền thuê" (ADR 0064
 * điều 5: `ownerNet = B − H − T` với `B` không gồm `G`).
 *
 * `P` là TÀI TRỢ mã khuyến mãi của XePrime (ADR 0046). Nó chỉ trừ vào `onlineAmount` và
 * `customerTotalAmount`; cọc được tính trên tổng TRƯỚC mã, nên `B`, `S`, `H`, `T`, `IV`, `IP`,
 * `D`, `payAtPickupAmount`, `ownerPayableAmount` và `ownerNetAmount` KHÔNG đổi một đồng — đó là
 * điều làm nó khác `PRICE_ROW.DISCOUNT`, khuyến mãi trực tiếp mà CHỦ XE tự bớt vào doanh thu.
 *
 * Ba quy tắc không có núm xoay:
 *
 * 1. **`D` là tiền thuê trả trước, không phải phụ phí.** Nó không nằm trong `lines` và không cộng
 *    vào `customerTotalAmount` — cộng vào là tính tiền thuê hai lần.
 * 2. **`H` và `T` do CHỦ XE chịu** nên không vào `customerTotalAmount`; chúng được giữ lại từ phần
 *    cọc thuộc về chủ xe. `S`/`IV`/`IP` thì ngược lại: KHÁCH trả, cộng vào tổng khách.
 * 3. **Cọc online luôn đủ trả mọi thứ không phải của chủ xe** (`S + H + IV + IP + T`). XePrime không
 *    thu hộ phần trả tay, nên một khoản cọc nhỏ hơn số đó sẽ để lại một món nợ ngược từ chủ xe mà
 *    không có chỗ nào để đòi — `ownerPayableAmount` vì thế không âm chừng nào `H + T ≤ B`.
 *
 * 4. **Phí giao nhận `G` là tiền của chủ xe, trả TẬN TAY** (ADR 0064, giữ quyết định Wave 9). Nó
 *    nằm trong `B` (khách vẫn trả, chủ xe hưởng 100%) nhưng KHÔNG vào mẫu số cọc 30%, KHÔNG vào
 *    mẫu số hoa hồng hay thuế, và cọc online bị kẹp ≤ `tổng − G` — nên `G` luôn rơi trọn vào
 *    `payAtPickupAmount`. XePrime không cầm hộ tiền xăng của người lái xe tới.
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
  /** `D` — phần của CHỦ XE trong cọc online. `'0'` khi chuyến không thu online. */
  depositAmount: string;
  /** `H` — hoa hồng lũy tiến trừ vào tiền chủ xe. `'0'` ở tuyến gói. */
  ownerCommissionAmount: string;
  /**
   * `S + H` — phần XePrime GIỮ LẠI từ cọc online. Tính trước tài trợ mã: doanh thu thật của nền
   * tảng là con số này trừ `promoDiscountAmount`, và nó được phép âm (chi phí marketing thật).
   */
  platformRetainedAmount: string;
  /**
   * Cọc online TRƯỚC tài trợ mã khuyến mãi = `D + S + H + IV + IP`, đã nâng đủ các sàn.
   *
   * Đây là con số phân bổ (`resolveHoldAllocation`) làm việc trên: quyền lợi của chủ xe, hãng
   * bảo hiểm và ngân sách KHÔNG đổi vì XePrime giảm giá cho khách (ADR 0046 điều 2).
   */
  grossOnlineAmount: string;
  /**
   * Phần cọc online XePrime được phép TÀI TRỢ bằng mã khuyến mãi = `D + S + H` — mọi thứ trừ tiền
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
  /** `T` — thuế khấu trừ khỏi tiền chủ xe. `'0'` khi cổng thuế chưa mở. */
  taxAmount: string;
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

/** Phần trăm của một số tiền, làm tròn tới bước giá 1.000đ. */
function percentOf(base: number, percent: number): number {
  return roundToThousand((base * percent) / 100);
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
   * thuế, hoa hồng và cọc 30% tính trên tiền thuê `B − G`, còn `G` rơi trọn vào phần khách trả tận
   * tay chủ xe (ADR 0064).
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
  /** `R` — tiền THUÊ: mẫu số của hoa hồng, thuế và cọc. Phí giao không nằm trong nó. */
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
   */
  if (p.taxEnabled && p.taxPercent != null && p.taxPercent > 0) {
    lines.push({
      key: FEE_LINE.TAX,
      beneficiary: FEE_BENEFICIARY.TAX_AUTHORITY,
      bearer: FEE_BEARER.OWNER,
      percent: p.taxPercent,
      amount: String(percentOf(rent, p.taxPercent)),
    });
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
   * CỌC ONLINE. Báo giá tạm tính thì không thu đồng nào — CLAUDE.md cấm thu phần trăm trên một con
   * số chưa chốt.
   *
   * Sàn của nó là mọi thứ KHÔNG phải tiền của chủ xe (`S + H + IV + IP + T`): XePrime không thu
   * hộ phần trả tay, nên đó là lần duy nhất nó cầm được tiền của chính mình, của hãng bảo hiểm và
   * của ngân sách. Một chuyến xe máy một ngày 100.000đ có hai gói bảo hiểm ra 30% = 45.000đ, nhỏ
   * hơn 60.000đ phải giữ lại — không có sàn này thì ví chủ xe nhận một khoản âm.
   *
   * Không thu cọc (tuyến gói tắt công tắc) thì khoản online đúng bằng phần đó và không hơn.
   *
   * Mẫu số 30% và TRẦN của khoản online đều là tổng khách trả TRỪ phí giao `G` (ADR 0064): phí giao
   * là tiền mặt của người lái xe tới, trả tận tay, XePrime không cầm hộ. Kẹp trần ở đó (thay vì ở
   * cả tổng) còn giữ bất biến cũ: một policy cấu hình sai (sàn cọc lớn hơn cả chuyến) không được
   * phép sinh `payAtPickupAmount` âm — và giờ cũng không được phép kéo phí giao vào mã QR.
   */
  const collectsOnline = !input.quoteIsEstimate;
  const depositRequired =
    (input.depositRequired ?? input.billingMode === BILLING_MODE.COMMISSION) && collectsOnline;
  const notOwnersMoney = serviceFee + commission + insuranceTotal + taxAmount;
  const onlineBase = grossCustomerTotal - delivery;
  let grossOnline = 0;
  if (collectsOnline) {
    const floor = depositRequired
      ? Math.max(
          percentOf(onlineBase, p.depositPercent),
          Number(p.depositMinAmount),
          notOwnersMoney,
        )
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
  [FEE_LINE.SERVICE_FEE]: 'Phí dịch vụ XePrime',
  [FEE_LINE.OWNER_COMMISSION]: 'Hoa hồng XePrime',
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
/** Trần % thuế khấu trừ của chủ xe. */
export const TAX_PERCENT_MAX = 50;

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
   * Bước giá 1.000đ bắt đầu từ SỐ CẤU HÌNH: phép tính chỉ làm tròn phần nó chia tỷ lệ, còn phí
   * sàn, biểu phí bảo hiểm và các sàn tiền đi thẳng vào mã QR — một số lẻ ở đây là một số lẻ trên
   * mọi đơn.
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
   * Thuế tính trên GIÁ THUÊ `B` nhưng chỉ khấu trừ được từ phần XePrime đang cầm. Phép tính đã
   * nâng cọc lên đủ giữ `T` (`computeCustomerFees`), nhưng một chính sách có % cọc dưới % thuế thì
   * sàn đó kích hoạt trên mọi đơn và "cọc 30%" công bố với khách không còn đúng ở đơn nào. Chặn ở
   * cổng kích hoạt, không để phát hiện ra lúc quyết toán chuyến đầu tiên.
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
  /** `D` — phần của chủ xe trong cọc online, gồm cả `T` sẽ khấu trừ khi quyết toán. */
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
  /** Huỷ muộn hoặc no-show — `D + S + H` chia đôi, `IV + IP` hoàn đủ. */
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
 * PHÂN BỔ (`holdSettlementKindFor` ≠ null — quyết toán, huỷ muộn chia đôi, hoàn khách) mới chia
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
 * Vì sao là hàm chứ không phải bảng tra: nhánh `split_late_cancel` cần một phép chia đôi có
 * **phần dư xác định**. Chia `D + S + H` cho 2 rồi làm tròn hai lần độc lập sẽ làm tổng lệch so
 * với số đã thu — và một đồng lệch trên sổ cái là một đồng không ai đối chiếu được. Ở đây nửa của
 * chủ xe làm tròn XUỐNG bước 1.000đ và nền tảng lấy phần dư (`total − nửa của chủ xe`), nên tổng
 * luôn khớp tuyệt đối và ví chủ xe không bao giờ nhận một số lẻ.
 *
 * Ba kết cục của luồng tiền v2:
 *  - `refund_all` — hoàn 100% số khách đã chuyển (huỷ trong cửa sổ miễn phí, chủ xe huỷ).
 *  - `split_late_cancel` — `IV + IP` hoàn đủ (chưa phát hành bảo hiểm), phần còn lại của cọc chia
 *    đôi chủ xe / XePrime.
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
     * Hoa hồng nằm trong phần chia đôi: chuyến không diễn ra nên không có hoa hồng nào được
     * "kiếm", và khoản đền giữ lịch của chủ xe là nửa của toàn bộ cọc ngoài bảo hiểm.
     */
    const splittable = d + s + h;
    const toOwner = Math.floor(splittable / 2 / MONEY_STEP_VND) * MONEY_STEP_VND;
    push(FEE_LINE.DEPOSIT, ALLOCATION_TARGET.OWNER_BALANCE, toOwner);
    /*
     * Chủ xe nhận đủ NỬA QUYỀN LỢI, không phải nửa tiền mặt: khoản họ được đền vì khách huỷ
     * muộn không có lý do gì nhỏ đi vì nền tảng đã giảm giá cho khách. Phần tài trợ trừ vào dòng
     * nền tảng, cùng chỗ với phần dư của phép chia đôi.
     */
    pushPlatform(FEE_LINE.SERVICE_FEE, splittable - toOwner - promo);
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
