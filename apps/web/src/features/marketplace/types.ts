import type { components, ListingSort } from '@xeprime/types';

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

export type ReviewItem = Schemas['ReviewDto'];
export type ReviewSummary = Schemas['ReviewSummaryDto'];
export type ReviewPage = Schemas['ReviewPageDto'];

/** Sort dùng chung với backend qua `@xeprime/types` — không chép tay union nữa. */
export type { ListingSort };

export interface MarketplaceFilters {
  vehicleType?: string;
  serviceType?: string;
  q?: string;
  /**
   * MÃ tỉnh — tham số địa điểm chuẩn, khớp chính xác. Mọi bộ chọn địa điểm ghi giá trị này.
   */
  provinceCode?: string;
  /**
   * TÊN tỉnh — chỉ đọc từ link/bookmark CŨ. Backend quy về mã qua bí danh; URL mới không sinh
   * tham số này nữa (xem `parseFilters`).
   *
   * @deprecated dùng `provinceCode`
   */
  province?: string;
  /** Các chiều multi-select của panel Bộ lọc — đi trên URL dạng CSV. */
  brand?: string[];
  bodyType?: string[];
  seats?: string[];
  fuelType?: string[];
  features?: string[];
  /** Toggle tiện ích — đi trên URL dạng `1`. */
  hourly?: boolean;
  delivery?: boolean;
  noCollateral?: boolean;
  discount?: boolean;
  /** Số chỗ tối thiểu (giữ tương thích cũ — panel mới dùng `seats`). */
  minSeats?: number;
  /** Khoảng giá thuê/ngày (VND). */
  priceMin?: number;
  priceMax?: number;
  /** Khoảng thuê (ISO-8601) — lọc xe rảnh; đi theo cặp. */
  pickupAt?: string;
  returnAt?: string;
  sort?: ListingSort;
  page?: number;
  limit?: number;
}
