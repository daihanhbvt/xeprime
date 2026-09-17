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
  IsBoolean,
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

/**
 * MỘT lựa chọn mua của bậc gói: kỳ hạn + tiền CẢ KỲ (ADR 0041 điều 2).
 *
 * `price` là số TUYỆT ĐỐI admin gõ. Không có `discountPercent` nào được lưu — % tiết kiệm trên
 * bảng giá được TÍNH RA từ chính bảng này (`planTermSavingPercent`) và không bao giờ đi vào một
 * dòng tiền.
 */
export class PlanTermPriceDto {
  @ApiProperty({ enum: SUBSCRIPTION_TERM_MONTHS, description: 'Kỳ hạn THÁNG LỊCH' })
  @Type(() => Number)
  @IsIn([...SUBSCRIPTION_TERM_MONTHS])
  months!: number;

  @ApiProperty({ description: 'Tiền CẢ KỲ — VND, chuỗi — ADR 0007', example: '250000' })
  @Matches(MONEY_PATTERN, { message: 'termPrices[].price phải là số tiền hợp lệ' })
  price!: string;
}

/**
 * `plans.limits_json` — mọi field optional ở INPUT (thiếu = giá trị an toàn: không giới hạn,
 * không bán, không cờ); service chuẩn hoá về đủ hình trước khi ghi DB.
 */
export class PlanLimitsInputDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Trần TỔNG ô tô + xe máy (ADR 0041 điều 1). null = không giới hạn',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxVehicles?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBranches?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxMembers?: number | null;

  @ApiPropertyOptional({
    type: [PlanTermPriceDto],
    description: 'Bảng giá = danh sách kỳ hạn ĐƯỢC BÁN. Rỗng = bậc không bán trực tiếp',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanTermPriceDto)
  termPrices?: PlanTermPriceDto[];

  @ApiPropertyOptional({
    description: 'Bậc bán bằng TƯ VẤN — tenant không tự mua được (ADR 0041 điều 5)',
  })
  @IsOptional()
  @IsBoolean()
  salesOnly?: boolean;

  @ApiPropertyOptional({ description: 'Nhãn "Được đề xuất" trên bảng giá' })
  @IsOptional()
  @IsBoolean()
  recommended?: boolean;

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
  @ApiPropertyOptional({ type: Number, nullable: true }) maxVehicles!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxBranches!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxMembers!: number | null;
  @ApiProperty({ type: [PlanTermPriceDto] }) termPrices!: PlanTermPriceDto[];
  @ApiProperty() salesOnly!: boolean;
  @ApiProperty() recommended!: boolean;
  @ApiProperty() graceDays!: number;
  @ApiProperty({ enum: PLAN_FEATURE_VALUES, isArray: true }) features!: string[];
}

/**
 * Hạn mức ĐÃ MUA, chụp lại trên dòng thuê bao (ADR 0041 điều 3) — `null` ở một trường là KHÔNG
 * GIỚI HẠN tường minh, không phải "chưa khai".
 */
export class PlanQuotaDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) maxVehicles!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxBranches!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxMembers!: number | null;
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

  @ApiPropertyOptional({ type: PlanLimitsInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsInputDto)
  limits?: PlanLimitsInputDto;

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

  @ApiPropertyOptional({ type: PlanLimitsInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsInputDto)
  limits?: PlanLimitsInputDto;

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
  @ApiProperty({ type: PlanLimitsDto, description: 'Núm vặn bậc gói (ADR 0041 điều 1)' })
  limits!: PlanLimitsDto;
  @ApiProperty() currency!: string;
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

  /**
   * Giá ĐÀM PHÁN cả kỳ — ADR 0041 điều 5.
   *
   * Bỏ trống = lấy giá niêm yết của kỳ hạn (`limits.termPrices`). **BẮT BUỘC** với bậc
   * `salesOnly`: bậc đó không có bảng giá để rơi về, và mặc định 0đ ở một đường ghi tiền là
   * tặng một gói doanh nghiệp vì admin quên một ô.
   */
  @ApiPropertyOptional({
    description: 'Giá đàm phán CẢ KỲ — VND, chuỗi. Bắt buộc với bậc salesOnly (ADR 0041 điều 5)',
    example: '5000000',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'price phải là số tiền hợp lệ' })
  price?: string;

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
    type: PlanQuotaDto,
    nullable: true,
    description:
      'SNAPSHOT hạn mức lúc gán (ADR 0041 điều 3) — null ở dòng tuyến hoa hồng và dòng trước ADR 0041',
  })
  quota!: PlanQuotaDto | null;
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

/**
 * Một dòng snapshot của hoá đơn — hoá đơn tự giải thích được, không cần join.
 *
 * Chỉ `package` được GHI từ ADR 0041; ba giá trị còn lại là hoá đơn phát hành TRƯỚC đó theo mô
 * hình chỗ xe, giữ trong enum để chứng từ cũ còn hiển thị đúng.
 */
export class PlanInvoiceLineDto {
  @ApiProperty({ enum: ['package', 'base', 'slot', 'add_slot'] }) kind!: string;
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES, description: 'Chỉ có ở hoá đơn trước ADR 0041' })
  vehicleType?: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() months!: number;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) unitPrice!: string;
  @ApiProperty({ description: 'VND, chuỗi — ADR 0007' }) amount!: string;
}

/**
 * Thông tin nhận chuyển khoản của NỀN TẢNG — web dựng ảnh VietQR quicklink từ đây.
 *
 * `configured: false` khi nhóm SEPAY_* chưa khai: màn thanh toán rơi về mã + số tiền như
 * trước R2, không hiện một QR trỏ vào tài khoản rỗng. Đây là thông tin CÔNG KHAI của nền tảng
 * (in trên mọi lệnh chuyển tiền), không phải PII — trả về nguyên văn là đúng.
 */
