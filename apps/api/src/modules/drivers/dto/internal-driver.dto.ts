import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_STATUS_VALUES,
  EXTERNAL_DRIVER_NAME_LENGTH,
  INTERNAL_DRIVER_NOTE_MAX,
  INTERNAL_DRIVER_PAGE_MAX,
  VN_MOBILE_PHONE_PATTERN,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { PhoneInput } from '../../../common/phone';

const DEFAULT_LIMIT = 20;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Trần độ dài URL ảnh — URL kho R2 thật dài chừng 150 ký tự. */
const PHOTO_URL_MAX = 1000;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
/** Ô ghi chú: chuỗi rỗng sau khi cắt ⇒ `null` (xoá ghi chú). */
const trimToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

/**
 * Danh sách danh bạ tài xế nội bộ (ADR 0108) — phân trang + tìm theo tên/SĐT ở server.
 * Mặc định chỉ dòng đang dùng; `archived=true` xem các dòng đã lưu trữ.
 */
export class InternalDriverListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên / SĐT' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'true = danh sách đã lưu trữ; bỏ trống = đang dùng' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: INTERNAL_DRIVER_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INTERNAL_DRIVER_PAGE_MAX)
  limit?: number;
}

export { DEFAULT_LIMIT as INTERNAL_DRIVER_DEFAULT_LIMIT };

export class CreateInternalDriverDto {
  @ApiProperty({
    example: 'Nguyễn Văn Tài',
    minLength: EXTERNAL_DRIVER_NAME_LENGTH.MIN,
    maxLength: EXTERNAL_DRIVER_NAME_LENGTH.MAX,
  })
  @Transform(trim)
  @IsString()
  @Length(EXTERNAL_DRIVER_NAME_LENGTH.MIN, EXTERNAL_DRIVER_NAME_LENGTH.MAX)
  name!: string;

  @ApiProperty({
    example: '0901234567',
    pattern: VN_MOBILE_PHONE_PATTERN.source,
    description: 'Di động VN (`0…` / `84…` / `+84…`, lưu `0…`) - khách gọi số này để gặp tài xế',
  })
  @PhoneInput()
  @IsString()
  @Matches(VN_MOBILE_PHONE_PATTERN, { message: 'Số điện thoại di động không hợp lệ' })
  phone!: string;

  @ApiPropertyOptional({ type: String, maxLength: INTERNAL_DRIVER_NOTE_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(INTERNAL_DRIVER_NOTE_MAX)
  note?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Ảnh TUỲ CHỌN - URL công khai trả về từ `POST /uploads/driver-photos/presign` của chính bên thuê',
  })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(PHOTO_URL_MAX)
  photoUrl?: string | null;
}

/** Sửa một tài xế đang dùng — gửi trường nào đổi trường đó. Đơn đã gán giữ ảnh chụp cũ (ADR 0108). */
export class UpdateInternalDriverDto {
  @ApiPropertyOptional({
    minLength: EXTERNAL_DRIVER_NAME_LENGTH.MIN,
    maxLength: EXTERNAL_DRIVER_NAME_LENGTH.MAX,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(EXTERNAL_DRIVER_NAME_LENGTH.MIN, EXTERNAL_DRIVER_NAME_LENGTH.MAX)
  name?: string;

  @ApiPropertyOptional({ pattern: VN_MOBILE_PHONE_PATTERN.source })
  @IsOptional()
  @PhoneInput()
  @IsString()
  @Matches(VN_MOBILE_PHONE_PATTERN, { message: 'Số điện thoại di động không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ type: String, maxLength: INTERNAL_DRIVER_NOTE_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(INTERNAL_DRIVER_NOTE_MAX)
  note?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ảnh mới (URL từ presign của bên thuê) - `null` = gỡ ảnh, bỏ trống = giữ',
  })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(PHOTO_URL_MAX)
  photoUrl?: string | null;
}

export class InternalDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Dạng `0…`' }) phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh tuỳ chọn' })
  photoUrl!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC - null = đang dùng',
  })
  archivedAt!: string | null;
  @ApiProperty({ description: 'Số đơn chưa xong (đang giữ chỗ / đang chạy) gán cho người này' })
  activeTripCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class InternalDriverPageDto {
  @ApiProperty({ type: [InternalDriverDto] }) data!: InternalDriverDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * `GET /internal-drivers/:id/trips` — các đơn đã gán người này, TRẢ XE trong tháng (giờ VN).
 * Tài xế nội bộ không có tiền công (ADR 0108) nên bảng chỉ có đơn, không có số tiền.
 */
export class InternalDriverTripListQueryDto {
  @ApiPropertyOptional({ description: 'Tháng YYYY-MM (giờ VN) - mặc định tháng hiện tại' })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'Tháng phải có dạng YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã đơn, tên/SĐT khách, tên xe, biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: INTERNAL_DRIVER_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INTERNAL_DRIVER_PAGE_MAX)
  limit?: number;
}

export class InternalDriverTripRowDto {
  @ApiProperty({ description: 'ID đơn' }) bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) bookingStatus!: string;
  @ApiProperty() pickupAt!: string;
  @ApiProperty() returnAt!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
}

export class InternalDriverTripPageDto {
  @ApiProperty({ type: [InternalDriverTripRowDto] }) data!: InternalDriverTripRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class AssignableInternalDriversQueryDto {
  @ApiProperty({ description: 'Nhận xe của đơn (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  @ApiProperty({ description: 'Trả xe của đơn (ISO-8601)' })
  @IsDateString()
  returnAt!: string;

  @ApiPropertyOptional({ description: 'ID đơn đang gán (ULID) - loại khỏi kiểm tra trùng' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  excludeBookingId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên / SĐT (bộ chọn trả tối đa 200 người)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

/** Một tài xế nội bộ trong bộ chọn gán đơn — trả cả người bận kèm cờ, không nói bận ở đơn nào. */
export class AssignableInternalDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!: string | null;
  @ApiProperty({ description: 'Đã gán một đơn khác của bên thuê giao khung giờ này' })
  busy!: boolean;
}

export class AssignableInternalDriversDto {
  @ApiProperty({ type: [AssignableInternalDriverDto] }) data!: AssignableInternalDriverDto[];
}
