import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PublicListingsService } from './public-listings.service';
import {
  PublicListingPageDto,
  PublicShopDto,
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

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Hồ sơ công khai của một gian hàng theo slug' })
  @ApiOkResponse({ type: PublicShopDto })
  getShop(@Param('slug') slug: string): Promise<PublicShopDto> {
    return this.listings.getShopBySlug(slug);
  }

  @Public()
  @Get(':slug/listings')
  @ApiOperation({ summary: 'Danh sách xe công khai của một gian hàng (phân trang)' })
  @ApiOkResponse({ type: PublicListingPageDto })
  getShopListings(
    @Param('slug') slug: string,
    @Query() query: ShopListingQueryDto,
  ): Promise<PublicListingPageDto> {
    return this.listings.listShopVehicles(slug, query) as Promise<PublicListingPageDto>;
  }
}
