import { LIST_SEPARATOR } from './display';
import { isZeroMoney } from './money';

/** Một bậc phí giao xe với mốc "từ" đã suy ra. */
export interface DeliveryTierRange {
  fromKm: number;
  toKm: number;
  /** Phí VND dạng chuỗi (ADR 0007). */
  fee: string;
  /** Phí rỗng / 0 — vùng miễn phí. */
  free: boolean;
}

/**
 * Bậc phí giao xe → các khoảng `từ–đến`.
 *
 * Chính sách chỉ lưu mốc "đến" tăng dần (`rental_policies.delivery_tiers_json`); mốc "từ" là mốc
 * "đến" của bậc trước. Bậc có phí rỗng/0 là MIỄN PHÍ — đúng cách wizard đăng xe dựng vùng miễn phí
 * (một bậc phí 0 đứng đầu). Bậc chưa có mốc "đến" (dòng đang gõ dở ở form) bị bỏ qua.
 *
 * Nhận phí dạng số (form) lẫn chuỗi (API) — mọi nơi đọc bậc phí dùng CHUNG một luật.
 */
/** Phí một bậc giao xe là MIỄN PHÍ khi rỗng hoặc bằng 0 — nhận số (form) lẫn chuỗi (API). */
export function isFreeDeliveryFee(fee: string | number | null | undefined): boolean {
  return fee == null || isZeroMoney(String(fee));
}

export function deliveryTierRanges(
  tiers: readonly {
    toKm: number | null | undefined;
    fee: string | number | null | undefined;
  }[],
): DeliveryTierRange[] {
  const ranges: DeliveryTierRange[] = [];
  let from = 0;
  for (const tier of tiers) {
    if (tier.toKm == null) continue;
    const fee = tier.fee == null ? '0' : String(tier.fee);
    ranges.push({ fromKm: from, toKm: tier.toKm, fee, free: isFreeDeliveryFee(fee) });
    from = tier.toKm;
  }
  return ranges;
}

/**
 * Vùng giao MIỄN PHÍ đứng đầu (km), hoặc `null` nếu không có — đúng cách wizard đăng xe dựng nó:
 * bậc ĐẦU TIÊN có phí 0. Chỉ xét bậc đầu (kể cả khi nó còn đang gõ dở), không lấy một bậc miễn
 * phí nằm giữa làm "vùng miễn phí".
 */
export function freeDeliveryWithinKm(
  tiers: readonly {
    toKm: number | null | undefined;
    fee: string | number | null | undefined;
  }[],
): number | null {
  const first = deliveryTierRanges(tiers.slice(0, 1))[0];
  return first?.free ? first.toKm : null;
}

/**
 * Tóm tắt cấu hình giao nhận hiển thị với khách đặt — đúng dòng preview của thiết kế.
 *
 * Hàm THUẦN: chữ và bộ định dạng tiền đi VÀO từ ngoài, nên nó nói đúng ngôn ngữ đang bật và in
 * tiền giống hệt phần còn lại của màn.
 *
 * Ở `@xeprime/domain` vì đây là NGHĨA của một chính sách giao nhận, không phải cách vẽ nó: web
 * và app native cùng phải đọc ra một câu, và hai bản chép tay là hai câu sẽ lệch nhau ở lần sửa
 * đầu tiên.
 */
export function deliverySummaryText(
  values: {
    deliveryTiers: { toKm: number | null | undefined; fee: number | null | undefined }[];
    deliveryMaxRadiusKm: number | null | undefined;
  },
  { money, free, quote }: { money: (value: string) => string; free: string; quote: string },
): string {
  const parts = deliveryTierRanges(values.deliveryTiers).map(
    (range) =>
      `${range.fromKm === 0 ? '0' : `>${range.fromKm}`}–${range.toKm} km: ${range.free ? free : money(range.fee)}`,
  );
  if (values.deliveryMaxRadiusKm != null) {
    parts.push(`>${values.deliveryMaxRadiusKm} km: ${quote}`);
  }
  return parts.join(LIST_SEPARATOR);
}
