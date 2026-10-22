import { isPerKmDeliveryTier, roundVnd } from '@xeprime/types';
import { LIST_SEPARATOR } from './display';
import { isZeroMoney } from './money';

/** Một bậc phí giao xe với mốc "từ" đã suy ra. */
export interface DeliveryTierRange {
  fromKm: number;
  toKm: number;
  /** Phí trọn gói VND dạng chuỗi (ADR 0007) — `'0'` khi bậc tính THEO KM (xem `perKm`). */
  fee: string;
  /** Đơn giá VND mỗi km — khác `null` thì bậc tính theo km và `fee` không có nghĩa (ADR 0064). */
  perKm: string | null;
  /** Bậc trọn gói có phí rỗng / 0 — vùng miễn phí. Bậc theo km không bao giờ "miễn phí". */
  free: boolean;
}

/**
 * Hình dạng một bậc mà mọi nơi đọc bậc đều nhận: số (form) lẫn chuỗi (API), dạng trọn gói
 * (`fee`) lẫn dạng theo km (`perKm`).
 */
export interface DeliveryTierLike {
  toKm: number | null | undefined;
  fee?: string | number | null | undefined;
  perKm?: string | number | null | undefined;
}

/**
 * Bậc tính THEO KM — có đơn giá mỗi km (kể cả khi form vừa gõ 0).
 *
 * Luật nằm MỘT chỗ: `isPerKmDeliveryTier` của `@xeprime/types` (server dùng chung). Hàm này chỉ
 * nới đầu vào cho bậc của FORM, nơi `perKm` còn là số.
 */
export function isPerKmTier(tier: Pick<DeliveryTierLike, 'perKm'>): boolean {
  const { perKm } = tier;
  return isPerKmDeliveryTier({ perKm: typeof perKm === 'number' ? String(perKm) : perKm });
}

/**
 * Bậc phí giao xe → các khoảng `từ–đến`.
 *
 * Chính sách chỉ lưu mốc "đến" tăng dần (`rental_policies.delivery_tiers_json`); mốc "từ" là mốc
 * "đến" của bậc trước. Bậc trọn gói có phí rỗng/0 là MIỄN PHÍ — đúng cách wizard đăng xe dựng vùng
 * miễn phí (một bậc phí 0 đứng đầu). Bậc chưa có mốc "đến" (dòng đang gõ dở ở form) bị bỏ qua.
 *
 * Nhận phí dạng số (form) lẫn chuỗi (API) — mọi nơi đọc bậc phí dùng CHUNG một luật.
 */
/** Phí một bậc giao xe là MIỄN PHÍ khi rỗng hoặc bằng 0 — nhận số (form) lẫn chuỗi (API). */
export function isFreeDeliveryFee(fee: string | number | null | undefined): boolean {
  return fee == null || isZeroMoney(String(fee));
}

export function deliveryTierRanges(tiers: readonly DeliveryTierLike[]): DeliveryTierRange[] {
  const ranges: DeliveryTierRange[] = [];
  let from = 0;
  for (const tier of tiers) {
    if (tier.toKm == null) continue;
    if (isPerKmTier(tier)) {
      ranges.push({
        fromKm: from,
        toKm: tier.toKm,
        fee: '0',
        perKm: String(tier.perKm),
        free: false,
      });
    } else {
      const fee = tier.fee == null ? '0' : String(tier.fee);
      ranges.push({
        fromKm: from,
        toKm: tier.toKm,
        fee,
        perKm: null,
        free: isFreeDeliveryFee(fee),
      });
    }
    from = tier.toKm;
  }
  return ranges;
}

/** Độ phân giải quãng đường khi tính phí giao theo km: phần vạn km (0,1 m). */
const DISTANCE_UNITS_PER_KM = 10_000;

/**
 * Phí giao của MỘT bậc ở khoảng cách `distanceKm` (một chiều) — nơi DUY NHẤT nhân đơn giá theo km.
 *
 * Bậc trọn gói trả nguyên `fee`. Bậc theo km trả `perKm × distanceKm` làm tròn tới ĐỒNG (`roundVnd`,
 * nửa đồng làm tròn LÊN — ADR 0069 điều 1): khoảng cách đến từ bản đồ có số lẻ, và phí giao là một
 * khoản TÍNH RA từ đơn giá, nên nó phải đúng bằng đơn giá × quãng đường chứ không bị đẩy lên/xuống
 * tới bậc 1.000đ gần nhất. Số lẻ được hạn chế bằng chính sách (đơn giá/km tròn), không bằng làm
 * tròn kết quả. Phí giao không bao giờ vào khoản chuyển online (`computeCustomerFees`) — khách trả
 * tận tay chủ xe.
 *
 * Quãng đường quy về số nguyên phần vạn km (`DISTANCE_UNITS_PER_KM`, 0,1 m — mịn hơn mọi nguồn
 * khoảng cách: cột `distance_km` giữ 2 số lẻ) TRƯỚC khi nhân, chia sau cùng — cùng kỷ luật với
 * `percentOfVnd`: `5.000 × 1,0001` đi qua số thực ra `5.000,4999…` và rơi xuống 5.000đ, còn
 * `5.000 × 10.001 / 10.000` là đúng `5.000,5` ⇒ 5.001đ.
 */
export function deliveryTierFee(
  tier: { fee?: string | null | undefined; perKm?: string | null | undefined },
  distanceKm: number,
): string {
  if (isPerKmTier(tier)) {
    const perKm = Number(tier.perKm);
    if (!Number.isFinite(perKm) || perKm < 0 || !Number.isFinite(distanceKm) || distanceKm < 0) {
      throw new Error(`Bậc giao xe theo km không hợp lệ: ${tier.perKm} × ${distanceKm}`);
    }
    const distanceUnits = Math.round(distanceKm * DISTANCE_UNITS_PER_KM);
    return String(roundVnd((perKm * distanceUnits) / DISTANCE_UNITS_PER_KM));
  }
  return tier.fee == null || tier.fee === '' ? '0' : String(tier.fee);
}

/**
 * Vùng giao MIỄN PHÍ đứng đầu (km), hoặc `null` nếu không có — đúng cách wizard đăng xe dựng nó:
 * bậc ĐẦU TIÊN có phí 0. Chỉ xét bậc đầu (kể cả khi nó còn đang gõ dở), không lấy một bậc miễn
 * phí nằm giữa làm "vùng miễn phí".
 */
export function freeDeliveryWithinKm(tiers: readonly DeliveryTierLike[]): number | null {
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
    deliveryTiers: DeliveryTierLike[];
    deliveryMaxRadiusKm: number | null | undefined;
  },
  {
    money,
    free,
    quote,
    perKm = (formatted: string) => `${formatted}/km`,
  }: {
    money: (value: string) => string;
    free: string;
    quote: string;
    /** Nhãn đơn giá theo km, nhận số tiền ĐÃ định dạng — mặc định `<tiền>/km`. */
    perKm?: (formattedAmount: string) => string;
  },
): string {
  const parts = deliveryTierRanges(values.deliveryTiers).map((range) => {
    const price =
      range.perKm != null ? perKm(money(range.perKm)) : range.free ? free : money(range.fee);
    return `${range.fromKm === 0 ? '0' : `>${range.fromKm}`}–${range.toKm} km: ${price}`;
  });
  if (values.deliveryMaxRadiusKm != null) {
    parts.push(`>${values.deliveryMaxRadiusKm} km: ${quote}`);
  }
  return parts.join(LIST_SEPARATOR);
}
