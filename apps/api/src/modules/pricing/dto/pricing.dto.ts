import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE_VALUES,
  DELIVERY_QUOTE_SOURCE_VALUES,
  LONG_TERM_PACKAGE_MONTHS_VALUES,
  POLICY_SOURCE_VALUES,
  PRICE_ROW_VALUES,
  ROUTE_TYPE_VALUES,
  type LongTermPackageMonths,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_TYPE_VALUES,
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
  ValidateIf,
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

/**
 * Một mốc ƯU ĐÃI CAM KẾT THỜI HẠN của dịch vụ THUÊ DÀI HẠN (ADR 0011).
 *
 * Mốc đo bằng THÁNG và chỉ nhận đúng các gói hợp lệ — không còn mốc theo ngày, không còn mốc
 * tự do. Ràng buộc chéo (tăng dần, % không giảm khi thời hạn tăng) ở PricingService.validatePolicy.
 */
export class DiscountTierDto {
  @ApiProperty({
    description: 'Số tháng cam kết tối thiểu — phải là một gói thuê hợp lệ',
    enum: LONG_TERM_PACKAGE_MONTHS_VALUES,
  })
  @IsInt()
  @IsIn(LONG_TERM_PACKAGE_MONTHS_VALUES)
  minMonths!: LongTermPackageMonths;

  @ApiProperty({ description: 'Mức giảm % (1–100), CHỈ áp lên giá cơ sở của gói dài hạn' })
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
 * Mốc cũ theo NGÀY còn sót trong `discount_tiers_json` mà migration không quy đổi được sang
 * một gói hợp lệ. CHỈ ĐỌC: máy giá bỏ qua, màn cấu hình hiện cảnh báo để chủ xe chọn lại theo
 * tháng, và bản ghi biến mất ngay lần lưu chính sách kế tiếp (mọi lần ghi đều canonical).
 */
export class LegacyDiscountTierDto {
  @ApiProperty({ description: 'Số ngày của mốc cũ' }) minDays!: number;
  @ApiProperty() percent!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) note?: string;
  @ApiProperty({ description: 'Luôn true — cờ nhận diện mốc cũ chưa quy đổi' }) legacy!: true;
}

/**
 * Payload lưu chính sách — dùng cho CẢ mặc định gian hàng lẫn bản ghi đè theo xe.
 * Ràng buộc chéo (bậc tăng dần, bán kính khớp mốc cuối, không hở khoảng) kiểm ở
 * PricingService.validatePolicy — class-validator không mô tả được quan hệ giữa field.
 */
export class SaveRentalPolicyDto {
  @ApiProperty({
    enum: COLLATERAL_MODE_VALUES,
    description:
      'Hình thức bảo đảm — ba chế độ LOẠI TRỪ nhau. Quan hệ với depositAmount/collateralAssetTypes ' +
      'kiểm ở validatePolicy và ràng bằng CHECK ở DB.',
  })
  @IsIn(COLLATERAL_MODE_VALUES)
  collateralMode!: string;

  @ApiProperty({
    enum: COLLATERAL_ASSET_TYPE_VALUES,
    isArray: true,
    description: 'Loại tài sản nhận thế chấp — chỉ có nghĩa khi collateralMode = asset',
  })
  @IsArray()
  @ArrayMaxSize(COLLATERAL_ASSET_TYPE_VALUES.length)
  @IsIn(COLLATERAL_ASSET_TYPE_VALUES, { each: true })
  collateralAssetTypes!: string[];

  @ApiProperty({
    description: 'Cọc thế chấp cố định VND (chuỗi) — khác 0 CHỈ khi collateralMode = cash',
    example: '5000000',
  })
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
  @ApiProperty({ enum: COLLATERAL_MODE_VALUES }) collateralMode!: string;
  @ApiProperty({ enum: COLLATERAL_ASSET_TYPE_VALUES, isArray: true })
  collateralAssetTypes!: string[];
  @ApiProperty() depositAmount!: string;
  @ApiProperty() deliveryEnabled!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) deliveryMaxRadiusKm!: number | null;
  @ApiProperty({ type: [DeliveryTierDto] }) deliveryTiers!: DeliveryTierDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) overtimeFeePerHour!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) overtimeGraceMinutes!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) overtimeRoundingMinutes!: number | null;
  @ApiProperty() discountEnabled!: boolean;
  @ApiProperty({ type: [DiscountTierDto], description: 'Mốc ưu đãi canonical (theo tháng)' })
  discountTiers!: DiscountTierDto[];
  @ApiProperty({
    type: [LegacyDiscountTierDto],
    description: 'Mốc cũ theo ngày không quy đổi được — chỉ để cảnh báo, KHÔNG tính giá',
  })
  legacyDiscountTiers!: LegacyDiscountTierDto[];
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

