import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_DATE_FIELD,
  BOOKING_DATE_FIELD_VALUES,
  BOOKING_STATUS_VALUES,
  SERVICE_TYPE_VALUES,
  TENANT_STATUS_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_BOOKING_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_BOOKING_MAX_LIMIT };

/** Lọc đơn thuê toàn hệ thống (admin nền tảng). Mọi filter là AND. */
export class PlatformBookingListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đơn / tên khách' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Tra chính xác theo SĐT khách' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo gian hàng (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Giới hạn theo xe (ULID)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  vehicleId?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({
    enum: BOOKING_DATE_FIELD_VALUES,
    default: BOOKING_DATE_FIELD.CREATED_AT,
    description: 'Khoảng ngày áp lên trường nào: ngày tạo đơn hay ngày nhận xe',
  })
  @IsOptional()
  @IsIn(BOOKING_DATE_FIELD_VALUES)
  dateField?: string;

  @ApiPropertyOptional({ description: 'Từ thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến thời điểm (ISO-8601, inclusive)' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

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

/**
 * Một đơn thuê trong danh sách giám sát.
 *
 * `customerPhone` LUÔN ở dạng đã che (build plan §11.1). Số đầy đủ lấy riêng qua
 * `GET /platform/bookings/:id/contact` — có permission riêng và ghi audit từng lần.
 */
export class PlatformBookingDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd 091****678' })
  customerPhoneMasked!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) totalAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) paidAmount!: string;
  @ApiProperty({ description: 'Công nợ = max(0, total − paid), string — ADR 0007' })
  debtAmount!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) tenantStatus!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlateNumber!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformBookingPageDto {
  @ApiProperty({ type: [PlatformBookingDto] }) data!: PlatformBookingDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Chi tiết một đơn (drawer giám sát) — thêm phần tiền chi tiết và mốc thực tế. */
export class PlatformBookingDetailDto extends PlatformBookingDto {
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) baseAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) deliveryFee!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) discountAmount!: string;
  @ApiProperty({ description: 'Số tiền dạng string (ADR 0007)' }) depositAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actualPickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualReturnAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ description: 'Số phiếu thu/chi gắn đơn' }) receiptCount!: number;
  @ApiProperty({ description: 'Số lần ghi nhận thanh toán' }) paymentCount!: number;
  @ApiProperty({ description: 'Đơn đã lập hợp đồng chưa' }) hasContract!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** SĐT khách ở dạng đầy đủ — trả về kèm việc ghi `audit_logs`. */
export class BookingContactDto {
  @ApiProperty() bookingId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
}
