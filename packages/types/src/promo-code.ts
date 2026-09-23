/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — ADR 0046.
 *
 * Khác hẳn `vehicle.discountPercent` (khuyến mãi TRỰC TIẾP của chủ xe: chủ xe tự bớt tiền thuê
 * của mình, và `PRICE_ROW.DISCOUNT` trừ thẳng vào `bookings.total_amount` = doanh thu của họ).
 * Mã ở đây do **XePrime tài trợ**: nó giảm số khách phải trả nhưng KHÔNG được bớt một đồng nào
 * của gian hàng. Vì vậy hai loại không bao giờ dùng chung một dòng tiền — trộn vào
 * `PRICE_ROW.DISCOUNT` là làm mất khả năng đối soát "ai đã bớt tiền cho khách này".
 *
 * ## Dòng tiền (ADR 0046 điều 2)
 *
 * ```text
 *   B            tiền thuê (doanh thu gian hàng)          ← mã KHÔNG đụng
 *   S,T,IV,IP    tính trên B như trước                    ← mã KHÔNG đụng (giữ cơ sở tính)
 *   D            cọc theo chính sách nền tảng             ← mã KHÔNG đụng (quyền của chủ xe)
 *   grossOnline  = D + S + IV + IP                        ← mã KHÔNG đụng
 *   P            = số giảm đã áp (XePrime tài trợ)
 *   holdAmount   = grossOnline − P                         ← con số in lên QR
 *   customerTotal= B + S + IV + IP − P
 *   payAtPickup  = B − D                                   ← mã KHÔNG đụng
 *   ownerPayable = D − T                                   ← mã KHÔNG đụng
 * ```
 *
 * `P` **chỉ** trừ vào phần khách chuyển ONLINE cho XePrime. Lý do là một điều kiện đủ: đó là
 * khoản tiền DUY NHẤT XePrime thật sự cầm trong tay. Trừ vào `payAtPickup` là bắt chủ xe nhận
 * ít tiền mặt hơn rồi chờ nền tảng bù — một nghĩa vụ mới, cho một bên không ký gì cả.
 *
 * Hệ quả: `P` bị kẹp bởi `grossOnline − holdMinAmount`. Sàn đó không phải số gõ tay — nó là
 * `fee_policies.hold_min_amount`, ngưỡng "một lần chuyển khoản đáng công đối soát". Tài trợ
 * xuống dưới sàn là phát một mã QR mà chính nền tảng coi là không đáng thu.
 *
 * Framework-free: api tính, web/mobile hiển thị, worker đọc — MỘT phép tính.
 */

import { PRICE_ROW } from './pricing';
import { STATUS_COLOR, type StatusMeta } from './status/meta';
import { SERVICE_TYPE, VEHICLE_TYPE, type ServiceType, type VehicleType } from './status/vehicle';

// ── Hình thức giảm ──────────────────────────────────────────────────────────

export const PROMO_DISCOUNT_TYPE = {
  /** Giảm một SỐ TIỀN cố định (VND). `discountAmount` bắt buộc. */
  FIXED: 'fixed',
  /** Giảm theo PHẦN TRĂM tiền thuê đủ điều kiện. `discountPercent` + trần `maxDiscountAmount`. */
  PERCENT: 'percent',
} as const;

export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPE)[keyof typeof PROMO_DISCOUNT_TYPE];
export const PROMO_DISCOUNT_TYPE_VALUES = Object.values(
  PROMO_DISCOUNT_TYPE,
) as PromoDiscountType[];

export function isPromoDiscountType(value: unknown): value is PromoDiscountType {
  return typeof value === 'string' && (PROMO_DISCOUNT_TYPE_VALUES as string[]).includes(value);
}

export const PROMO_DISCOUNT_TYPE_LABEL: Readonly<Record<PromoDiscountType, string>> = {
  [PROMO_DISCOUNT_TYPE.FIXED]: 'Giảm tiền',
  [PROMO_DISCOUNT_TYPE.PERCENT]: 'Giảm %',
};

// ── Đối tượng khách hàng ────────────────────────────────────────────────────

/**
 * "Khách hàng mới" định nghĩa theo DANH TÍNH ĐÃ XÁC THỰC và LỊCH SỬ ĐƠN THÀNH CÔNG, không theo
 * tên/SĐT khách tự gõ (ADR 0046 điều 5).
 *
 * Cụ thể: `users.id` (khách vãng lai cũng có — `submitPublic` quy SĐT đã qua OTP về một tài
 * khoản trước khi giữ lượt) và số `booking_requests` của chính tài khoản đó đã từng
 * `converted_to_booking`. Đếm theo ĐƠN ĐÃ HÌNH THÀNH chứ không theo số lượt gửi yêu cầu: một
 * người gửi mười yêu cầu rồi không trả tiền lần nào vẫn chưa từng thuê xe của XePrime.
 */
