import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { PublicListingsService } from './public-listings.service';
import {
  PublicListingPageDto,
  PublicShopDto,
  PublicShopListQueryDto,
  PublicShopPageDto,
  ShopListingQueryDto,
} from './dto/public-listing.dto';

/**
 * Trang gian hàng công khai `/shops/[slug]` — không cần đăng nhập (@Public).
 *
 * Chỉ đọc, chỉ trả gian hàng đang `active` và xe đã `approved_public`. Cùng module với
 * marketplace để tái dùng `PublicListingsService` (cùng điều kiện lọc, ADR 0008).
 */
@ApiTags('public-listings')
@Controller('public/shops')
export class PublicShopsController {
  constructor(private readonly listings: PublicListingsService) {}

  // `shop` (60s) chứ không phải `catalog` (300s): hồ sơ gian hàng do chủ shop TỰ SỬA, và giai
  // đoạn đầu gian hàng đăng ký/duyệt liên tục — cũ 5 phút là chủ shop tưởng lưu không ăn.
  @Public()
  @Get()
  @PublicCache(PUBLIC_CACHE_SECONDS.shop)
  @ApiOperation({ summary: 'Danh sách gian hàng công khai (phân trang, sắp theo đánh giá)' })
  @ApiOkResponse({ type: PublicShopPageDto })
  listShops(@Query() query: PublicShopListQueryDto): Promise<PublicShopPageDto> {
    return this.listings.listShops(query) as Promise<PublicShopPageDto>;
  }

  @Public()
  @Get(':slug')
  @PublicCache(PUBLIC_CACHE_SECONDS.shop)
  @ApiOperation({ summary: 'Hồ sơ công khai của một gian hàng theo slug' })
  @ApiOkResponse({ type: PublicShopDto })
  getShop(@Param('slug') slug: string): Promise<PublicShopDto> {
    return this.listings.getShopBySlug(slug);
  }

  @Public()
  @Get(':slug/listings')
  @PublicCache(PUBLIC_CACHE_SECONDS.listing)
  @ApiOperation({ summary: 'Danh sách xe công khai của một gian hàng (phân trang)' })
  @ApiOkResponse({ type: PublicListingPageDto })
  getShopListings(
    @Param('slug') slug: string,
    @Query() query: ShopListingQueryDto,
  ): Promise<PublicListingPageDto> {
    return this.listings.listShopVehicles(slug, query) as Promise<PublicListingPageDto>;
  }
}
