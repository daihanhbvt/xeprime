import type { components } from './api.generated';
import type { ListingSort } from './status/index';

/** Shape listing marketplace lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type PublicListing = Schemas['PublicListingDto'];
export type PublicListingDetail = Schemas['PublicListingDetailDto'];
export type PublicShop = Schemas['PublicShopDto'];
/** Tỉnh/thành có xe — "Địa điểm nổi bật" (số xe đếm thật ở backend). */
export type PublicDestination = Schemas['PublicDestinationDto'];
/** Gian hàng trong danh sách công khai — "Gian hàng nổi bật". */
export type PublicShopSummary = Schemas['PublicShopSummaryDto'];
/**
 * Khối "Xe phù hợp với bạn" ở trang chủ — danh sách đã xếp hạng + ngữ cảnh đã dùng để xếp.
 * `meta.mixedProvinces` là thứ cho phép giao diện nói thật khi phải bù xe ngoài tỉnh ưu tiên.
 */
export type RecommendedListings = Schemas['RecommendedListingsDto'];

/** Facet counts cho panel Bộ lọc — mỗi chiều đếm với mọi filter TRỪ chính nó. */
export type PublicListingFacets = Schemas['ListingFacetsDto'];
export type PublicBanner = Schemas['PublicBannerDto'];

export type ReviewItem = Schemas['ReviewDto'];
export type ReviewSummary = Schemas['ReviewSummaryDto'];
export type ReviewPage = Schemas['ReviewPageDto'];
/** Đánh giá trên trang gian hàng — như `ReviewItem` + chiếc xe khách đã thuê. */
export type ShopReviewItem = Schemas['ShopReviewDto'];
export type ShopReviewPage = Schemas['ShopReviewPageDto'];
/** Đánh giá nổi bật toàn sàn — "Khách hàng nói gì về Xe Prime" ở trang chủ. */
export type FeaturedReview = Schemas['FeaturedReviewDto'];

export type { ListingSort };

/**
 * Ngữ cảnh tìm kiếm marketplace, dùng chung web ↔ native.
 *
 * Web giữ nó ở URL searchParams (ADR 0004), native giữ ở state màn hình / route params — hình
 * dạng thì phải giống nhau, nếu không hai client sẽ hỏi backend hai câu khác nhau cho cùng một
 * thao tác của người dùng.
 */
export interface MarketplaceFilters {
  /**
   * Từ khoá — tên xe/hãng/model hoặc tên công khai của chủ xe/gian hàng. Server gấp chuỗi
   * (không dấu, khớp đầu từ — `searchTokens` ở @xeprime/domain), client gửi nguyên văn.
   */
  q?: string;
  vehicleType?: string;
  /**
   * Loại dịch vụ (SERVICE_TYPE) — tab Xe tự lái / Xe có tài xế / Thuê dài hạn của thẻ tìm kiếm.
   * Backend lọc theo NĂNG LỰC phục vụ: mảng `service_types` của xe CHỨA giá trị này.
   */
  serviceType?: string;
  /**
   * Lộ trình có tài xế (ROUTE_TYPE) — ngữ cảnh prefill cho yêu cầu thuê, KHÔNG phải chiều lọc
   * (không gửi API listings).
   */
  routeType?: string;
  /** MÃ tỉnh — tham số địa điểm chuẩn, khớp chính xác. Mọi bộ chọn địa điểm ghi giá trị này. */
  provinceCode?: string;
  /** TÊN tỉnh — chỉ đọc từ link/bookmark CŨ, backend quy về mã qua bảng bí danh. */
  province?: string;
  pickupAt?: string;
  returnAt?: string;
  brand?: string[];
  bodyType?: string[];
  /** Phân khúc xe máy — chiều lọc đối xứng với `bodyType` của ô tô. */
  motorbikeCategory?: string[];
  seats?: string[];
  fuelType?: string[];
  features?: string[];
  transmission?: string[];
  hourly?: boolean;
  delivery?: boolean;
  noCollateral?: boolean;
  discount?: boolean;
  /** Chỉ xe mà chủ xe hỗ trợ xuất hoá đơn VAT (thông tin chủ xe công bố — ADR 0059). */
  vatInvoice?: boolean;
  /**
   * Chỉ xe "Đặt ngay" (tự động nhận chuyến, không chờ chủ xe xác nhận). Có `serviceType` thì xe
   * phải bật Đặt ngay cho ĐÚNG dịch vụ đó; không có thì bật cho ít nhất một dịch vụ.
   */
  instantBook?: boolean;
  /** Điểm đánh giá tối thiểu (LISTING_MIN_RATING_VALUES) — xe chưa có điểm bị loại. */
  minRating?: number;
  minSeats?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: ListingSort;
  page?: number;
  limit?: number;
}

/**
 * Vị trí của một banner trang chủ (`marketplace_banners.placement`):
 *   · `hero` — dải banner đầu trang (PC 1440×300 · tablet 1024×320 · mobile 780×390);
 *   · `promo` — banner khuyến mãi giữa trang (PC 1168×360, mobile tuỳ chọn 680×400).
 * Hai vị trí dùng chung một bảng, một đường ghi (`BannersService`); trần banner hiển thị cùng lúc,
 * thứ tự và lịch tính RIÊNG cho từng vị trí.
 */
export const BANNER_PLACEMENT = {
  HERO: 'hero',
  PROMO: 'promo',
} as const;
export type BannerPlacement = (typeof BANNER_PLACEMENT)[keyof typeof BANNER_PLACEMENT];
export const BANNER_PLACEMENT_VALUES = Object.values(BANNER_PLACEMENT) as BannerPlacement[];

/** Đọc vị trí từ URL/đầu vào không tin cậy — giá trị lạ không bao giờ lọt thành một vị trí. */
export function isBannerPlacement(value: unknown): value is BannerPlacement {
  return (BANNER_PLACEMENT_VALUES as readonly unknown[]).includes(value);
}

/**
 * Tổng đài hỗ trợ của sàn, in trên trang chủ (khối "Đăng ký trở thành đối tác") theo design v2 —
 * web và app native đọc CÙNG số này.
 *
 * `display` là cách viết cho người đọc; `tel` là dạng quay số quốc tế cho liên kết `tel:` — tách
 * hai trường để không phải bóc khoảng trắng ở mỗi nơi dùng. Số là dữ liệu, không dịch.
 */
export const SUPPORT_HOTLINE = {
  display: '0968 789 789',
  tel: '+84968789789',
} as const;
