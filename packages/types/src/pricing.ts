import type { StatusMeta } from './status/meta';

/**
 * Hợp đồng dùng chung cho chính sách thuê & tính giá (Wave 2 — B2).
 *
 * Đây là cấu trúc của các cột `jsonb` (`rental_policies.*_tiers_json`,
 * `bookings.price_snapshot_json`, `booking_requests.delivery_quote_json`) — OpenAPI không
 * sinh được shape cho jsonb nên bản hợp đồng sống ở đây, cả BE lẫn FE cùng import.
 *
 * Tiền LUÔN là string (ADR 0007); khoảng cách km là number (không phải tiền).
 */

/** Nguồn chính sách hiệu lực của một xe. */
export const POLICY_SOURCE = {
  /** Kế thừa chính sách mặc định của gian hàng. */
  SHOP: 'shop',
  /** Xe có bản ghi đè riêng. */
  VEHICLE: 'vehicle',
} as const;

export type PolicySource = (typeof POLICY_SOURCE)[keyof typeof POLICY_SOURCE];
export const POLICY_SOURCE_VALUES = Object.values(POLICY_SOURCE) as PolicySource[];

export const POLICY_SOURCE_META: Readonly<Record<PolicySource, StatusMeta>> = {
  [POLICY_SOURCE.SHOP]: { label: 'Đang kế thừa', color: 'green' },
  [POLICY_SOURCE.VEHICLE]: { label: 'Đang ghi đè', color: 'gold' },
};

/** Một bậc phí giao nhận: áp cho khoảng cách ≤ `toKm` (mốc "từ" suy từ bậc liền trước). */
export interface DeliveryTier {
  toKm: number;
  /** Phí VND dạng string — '0' = miễn phí. */
  fee: string;
}

/** Một mốc ưu đãi giảm giá theo thời gian thuê. */
export interface DiscountTier {
  minDays: number;
  /** 1–100, áp CHỈ lên tiền thuê cơ bản. */
  percent: number;
  note?: string;
}

/** Nguồn của báo giá giao nhận trên một yêu cầu đặt xe. */
export const DELIVERY_QUOTE_SOURCE = {
  /** Trong bán kính tự báo — phí tính từ bậc cấu hình. */
  AUTO: 'auto',
  /** Ngoài bán kính — shop nhập phí thủ công. */
  MANUAL: 'manual',
} as const;

export type DeliveryQuoteSource =
  (typeof DELIVERY_QUOTE_SOURCE)[keyof typeof DELIVERY_QUOTE_SOURCE];
export const DELIVERY_QUOTE_SOURCE_VALUES = Object.values(
  DELIVERY_QUOTE_SOURCE,
) as DeliveryQuoteSource[];

export const DELIVERY_QUOTE_SOURCE_META: Readonly<Record<DeliveryQuoteSource, StatusMeta>> = {
  [DELIVERY_QUOTE_SOURCE.AUTO]: { label: 'Tự động tính', color: 'blue' },
  [DELIVERY_QUOTE_SOURCE.MANUAL]: { label: 'Thủ công', color: 'gold' },
};

/** Cấu trúc `booking_requests.delivery_quote_json` — ghi duy nhất qua BookingRequestsService. */
export interface BookingRequestDeliveryQuote {
  /** Khoảng cách một chiều shop xác nhận (km). */
  distanceKm: number;
  /** Phí giao nhận VND (string). */
  fee: string;
  source: DeliveryQuoteSource;
  note?: string;
  quotedBy: string;
  /** ISO string. */
  quotedAt: string;
  /**
   * `updatedAt` của chính sách hiệu lực TẠI THỜI ĐIỂM báo giá — để phát hiện báo giá cũ
   * (chính sách đã đổi sau khi báo) mà không phải so từng field.
   */
  policyUpdatedAt: string | null;
}

/** Khoá từng dòng trong breakdown giá — FE map nhãn/màu theo khoá, không so chuỗi nhãn. */
export const PRICE_ROW = {
  /** Tiền thuê gốc (số ngày × đơn giá). */
  BASE: 'base',
  /** Giảm giá theo mốc thời gian thuê — chỉ trừ vào tiền thuê. */
  DISCOUNT: 'discount',
  /** Tiền thuê sau giảm (dòng phụ, = base − discount). */
  SUBTOTAL: 'subtotal',
  /** Phí giao nhận xe. */
  DELIVERY: 'delivery',
  /** Phí quá giờ (Wave 2 chỉ là chỗ đứng — tính ở luồng trả xe sau). */
  OVERTIME: 'overtime',
  /** Phụ phí/dịch vụ cộng thêm khác. */
  EXTRAS: 'extras',
} as const;

export type PriceRowKey = (typeof PRICE_ROW)[keyof typeof PRICE_ROW];
export const PRICE_ROW_VALUES = Object.values(PRICE_ROW) as PriceRowKey[];

/** Một dòng trong breakdown giá — amount âm cho dòng giảm trừ ('-120000'). */
export interface PriceBreakdownRow {
  key: PriceRowKey;
  label: string;
  /** Dòng mô tả nhỏ dưới nhãn (vd "3 ngày × 800.000đ/ngày"). */
  sublabel?: string;
  /** VND string; dòng giảm giá mang dấu âm. */
  amount: string;
}

/**
 * Snapshot giá BẤT BIẾN trên `bookings.price_snapshot_json` — chốt lúc tạo đơn, đủ để giải
 * thích số tiền về sau. Đổi chính sách sau đó KHÔNG được ghi lại field này.
 */
export interface BookingPriceSnapshot {
  /** ISO string thời điểm chốt. */
  calculatedAt: string;
  /** 'quote' = tính từ PricingService khi duyệt yêu cầu; 'manual' = shop nhập tay khi tạo đơn. */
  source: 'quote' | 'manual';
  currency: 'VND';
  /** Số ngày tính tiền (nếu source = quote). */
  days?: number;
  rows: PriceBreakdownRow[];
  /** Tổng khách trả trước cọc (= tổng các dòng). */
  totalAmount: string;
  /** Cọc thế chấp — hoàn trả, KHÔNG nằm trong totalAmount. */
  depositAmount: string;
  /** Chính sách hiệu lực lúc chốt (bản sao nguyên trạng) — null khi source = manual. */
  policy: {
    source: PolicySource;
    updatedAt: string;
    depositAmount: string;
    deliveryEnabled: boolean;
    deliveryMaxRadiusKm: number | null;
    deliveryTiers: DeliveryTier[];
    overtimeFeePerHour: string | null;
    overtimeGraceMinutes: number | null;
    overtimeRoundingMinutes: number | null;
    discountEnabled: boolean;
    discountTiers: DiscountTier[];
  } | null;
}
