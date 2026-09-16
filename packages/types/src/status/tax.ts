/**
 * Thuế khấu trừ của chuyến — ADR 0032 điều 3, ADR 0028 điều 3–4 (Phase 8).
 *
 * Ba quy tắc sản phẩm, và cả ba là QUY TẮC chứ không phải dữ liệu cấu hình:
 *
 *  1. Thuế tính trên giá trị thuê chịu thuế `B`, **KHÔNG** tính trên bảo hiểm.
 *  2. Thuế do **CHỦ XE** chịu: khấu trừ khỏi khoản XePrime phải trả, **không bao giờ** cộng vào
 *     tổng khách. Bảng kê của khách không có dòng thuế.
 *  3. Chỉ phát sinh khi chuyến **BẮT ĐẦU**. Huỷ trước chuyến ⇒ không có nghĩa vụ nào.
 *
 * ⚠️ Tỷ lệ là **DỮ LIỆU** của từng bản `fee_policies` và phải khớp loại chủ thể
 * (`seller_profiles.entity_type`): cá nhân, hộ kinh doanh và doanh nghiệp có nghĩa vụ khác nhau.
 * Khấu trừ sai là khấu trừ bằng tiền của CHỦ XE, và họ là người bị truy thu — nên
 * `tax_withholdings` chụp cả `seller_profile_id` lẫn `percent` để một kỳ đã khai không bao giờ
 * bị diễn giải lại theo tỷ lệ của hôm nay.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Trạng thái một dòng nghĩa vụ ────────────────────────────────────────────

/**
 * Vòng đời KHAI–NỘP của một dòng thuế.
 *
 * ```text
 *   accrued ──► declared ──► remitted        (đường bình thường)
 *      │            │
 *      └────────────┴──────► reversed        (sửa sai: ghi dòng ĐẢO, không sửa dòng cũ)
 * ```
 *
 * `reversed` không phải "đã xoá": dòng gốc vẫn nằm đó, và một dòng ÂM trỏ về nó giải thích vì
 * sao. Sổ thuế là sổ chỉ-ghi-thêm — sửa `amount` của một dòng đã khai là làm biến mất bằng chứng
 * của con số đã nộp cho cơ quan thuế (ADR 0033 điều 1 cùng kỷ luật với `wallet_entries`).
 */
export const TAX_WITHHOLDING_STATUS = {
  /** Đã khấu trừ khỏi tiền chủ xe, CHƯA kê khai. Tiền còn nằm ở XePrime ⇒ nghĩa vụ giữ hộ. */
  ACCRUED: 'accrued',
  /** Đã kê khai với cơ quan thuế, chưa nộp tiền. Vẫn là nghĩa vụ giữ hộ. */
  DECLARED: 'declared',
  /** Đã NỘP. Tiền rời tài khoản XePrime ⇒ thôi là nghĩa vụ. */
  REMITTED: 'remitted',
  /** Đã bị đảo bằng một dòng âm — cả dòng gốc và dòng đảo đều mang trạng thái này. */
  REVERSED: 'reversed',
} as const;

export type TaxWithholdingStatus =
  (typeof TAX_WITHHOLDING_STATUS)[keyof typeof TAX_WITHHOLDING_STATUS];

export const TAX_WITHHOLDING_STATUS_VALUES = Object.values(
  TAX_WITHHOLDING_STATUS,
) as TaxWithholdingStatus[];

export function isTaxWithholdingStatus(value: unknown): value is TaxWithholdingStatus {
  return (
    typeof value === 'string' && (TAX_WITHHOLDING_STATUS_VALUES as string[]).includes(value)
  );
}

