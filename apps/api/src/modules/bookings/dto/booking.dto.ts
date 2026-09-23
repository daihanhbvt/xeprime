import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADDRESS_LINE_MAX_LENGTH,
  BOOKING_HANDOVER_PLACE_VALUES,
  BOOKING_LIST_PRESET_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  CANCELLATION_REASON_CATEGORY_VALUES,
  HANDOVER_STATUS_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  SERVICE_TYPE_VALUES,
  type BookingListPreset,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
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
import { AddressViewDto, GeoPinDto } from '../../locations/dto/address.dto';
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

  /**
   * Nhóm việc dựng sẵn — CỘNG THÊM vào các bộ lọc khác, không thay thế chúng.
   *
   * `awaiting_pickup` là một câu ba vế (trạng thái đơn + chưa có mốc giao thật + chưa có biên
   * bản giao đã xác nhận) mà `status` không diễn đạt nổi. Nó ở server để mọi client hỏi cùng
   * một câu; `q`, `branchId`, `vehicleId`, phân trang và sắp xếp vẫn áp bình thường lên trên.
   */
  @ApiPropertyOptional({
    enum: BOOKING_LIST_PRESET_VALUES,
    description: 'Nhóm việc dựng sẵn — awaiting_pickup: đơn đã tạo nhưng chưa bàn giao xe',
  })
  @IsOptional()
  @IsIn(BOOKING_LIST_PRESET_VALUES)
  preset?: BookingListPreset;

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
  /*
   * Ba trường BÀN GIAO bên dưới phục vụ nhóm việc "Chờ giao xe". Chúng nằm ở danh sách chứ
   * không để client tự hỏi thêm: một trang 20 đơn mà mỗi dòng gọi `/handovers` là 20 lượt gọi
   * cho một câu hỏi mà cùng một truy vấn đã trả lời được.
   *
   * `required: true` + `nullable`: contract sinh ra `string | null` chứ không phải `| undefined`
   * — mọi đơn đều có ba trường này, chỉ là giá trị có thể trống (ADR 0007).
   */
  @ApiProperty({
    required: true,
    type: String,
    nullable: true,
    enum: HANDOVER_STATUS_VALUES,
    description:
      'Trạng thái biên bản GIAO XE còn hiệu lực (bản huỷ không tính). null = chưa lập biên bản nào',
  })
  pickupHandoverStatus!: string | null;
  @ApiProperty({
    required: true,
    type: String,
    nullable: true,
    enum: BOOKING_HANDOVER_PLACE_VALUES,
    description: 'Chỗ xe đổi tay — MÃ; nhãn do client dịch',
  })
  handoverPlaceKind!: string | null;
  @ApiProperty({
    required: true,
    type: String,
    nullable: true,
    description: 'Địa chỉ hoặc tên chi nhánh đi kèm `handoverPlaceKind` — chuỗi thô, không dịch',
  })
  handoverPlace!: string | null;
  @ApiProperty({ description: 'Giá thuê đã chốt, KHÔNG gồm phụ phí. Tiền dạng string — ADR 0007' })
  totalAmount!: string;
  @ApiProperty({
    description: 'Tiền thuê đã thu (`payments`) — writer duy nhất là PaymentsService',
  })
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
  @ApiPropertyOptional({
    type: AddressViewDto,
    nullable: true,
    description: 'Điểm đón có cấu trúc — SNAPSHOT của đơn, không viết lại khi danh mục đổi',
  })
  pickupLocation!: AddressViewDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiPropertyOptional({ type: GeoPinDto, nullable: true, description: 'Ghim của điểm đến' })
  destinationPin!: GeoPinDto | null;
  @ApiProperty() baseAmount!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() discountAmount!: string;
  /** Snapshot giá bất biến chốt lúc tạo đơn (Wave 2) — null với đơn tạo trước khi có tính năng. */
  @ApiPropertyOptional({ type: BookingPriceSnapshotDto, nullable: true })
  priceSnapshot!: BookingPriceSnapshotDto | null;
  /**
   * Tổng khách phải trả cả chuyến, gồm các phụ phí phía khách đã đóng băng lúc đặt.
   * `null` với đơn lập tay/đơn cũ không đi qua chính sách phí của marketplace.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  customerTotalAmount!: string | null;
  /**
   * Số khách đã chuyển cho XePrime để giữ chỗ. Đây là số THỰC THU trên `booking_holds`,
   * không phải cọc tài sản `depositAmount` mà chủ xe giữ khi giao xe.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  holdPaidAmount!: string | null;
  /** B − D — phần khách còn trả trực tiếp chủ xe khi nhận xe, do server đóng băng trong snapshot. */
  @ApiPropertyOptional({ type: String, nullable: true })
  payAtPickupAmount!: string | null;
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

  /**
   * Phần CÓ CẤU TRÚC của địa chỉ đón. Tuỳ chọn: đơn gian hàng lập tay cho khách quen thường chỉ
   * có một dòng địa chỉ, và bắt chọn xã/phường ở đó là cản trở việc lập đơn nhanh. Có mã thì
   * server dựng lại chuỗi hiển thị; không có thì chuỗi gõ tay được giữ nguyên.
   */
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành của điểm đón (GET /provinces)' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  pickupProvinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu của điểm đón' })
  @IsOptional()
  @IsString()
  @Length(5, 5)
  pickupWardCode?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường của điểm đón' })
  @IsOptional()
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  pickupAddressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đón' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupPlaceId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim điểm đón' })
  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ ghim điểm đón' })
  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đến' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationPlaceId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim điểm đến' })
  @IsOptional()
  @IsLatitude()
  destinationLatitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ ghim điểm đến' })
  @IsOptional()
  @IsLongitude()
  destinationLongitude?: number;

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

  /**
   * Phần CÓ CẤU TRÚC của địa chỉ đón. Tuỳ chọn: đơn gian hàng lập tay cho khách quen thường chỉ
   * có một dòng địa chỉ, và bắt chọn xã/phường ở đó là cản trở việc lập đơn nhanh. Có mã thì
   * server dựng lại chuỗi hiển thị; không có thì chuỗi gõ tay được giữ nguyên.
   */
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành của điểm đón (GET /provinces)' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  pickupProvinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu của điểm đón' })
  @IsOptional()
  @IsString()
  @Length(5, 5)
  pickupWardCode?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường của điểm đón' })
  @IsOptional()
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  pickupAddressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đón' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupPlaceId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim điểm đón' })
  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ ghim điểm đón' })
  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đến' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationPlaceId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim điểm đến' })
  @IsOptional()
  @IsLatitude()
  destinationLatitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ ghim điểm đến' })
  @IsOptional()
  @IsLongitude()
  destinationLongitude?: number;

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

