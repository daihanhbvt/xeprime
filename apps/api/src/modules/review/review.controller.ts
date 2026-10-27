import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ACCOUNT_REALM } from '@xeprime/types';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Realms } from '../../common/decorators';
import { IdResultDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { CreateReviewDto, OwnReviewDto, UpdateReviewDto } from './dto/review.dto';
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
@Realms(ACCOUNT_REALM.CUSTOMER)
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

  @Patch(':id')
  @ApiOperation({ summary: 'Chỉnh sửa đánh giá của chính mình — chỉ được MỘT lần' })
  @ApiOkResponse({ type: OwnReviewDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<OwnReviewDto> {
    return this.reviews.updateOwn(user.id, id, dto);
  }
}
