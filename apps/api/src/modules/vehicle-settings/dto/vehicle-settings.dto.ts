import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUTO_ACCEPT_BLOCKER_VALUES,
  AUTO_ACCEPT_LEAD_MAX_MINUTES,
  BOOKING_REQUEST_DECISION_SOURCE_VALUES,
  BOOKING_REQUEST_STATUS_VALUES,
  BOOKING_STATUS_VALUES,
  CONFIGURABLE_CUSTOMER_DOCUMENT_TYPES,
  CUSTOMER_TRIP_STAGE_VALUES,
  DRIVER_DEPOSIT_MODE_SUPPORTED,
  DRIVER_DEPOSIT_MODE_VALUES,
  DRIVER_SURCHARGE_KIND_VALUES,
  DRIVER_SURCHARGE_THRESHOLD_MAX,
  DRIVER_SURCHARGE_UNIT_VALUES,
  HANDOVER_WINDOW_MAX_PER_KIND,
  IDENTITY_VERIFY_METHOD_VALUES,
  MIN_RENTAL_MINUTES_RANGE,
  RENTAL_TERMS_MAX_LENGTH,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE_VALUES,
  TURNAROUND_BUFFER_MAX_MINUTES,
  VEHICLE_TRIP_HISTORY_FILTER,
  VEHICLE_TRIP_HISTORY_FILTER_VALUES,
  VEHICLE_TRIP_HISTORY_KIND_VALUES,
  type VehicleTripHistoryFilter,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** `HH:mm`, giờ Việt Nam; `24:00` = hết ngày. */
const TIME_PATTERN = /^([01]\d|2[0-4]):([0-5]\d)$/;

// ── Khung giờ giao nhận + thời gian chết ─────────────────────────────────────

export class HandoverWindowDto {
  @ApiProperty({ example: '06:00', description: 'HH:mm giờ Việt Nam' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'Giờ bắt đầu phải có dạng HH:mm' })
  start!: string;

  @ApiProperty({ example: '22:00', description: 'HH:mm giờ Việt Nam — 24:00 là hết ngày' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'Giờ kết thúc phải có dạng HH:mm' })
  end!: string;
}

/** GET /vehicles/:id/operation-settings — không có dòng nào thì trả mặc định (buffer 0, mọi giờ). */
export class VehicleOperationSettingsDto {
  @ApiProperty({
    description:
      'Phút chuẩn bị giữa hai chuyến — áp cho lịch GIỮ MỚI/DỜI LỊCH kể từ lúc lưu (ADR 0006), ' +
      'không tính lại occupancy đã có',
  })
  turnaroundBufferMinutes!: number;

  @ApiProperty({ type: [HandoverWindowDto], description: 'Rỗng = giao mọi giờ' })
  pickupWindows!: HandoverWindowDto[];

  @ApiProperty({ type: [HandoverWindowDto], description: 'Rỗng = nhận lại mọi giờ' })
  returnWindows!: HandoverWindowDto[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — null khi chưa lưu lần nào' })
  updatedAt!: string | null;
}

/** PUT /vehicles/:id/operation-settings — thay TOÀN BỘ ba phần (màn hình gửi đúng thứ nó hiện). */
export class SaveVehicleOperationSettingsDto {
  @ApiProperty({ minimum: 0, maximum: TURNAROUND_BUFFER_MAX_MINUTES })
  @IsInt()
  @Min(0)
  @Max(TURNAROUND_BUFFER_MAX_MINUTES)
  turnaroundBufferMinutes!: number;

  @ApiProperty({ type: [HandoverWindowDto] })
  @IsArray()
  @ArrayMaxSize(HANDOVER_WINDOW_MAX_PER_KIND)
  @ValidateNested({ each: true })
  @Type(() => HandoverWindowDto)
  pickupWindows!: HandoverWindowDto[];

  @ApiProperty({ type: [HandoverWindowDto] })
  @IsArray()
  @ArrayMaxSize(HANDOVER_WINDOW_MAX_PER_KIND)
  @ValidateNested({ each: true })
  @Type(() => HandoverWindowDto)
  returnWindows!: HandoverWindowDto[];
}

// ── Thiết lập theo dịch vụ ───────────────────────────────────────────────────

/**
 * Năng lực tự động nhận có TÀI XẾ của gian hàng — server nói thẳng vì sao chưa bật được, thay vì
 * để một toggle bật lên rồi không bao giờ có tác dụng.
 */
export class WithDriverAutoAcceptCapabilityDto {
  @ApiProperty({ description: 'Gói hiện hành có tính năng Tài xế và gian hàng có tài xế đang hoạt động' })
  available!: boolean;

