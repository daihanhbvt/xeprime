import { isZeroMoney } from '@xeprime/domain';
import { FEE_BEARER } from '@xeprime/types';

/**
 * Luật HIỂN THỊ của một bảng giá phía khách — bản native của `lib/customer-price-view` bên web
 * (develop). Chỉ CHỌN dòng, không cộng trừ; so tiền trên CHUỖI (ADR 0007).
 */

interface PriceRowLike {
  key: string;
  amount: string;
}

interface FeeLineLike {
  bearer: string;
  amount: string;
}

/** Bỏ dòng 0đ và các khoá nơi gọi không muốn (vd tổng phụ) — chỉ khỏi màn hình, không khỏi dữ liệu. */
export function visiblePriceRows<T extends PriceRowLike>(
  rows: readonly T[],
  skipKeys: readonly string[] = [],
): T[] {
  return rows.filter((row) => !isZeroMoney(row.amount) && !skipKeys.includes(row.key));
}

/** Dòng phụ phí đáng vẽ — dòng CHỦ XE chịu (thuế khấu trừ, ADR 0032 điều 3) chỉ chủ xe thấy. */
export function visibleFeeLines<T extends FeeLineLike>(
  lines: readonly T[],
  audience: 'customer' | 'owner',
): T[] {
  return lines.filter(
    (line) =>
      (audience === 'owner' || line.bearer !== FEE_BEARER.OWNER) && !isZeroMoney(line.amount),
  );
}

/**
 * Con số CUỐI của một báo giá và tên của nó — `subtotal` (còn tạm tính) · `customerTotal` (có phụ
 * phí phía khách hoặc mã: "Tổng bạn trả", ADR 0028 điều 3) · `total` (chỉ tiền thuê).
 */
export function customerTotalView(breakdown: {
  estimateNote?: string | null;
  totalAmount: string;
  fees?: {
    lines?: readonly FeeLineLike[] | null;
    customerTotalAmount: string;
    promoDiscountAmount?: string | null;
  } | null;
}): { kind: 'subtotal' | 'customerTotal' | 'total'; amount: string } {
  const fees = breakdown.fees ?? null;
  const hasFees =
    fees !== null &&
    (visibleFeeLines(fees.lines ?? [], 'customer').length > 0 ||
      !isZeroMoney(fees.promoDiscountAmount ?? '0'));
  return {
    kind: breakdown.estimateNote ? 'subtotal' : hasFees ? 'customerTotal' : 'total',
    amount: fees?.customerTotalAmount ?? breakdown.totalAmount,
  };
}
