import { insuranceCoverageItems, sumMoney } from '@xeprime/domain';
import type { InsuranceOfferItem, PublicInsuranceProduct } from './types';

/**
 * Số tiền khách thấy cho MỘT lựa chọn bảo hiểm - phí cả chuyến (gộp phí thu hộ, ⓘ tách hai số -
 * ADR 0091 điều 3) hoặc phí mỗi ngày. `null` khi lựa chọn không có giá (không xảy ra với dữ liệu
 * `insuranceOfferItems` trả, giữ để người gọi không phải đoán).
 */
export function insuranceOfferPrice(
  item: InsuranceOfferItem,
): { amount: string; basis: 'trip' | 'daily' } | null {
  if (item.tripAmount) {
    return {
      amount: item.serviceFeeAmount
        ? sumMoney([item.tripAmount, item.serviceFeeAmount])
        : item.tripAmount,
      basis: 'trip',
    };
  }
  if (item.dailyAmount) return { amount: item.dailyAmount, basis: 'daily' };
  return null;
}

/** Bản dịch đang dùng của một cặp trường vi/en - cùng quy ước với `useLocalizedText`. */
type Localize = (
  vi: string | null | undefined,
  en: string | null | undefined,
) => string | null | undefined;

/**
 * Các mục phạm vi bảo vệ (mỗi dòng của `coverage*` một mục) và dòng mô tả ngắn dưới tên sản phẩm:
 * admin đặt riêng thì dùng, không thì ghép từ các mục.
 */
export function insuranceProductCopy(product: PublicInsuranceProduct, localized: Localize) {
  const coverage = insuranceCoverageItems(localized(product.coverageVi, product.coverageEn));
  const summary =
    localized(product.summaryVi ?? null, product.summaryEn ?? null)?.trim() || coverage.join(', ');
  return { coverage, summary };
}
