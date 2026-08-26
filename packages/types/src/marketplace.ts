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
/** Facet counts cho panel Bộ lọc — mỗi chiều đếm với mọi filter TRỪ chính nó. */
export type PublicListingFacets = Schemas['ListingFacetsDto'];
export type PublicBanner = Schemas['PublicBannerDto'];

export type ReviewItem = Schemas['ReviewDto'];
export type ReviewSummary = Schemas['ReviewSummaryDto'];
export type ReviewPage = Schemas['ReviewPageDto'];

export type { ListingSort };

/**
 * Ngữ cảnh tìm kiếm marketplace, dùng chung web ↔ native.
 *
 * Web giữ nó ở URL searchParams (ADR 0004), native giữ ở state màn hình / route params — hình
 * dạng thì phải giống nhau, nếu không hai client sẽ hỏi backend hai câu khác nhau cho cùng một
 * thao tác của người dùng.
 */
export interface MarketplaceFilters {
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
  seats?: string[];
  fuelType?: string[];
  features?: string[];
  hourly?: boolean;
  delivery?: boolean;
  noCollateral?: boolean;
  discount?: boolean;
  minSeats?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: ListingSort;
  page?: number;
  limit?: number;
}
