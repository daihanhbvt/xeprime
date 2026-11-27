import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { BranchIdQuery } from '../../../common/dto/branch-scope';

export const VEHICLE_PICKER_DEFAULT_LIMIT = 24;
export const VEHICLE_PICKER_MAX_LIMIT = 48;

/**
 * Bước "Chọn xe" của hộp Tạo đơn thuê (`/bookings`): đội xe của gian hàng kèm cờ BẬN trong
 * khung giờ nhận/trả đang chọn. Khung giờ bắt buộc — nó là lý do endpoint này tồn tại.
 */
export class VehicleBookingPickerQueryDto {
  @ApiProperty({ description: 'Giờ nhận xe, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  pickupAt!: Date;

  @ApiProperty({ description: 'Giờ trả xe, ISO-8601 UTC - phải sau giờ nhận' })
  @Type(() => Date)
  @IsDate()
  returnAt!: Date;

  @ApiPropertyOptional({ description: 'Tìm theo tên/mã/biển số/hãng/model' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @BranchIdQuery()
  branchId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: VEHICLE_PICKER_DEFAULT_LIMIT,
    minimum: 1,
    maximum: VEHICLE_PICKER_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(VEHICLE_PICKER_MAX_LIMIT)
  limit?: number;
}

/** Một thẻ xe của bộ chọn — đủ cho thẻ kiểu chợ, không kéo cả hồ sơ xe. */
export class VehicleBookingPickerItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES }) vehicleType!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true }) serviceTypes!: string[];
  @ApiProperty({ enum: VEHICLE_OPERATION_STATUS_VALUES }) operationStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) mainImageUrl!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) transmission!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fuelType!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% khuyến mãi trực tiếp cho tiền thuê tự lái (0-100)',
  })
  discountPercent!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê ngày thường, TRƯỚC khuyến mãi (chuỗi VND)',
  })
  weekdayPrice!: string | null;
  @ApiProperty({ description: 'Chủ xe hỗ trợ giao xe tận nơi' }) deliveryEnabled!: boolean;
  @ApiProperty({ description: 'Không cần tài sản thế chấp' }) noCollateral!: boolean;
  @ApiProperty({
    enum: SERVICE_TYPE_VALUES,
    isArray: true,
    description: 'Dịch vụ đang bật tự động nhận yêu cầu (chỉ những dịch vụ xe còn phục vụ)',
  })
  instantBookServiceTypes!: string[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Điểm đánh giá trên chợ (snapshot công khai); null = chưa có',
  })
  ratingAvg!: string | null;
  @ApiProperty({ description: 'Số lượt đánh giá trên chợ' }) ratingCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Phường/xã của chi nhánh' })
  wardName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tỉnh/TP của chi nhánh' })
  provinceName!: string | null;
  @ApiProperty({
    description: 'Xe đã có lịch (đơn/khoá xe, gồm thời gian chuẩn bị) chồng lên khung giờ đã chọn',
  })
  busy!: boolean;
}

export class VehicleBookingPickerPageDto {
  @ApiProperty({ type: [VehicleBookingPickerItemDto] }) data!: VehicleBookingPickerItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
