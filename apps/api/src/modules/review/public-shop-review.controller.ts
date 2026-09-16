import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { ReviewListQueryDto, ShopReviewPageDto } from './dto/review.dto';
import { ReviewService } from './review.service';

/**
 * Đánh giá công khai của một GIAN HÀNG — @Public, cho khối "Đánh giá từ khách hàng" ở
 * `/shops/[slug]`.
 *
 * Controller riêng chứ không thêm route vào `PublicShopsController`: bên đó thuộc module
 * marketplace và không được biết tới `ReviewService`, còn kéo `ReviewModule` vào
 * `PublicListingsModule` là dựng đúng vòng phụ thuộc mà `ReviewModule` đang tránh (nó đã import
 * `PublicListingsModule` để refresh rating snapshot — ADR 0008). Cùng base path `public/shops`
 * nhưng khác sub-path nên Nest không xung đột, y như `PublicReviewController` với
 * `PublicListingsController`.
 */
@ApiTags('public-reviews')
@Controller('public/shops')
export class PublicShopReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Public()
  @Get(':slug/reviews')
  @PublicCache(PUBLIC_CACHE_SECONDS.reviews)
  @ApiOperation({ summary: 'Đánh giá công khai của một gian hàng (mọi xe, phân trang)' })
  @ApiOkResponse({ type: ShopReviewPageDto })
  list(
    @Param('slug') slug: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<ShopReviewPageDto> {
    return this.reviews.listForShop(slug, query) as Promise<ShopReviewPageDto>;
  }
}