export class PaymentInfoDto {
  @ApiProperty({ description: 'Nhóm SEPAY_* đã khai đủ chưa — false thì ba trường dưới là null' })
  configured!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã ngân hàng chuẩn VietQR (vd VCB)',
  })
  bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) accountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) accountName!: string | null;
}

export class SubscriptionInvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'NULL tới khi gói được kích hoạt (tiền đã về hoặc admin gán tay — ADR 0026 điều 4)',
  })
  subscriptionId!: string | null;
  @ApiProperty({ description: 'Mã đối soát chuyển khoản, tiền tố XPG (ADR 0022 điều 3)' })
  code!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() termMonths!: number;
  @ApiProperty({ type: PlanQuotaDto, description: 'Hạn mức sẽ áp khi hoá đơn này kích hoạt gói' })
  quota!: PlanQuotaDto;
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

/**
 * HOÁ ĐƠN GÓI ĐANG CHỜ TIỀN — bọc trong một object vì nó **có thật là null** (ADR 0040).
 *
 * Vì sao không trả thẳng `SubscriptionInvoiceDto | null`: `@ApiOkResponse({ type: X })` sinh ra
 * một schema KHÔNG nullable, nên type sinh cho client sẽ hứa luôn có hoá đơn — và ca thường gặp
 * nhất của endpoint này lại là không có. App native lấy type thẳng từ `components['schemas']`
 * (ADR 0031), nên lời hứa sai đó thành một `null` lúc chạy ở chỗ không ai kiểm.
 *
 * Một trường nullable BÊN TRONG một object thì `@ApiProperty({ nullable: true })` diễn đạt được
 * chính xác, và đó cũng là khuôn mà mọi DTO khác trong file này đã dùng cho trường có thể rỗng.
 */
export class PendingSubscriptionInvoiceDto {
  @ApiProperty({
    type: SubscriptionInvoiceDto,
    nullable: true,
    description: 'Hoá đơn còn nhận được tiền (issued | partially_paid); null khi không có',
  })
  invoice!: SubscriptionInvoiceDto | null;
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
}

/**
 * Mức dùng xe của MỘT loại — con số để HIỂN THỊ.
 *
 * Không còn `limit` ở đây từ ADR 0041: trần là MỘT con số cho cả đội xe và nó ở `fleetQuota`.
 * Viết trần tổng vào ô của từng loại là màn hình nói "3 ô tô" trong khi luật là "3 xe".
 */
export class SlotUsageDto {
  @ApiProperty({ description: 'Số xe chưa xoá (điểm chặn tạo xe)' }) used!: number;
  @ApiProperty({ description: 'Số xe đang chiếm suất trên chợ (chờ duyệt + công khai)' })
  onMarketplace!: number;
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

/**
 * Hạn mức ĐỘI XE đang áp — ADR 0041 điều 4.
 *
 * Một con số cho cả đội xe ở CẢ HAI tuyến: `quota.maxVehicles` của bậc đã mua, hoặc
 * `OWNER_LITE_VEHICLE_LIMIT` khi không có gói. `usage` ngay bên cạnh vẫn trả mức dùng THEO LOẠI
 * vì giao diện cần con số đó, nhưng nó không mang trần nào — trần chỉ có ĐÚNG MỘT nơi.
 *
 * `reason` để màn hình nói đúng lối đi tiếp: chạm trần của bậc đã mua thì việc cần làm là NÂNG
 * BẬC; chạm trần Owner Lite thì là MUA GÓI; `billing_unconfigured` thì là liên hệ hỗ trợ — đó
 * là lỗi cấu hình phía nền tảng, không phải hạn mức của người dùng (ADR 0038 điều 1).
 */
export class FleetQuotaDto {
  @ApiProperty({ enum: ['unlimited', 'total'] })
  kind!: 'unlimited' | 'total';

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Trần TỔNG số xe — chỉ có giá trị khi kind = 'total'",
  })
  totalLimit!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['plan', 'owner_lite', 'billing_unconfigured'],
    description: "Trần này từ đâu ra — null khi kind = 'unlimited'",
  })
  reason!: 'plan' | 'owner_lite' | 'billing_unconfigured' | null;

  @ApiProperty({ description: 'Tổng số xe chưa xoá của gian hàng (cả hai loại)' })
  totalUsed!: number;
}

export class MySubscriptionDto {
  @ApiPropertyOptional({ type: () => CurrentPlanDto, nullable: true })
  currentPlan!: CurrentPlanDto | null;
  @ApiProperty({ type: VehicleSlotUsageDto }) usage!: VehicleSlotUsageDto;
  @ApiProperty({ type: FleetQuotaDto }) fleetQuota!: FleetQuotaDto;
  @ApiProperty({ type: FreeTripsDto }) freeTrips!: FreeTripsDto;
}

/**
 * Gói cho GIAN HÀNG chọn mua: như PlanDto nhưng không lộ `subscriptionCount` — số liệu vận hành
 * của nền tảng, không phải thông tin của người đang chọn gói.
 */
export class TenantPlanDto extends OmitType(PlanDto, ['subscriptionCount'] as const) {}

/** Gói hiện hành của tenant — nhúng vào PlatformTenantDetailDto. */
export class CurrentPlanDto {
  @ApiProperty() subscriptionId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
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
    type: PlanQuotaDto,
    nullable: true,
    description: 'SNAPSHOT hạn mức (ADR 0041 điều 3) — null ở tuyến hoa hồng và dòng cũ',
  })
  quota!: PlanQuotaDto | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endsAt!: string;
}
