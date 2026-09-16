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

/**
 * Một đánh giá trên trang GIAN HÀNG — thêm đúng một thứ so với đánh giá trên trang xe: chiếc xe
 * mà khách đã thuê.
 *
 * Nó không thừa ở đây và cũng không thiếu ở kia: trên trang một chiếc xe thì mọi đánh giá đều
 * nói về chính chiếc xe đang mở, còn trên trang gian hàng thì "4 sao" của một chiếc VinFast và
 * "5 sao" của một chiếc Camry là hai thông tin khác nhau, và người đọc cần biết cái nào là cái
 * nào trước khi tin vào điểm trung bình.
 *
 * KHÔNG có avatar khách ở đây, có chủ đích: `customerName` đã được rút gọn ("Nguyễn Văn A.")
 * để một trang công khai không phơi tên đầy đủ của người thuê, và dán ảnh thật của họ cạnh cái
 * tên đã che là tự tay cởi bỏ lớp che đó. FE dựng avatar bằng chữ cái đầu.
 */
export class ShopReviewDto extends ReviewDto {
  @ApiProperty({ description: 'Xe đã thuê — để mở trang chi tiết từ đánh giá' })
  vehicleId!: string;

  @ApiProperty({ description: 'Tên xe đã thuê' }) vehicleName!: string;
}

export class ShopReviewPageDto {
  @ApiProperty({ type: ReviewSummaryDto }) summary!: ReviewSummaryDto;
  @ApiProperty({ type: [ShopReviewDto] }) data!: ShopReviewDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
