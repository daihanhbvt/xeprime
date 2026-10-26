import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADDRESS_LINE_MAX_LENGTH,
  BOOKING_REQUEST_DECISION_SOURCE_VALUES,
  BOOKING_REQUEST_NOTE_MAX_LENGTH,
  BOOKING_REQUEST_STATUS_LIVE_VALUES,
  BOOKING_REQUEST_STATUS_VALUES,
  CANCELLATION_REASON_CATEGORY_VALUES,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  VEHICLE_TYPE_VALUES,
  VN_PHONE_PATTERN,
  compactPhoneInput,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
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
import { OwnerPayoutDto } from '../../../common/dto/owner-payout.dto';
import { AddressViewDto, GeoPinDto } from '../../locations/dto/address.dto';
import { BookingRequestDeliveryQuoteDto } from '../../pricing/dto/pricing.dto';
import { MobileDeviceDto, MobileSessionDto } from '../../auth/dto/mobile-auth.dto';
import { BranchIdQuery } from '../../../common/dto/branch-scope';

const trimmedText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as BOOKING_REQUEST_DEFAULT_LIMIT, MAX_LIMIT as BOOKING_REQUEST_MAX_LIMIT };

/**
 * Chuỗi rỗng / toàn khoảng trắng ⇒ `undefined`, để `@IsOptional` bỏ qua nó.
 *
 * `@IsOptional` chỉ bỏ qua `null`/`undefined`: một ô liên hệ khách xoá trắng (hay bản app cũ gửi
 * `''`) sẽ đi vào `@Matches` và nhận 400 cho một trường KHÔNG bắt buộc. Rỗng ở đây nghĩa là "dùng
 * của tài khoản" — đúng như lúc không gửi.
 */
const optionalTrimmedText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Như trên, và bỏ dấu cách/chấm/gạch của SĐT chép từ danh bạ (`090 123 4567`) trước khi so mẫu. */
const optionalPhoneInput = ({ value }: { value: unknown }) => {
  const text = optionalTrimmedText({ value });
  return typeof text === 'string' ? compactPhoneInput(text) : text;
};

/**
 * Khách (đã đăng nhập) gửi yêu cầu thuê từ Marketplace. `tenantId` suy từ xe ở server.
 *
 * DANH TÍNH người thuê không có trong payload: tài khoản, SĐT đã xác minh (dùng cho danh sách chặn,
 * chặn tự đặt xe, chống trùng) và email đã xác minh đọc từ phiên (ADR 0060). Thứ payload mang được
 * là LIÊN HỆ của chuyến — họ tên + SĐT người thuê muốn chủ xe gọi — mặc định là của tài khoản,
 * khác số thì không cần OTP (ADR 0063).
 */
export class CreateBookingRequestDto {
  @ApiProperty({ description: 'ID xe (ULID) trên marketplace' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  /**
   * Họ tên người thuê cho chuyến này. Bỏ trống ⇒ tên hiển thị của tài khoản. Chỉ là LIÊN HỆ — không
   * đổi tài khoản nào, không đi vào sổ khách của gian hàng (ADR 0063).
   */
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Họ tên người thuê — bỏ trống thì dùng tên tài khoản (ADR 0063)',
  })
  @IsOptional()
  @Transform(optionalTrimmedText)
  @IsString()
  @MaxLength(255)
  customerName?: string;

  /**
   * SĐT liên hệ của chuyến. Bỏ trống ⇒ SĐT đã xác minh của tài khoản. Khác số tài khoản thì KHÔNG
   * cần OTP: nó chỉ là số chủ xe gọi, mọi phép kiểm danh tính vẫn chạy trên số của tài khoản, và chủ
   * xe thấy CẢ HAI số (`customerAccountPhone` — ADR 0063).
   */
  @ApiPropertyOptional({
    maxLength: 32,
    pattern: VN_PHONE_PATTERN.source,
    description:
      'SĐT liên hệ `0xxxxxxxxx`/`+84xxxxxxxxx` — bỏ trống thì dùng SĐT tài khoản; khác số không cần OTP (ADR 0063)',
  })
  @IsOptional()
  @Transform(optionalPhoneInput)
  @IsString()
  @MaxLength(32)
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  customerPhone?: string;

