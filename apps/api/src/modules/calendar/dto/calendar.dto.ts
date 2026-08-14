import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OCCUPANCY_SOURCE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CalendarRangeQueryDto {
  @ApiProperty({ description: 'Đầu khoảng, ISO-8601 UTC', example: '2026-07-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  startAt!: Date;

  @ApiProperty({ description: 'Cuối khoảng, ISO-8601 UTC', example: '2026-08-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  endAt!: Date;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên xe hoặc biển số' })
  @IsOptional()
  @IsString()
  q?: string;

  /** Lọc theo chi nhánh giữ xe — nguồn là bộ chọn chi nhánh ở thanh trên. */
  @ApiPropertyOptional({ description: 'Chỉ hiện xe của một chi nhánh' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  branchId?: string;
}

export class CalendarResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
}

export class CalendarEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'vehicleId — khớp CalendarResourceDto.id' }) resourceId!: string;
  @ApiProperty({ enum: OCCUPANCY_SOURCE_TYPE_VALUES }) type!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) customerName!: string | null;

  @ApiProperty({ description: 'ISO-8601 UTC', example: '2026-07-12T02:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ description: 'ISO-8601 UTC', example: '2026-07-15T04:00:00.000Z' })
  endAt!: string;

  @ApiPropertyOptional({ nullable: true, description: 'BookingStatus khi type=booking' })
  status!: string | null;

  @ApiPropertyOptional({ nullable: true }) sourceId!: string | null;
}

/**
 * Preview trùng lịch cho UX (`POST /calendar/check-conflict`).
 * ADR 0006: KHÔNG phải lớp bảo vệ — chỉ để cảnh báo sớm; chốt chặn thật là exclusion constraint.
 */
export class CheckConflictDto {
  @ApiProperty({ description: 'ID xe (ULID)' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Nhận xe, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  startAt!: Date;

  @ApiProperty({ description: 'Trả xe, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  endAt!: Date;

  @ApiPropertyOptional({ description: 'Bỏ qua nguồn này (khi sửa chính đơn đang xét)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  excludeSourceId?: string;
}

export class ConflictItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() sourceType!: string;
  @ApiProperty() sourceId!: string;
}

export class CheckConflictResultDto {
  @ApiProperty({ description: 'Có trùng lịch hay không' }) hasConflict!: boolean;
  @ApiProperty({ type: [ConflictItemDto] }) conflicts!: ConflictItemDto[];
}
