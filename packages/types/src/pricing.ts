import type { DiscountTier, LegacyDiscountTier } from './long-term';
import type { BillingMode } from './status/billing';
import { STATUS_COLOR, type StatusMeta } from './status/meta';

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
  [POLICY_SOURCE.SHOP]: { label: 'Đang kế thừa', color: STATUS_COLOR.SUCCESS },
  [POLICY_SOURCE.VEHICLE]: { label: 'Đang ghi đè', color: STATUS_COLOR.WAITING },
};

/**
 * Hình thức BẢO ĐẢM (thế chấp) của một chính sách thuê — ba chế độ LOẠI TRỪ nhau, không phải
 * cờ bật/tắt độc lập. Đây là thứ chuẩn hoá gap C-04: trước đây chỉ có một ô tiền cọc, còn
 * "miễn thế chấp" là một boolean marketing rời trên `vehicles` có thể mâu thuẫn với số cọc.
 *
 * Luật nhất quán được ràng ở DB (CHECK `rental_policies_collateral_scope_check`), không chỉ ở app:
 *   - `cash`  ⇒ deposit_amount > 0  và không có loại tài sản nào;
 *   - `asset` ⇒ deposit_amount = 0  và có ít nhất một loại tài sản;
 *   - `none`  ⇒ deposit_amount = 0  và không có loại tài sản nào.
 */
export const COLLATERAL_MODE = {
  /** Khách đặt cọc TIỀN — số tiền nằm ở `depositAmount`, chảy vào sổ thu-chi. */
  CASH: 'cash',
  /** Khách thế chấp TÀI SẢN/giấy tờ — không có tiền nào chuyển động. */
  ASSET: 'asset',
  /** Miễn thế chấp — nguồn DUY NHẤT của nhãn "Miễn thế chấp" trên sàn. */
  NONE: 'none',
} as const;

export type CollateralMode = (typeof COLLATERAL_MODE)[keyof typeof COLLATERAL_MODE];
export const COLLATERAL_MODE_VALUES = Object.values(COLLATERAL_MODE) as CollateralMode[];

export const COLLATERAL_MODE_META: Readonly<Record<CollateralMode, StatusMeta>> = {
  [COLLATERAL_MODE.CASH]: { label: 'Cọc tiền', color: STATUS_COLOR.INFO },
  [COLLATERAL_MODE.ASSET]: { label: 'Cọc tài sản', color: STATUS_COLOR.WAITING },
  [COLLATERAL_MODE.NONE]: { label: 'Miễn thế chấp', color: STATUS_COLOR.SUCCESS },
};

/**
 * Loại tài sản nhận thế chấp khi `collateralMode = 'asset'` — danh mục ĐÓNG (chốt 20/08).
 * Không có mục "Khác": một ô tự nhập biến trường có cấu trúc trở lại thành đoạn văn tự do,
 * đúng thứ C-04 sinh ra để dẹp, và làm hỏng khả năng lọc/so sánh trên sàn.
 */
export const COLLATERAL_ASSET_TYPE = {
  /** Cà vẹt / giấy đăng ký xe máy của khách. */
  VEHICLE_REGISTRATION: 'vehicle_registration',
  /** Chính chiếc xe máy, gửi lại tại gian hàng suốt thời gian thuê. */
  MOTORBIKE: 'motorbike',
  PASSPORT: 'passport',
} as const;

export type CollateralAssetType =
  (typeof COLLATERAL_ASSET_TYPE)[keyof typeof COLLATERAL_ASSET_TYPE];
export const COLLATERAL_ASSET_TYPE_VALUES = Object.values(
  COLLATERAL_ASSET_TYPE,
) as CollateralAssetType[];

export const COLLATERAL_ASSET_TYPE_LABEL: Readonly<Record<CollateralAssetType, string>> = {
  [COLLATERAL_ASSET_TYPE.VEHICLE_REGISTRATION]: 'Cà vẹt (đăng ký xe máy)',
  [COLLATERAL_ASSET_TYPE.MOTORBIKE]: 'Xe máy',
  [COLLATERAL_ASSET_TYPE.PASSPORT]: 'Hộ chiếu',
};