  /*
   * ── Ba trường DƯỚI ĐÂY ĐÃ GỠ khỏi hợp đồng (ADR 0060), giữ khai báo chỉ để không vỡ client cũ ──
   *
   * Server KHÔNG đọc chúng. Chúng còn được khai vì `ValidationPipe` toàn cục chạy với
   * `forbidNonWhitelisted`: xoá hẳn thì bản app đang phát hành — kể cả khi người dùng ĐÃ đăng
   * nhập — nhận 400 cho mọi lượt đặt xe chỉ vì gửi thừa một trường. Web không gửi chúng nữa.
   *
   *  - `client`/`device`: từng chọn kiểu phiên cấp cho khách vãng lai — không còn phiên nào được
   *    cấp ở route này.
   *  - `customerEmail`: email chủ xe nhận là email ĐÃ XÁC MINH của tài khoản, không phải chữ tự khai.
   */
  @ApiPropertyOptional({
    enum: ['web', 'native'],
    deprecated: true,
    description: 'ĐÃ GỠ (ADR 0060) — server bỏ qua; không còn phiên nào được cấp ở route này.',
  })
  @IsOptional()
  @IsIn(['web', 'native'])
  client?: string;

  @ApiPropertyOptional({
    type: MobileDeviceDto,
    deprecated: true,
    description: 'ĐÃ GỠ (ADR 0060) — server bỏ qua.',
  })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'ĐÃ GỠ (ADR 0060) — server bỏ qua; email đã xác minh lấy từ tài khoản.',
  })
  @IsOptional()
  @IsString()
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

  /**
   * Địa chỉ đón khách — BẮT BUỘC khi with_driver (xe đến đón, khác giao xe tận nơi).
   *
   * Vẫn là CHUỖI: đây là địa chỉ hiển thị. Khi client gửi kèm `pickupProvinceCode` +
   * `pickupWardCode`, server DỰNG LẠI chuỗi này từ danh mục và bỏ qua giá trị gửi lên — một địa
   * chỉ chỉ có một cách viết. Client chưa cập nhật gửi mỗi chuỗi thì chuỗi được giữ nguyên và
   * bản ghi đơn giản là không có mã hành chính.
   */
  @ApiPropertyOptional({ description: 'Địa chỉ đón khách (with_driver)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @ApiPropertyOptional({ description: 'Mã tỉnh/thành của điểm đón (GET /provinces)' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @Length(2, 2)
  pickupProvinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu của điểm đón' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @Length(5, 5)
  pickupWardCode?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường của điểm đón' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  pickupAddressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đón' })
  @IsOptional()
  @Transform(trimmedText)
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

  /**
   * Điểm đến — BẮT BUỘC khi lộ trình liên tỉnh (inter_city / inter_city_one_way).
   *
   * KHÔNG có mã xã/phường đi kèm, có chủ đích: điểm đến là một ĐỊA ĐIỂM ("Sân bay Nội Bài",
   * "Đà Lạt"), không phải một địa chỉ giao nhận. Bắt khách chọn xã/phường cho nó là hỏi một thứ
   * họ không biết và không cần biết. Ghim toạ độ thì có ích (ước lượng quãng đường), nên chỉ có
   * ghim.
   */
  @ApiPropertyOptional({ description: 'Điểm đến (with_driver liên tỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destination?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của điểm đến' })
  @IsOptional()
  @Transform(trimmedText)
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

  @ApiPropertyOptional({
    description:
      'Lời nhắn của khách cho chủ xe — server cắt khoảng trắng hai đầu, chỉ có khoảng trắng thì lưu null',
    maxLength: BOOKING_REQUEST_NOTE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_REQUEST_NOTE_MAX_LENGTH)
  note?: string;

  @ApiPropertyOptional({
    description: 'Yêu cầu giao xe tận nơi — chỉ nhận khi chính sách giao nhận của xe đang bật',
  })
  @IsOptional()
  @IsBoolean()
  deliveryRequested?: boolean;

  /**
   * Địa điểm giao xe — bắt buộc khi yêu cầu giao tận nơi.
   *
   * Đây là địa chỉ SINH RA TIỀN (phí giao tính theo km từ chi nhánh tới đúng cái ghim dưới),
   * nên nó được hỏi kỹ nhất trong hệ thống: giao diện đòi chọn tỉnh + xã/phường và xác nhận
   * ghim trước khi gửi.
   */
  @ApiPropertyOptional({ description: 'Địa điểm giao xe — bắt buộc khi yêu cầu giao tận nơi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Mã tỉnh/thành của địa chỉ giao xe (GET /provinces)' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @Length(2, 2)
  deliveryProvinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu của địa chỉ giao xe' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @Length(5, 5)
  deliveryWardCode?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường của địa chỉ giao xe' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  deliveryAddressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google của địa chỉ giao xe' })
  @IsOptional()
  @Transform(trimmedText)
  @IsString()
  @MaxLength(255)
  deliveryPlaceId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ ghim địa chỉ giao xe' })
  @IsOptional()
  @IsLatitude()
  deliveryLatitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ ghim địa chỉ giao xe' })
  @IsOptional()
  @IsLongitude()
  deliveryLongitude?: number;

  /**
   * Khách đã đọc và đồng ý điều khoản thuê của chủ xe (08/09/2026). BẮT BUỘC `true` khi thiết lập
   * dịch vụ của xe đòi hỏi — server kiểm, và thời điểm đồng ý được đóng băng vào yêu cầu.
   */
  @ApiPropertyOptional({ description: 'Đồng ý điều khoản thuê của chủ xe' })
  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;

  /**
   * MÃ KHUYẾN MÃI nền tảng khách đã áp ở bước xem giá — ADR 0046.
   *
   * Client gửi CHUỖI MÃ, không gửi số giảm: số giảm do server tính ở cả ba cửa kiểm, và một
   * client gửi lên "giảm 5.000.000đ" thì không có gì phản đối nó nếu tin payload.
   *
   * Mã không còn hợp lệ ở thời điểm gửi ⇒ lượt gửi bị TỪ CHỐI (`PROMO_CODE_NOT_APPLICABLE` /
   * `PROMO_CODE_EXHAUSTED`), không âm thầm bỏ mã rồi ghi yêu cầu: bỏ mã làm số tiền khách phải
   * trả tăng so với con số họ vừa đồng ý, và họ chỉ phát hiện ra lúc nhìn mã QR.
   */
  @ApiPropertyOptional({ description: 'Mã khuyến mãi nền tảng (server tự chuẩn hoá)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;

  /**
   * Lựa chọn bảo hiểm của khách — luồng tiền v2: cả hai TUỲ CHỌN, tích thì tính theo ngày. Đóng
   * băng vào yêu cầu; lượt chốt giá (duyệt/tự nhận) đọc lại đúng lựa chọn này. Chính sách phí tắt
   * cổng bảo hiểm thì lựa chọn không sinh dòng tiền nào. Bỏ trống = không chọn.
   */
  @ApiPropertyOptional({ description: 'Thêm bảo hiểm vật chất xe (IV) — tính theo ngày' })
  @IsOptional()
  @IsBoolean()
  vehicleProtectionSelected?: boolean;

  @ApiPropertyOptional({ description: 'Thêm bảo hiểm tai nạn người trên xe (IP) — tính theo ngày' })
  @IsOptional()
  @IsBoolean()
  personalAccidentSelected?: boolean;
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

/**
 * GIAN HÀNG RÚT LẠI một chuyến ĐÃ NHẬN — ADR 0045 điều 1.
 *
 * Hai trường, và cả hai đều KHÔNG nói về "ai chịu trách nhiệm": phía chịu trách nhiệm do SERVER
 * suy từ người đang gọi (`host` cho mọi lượt bấm từ cổng quản lý, kể cả nhân viên được uỷ
 * quyền). Nếu nó là một trường trong body thì mọi gian hàng đều tự khai `force_majeure` và chỉ
 * số uy tín mất nghĩa trong một tuần.
 */
export class CancelBookingRequestDto {
  @ApiProperty({
    enum: CANCELLATION_REASON_CATEGORY_VALUES,
    description: 'Nhóm lý do — thứ DUY NHẤT người huỷ chọn. Không có nhóm "bất khả kháng".',
  })
  @IsIn(CANCELLATION_REASON_CATEGORY_VALUES)
  reasonCategory!: string;

  /**
   * Chữ giải thích. BẮT BUỘC khi nhóm là `other` — kiểm ở service (một phép so hai trường,
   * `class-validator` diễn đạt được nhưng bằng một decorator tuỳ biến mà chỉ chỗ này dùng).
   */
  @ApiPropertyOptional({ description: 'Bắt buộc khi reasonCategory = other' })
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

  /**
   * Một trạng thái, hoặc NHIỀU trạng thái nối bằng dấu phẩy (`?status=pending_host_approval,
   * awaiting_hold`) — tab GỘP của hộp thư dùng hình thức này. Chuỗi, không phải query param
   * lặp lại: `@xeprime/api-client` cố ý không hỗ trợ query dạng mảng (xem `packages/api-client`).
   *
   * `@IsIn` vẫn NHẬN hai giá trị đã gỡ (`hold_paid`, `approved_by_host` — ADR 0055) và chúng
   * khớp 0 dòng: bản app native đang chạy còn gửi `pending_host_approval,hold_paid` cho tab "Cần
   * xử lý", và từ chối cả câu lọc là làm hộp thư của họ vỡ ở đúng tab quan trọng nhất. Swagger
   * chỉ quảng bá danh sách còn sống.
   */
  @ApiPropertyOptional({
    enum: BOOKING_REQUEST_STATUS_LIVE_VALUES,
    isArray: true,
    description: 'Một trạng thái, hoặc nhiều trạng thái nối dấu phẩy',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsIn(BOOKING_REQUEST_STATUS_VALUES, { each: true })
  status?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(26, 26)
  vehicleId?: string;

  /** Lọc theo chi nhánh của XE được yêu cầu — áp cho cả trang lẫn `meta.statusCounts` của hàng tab. */
  @BranchIdQuery()
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

/**
 * Tiền của MỘT yêu cầu thuê, nhìn từ phía gian hàng — nguồn khác nhau tuỳ trạng thái, không
 * bao giờ tính lại một con số đã đóng băng (ADR 0024):
 *
 *  - **Đã tạo đơn** (`converted_to_booking`): cột phẳng trên `Booking` — nguồn DUY NHẤT, dù
 *    đơn đi qua đường có hold hay không.
 *  - **Đã cọc, hoặc từng cọc rồi mới huỷ/từ chối/hết hạn**: snapshot đóng băng lúc hold sinh
 *    ra (`BookingHold.priceSnapshotJson`).
 *  - **Còn chờ duyệt, chưa từng có hold**: TẠM TÍNH theo chính sách ĐANG hiệu lực — đổi khi
 *    chủ xe duyệt, `isEstimate = true`.
 *
 * `null` (cả field lẫn từng con số) khi không tính được: dài hạn chưa chốt lịch, xe thiếu giá,
 * hoặc chính sách phí chưa cấu hình cho gian hàng.
 */
export class BookingRequestPricingDto {
  @ApiProperty({ description: 'true = tạm tính (chưa duyệt), false = số đã chốt/đã đóng băng' })
  isEstimate!: boolean;
  @ApiProperty({ description: 'Tiền thuê — doanh thu gian hàng, VND string' })
  rentalTotal!: string;
  @ApiProperty({ description: 'Tổng khách phải trả (đã gồm phụ phí nếu có), VND string' })
  customerTotalAmount!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đã trả qua nền tảng (giữ chỗ/đơn) — null khi còn tạm tính',
  })
  paidAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Trả TRỰC TIẾP chủ xe khi nhận xe — null khi tạm tính hoặc không áp dụng',
  })
  remainingAmount!: string | null;
}

/**
 * Hai cửa sổ của khoản giữ chỗ NẾU duyệt ngay bây giờ — `holdWindowsFor` với `acceptedAt = now`.
 * ƯỚC TÍNH: mốc thật được tính và LƯU lúc lượt duyệt chạy.
 */
export class BookingRequestApprovalWindowsDto {
  @ApiProperty({ description: 'ΔT = giờ nhận xe − bây giờ, phút' }) leadMinutes!: number;
  @ApiProperty({ description: 'Khách có bấy nhiêu phút để chuyển tiền giữ chỗ' })
  paymentWindowMinutes!: number;
  @ApiProperty({
    description:
      'Khách huỷ miễn phí trong bấy nhiêu phút (sàn 15′, chưa kẹp bởi giờ nhận xe — xem `freeCancelUntil`); 0 = chính sách tắt huỷ miễn phí',
  })
  freeCancelMinutes!: number;
  @ApiProperty({ description: 'ISO — hạn chuyển tiền dự kiến (đã kẹp bởi giờ nhận xe)' })
  expiresAt!: string;
  @ApiProperty({ description: 'ISO — mốc huỷ miễn phí dự kiến' }) freeCancelUntil!: string;
  @ApiProperty({
    description: 'Cửa sổ còn lại quá ngắn để phát QR — duyệt sẽ nhận `HOLD_WINDOW_TOO_SHORT`',
  })
  tooShort!: boolean;
}

/**
 * XEM TRƯỚC lượt duyệt cho gian hàng — tiền và hai cửa sổ của chuyến NẾU bấm duyệt bây giờ
 * (ADR 0064). Chỉ có ở yêu cầu còn `pending_host_approval`; là ƯỚC TÍNH theo chính sách phí hiện
 * hành (số chốt đóng băng lúc duyệt — ADR 0024).
 *
 * DTO nội bộ của gian hàng: phô bày kinh tế của CHỦ XE (hoa hồng `H`, thuế `T`, số thực nhận) là
 * đúng chỗ — khách không bao giờ đọc DTO này.
 */
export class BookingRequestApprovalPreviewDto {
  @ApiProperty({ description: 'Luôn true — số chốt khi duyệt' }) isEstimate!: boolean;
  @ApiProperty({
    description:
      'Duyệt xong khách có nhận QR tiền giữ chỗ không. false = không thu online (báo giá tạm tính ' +
      'hoặc không thu cọc) — đơn tạo ngay lúc duyệt',
  })
  collectsHold!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tiền giữ chỗ khách chuyển qua QR (VND string) — null khi không thu online',
  })
  onlineAmount!: string | null;
  @ApiProperty({ description: 'Khách trả TRỰC TIẾP chủ xe lúc nhận xe (VND string)' })
  payAtPickupAmount!: string;
  /** @deprecated Đọc `ownerPayout.ownerCommissionAmount` — trường phẳng giữ cho app native cũ. */
  @ApiProperty({
    deprecated: true,
    description:
      'DEPRECATED — đọc `ownerPayout.ownerCommissionAmount`. `H` — phí dịch vụ – chủ xe (lũy ' +
      'tiến theo ngày), XePrime giữ lại từ phần của chủ xe (VND string)',
  })
  ownerCommissionAmount!: string;
  /** @deprecated Đọc `ownerPayout.taxAmount` (kèm GTGT/TNCN tách riêng) — giữ cho app native cũ. */
  @ApiProperty({
    deprecated: true,
    description:
      'DEPRECATED — đọc `ownerPayout.taxAmount`. `T` — thuế khấu trừ khỏi tiền chủ xe (VND string)',
  })
  taxAmount!: string;
  /** @deprecated Đọc `ownerPayout.ownerPayableAmount` — trường phẳng giữ cho app native cũ. */
  @ApiProperty({
    deprecated: true,
    description:
      'DEPRECATED — đọc `ownerPayout.ownerPayableAmount`. `D − T` — XePrime ghi vào ví điểm chủ ' +
      'xe khi chuyến hoàn thành (VND string)',
  })
  ownerPayableAmount!: string;
  /** @deprecated Đọc `ownerPayout.ownerNetAmount` — trường phẳng giữ cho app native cũ. */
  @ApiProperty({
    deprecated: true,
    description:
      'DEPRECATED — đọc `ownerPayout.ownerNetAmount`. `B − H − T` — chủ xe thực nhận cả chuyến ' +
      '(VND string)',
  })
  ownerNetAmount!: string;
  @ApiProperty({
    type: OwnerPayoutDto,
    description:
      'Bảng cộng ví chủ xe nếu duyệt ngay (ADR 0068 điều 5) — doanh thu, phí dịch vụ – chủ xe, ' +
      'thuế tách GTGT/TNCN, thu nhập (a), khách trả trực tiếp (b), cộng ví (a − b)',
  })
  ownerPayout!: OwnerPayoutDto;
  @ApiProperty({ description: 'Cửa sổ huỷ miễn phí khi đặt xa (giờ) — trần của cửa sổ động' })
  policyFreeCancelHours!: number;
  @ApiProperty({ description: 'Cửa sổ thanh toán khi đặt xa (phút) — trần của cửa sổ động' })
  policyPaymentWindowMinutes!: number;
  @ApiPropertyOptional({
    type: BookingRequestApprovalWindowsDto,
    nullable: true,
    description:
      'Hai cửa sổ nếu duyệt ngay — null khi chưa có giờ nhận (dài hạn: gian hàng chốt lúc duyệt) ' +
      'hoặc khi chuyến không thu online',
  })
  windows!: BookingRequestApprovalWindowsDto | null;
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
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_LIVE_VALUES }) status!: string;
  @ApiProperty() customerName!: string;
  /**
   * `null` khi chủ xe CHƯA được thấy liên hệ của khách: tuyến hoa hồng và chuyến chưa có đơn
   * (`hostSeesCustomerContact`, ADR 0028 điều 9). Email theo cùng luật.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SĐT khách — null với chủ xe tuyến hoa hồng khi chuyến chưa có đơn',
  })
  customerPhone!: string | null;
  /**
   * SĐT ĐÃ XÁC MINH của tài khoản khách — CHỈ có khi khách để lại một SĐT liên hệ KHÁC nó cho chuyến
   * này (ADR 0063). Gác cùng cổng với `customerPhone`: chưa được thấy liên hệ thì cũng `null`.
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'SĐT tài khoản khách — chỉ trả về khi chủ xe được xem liên hệ và SĐT liên hệ khác SĐT tài khoản',
  })
  customerAccountPhone!: string | null;
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
  @ApiPropertyOptional({
    type: AddressViewDto,
    nullable: true,
    description: 'Điểm đón có cấu trúc — null với yêu cầu không có điểm đón',
  })
  pickupLocation!: AddressViewDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) destination!: string | null;
  @ApiPropertyOptional({
    type: GeoPinDto,
    nullable: true,
    description: 'Ghim toạ độ của điểm đến — điểm đến không có mã hành chính',
  })
  destinationPin!: GeoPinDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Khách yêu cầu giao xe tận nơi' }) deliveryRequested!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryAddress!: string | null;
  @ApiPropertyOptional({
    type: AddressViewDto,
    nullable: true,
    description: 'Địa chỉ giao xe có cấu trúc — null khi khách tự tới lấy',
  })
  deliveryLocation!: AddressViewDto | null;
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
  /**
   * HẠN PHẢN HỒI của gian hàng — `created_at` + cửa sổ ĐỘNG 20% của ΔT (giờ nhận − lúc gửi),
   * 15′–240′; dài hạn chưa có giờ nhận ⇒ 240′ (ADR 0066). Web đếm ngược tới đúng mốc này và ẩn hai
   * nút quyết định khi nó đã trôi qua — cùng một mốc mà server dùng để từ chối, nên giao diện
   * không bao giờ mời người dùng bấm một nút chắc chắn nhận 409.
   *
   * Vẫn trả về ở yêu cầu ĐÃ xử lý: nó là dữ kiện của bản ghi ("shop có bao lâu"), không phải
   * một cái đồng hồ chỉ chạy khi còn chờ.
   */
  @ApiProperty({
    description:
      'ISO-8601 UTC — hạn gian hàng phải phản hồi (server tính: 20% của ΔT = giờ nhận − lúc gửi, ' +
      '15–240 phút; dài hạn chưa có giờ nhận ⇒ 240 phút — ADR 0066)',
  })
  respondBy!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — thời điểm gian hàng duyệt/từ chối; null khi còn chờ',
  })
  decidedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: BOOKING_REQUEST_DECISION_SOURCE_VALUES,
    description: 'Ai quyết định — chủ xe hay hệ thống tự nhận (08/09/2026); null khi chưa quyết',
  })
  decisionSource!: string | null;

  /**
   * HẠN KHÁCH THANH TOÁN tiền giữ chỗ (ADR 0044 điều 3) — `null` khi chuyến không có khoản nào.
   *
   * Hộp thư của gian hàng cần đúng mốc này chứ không phải `respondBy`: sau khi họ bấm duyệt,
   * đồng hồ đang chạy là đồng hồ của KHÁCH, và câu hỏi duy nhất còn lại là "bao giờ thì chỗ này
   * tự nhả nếu tiền không về". Suy ở client từ `decidedAt + 120 phút` sẽ sai với mọi chuyến bị
   * kẹp bởi giờ nhận xe, và sai với mọi hold sinh dưới một chính sách phí khác.
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 UTC — hạn khách chuyển tiền giữ chỗ; null khi chuyến không thu',
  })
  holdExpiresAt!: string | null;

  /** Khách đã tích bảo hiểm vật chất xe (`IV`) lúc gửi — lượt chốt giá tính theo lựa chọn này. */
  @ApiProperty() vehicleProtectionSelected!: boolean;
  /** Khách đã tích bảo hiểm tai nạn người (`IP`) lúc gửi. */
  @ApiProperty() personalAccidentSelected!: boolean;

  @ApiPropertyOptional({
    type: BookingRequestPricingDto,
    nullable: true,
    description:
      'Tiền của yêu cầu này — xem docblock BookingRequestPricingDto cho nguồn theo trạng thái. ' +
      'Luôn có mặt (kể cả `null`) ở danh sách và chi tiết; VẮNG MẶT ở phiếu trả về của các thao ' +
      'tác duyệt/từ chối/huỷ — client đọc lại danh sách/chi tiết để thấy số mới.',
  })
  pricing?: BookingRequestPricingDto | null;

  @ApiPropertyOptional({
    type: BookingRequestApprovalPreviewDto,
    nullable: true,
    description:
      'Xem trước lượt duyệt (tiền + hai cửa sổ nếu duyệt ngay) — chỉ yêu cầu còn chờ duyệt. Cùng ' +
      'luật vắng mặt với `pricing` ở phiếu trả về của các thao tác.',
  })
  approvalPreview?: BookingRequestApprovalPreviewDto | null;
}

