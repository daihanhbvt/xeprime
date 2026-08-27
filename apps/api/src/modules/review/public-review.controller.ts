import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';
import { Public } from '../../common/decorators';
import { PublicCache } from '../../common/http-cache';
import { ReviewListQueryDto, ReviewPageDto } from './dto/review.dto';
import { ReviewService } from './review.service';

/**
 * Đánh giá công khai của một xe trên Marketplace — @Public. Chỉ trả review `published` kèm điểm
 * trung bình. Trùng base path với PublicListingsController nhưng khác sub-path nên không xung đột.
 */
@ApiTags('public-reviews')
@Controller('public/listings')
export class PublicReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Public()
  @Get(':id/reviews')
  @PublicCache(PUBLIC_CACHE_SECONDS.reviews)
  @ApiOperation({ summary: 'Đánh giá công khai của một xe (phân trang)' })
  @ApiOkResponse({ type: ReviewPageDto })
  list(@Param('id') id: string, @Query() query: ReviewListQueryDto): Promise<ReviewPageDto> {
    return this.reviews.listForVehicle(id, query) as Promise<ReviewPageDto>;
  }
}
