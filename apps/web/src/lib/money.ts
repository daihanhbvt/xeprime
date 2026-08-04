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
