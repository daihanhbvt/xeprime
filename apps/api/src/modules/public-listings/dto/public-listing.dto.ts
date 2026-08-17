import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  BODY_TYPE_VALUES,
  DEFAULT_LISTING_SORT,
  FUEL_TYPE_VALUES,
  LISTING_SORT_VALUES,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_TYPE_VALUES,
  type ListingSort,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Query param dạng CSV (`sedan,suv`) → mảng để validate `each` — URL searchParams thân thiện
 * hơn repeated param, FE join(',') một chỗ.
 */
const splitCsv = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

/** Query param boolean-ish (`1`/`true`) → boolean; giá trị lạ giữ nguyên để @IsBoolean chặn. */
const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

/**
 * Query trang marketplace — luôn phân trang, filter và scope ở tầng DB (skill backend-endpoint).
 * `limit` có trần cứng để client không kéo cả bảng. Các chiều facet nhận CSV multi-select;
 * wire type khai là String (CSV) để contract FE sinh ra đúng thứ đi trên URL.
 */
export class PublicListingQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'car | motorbike' })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  /** Lọc "xe PHỤC VỤ ĐƯỢC dịch vụ X" — `has` trên mảng `service_types` (tab/chip dịch vụ). */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Hãng xe — CSV, multi-select (vd: Toyota,Kia)',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  brand?: string[];

  @ApiPropertyOptional({ type: String, description: 'Kiểu dáng thân xe — CSV (BODY_TYPE)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(BODY_TYPE_VALUES, { each: true })
  bodyType?: string[];

  @ApiPropertyOptional({ type: String, description: 'Bucket số chỗ — CSV (4,5,7,8plus)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(SEAT_BUCKET_VALUES, { each: true })
  seats?: string[];

  @ApiPropertyOptional({ type: String, description: 'Nhiên liệu — CSV (FUEL_TYPE)' })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(FUEL_TYPE_VALUES, { each: true })
  fuelType?: string[];

  @ApiPropertyOptional({
    type: String,
    description: 'Tiện ích xe — CSV (VEHICLE_FEATURE_LABEL); xe phải có ĐỦ các key đã chọn',
  })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsIn(VEHICLE_FEATURE_KEYS, { each: true })
  features?: string[];

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe có giá thuê giờ' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hourly?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe giao tận nơi' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  delivery?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe miễn thế chấp' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  noCollateral?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ xe đang giảm giá' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  discount?: boolean;

  @ApiPropertyOptional({ description: 'Số chỗ tối thiểu (giữ tương thích cũ — mới dùng `seats`)' })
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

  /**
   * THAM SỐ CHUẨN để lọc theo địa điểm: mã tỉnh 2 ký tự, khớp CHÍNH XÁC.
   *
   * Mã thay tên vì tên tỉnh vừa đổi được (sáp nhập 01/07/2025) vừa có nhiều cách viết
   * ("TP.HCM"/"Hồ Chí Minh"), còn URL đã phát ra ngoài thì sống rất lâu.
   */
  @ApiPropertyOptional({
    description: 'Mã tỉnh 2 ký tự — tham số chuẩn (GET /public/destinations)',
  })
  @IsOptional()
  @IsString()
  provinceCode?: string;

  /**
   * TƯƠNG THÍCH NGƯỢC: tên tỉnh dạng tự do từ link/bookmark cũ.
   *
   * Controller quy nó về `provinceCode` qua bảng bí danh rồi mới lọc; không quy được thì KHÔNG
   * tìm cả nước (đó là trả về xe ở sai tỉnh) mà trả rỗng kèm cờ `unresolvedProvince` để FE nói
   * rõ với người dùng. Không sinh URL mới theo dạng này nữa.
   */
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Tên tỉnh (link cũ) — được quy về provinceCode qua bí danh',
  })
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

  @ApiPropertyOptional({ enum: LISTING_SORT_VALUES, default: DEFAULT_LISTING_SORT })
  @IsOptional()
  @IsIn(LISTING_SORT_VALUES)
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

/** Query facets — cùng bộ filter với search; sort/paging vô nghĩa với đếm nên bỏ. */
export class ListingFacetsQueryDto extends OmitType(PublicListingQueryDto, [
  'sort',
  'page',
  'limit',
] as const) {}

export class PublicListingDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  // `type` tường minh cho field nullable, nếu không openapi-typescript sinh `Record<string,never>`.
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Kiểu dáng (BODY_TYPE)' })
  bodyType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền dạng string — ADR 0007' })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  weekendPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê giờ (string — ADR 0007). Null = xe không cho thuê theo giờ.',
  })
  hourlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá tháng tham chiếu thuê dài hạn (string — ADR 0007).',
  })
  monthlyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày đã gồm tài xế (string — ADR 0007). Null = gian hàng báo khi duyệt.',
  })
  withDriverDailyPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế lộ trình liên tỉnh — string tiền (ADR 0007)',
  })
  withDriverInterCityPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế lộ trình liên tỉnh 1 chiều — string tiền (ADR 0007)',
  })
  withDriverOneWayPrice!: string | null;

  @ApiProperty({ description: 'Chủ xe hỗ trợ giao xe tận nơi' }) deliveryEnabled!: boolean;
  @ApiProperty({ description: 'Miễn thế chấp (không cần cọc tài sản)' }) noCollateral!: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% khuyến mãi trực tiếp cho tiền thuê tự lái (0–100)',
  })
  discountPercent!: number | null;

  @ApiProperty({ description: 'Tên gian hàng' }) shopName!: string;
  @ApiProperty({ description: 'Slug gian hàng cho route /shops/[slug]' }) shopSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/thành gian hàng' })
  shopProvince!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã tỉnh nơi xe đang đỗ (theo chi nhánh) — dùng để lọc/điều hướng',
  })
  provinceCode!: string | null;

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

