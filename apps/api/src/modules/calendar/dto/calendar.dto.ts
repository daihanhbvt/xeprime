import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OCCUPANCY_SOURCE_TYPE_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, Length } from 'class-validator';

/**
 * Thứ tự hàng xe trên lịch. `next_booking` (mặc định): xe có lịch ĐANG chạy/sắp tới gần nhất
 * lên đầu — người điều phối nhìn ngay những xe cần để mắt; xe trống lịch xếp sau theo tên.
 */
export const CALENDAR_SORT_VALUES = ['next_booking', 'name', 'price_asc', 'price_desc'] as const;
export type CalendarSort = (typeof CALENDAR_SORT_VALUES)[number];

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

  /** Chỉ endpoint `resources` dùng; các endpoint khác nhận nhưng bỏ qua (query dùng chung). */
  @ApiPropertyOptional({ enum: CALENDAR_SORT_VALUES, default: 'next_booking' })
  @IsOptional()
  @IsIn(CALENDAR_SORT_VALUES)
  sort?: CalendarSort;
}

/** Báo giá NỘI BỘ cho xe của chính gian hàng (không đòi xe public như /public quote). */
export class CalendarQuoteQueryDto {
  @ApiProperty({ description: 'ID xe (ULID) thuộc gian hàng hiện tại' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Nhận xe, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  pickupAt!: Date;

  @ApiProperty({ description: 'Trả xe, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  returnAt!: Date;

  /** Dịch vụ của đơn sắp lập (17/08) — dài hạn ăn giá tháng, có tài xế ăn giá route. */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  /** Lộ trình chuyến có tài xế — bỏ qua với dịch vụ khác. */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES })
  @IsOptional()
  @IsIn(ROUTE_TYPE_VALUES)
  routeType?: string;
}

export class CalendarResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Mã xe nội bộ' }) code!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh đại diện cho cột xe' })
  mainImageUrl!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê ngày thường (chuỗi VND)',
  })
  weekdayPrice!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê theo giờ — null = không cho thuê giờ',
  })
  hourlyPrice!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
}

/** Một cột của hàng "Xe còn trống" — đếm trên TOÀN đội xe đã lọc, không chỉ hàng đang render. */
export class CalendarAvailabilityDayDto {
  @ApiProperty({ description: 'Ngày local Asia/Ho_Chi_Minh, YYYY-MM-DD' }) date!: string;
  @ApiProperty({ description: 'Số xe không bị chiếm lịch bất kỳ lúc nào trong ngày đó' })
  availableCount!: number;
}

export class CalendarAvailabilityDto {
  @ApiProperty({ type: [CalendarAvailabilityDayDto] }) days!: CalendarAvailabilityDayDto[];
  @ApiProperty({ description: 'Tổng số xe khớp bộ lọc' }) totalVehicles!: number;
}

/** Dấu "giá riêng" trên ô lịch — chỉ tối thiểu để vẽ marker; chi tiết mở qua dialog đặt giá. */
export class CalendarDailyPriceDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ description: 'Ngày local YYYY-MM-DD' }) date!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) dailyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hourlyPrice!: string | null;
}

export class CalendarEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'vehicleId — khớp CalendarResourceDto.id' }) resourceId!: string;
  @ApiProperty({ enum: OCCUPANCY_SOURCE_TYPE_VALUES }) type!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerName!: string | null;

  @ApiProperty({ description: 'ISO-8601 UTC', example: '2026-07-12T02:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ description: 'ISO-8601 UTC', example: '2026-07-15T04:00:00.000Z' })
  endAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'BookingStatus khi type=booking · VehicleBlockReason khi type=blocked_range',
  })
  status!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) sourceId!: string | null;
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
