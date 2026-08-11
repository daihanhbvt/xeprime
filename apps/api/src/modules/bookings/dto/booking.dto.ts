import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BOOKING_STATUS_VALUES, SERVICE_TYPE, SERVICE_TYPE_VALUES } from '@xeprime/types';
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
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { BookingPriceSnapshotDto } from '../../pricing/dto/pricing.dto';

/** Cách sắp xếp danh sách đơn thuê. */
export const BOOKING_SORT = ['newest', 'pickup_asc', 'pickup_desc', 'return_asc'] as const;
export type BookingSort = (typeof BOOKING_SORT)[number];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Tiền nhập vào dạng chuỗi thập phân tối đa 2 số lẻ (ADR 0007 — không dùng number). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export { DEFAULT_LIMIT as BOOKING_DEFAULT_LIMIT, MAX_LIMIT as BOOKING_MAX_LIMIT };

/**
 * Query danh sách đơn — luôn phân trang + filter + sort ở tầng DB (skill backend-endpoint).
 * Một gian hàng có thể có hàng chục nghìn đơn/năm, client không kéo cả bảng.
 */
export class BookingListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên khách/SĐT/mã đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: BOOKING_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo xe' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Trả xe từ (ISO) — lọc cho panel quá hạn/sắp trả' })
  @IsOptional()
  @IsDateString()
  returnFrom?: string;

  @ApiPropertyOptional({ description: 'Trả xe đến (ISO)' })
  @IsOptional()
  @IsDateString()
  returnTo?: string;

  @ApiPropertyOptional({ enum: BOOKING_SORT, default: 'newest' })
  @IsOptional()
  @IsIn(BOOKING_SORT)
  sort?: BookingSort;

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

/** Một dòng trong bảng đơn thuê — đủ cho bảng, không kéo note dài. */
export class BookingListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  // `type` tường minh cho field nullable: reflect-metadata trả `Object` cho `X | null`,
  // thiếu nó thì openapi-typescript sinh ra `Record<string, never>` (ADR 0007).
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!: string | null;
  @ApiProperty({ enum: BOOKING_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) totalAmount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty({ description: 'Công nợ = max(0, total − paid), string — ADR 0007' })
  debtAmount!: string;
  @ApiProperty() depositAmount!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Chi tiết một đơn — dùng cho drawer xem/sửa. */
export class BookingDetailDto extends BookingListItemDto {
  @ApiProperty() baseAmount!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() discountAmount!: string;
  /** Snapshot giá bất biến chốt lúc tạo đơn (Wave 2) — null với đơn tạo trước khi có tính năng. */
  @ApiPropertyOptional({ type: BookingPriceSnapshotDto, nullable: true })
  priceSnapshot!: BookingPriceSnapshotDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualPickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actualReturnAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** Bọc phân trang cho danh sách đơn (ADR 0007 — shape phải khai báo để FE sinh đúng type). */
export class BookingPageDto {
  @ApiProperty({ type: [BookingListItemDto] }) data!: BookingListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Tạo đơn. KHÔNG nhận `tenantId`/`status`/`code`: tenant lấy từ scope, đơn mới luôn `reserved`
 * (schema default), mã do server sinh. Giữ chỗ lịch đi qua OccupancyService (ADR 0006).
 */
export class CreateBookingDto {
  @ApiProperty({ description: 'ID xe (ULID)' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Length(1, 255)
  customerName!: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES, default: SERVICE_TYPE.SELF_DRIVE })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiProperty({ description: 'Nhận xe (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  @ApiProperty({ description: 'Trả xe (ISO-8601), phải sau nhận xe' })
  @IsDateString()
  returnAt!: string;

  @ApiPropertyOptional({
    description: 'Tiền thuê gốc, string thập phân — ADR 0007',
    example: '600000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'baseAmount phải là số tiền hợp lệ' })
  baseAmount?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'deliveryFee phải là số tiền hợp lệ' })
  deliveryFee?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'discountAmount phải là số tiền hợp lệ' })
  discountAmount?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'depositAmount phải là số tiền hợp lệ' })
  depositAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Sửa đơn. Mọi trường optional. Đổi `pickupAt/returnAt` sẽ reschedule lịch (OccupancyService).
 * KHÔNG cho đổi `status` ở đây — chuyển trạng thái đi qua endpoint transition (validate riêng).
 */
export class UpdateBookingDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  customerName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'Nhận xe (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  returnAt?: string;

  @ApiPropertyOptional({ example: '600000' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'baseAmount phải là số tiền hợp lệ' })
  baseAmount?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'deliveryFee phải là số tiền hợp lệ' })
  deliveryFee?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'discountAmount phải là số tiền hợp lệ' })
  discountAmount?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'depositAmount phải là số tiền hợp lệ' })
  depositAmount?: string;

  // KHÔNG có `paidAmount`: số đã trả chỉ đổi qua PaymentsService (ghi payment) để giữ 1-writer
  // và tránh lost-update. Client không set trực tiếp (ADR chống trùng số liệu tiền — Phase 6).

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Chuyển trạng thái đơn — server validate bằng canTransitionBooking(), không tin client. */
export class TransitionBookingDto {
  @ApiProperty({ enum: BOOKING_STATUS_VALUES, description: 'Trạng thái đích' })
  @IsIn(BOOKING_STATUS_VALUES)
  status!: string;

  @ApiPropertyOptional({ description: 'Thời điểm nhận xe thực tế (khi → active)' })
  @IsOptional()
  @IsDateString()
  actualPickupAt?: string;

  @ApiPropertyOptional({ description: 'Thời điểm trả xe thực tế (khi → completed)' })
  @IsOptional()
  @IsDateString()
  actualReturnAt?: string;
}
