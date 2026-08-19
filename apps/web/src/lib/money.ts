import type { MoneyString } from '@xeprime/types';

export const CURRENCY_SUFFIX = '₫';

/**
 * Dấu phân tách theo ngôn ngữ — `vi-VN` dùng `.` cho nhóm và `,` cho thập phân, `en-US` ngược
 * lại. Suy ra từ `Intl` ở `useAppFormat`, KHÔNG gõ tay ở đây: file này không biết locale, nó
 * chỉ biết chèn ký tự vào đúng chỗ.
 */
export interface MoneySeparators {
  readonly group: string;
  readonly decimal: string;
}

/**
 * Format tiền để HIỂN THỊ, không parse sang `number` — ADR 0007.
 *
 * `Number('12345678901234.56')` mất chính xác; cộng nhiều khoản bằng float thì sai lệch
 * tích luỹ. Ở đây chỉ chèn dấu phân cách nhóm vào chuỗi, không đụng tới giá trị — nên đổi
 * ngôn ngữ chỉ đổi KÝ TỰ ngăn cách, con số vẫn nguyên vẹn từng chữ số một.
 *
 * `Intl.NumberFormat` cố ý KHÔNG dùng ở đây vì nó buộc phải nhận `number`.
 */
export function formatMoneyVnd(
  value: MoneyString | null | undefined,
  separators: MoneySeparators,
  emptyPlaceholder: string,
): string {
  if (value === null || value === undefined || value === '') {
    return emptyPlaceholder;
  }

  const [integerPart = '0', fractionPart] = value.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separators.group);
  const hasFraction = Boolean(fractionPart) && Number(fractionPart) !== 0;

  return hasFraction
    ? `${grouped}${separators.decimal}${fractionPart} ${CURRENCY_SUFFIX}`
    : `${grouped} ${CURRENCY_SUFFIX}`;
}

/**
 * Quy một chuỗi tiền về **số nguyên đơn vị xu** dạng `bigint`.
 *
 * Cột tiền là `Decimal(14,2)` nên hai chữ số thập phân là đủ và không bao giờ mất chính xác —
 * khác hẳn `Number(value)`, thứ ADR 0007 cấm vì float làm sai lệch từ 2^53 trở lên.
 */
function toCents(value: MoneyString): bigint {
  const negative = value.trim().startsWith('-');
  const [integerPart = '0', fractionPart = ''] = value.trim().replace('-', '').split('.');
  const cents = BigInt(integerPart) * 100n + BigInt(fractionPart.padEnd(2, '0').slice(0, 2));
  return negative ? -cents : cents;
}

function fromCents(cents: bigint): MoneyString {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const fraction = absolute % 100n;
  const integer = absolute / 100n;
  const body = fraction === 0n ? `${integer}` : `${integer}.${String(fraction).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Hiệu hai số tiền, tính **hoàn toàn trên số nguyên** (`bigint` đơn vị xu).
 *
 * Lãi/lỗ = thu − chi là phép tính tiền thật sự, không phải ước lượng hiển thị: nó không được
 * đi qua `Number` (ADR 0007). Rỗng/null coi như 0 để một vế thiếu không nuốt cả kết quả.
 */
export function subtractMoney(
  minuend: MoneyString | null | undefined,
  subtrahend: MoneyString | null | undefined,
): MoneyString {
  return fromCents(toCents(minuend || '0') - toCents(subtrahend || '0'));
}

/** Số tiền có âm không — đọc trên chuỗi, cùng lý do như `isZeroMoney`. */
export function isNegativeMoney(value: MoneyString | null | undefined): boolean {
  return Boolean(value) && toCents(value as MoneyString) < 0n;
}

/**
 * Trị tuyệt đối của số tiền — dùng khi **nhãn đã mang dấu** ("Lỗ luỹ kế", "Còn nợ").
 * Hiện cả nhãn "Lỗ" lẫn dấu trừ là phủ định hai lần.
 */
export function absoluteMoney(value: MoneyString | null | undefined): MoneyString | null {
  if (value === null || value === undefined || value === '') return null;
  return fromCents(toCents(value) < 0n ? -toCents(value) : toCents(value));
}

/** Bậc rút gọn của một số tiền. Hậu tố là CHỮ nên nằm ở message, không nằm ở đây. */
export type MoneyCompactUnit = 'billion' | 'million' | 'thousand';

export interface CompactMoneyParts {
  /** Con số đã rút gọn, đã chèn dấu thập phân theo ngôn ngữ: `12,7` (vi) · `12.7` (en). */
  readonly value: string;
  readonly unit: MoneyCompactUnit;
}

/**
 * Rút gọn tiền cho chỗ HẸP (một dòng trên thẻ mobile): `12.750.000` → `12,7` + bậc `million`.
 *
 * Trả về PHẦN, không phải câu: hậu tố (`tr` / `M`) là chữ theo ngôn ngữ nên do message ghép.
 * `null` = số quá nhỏ để rút gọn ⇒ nơi gọi hiện dạng đầy đủ.
 *
 * Chỉ dùng khi bề rộng thật sự không chứa nổi con số đầy đủ — Figma `186:2417` là trường hợp
 * đó. Mọi chỗ còn lại dùng dạng đầy đủ vì rút gọn là **làm mất thông tin**.
 */
export function compactMoneyParts(
  value: MoneyString,
  separators: MoneySeparators,
): CompactMoneyParts | null {
  const cents = toCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const sign = negative ? '-' : '';

  // Ngưỡng theo cách người Việt đọc số tiền: nghìn → triệu → tỷ. Bậc en dùng cùng ngưỡng
  // (K/M/B trùng khớp 10^3/10^6/10^9), nên không có hai bảng ngưỡng để lệch nhau.
  const UNITS = [
    { scale: 100_000_000_000n, unit: 'billion' },
    { scale: 100_000_000n, unit: 'million' },
    { scale: 100_000n, unit: 'thousand' },
  ] as const;

  for (const { scale, unit } of UNITS) {
    if (absolute >= scale) {
      const whole = absolute / scale;
      const tenth = (absolute % scale) / (scale / 10n);
      const decimals = whole >= 100n || tenth === 0n ? '' : `${separators.decimal}${tenth}`;
      return { value: `${sign}${whole}${decimals}`, unit };
    }
  }

  return null;
}

/** Số tiền còn lại sau khi bỏ phần lẻ — dùng cho nhánh "quá nhỏ để rút gọn". */
export function wholeUnits(value: MoneyString): MoneyString {
  const cents = toCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}`;
}

/**
 * Số tiền có bằng 0 không, kiểm tra TRÊN CHUỖI — `Number(value) === 0` là đúng thứ ADR 0007
 * cấm (mất chính xác với số lớn). Dùng để quyết định tô đậm "còn nợ", ẩn dòng phí bằng 0…
 * Rỗng/null coi như 0.
 */
export function isZeroMoney(value: MoneyString | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  return /^-?0*(\.0*)?$/.test(value.trim());
}

/**
 * Preview giá sau khuyến mãi ở client (thẻ xe/trang chi tiết/manage). PricingService
 * chốt báo giá bằng cùng công thức; helper này không dùng để cộng dồn kế toán.
 * Giá thuê VND là số nguyên ≤ 14 chữ số nên `Number` ở đây không mất chính xác (ADR 0007).
 */
export function applyDiscountPercent(
  value: MoneyString | null | undefined,
  percent: number | null | undefined,
): MoneyString | null {
  if (value == null || value === '') return null;
  if (!percent || percent <= 0 || percent > 100) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.round((n * (100 - percent)) / 100));
}