/**
 * Query của GET/PUT /shop/rental-policies (17/08): chính sách mặc định tách theo LOẠI XE.
 * Bỏ trống = hàng legacy toàn gian hàng (giai đoạn tương thích — UI mới luôn gửi).
 */
export class ShopPolicyQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_TYPE_VALUES })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;
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
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá tháng tham chiếu thuê dài hạn (17/08)',
  })
  monthlyPrice!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày đã gồm tài xế — lộ trình nội thành/cơ bản (17/08)',
  })
  withDriverDailyPrice!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế — liên tỉnh khứ hồi; null = rơi về giá cơ bản',
  })
  withDriverInterCityPrice!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế — liên tỉnh 1 chiều; null = rơi về liên tỉnh → cơ bản',
  })
  withDriverOneWayPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá thuê theo giờ' })
  hourlyPrice!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description: '% khuyến mãi trực tiếp cho dịch vụ tự lái; null/0 = không khuyến mãi',
  })
  discountPercent!: number | null;

  /** Năng lực dịch vụ của xe — tab Giá chỉ hiện nhóm giá thuộc dịch vụ xe đăng. */
  @ApiProperty({ enum: SERVICE_TYPE_VALUES, isArray: true })
  serviceTypes!: string[];

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
  @ApiProperty({
    enum: POLICY_SOURCE_VALUES,
    description:
      'NGUỒN CHÍNH SÁCH của xe — KHÔNG còn khoá phần giá (20/08). shop = xoá bản ghi đè và ' +
      'quay về kế thừa; vehicle = lưu bộ chính sách riêng (phải gửi kèm policy).',
  })
  @IsIn(POLICY_SOURCE_VALUES)
  source!: string;

  @ApiPropertyOptional({
    description: 'Giá thuê ngày thường VND — độc lập với source (giá luôn sửa được)',
  })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'Giá thuê không hợp lệ (số VND không âm)' })
  weekdayPrice?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá cuối tuần VND — độc lập với source (giá luôn sửa được); null = xoá (dùng giá thường)',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.weekendPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá cuối tuần không hợp lệ (số VND không âm)' })
  weekendPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá tháng thuê dài hạn — độc lập với source (giá luôn sửa được); null = xoá giá tháng',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.monthlyPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá tháng không hợp lệ (số VND không âm)' })
  monthlyPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày đã gồm tài xế (nội thành/cơ bản) — độc lập với source (giá luôn sửa được)',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.withDriverDailyPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá/ngày có tài xế không hợp lệ (số VND không âm)' })
  withDriverDailyPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế liên tỉnh — null = xoá (rơi về giá cơ bản)',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.withDriverInterCityPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá liên tỉnh không hợp lệ (số VND không âm)' })
  withDriverInterCityPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá/ngày có tài xế liên tỉnh 1 chiều — null = xoá',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.withDriverOneWayPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá 1 chiều không hợp lệ (số VND không âm)' })
  withDriverOneWayPrice?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá thuê theo giờ — null = xe không cho thuê giờ',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.hourlyPrice !== null)
  @Matches(MONEY_PATTERN, { message: 'Giá theo giờ không hợp lệ (số VND không âm)' })
  hourlyPrice?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description: '% khuyến mãi trực tiếp cho dịch vụ tự lái; null = ngừng khuyến mãi',
  })
  @IsOptional()
  @ValidateIf((o: SaveVehiclePricingDto) => o.discountPercent !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

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

/** Con số của MỘT gói thuê dài hạn — server tính, client không bao giờ tự nhân. */
export class LongTermPackageOptionDto {
  @ApiProperty({ enum: LONG_TERM_PACKAGE_MONTHS_VALUES }) packageMonths!: number;
  @ApiProperty({ description: 'Giá dài hạn cơ sở cho MỘT tháng (VND string)' })
  baseMonthlyPrice!: string;
  @ApiProperty({ description: 'baseMonthlyPrice × packageMonths' }) basePackageAmount!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% mốc cam kết đang áp — null = không mốc nào áp cho gói này',
  })
  durationDiscountPercent!: number | null;
  @ApiProperty() durationDiscountAmount!: string;
  @ApiProperty({ description: 'Giá gói sau ưu đãi — số khách thực trả (trước cọc)' })
  finalPackageAmount!: string;
  @ApiProperty({ description: 'finalPackageAmount ÷ packageMonths' })
  effectiveMonthlyAmount!: string;
}

