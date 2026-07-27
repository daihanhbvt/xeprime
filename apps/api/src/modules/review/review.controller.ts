import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  CreateReviewDto,
  MyTripPageDto,
  ReviewListQueryDto,
} from './dto/review.dto';
import { ReviewService } from './review.service';

/**
 * Đánh giá phía khách — chỉ cần đăng nhập (không tenant-scoped). Khách chỉ thao tác trên chuyến
 * của chính mình; `customerUserId` lấy từ session, không nhận client.
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('my-trips')
  @ApiOperation({ summary: 'Các chuyến của tôi + trạng thái đánh giá (màn "Đơn thuê của tôi")' })
  @ApiOkResponse({ type: MyTripPageDto })
  myTrips(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReviewListQueryDto,
  ): Promise<MyTripPageDto> {
    return this.reviews.myTrips(user.id, query) as Promise<MyTripPageDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Đánh giá một chuyến thuê đã hoàn thành' })
  @ApiCreatedResponse({ schema: { properties: { id: { type: 'string' } } } })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ): Promise<{ id: string }> {
    return this.reviews.createForBooking(user.id, dto);
  }
}