/** Một bậc phí giao nhận: áp cho khoảng cách ≤ `toKm` (mốc "từ" suy từ bậc liền trước). */
export interface DeliveryTier {
  toKm: number;
  /** Phí VND dạng string — '0' = miễn phí. */
  fee: string;
}

/*
 * Mốc ưu đãi cam kết thời hạn (`rental_policies.discount_tiers_json`) sống ở `./long-term`
 * dưới shape canonical THEO THÁNG — `DiscountTier` / `LegacyDiscountTier`. Ở đây chỉ import
 * để mô tả snapshot; export công khai đi qua `./long-term` để tránh hai đường vào một type.
 */

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
  [DELIVERY_QUOTE_SOURCE.AUTO]: { label: 'Tự động tính', color: STATUS_COLOR.INFO },
  [DELIVERY_QUOTE_SOURCE.MANUAL]: { label: 'Thủ công', color: STATUS_COLOR.WAITING },
};

/**
 * Kết quả tra khoảng cách giao xe từ bản đồ (`GET /public/listings/:id/delivery-distance`).
 *
 * Endpoint này **luôn trả 200** — nó là tiện ích ước lượng, không phải một bước bắt buộc của
 * luồng đặt xe. Mọi ngả không tính được đều là một trạng thái ở đây chứ không phải một lỗi:
 * ném lỗi sẽ biến "bản đồ tạm không tra được" thành "không đặt xe được", điều không đúng.
 */
export const DELIVERY_DISTANCE_STATUS = {
  /** Trong bán kính tự báo — có cả khoảng cách lẫn phí theo bậc. */
  AUTO: 'auto',
  /** Đo được khoảng cách nhưng ngoài bán kính tự báo — chủ xe sẽ trao đổi phí trực tiếp. */
  MANUAL: 'manual',
  /** Chính sách hiệu lực của xe không bật giao xe tận nơi. */
  UNSUPPORTED: 'unsupported',
  /** Không định vị được địa chỉ khách nhập — mời gõ rõ hơn. Đây là việc NGƯỜI DÙNG sửa được. */
  ADDRESS_NOT_FOUND: 'address_not_found',
  /**
   * Hệ thống không tra được: chưa cấu hình nhà cung cấp bản đồ, chi nhánh chưa có toạ độ, hoặc
   * nhà cung cấp lỗi/timeout. Giao diện im lặng rơi về luồng cũ — không đổ lỗi cho khách.
   */
  UNAVAILABLE: 'unavailable',
} as const;

export type DeliveryDistanceStatus =
  (typeof DELIVERY_DISTANCE_STATUS)[keyof typeof DELIVERY_DISTANCE_STATUS];
export const DELIVERY_DISTANCE_STATUS_VALUES = Object.values(
  DELIVERY_DISTANCE_STATUS,
) as DeliveryDistanceStatus[];

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
  /** Tiền thuê gốc: số ngày × đơn giá (thuê ngày) hoặc giá cơ sở của gói (thuê dài hạn). */
  BASE: 'base',
  /** Khuyến mãi trực tiếp (tự lái) hoặc ưu đãi cam kết thời hạn (dài hạn) — chỉ trừ tiền thuê. */
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
 * Phần phía CHỦ XE của một chuyến — ADR 0021 điều 9.
 *
 * **Cố ý KHÔNG phải một `PRICE_ROW`.** Hai lý do cứng, và cả hai đều đắt nếu bỏ qua:
 *
 *  1. `totalAmount` được định nghĩa là *tổng các dòng*, và có code đọc từng dòng theo khoá. Thêm
 *     một dòng hoa hồng thì hoặc đổi tổng khách phải trả — sai, vì "giá trên sàn = đúng giá chủ
 *     xe niêm yết" là toàn bộ lời hứa của sản phẩm (ADR 0020 điều 2) — hoặc phá bất biến
 *     `total = Σ rows`.
 *  2. `rows` là hoá đơn của **KHÁCH**. Hoa hồng là chuyện phía chủ xe. Nhét vào đó là cách để
 *     sáu tháng nữa ai đó vô tình cộng phí lên đầu khách và không ai nhận ra.
 *
 * Hệ quả: `buildDailyQuote` / `buildLongTermPackageQuote` **không đổi một dòng nào** vì lý do hoa
 * hồng — chúng tính giá khách, mà giá khách không phụ thuộc chế độ thu phí của chủ xe.
 */
