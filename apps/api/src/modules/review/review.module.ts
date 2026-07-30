import { Module } from '@nestjs/common';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { PublicReviewController } from './public-review.controller';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

/**
 * Đánh giá sau chuyến (Phase 5). PrismaModule và NotificationModule đều @Global nên không cần
 * import. ReviewService là writer duy nhất của rating_avg/rating_count gian hàng; rating trên
 * `public_listings` thì đi qua ListingsService.refreshRating (ADR 0008) — nên import
 * PublicListingsModule.
 */
@Module({
  imports: [PublicListingsModule],
  controllers: [ReviewController, PublicReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