export const PROMO_AUDIENCE = {
  ALL: 'all',
  NEW_CUSTOMER: 'new_customer',
} as const;

export type PromoAudience = (typeof PROMO_AUDIENCE)[keyof typeof PROMO_AUDIENCE];
export const PROMO_AUDIENCE_VALUES = Object.values(PROMO_AUDIENCE) as PromoAudience[];

export function isPromoAudience(value: unknown): value is PromoAudience {
  return typeof value === 'string' && (PROMO_AUDIENCE_VALUES as string[]).includes(value);
}

export const PROMO_AUDIENCE_LABEL: Readonly<Record<PromoAudience, string>> = {
  [PROMO_AUDIENCE.ALL]: 'Tất cả khách hàng',
  [PROMO_AUDIENCE.NEW_CUSTOMER]: 'Khách hàng mới',
};

// ── Phạm vi xe ──────────────────────────────────────────────────────────────

/**
 * Phạm vi LOẠI XE. Chỉ ba giá trị, và cố ý không có "theo từng xe": mã do nền tảng tài trợ,
 * nên nó chọn thị trường (ô tô / xe máy), không chọn hộ khách một chiếc xe cụ thể của một gian
 * hàng — làm thế là nền tảng bỏ tiền đẩy đơn cho một người bán, việc mà ADR 0028 dành cho boost
 * thuê bao và bắt buộc gắn nhãn tài trợ.
 */
export const PROMO_VEHICLE_SCOPE = {
  ALL: 'all',
  CAR: VEHICLE_TYPE.CAR,
  MOTORBIKE: VEHICLE_TYPE.MOTORBIKE,
} as const;

export type PromoVehicleScope = (typeof PROMO_VEHICLE_SCOPE)[keyof typeof PROMO_VEHICLE_SCOPE];
export const PROMO_VEHICLE_SCOPE_VALUES = Object.values(
  PROMO_VEHICLE_SCOPE,
) as PromoVehicleScope[];

export function isPromoVehicleScope(value: unknown): value is PromoVehicleScope {
  return typeof value === 'string' && (PROMO_VEHICLE_SCOPE_VALUES as string[]).includes(value);
}

export const PROMO_VEHICLE_SCOPE_LABEL: Readonly<Record<PromoVehicleScope, string>> = {
  [PROMO_VEHICLE_SCOPE.ALL]: 'Tất cả xe',
  [PROMO_VEHICLE_SCOPE.CAR]: 'Ô tô',
  [PROMO_VEHICLE_SCOPE.MOTORBIKE]: 'Xe máy',
};

// ── Trạng thái suy ra (KHÔNG lưu) ───────────────────────────────────────────

/**
 * Trạng thái hiển thị của một chiến dịch — **suy ra từ dữ liệu server**, không phải một cột.
 *
 * Vì sao không lưu: bốn trong sáu giá trị thay đổi theo ĐỒNG HỒ (`upcoming` → `active` →
 * `ending_soon` → `expired`) và một theo BỘ ĐẾM (`exhausted`). Một cột trạng thái ở đây sẽ đúng
 * cho tới đúng nửa đêm đầu tiên, rồi cần một worker đi sửa dữ liệu chỉ để nói lại điều mà
 * `ends_at` đã nói. `is_active` (công tắc của admin) là thứ DUY NHẤT được lưu.
 */
export const PROMO_CODE_STATE = {
  /** Công tắc admin đang TẮT — thắng mọi mốc thời gian. */
  DISABLED: 'disabled',
  /** Chưa tới `startsAt`. */
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  /** Còn hiệu lực nhưng hết hạn trong `PROMO_ENDING_SOON_DAYS` ngày tới. */
  ENDING_SOON: 'ending_soon',
  EXPIRED: 'expired',
  /** Đã dùng hết `totalUsageLimit` — hết lượt trước khi hết hạn. */
  EXHAUSTED: 'exhausted',
} as const;

export type PromoCodeState = (typeof PROMO_CODE_STATE)[keyof typeof PROMO_CODE_STATE];
export const PROMO_CODE_STATE_VALUES = Object.values(PROMO_CODE_STATE) as PromoCodeState[];