export class QuoteBreakdownDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Số ngày tính tiền — null với báo giá theo GÓI dài hạn (không tính theo ngày)',
  })
  days!: number | null;
  @ApiPropertyOptional({
    type: LongTermPackageOptionDto,
    nullable: true,
    description: 'Cấu tạo giá gói — khác null ⇒ đây là báo giá THUÊ DÀI HẠN theo gói tháng lịch',
  })
  longTerm!: LongTermPackageOptionDto | null;
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
  /**
   * Khác null = tổng chỉ là TẠM TÍNH: giá chuyên biệt của dịch vụ / giá lộ trình chưa niêm
   * yết, quote đang rơi về bậc gần nhất. FE đổi nhãn tổng ("Tạm tính") và hiện ghi chú này —
   * không trưng như giá chốt (yêu cầu 17/08: không gọi "Tổng dự kiến" khi còn phụ phí).
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  estimateNote!: string | null;
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
  /**
   * Bắt buộc với dịch vụ tính theo NGÀY; bỏ trống với `long_term` (giá gói không phụ thuộc
   * ngày nhận, và ngày nhận chính xác do gian hàng chốt khi duyệt).
   */
  @ApiPropertyOptional({ description: 'ISO datetime nhận xe (không dùng cho long_term)' })
  @ValidateIf((o: PublicQuoteQueryDto) => o.serviceType !== SERVICE_TYPE.LONG_TERM)
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'ISO datetime trả xe (không dùng cho long_term)' })
  @ValidateIf((o: PublicQuoteQueryDto) => o.serviceType !== SERVICE_TYPE.LONG_TERM)
  @IsISO8601()
  returnAt?: string;

  /**
   * Gói thuê dài hạn (tháng lịch) — BẮT BUỘC khi serviceType = long_term; server tính giá từ
   * gói, không từ số ngày. Ngày trả KHÔNG lấy từ client cho dịch vụ này.
   */
  @ApiPropertyOptional({ enum: LONG_TERM_PACKAGE_MONTHS_VALUES })
  @ValidateIf((o: PublicQuoteQueryDto) => o.serviceType === SERVICE_TYPE.LONG_TERM)
  @Type(() => Number)
  @IsInt()
  @IsIn(LONG_TERM_PACKAGE_MONTHS_VALUES)
  packageMonths?: number;

  /**
   * Dịch vụ của chuyến: long_term → báo giá theo GÓI tháng lịch; with_driver → đơn giá đã gồm
   * tài xế theo lộ trình. Bỏ trống = self_drive.
   */
  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  /** Lộ trình chuyến có tài xế — chỉ có nghĩa khi serviceType=with_driver (khác thì bỏ qua). */
  @ApiPropertyOptional({ enum: ROUTE_TYPE_VALUES })
  @IsOptional()
  @IsIn(ROUTE_TYPE_VALUES)
  routeType?: string;
}

// ---------------------------------------------------------------------------
// Báo giá giao nhận trên yêu cầu đặt xe
// ---------------------------------------------------------------------------

/**
 * Báo giá giao nhận đã lưu trên một yêu cầu — **chỉ còn là dữ liệu lịch sử** (Wave 9).
 *
 * Vòng báo giá theo khoảng cách đã bị bỏ: giao nhận miễn phí lúc duyệt, chủ xe và khách thống
 * nhất phí ngoài ứng dụng rồi cập nhật vào ĐƠN (`PATCH /bookings/:id/delivery-fee`). Giữ kiểu
 * này để các yêu cầu cũ vẫn đọc được; không có đường ghi mới nào.
 */
export class BookingRequestDeliveryQuoteDto {
  @ApiProperty() distanceKm!: number;
  @ApiProperty() fee!: string;
  @ApiProperty({ enum: DELIVERY_QUOTE_SOURCE_VALUES }) source!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() quotedAt!: string;
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