export const TAX_WITHHOLDING_STATUS_META: Readonly<Record<TaxWithholdingStatus, StatusMeta>> = {
  [TAX_WITHHOLDING_STATUS.ACCRUED]: { label: 'Đã khấu trừ, chờ kê khai', color: STATUS_COLOR.WAITING },
  [TAX_WITHHOLDING_STATUS.DECLARED]: { label: 'Đã kê khai', color: STATUS_COLOR.PROCESSING },
  [TAX_WITHHOLDING_STATUS.REMITTED]: { label: 'Đã nộp', color: STATUS_COLOR.SUCCESS },
  [TAX_WITHHOLDING_STATUS.REVERSED]: { label: 'Đã đảo', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Dòng này có còn là NGHĨA VỤ GIỮ HỘ của nền tảng không — vế `custodied.taxAccrued` của đối soát.
 *
 * `accrued`/`declared`: tiền đã khấu trừ khỏi chủ xe nhưng chưa nộp ⇒ XePrime đang giữ tiền của
 * cơ quan thuế. `remitted`: đã nộp, tiền rời tài khoản. `reversed`: dòng gốc và dòng đảo triệt
 * tiêu nhau, không còn nghĩa vụ nào.
 */
export const TAX_WITHHOLDING_STATUS_UNPAID: readonly TaxWithholdingStatus[] = [
  TAX_WITHHOLDING_STATUS.ACCRUED,
  TAX_WITHHOLDING_STATUS.DECLARED,
];

export function isTaxUnpaid(status: TaxWithholdingStatus): boolean {
  return TAX_WITHHOLDING_STATUS_UNPAID.includes(status);
}

/** Chuyển tiếp trạng thái hợp lệ — hàng đợi admin không dựng ra một lựa chọn DB sẽ từ chối. */
export function canTransitionTax(
  from: TaxWithholdingStatus,
  to: TaxWithholdingStatus,
): boolean {
  if (from === to) return false;
  if (from === TAX_WITHHOLDING_STATUS.ACCRUED) {
    return to === TAX_WITHHOLDING_STATUS.DECLARED || to === TAX_WITHHOLDING_STATUS.REVERSED;
  }
  if (from === TAX_WITHHOLDING_STATUS.DECLARED) {
    return to === TAX_WITHHOLDING_STATUS.REMITTED || to === TAX_WITHHOLDING_STATUS.REVERSED;
  }
  // `remitted` và `reversed` là trạng thái CUỐI: tiền đã nộp thì sửa bằng dòng đảo, không đi lùi.
  return false;
}

// ── Kỳ thuế ─────────────────────────────────────────────────────────────────

/** Dạng khoá kỳ: `YYYY-MM`. Kỳ thuế Việt Nam theo THÁNG, và luôn theo giờ Việt Nam. */
export const TAX_PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isTaxPeriodKey(value: unknown): value is string {
  return typeof value === 'string' && TAX_PERIOD_KEY_PATTERN.test(value);
}

/**
 * Kỳ thuế của một mốc thời gian — `YYYY-MM` theo GIỜ VIỆT NAM (UTC+7, không DST).
 *
 * Vì sao không dùng `getUTCMonth()`: một chuyến bắt đầu 23:30 ngày 31/03 giờ Việt Nam là
 * 16:30 ngày 31/03 UTC — cùng tháng, không sao. Nhưng 06:30 ngày 01/04 giờ VN là 23:30 ngày
 * 31/03 UTC, và `getUTCMonth()` sẽ xếp nó vào kỳ THÁNG 3. Mỗi tháng có một khoảng bảy giờ mà
 * hai cách tính cho hai kỳ khác nhau; ở đó tờ khai sẽ thiếu hoặc thừa những chuyến đó.
 *
 * Hàm THUẦN, dùng chung api/web/worker — không có bản thứ hai để trôi khỏi nhau.
 */
export function taxPeriodKeyVn(at: Date): string {
  const vn = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  const year = vn.getUTCFullYear();
  const month = String(vn.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Khoảng UTC `[start, end)` của một kỳ `YYYY-MM` theo giờ Việt Nam. */
export function taxPeriodRangeVn(periodKey: string): { start: Date; end: Date } {
  if (!isTaxPeriodKey(periodKey)) {
    throw new Error(`Kỳ thuế không hợp lệ: ${periodKey}`);
  }
  const [year, month] = periodKey.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1, 1) - 7 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month % 12, 1) - 7 * 60 * 60 * 1000);
  return { start, end };
}
