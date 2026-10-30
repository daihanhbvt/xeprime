import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BANNER_PLACEMENT, BANNER_PLACEMENT_VALUES, type BannerPlacement } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { SAFE_URL_PATTERN } from '../../../common/safe-url';

/** Lọc theo vị trí — bỏ trống = dải banner đầu trang (`hero`), đúng hành vi trước khi có vị trí. */
export class BannerPlacementQueryDto {
  @ApiPropertyOptional({
    enum: BANNER_PLACEMENT_VALUES,
    default: BANNER_PLACEMENT.HERO,
    description: 'hero = dải banner đầu trang · promo = banner khuyến mãi giữa trang',
  })
  @IsOptional()
  @IsIn(BANNER_PLACEMENT_VALUES)
  placement?: BannerPlacement;
}

/** Banner như KHÁCH nhìn thấy — chỉ các trường cần để render, không lộ metadata quản trị. */
export class PublicBannerDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Ảnh desktop' }) imageUrl!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ảnh tablet (1024×450) — null thì client fallback ảnh desktop',
  })
  tabletImageUrl!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ảnh mobile (780×450) — null thì client fallback tablet rồi desktop',
  })
  mobileImageUrl!: string | null;
  @ApiProperty() altText!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Đích đến khi bấm — null = không bấm được',
  })
  linkUrl!: string | null;
}

/** Banner ở màn quản trị — đủ metadata + cờ "đang hiển thị thật" đã tính sẵn theo lịch. */
export class AdminBannerDto extends PublicBannerDto {
  @ApiProperty({ description: 'Tên nội bộ' }) title!: string;
  @ApiProperty({ enum: BANNER_PLACEMENT_VALUES, description: 'Vị trí trên trang chủ' })
  placement!: BannerPlacement;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  startsAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  endsAt!: string | null;
  @ApiProperty({
    description:
      'Đang thực sự hiển thị ngoài trang chủ (active + trong khung lịch) tại thời điểm trả về',
  })
  visibleNow!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

export class CreateBannerDto {
  @ApiPropertyOptional({
    enum: BANNER_PLACEMENT_VALUES,
    default: BANNER_PLACEMENT.HERO,
    description: 'Vị trí — đặt lúc tạo, KHÔNG đổi được về sau (mỗi vị trí một bộ khổ ảnh)',
  })
  @IsOptional()
  @IsIn(BANNER_PLACEMENT_VALUES)
  placement?: BannerPlacement;

  @ApiProperty({
    example: 'Chiến dịch hè 2026',
    description: 'Tên nội bộ — không hiển thị công khai',
  })
  @IsString()
  @Matches(/\S/, { message: 'Nhập tên banner' })
  @MaxLength(150)
  title!: string;

  @ApiProperty({ description: 'URL ảnh desktop (upload qua presign R2)' })
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'imageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  imageUrl!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'URL ảnh tablet 1024×450 (chỉ banner đầu trang) — bỏ trống dùng ảnh desktop',
  })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'tabletImageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  tabletImageUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'URL ảnh mobile — bỏ trống dùng ảnh desktop',
  })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'mobileImageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  mobileImageUrl?: string | null;

  @ApiProperty({ description: 'Mô tả ảnh cho screen reader — bắt buộc' })
  @IsString()
  @Matches(/\S/, { message: 'Nhập mô tả ảnh (alt)' })
  @MaxLength(255)
  altText!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Đích đến khi bấm banner' })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'linkUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  linkUrl?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bắt đầu hiển thị (ISO) — bỏ trống = ngay lập tức',
  })
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ngừng hiển thị (ISO) — bỏ trống = vô hạn',
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

/** Sửa banner — mọi trường optional; gửi `null` để XOÁ giá trị (ảnh mobile, link, lịch). */
export class UpdateBannerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Nhập tên banner' })
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'imageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'tabletImageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  tabletImageUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'mobileImageUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  mobileImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Nhập mô tả ảnh (alt)' })
  @MaxLength(255)
  altText?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(SAFE_URL_PATTERN, { message: 'linkUrl phải là http(s) hoặc path nội bộ' })
  @MaxLength(2000)
  linkUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

/** Kéo-thả/mũi tên sắp xếp: gửi TRỌN thứ tự mới — tránh nhiều PATCH lẻ lệch nhau. */
export class ReorderBannersDto {
  @ApiPropertyOptional({
    enum: BANNER_PLACEMENT_VALUES,
    default: BANNER_PLACEMENT.HERO,
    description: 'Vị trí đang sắp — thứ tự tính riêng từng vị trí',
  })
  @IsOptional()
  @IsIn(BANNER_PLACEMENT_VALUES)
  placement?: BannerPlacement;

  @ApiProperty({
    type: [String],
    description: 'Toàn bộ id banner CỦA VỊ TRÍ ĐÓ theo thứ tự hiển thị mới',
  })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