  @ApiProperty({ description: 'Số tài xế đang hoạt động (0 = không gán được ai)' })
  activeDrivers!: number;

  @ApiProperty({ description: 'Tính năng Tài xế có trong gói hiện hành (ADR 0027)' })
  driversFeatureEnabled!: boolean;
}

export class VehicleServiceSettingDto {
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiProperty() autoAcceptEnabled!: boolean;
  @ApiProperty() autoAcceptMinLeadMinutes!: number;
  @ApiProperty() autoAcceptMaxLeadMinutes!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Chỉ có tài xế' })
  minRentalMinutes!: number | null;
  @ApiProperty({ enum: ROUTE_TYPE_VALUES, isArray: true }) preferredRouteTypes!: string[];
  @ApiProperty({
    type: [String],
    description: 'Giấy tờ chủ xe cấu hình (rỗng = bộ tối thiểu theo luật)',
  })
  requiredDocuments!: string[];
  @ApiProperty({
    type: [String],
    description: 'Bộ giấy tờ HIỆU LỰC = tối thiểu theo luật ∪ cấu hình — thứ khách nhìn thấy',
  })
  effectiveRequiredDocuments!: string[];
  @ApiProperty({ enum: IDENTITY_VERIFY_METHOD_VALUES }) identityVerifyMethod!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) termsText!: string | null;
  @ApiProperty() requireTermsAcceptance!: boolean;
  @ApiProperty({ enum: DRIVER_DEPOSIT_MODE_VALUES }) depositMode!: string;
  @ApiProperty({
    enum: DRIVER_DEPOSIT_MODE_VALUES,
    isArray: true,
    description: 'Các chế độ cọc hệ thống THU được hôm nay — chế độ khác hiện disabled',
  })
  supportedDepositModes!: string[];
  @ApiPropertyOptional({
    type: WithDriverAutoAcceptCapabilityDto,
    nullable: true,
    description: 'Chỉ với with_driver — null ở dịch vụ khác',
  })
  withDriverAutoAccept!: WithDriverAutoAcceptCapabilityDto | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — null khi chưa lưu' })
  updatedAt!: string | null;
}

export class VehicleServiceSettingsDto {
  @ApiProperty({ type: [VehicleServiceSettingDto] }) items!: VehicleServiceSettingDto[];
}

/**
 * PATCH /vehicles/:id/service-settings/:serviceType — trường nào gửi mới đổi; màn hình nhỏ chỉ
 * gửi phần của nó nên không làm mất thiết lập của màn khác.
 */
export class PatchVehicleServiceSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoAcceptEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: AUTO_ACCEPT_LEAD_MAX_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(AUTO_ACCEPT_LEAD_MAX_MINUTES)
  autoAcceptMinLeadMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: AUTO_ACCEPT_LEAD_MAX_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(AUTO_ACCEPT_LEAD_MAX_MINUTES)
  autoAcceptMaxLeadMinutes?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: MIN_RENTAL_MINUTES_RANGE.min,
    maximum: MIN_RENTAL_MINUTES_RANGE.max,
    description: 'Phút — null = không giới hạn; chỉ có nghĩa với with_driver',
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_RENTAL_MINUTES_RANGE.min)
  @Max(MIN_RENTAL_MINUTES_RANGE.max)
  minRentalMinutes?: number | null;

  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ROUTE_TYPE_VALUES, { each: true })
  preferredRouteTypes?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Tập con của citizen_id | driver_licence | passport',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CONFIGURABLE_CUSTOMER_DOCUMENT_TYPES, { each: true })
  requiredDocuments?: string[];

  @ApiPropertyOptional({ enum: IDENTITY_VERIFY_METHOD_VALUES })
  @IsOptional()
  @IsIn(IDENTITY_VERIFY_METHOD_VALUES)
  identityVerifyMethod?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: RENTAL_TERMS_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(RENTAL_TERMS_MAX_LENGTH)
  termsText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireTermsAcceptance?: boolean;

  /** Chỉ nhận mã hệ thống THU được — 30%/50% bị từ chối ở đây cho tới khi nối vào vòng đời giữ chỗ. */
  @ApiPropertyOptional({ enum: DRIVER_DEPOSIT_MODE_SUPPORTED })
  @IsOptional()
  @IsIn(DRIVER_DEPOSIT_MODE_SUPPORTED)
  depositMode?: string;
}

// ── Phụ phí mặc định có tài xế ──────────────────────────────────────────────

