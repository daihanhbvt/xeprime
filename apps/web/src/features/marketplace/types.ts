/**
 * Shape marketplace sống ở `@xeprime/types` (sinh từ OpenAPI — ADR 0007) vì `apps/mobile` dựng
 * đúng những màn này trên cùng contract; hai bản sao sẽ lệch đúng lúc backend đổi DTO.
 * File này chỉ là lối vào quen thuộc cho code web.
 */
export type {
  ListingSort,
  MarketplaceFilters,
  PublicDestination,
  PublicListing,
  PublicListingDetail,
  PublicListingFacets,
  PublicShop,
  PublicShopSummary,
  RecommendedListings,
  ReviewItem,
  ReviewPage,
  ReviewSummary,
  ShopReviewItem,
  ShopReviewPage,
} from '@xeprime/types';
