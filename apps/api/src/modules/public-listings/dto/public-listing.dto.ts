import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SERVICE_TYPE_VALUES, VEHICLE_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Lọc theo tỉnh/thành của gian hàng' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Giá thuê/ngày tối thiểu (VND)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional({ description: 'Giá thuê/ngày tối đa (VND)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({ description: 'Nhận xe (ISO-8601) — lọc xe rảnh trong khoảng' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601) — dùng cùng pickupAt' })
  @IsOptional()
  @IsISO8601()
  returnAt?: string;

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
  // `type` tường minh cho field nullable, nếu không openapi-typescript sinh `Record<string,never>`.
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền dạng string — ADR 0007' })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  weekendPrice!: string | null;

  @ApiProperty({ description: 'Tên gian hàng' }) shopName!: string;
  @ApiProperty({ description: 'Slug gian hàng cho route /shops/[slug]' }) shopSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/thành gian hàng' })
  shopProvince!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Điểm đánh giá trung bình CỦA XE (review published). Null khi chưa có đánh giá.',
  })
  ratingAvg!: string | null;

  @ApiProperty({ description: 'Số lượt đánh giá của xe' }) ratingCount!: number;
}

/** Chi tiết một xe trên marketplace — cho trang `/listings/[id]`. */
export class PublicListingDetailDto extends PublicListingDto {
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Logo gian hàng' })
  shopLogoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giới thiệu gian hàng' })
  shopBio!: string | null;

  @ApiProperty({ type: [String], description: 'URL ảnh gallery theo thứ tự' })
  images!: string[];

  @ApiProperty({ type: [String], description: 'Key tiện ích (VEHICLE_FEATURE_LABEL)' })
  features!: string[];
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

/** Hồ sơ công khai của một gian hàng — cho trang `/shops/[slug]`. Chỉ dữ liệu công khai. */
export class PublicShopDto {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Slug gian hàng' }) slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số điện thoại liên hệ' })
  phone!: string | null;

  @ApiProperty({ description: 'Điểm đánh giá trung bình, string — ADR 0007' })
  ratingAvg!: string;

  @ApiProperty() ratingCount!: number;
}

/**
 * Một tỉnh/thành có xe đang cho thuê — "Địa điểm nổi bật" ở trang chủ. Số liệu tính từ snapshot
 * `public_listings` (không hardcode danh sách tỉnh ở FE).
 */
export class PublicDestinationDto {
  @ApiProperty({ description: 'Tên tỉnh/thành — dùng luôn làm giá trị lọc `province`' })
  provinceName!: string;

  @ApiProperty({ description: 'Số xe đang hiển thị công khai ở tỉnh/thành này' })
  vehicleCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh đại diện lấy từ một xe' })
  imageUrl!: string | null;
}

/** Query "địa điểm nổi bật" — chỉ cần giới hạn số lượng (63 tỉnh/thành là trần tự nhiên). */
export class PublicDestinationQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 63 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(63)
  limit?: number;
}

/** Gian hàng trong danh sách công khai — "Gian hàng nổi bật" ở trang chủ. */
export class PublicShopSummaryDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiProperty({ description: 'Số xe đang hiển thị công khai' }) vehicleCount!: number;

  @ApiProperty({ description: 'Điểm đánh giá trung bình, string — ADR 0007' })
  ratingAvg!: string;

  @ApiProperty() ratingCount!: number;
}

export class PublicShopPageDto {
  @ApiProperty({ type: [PublicShopSummaryDto] }) data!: PublicShopSummaryDto[];
  @ApiProperty({ type: PublicListingPageMetaDto }) meta!: PublicListingPageMetaDto;
}

/** Query danh sách gian hàng công khai — phân trang, sắp theo điểm đánh giá. */
export class PublicShopListQueryDto {
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

/** Query danh sách xe của một gian hàng — phân trang + sort (không nhận slug qua body). */
export class ShopListingQueryDto {
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
