import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DRIVER_STATUS_VALUES, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
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
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

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