/**
 * Trạng thái đích mà ENDPOINT CÔNG KHAI `POST /bookings/:id/transition` được phép nhận (ADR
 * 0047) — đây là một quyết định BẤM TAY khép đơn, không phải một bộ chọn trạng thái tự do.
 *
 * `active`/`completed` KHÔNG có mặt: chúng chỉ đến từ một biên bản bàn giao thật, do
 * `HandoversService` gọi `transitionWithinTx` NỘI BỘ — cho client tự đặt `active` là cho phép
 * bỏ qua bằng chứng bàn giao (số KM, ảnh hiện trạng) hoàn toàn. `confirmed` (deprecated) cũng
 * không có mặt — không còn ai "xác nhận đơn" thủ công (xem `BookingStatusActions`): duyệt yêu
 * cầu ở `Duyệt & giữ xe` CHÍNH LÀ sự xác nhận.
 *
 * Cả hai giá trị còn lại đều là kết thúc tiêu cực, khép đơn vĩnh viễn và nhả lịch xe ngay — sáu
 * tháng sau, khi khách gọi hỏi "vì sao đơn của tôi bị huỷ", thứ duy nhất còn lại là dòng audit.
 * Nên cả hai đều BẮT BUỘC nêu lý do (`TRANSITION_REASON_REQUIRED` trùng chính danh sách này —
 * không phải trùng hợp, mà vì đây giờ là hai kết thúc DUY NHẤT endpoint này còn làm được).
 */
