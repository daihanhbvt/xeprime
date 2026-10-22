import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DRIVER_LICENCE_DECISION_SOURCE_VALUES,
  DRIVER_LICENCE_KIND_VALUES,
  DRIVER_LICENCE_QUALITY_ISSUE_VALUES,
  DRIVER_LICENCE_READING_CONFIDENCE_VALUES,
  DRIVER_LICENCE_REJECT_REASON_VALUES,
  DRIVER_LICENCE_STATUS_VALUES,
  DRIVER_LICENCE_UPLOAD_MAX_BYTES,
  DRIVER_LICENCE_UPLOAD_MIME_TYPES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const DRIVER_LICENCE_DEFAULT_LIMIT = 20;
export const DRIVER_LICENCE_MAX_LIMIT = 100;

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
    type: String,
    nullable: true,
    description: 'LEGACY — lúc khách nhờ xem lại (trước ADR 0070). Không còn writer.',
  })
  reviewRequestedAt!: string | null;
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
  @ApiProperty({ type: String, nullable: true, enum: DRIVER_LICENCE_READING_CONFIDENCE_VALUES })
  confidence!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Ghi chú của bộ đọc cho người duyệt' })
  notes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Mã lỗi khi bộ đọc hỏng' })
  errorCode!: string | null;
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

/** Lịch sử nộp bằng lái của MỘT khách — cho hồ sơ khách thuê (ADR 0070). */
export class PlatformDriverLicenceListQueryDto {
  @ApiProperty({ description: 'Tài khoản khách' })
  @IsString()
  @MinLength(26)
  @MaxLength(26)
  userId!: string;

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
