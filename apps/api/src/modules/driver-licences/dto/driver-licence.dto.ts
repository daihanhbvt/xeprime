import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DRIVER_LICENCE_DECISION_SOURCE_VALUES,
  DRIVER_LICENCE_KIND_VALUES,
  DRIVER_LICENCE_PENDING_REASON_VALUES,
  DRIVER_LICENCE_QUALITY_ISSUE_VALUES,
  DRIVER_LICENCE_REJECT_REASON_VALUES,
  DRIVER_LICENCE_STATUS_VALUES,
  DRIVER_LICENCE_UPLOAD_MAX_BYTES,
  DRIVER_LICENCE_UPLOAD_MIME_TYPES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const DRIVER_LICENCE_DEFAULT_LIMIT = 20;
export const DRIVER_LICENCE_MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Phía khách ─────────────────────────────────────────────────────────────────────────────

export class PresignDriverLicenceDto {
  @ApiProperty({ enum: DRIVER_LICENCE_UPLOAD_MIME_TYPES })
  @IsIn(DRIVER_LICENCE_UPLOAD_MIME_TYPES)
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: DRIVER_LICENCE_UPLOAD_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(DRIVER_LICENCE_UPLOAD_MAX_BYTES)
  fileSize!: number;

  @ApiProperty({
    enum: [true],
    description: 'Khách đồng ý cho XePrime và nhà cung cấp đọc ảnh xử lý ảnh bằng lái để xác thực.',
  })
  @Equals(true)
  consent!: boolean;
}

export class DriverLicencePresignDto {
  @ApiProperty() licenceId!: string;
  @ApiProperty({ description: 'URL PUT riêng tư, sống ngắn — tải ảnh thẳng lên kho lưu trữ.' })
  uploadUrl!: string;
  @ApiProperty() expiresIn!: number;
}

/**
 * Một lượt nộp bằng lái — đúng những gì CHÍNH chủ tài khoản được thấy. Không có `object_key`,
 * không có kết quả thô của bộ đọc; ảnh mở qua endpoint riêng phát URL sống ngắn.
 */
export class DriverLicenceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DRIVER_LICENCE_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: DRIVER_LICENCE_KIND_VALUES, nullable: true, type: String })
  kind!: string | null;
  @ApiProperty({ type: String, nullable: true }) licenceNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  dateOfBirth!: string | null;
  @ApiProperty({ type: [String], description: 'Hạng đã chuẩn hoá, vd ["A1","B2"]' })
  classes!: string[];
  @ApiProperty({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  issuedOn!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  expiresOn!: string | null;
  @ApiProperty() noExpiry!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'ISO 3166-1 alpha-2' })
  issuingCountry!: string | null;
  @ApiProperty() coversCar!: boolean;
  @ApiProperty() coversMotorbike!: boolean;
  @ApiProperty({ enum: DRIVER_LICENCE_REJECT_REASON_VALUES, nullable: true, type: String })
  rejectionReason!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Lời nhắn của người duyệt' })
  reviewNote!: string | null;
  @ApiProperty({
    type: [String],
    enum: DRIVER_LICENCE_QUALITY_ISSUE_VALUES,
    description: 'Vấn đề chất lượng ảnh bộ đọc nhận ra — để gợi ý cách chụp lại.',
  })
  qualityIssues!: string[];
  @ApiProperty({
    description: 'Bị máy từ chối vì lý do máy có thể đọc sai — nhờ người xem lại được.',
  })
  canRequestReview!: boolean;
  @ApiProperty({ type: String, nullable: true }) reviewRequestedAt!: string | null;
  @ApiProperty({ enum: DRIVER_LICENCE_DECISION_SOURCE_VALUES, nullable: true, type: String })
  decisionSource!: string | null;
  @ApiProperty({ type: String, nullable: true }) decidedAt!: string | null;
  @ApiProperty() submittedAt!: string;
}

/**
 * Bằng lái của tài khoản: bằng ĐANG DÙNG và lượt nộp GẦN NHẤT (có thể là cùng một dòng). Cổng
 * đặt xe soát trên đúng cặp này (`evaluateDriverLicenceForTrip`).
 */
export class DriverLicenceOverviewDto {
  @ApiProperty({ type: DriverLicenceDto, nullable: true }) verified!: DriverLicenceDto | null;
  @ApiProperty({ type: DriverLicenceDto, nullable: true }) latest!: DriverLicenceDto | null;
}

