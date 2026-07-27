import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BOOKING_STATUS_VALUES, RATING_MAX, RATING_MIN } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export { DEFAULT_LIMIT as REVIEW_DEFAULT_LIMIT, MAX_LIMIT as REVIEW_MAX_LIMIT };

/** Khách tạo đánh giá cho một đơn thuê ĐÃ hoàn thành của chính mình. */
export class CreateReviewDto {
  @ApiProperty({ description: 'ID đơn thuê đã COMPLETED của khách' })
  @IsString()
  bookingId!: string;

  @ApiProperty({ minimum: RATING_MIN, maximum: RATING_MAX, example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(RATING_MIN)
  @Max(RATING_MAX)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/** Một đánh giá hiển thị công khai trên trang chi tiết xe. */
export class ReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ minimum: RATING_MIN, maximum: RATING_MAX }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) comment!: string | null;
  @ApiProperty({ description: 'Tên khách (đã rút gọn)' }) customerName!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class ReviewSummaryDto {
  @ApiProperty({ description: 'Điểm trung bình (0 nếu chưa có)', example: 4.6 }) ratingAvg!: number;
  @ApiProperty({ example: 12 }) ratingCount!: number;
}

export class ReviewPageDto {
  @ApiProperty({ type: ReviewSummaryDto }) summary!: ReviewSummaryDto;
  @ApiProperty({ type: [ReviewDto] }) data!: ReviewDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Đánh giá gắn với một chuyến (rút gọn) — cho màn "Đơn thuê của tôi". */
export class TripReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) comment!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Một chuyến của khách (đơn thuê đến từ yêu cầu của họ) + trạng thái đánh giá. */
export class MyTripDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty() shopName!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Đủ điều kiện đánh giá (đã hoàn thành + chưa đánh giá)' })
  canReview!: boolean;
  @ApiPropertyOptional({ type: TripReviewDto, nullable: true }) review!: TripReviewDto | null;
}

export class MyTripPageDto {
  @ApiProperty({ type: [MyTripDto] }) data!: MyTripDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
