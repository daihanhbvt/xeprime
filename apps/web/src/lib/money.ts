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