export class DriverSurchargeRuleDto {
  @ApiProperty({ enum: DRIVER_SURCHARGE_KIND_VALUES }) kind!: string;
  @ApiProperty({ enum: DRIVER_SURCHARGE_UNIT_VALUES, description: 'Cố định theo loại' }) unit!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ description: 'VND string — ADR 0007' }) amount!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Ngưỡng theo loại: phút-trong-ngày · phút chờ miễn phí · km/ngày; null với overnight',
  })
  thresholdValue!: number | null;
}

export class DriverSurchargeRulesDto {
  @ApiProperty({ type: [DriverSurchargeRuleDto] }) items!: DriverSurchargeRuleDto[];
}

export class SaveDriverSurchargeRuleDto {
  @ApiProperty({ enum: DRIVER_SURCHARGE_KIND_VALUES })
  @IsIn(DRIVER_SURCHARGE_KIND_VALUES)
  kind!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ description: 'VND string không âm', example: '50000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Số tiền phụ phí không hợp lệ' })
  amount!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: DRIVER_SURCHARGE_THRESHOLD_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(DRIVER_SURCHARGE_THRESHOLD_MAX)
  thresholdValue?: number | null;
}

/** PUT /vehicles/:id/driver-surcharge-rules — gửi đủ bốn loại; loại vắng mặt được coi là tắt. */
export class SaveDriverSurchargeRulesDto {
  @ApiProperty({ type: [SaveDriverSurchargeRuleDto] })
  @IsArray()
  @ArrayMaxSize(DRIVER_SURCHARGE_KIND_VALUES.length)
  @ValidateNested({ each: true })
  @Type(() => SaveDriverSurchargeRuleDto)
  items!: SaveDriverSurchargeRuleDto[];
}

// ── Lịch sử chuyến của MỘT xe ───────────────────────────────────────────────

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 50;
export { HISTORY_DEFAULT_LIMIT as TRIP_HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT as TRIP_HISTORY_MAX_LIMIT };

export class VehicleTripHistoryQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TRIP_HISTORY_FILTER_VALUES, default: VEHICLE_TRIP_HISTORY_FILTER.ALL })
  @IsOptional()
  @IsIn(VEHICLE_TRIP_HISTORY_FILTER_VALUES)
  filter?: VehicleTripHistoryFilter;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: HISTORY_DEFAULT_LIMIT, minimum: 1, maximum: HISTORY_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit?: number;
}

/**
 * Một dòng lịch sử — đơn thuê THẬT hoặc yêu cầu chưa/không thành đơn. Yêu cầu đã chuyển thành
 * đơn CHỈ xuất hiện một lần dưới dạng đơn. Không có SĐT/email khách ở đây: thẻ chỉ cần tên.
 */
export class VehicleTripHistoryItemDto {
  @ApiProperty({ description: 'Khoá ổn định của dòng: `booking:<id>` hoặc `request:<id>`' }) key!: string;
  @ApiProperty({ enum: VEHICLE_TRIP_HISTORY_KIND_VALUES }) kind!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) requestId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã đơn — chỉ có ở đơn' }) code!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: BOOKING_STATUS_VALUES }) bookingStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: BOOKING_REQUEST_STATUS_VALUES })
  requestStatus!: string | null;
  @ApiProperty({ enum: CUSTOMER_TRIP_STAGE_VALUES, description: 'Chặng gộp — cùng phép chiếu với Chuyến của tôi' })
  stage!: string;
  @ApiProperty({ enum: SERVICE_TYPE_VALUES }) serviceType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) routeType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO — null với yêu cầu dài hạn chưa chốt' })
  pickupAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) returnAt!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) longTermPackageMonths!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND string — null khi chưa có số chốt' })
  totalAmount!: string | null;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerAvatarUrl!: string | null;
  @ApiProperty({ description: 'ISO — lần xử lý gần nhất (duyệt/từ chối/đổi trạng thái)' }) happenedAt!: string;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, enum: BOOKING_REQUEST_DECISION_SOURCE_VALUES })
  decisionSource!: string | null;
}

export class VehicleTripHistoryPageDto {
  @ApiProperty({ type: [VehicleTripHistoryItemDto] }) data!: VehicleTripHistoryItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

// ── Tự động nhận (preview công khai) ────────────────────────────────────────

/** Khả năng tự động nhận cho một yêu cầu CỤ THỂ — server quyết, client chỉ hiển thị. */
export class AutoAcceptPreviewDto {
  @ApiProperty({ description: 'true = nếu gửi ngay bây giờ, hệ thống sẽ tự nhận (trừ khi lịch vừa bị chiếm)' })
  eligible!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, enum: AUTO_ACCEPT_BLOCKER_VALUES })
  blocker!: string | null;
}
