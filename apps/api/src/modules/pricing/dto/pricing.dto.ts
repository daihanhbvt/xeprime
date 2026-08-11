import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DELIVERY_QUOTE_SOURCE_VALUES,
  POLICY_SOURCE_VALUES,
  PRICE_ROW_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Tiền dạng chuỗi thập phân ≤2 số lẻ (ADR 0007) — cùng pattern với vehicle.dto. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** Trần số bậc cấu hình — chặn payload phình; nghiệp vụ thực tế 3–5 bậc. */
const MAX_TIERS = 10;
/** Trần khoảng cách giao nhận (km) — một chiều trong nội tỉnh/liên tỉnh gần. */
const MAX_KM = 500;

// ---------------------------------------------------------------------------
// Cấu hình chính sách (input + output dùng chung shape tiers)
// ---------------------------------------------------------------------------

/** Một bậc phí giao nhận: áp cho khoảng cách ≤ `toKm`; mốc "từ" suy từ bậc liền trước. */
export class DeliveryTierDto {
  @ApiProperty({
    description: 'Mốc "đến" (km) — các bậc phải tăng dần nghiêm ngặt',
    maximum: MAX_KM,
  })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(MAX_KM)
  toKm!: number;

  @ApiProperty({ description: "Phí VND dạng chuỗi — '0' = miễn phí", example: '30000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Phí giao nhận không hợp lệ (số VND không âm)' })
  fee!: string;
}

/** Một mốc ưu đãi giảm giá theo số ngày thuê tối thiểu. */
export class DiscountTierDto {
  @ApiProperty({ description: 'Số ngày thuê tối thiểu — các mốc phải tăng dần nghiêm ngặt' })
  @IsInt()
  @Min(1)
  @Max(365)
  minDays!: number;

  @ApiProperty({ description: 'Mức giảm % (1–100), CHỈ áp lên tiền thuê cơ bản' })
  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;

  @ApiPropertyOptional({ description: 'Ghi chú hiển thị' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/**
 * Payload lưu chính sách — dùng cho CẢ mặc định gian hàng lẫn bản ghi đè theo xe.
 * Ràng buộc chéo (bậc tăng dần, bán kính khớp mốc cuối, không hở khoảng) kiểm ở
 * PricingService.validatePolicy — class-validator không mô tả được quan hệ giữa field.
 */
export class SaveRentalPolicyDto {
  @ApiProperty({ description: 'Cọc thế chấp cố định VND (chuỗi)', example: '5000000' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Tiền cọc không hợp lệ (số VND không âm)' })
  depositAmount!: string;

  @ApiProperty()
  @IsBoolean()
  deliveryEnabled!: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Bán kính tự báo giá tối đa (km) — bắt buộc khi bật giao nhận, phải bằng mốc "đến" của bậc cuối',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1, { message: 'Giá trị bán kính không thể âm' })
  @Max(MAX_KM)
  deliveryMaxRadiusKm?: number | null;

  @ApiProperty({ type: [DeliveryTierDto] })
  @IsArray()
  @ArrayMaxSize(MAX_TIERS)
  @ValidateNested({ each: true })
  @Type(() => DeliveryTierDto)
  deliveryTiers!: DeliveryTierDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phí mỗi giờ trả trễ (VND) — null = chưa cấu hình',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'Phí quá giờ không hợp lệ (số VND không âm)' })
  overtimeFeePerHour?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Phút trễ miễn phí tối đa — null = chưa cấu hình',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  overtimeGraceMinutes?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Đơn vị làm tròn tối thiểu (phút) — null = chưa cấu hình',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  overtimeRoundingMinutes?: number | null;

  @ApiProperty()
  @IsBoolean()
  discountEnabled!: boolean;

  @ApiProperty({ type: [DiscountTierDto] })
  @IsArray()
  @ArrayMaxSize(MAX_TIERS)
  @ValidateNested({ each: true })
  @Type(() => DiscountTierDto)
  discountTiers!: DiscountTierDto[];
}

/** Giá trị chính sách trả về — tiers cùng shape với input, tiền là string. */
export class RentalPolicyValuesDto {
  @ApiProperty() depositAmount!: string;
  @ApiProperty() deliveryEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) deliveryMaxRadiusKm!: number | null;
  @ApiProperty({ type: [DeliveryTierDto] }) deliveryTiers!: DeliveryTierDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) overtimeFeePerHour!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) overtimeGraceMinutes!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) overtimeRoundingMinutes!: number | null;
  @ApiProperty() discountEnabled!: boolean;
  @ApiProperty({ type: [DiscountTierDto] }) discountTiers!: DiscountTierDto[];
  @ApiProperty({ description: 'ISO — mốc phát hiện báo giá/preview cũ' }) updatedAt!: string;
}

/** GET/PUT /shop/rental-policies — chính sách mặc định + số xe kế thừa/ghi đè. */
export class ShopRentalPolicyDto {
  @ApiPropertyOptional({
    type: RentalPolicyValuesDto,
    nullable: true,
    description: 'null = gian hàng chưa cấu hình',
  })
  policy!: RentalPolicyValuesDto | null;

