import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LISTING_STATUS_VALUES,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_VEHICLE_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_VEHICLE_MAX_LIMIT };

/** Lọc xe toàn hệ thống (admin nền tảng). Mọi filter là AND. */
export class PlatformVehicleListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên xe / biển số / mã xe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

  @ApiPropertyOptional({ enum: VEHICLE_PUBLIC_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_PUBLIC_STATUS_VALUES)
  publicStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_OPERATION_STATUS_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_OPERATION_STATUS_VALUES)
  operationStatus?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ enum: TENANT_STATUS_VALUES, description: 'Trạng thái gian hàng chủ xe' })
  @IsOptional()
  @IsIn(TENANT_STATUS_VALUES)
  tenantStatus?: string;

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

/** Một xe trong danh sách giám sát — kèm chủ sở hữu và trạng thái listing trên sàn. */
export class PlatformVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty({ enum: VEHICLE_PUBLIC_STATUS_VALUES }) publicStatus!: string;
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số tiền dạng string (ADR 0007)' })
  weekdayPrice!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: LISTING_STATUS_VALUES,
    description: 'Trạng thái snapshot trên Marketplace; null = xe chưa từng lên sàn',
  })
  listingStatus!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformVehiclePageDto {
  @ApiProperty({ type: [PlatformVehicleDto] }) data!: PlatformVehicleDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Chi tiết một xe (drawer giám sát) — thêm thông số, giá còn lại và số liệu vận hành. */
export class PlatformVehicleDetailDto extends PlatformVehicleDto {
  @ApiPropertyOptional({ type: String, nullable: true }) brand!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) model!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) weekendPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hourlyPrice!: string | null;
  @ApiProperty() tenantSlug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty({ description: 'Số đơn thuê đã phát sinh trên xe' }) bookingCount!: number;
  @ApiProperty({ description: 'Số đánh giá của xe' }) reviewCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** Lý do ẩn xe — bắt buộc: đây là hành động kiểm duyệt, phải giải trình được trong audit. */
export class HideVehicleDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do ẩn (ghi vào audit log)' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
