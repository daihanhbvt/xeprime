import {
  FEE_LINE,
  INSURANCE_PRODUCT_KIND,
  type InsuranceProductKind,
  type VehicleType,
} from '@xeprime/types';
import { isPositiveMoney } from '@/lib/money';
import type { PublicQuote } from '@/features/rental-policies/types';
import type { InsuranceOfferItem, PublicInsuranceProduct } from './types';

/** Thứ tự hiển thị cố định: vật chất xe trước, tai nạn người sau. */
const KINDS: readonly InsuranceProductKind[] = [
  INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
];

/**
 * Báo giá có nói nền tảng ĐANG bán sản phẩm bảo hiểm này không (ADR 0064) — cờ chung
 * (`insuranceOffered`) VÀ cờ theo TỪNG sản phẩm (`insuranceOfferedByKind`), cùng cổng server dùng
 * để thu. So `=== true` chứ không truthy: một báo giá thiếu trường (API cũ trong lúc deploy chồng)
 * bị coi là KHÔNG bán, vì hiện ô chọn cho một thứ server sẽ không thu là hứa với khách một hợp
 * đồng không có.
 */
function quoteOffersInsurance(quote: PublicQuote, kind: InsuranceProductKind): boolean {
  if (quote.insuranceOffered !== true) return false;
  const byKind = quote.insuranceOfferedByKind;
  return kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
    ? byKind?.vehicleProtection === true
    : byKind?.tripInsurance === true;
}

/**
 * Các lựa chọn bảo hiểm ĐANG được chào cho một báo giá — hàm thuần, nguồn duy nhất của hai ô chọn
 * ở trang xe và hộp gửi yêu cầu.
 *
 * Một lựa chọn hiện khi đủ BỐN điều, theo thứ tự quyền quyết định:
 *   1. nền tảng bán sản phẩm đó — có đối tác phát hành VÀ sản phẩm đang bật
 *      (`quote.insuranceOffered` + `quote.insuranceOfferedByKind`, cùng cổng server dùng để thu);
 *   2. chính sách phí đang mở dòng đó (`policy.*Enabled`);
 *   3. biểu phí ngày cho loại xe này > 0 (phí lấy từ CHÍNH báo giá, không viết cứng);
 *   4. admin không tắt sản phẩm trong danh mục — `products === undefined` (đang tải / lỗi) thì
 *      không chặn, chỉ thiếu phần quyền lợi.
 *
 * Trả `null` khi chưa có báo giá: "chưa biết" khác "không bán" — người gọi giữ kết quả lần trước
 * thay vì nháy ẩn hai ô chọn mỗi lần báo giá tải lại.
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
    const product = products?.find((p) => p.kind === kind) ?? null;
    /*
     * Vật chất xe theo BẬC giá trị xe (ADR 0088) — BẮT BUỘC với xe đủ điều kiện. Server quyết và
     * đã cộng dòng `IV` vào báo giá; ở đây chỉ kể lại. Sản phẩm bậc mà báo giá không có dòng đó ⇒
     * xe/chuyến chưa đủ điều kiện ⇒ không chào gì (không rơi về ô chọn theo ngày).
     */
    if (
      kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP &&
      (product?.mandatory || fees?.vehicleProtectionMandatory)
    ) {
      const line = fees?.lines.find((l) => l.key === FEE_LINE.VEHICLE_PROTECTION);
      if (fees?.vehicleProtectionMandatory && line && isPositiveMoney(line.amount)) {
        items.push({ kind, dailyAmount: null, mandatory: true, tripAmount: line.amount, product });
      }
      continue;
    }
    const { enabled, daily } = config[kind];
    if (!quoteOffersInsurance(quote, kind) || !enabled || !daily || !isPositiveMoney(daily)) {
      continue;
    }
    if (products !== undefined && product === null) continue;
    items.push({ kind, dailyAmount: daily, mandatory: false, tripAmount: null, product });
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
      item.product === b[i]!.product,
  );
}