const BOOKING_TRANSITION_ALLOWED_VALUES: readonly string[] = [
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
];

const TRANSITION_REASON_REQUIRED: readonly string[] = BOOKING_TRANSITION_ALLOWED_VALUES;

function transitionNeedsReason(status: string): boolean {
  return TRANSITION_REASON_REQUIRED.includes(status);
}

/** Chuyển trạng thái đơn — server validate bằng canTransitionBooking(), không tin client. */
export class TransitionBookingDto {
  @ApiProperty({
    enum: BOOKING_TRANSITION_ALLOWED_VALUES,
    description: 'Trạng thái đích — chỉ hai quyết định bấm tay: huỷ đơn hoặc khách không đến',
  })
  @IsIn(BOOKING_TRANSITION_ALLOWED_VALUES)
  status!: string;

  /**
   * Lý do — BẮT BUỘC khi huỷ đơn hoặc ghi nhận khách không đến, tuỳ chọn ở các bước khác.
   *
   * Trim TRƯỚC khi kiểm: một ô toàn dấu cách là ô trống, và để nó lọt qua thì luật này chỉ còn
   * chặn được người dùng cẩu thả chứ không chặn được cái nó sinh ra để chặn.
   *
   * Điều kiện `|| reason !== undefined` giữ trần 500 ký tự có hiệu lực cả ở bước KHÔNG bắt
   * buộc — `@ValidateIf` sai là bỏ qua TOÀN BỘ validator của trường, nên nếu chỉ đặt điều kiện
   * "đang huỷ" thì một `reason` dài 100k ký tự đi kèm `confirmed` sẽ không ai kiểm.
   *
   * Lý do KHÔNG vào `booking.note`: `note` là nội dung của đơn (nhân viên viết cho nhau đọc khi
   * phục vụ chuyến), còn đây là lịch sử của một quyết định. Trộn hai thứ là để lời giải thích
   * cho việc huỷ bị người sau sửa đè mất.
   */
  @ApiPropertyOptional({
    description:
      'Lý do — BẮT BUỘC khi status = cancelled/no_show. Ghi vào audit (afterJson.reason), KHÔNG ghi vào note của đơn',
    maxLength: 500,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf(
    (o: TransitionBookingDto) => transitionNeedsReason(o.status) || o.reason !== undefined,
  )
  @IsString()
  @IsNotEmpty({ message: 'Cần nêu lý do khi huỷ đơn hoặc ghi nhận khách không đến' })
  @MaxLength(500)
  reason?: string;

  /**
   * NHÓM lý do — bắt buộc khi `status = cancelled` (ADR 0045 điều 1).
   *
   * Có nhóm vì ô văn xuôi không thống kê được: vận hành cần biết "xe hỏng" chiếm bao nhiêu phần
   * trăm để sửa đúng chỗ, và chỉ số uy tín cần một khoá để lọc. Ô chữ tự do (`reason`) vẫn còn
   * và vẫn bắt buộc — nhóm đứng CẠNH nó, không thay nó.
   *
   * `no_show` KHÔNG cần nhóm: nó tự nó đã là một phân loại, và phía chịu trách nhiệm ở đó là
   * khách chứ không phải gian hàng.
   */
  @ApiPropertyOptional({
    enum: CANCELLATION_REASON_CATEGORY_VALUES,
    description: 'Nhóm lý do — BẮT BUỘC khi status = cancelled',
  })
  @ValidateIf((o: TransitionBookingDto) => o.status === BOOKING_STATUS.CANCELLED)
  @IsIn(CANCELLATION_REASON_CATEGORY_VALUES, { message: 'Chọn nhóm lý do khi huỷ đơn' })
  reasonCategory?: string;

  @ApiPropertyOptional({ description: 'Thời điểm nhận xe thực tế (khi → active)' })
  @IsOptional()
  @IsDateString()
  actualPickupAt?: string;

  @ApiPropertyOptional({ description: 'Thời điểm trả xe thực tế (khi → completed)' })
  @IsOptional()
  @IsDateString()
  actualReturnAt?: string;
}
