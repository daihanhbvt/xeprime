import type { MoneyString } from '@xeprime/types';

const CURRENCY_SUFFIX = '₫';
const EMPTY_PLACEHOLDER = '—';

/**
 * Format tiền để HIỂN THỊ, không parse sang `number` — ADR 0007.
 *
 * `Number('12345678901234.56')` mất chính xác; cộng nhiều khoản bằng float thì sai lệch
 * tích luỹ. Ở đây chỉ chèn dấu phân cách nhóm vào chuỗi, không đụng tới giá trị.
 */
export function formatMoneyVnd(value: MoneyString | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY_PLACEHOLDER;
  }

  const [integerPart = '0', fractionPart] = value.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hasFraction = Boolean(fractionPart) && Number(fractionPart) !== 0;

  return hasFraction
    ? `${grouped},${fractionPart} ${CURRENCY_SUFFIX}`
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

/**
 * Rút gọn tiền cho chỗ HẸP (một dòng trên thẻ mobile): `12.750.000` → `12,7tr`.
 *
 * Chỉ dùng khi bề rộng thật sự không chứa nổi con số đầy đủ — Figma `186:2417` là trường hợp
 * đó. Mọi chỗ còn lại dùng `formatMoneyVnd` vì rút gọn là **làm mất thông tin**.
 */
export function formatMoneyCompactVnd(value: MoneyString | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY_PLACEHOLDER;

  const cents = toCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const sign = negative ? '-' : '';

  // Ngưỡng theo cách người Việt đọc số tiền: nghìn → triệu → tỷ.
  const UNITS = [
    { scale: 100_000_000_000n, suffix: 'tỷ' },
    { scale: 100_000_000n, suffix: 'tr' },
    { scale: 100_000n, suffix: 'k' },
  ] as const;

  for (const { scale, suffix } of UNITS) {
    if (absolute >= scale) {
      const whole = absolute / scale;
      const tenth = (absolute % scale) / (scale / 10n);
      const decimals = whole >= 100n || tenth === 0n ? '' : `,${tenth}`;
      return `${sign}${whole}${decimals}${suffix}`;
    }
  }

  return `${sign}${absolute / 100n} ${CURRENCY_SUFFIX}`;
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
 * Giá SAU giảm để HIỂN THỊ marketing (thẻ xe/trang chi tiết) — không phải số tiền chốt của
 * đơn (giá thật do shop quyết khi duyệt yêu cầu). Giá thuê VND là số nguyên ≤ 14 chữ số nên
 * `Number` ở đây không mất chính xác; không dùng cho cộng dồn kế toán (ADR 0007).
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
