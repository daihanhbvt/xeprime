import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DRIVER_STATUS_VALUES, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
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

/** Ngày date-only (YYYY-MM-DD) cho hạn GPLX — không mang giờ để khỏi lệch múi. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as DRIVER_DEFAULT_LIMIT, MAX_LIMIT as DRIVER_MAX_LIMIT };

export class DriverListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên/SĐT/số GPLX' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: DRIVER_STATUS_VALUES })
  @IsOptional()
  @IsIn(DRIVER_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

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

export class CreateDriverDto {
  @ApiProperty({ example: 'Trần Văn B' })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES, default: 'staff' })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số GPLX' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNo?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hạn GPLX (YYYY-MM-DD) — hết hạn thì không gán được vào đơn mới',
    example: '2028-05-20',
  })
  @IsOptional()
  @ValidateIf((o: CreateDriverDto) => o.licenseExpiresAt !== null)
  @Matches(DATE_ONLY, { message: 'Hạn GPLX phải theo dạng YYYY-MM-DD' })
  licenseExpiresAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số CCCD' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNo?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

/** Sửa hồ sơ — mọi trường optional; đổi `status` để ngừng/bật lại hoạt động. */
export class UpdateDriverDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ enum: DRIVER_TYPE_VALUES })
  @IsOptional()
  @IsIn(DRIVER_TYPE_VALUES)
  driverType?: string;

  @ApiPropertyOptional({ enum: DRIVER_STATUS_VALUES })
  @IsOptional()
  @IsIn(DRIVER_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNo?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hạn GPLX (YYYY-MM-DD) — null = xoá hạn',
  })
  @IsOptional()
  @ValidateIf((o: UpdateDriverDto) => o.licenseExpiresAt !== null)
  @Matches(DATE_ONLY, { message: 'Hạn GPLX phải theo dạng YYYY-MM-DD' })
  licenseExpiresAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNo?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: DRIVER_TYPE_VALUES }) driverType!: string;
  @ApiProperty({ enum: DRIVER_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) licenseNo!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hạn GPLX (YYYY-MM-DD) — null = chưa khai',
  })
  licenseExpiresAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) idNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Số đơn đang gán (chưa xong) — chặn hiểu nhầm khi ngừng tài xế' })
  activeBookingCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class DriverPageDto {
  @ApiProperty({ type: [DriverDto] }) data!: DriverDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Tóm tắt tài xế gắn trên đơn thuê. */
export class BookingDriverSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
}

/**
 * GET /drivers/assignable — danh sách tài xế cho bộ chọn gán đơn (17/08): trả CẢ người không
 * khả dụng kèm lý do (bận khung giờ / GPLX hết hạn) để UI disable với giải thích, thay vì
 * lẳng lặng giấu đi khiến người điều phối tưởng shop hết tài xế.
 */
export class AssignableDriversQueryDto {
  @ApiProperty({ description: 'Nhận xe của đơn (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  @ApiProperty({ description: 'Trả xe của đơn (ISO-8601)' })
  @IsDateString()
  returnAt!: string;

  /** Bỏ qua chính đơn đang gán — đổi tài xế của đơn không tự coi đơn đó là "bận". */
  @ApiPropertyOptional({ description: 'ID đơn đang gán (ULID) — loại khỏi kiểm tra trùng' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  excludeBookingId?: string;
}

export class AssignableDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) licenseExpiresAt!: string | null;
  @ApiProperty({ description: 'Đang có đơn sống giao nhau với khung giờ này' }) busy!: boolean;
  @ApiProperty({ description: 'GPLX hết hạn trước thời điểm trả xe' }) licenseExpired!: boolean;
}

export class AssignableDriversDto {
  @ApiProperty({ type: [AssignableDriverDto] }) data!: AssignableDriverDto[];
}
