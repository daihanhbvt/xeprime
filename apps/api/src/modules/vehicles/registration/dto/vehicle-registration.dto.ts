import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  VEHICLE_REGISTRATION_LIMITS as LIMITS,
  VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES,
} from '@xeprime/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Mã khung / máy: viết hoa, bỏ khoảng trắng — "rl4 bx12" và "RL4BX12" là một. */
const code = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : value;

/** Bắt đầu tải ảnh cà vẹt cho một ô tô SẮP tạo (ADR 0089). */
export class PresignVehicleRegistrationDto {
  @ApiProperty({ enum: IMAGE_UPLOAD_MIME_TYPES })
  @IsIn(IMAGE_UPLOAD_MIME_TYPES)
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES)
  fileSize!: number;
}

export class VehicleRegistrationPresignDto {
  @ApiProperty() uploadId!: string;
  @ApiProperty({ description: 'URL PUT riêng tư, sống ngắn - tải ảnh thẳng lên kho lưu trữ.' })
  uploadUrl!: string;
  @ApiProperty() expiresIn!: number;
}

/** Các trường máy đọc được trên cà vẹt — `null` = không đọc được chắc chắn, chủ xe nhập tay. */
export class VehicleRegistrationReadingDto {
  @ApiProperty({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) holderName!: string | null;
  @ApiProperty({ type: String, nullable: true }) holderAddress!: string | null;
  @ApiProperty({ type: String, nullable: true }) chassisNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) engineNumber!: string | null;
}

export class VehicleRegistrationReadResultDto {
  @ApiProperty() uploadId!: string;
  @ApiProperty({ type: VehicleRegistrationReadingDto })
  reading!: VehicleRegistrationReadingDto;
  @ApiProperty({
    description:
      'Máy đọc có chạy được không. `false` (tắt, quá tải, ảnh không giải mã được) ⇒ mọi trường ' +
      '`null`, chủ xe nhập tay - ảnh vẫn dùng được để tạo xe.',
  })
  readerAvailable!: boolean;
}

/**
 * Cà vẹt gửi kèm lượt tạo ô tô — ảnh đã tải (`uploadId`) + các trường ĐÃ được chủ xe xác nhận
 * (máy đọc điền sẵn, chủ xe sửa/nhập phần thiếu). Server không tin "máy đã đọc": trường bắt buộc
 * phải có mặt ở đây.
 */
export class CreateVehicleRegistrationDto {
  @ApiProperty({
    description: 'Id lượt tải ảnh cà vẹt (POST /vehicle-registration-uploads/presign).',
  })
  @IsString()
  @Length(26, 26)
  uploadId!: string;

  @ApiProperty({ maxLength: LIMITS.holderNameMax })
  @Transform(trim)
  @IsString()
  @Length(2, LIMITS.holderNameMax)
  holderName!: string;

  @ApiProperty({ minLength: LIMITS.chassisNumberMin, maxLength: LIMITS.chassisNumberMax })
  @Transform(code)
  @IsString()
  @Length(LIMITS.chassisNumberMin, LIMITS.chassisNumberMax)
  @Matches(/^[A-Z0-9-]+$/, { message: 'chassisNumber chỉ gồm chữ và số' })
  chassisNumber!: string;

  @ApiProperty({ minLength: LIMITS.engineNumberMin, maxLength: LIMITS.engineNumberMax })
  @Transform(code)
  @IsString()
  @Length(LIMITS.engineNumberMin, LIMITS.engineNumberMax)
  @Matches(/^[A-Z0-9-]+$/, { message: 'engineNumber chỉ gồm chữ và số' })
  engineNumber!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITS.holderAddressMax })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(LIMITS.holderAddressMax)
  holderAddress?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: LIMITS.plateNumberMax,
    description: 'Biển số in trên cà vẹt. Vắng ⇒ lấy biển số của xe.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(LIMITS.plateNumberMax)
  plateNumber?: string | null;
}