  @ApiProperty({ description: 'Số xe đang kế thừa chính sách chung' })
  inheritingVehicles!: number;

  @ApiProperty({ description: 'Số xe đã ghi đè chính sách riêng' })
  overriddenVehicles!: number;
}

// ---------------------------------------------------------------------------
// Giá & chính sách theo xe
// ---------------------------------------------------------------------------

/** GET /vehicles/:id/pricing — nguồn chính sách + giá trị hiệu lực + bản gian hàng để đối chiếu. */
export class VehiclePricingDto {
  @ApiProperty({
    enum: POLICY_SOURCE_VALUES,
    nullable: true,
    type: String,
    description: 'null = chưa có chính sách nào (gian hàng chưa cấu hình, xe không ghi đè)',
  })
  source!: string | null;

  @ApiPropertyOptional({
    type: RentalPolicyValuesDto,
    nullable: true,
    description: 'Chính sách HIỆU LỰC của xe',
  })
  policy!: RentalPolicyValuesDto | null;

  @ApiPropertyOptional({
    type: RentalPolicyValuesDto,
    nullable: true,
    description: 'Chính sách mặc định gian hàng (đối chiếu / đặt lại)',
  })
  shopPolicy!: RentalPolicyValuesDto | null;

  @ApiPropertyOptional({ type: String, nullable: true }) weekdayPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) weekendPrice!: string | null;

  @ApiProperty({
    description: 'Xe đang hiển thị công khai — lưu giá sẽ đưa xe về chờ duyệt lại (ADR 0008)',
  })
  isPublic!: boolean;
}

/**
 * PUT /vehicles/:id/pricing.
 * `source='shop'` = đặt lại theo gian hàng (XOÁ bản ghi đè; `policy` bị bỏ qua).
 * `source='vehicle'` = ghi đè — `policy` bắt buộc.
 * Giá chỉ được sửa khi ghi đè (thiết kế: chế độ kế thừa là read-only).
 */
export class SaveVehiclePricingDto {
  @ApiProperty({ enum: POLICY_SOURCE_VALUES })
  @IsIn(POLICY_SOURCE_VALUES)
  source!: string;

  @ApiPropertyOptional({ description: 'Giá thuê ngày thường VND — chỉ nhận khi source=vehicle' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'Giá thuê không hợp lệ (số VND không âm)' })
  weekdayPrice?: string;

  @ApiPropertyOptional({ description: 'Giá cuối tuần VND — chỉ nhận khi source=vehicle' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'Giá cuối tuần không hợp lệ (số VND không âm)' })
  weekendPrice?: string;

  @ApiPropertyOptional({ type: SaveRentalPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveRentalPolicyDto)
  policy?: SaveRentalPolicyDto;
}

// ---------------------------------------------------------------------------
// Breakdown giá (dùng chung public quote / preview báo giá / snapshot)
// ---------------------------------------------------------------------------

export class PriceBreakdownRowDto {
  @ApiProperty({ enum: PRICE_ROW_VALUES }) key!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) sublabel!: string | null;
  @ApiProperty({ description: 'VND chuỗi; dòng giảm giá mang dấu âm' }) amount!: string;
}

