import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  BILLING_MODE_VALUES,
  FREE_TRIP_ALLOWANCE,
  PLAN_FEATURE_VALUES,
  PLAN_STATUS_VALUES,
  SUBSCRIPTION_INVOICE_STATUS_VALUES,
  SUBSCRIPTION_STATUS_VALUES,
  SUBSCRIPTION_TERM_MONTHS,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as SUBSCRIPTION_DEFAULT_LIMIT, MAX_LIMIT as SUBSCRIPTION_MAX_LIMIT };

// ---------------------------------------------------------------------------
// Núm vặn bậc gói (ADR 0015 điều 4) — input validate chặt, response luôn đủ hình
// ---------------------------------------------------------------------------

/** Đơn giá MỘT chỗ / tháng theo loại xe. `null` = bậc gói không bán loại chỗ đó. */
export class PlanVehicleSlotPriceDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND, chuỗi — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'perVehiclePrice.car phải là số tiền hợp lệ' })
  car?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND, chuỗi — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'perVehiclePrice.motorbike phải là số tiền hợp lệ' })
  motorbike?: string | null;
}

/** Một kỳ hạn bậc gói bán, kèm % giảm cho cam kết dài (ADR 0015 điều 3). */
export class PlanTermOptionDto {
  @ApiProperty({ enum: SUBSCRIPTION_TERM_MONTHS, description: 'Kỳ hạn THÁNG LỊCH' })
  @IsIn([...SUBSCRIPTION_TERM_MONTHS])
  months!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent!: number;
}

/**
 * `plans.limits_json` — mọi field optional ở INPUT (thiếu = giá trị an toàn: không giới hạn,
 * không gồm sẵn, không cờ); service chuẩn hoá về đủ hình trước khi ghi DB.
 */
