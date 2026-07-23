import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OCCUPANCY_SOURCE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString } from 'class-validator';

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
