import { isPositiveMoney } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND, type InsuranceProductKind, type VehicleType } from '@xeprime/types';
import type { PublicQuote } from '@/api/marketplace/api';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '@/api/insurance/api';

/**
 * Bản native của `apps/web/src/features/insurance/offer.ts` — hàm THUẦN quyết định ô bảo hiểm nào
 * được chào (ADR 0064). Hai bản không tự đồng bộ: đổi điều kiện ở web thì đổi ở đây.
 */

/** Thứ tự hiển thị cố định: vật chất xe trước, tai nạn người sau. */
const KINDS: readonly InsuranceProductKind[] = [
  INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
];

/**
 * Báo giá có nói nền tảng ĐANG bán sản phẩm này không — cờ chung (`insuranceOffered`) VÀ cờ theo
 * TỪNG sản phẩm, cùng cổng server dùng để thu. So `=== true`: báo giá thiếu trường (API cũ) bị coi
 * là KHÔNG bán — hiện ô chọn cho thứ server sẽ không thu là hứa một hợp đồng không có.
 */
function quoteOffersInsurance(quote: PublicQuote, kind: InsuranceProductKind): boolean {
  if (quote.insuranceOffered !== true) return false;
  const byKind = quote.insuranceOfferedByKind;
  return kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
    ? byKind?.vehicleProtection === true
    : byKind?.tripInsurance === true;
}

/**
 * Các lựa chọn bảo hiểm ĐANG được chào cho một báo giá. Một lựa chọn hiện khi đủ BỐN điều: nền tảng
 * bán sản phẩm đó · chính sách phí mở dòng đó · biểu phí ngày cho loại xe > 0 · admin không tắt sản
 * phẩm trong danh mục (`products === undefined` — đang tải/lỗi — thì không chặn, chỉ thiếu quyền lợi).
 *
 * `null` khi chưa có báo giá: "chưa biết" khác "không bán".
 */
export function insuranceOfferItems(
  quote: PublicQuote | null | undefined,
  vehicleType: VehicleType,
  products: readonly PublicInsuranceProduct[] | undefined,
): InsuranceOfferItem[] | null {
  if (!quote) return null;
  const policy = quote.breakdown.fees?.policy;
  if (!policy) return [];

  const config: Record<InsuranceProductKind, { enabled: boolean; daily: string | undefined }> = {
    [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: {
      enabled: policy.vehicleProtectionEnabled,
      daily: policy.vehicleProtectionDailyAmount?.[vehicleType],
    },
    [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: {
      enabled: policy.tripInsuranceEnabled,
      daily: policy.tripInsuranceDailyAmount?.[vehicleType],
    },
  };

  const items: InsuranceOfferItem[] = [];
  for (const kind of KINDS) {
    const { enabled, daily } = config[kind];
    if (!quoteOffersInsurance(quote, kind) || !enabled || !daily || !isPositiveMoney(daily)) {
      continue;
    }
    const product = products?.find((p) => p.kind === kind) ?? null;
    if (products !== undefined && product === null) continue;
    items.push({ kind, dailyAmount: daily, product });
  }
  return items;
}

/** So hai kết quả theo nội dung — tránh vòng render khi báo giá mới mang đúng các lựa chọn cũ. */
export function sameOfferItems(
  a: readonly InsuranceOfferItem[] | null,
  b: readonly InsuranceOfferItem[] | null,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.kind === b[i]!.kind &&
      item.dailyAmount === b[i]!.dailyAmount &&
      item.product === b[i]!.product,
  );
}
