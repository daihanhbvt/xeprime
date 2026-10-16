import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES, PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { FeaturedReviewDto, FeaturedReviewQueryDto } from './dto/review.dto';
import { ReviewService } from './review.service';

/**
 * Đánh giá NỔI BẬT toàn sàn — @Public, cho khối "Khách hàng nói gì về Xe Prime" ở trang chủ.
 *
 * Base path riêng `public/reviews` (không gắn vào `public/listings` hay `public/shops`): đây không
 * phải đánh giá của MỘT xe hay MỘT gian hàng. Luật chọn nằm ở `ReviewService.listFeatured`.
 */
@ApiTags('public-reviews')
@Controller('public/reviews')
@Realms(...ACCOUNT_REALM_VALUES)
export class PublicFeaturedReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Public()
  @Get('featured')
  @PublicCache(PUBLIC_CACHE_SECONDS.reviews)
  @ApiOperation({ summary: 'Đánh giá nổi bật toàn sàn (mới nhất, từ 4 sao, có lời nhận xét)' })
  @ApiOkResponse({ type: [FeaturedReviewDto] })
  featured(@Query() query: FeaturedReviewQueryDto): Promise<FeaturedReviewDto[]> {
    return this.reviews.listFeatured(query);
  }
}
