import { isPositiveMoney } from '@xeprime/domain';
import {
  FEE_LINE,
  INSURANCE_PRODUCT_KIND,
  type InsuranceProductKind,
  type VehicleType,
} from '@xeprime/types';
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
  const fees = quote.breakdown.fees;
  const policy = fees?.policy;
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
    const product = products?.find((p) => p.kind === kind) ?? null;
    /*
     * Vật chất xe theo BẬC giá trị xe (ADR 0088 · ADR 0091) - web `buildInsuranceOffer`. Server quyết
     * và kể lại qua lời chào bán `vehicleProtectionOffer`: chủ xe đặt Bắt buộc ⇒ dòng cố định không bỏ
     * được; Tuỳ chọn ⇒ ô tích, mặc định chưa tích, phí cả chuyến. Sản phẩm bậc mà báo giá không chào
     * ⇒ xe/chuyến chưa đủ điều kiện ⇒ không chào gì (không rơi về ô chọn theo ngày).
     */
    if (
      kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP &&
      (product?.mandatory || fees?.vehicleProtectionOffer || fees?.vehicleProtectionMandatory)
    ) {
      const offer = fees?.vehicleProtectionOffer;
      if (offer && isPositiveMoney(offer.amount)) {
        items.push({
          kind,
          dailyAmount: null,
          mandatory: offer.required,
          tripAmount: offer.amount,
          serviceFeeAmount:
            offer.serviceFeeAmount && isPositiveMoney(offer.serviceFeeAmount)
              ? offer.serviceFeeAmount
              : null,
          product,
        });
      } else if (fees?.vehicleProtectionMandatory) {
        // API trước ADR 0091 (deploy chồng) chưa có lời chào bán - đọc lại dòng `IV` bắt buộc.
        const line = fees.lines.find((l) => l.key === FEE_LINE.VEHICLE_PROTECTION);
        if (line && isPositiveMoney(line.amount)) {
          items.push({
            kind,
            dailyAmount: null,
            mandatory: true,
            tripAmount: line.amount,
            serviceFeeAmount: null,
            product,
          });
        }
      }
      continue;
    }
    if (!quoteOffersInsurance(quote, kind) || !enabled || !daily || !isPositiveMoney(daily)) {
      continue;
    }
    if (products !== undefined && product === null) continue;
    items.push({
      kind,
      dailyAmount: daily,
      mandatory: false,
      tripAmount: null,
      serviceFeeAmount: null,
      product,
    });
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
      item.mandatory === b[i]!.mandatory &&
      item.tripAmount === b[i]!.tripAmount &&
      item.serviceFeeAmount === b[i]!.serviceFeeAmount &&
      item.product === b[i]!.product,
  );
}