export interface PlatformFeeSnapshot {
  /** Chế độ thu phí đã đóng băng lúc tạo đơn (ADR 0024 điều 4). */
  billingMode: BillingMode;
  /** % hoa hồng đã áp. */
  percent: number;
  /** Mẫu số = `totalAmount` tại thời điểm chốt. */
  baseAmount: string;
  /** = round(base × percent / 100, HALF_UP). Giữ để giải thích khi sàn có hiệu lực. */
  computedAmount: string;
  /** Số khách THỰC CHUYỂN online = max(computed, HOLD_MIN_AMOUNT). */
  holdAmount: string;
  /** Khách trả TAY chủ xe lúc nhận xe = base − holdAmount. */
  payAtHandoverAmount: string;
  /** Chủ xe THỰC NHẬN. Bằng `payAtHandoverAmount`; giữ hai tên vì là hai câu hỏi khác nhau. */
  ownerNetAmount: string;
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
  /** Số ngày tính tiền — chỉ có ở đơn tính theo NGÀY (tự lái / có tài xế). */
  days?: number;
  /**
   * Gói thuê dài hạn đã chốt (tháng lịch). Có mặt ⇒ đơn tính theo GÓI chứ không theo ngày:
   * `basePackageAmount = baseMonthlyPrice × packageMonths`, ưu đãi cam kết áp lên số đó.
   */
  longTerm?: {
    packageMonths: number;
    baseMonthlyPrice: string;
    basePackageAmount: string;
    durationDiscountPercent: number | null;
    durationDiscountAmount: string;
    finalPackageAmount: string;
    effectiveMonthlyAmount: string;
  };
  rows: PriceBreakdownRow[];
  /** Tổng khách trả trước cọc (= tổng các dòng). */
  totalAmount: string;
  /** Cọc thế chấp — hoàn trả, KHÔNG nằm trong totalAmount. */
  depositAmount: string;
  /**
   * Phần PHÍA CHỦ XE của chuyến — khoản nền tảng khấu trừ (ADR 0021 điều 9).
   *
   * Vắng mặt ⇒ tuyến gói: 0 hoa hồng. Snapshot chốt TRƯỚC 28/08/2026 cũng không có trường này;
   * đọc ra `undefined` nghĩa là **"không biết"** và **KHÔNG được suy ngược từ `totalAmount`** —
   * cùng cảnh báo đã ghi cho `policy.collateralMode` ở dưới.
   */
  platformFee?: PlatformFeeSnapshot;
  /** Chính sách hiệu lực lúc chốt (bản sao nguyên trạng) — null khi source = manual. */
  policy: {
    source: PolicySource;
    updatedAt: string;
    depositAmount: string;
    /**
     * Đơn chốt TRƯỚC 20/08 không có hai trường này — đọc snapshot cũ phải chịu `undefined`,
     * không được suy ngược từ `depositAmount` (cọc 0 của đơn cũ không đồng nghĩa "miễn cọc").
     */
    collateralMode?: CollateralMode;
    collateralAssetTypes?: CollateralAssetType[];
    deliveryEnabled: boolean;
    deliveryMaxRadiusKm: number | null;
    deliveryTiers: DeliveryTier[];
    overtimeFeePerHour: string | null;
    overtimeGraceMinutes: number | null;
    overtimeRoundingMinutes: number | null;
    discountEnabled: boolean;
    /**
     * Snapshot đã đóng băng chịu được CẢ hai đời dữ liệu: đơn cũ giữ mốc theo ngày
     * (`minDays`), đơn mới ghi mốc theo tháng (`minMonths`). Snapshot lịch sử KHÔNG migrate.
     */
    discountTiers: (DiscountTier | LegacyDiscountTier)[];
  } | null;
}
