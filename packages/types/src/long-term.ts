/**
 * Thuê dài hạn — **gói cố định theo THÁNG LỊCH** (chốt 18/08, xem ADR 0011).
 *
 * Mô hình cũ (khách tự chọn khoảng ngày, sàn 7 ngày, giá = giá tháng ÷ 30, badge "tiết kiệm
 * so với giá ngày") đã bị thay hoàn toàn:
 *
 *   1. Khách chọn MỘT gói trong {@link LONG_TERM_PACKAGE_MONTHS} — không có thời lượng tuỳ ý.
 *   2. Khách nêu **nguyện vọng** ngày nhận ({@link PICKUP_PREFERENCE}), không chọn ngày trả.
 *   3. Gian hàng chốt ngày/giờ nhận CHÍNH XÁC lúc duyệt; server tính ngày trả bằng
 *      {@link addCalendarMonthsVn} — cộng tháng lịch, kẹp về ngày cuối tháng khi tháng đích
 *      không có ngày tương ứng (31/01 + 1 tháng → 28 hoặc 29/02).
 *
 * Mọi phép cộng tháng và mọi mốc ưu đãi đều đi qua file này — **không** nhân 30 ngày ở đâu nữa.
 * Tiền ở đây là string VND (ADR 0007); các helper preview chỉ để HIỂN THỊ, con số chốt luôn do
 * PricingService trả về.
 */

/** Múi giờ nghiệp vụ Asia/Ho_Chi_Minh — UTC+7 cố định, không DST. */
export const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Gói thuê
// ---------------------------------------------------------------------------

/** Sáu gói thuê dài hạn được phép — nguồn DUY NHẤT cho cả FE, BE, DTO và CHECK constraint. */
export const LONG_TERM_PACKAGE_MONTHS = [1, 2, 3, 6, 9, 12] as const;

export type LongTermPackageMonths = (typeof LONG_TERM_PACKAGE_MONTHS)[number];

/** Mảng `number` để dùng với `@IsIn` / `oneOf` — cùng nguồn với hằng trên. */
export const LONG_TERM_PACKAGE_MONTHS_VALUES: readonly number[] = LONG_TERM_PACKAGE_MONTHS;

export function isLongTermPackageMonths(value: unknown): value is LongTermPackageMonths {
  return (
    typeof value === 'number' && (LONG_TERM_PACKAGE_MONTHS as readonly number[]).includes(value)
  );
}

/** Nhãn gói: "9 tháng". Một chỗ duy nhất để đổi cách gọi. */
export function longTermPackageLabel(months: number): string {
  return `${months} tháng`;
}

// ---------------------------------------------------------------------------
// Nguyện vọng nhận xe
// ---------------------------------------------------------------------------

/**
 * Khách nêu nguyện vọng nhận xe, KHÔNG chốt lịch: `within_7_days` là một KHOẢNG linh hoạt
 * (không ngầm gán một ngày cụ thể), `specific_date` chỉ thu NGÀY — giờ do gian hàng chốt.
 */
export const PICKUP_PREFERENCE = {
  WITHIN_7_DAYS: 'within_7_days',
  SPECIFIC_DATE: 'specific_date',
} as const;

export type PickupPreference = (typeof PICKUP_PREFERENCE)[keyof typeof PICKUP_PREFERENCE];
export const PICKUP_PREFERENCE_VALUES = Object.values(PICKUP_PREFERENCE) as PickupPreference[];

export const PICKUP_PREFERENCE_LABEL: Readonly<Record<PickupPreference, string>> = {
  [PICKUP_PREFERENCE.WITHIN_7_DAYS]: 'Trong 7 ngày tới',
  [PICKUP_PREFERENCE.SPECIFIC_DATE]: 'Chọn ngày cụ thể',
};

export const PICKUP_PREFERENCE_HINT: Readonly<Record<PickupPreference, string>> = {
  [PICKUP_PREFERENCE.WITHIN_7_DAYS]: 'Gian hàng sẽ xác nhận ngày và giờ nhận xe trong 7 ngày tới.',
  [PICKUP_PREFERENCE.SPECIFIC_DATE]: 'Gian hàng sẽ xác nhận giờ nhận xe.',
};

