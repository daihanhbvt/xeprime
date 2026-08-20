import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_STATUS_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
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
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { BookingDriverSummaryDto } from '../../drivers/dto/driver.dto';
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

  /** Lọc theo chi nhánh của XE trong đơn — nguồn là bộ chọn chi nhánh ở thanh trên. */
  @ApiPropertyOptional({ description: 'Lọc theo chi nhánh (qua xe của đơn)' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  branchId?: string;

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
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    enum: LONG_TERM_PACKAGE_MONTHS_VALUES,
    description: 'Gói thuê dài hạn (tháng lịch) — null với dịch vụ khác và đơn dài hạn LEGACY',
  })
  longTermPackageMonths!: number | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC — với thuê dài hạn do SERVER tính từ gói' })
  returnAt!: string;
  @ApiProperty({ description: 'Giá thuê đã chốt, KHÔNG gồm phụ phí. Tiền dạng string — ADR 0007' })
  totalAmount!: string;
  @ApiProperty({ description: 'Tiền thuê đã thu (`payments`) — writer duy nhất là PaymentsService' })
  paidAmount!: string;
  @ApiProperty({ description: 'Tổng phụ phí còn hiệu lực (quá giờ, vệ sinh, hư hại)' })
  surchargeTotal!: string;
  @ApiProperty({ description: 'PHẢI THU = tiền thuê + phụ phí — con số khách nợ tính trên nó' })
  amountDue!: string;
  @ApiProperty({ description: 'Thu thêm bằng phiếu NHẬP TAY đã duyệt gắn đơn' })
  otherCollected!: string;
  @ApiProperty({ description: 'ĐÃ THU = tiền thuê + phiếu tay + phần phụ phí cọc đã gánh' })
  collectedAmount!: string;
  @ApiProperty({ description: 'Công nợ = max(0, phải thu − đã thu) — common/booking-money.ts' })
  debtAmount!: string;
  @ApiProperty() depositAmount!: string;
  /** Tài xế được gán (chủ yếu đơn with_driver) — null = chưa phân công. */
  @ApiPropertyOptional({ type: BookingDriverSummaryDto, nullable: true })
  driver!: BookingDriverSummaryDto | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Chi tiết một đơn — dùng cho trang chi tiết đơn. */
export class BookingDetailDto extends BookingListItemDto {
  /**
   * Khách trong SỔ KHÁCH của gian hàng — mở hồ sơ/giấy tờ từ màn đơn. NULL với đơn cũ không
   * khớp được khách (không có SĐT dùng được).
   *
   * CỐ Ý không lộ `customer_user_id`: đó là định danh XUYÊN TENANT, gian hàng không được cầm
   * (đối xứng `BookingRequestDetailDto`).
   */
  @ApiPropertyOptional({ type: String, nullable: true }) tenantCustomerId!: string | null;
  /** Ảnh đại diện xe (`vehicles.main_image_url`) — null = xe chưa có ảnh, UI không dựng ảnh giả. */
  @ApiPropertyOptional({ type: String, nullable: true }) vehicleImageUrl!: string | null;
  /** Hành trình chuyến CÓ TÀI XẾ — null với dịch vụ khác (CHECK DB giữ luật này). */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES, type: String, nullable: true })
  routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
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

  /**
   * Hành trình — bắt buộc khi `serviceType = with_driver` (kiểm chéo ở service qua
   * `normalizeRouteContext`, class-validator không mô tả được điều kiện chéo này).
   */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES })
  @IsOptional()
  @IsIn(ROUTE_TYPE_VALUES)
  routeType?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ đón khách (with_driver)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @ApiPropertyOptional({ description: 'Điểm đến (with_driver liên tỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destination?: string;

  @ApiProperty({ description: 'Nhận xe (ISO-8601)' })
  @IsDateString()
  pickupAt!: string;

  /**
   * Gói thuê dài hạn (tháng lịch) — BẮT BUỘC khi serviceType = long_term. Ngày trả suy ra từ
   * gói ở SERVER; giá trị `returnAt` client gửi kèm bị BỎ QUA cho dịch vụ này (ADR 0011).
   */
  @ApiPropertyOptional({ enum: LONG_TERM_PACKAGE_MONTHS_VALUES })
  @ValidateIf((o: CreateBookingDto) => o.serviceType === SERVICE_TYPE.LONG_TERM)
  @IsInt()
  @IsIn(LONG_TERM_PACKAGE_MONTHS_VALUES)
  longTermPackageMonths?: number;

  /** Bỏ trống với thuê dài hạn — server suy ngày trả từ gói (giá trị gửi kèm bị bỏ qua). */
  @ApiPropertyOptional({ description: 'Trả xe (ISO-8601) — không dùng cho long_term' })
  @ValidateIf((o: CreateBookingDto) => o.serviceType !== SERVICE_TYPE.LONG_TERM)
  @IsDateString()
  returnAt?: string;

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

  /** Sửa hành trình (with_driver). Đổi dịch vụ khỏi with_driver thì service tự clear cả ba. */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES })
  @IsOptional()
  @IsIn(ROUTE_TYPE_VALUES)
  routeType?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ đón khách (with_driver)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @ApiPropertyOptional({ description: 'Điểm đến (with_driver liên tỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destination?: string;

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

/**
 * Cập nhật phí giao nhận của đơn — hành động ngữ nghĩa riêng (Wave 9).
 *
 * Vì sao không dùng thẳng `PATCH /bookings/:id` (đã nhận `deliveryFee`): đường chung đó không
 * ghi audit và trộn chung với sửa tiền thuê/cọc, nên không phân biệt được "chủ xe chốt phí giao
 * sau khi thoả thuận" với "sửa lại giá đơn". Việc này cần vết riêng: ai đổi, từ bao nhiêu sang
 * bao nhiêu, lúc nào.
 *
 * Không có trạng thái chờ khách đồng ý: hai bên đã thống nhất ngoài ứng dụng trước khi chủ xe
 * bấm lưu.
 */
export class UpdateBookingDeliveryFeeDto {
  @ApiProperty({
    description: 'Phí giao nhận VND (chuỗi — ADR 0007). `0` = miễn phí.',
    example: '120000',
  })
  @Matches(MONEY_PATTERN, { message: 'Phí giao nhận không hợp lệ (số VND không âm)' })
  deliveryFee!: string;

  @ApiPropertyOptional({
    description: 'Ghi chú NỘI BỘ (lý do, mã tham chiếu) — chỉ vào audit, KHÔNG hiển thị cho khách',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Gán/bỏ gán tài xế cho đơn (17/08). `driverId = null` là BỎ GÁN tường minh — field bắt buộc
 * để không lẫn "không gửi gì" với "gỡ tài xế". Tài xế phải cùng tenant + đang hoạt động
 * (DriversService.findAssignable; composite FK ở DB chặn nốt trường hợp service quên).
 */
export class AssignBookingDriverDto {
  @ApiProperty({ type: String, nullable: true, description: 'ID tài xế (ULID) — null để bỏ gán' })
  @ValidateIf((o: AssignBookingDriverDto) => o.driverId !== null)
  @IsString()
  @Length(26, 26)
  driverId!: string | null;
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