export const PROMO_CODE_STATE_META: Readonly<Record<PromoCodeState, StatusMeta>> = {
  [PROMO_CODE_STATE.DISABLED]: { label: 'Đã tắt', color: STATUS_COLOR.NEUTRAL },
  [PROMO_CODE_STATE.UPCOMING]: { label: 'Sắp diễn ra', color: STATUS_COLOR.INFO },
  [PROMO_CODE_STATE.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [PROMO_CODE_STATE.ENDING_SOON]: { label: 'Sắp hết hạn', color: STATUS_COLOR.WARNING },
  [PROMO_CODE_STATE.EXPIRED]: { label: 'Đã hết hạn', color: STATUS_COLOR.NEUTRAL },
  [PROMO_CODE_STATE.EXHAUSTED]: { label: 'Hết lượt', color: STATUS_COLOR.DANGER },
};

/** "Sắp hết hạn" = còn ngần này ngày. Thẻ thống kê của admin đếm đúng ngưỡng này. */
export const PROMO_ENDING_SOON_DAYS = 7;

/**
 * Suy trạng thái từ dữ liệu ĐÃ LƯU — dùng chung server (DTO) và client (thẻ lọc), nên hai bên
 * không thể nói hai câu khác nhau về cùng một chiến dịch.
 */
export function promoCodeState(
  input: {
    isActive: boolean;
    startsAt: string | Date;
    endsAt: string | Date;
    totalUsageLimit: number | null;
    /** Số lượt ĐANG GIỮ + ĐÃ CHỐT — trần đọc con số này, không đọc `redeemedCount`. */
    reservedCount: number;
  },
  now: Date = new Date(),
): PromoCodeState {
  if (!input.isActive) return PROMO_CODE_STATE.DISABLED;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (now < startsAt) return PROMO_CODE_STATE.UPCOMING;
  if (now > endsAt) return PROMO_CODE_STATE.EXPIRED;
  if (input.totalUsageLimit != null && input.reservedCount >= input.totalUsageLimit) {
    return PROMO_CODE_STATE.EXHAUSTED;
  }
  const soonMs = PROMO_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000;
  if (endsAt.getTime() - now.getTime() <= soonMs) return PROMO_CODE_STATE.ENDING_SOON;
  return PROMO_CODE_STATE.ACTIVE;
}

/** Chiến dịch còn nhận lượt mới không — `active` và `ending_soon` đều còn. */
export function isPromoStateUsable(state: PromoCodeState): boolean {
  return state === PROMO_CODE_STATE.ACTIVE || state === PROMO_CODE_STATE.ENDING_SOON;
}

// ── Vòng đời một LƯỢT dùng ──────────────────────────────────────────────────

/**
 * GIỮ → CHỐT → NHẢ (ADR 0046 điều 6).
 *
 * Giữ lượt ngay khi khách GỬI yêu cầu, không phải lúc xem trước: xem trước là một lượt đọc, và
 * giữ lượt ở đó thì một vòng lặp curl sẽ dùng cạn một chiến dịch trong vài giây. Chốt khi ĐƠN
 * hình thành — đúng mốc ADR 0044 điều 2 coi là "đặt xe thành công". Nhả khi yêu cầu chết trước
 * khi thành đơn.
 */
export const PROMO_REDEMPTION_STATUS = {
  /** Đang giữ chỗ trong hạn mức — yêu cầu chưa thành đơn. Tính vào `reservedCount`. */
  RESERVED: 'reserved',
  /** Đơn đã hình thành. Tính vào CẢ `reservedCount` lẫn `redeemedCount`. */
  REDEEMED: 'redeemed',
  /** Yêu cầu chết trước khi thành đơn — lượt trả về kho. Không tính vào bộ đếm nào. */
  RELEASED: 'released',
} as const;

export type PromoRedemptionStatus =
  (typeof PROMO_REDEMPTION_STATUS)[keyof typeof PROMO_REDEMPTION_STATUS];
export const PROMO_REDEMPTION_STATUS_VALUES = Object.values(
  PROMO_REDEMPTION_STATUS,
) as PromoRedemptionStatus[];

export const PROMO_REDEMPTION_STATUS_META: Readonly<Record<PromoRedemptionStatus, StatusMeta>> = {
  [PROMO_REDEMPTION_STATUS.RESERVED]: { label: 'Đang giữ lượt', color: STATUS_COLOR.WAITING },
  [PROMO_REDEMPTION_STATUS.REDEEMED]: { label: 'Đã dùng', color: STATUS_COLOR.SUCCESS },
  [PROMO_REDEMPTION_STATUS.RELEASED]: { label: 'Đã nhả lượt', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Vì sao yêu cầu NHẢ lượt — lưu để giải thích một bộ đếm tụt xuống, và để admin đọc được lý do
 * thật thay vì đoán từ trạng thái yêu cầu ở bảng khác.
 */
export const PROMO_RELEASE_REASON = {
  REQUEST_REJECTED: 'request_rejected',
  REQUEST_EXPIRED: 'request_expired',
  REQUEST_CANCELLED: 'request_cancelled',
  SLOT_TAKEN: 'slot_taken',
  /** Được nhận nhưng khách không chuyển tiền trong cửa sổ thanh toán. */
  HOLD_EXPIRED: 'hold_expired',
  /** Lúc chốt giá, mã không còn đủ điều kiện (đơn tối thiểu tụt, xe đổi loại…). */
  NO_LONGER_ELIGIBLE: 'no_longer_eligible',
} as const;

export type PromoReleaseReason = (typeof PROMO_RELEASE_REASON)[keyof typeof PROMO_RELEASE_REASON];
export const PROMO_RELEASE_REASON_VALUES = Object.values(
  PROMO_RELEASE_REASON,
) as PromoReleaseReason[];

/**
 * ĐƠN ĐÃ HÌNH THÀNH RỒI BỊ HUỶ **KHÔNG** khôi phục lượt mã.
 *
 * Hằng số này tồn tại để quy tắc đó có một cái tên trong code, và để màn admin trích đúng câu
 * đó ra chứ không viết lại bằng chữ khác (ADR 0046 điều 6). Lý do nghiệp vụ: một mã dùng một
 * lần cho một khách mà huỷ lại hoàn lượt thì nó thành mã dùng vô hạn — huỷ trong cửa sổ miễn
 * phí không mất đồng nào, nên vòng lặp "đặt rồi huỷ" là miễn phí với người khai thác.
 */
export const PROMO_REDEEMED_IS_FINAL = true;

// ── Lý do KHÔNG áp được mã ──────────────────────────────────────────────────

/**
 * Mã lỗi ỔN ĐỊNH cho từng lý do — web/mobile ánh xạ sang câu chữ dễ hiểu qua namespace
 * `Errors`/`PromoCodes`, KHÔNG hiện `message` tiếng Việt của backend làm chữ chính (ADR 0012).
 *
 * `NOT_FOUND` cố ý gộp "không tồn tại" với "đã xoá mềm" và "chưa `listed`": tách ra là cho phép
 * dò xem chiến dịch nào đang tồn tại nhưng chưa công bố.
 */
export const PROMO_INELIGIBLE_REASON = {
  NOT_FOUND: 'not_found',
  DISABLED: 'disabled',
  NOT_STARTED: 'not_started',
  EXPIRED: 'expired',
  EXHAUSTED: 'exhausted',
  /** Khách này đã dùng hết `perCustomerLimit`. */
  CUSTOMER_LIMIT_REACHED: 'customer_limit_reached',
  /** Mã chỉ cho khách hàng mới, mà tài khoản này đã có đơn thành công. */
  AUDIENCE_MISMATCH: 'audience_mismatch',
  /** Chưa đủ `minOrderAmount`. */
  MIN_ORDER_NOT_MET: 'min_order_not_met',
  VEHICLE_SCOPE_MISMATCH: 'vehicle_scope_mismatch',
  SERVICE_SCOPE_MISMATCH: 'service_scope_mismatch',
  PROVINCE_MISMATCH: 'province_mismatch',
  /**
   * Chuyến này XePrime không thu đồng nào online (báo giá tạm tính, dài hạn chưa chốt lịch,
   * gian hàng tuyến gói tắt thu cọc) ⇒ không có dòng tiền nào để tài trợ vào.
   */
  NO_ONLINE_PAYMENT: 'no_online_payment',
  /** Khoản tài trợ bị sàn `holdMinAmount` kẹp về 0 — xem docblock đầu file. */
  DISCOUNT_BELOW_FLOOR: 'discount_below_floor',
  /** Cần đăng nhập / xác thực SĐT mới kiểm được điều kiện theo khách. */
  REQUIRES_IDENTITY: 'requires_identity',
} as const;

export type PromoIneligibleReason =
  (typeof PROMO_INELIGIBLE_REASON)[keyof typeof PROMO_INELIGIBLE_REASON];
export const PROMO_INELIGIBLE_REASON_VALUES = Object.values(
  PROMO_INELIGIBLE_REASON,
) as PromoIneligibleReason[];

/** Nhãn gốc tiếng Việt — web/mobile dịch qua `Domain.promoIneligible`. */
export const PROMO_INELIGIBLE_REASON_LABEL: Readonly<Record<PromoIneligibleReason, string>> = {
  [PROMO_INELIGIBLE_REASON.NOT_FOUND]: 'Mã khuyến mãi không tồn tại',
  [PROMO_INELIGIBLE_REASON.DISABLED]: 'Mã khuyến mãi đã tắt',
  [PROMO_INELIGIBLE_REASON.NOT_STARTED]: 'Mã chưa tới ngày áp dụng',
  [PROMO_INELIGIBLE_REASON.EXPIRED]: 'Mã đã hết hạn',
  [PROMO_INELIGIBLE_REASON.EXHAUSTED]: 'Mã đã hết lượt sử dụng',
  [PROMO_INELIGIBLE_REASON.CUSTOMER_LIMIT_REACHED]: 'Bạn đã dùng hết lượt của mã này',
  [PROMO_INELIGIBLE_REASON.AUDIENCE_MISMATCH]: 'Mã chỉ áp dụng cho khách hàng mới',
  [PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET]: 'Chuyến chưa đạt giá trị tối thiểu của mã',
  [PROMO_INELIGIBLE_REASON.VEHICLE_SCOPE_MISMATCH]: 'Mã không áp dụng cho loại xe này',
  [PROMO_INELIGIBLE_REASON.SERVICE_SCOPE_MISMATCH]: 'Mã không áp dụng cho dịch vụ này',
  [PROMO_INELIGIBLE_REASON.PROVINCE_MISMATCH]: 'Mã không áp dụng ở khu vực này',
  [PROMO_INELIGIBLE_REASON.NO_ONLINE_PAYMENT]:
    'Chuyến này không thu tiền giữ chỗ nên chưa áp được mã',
  [PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR]: 'Chuyến này quá nhỏ để áp mã',
  [PROMO_INELIGIBLE_REASON.REQUIRES_IDENTITY]: 'Xác thực số điện thoại để áp mã này',
};

// ── Điều kiện của MỘT chiến dịch, dạng đóng băng ────────────────────────────

/**
 * Bộ điều kiện + mức giảm của một chiến dịch — thứ ĐÓNG BĂNG lên yêu cầu/đơn.
 *
 * Vì sao snapshot chứ không join lại `promo_codes` lúc đọc: admin sửa, tắt hoặc xoá mềm một
 * chiến dịch là việc bình thường, còn giá của một đơn đã chốt thì bất biến (ADR 0024). Không có
 * snapshot thì một đơn tháng trước sẽ được giải thích bằng con số của hôm nay — hoặc không giải
 * thích được gì khi chiến dịch đã bị xoá.
 */
export interface PromoCodeTerms {
  discountType: PromoDiscountType;
  /** VND string. Chỉ có nghĩa với `fixed`. */
  discountAmount: string | null;
  /** Chỉ có nghĩa với `percent`. */
  discountPercent: number | null;
  /** Trần số tiền giảm của mã `percent`. `null` = không trần. */
  maxDiscountAmount: string | null;
  /** Sàn tiền thuê đủ điều kiện. `'0'` = không yêu cầu. */
  minOrderAmount: string;
  audience: PromoAudience;
  vehicleScope: PromoVehicleScope;
  /** Mảng RỖNG = mọi dịch vụ. */
  serviceScope: ServiceType[];
  /** Mảng RỖNG = mọi tỉnh/thành. */
  provinceCodes: string[];
  perCustomerLimit: number | null;
}

/** Snapshot đóng băng lên `booking_requests.promo_snapshot_json` và `…price_snapshot_json.fees`. */
export interface PromoCodeSnapshot extends PromoCodeTerms {
  promoCodeId: string;
  /** Mã đã CHUẨN HOÁ — đây là chuỗi hiển thị lại cho khách trên đơn cũ. */
  code: string;
  /** Tên chương trình lúc khách áp mã. */
  name: string;
  /** Số giảm ĐÃ ÁP cho chuyến này (VND string) — con số duy nhất mọi màn hình đọc. */
  discountApplied: string;
  appliedAt: string;
}

// ── Biên hợp lệ của cấu hình ────────────────────────────────────────────────

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 20;
/** Chỉ CHỮ IN + SỐ. Không gạch dưới/gạch ngang: chúng đọc sai qua điện thoại và dán sai qua chat. */
export const PROMO_CODE_PATTERN = /^[A-Z0-9]+$/;
export const PROMO_DISCOUNT_PERCENT_MIN = 1;
export const PROMO_DISCOUNT_PERCENT_MAX = 100;
/**
 * Trần số tiền giảm CỐ ĐỊNH của một mã. Không phải giới hạn kỹ thuật — nó là hàng rào chống lỗi
 * gõ thừa số 0: một mã 100.000đ gõ thành 100.000.000đ sẽ được tài trợ thật cho tới khi ai đó đọc
 * báo cáo cuối tháng.
 */
export const PROMO_MAX_FIXED_DISCOUNT = 10_000_000;

/**
 * Chuẩn hoá mã về dạng lưu/so khớp DUY NHẤT: bỏ khoảng trắng hai đầu và mọi khoảng trắng bên
 * trong, rồi in hoa.
 *
 * Bỏ khoảng trắng BÊN TRONG cũng là chủ đích: khách dán mã từ tin nhắn thường kéo theo một
 * khoảng trắng ở giữa, và `PROMO_CODE_PATTERN` sẽ từ chối nó với một lý do mà họ không nhìn
 * thấy trên màn hình của mình.
 */
export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Lý do một cấu hình chiến dịch KHÔNG hợp lệ. Mảng rỗng = được. Dùng chung server (chặn thật) và
 * form admin (báo sớm) — cùng kỷ luật `feePolicyActivationBlockers`.
 */
export function promoCodeConfigBlockers(input: {
  code: string;
  name: string;
  discountType: PromoDiscountType;
  discountAmount: string | null;
  discountPercent: number | null;
  maxDiscountAmount: string | null;
  minOrderAmount: string;
  startsAt: string | Date;
  endsAt: string | Date;
  totalUsageLimit: number | null;
  perCustomerLimit: number | null;
}): string[] {
  const blockers: string[] = [];
  const code = normalizePromoCode(input.code ?? '');
  if (
    code.length < PROMO_CODE_MIN_LENGTH ||
    code.length > PROMO_CODE_MAX_LENGTH ||
    !PROMO_CODE_PATTERN.test(code)
  ) {
    blockers.push('code_format');
  }
  if (!input.name?.trim()) blockers.push('name_required');

  if (input.discountType === PROMO_DISCOUNT_TYPE.FIXED) {
    const amount = Number(input.discountAmount ?? NaN);
    if (!Number.isFinite(amount) || amount <= 0 || amount > PROMO_MAX_FIXED_DISCOUNT) {
      blockers.push('fixed_amount_out_of_range');
    }
    /*
     * Trần giảm là thuộc tính của mã PHẦN TRĂM. Cho phép nó đi cùng mã tiền cố định là để lại
     * hai con số cùng nói về một giới hạn, và không ai biết con số nào thắng.
     */
    if (input.maxDiscountAmount != null) blockers.push('max_discount_only_for_percent');
  } else {
    const percent = input.discountPercent;
    if (
      percent == null ||
      !Number.isInteger(percent) ||
      percent < PROMO_DISCOUNT_PERCENT_MIN ||
      percent > PROMO_DISCOUNT_PERCENT_MAX
    ) {
      blockers.push('percent_out_of_range');
    }
    if (input.maxDiscountAmount != null && Number(input.maxDiscountAmount) <= 0) {
      blockers.push('max_discount_invalid');
    }
  }

  if (Number(input.minOrderAmount) < 0) blockers.push('min_order_negative');

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    blockers.push('date_invalid');
  } else if (endsAt.getTime() <= startsAt.getTime()) {
    blockers.push('end_before_start');
  }

  if (input.totalUsageLimit != null && input.totalUsageLimit < 1) blockers.push('total_limit_min');
  if (input.perCustomerLimit != null && input.perCustomerLimit < 1) {
    blockers.push('per_customer_limit_min');
  }
  return blockers;
}

/**
 * Trường KHÔNG được sửa sau khi chiến dịch đã phát sinh lượt dùng (ADR 0046 điều 8).
 *
 * Sửa chúng làm lịch sử bị hiểu sai: một lượt đã ghi "giảm 8%, trần 80.000đ" mà chiến dịch nay
 * nói "giảm tiền 100.000đ" thì bảng lượt sử dụng và báo cáo tài trợ không còn khớp nhau — kể cả
 * khi từng lượt vẫn giữ snapshot riêng. Mở rộng thời gian, nới trần lượt, sửa tên/mô tả và
 * bật/tắt thì vẫn được: chúng không viết lại một lượt nào đã xảy ra.
 */
export const PROMO_LOCKED_FIELDS_AFTER_USE = [
  'code',
  'discountType',
  'discountAmount',
  'discountPercent',
  'maxDiscountAmount',
  'minOrderAmount',
  'audience',
  'vehicleScope',
  'serviceScope',
  'provinceCodes',
] as const;

export type PromoLockedField = (typeof PROMO_LOCKED_FIELDS_AFTER_USE)[number];

// ── Phép tính số giảm ───────────────────────────────────────────────────────

/** Làm tròn HALF_UP tới đồng — CÙNG quy tắc với `computeCustomerFees` và `@xeprime/domain`. */
function roundHalfUp(value: number): number {
  return Math.round(value + Number.EPSILON);
}

/**
 * TIỀN THUÊ ĐỦ ĐIỀU KIỆN của một bảng kê giá — `base − |discount|` (ADR 0046 điều 3).
 *
 * Nơi DUY NHẤT định nghĩa con số này, và nó cố ý KHÔNG phải `totalAmount`:
 *
 *  - **Trừ khuyến mãi trực tiếp trước** (`PRICE_ROW.DISCOUNT`): hai loại giảm giá cộng dồn, và
 *    mã nền tảng tính trên phần khách còn phải trả, không trên giá gạch ngang. Cộng dồn theo
 *    chiều ngược lại (mã tính trên giá gốc) là tài trợ cho phần chủ xe đã bớt.
 *  - **Không gồm `PRICE_ROW.DELIVERY`**: phí giao nhận là công của người mang xe tới, không
 *    phải tiền thuê. Giảm vào đó là bắt chủ xe chạy không lương.
 *  - **Không gồm `OVERTIME`/`EXTRAS`**: chúng phát sinh SAU chuyến, chưa tồn tại lúc áp mã.
 *  - **Không gồm cọc thế chấp**: đó là tiền khách lấy lại, giảm nó không giảm chi phí của ai.
 *
 * Với thuê dài hạn, `base − |discount|` đúng bằng `finalPackageAmount` — cùng một công thức, nên
 * không có nhánh riêng nào phải nhớ (ADR 0011).
 */
export function promoEligibleAmount(
  rows: ReadonlyArray<{ key: string; amount: string }>,
): string {
  const of = (key: string) => Math.abs(Number(rows.find((r) => r.key === key)?.amount ?? 0));
  return String(Math.max(0, of(PRICE_ROW.BASE) - of(PRICE_ROW.DISCOUNT)));
}

export interface PromoDiscountInput {
  terms: PromoCodeTerms;
  /**
   * Tiền thuê ĐỦ ĐIỀU KIỆN — tiền thuê SAU khuyến mãi trực tiếp của xe, KHÔNG gồm phí giao
   * nhận, phụ phí, bảo hiểm hay cọc thế chấp (ADR 0046 điều 3).
   */
  eligibleAmount: string;
  /** `D + S + IV + IP` trước tài trợ. `'0'`/null = chuyến không thu online. */
  grossOnlineAmount: string | null;
  /**
   * `D + S` — phần khoản online TÀI TRỢ ĐƯỢC.
   *
   * Cố ý loại `IV + IP`: hai dòng đó là tiền GIỮ HỘ hãng bảo hiểm (ADR 0033 điều 4). XePrime vẫn
   * phải chuyển đủ phí bảo hiểm cho đối tác dù nó có giảm giá cho khách hay không, nên một mã ăn
   * vào phần đó là nền tảng thu thiếu tiền của người khác. `D` thì tài trợ được: quyền lợi của
   * chủ xe không đổi, nền tảng chỉ bù phần chênh từ tiền của mình.
   */
  sponsorableAmount: string;
  /** `fee_policies.hold_min_amount` — sàn một lần chuyển khoản đáng công đối soát. */
  holdMinAmount: string;
}

export type PromoDiscountResult =
  | { ok: true; discountAmount: string; /** Đã bị kẹp bởi một trần nào đó. */ clamped: boolean }
  | { ok: false; reason: PromoIneligibleReason };

/**
 * Số giảm của MỘT mã trên MỘT chuyến — hàm THUẦN, là nơi DUY NHẤT trong hệ thống tính con số
 * này (api khi xem trước/gửi/chốt giá, web+mobile chỉ hiển thị lại).
 *
 * Bốn trần, áp theo đúng thứ tự:
 *
 *  1. **Trần của chính mã** — `maxDiscountAmount` với mã phần trăm.
 *  2. **Tiền thuê đủ điều kiện** — không ai được giảm nhiều hơn thứ đang được giảm.
 *  3. **`grossOnline − holdMinAmount`** — phần XePrime thật sự cầm, trừ đi sàn đối soát.
 *  4. **`sponsorableAmount` (`D + S`)** — phần tài trợ được, không lấn vào tiền giữ hộ bảo hiểm.
 *
 * Ba trần cuối có thể làm mã thành vô dụng, và khi chúng về 0 thì hàm trả
 * `DISCOUNT_BELOW_FLOOR` thay vì trả `0` — một mã "giảm 0đ" là một nút bấm được mà không có tác
 * dụng, đúng thứ giao diện không được phép hiện.
 */
export function computePromoDiscount(input: PromoDiscountInput): PromoDiscountResult {
  const eligible = Number(input.eligibleAmount);
  if (!Number.isFinite(eligible) || eligible < 0) {
    return { ok: false, reason: PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET };
  }
  if (eligible < Number(input.terms.minOrderAmount)) {
    return { ok: false, reason: PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET };
  }

  const gross = Number(input.grossOnlineAmount ?? 0);
  if (!(gross > 0)) return { ok: false, reason: PROMO_INELIGIBLE_REASON.NO_ONLINE_PAYMENT };

  const raw =
    input.terms.discountType === PROMO_DISCOUNT_TYPE.FIXED
      ? Number(input.terms.discountAmount ?? 0)
      : roundHalfUp((eligible * (input.terms.discountPercent ?? 0)) / 100);
  if (!(raw > 0)) return { ok: false, reason: PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR };

  const percentCap =
    input.terms.discountType === PROMO_DISCOUNT_TYPE.PERCENT &&
    input.terms.maxDiscountAmount != null
      ? Number(input.terms.maxDiscountAmount)
      : Number.POSITIVE_INFINITY;

  const onlineCap = gross - Number(input.holdMinAmount);
  const sponsorCap = Number(input.sponsorableAmount);
  if (!(onlineCap > 0) || !(sponsorCap > 0)) {
    return { ok: false, reason: PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR };
  }

  const applied = Math.min(raw, percentCap, eligible, onlineCap, sponsorCap);
  if (!(applied > 0)) return { ok: false, reason: PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR };

  return { ok: true, discountAmount: String(applied), clamped: applied < raw };
}

/**
 * Điều kiện KHÔNG phụ thuộc tiền — dịch vụ, loại xe, khu vực. Tách khỏi
 * {@link computePromoDiscount} vì chúng kiểm được TRƯỚC khi có báo giá, và vì danh sách mã khả
 * dụng cần nói "không áp dụng cho dịch vụ này" mà không phải dựng một báo giá cho từng mã.
 */
export function promoScopeMismatch(
  terms: Pick<PromoCodeTerms, 'vehicleScope' | 'serviceScope' | 'provinceCodes'>,
  trip: { vehicleType: VehicleType | null; serviceType: ServiceType; provinceCode: string | null },
): PromoIneligibleReason | null {
  if (
    terms.vehicleScope !== PROMO_VEHICLE_SCOPE.ALL &&
    trip.vehicleType != null &&
    terms.vehicleScope !== trip.vehicleType
  ) {
    return PROMO_INELIGIBLE_REASON.VEHICLE_SCOPE_MISMATCH;
  }
  if (terms.serviceScope.length > 0 && !terms.serviceScope.includes(trip.serviceType)) {
    return PROMO_INELIGIBLE_REASON.SERVICE_SCOPE_MISMATCH;
  }
  /*
   * Chuyến chưa biết tỉnh (xe chưa gắn mã hành chính) KHÔNG bị loại: mã giới hạn khu vực là để
   * nhắm một vùng, không phải để phạt một chiếc xe thiếu dữ liệu danh mục. Cửa chặn thật vẫn ở
   * lúc chốt giá, khi đơn đã có địa chỉ.
   */
  if (
    terms.provinceCodes.length > 0 &&
    trip.provinceCode != null &&
    !terms.provinceCodes.includes(trip.provinceCode)
  ) {
    return PROMO_INELIGIBLE_REASON.PROVINCE_MISMATCH;
  }
  return null;
}

/** Bộ điều kiện mặc định khi admin chọn "tất cả" ở mọi phạm vi — dùng cho form và seed. */
export const PROMO_SCOPE_ALL: Pick<
  PromoCodeTerms,
  'audience' | 'vehicleScope' | 'serviceScope' | 'provinceCodes'
> = {
  audience: PROMO_AUDIENCE.ALL,
  vehicleScope: PROMO_VEHICLE_SCOPE.ALL,
  serviceScope: [],
  provinceCodes: [],
};

/**
 * KHOÁ NHẬN DIỆN một chuyến cho mục đích áp mã — thay đổi là phải XÁC MINH LẠI mã (ADR 0046).
 *
 * Ở `@xeprime/types` vì cả web và app native đều giữ một hook trạng thái mã riêng (ADR 0031: mỗi
 * app một tầng gọi API), và cả hai phải theo dõi ĐÚNG cùng một tập trường. Một bên canh 7 trường
 * còn bên kia canh 5 là một bên sẽ âm thầm giữ số giảm của chuyến CŨ — đúng loại lệch mà người
 * dùng chỉ phát hiện ra khi con số trên màn hình không khớp mã QR.
 *
 * Mọi trường ở đây đều ĐỔI ĐƯỢC số giảm: thời gian và gói đổi tiền thuê, dịch vụ và lộ trình đổi
 * cả giá lẫn tư cách theo phạm vi mã, lựa chọn bảo hiểm đổi khoản online (mẫu số của trần tài trợ).
 */
export function promoTripKey(trip: {
  vehicleId: string;
  serviceType?: string | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  packageMonths?: number | null;
  routeType?: string | null;
  personalAccidentSelected?: boolean | null;
}): string {
  return [
    trip.vehicleId,
    trip.serviceType ?? '',
    trip.pickupAt ?? '',
    trip.returnAt ?? '',
    trip.packageMonths ?? '',
    trip.routeType ?? '',
    trip.personalAccidentSelected ? '1' : '0',
  ].join('|');
}

/** Dịch vụ mã khuyến mãi áp được — dùng cho ô chọn trong form admin. */
export const PROMO_SERVICE_SCOPE_OPTIONS: ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
];
