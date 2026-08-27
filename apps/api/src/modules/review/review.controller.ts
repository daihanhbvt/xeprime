import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { IdResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { CreateReviewDto } from './dto/review.dto';
import { ReviewService } from './review.service';

/**
 * Đánh giá phía khách — chỉ cần đăng nhập (không tenant-scoped). Khách chỉ thao tác trên chuyến
 * của chính mình; `customerUserId` lấy từ session, không nhận client.
 *
 * Danh sách chuyến KHÔNG ở đây: `GET /trips` (Wave 11) là bề mặt duy nhất, vì nó mang cả tiền,
 * cọc và hoàn cọc. Hai endpoint cùng trả "chuyến của tôi" là hai câu trả lời sẽ lệch nhau.
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Post()
  @ApiOperation({ summary: 'Đánh giá một chuyến thuê đã hoàn thành' })
  @ApiCreatedResponse({ type: IdResultDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ): Promise<{ id: string }> {
    return this.reviews.createForBooking(user.id, dto);
  }
}
