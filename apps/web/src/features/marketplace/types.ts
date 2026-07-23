import type { MoneyString } from '@xeprime/types';

/**
 * Shape của một listing marketplace — khớp `PublicListingDto` ở backend.
 *
 * TODO(ADR 0007): thay bằng type sinh từ OpenAPI sau khi `pnpm contract` bổ sung
 * `GET /public/listings`. Giữ tay tạm để dựng UI trước.
 */
export interface PublicListing {
  id: string;
  name: string;
  vehicleType: string;
  serviceType: string;
  brand: string | null;
  model: string | null;
  seatCount: number | null;
  fuelType: string | null;
  mainImageUrl: string | null;
  weekdayPrice: MoneyString | null;
  weekendPrice: MoneyString | null;
  shopName: string;
  shopSlug: string;
}

export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export interface MarketplaceFilters {
  vehicleType?: string;
  serviceType?: string;
  brand?: string;
  minSeats?: number;
  q?: string;
  sort?: ListingSort;
  page?: number;
  limit?: number;
}
