import { FEE_BEARER, FEE_LINE, type MoneyString } from '@xeprime/types';
import { isZeroMoney, sumMoney } from './money';

/**
 * Dòng phụ phí KHÁCH thấy - MỘT nguồn cho web và app native (ADR 0091 điều 3). Chỉ CHỌN và GỘP
 * dòng, so tiền trên CHUỖI (ADR 0007).
 */

interface FeeLineLike {
  bearer: string;
  amount: string;
}

/**
 * Dòng phụ phí đáng vẽ cho người đọc. Dòng do CHỦ XE chịu (thuế khấu trừ - ADR 0032 điều 3) không
 * cộng vào tổng khách, nên với khách nó chỉ là một con số lạ giữa hoá đơn của họ: chỉ chủ xe thấy.
 */
export function visibleFeeLines<T extends FeeLineLike>(
  lines: readonly T[],
  audience: 'customer' | 'owner',
): T[] {
  return lines.filter(
    (line) =>
      (audience === 'owner' || line.bearer !== FEE_BEARER.OWNER) && !isZeroMoney(line.amount),
  );
}

interface MergeableFeeLine extends FeeLineLike {
  key: string;
  percent?: number | null;
  unitAmount?: string | null;
  quantity?: number | null;
}

/** Hai số đã GỘP vào dòng bảo hiểm vật chất xe của khách - dấu ⓘ tách chúng ra (ADR 0091 điều 3). */
export interface IncludedInsuranceServiceFee {
  /** Phí bảo hiểm `IV` - tiền của hãng bảo hiểm. */
  premiumAmount: MoneyString;
  /** Phí thu hộ `X` - doanh thu XePrime, hoàn cùng `IV`. */
  serviceFeeAmount: MoneyString;
  serviceFeePercent: number | null;
}

export type CustomerFeeLine<T> = T & { includedServiceFee?: IncludedInsuranceServiceFee };

/**
 * Dòng phụ phí KHÁCH thấy: như `visibleFeeLines(…, 'customer')`, rồi GỘP phí thu hộ bảo hiểm `X`
 * vào dòng bảo hiểm vật chất xe `IV`. Khách đọc MỘT khoản "Bảo hiểm vật chất xe" bằng `IV + X`; dấu
 * ⓘ của dòng đó tách hai số. Dữ liệu, sổ và bề mặt đối tác/quản trị luôn giữ hai dòng.
 *
 * Dòng gộp bỏ cách tính "N ngày × đơn giá" của `IV`: phép nhân đó không còn ra đúng số đang hiện.
 * `X` không có `IV` đi kèm thì giữ nguyên thành dòng riêng - không bao giờ giấu một khoản khách trả.
 */
export function customerFeeLines<T extends MergeableFeeLine>(
  lines: readonly T[],
): CustomerFeeLine<T>[] {
  const visible = visibleFeeLines(lines, 'customer');
  const serviceFee = visible.find((line) => line.key === FEE_LINE.INSURANCE_SERVICE_FEE);
  const protection = visible.find((line) => line.key === FEE_LINE.VEHICLE_PROTECTION);
  if (!serviceFee || !protection) return visible;
  const merged: CustomerFeeLine<T> = {
    ...protection,
    amount: sumMoney([protection.amount, serviceFee.amount]),
    percent: null,
    unitAmount: null,
    quantity: null,
    includedServiceFee: {
      premiumAmount: protection.amount,
      serviceFeeAmount: serviceFee.amount,
      serviceFeePercent: serviceFee.percent ?? null,
    },
  };
  return visible
    .filter((line) => line !== serviceFee)
    .map((line) => (line === protection ? merged : line));
}
