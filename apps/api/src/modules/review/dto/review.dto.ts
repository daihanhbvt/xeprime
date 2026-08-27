import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RATING_MAX, RATING_MIN } from '@xeprime/types';
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