export class DriverLicenceImageDto {
  @ApiProperty({ description: 'URL xem ảnh, sống ngắn.' }) url!: string;
  @ApiProperty() expiresIn!: number;
}

// ── Phía nền tảng ──────────────────────────────────────────────────────────────────────────

export class PlatformDriverLicenceOwnerDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Luôn che — xem đầy đủ qua "Hiện liên hệ" ở màn Khách thuê (quyền PII + audit)',
  })
  phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
}

export class PlatformDriverLicenceReadingDto {
  @ApiProperty({ type: String, nullable: true }) provider!: string | null;
  @ApiProperty({ type: String, nullable: true }) model!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['high', 'medium', 'low'] })
  confidence!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Ghi chú của bộ đọc cho người duyệt' })
  notes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Mã lỗi khi bộ đọc hỏng' })
  errorCode!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: DRIVER_LICENCE_PENDING_REASON_VALUES,
    description: 'Vì sao lượt nộp phải chờ người duyệt',
  })
  pendingReason!: string | null;
}

export class PlatformDriverLicenceDto extends DriverLicenceDto {
  @ApiProperty({ type: PlatformDriverLicenceOwnerDto }) owner!: PlatformDriverLicenceOwnerDto;
  @ApiProperty({ type: PlatformDriverLicenceReadingDto }) reading!: PlatformDriverLicenceReadingDto;
  @ApiProperty({ type: String, nullable: true }) decidedByName!: string | null;
}

export class PlatformDriverLicencePageDto {
  @ApiProperty({ type: [PlatformDriverLicenceDto] }) data!: PlatformDriverLicenceDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PlatformDriverLicenceCountsDto {
  @ApiProperty() pendingReview!: number;
  @ApiProperty() verified!: number;
  @ApiProperty() rejected!: number;
}

export class PlatformDriverLicenceListQueryDto {
  @ApiPropertyOptional({
    enum: DRIVER_LICENCE_STATUS_VALUES,
    description: 'Bỏ trống = hàng đợi CHỜ DUYỆT, cũ nhất trước',
  })
  @IsOptional()
  @IsIn(DRIVER_LICENCE_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: DRIVER_LICENCE_KIND_VALUES })
  @IsOptional()
  @IsIn(DRIVER_LICENCE_KIND_VALUES)
  kind?: string;

  @ApiPropertyOptional({
    description: 'Tìm theo họ tên trên bằng / số bằng / tên hoặc SĐT tài khoản',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: DRIVER_LICENCE_DEFAULT_LIMIT,
    minimum: 1,
    maximum: DRIVER_LICENCE_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DRIVER_LICENCE_MAX_LIMIT)
  limit?: number;
}

/**
 * Người duyệt CHỐT thông tin trên bằng — sửa được chỗ máy đọc sai, và với bằng nước ngoài thì
 * tự quyết hai cờ "lái được ô tô / xe máy". Server kiểm lại: còn hạn, có ít nhất một loại xe.
 */
export class ApproveDriverLicenceDto {
  @ApiProperty({ enum: DRIVER_LICENCE_KIND_VALUES })
  @IsIn(DRIVER_LICENCE_KIND_VALUES)
  kind!: string;

  @ApiProperty()
  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(40)
  licenceNumber!: string;

  @ApiProperty()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  dateOfBirth?: string | null;

  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @MaxLength(8, { each: true })
  classes!: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  issuedOn?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'YYYY-MM-DD; bỏ trống khi không thời hạn',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  expiresOn?: string | null;

  @ApiProperty()
  @IsBoolean()
  noExpiry!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  issuingCountry?: string | null;

  @ApiProperty({ description: 'Chỉ có tác dụng với bằng nước ngoài — GPLX VN/IDP suy từ hạng.' })
  @IsBoolean()
  coversCar!: boolean;

  @ApiProperty({ description: 'Chỉ có tác dụng với bằng nước ngoài — GPLX VN/IDP suy từ hạng.' })
  @IsBoolean()
  coversMotorbike!: boolean;
}

export class RejectDriverLicenceDto {
  @ApiProperty({ enum: DRIVER_LICENCE_REJECT_REASON_VALUES })
  @IsIn(DRIVER_LICENCE_REJECT_REASON_VALUES)
  reason!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bắt buộc khi lý do là "other"',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  note?: string | null;
}