/**
 * Số yêu cầu của MỘT trạng thái, trong phạm vi gian hàng + chi nhánh đang xem.
 *
 * Danh sách (thay vì một object có mỗi status là một khoá) để không phải gõ mã trạng thái trần
 * ở DTO: bộ mã sống ở `@xeprime/types` (ADR 0005) và thêm một trạng thái mới không được kéo
 * theo một lần sửa DTO nữa. `status` vẫn khai `enum` nên spec sinh ra vẫn có đủ giá trị hợp lệ.
 */
export class BookingRequestStatusCountDto {
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_LIVE_VALUES }) status!: string;
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
  @ApiProperty({ enum: BOOKING_REQUEST_STATUS_LIVE_VALUES }) status!: string;
  @ApiProperty({
    description:
      'Luôn `true` — người gửi luôn là tài khoản khách đã đăng nhập (ADR 0060). Giữ cho client cũ.',
  })
  authenticated!: boolean;

  /**
   * ĐÃ GỠ (ADR 0060) — KHÔNG BAO GIỜ có mặt. Từng mang phiên cấp cho khách vãng lai của app
   * native; nay người gửi đã đăng nhập sẵn nên không có phiên nào để cấp. Khai báo ở lại để kiểu
   * sinh ra của bản app đang dùng không gãy.
   */
  @ApiPropertyOptional({
    type: MobileSessionDto,
    deprecated: true,
    description: 'ĐÃ GỠ (ADR 0060) — không bao giờ có mặt.',
  })
  session?: MobileSessionDto;

  /**
   * HỆ THỐNG đã tự nhận yêu cầu này theo thiết lập của chủ xe (08/09/2026). `status` khi đó là
   * `converted_to_booking` (đã có đơn) hoặc `awaiting_hold` (chờ khách chuyển giữ chỗ). FE đọc
   * cờ này để không nói "xe chưa được giữ chỗ" với một chuyến đã được nhận.
   */
  @ApiProperty() autoAccepted!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đơn vừa tạo khi tự nhận (không hold)',
  })
  bookingId!: string | null;
}
