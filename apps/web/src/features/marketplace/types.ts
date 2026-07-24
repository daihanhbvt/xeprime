import type { components } from '@xeprime/types';

/** Shape listing marketplace lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type PublicListing = Schemas['PublicListingDto'];
export type PublicListingDetail = Schemas['PublicListingDetailDto'];

export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface MarketplaceFilters {
  vehicleType?: string;
  serviceType?: string;
  brand?: string;
  minSeats?: number;
  q?: string;
  /** Tỉnh/thành gian hàng — lọc từ "Địa điểm nổi bật". */
  province?: string;
  sort?: ListingSort;
  page?: number;
  limit?: number;
}
