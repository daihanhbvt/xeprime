import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SERVICE_TYPE_VALUES, VEHICLE_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Cách sắp xếp kết quả marketplace. */
export const LISTING_SORT = ['newest', 'price_asc', 'price_desc'] as const;
export type ListingSort = (typeof LISTING_SORT)[number];

/**
 * Query trang marketplace — luôn phân trang, filter và scope ở tầng DB (skill backend-endpoint).
 * `limit` có trần cứng để client không kéo cả bảng.
 */
export class PublicListingQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'car | motorbike' })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'Hãng xe' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Số chỗ tối thiểu' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  minSeats?: number;

  @ApiPropertyOptional({ description: 'Tìm theo tên/hãng/model' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: LISTING_SORT, default: 'newest' })
  @IsOptional()
  @IsIn(LISTING_SORT)
  sort?: ListingSort;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}

export class PublicListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({ nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ nullable: true }) mainImageUrl!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Tiền dạng string — ADR 0007' })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  weekendPrice!: string | null;

  @ApiProperty({ description: 'Tên gian hàng' }) shopName!: string;
  @ApiProperty({ description: 'Slug gian hàng cho route /shops/[slug]' }) shopSlug!: string;
}

export class PublicListingPageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() hasNext!: boolean;
}

export class PublicListingPageDto {
  @ApiProperty({ type: [PublicListingDto] }) data!: PublicListingDto[];
  @ApiProperty({ type: PublicListingPageMetaDto }) meta!: PublicListingPageMetaDto;
}