/** Một option trong một chiều facet — key giá trị + số listing khớp. */
export class FacetBucketDto {
  @ApiProperty({ description: 'Giá trị của option (body type key, tên hãng, bucket số chỗ…)' })
  key!: string;

  @ApiProperty({ description: 'Số listing khớp nếu chọn option này' })
  count!: number;
}

/** Biên giá thuê/ngày của tập listing khớp filter (bỏ qua chính filter giá) — nuôi slider. */
export class PriceBoundsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thấp nhất — string tiền (ADR 0007)',
  })
  min!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá cao nhất — string tiền (ADR 0007)',
  })
  max!: string | null;
}

/** Số listing khớp cho từng toggle tiện ích (mỗi số đã bỏ qua chính toggle đó). */
export class AmenityFacetsDto {
  @ApiProperty({ description: 'Xe có giá thuê giờ' }) hourly!: number;
  @ApiProperty({ description: 'Xe giao tận nơi' }) delivery!: number;
  @ApiProperty({ description: 'Xe miễn thế chấp' }) noCollateral!: number;
  @ApiProperty({ description: 'Xe đang giảm giá' }) discount!: number;
}

/**
 * Facet counts cho panel Bộ lọc — semantics chuẩn faceted search: MỖI chiều được đếm với toàn
 * bộ filter đang chọn TRỪ chính chiều đó (chọn SUV vẫn thấy Sedan còn bao nhiêu xe).
 * `total` là số xe khớp TẤT CẢ filter — nuôi nút "Áp dụng (N xe)".
 */
export class ListingFacetsDto {
  @ApiProperty({ description: 'Số xe khớp toàn bộ filter — nút "Áp dụng (N xe)"' }) total!: number;
  @ApiProperty({ type: PriceBoundsDto }) price!: PriceBoundsDto;
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo kiểu dáng (BODY_TYPE key)' })
  bodyType!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo hãng xe (tên hãng như đã lưu)' })
  brand!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo bucket số chỗ (SEAT_BUCKET key)' })
  seats!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo nhiên liệu (FUEL_TYPE key)' })
  fuelType!: FacetBucketDto[];
  @ApiProperty({ type: [FacetBucketDto], description: 'Theo tiện ích xe (VEHICLE_FEATURE key)' })
  features!: FacetBucketDto[];
  @ApiProperty({ type: AmenityFacetsDto }) amenities!: AmenityFacetsDto;
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
  @ApiProperty({ description: 'Mã tỉnh — giá trị đi vào URL và bộ lọc `provinceCode`' })
  provinceCode!: string;

  @ApiProperty({ description: 'Tên tỉnh chuẩn — chỉ để HIỂN THỊ, không dùng để lọc' })
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
  @ApiPropertyOptional({ enum: LISTING_SORT_VALUES, default: DEFAULT_LISTING_SORT })
  @IsOptional()
  @IsIn(LISTING_SORT_VALUES)
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
