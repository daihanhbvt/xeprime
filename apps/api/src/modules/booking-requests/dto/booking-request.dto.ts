import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_REQUEST_STATUS_VALUES,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
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

import { DATE_ONLY_PATTERN } from '../../../common/date-only';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { BookingRequestDeliveryQuoteDto } from '../../pricing/dto/pricing.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as BOOKING_REQUEST_DEFAULT_LIMIT, MAX_LIMIT as BOOKING_REQUEST_MAX_LIMIT };

/** Khách gửi yêu cầu thuê từ Marketplace (công khai). `tenantId` suy từ xe ở server. */
export class CreateBookingRequestDto {
  @ApiProperty({ description: 'ID xe (ULID) trên marketplace' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Length(1, 255)
  customerName!: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  customerPhone!: string;

  @ApiPropertyOptional({ example: 'a@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  customerEmail?: string;

  /**
   * Nhận/trả xe — BẮT BUỘC với dịch vụ tính theo ngày. Thuê dài hạn KHÔNG gửi hai trường này:
   * khách chỉ nêu nguyện vọng ngày nhận, gian hàng chốt giờ nhận khi duyệt và server tính giờ
   * trả từ gói (ADR 0011). Giá trị client gửi kèm cho long_term bị BỎ QUA.
   */
  @ApiPropertyOptional({ description: 'Nhận xe (ISO-8601) — không dùng cho long_term' })
  @ValidateIf((o: CreateBookingRequestDto) => o.serviceType !== SERVICE_TYPE.LONG_TERM)
  @IsDateString()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601) — không dùng cho long_term' })
  @ValidateIf((o: CreateBookingRequestDto) => o.serviceType !== SERVICE_TYPE.LONG_TERM)
  @IsDateString()
  returnAt?: string;

  /** Gói thuê dài hạn (tháng lịch) — BẮT BUỘC khi serviceType = long_term. */
  @ApiPropertyOptional({ enum: LONG_TERM_PACKAGE_MONTHS_VALUES })
  @ValidateIf((o: CreateBookingRequestDto) => o.serviceType === SERVICE_TYPE.LONG_TERM)
  @IsInt()
  @IsIn(LONG_TERM_PACKAGE_MONTHS_VALUES)
  longTermPackageMonths?: number;

  /**
   * Nguyện vọng nhận xe — BẮT BUỘC khi long_term. `within_7_days` là khoảng linh hoạt do
   * SERVER tính (client không gửi khoảng); `specific_date` kèm `requestedPickupDate`.
   */
  @ApiPropertyOptional({ enum: PICKUP_PREFERENCE_VALUES })
  @ValidateIf((o: CreateBookingRequestDto) => o.serviceType === SERVICE_TYPE.LONG_TERM)
  @IsIn(PICKUP_PREFERENCE_VALUES)
  pickupPreference?: string;

  /** Ngày khách muốn nhận (`YYYY-MM-DD`, giờ VN) — BẮT BUỘC khi pickupPreference = specific_date. */
  @ApiPropertyOptional({ description: 'Ngày muốn nhận xe (YYYY-MM-DD)' })
  @ValidateIf(
    (o: CreateBookingRequestDto) => o.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE,
  )
  @Matches(DATE_ONLY_PATTERN, { message: 'Ngày nhận xe không hợp lệ (YYYY-MM-DD)' })
  requestedPickupDate?: string;

  /**
   * Dịch vụ của chuyến — phải nằm trong `serviceTypes` của xe (service kiểm chéo).
   * Bỏ trống = self_drive. long_term đi mô hình gói; with_driver bắt buộc lộ trình.
   */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  /** Lộ trình — BẮT BUỘC khi serviceType = with_driver (service kiểm chéo). */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES })
  @IsOptional()
  @IsIn(ROUTE_TYPE_VALUES)
  routeType?: string;

  /** Địa chỉ đón khách — BẮT BUỘC khi with_driver (xe đến đón, khác giao xe tận nơi). */
  @ApiPropertyOptional({ description: 'Địa chỉ đón khách (with_driver)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  /** Điểm đến — BẮT BUỘC khi lộ trình liên tỉnh (inter_city / inter_city_one_way). */
  @ApiPropertyOptional({ description: 'Điểm đến (with_driver liên tỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Yêu cầu giao xe tận nơi — chỉ nhận khi chính sách giao nhận của xe đang bật',
  })
  @IsOptional()
  @IsBoolean()
  deliveryRequested?: boolean;

  @ApiPropertyOptional({ description: 'Địa điểm giao xe — bắt buộc khi yêu cầu giao tận nơi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;
}

/** Khách kiểm tra nhanh khung giờ của một xe có trống không (preview — ADR 0006). */
export class CheckAvailabilityDto {
  @ApiProperty({ description: 'ID xe (ULID)' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Nhận xe (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  @ApiProperty({ description: 'Trả xe (ISO-8601), phải sau nhận xe' })
  @IsDateString()
  returnAt!: string;
}

export class CheckAvailabilityResultDto {
  @ApiProperty({ description: 'Khung giờ còn trống (preview, quyết định thật khi shop duyệt)' })
  available!: boolean;
}

/**
 * Duyệt yêu cầu. Dịch vụ theo ngày không cần body (lịch đã có trên yêu cầu).
 *
 * THUÊ DÀI HẠN bắt buộc `scheduledPickupAt`: khách chỉ nêu nguyện vọng, gian hàng là bên chốt
 * ngày/giờ nhận chính xác. Server kiểm ngày chốt có đúng nguyện vọng không, rồi tự tính ngày
 * trả = nhận + gói tháng lịch — **không nhận ngày trả từ client** (ADR 0011).
 */
export class ApproveBookingRequestDto {
  @ApiPropertyOptional({
    description: 'Ngày/giờ nhận xe chính xác (ISO-8601) — BẮT BUỘC với yêu cầu thuê dài hạn',
  })
  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;

  /**
   * Gói thuê — CHỈ dùng cho yêu cầu dài hạn LEGACY (gửi trước khi chuyển sang mô hình gói, nên
   * không mang gói nào). Migration cố ý không làm tròn ngầm; gian hàng chọn gói khi xử lý.
   */
  @ApiPropertyOptional({ enum: LONG_TERM_PACKAGE_MONTHS_VALUES })
  @IsOptional()
  @IsInt()
  @IsIn(LONG_TERM_PACKAGE_MONTHS_VALUES)
  longTermPackageMonths?: number;
}

/** Từ chối yêu cầu — lý do tuỳ chọn để báo lại khách. */
export class RejectBookingRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class BookingRequestListQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_REQUEST_STATUS_VALUES })
  @IsOptional()
  @IsIn(BOOKING_REQUEST_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;

  /** Lọc theo chi nhánh của XE được yêu cầu — nguồn là bộ chọn chi nhánh ở thanh trên. */
  @ApiPropertyOptional({ description: 'Lọc theo chi nhánh (qua xe của yêu cầu)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  branchId?: string;

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

/** Một yêu cầu đặt xe (dùng cho cả list lẫn chi tiết ở inbox shop). */
export class BookingRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_VALUES }) status!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerPhone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerEmail!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — null với yêu cầu dài hạn chưa chốt lịch',
  })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  returnAt!: string | null;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    enum: LONG_TERM_PACKAGE_MONTHS_VALUES,
    description: 'Gói thuê dài hạn khách chọn — null ở yêu cầu dài hạn LEGACY',
  })
  longTermPackageMonths!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: PICKUP_PREFERENCE_VALUES })
  pickupPreference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  requestedPickupDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  pickupWindowStartDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'YYYY-MM-DD (giờ VN)' })
  pickupWindowEndDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: ROUTE_TYPE_VALUES })
  routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Khách yêu cầu giao xe tận nơi' }) deliveryRequested!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryAddress!: string | null;
  @ApiPropertyOptional({
    type: BookingRequestDeliveryQuoteDto,
    nullable: true,
    description:
      'LỊCH SỬ: báo giá giao nhận của các yêu cầu tạo trước Wave 9. Chỉ để đọc — không còn ' +
      'ảnh hưởng tới việc duyệt, và yêu cầu mới luôn null.',
  })
  deliveryQuote!: BookingRequestDeliveryQuoteDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Booking đã tạo khi duyệt' })
  bookingId!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class BookingRequestPageDto {
  @ApiProperty({ type: [BookingRequestDto] }) data!: BookingRequestDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Kết quả trả khách sau khi gửi yêu cầu (không lộ nội bộ tenant). */
export class BookingRequestReceiptDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_VALUES }) status!: string;
  @ApiProperty({
    description:
      'Sau khi gửi, khách đã có phiên đăng nhập (passwordless qua SĐT) — FE chuyển tới /trips.',
  })
  authenticated!: boolean;
}
