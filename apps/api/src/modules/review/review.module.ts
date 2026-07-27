import { Module } from '@nestjs/common';
import { PublicReviewController } from './public-review.controller';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

/**
 * Đánh giá sau chuyến (Phase 5). PrismaModule và NotificationModule đều @Global nên không cần
 * import. ReviewService là writer duy nhất của rating_avg/rating_count gian hàng.
 */
@Module({
  controllers: [ReviewController, PublicReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
