import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PublicListingsService } from './public-listings.service';
import {
  ListingFacetsDto,
  ListingFacetsQueryDto,
  PublicListingDetailDto,
  PublicListingPageDto,
  PublicListingQueryDto,
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
  constructor(private readonly listings: PublicListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tìm xe trên Marketplace (phân trang, filter, sort)' })
  @ApiOkResponse({ type: PublicListingPageDto })
  search(@Query() query: PublicListingQueryDto): Promise<PublicListingPageDto> {
    return this.listings.search(query) as Promise<PublicListingPageDto>;
  }

  // Route tĩnh PHẢI đứng trước `:id`, nếu không 'facets' bị bắt làm listing id → 404.
  @Public()
  @Get('facets')
  @ApiOperation({ summary: 'Facet counts cho panel Bộ lọc (đếm theo từng chiều filter)' })
  @ApiOkResponse({ type: ListingFacetsDto })
  facets(@Query() query: ListingFacetsQueryDto): Promise<ListingFacetsDto> {
    return this.listings.facets(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một xe trên Marketplace' })
  @ApiOkResponse({ type: PublicListingDetailDto })
  getById(@Param('id') id: string): Promise<PublicListingDetailDto> {
    return this.listings.getById(id);
  }
}
