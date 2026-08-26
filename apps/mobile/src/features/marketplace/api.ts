// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình, và
// `marketplaceApi` bên dưới dùng chính client đó.
import '@/lib/api-client';

export { marketplaceApi, toListingQueryParams, DEFAULT_LISTING_LIMIT } from '@xeprime/api-client';

// Kiểu marketplace ở `@xeprime/types` (sinh từ OpenAPI — ADR 0007), không phải ở client HTTP.
export type {
  MarketplaceFilters,
  PublicBanner,
  PublicDestination,
  PublicListing,
  PublicListingDetail,
  PublicListingFacets,
  PublicShopSummary,
} from '@xeprime/types';
