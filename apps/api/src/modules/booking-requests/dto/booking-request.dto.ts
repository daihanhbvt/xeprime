import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_REQUEST_STATUS_VALUES,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  VEHICLE_TYPE_VALUES,
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
 * Trần cửa sổ tra lịch bận: đủ cho gói thuê dài hạn 12 tháng cộng dư, đủ chặt để một request
 * không quét được cả bảng occupancy của một xe.
 */
export const BUSY_DAYS_MAX_WINDOW = 400;

/** Lịch bận của một xe để TÔ MÀU ô lịch trước khi khách chọn (preview — ADR 0006). */
export class VehicleBusyDaysQueryDto {
  @ApiProperty({ description: 'ID xe (ULID)' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Ngày đầu cửa sổ tra cứu (YYYY-MM-DD, ngày lịch Việt Nam)' })
  @Matches(DATE_ONLY_PATTERN)
  from!: string;

  @ApiProperty({
    description: `Ngày cuối cửa sổ (YYYY-MM-DD). Quá ${BUSY_DAYS_MAX_WINDOW} ngày kể từ \`from\` thì bị kẹp về trần — xem \`to\` trong kết quả`,
  })
  @Matches(DATE_ONLY_PATTERN)
  to!: string;
}

export class VehicleBusyPeriodDto {
  @ApiProperty({ description: 'Bắt đầu bận (ISO-8601 UTC), đã cắt về trong ngày' })
  startAt!: string;

  @ApiProperty({ description: 'Kết thúc bận (ISO-8601 UTC), đã cắt về trong ngày' })
  endAt!: string;
}

export class VehicleBusyDayDto {
  @ApiProperty({ description: 'Ngày local Asia/Ho_Chi_Minh, YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: 'Bận trọn ngày — ngày này không nhận cũng không trả xe được' })
  fullyBusy!: boolean;

  @ApiProperty({
    type: VehicleBusyPeriodDto,
    isArray: true,
    description: 'Các quãng bận trong ngày (đã gộp, tăng dần). Rỗng khi `fullyBusy`',
  })
  periods!: VehicleBusyPeriodDto[];
}

export class VehicleBusyDaysDto {
  @ApiProperty({
    type: VehicleBusyDayDto,
    isArray: true,
    description: 'CHỈ những ngày có lịch bận trong cửa sổ (danh sách thưa), tăng dần theo ngày',
  })
  days!: VehicleBusyDayDto[];

  @ApiProperty({ description: 'Ngày đầu cửa sổ đã áp dụng (YYYY-MM-DD)' })
  from!: string;

  @ApiProperty({ description: 'Ngày cuối cửa sổ đã áp dụng (YYYY-MM-DD) — có thể bị kẹp về trần' })
  to!: string;
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
  @ApiPropertyOptional({ description: 'Tìm theo tên khách / SĐT / tên xe / biển số' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES, description: 'Lọc theo dịch vụ được yêu cầu' })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

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
  /** Mã nội bộ của xe trong gian hàng — thứ nhân viên đọc to ở quầy khi biển số chưa có. */
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ảnh đại diện của xe' })
  vehicleImageUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: VEHICLE_TYPE_VALUES })
  vehicleType!: string | null;
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_VALUES }) status!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerPhone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerEmail!: string | null;
  /**
   * Hồ sơ khách trong SỔ KHÁCH của gian hàng — móc để mở hồ sơ 360 từ inbox. `null` với yêu
   * cầu LEGACY chưa gắn hồ sơ.
   *
   * `customerUserId` (tài khoản nền tảng) CỐ Ý không ra ngoài: nó là định danh xuyên gian hàng,
   * frontend không có việc gì cần tới nó, và lộ ra là mở đường cho việc dò tài khoản.
   */
  @ApiPropertyOptional({ type: String, nullable: true }) tenantCustomerId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ảnh đại diện tài khoản khách',
  })
  customerAvatarUrl!: string | null;
  /**
   * Mức rủi ro gian hàng tự đánh giá cho khách này. `null` khi chưa có hồ sơ trong sổ khách.
   * `watchlist`/`blocked` phải nhìn thấy TRƯỚC khi bấm duyệt; `normal` không cần trưng ra.
   */
  @ApiPropertyOptional({ type: String, nullable: true, enum: TENANT_CUSTOMER_RISK_LEVEL_VALUES })
  customerRiskLevel!: string | null;
  /**
   * Khách có tài khoản trên nền tảng để nhắn tin trong ứng dụng không. `false` với khách vãng
   * lai — gian hàng chỉ liên hệ được qua điện thoại/Zalo.
   */
  @ApiProperty({ description: 'Nhắn tin trong ứng dụng được không' })
  canMessageOnPlatform!: boolean;
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
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — thời điểm gian hàng duyệt/từ chối; null khi còn chờ',
  })
  decidedAt!: string | null;
}

/**
 * Số yêu cầu của MỘT trạng thái, trong phạm vi gian hàng + chi nhánh đang xem.
 *
 * Danh sách (thay vì một object có mỗi status là một khoá) để không phải gõ mã trạng thái trần
 * ở DTO: bộ mã sống ở `@xeprime/types` (ADR 0005) và thêm một trạng thái mới không được kéo
 * theo một lần sửa DTO nữa. `status` vẫn khai `enum` nên spec sinh ra vẫn có đủ giá trị hợp lệ.
 */
export class BookingRequestStatusCountDto {
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_VALUES }) status!: string;
  @ApiProperty({ example: 7 }) count!: number;
}

export class BookingRequestPageMetaDto extends PaginationMetaDto {
  /**
   * Đếm cho TỪNG tab, đủ mọi trạng thái (kể cả trạng thái có 0 yêu cầu).
   *
   * Cố ý BỎ QUA bộ lọc trạng thái đang bật: một tab phải nói được "bên kia có bao nhiêu việc"
   * ngay cả khi người dùng đang đứng ở tab khác. Đếm từ trang hiện tại thì sai ngay từ bản ghi
   * thứ 21, nên con số này do DB gộp, không do frontend cộng lại.
   */
  @ApiProperty({ type: [BookingRequestStatusCountDto] })
  statusCounts!: BookingRequestStatusCountDto[];
}

export class BookingRequestPageDto {
  @ApiProperty({ type: [BookingRequestDto] }) data!: BookingRequestDto[];
  @ApiProperty({ type: BookingRequestPageMetaDto }) meta!: BookingRequestPageMetaDto;
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
