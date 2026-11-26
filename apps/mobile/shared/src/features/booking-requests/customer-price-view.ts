import { isZeroMoney, visibleFeeLines } from '@xeprime/domain';

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

// Chọn/gộp dòng phụ phí phía khách: MỘT nguồn ở `@xeprime/domain` cho web và app (ADR 0091 điều 3).
export {
  customerFeeLines,
  visibleFeeLines,
  type CustomerFeeLine,
  type IncludedInsuranceServiceFee,
} from '@xeprime/domain';

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