/** Độ dài khoảng nhận xe linh hoạt (ngày) — từ NGÀY MAI tới hết ngày thứ 7 kể từ hôm gửi. */
export const LONG_TERM_PICKUP_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Ngày tháng theo giờ Việt Nam
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` của một mốc thời gian, theo NGÀY LỊCH Việt Nam. */
export function vnDateKey(at: Date): string {
  return new Date(at.getTime() + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Cộng/trừ ngày trên một khoá `YYYY-MM-DD` (thuần lịch, không đụng giờ). */
export function addDateKeyDays(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Khoảng nhận xe linh hoạt suy từ THỜI ĐIỂM GỬI yêu cầu: bắt đầu từ ngày mai, kết thúc hết
 * ngày thứ {@link LONG_TERM_PICKUP_WINDOW_DAYS} kể từ ngày gửi. Server là nơi tính (client
 * không được tự khai khoảng này), FE chỉ hiển thị lại giá trị server trả về.
 */
export function longTermPickupWindow(submittedAt: Date): { start: string; end: string } {
  const today = vnDateKey(submittedAt);
  return {
    start: addDateKeyDays(today, 1),
    end: addDateKeyDays(today, LONG_TERM_PICKUP_WINDOW_DAYS),
  };
}

/**
 * Cộng THÁNG LỊCH theo giờ Việt Nam, giữ nguyên giờ-phút-giây và **kẹp về ngày cuối tháng**
 * khi tháng đích ngắn hơn.
 *
 *   19/08/2026 10:00 + 9 tháng → 19/05/2027 10:00
 *   31/01/2027 09:00 + 1 tháng → 28/02/2027 09:00 (2028 nhuận → 29/02)
 *
 * Đây là hàm DUY NHẤT được phép suy ngày trả của một gói thuê dài hạn.
 */
export function addCalendarMonthsVn(at: Date, months: number): Date {
  const vn = new Date(at.getTime() + VN_UTC_OFFSET_MS);
  const monthIndex = vn.getUTCMonth() + months;
  const year = vn.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  // Ngày 0 của tháng kế = ngày cuối cùng của tháng đích.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(vn.getUTCDate(), lastDayOfTargetMonth);
  const shifted = Date.UTC(
    year,
    month,
    day,
    vn.getUTCHours(),
    vn.getUTCMinutes(),
    vn.getUTCSeconds(),
    vn.getUTCMilliseconds(),
  );
  return new Date(shifted - VN_UTC_OFFSET_MS);
}

/** Ngày trả của một gói thuê dài hạn — chỉ là {@link addCalendarMonthsVn} đặt tên nghiệp vụ. */
export function longTermReturnAt(pickupAt: Date, packageMonths: number): Date {
  return addCalendarMonthsVn(pickupAt, packageMonths);
}

// ---------------------------------------------------------------------------
// Mốc ưu đãi theo cam kết thời hạn
// ---------------------------------------------------------------------------

/**
 * Một mốc ưu đãi cam kết thời hạn — **canonical theo THÁNG**. Áp lên giá cơ sở của gói
 * (`monthlyPrice × packageMonths`), lấy mốc cao nhất mà gói đạt tới, KHÔNG cộng dồn.
 */
export interface DiscountTier {
  minMonths: LongTermPackageMonths;
  /** 1–100, chỉ áp lên giá cơ sở của gói dài hạn. */
  percent: number;
  note?: string;
}

/**
 * Mốc cũ lưu theo NGÀY còn sót trong `rental_policies.discount_tiers_json` mà migration
 * KHÔNG quy đổi được sang một gói hợp lệ (vd mốc 7 ngày, 14 ngày). Giữ nguyên trong jsonb để
 * không mất dữ liệu cấu hình, **không tham gia tính giá**, và biến mất khi chủ xe lưu lại
 * chính sách (mọi lần ghi mới chỉ ghi shape canonical).
 */
export interface LegacyDiscountTier {
  minDays: number;
  percent: number;
  note?: string;
  legacy: true;
}

/** Số ngày quy ước của một mốc cũ ↔ gói tháng — CHỈ dùng để đọc dữ liệu legacy. */
const LEGACY_DAYS_PER_MONTH = 30;

/**
 * Đọc một phần tử `discount_tiers_json` bất kể đời dữ liệu: shape mới trả thẳng; shape cũ
 * theo ngày chỉ quy đổi khi số ngày khớp CHÍNH XÁC một gói hợp lệ (30/60/90/180/270/360) —
 * mốc không khớp trả `null` để nơi gọi giữ nó ở dạng legacy, không remap ngầm.
 */
export function discountTierFromStored(raw: unknown): DiscountTier | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const percent = typeof row.percent === 'number' ? row.percent : null;
  if (percent == null || !Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
  const note = typeof row.note === 'string' && row.note ? row.note : undefined;

  if (isLongTermPackageMonths(row.minMonths)) {
    return { minMonths: row.minMonths, percent, ...(note ? { note } : {}) };
  }
  if (typeof row.minDays === 'number' && row.minDays % LEGACY_DAYS_PER_MONTH === 0) {
    const months = row.minDays / LEGACY_DAYS_PER_MONTH;
    if (isLongTermPackageMonths(months)) {
      return { minMonths: months, percent, ...(note ? { note } : {}) };
    }
  }
  return null;
}

/** Phần tử jsonb không quy đổi được → giữ nguyên để hiển thị cảnh báo ở màn cấu hình. */
export function legacyDiscountTierFromStored(raw: unknown): LegacyDiscountTier | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (discountTierFromStored(raw)) return null;
  const minDays = typeof row.minDays === 'number' ? row.minDays : null;
  const percent = typeof row.percent === 'number' ? row.percent : null;
  if (minDays == null || percent == null) return null;
  return {
    minDays,
    percent,
    ...(typeof row.note === 'string' && row.note ? { note: row.note } : {}),
    legacy: true,
  };
}

/**
 * Mốc ưu đãi áp cho một gói: mốc có `minMonths` lớn nhất mà `packageMonths` đạt tới.
 * Gói 2 tháng kế thừa mốc 1 tháng; gói 9/12 kế thừa mốc 6 nếu không có mốc cao hơn.
 * Trả `null` khi không mốc nào áp — nơi gọi hiển thị "không ưu đãi", không tự bịa 0%.
 */
export function longTermTierFor(
  tiers: readonly DiscountTier[] | null | undefined,
  packageMonths: number,
): DiscountTier | null {
  if (!tiers?.length) return null;
  return (
    [...tiers]
      .filter((t) => packageMonths >= t.minMonths)
      .sort((a, b) => b.minMonths - a.minMonths)[0] ?? null
  );
}

// ---------------------------------------------------------------------------
// Preview giá gói (HIỂN THỊ — giá chốt luôn từ PricingService)
// ---------------------------------------------------------------------------

/** Con số của một gói thuê dài hạn. Tiền là string VND (ADR 0007). */
export interface LongTermPackageAmounts {
  packageMonths: number;
  /** Giá dài hạn cơ sở cho MỘT tháng. */
  baseMonthlyPrice: string;
  /** `baseMonthlyPrice × packageMonths`. */
  basePackageAmount: string;
  /** % của mốc cam kết đang áp — null = không mốc nào áp. */
  durationDiscountPercent: number | null;
  durationDiscountAmount: string;
  finalPackageAmount: string;
  /** `finalPackageAmount ÷ packageMonths` — giá bình quân mỗi tháng. */
  effectiveMonthlyAmount: string;
}

/**
 * Preview giá một gói cho UI **khi chưa gọi được API** (vd gợi ý giá ở màn cấu hình của chủ
 * xe). Cùng công thức và cùng cách làm tròn (nửa lên, về đồng) với `PricingService`, nhưng
 * KHÔNG phải nguồn giá thật: mọi con số khách nhìn trong luồng đặt xe đều lấy từ server.
 */
export function longTermPackageAmounts(input: {
  monthlyPrice: string | number;
  packageMonths: number;
  tiers?: readonly DiscountTier[] | null;
  discountEnabled?: boolean;
}): LongTermPackageAmounts {
  const monthly = Number(input.monthlyPrice);
  const months = input.packageMonths;
  const basePackage = Math.round(monthly * months);
  const tier = input.discountEnabled === false ? null : longTermTierFor(input.tiers, months);
  const discount = tier ? Math.round((basePackage * tier.percent) / 100) : 0;
  const final = basePackage - discount;
  return {
    packageMonths: months,
    baseMonthlyPrice: String(Math.round(monthly)),
    basePackageAmount: String(basePackage),
    durationDiscountPercent: tier ? tier.percent : null,
    durationDiscountAmount: String(discount),
    finalPackageAmount: String(final),
    effectiveMonthlyAmount: String(Math.round(final / months)),
  };
}