export class PlanLimitsInputDto {
  @ApiPropertyOptional({ type: PlanVehicleSlotPriceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanVehicleSlotPriceDto)
  perVehiclePrice?: PlanVehicleSlotPriceDto;

  @ApiPropertyOptional({ description: 'Số chỗ ô tô gồm sẵn trong phí nền', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedCars?: number;

  @ApiPropertyOptional({ description: 'Số chỗ xe máy gồm sẵn trong phí nền', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedMotorbikes?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxCars?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxMotorbikes?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxMembers?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBranches?: number | null;

  @ApiPropertyOptional({ type: [PlanTermOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanTermOptionDto)
  terms?: PlanTermOptionDto[];

  @ApiPropertyOptional({ description: 'Số ngày ân hạn sau ends_at', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceDays?: number;

  @ApiPropertyOptional({
    enum: PLAN_FEATURE_VALUES,
    isArray: true,
    description: 'Cờ năng lực (ADR 0027)',
  })
  @IsOptional()
  @IsArray()
  @IsIn(PLAN_FEATURE_VALUES, { each: true })
  features?: string[];
}

/** Response: luôn ĐỦ hình dạng (parser phòng thủ đã điền giá trị an toàn). */
export class PlanLimitsDto {
  @ApiProperty({ type: PlanVehicleSlotPriceDto }) perVehiclePrice!: PlanVehicleSlotPriceDto;
  @ApiProperty() includedCars!: number;
  @ApiProperty() includedMotorbikes!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxCars!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxMotorbikes!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxMembers!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxBranches!: number | null;
  @ApiProperty({ type: [PlanTermOptionDto] }) terms!: PlanTermOptionDto[];
  @ApiProperty() graceDays!: number;
  @ApiProperty({ enum: PLAN_FEATURE_VALUES, isArray: true }) features!: string[];
}

/**
 * Giả định cho phép KIỂM ĐIỂM GIAO (ADR 0020) — bắt buộc với bậc gói `package`:
 * không chứng minh được bài toán khuyến khích thì không lưu được gói bán tiền thật.
 */
export class PlanAssumedGmvDto {
  @ApiProperty({ description: 'Doanh thu giả định 1 xe / 1 tháng — VND, chuỗi' })
  @Matches(MONEY_PATTERN, { message: 'monthlyGmvPerCar phải là số tiền hợp lệ' })
  monthlyGmvPerCar!: string;

  @ApiProperty({ minimum: 1, maximum: 20, description: '% hoa hồng tuyến A dùng để so' })
  @IsNumber()
  @Min(1)
  @Max(20)
  commissionPercent!: number;
}

/** Số chỗ theo loại xe (ADR 0015 điều 1) — dùng cho cả input lẫn response. */
export class PlanSlotsDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  car!: number;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  motorbike!: number;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export class PlanListQueryDto {
  @ApiPropertyOptional({ enum: PLAN_STATUS_VALUES, description: 'Bỏ trống = chỉ gói đang bán' })
  @IsOptional()
  @IsIn([...PLAN_STATUS_VALUES, 'all'])
  status?: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'basic', description: 'Mã gói — unique, không đổi sau khi tạo' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,49}$/, {
    message: 'code chỉ gồm chữ thường/số/gạch, 2-50 ký tự',
  })
  code!: string;

  @ApiProperty({ example: 'Gói Cơ bản' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: BILLING_MODE_VALUES, description: 'Chế độ thu phí (ADR 0020)' })
  @IsIn(BILLING_MODE_VALUES)
  billingMode!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 20,
    description: 'BẮT BUỘC khi billingMode=commission; phải trống khi package',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  commissionPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Phí nền / tháng (ADR 0020) — VND, chuỗi. Bỏ trống = 0',
    example: '990000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'basePriceMonthly phải là số tiền hợp lệ' })
  basePriceMonthly?: string;

  @ApiPropertyOptional({ type: PlanAssumedGmvDto, description: 'Bắt buộc với bậc package' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanAssumedGmvDto)
  assumedMonthlyGmv?: PlanAssumedGmvDto;

  @ApiPropertyOptional({ type: PlanLimitsInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsInputDto)
  limits?: PlanLimitsInputDto;

  @ApiPropertyOptional({
    description: 'CỘT CŨ (ADR 0010, chờ contract) — giá phẳng một chu kỳ. Bỏ trống = 0',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'price phải là số tiền hợp lệ' })
  price?: string;

  @ApiPropertyOptional({
    description: 'CỘT CŨ (ADR 0015 điều 2 thay bằng term_months, chờ contract) — bỏ trống = 30',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3660)
  durationDays?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'CỘT CŨ — thay bằng limits.maxCars/maxMotorbikes (ADR 0015, chờ contract)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  // Không khai `default` ở @ApiPropertyOptional: openapi-typescript coi field có default là
  // BẮT BUỘC trong type sinh ra, ép client phải gửi thứ vốn dĩ bỏ trống được.
  @ApiPropertyOptional({ description: 'Bỏ trống = 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** Sửa gói — không đổi `code` (định danh); giá mới chỉ áp cho lượt gán sau (price snapshot). */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: BILLING_MODE_VALUES, description: 'Chế độ thu phí (ADR 0020)' })
  @IsOptional()
  @IsIn(BILLING_MODE_VALUES)
  billingMode?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  commissionPercent?: number | null;

  @ApiPropertyOptional({ description: 'Phí nền / tháng — VND, chuỗi' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'basePriceMonthly phải là số tiền hợp lệ' })
  basePriceMonthly?: string;

  @ApiPropertyOptional({ type: PlanAssumedGmvDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanAssumedGmvDto)
  assumedMonthlyGmv?: PlanAssumedGmvDto;

  @ApiPropertyOptional({ type: PlanLimitsInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsInputDto)
  limits?: PlanLimitsInputDto;

  @ApiPropertyOptional({ description: 'CỘT CŨ (chờ contract) — tiền dạng string — ADR 0007' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'price phải là số tiền hợp lệ' })
  price?: string;

  @ApiPropertyOptional({ description: 'CỘT CŨ (chờ contract)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3660)
  durationDays?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = bỏ giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class PlanDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: BILLING_MODE_VALUES, description: 'Chế độ thu phí (ADR 0020)' })
  billingMode!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% hoa hồng — chỉ có ở bậc commission',
  })
  commissionPercent!: number | null;
  @ApiProperty({ description: 'Phí nền / tháng — tiền dạng string — ADR 0007' })
  basePriceMonthly!: string;
  @ApiProperty({ type: PlanLimitsDto, description: 'Núm vặn bậc gói (ADR 0015 điều 4)' })
  limits!: PlanLimitsDto;
  @ApiPropertyOptional({
    type: PlanAssumedGmvDto,
    nullable: true,
    description: 'Giả định cho kiểm điểm giao (ADR 0020)',
  })
  assumedMonthlyGmv!: PlanAssumedGmvDto | null;
  @ApiProperty({ description: 'CỘT CŨ (chờ contract) — tiền dạng string — ADR 0007' })
  price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'CỘT CŨ (chờ contract) — kỳ hạn nay ở term_months' })
  durationDays!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'CỘT CŨ (chờ contract) — null = không giới hạn',
  })
  maxVehicles!: number | null;
  @ApiProperty({ enum: PLAN_STATUS_VALUES }) status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Số thuê bao đã gán từ gói này (mọi trạng thái)' })
  subscriptionCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export class SubscriptionListQueryDto {
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

/** Gán/gia hạn gói: chu kỳ mới nối đuôi gói hiện hành (còn hạn) hoặc bắt đầu từ bây giờ. */
export class AssignSubscriptionDto {
  @ApiProperty({ description: 'ID gói (ULID)' })
  @IsString()
  @Length(26, 26)
  planId!: string;

  @ApiProperty({
    enum: SUBSCRIPTION_TERM_MONTHS,
    description: 'Kỳ hạn THÁNG LỊCH (ADR 0015 điều 2) — ends_at = starts_at + N tháng lịch',
  })
  @Type(() => Number)
  @IsIn([...SUBSCRIPTION_TERM_MONTHS])
  termMonths!: number;

  @ApiPropertyOptional({
    type: PlanSlotsDto,
    description:
      'Số chỗ mua — bỏ trống = đúng số chỗ gồm sẵn của gói; thấp hơn số gồm sẵn thì được nâng lên bằng (phí nền đã bao chúng)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanSlotsDto)
  slots?: PlanSlotsDto;

  @ApiPropertyOptional({ description: 'Ghi chú (số chứng từ, lý do tặng…)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SubscriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({
    enum: SUBSCRIPTION_STATUS_VALUES,
    description: 'Lưu active|cancelled; expired suy ra từ endsAt (ADR 0010)',
  })
  status!: string;
  @ApiProperty({ description: 'Tiền cả kỳ (snapshot lúc gán), dạng string — ADR 0007' })
  price!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Kỳ hạn THÁNG LỊCH — null ở dòng lịch sử trước ADR 0015',
  })
  termMonths!: number | null;
  @ApiPropertyOptional({
    type: PlanSlotsDto,
    nullable: true,
    description: 'Số chỗ đã mua — null ở dòng lịch sử trước ADR 0015',
  })
  slots!: PlanSlotsDto | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: BILLING_MODE_VALUES,
    description: 'SNAPSHOT lúc gán (ADR 0024 điều 2) — không đọc xuyên qua plans',
  })
  billingMode!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'SNAPSHOT lúc gán' })
  commissionPercent!: number | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) startsAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endsAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class SubscriptionPageDto {
  @ApiProperty({ type: [SubscriptionDto] }) data!: SubscriptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Hoá đơn gói (ADR 0015 điều 5) + màn "Gói của tôi"
// ---------------------------------------------------------------------------

/** Một dòng snapshot của hoá đơn — hoá đơn tự giải thích được, không cần join. */
export class PlanInvoiceLineDto {
  @ApiProperty({ enum: ['base', 'slot', 'add_slot'] }) kind!: string;
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES }) vehicleType?: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() months!: number;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) unitPrice!: string;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) amount!: string;
}

export class SubscriptionInvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'NULL tới khi gói được kích hoạt (tiền đã về hoặc admin gán tay — ADR 0026 điều 4)',
  })
  subscriptionId!: string | null;
  @ApiProperty({ description: 'Mã đối soát chuyển khoản, tiền tố XPG (ADR 0022 điều 3)' })
  code!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() termMonths!: number;
  @ApiProperty({ type: PlanSlotsDto }) slots!: PlanSlotsDto;
  @ApiProperty({ type: [PlanInvoiceLineDto] }) lines!: PlanInvoiceLineDto[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) periodFrom!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) periodTo!: string;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) subtotal!: string;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) discountAmount!: string;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) totalAmount!: string;
  @ApiProperty({ description: 'Tiền đã về, cộng dồn — VND, chuỗi' }) paidAmount!: string;
  @ApiProperty({ enum: SUBSCRIPTION_INVOICE_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  paidAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hạn chuyển khoản của hoá đơn issued — quá hạn job lật void',
  })
  expiresAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class SubscriptionInvoicePageDto {
  @ApiProperty({ type: [SubscriptionInvoiceDto] }) data!: SubscriptionInvoiceDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Gian hàng tự mua / gia hạn gói — sinh hoá đơn `issued` + mã đối soát, CHƯA kích hoạt. */
export class PurchaseSubscriptionDto {
  @ApiProperty({ description: 'ID gói (ULID)' })
  @IsString()
  @Length(26, 26)
  planId!: string;

  @ApiProperty({ enum: SUBSCRIPTION_TERM_MONTHS, description: 'Kỳ hạn THÁNG LỊCH (ADR 0015)' })
  @Type(() => Number)
  @IsIn([...SUBSCRIPTION_TERM_MONTHS])
  termMonths!: number;

  @ApiPropertyOptional({ type: PlanSlotsDto, description: 'Bỏ trống = đúng số chỗ gồm sẵn' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanSlotsDto)
  slots?: PlanSlotsDto;
}

/** Mua thêm chỗ giữa kỳ (ADR 0015 điều 8) — slots là TỔNG số chỗ mới, không phải phần thêm. */
export class AddSlotsDto {
  @ApiProperty({ type: PlanSlotsDto, description: 'TỔNG số chỗ sau khi mua thêm' })
  @ValidateNested()
  @Type(() => PlanSlotsDto)
  slots!: PlanSlotsDto;

  @ApiPropertyOptional({ description: 'Ghi chú (số chứng từ…)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Mức dùng chỗ của MỘT loại xe — so với hạn mức từ snapshot slots (ADR 0015 điều 1). */
export class SlotUsageDto {
  @ApiProperty({ description: 'Số xe chưa xoá (điểm chặn tạo xe)' }) used!: number;
  @ApiProperty({ description: 'Số xe đang chiếm suất trên chợ (chờ duyệt + công khai)' })
  onMarketplace!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  limit!: number | null;
}

export class VehicleSlotUsageDto {
  @ApiProperty({ type: SlotUsageDto }) car!: SlotUsageDto;
  @ApiProperty({ type: SlotUsageDto }) motorbike!: SlotUsageDto;
}

/** Lượt miễn phí (ADR 0026) — màn "Gói của tôi" phải nói trước điều gì xảy ra ở đơn thứ ba. */
export class FreeTripsDto {
  @ApiProperty({ example: FREE_TRIP_ALLOWANCE }) allowance!: number;
  @ApiProperty() used!: number;
  @ApiProperty() left!: number;
}

export class MySubscriptionDto {
  @ApiPropertyOptional({ type: () => CurrentPlanDto, nullable: true })
  currentPlan!: CurrentPlanDto | null;
  @ApiProperty({ type: VehicleSlotUsageDto }) usage!: VehicleSlotUsageDto;
  @ApiProperty({ type: FreeTripsDto }) freeTrips!: FreeTripsDto;
}

/**
 * Gói cho GIAN HÀNG chọn mua: như PlanDto nhưng không lộ `assumedMonthlyGmv` (giả định định
 * giá nội bộ của nền tảng) và `subscriptionCount` (số liệu vận hành).
 */
export class TenantPlanDto extends OmitType(PlanDto, [
  'assumedMonthlyGmv',
  'subscriptionCount',
] as const) {}

/** Gói hiện hành của tenant — nhúng vào PlatformTenantDetailDto. */
export class CurrentPlanDto {
  @ApiProperty() subscriptionId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxVehicles!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: BILLING_MODE_VALUES,
    description: 'SNAPSHOT trên dòng thuê bao (ADR 0024 điều 2) — null ở dòng trước ADR 0015',
  })
  billingMode!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'SNAPSHOT lúc gán' })
  commissionPercent!: number | null;
  @ApiPropertyOptional({
    type: PlanSlotsDto,
    nullable: true,
    description: 'Số chỗ đã mua — null ở dòng trước ADR 0015',
  })
  slots!: PlanSlotsDto | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endsAt!: string;
}
