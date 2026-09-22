import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { PublicListingsService } from './public-listings.service';
import { MarketPriceService } from './market-price.service';
import { MarketPriceQueryDto, MarketPriceSuggestionDto } from './dto/market-price.dto';
import {
  ListingFacetsDto,
  ListingFacetsQueryDto,
  PublicListingDetailDto,
  PublicListingPageDto,
  PublicListingQueryDto,
  RecommendedListingQueryDto,
  RecommendedListingsDto,
} from './dto/public-listing.dto';

/**
 * Marketplace công khai — không cần đăng nhập (@Public).
 *
 * Chỉ đọc, chỉ trả xe đã duyệt của shop đang hoạt động. Không nhận `tenant_id` (đây là API
 * công khai, không có scope tenant); lọc/scope nằm trong service.
 */
@ApiTags('public-listings')
@Controller('public/listings')
export class PublicListingsController {
  constructor(
    private readonly listings: PublicListingsService,
    private readonly marketPrice: MarketPriceService,
  ) {}

  @Public()
  @Get()
  @PublicCache(PUBLIC_CACHE_SECONDS.listing)
  @ApiOperation({ summary: 'Tìm xe trên Marketplace (phân trang, filter, sort)' })
  @ApiOkResponse({ type: PublicListingPageDto })
  search(@Query() query: PublicListingQueryDto): Promise<PublicListingPageDto> {
    return this.listings.search(query) as Promise<PublicListingPageDto>;
  }

  // Route tĩnh PHẢI đứng trước `:id`, nếu không 'facets' bị bắt làm listing id → 404.
  @Public()
  @Get('facets')
  @PublicCache(PUBLIC_CACHE_SECONDS.facets)
  @ApiOperation({ summary: 'Facet counts cho panel Bộ lọc (đếm theo từng chiều filter)' })
  @ApiOkResponse({ type: ListingFacetsDto })
  facets(@Query() query: ListingFacetsQueryDto): Promise<ListingFacetsDto> {
    return this.listings.facets(query);
  }

  /**
   * Khối gợi ý của trang chủ. Route tĩnh nên cũng phải đứng TRƯỚC `:id`, cùng lý do với
   * `facets`.
   *
   * Tách khỏi `GET /public/listings` vì nó trả lời một câu hỏi khác: ở đó tỉnh là bộ lọc cứng
   * và rỗng là câu trả lời hợp lệ, còn ở đây tỉnh là ưu tiên và danh sách luôn được lấp đầy
   * chừng nào chợ còn xe (xem docblock `RecommendedListingQueryDto`). Nhét cả hai vào một
   * endpoint nghĩa là một cờ boolean đổi ngữ nghĩa của một tham số — thứ sẽ bị đọc nhầm.
   */
  @Public()
  @Get('recommended')
  @PublicCache(PUBLIC_CACHE_SECONDS.listing)
  @ApiOperation({ summary: 'Xe phù hợp với bạn — gợi ý trang chủ, ưu tiên theo tỉnh của khách' })
  @ApiOkResponse({ type: RecommendedListingsDto })
  recommended(@Query() query: RecommendedListingQueryDto): Promise<RecommendedListingsDto> {
    return this.listings.recommended(query);
  }

  /**
   * Giá tham khảo cho chủ xe đang đặt giá — công khai vì đầu vào lẫn đầu ra đều là mặt bằng của
   * cả chợ, không chạm vào dữ liệu của một gian hàng nào (xem docblock `MarketPriceQueryDto`).
   * Vẫn phải đứng TRƯỚC `:id`, cùng lý do với `facets`.
   */
  @Public()
  @Get('price-suggestion')
  @PublicCache(PUBLIC_CACHE_SECONDS.facets)
  @ApiOperation({ summary: 'Khoảng giá thuê/ngày tham khảo theo phân khúc xe và tỉnh' })
  @ApiOkResponse({ type: MarketPriceSuggestionDto })
  priceSuggestion(@Query() query: MarketPriceQueryDto): Promise<MarketPriceSuggestionDto> {
    return this.marketPrice.suggest(query);
  }

  @Public()
  @Get(':id')
  @PublicCache(PUBLIC_CACHE_SECONDS.listing)
  @ApiOperation({ summary: 'Chi tiết một xe trên Marketplace' })
  @ApiOkResponse({ type: PublicListingDetailDto })
  getById(@Param('id') id: string): Promise<PublicListingDetailDto> {
    return this.listings.getById(id);
  }
}