export class QuoteBreakdownDto {
  @ApiProperty({ description: 'Số ngày tính tiền' }) days!: number;
  @ApiProperty({ type: [PriceBreakdownRowDto] }) rows!: PriceBreakdownRowDto[];
  @ApiProperty({ description: 'Tổng khách trả TRƯỚC cọc' }) totalAmount!: string;
  @ApiProperty({ description: 'Cọc thế chấp hoàn trả — không nằm trong tổng' })
  depositAmount!: string;
  @ApiProperty({ enum: POLICY_SOURCE_VALUES, nullable: true, type: String })
  policySource!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'updatedAt của chính sách hiệu lực',
  })
  policyUpdatedAt!: string | null;
}

/** Tóm tắt giao nhận cho khách xem trước khi đặt (public). */
export class DeliverySummaryDto {
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxRadiusKm!: number | null;
  @ApiProperty({ type: [DeliveryTierDto] }) tiers!: DeliveryTierDto[];
}

/** GET /public/listings/:id/quote — báo giá công khai (chưa gồm phí giao nhận). */
export class PublicQuoteDto {
  @ApiProperty({ type: QuoteBreakdownDto }) breakdown!: QuoteBreakdownDto;
  @ApiProperty({ type: DeliverySummaryDto }) delivery!: DeliverySummaryDto;
}

export class PublicQuoteQueryDto {
  @ApiProperty({ description: 'ISO datetime nhận xe' })
  @IsISO8601()
  pickupAt!: string;

  @ApiProperty({ description: 'ISO datetime trả xe' })
  @IsISO8601()
  returnAt!: string;
}

// ---------------------------------------------------------------------------
// Báo giá giao nhận trên yêu cầu đặt xe
// ---------------------------------------------------------------------------

/** Input báo giá (lưu) và preview (không lưu) dùng chung. */
export class SaveDeliveryQuoteDto {
  @ApiProperty({ description: 'Khoảng cách một chiều shop xác nhận (km)', maximum: MAX_KM })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0, { message: 'Giá trị khoảng cách không thể âm' })
  @Max(MAX_KM)
  distanceKm!: number;

  @ApiPropertyOptional({
    description:
      'Phí đề xuất VND — bắt buộc khi NGOÀI bán kính tự báo; trong bán kính bị bỏ qua (phí tính tự động)',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'Phí giao nhận không hợp lệ (số VND không âm)' })
  fee?: string;

  @ApiPropertyOptional({ description: 'Ghi chú cho khách hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Preview báo giá — chưa lưu gì. */
export class DeliveryQuotePreviewDto {
  @ApiProperty({ description: 'Khoảng cách nằm ngoài bán kính tự báo → phí phải nhập tay' })
  requiresManualFee!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phí tự tính theo bậc (trong bán kính); null khi phải nhập tay',
  })
  autoFee!: string | null;

  @ApiProperty({
    type: QuoteBreakdownDto,
    description: 'Breakdown đầy đủ nếu chốt với khoảng cách/phí này',
  })
  breakdown!: QuoteBreakdownDto;
}

/** Báo giá giao nhận đã lưu trên một yêu cầu. */
export class BookingRequestDeliveryQuoteDto {
  @ApiProperty() distanceKm!: number;
  @ApiProperty() fee!: string;
  @ApiProperty({ enum: DELIVERY_QUOTE_SOURCE_VALUES }) source!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() quotedAt!: string;
  @ApiProperty({ description: 'Chính sách đã đổi SAU khi báo giá — nên báo giá lại' })
  stale!: boolean;
}

// ---------------------------------------------------------------------------
// Snapshot giá trên đơn thuê (đọc)
// ---------------------------------------------------------------------------

/** Bản sao chính sách trong snapshot — thêm nguồn so với RentalPolicyValuesDto. */
export class SnapshotPolicyDto extends RentalPolicyValuesDto {
  @ApiProperty({ enum: POLICY_SOURCE_VALUES }) source!: string;
}

export class BookingPriceSnapshotDto {
  @ApiProperty() calculatedAt!: string;
  @ApiProperty({ enum: ['quote', 'manual'] }) source!: string;
  @ApiProperty({ enum: ['VND'] }) currency!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) days!: number | null;
  @ApiProperty({ type: [PriceBreakdownRowDto] }) rows!: PriceBreakdownRowDto[];
  @ApiProperty() totalAmount!: string;
  @ApiProperty() depositAmount!: string;
  @ApiPropertyOptional({ type: SnapshotPolicyDto, nullable: true })
  policy!: SnapshotPolicyDto | null;
}
