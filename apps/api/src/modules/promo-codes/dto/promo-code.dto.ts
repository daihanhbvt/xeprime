import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROMO_AUDIENCE_VALUES,
  PROMO_CODE_MAX_LENGTH,
  PROMO_CODE_MIN_LENGTH,
  PROMO_CODE_STATE_VALUES,
  PROMO_DISCOUNT_PERCENT_MAX,
  PROMO_DISCOUNT_PERCENT_MIN,
  PROMO_DISCOUNT_TYPE,
  PROMO_DISCOUNT_TYPE_VALUES,
  PROMO_INELIGIBLE_REASON_VALUES,
  PROMO_REDEMPTION_STATUS_VALUES,
  PROMO_RELEASE_REASON_VALUES,
  PROMO_VEHICLE_SCOPE_VALUES,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { CustomerFeeBreakdownDto } from '../../pricing/dto/pricing.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PROMO_CODE_DEFAULT_LIMIT, MAX_LIMIT as PROMO_CODE_MAX_LIMIT };

/**
 * Cấu hình MỘT chiến dịch — dùng cho cả tạo và sửa.
 *
 * DTO chỉ kiểm HÌNH DẠNG. Ba lớp luật nghiệp vụ nằm ở chỗ khác, có chủ đích:
 *   - tương thích giữa `discountType` và bộ số của nó → `promoCodeConfigBlockers` (hàm dùng
 *     chung với form admin, nên hai bên không nói hai câu khác nhau) + CHECK ở DB;
 *   - trường bị KHOÁ sau khi đã phát sinh lượt → `PromoCodesService.update`;
 *   - trùng mã → unique ở DB (`PROMO_CODE_DUPLICATE`).
 */
export class UpsertPromoCodeDto {
  @ApiProperty({
    description: `Mã khách gõ. Server CHUẨN HOÁ (in hoa, bỏ khoảng trắng) trước khi lưu — client gửi chữ thường vẫn đúng.`,
    example: 'BANMOI',
    minLength: PROMO_CODE_MIN_LENGTH,
    maxLength: PROMO_CODE_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Ưu đãi khách hàng mới' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiProperty({ enum: PROMO_DISCOUNT_TYPE_VALUES })
  @IsIn(PROMO_DISCOUNT_TYPE_VALUES)
  discountType!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tiền giảm (VND string) — bắt buộc khi discountType = fixed',
    example: '100000',
  })
  @ValidateIf((o: UpsertPromoCodeDto) => o.discountType === PROMO_DISCOUNT_TYPE.FIXED)
  @IsNumberString()
  discountAmount?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Bắt buộc khi discountType = percent',
    example: 8,
  })
  @ValidateIf((o: UpsertPromoCodeDto) => o.discountType === PROMO_DISCOUNT_TYPE.PERCENT)
  @Type(() => Number)
  @IsInt()
  @Min(PROMO_DISCOUNT_PERCENT_MIN)
  @Max(PROMO_DISCOUNT_PERCENT_MAX)
  discountPercent?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Trần số tiền giảm của mã % (VND string). Bỏ trống = không trần.',
    example: '80000',
  })
  @IsOptional()
  @IsNumberString()
  maxDiscountAmount?: string | null;

  @ApiProperty({
    description:
      'Sàn TIỀN THUÊ đủ điều kiện (VND string) — sau khuyến mãi trực tiếp, chưa gồm phí/bảo hiểm/cọc. "0" = không yêu cầu.',
    example: '800000',
  })
  @IsNumberString()
  minOrderAmount!: string;

  @ApiProperty({ enum: PROMO_AUDIENCE_VALUES })
  @IsIn(PROMO_AUDIENCE_VALUES)
  audience!: string;

  @ApiProperty({ enum: PROMO_VEHICLE_SCOPE_VALUES })
  @IsIn(PROMO_VEHICLE_SCOPE_VALUES)
  vehicleScope!: string;

  @ApiProperty({
    type: [String],
    enum: SERVICE_TYPE_VALUES,
    description: 'Mảng RỖNG = mọi dịch vụ',
  })
  @IsArray()
  @ArrayMaxSize(SERVICE_TYPE_VALUES.length)
  @IsIn(SERVICE_TYPE_VALUES, { each: true })
  serviceScope!: string[];

  @ApiProperty({
    type: [String],
    description: 'Mã tỉnh/thành (2 ký tự). Mảng RỖNG = toàn quốc.',
    example: ['01', '79'],
  })
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(2, { each: true })
  provinceCodes!: string[];

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bỏ trống = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalUsageLimit?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bỏ trống = không giới hạn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perCustomerLimit?: number | null;

  @ApiProperty({ description: 'ISO-8601' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ description: 'ISO-8601' })
  @IsISO8601()
  endsAt!: string;

  @ApiProperty({ description: 'Kích hoạt ngay — mã có hiệu lực trong khoảng thời gian đã chọn' })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ description: 'Hiện trong danh sách mã khả dụng của khách (false = chỉ gõ tay)' })
  @IsBoolean()
  listed!: boolean;
}

/** Bật/tắt một chiến dịch — thao tác riêng vì nó là thứ DUY NHẤT sửa được khi đã có lượt dùng. */
export class TogglePromoCodeDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class PromoCodeListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã / tên chương trình' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: PROMO_DISCOUNT_TYPE_VALUES })
  @IsOptional()
  @IsIn(PROMO_DISCOUNT_TYPE_VALUES)
  discountType?: string;

  @ApiPropertyOptional({
    enum: PROMO_CODE_STATE_VALUES,
    description:
      'Lọc theo trạng thái SUY RA (không phải cột) — server dịch thành điều kiện ngày/bộ đếm tương ứng.',
  })
  @IsOptional()
  @IsIn(PROMO_CODE_STATE_VALUES)
  state?: string;

  @ApiPropertyOptional({ description: 'Chiến dịch còn hiệu lực TỪ (ISO-8601)' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Chiến dịch còn hiệu lực ĐẾN (ISO-8601)' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Sắp theo: createdAt | endsAt | reservedCount. Mặc định createdAt.',
    enum: ['createdAt', 'endsAt', 'reservedCount'],
  })
  @IsOptional()
  @IsIn(['createdAt', 'endsAt', 'reservedCount'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: string;

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

/** Một chiến dịch trong màn admin. */
export class PromoCodeDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: PROMO_DISCOUNT_TYPE_VALUES }) discountType!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND string (ADR 0007)' })
  discountAmount!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) discountPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxDiscountAmount!: string | null;
  @ApiProperty({ description: 'VND string (ADR 0007)' }) minOrderAmount!: string;
  @ApiProperty({ enum: PROMO_AUDIENCE_VALUES }) audience!: string;
  @ApiProperty({ enum: PROMO_VEHICLE_SCOPE_VALUES }) vehicleScope!: string;
  @ApiProperty({ type: [String], enum: SERVICE_TYPE_VALUES }) serviceScope!: string[];
  @ApiProperty({ type: [String] }) provinceCodes!: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) totalUsageLimit!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) perCustomerLimit!: number | null;
  @ApiProperty({ description: 'Lượt đang giữ + đã chốt — con số mà trần tổng so sánh' })
  reservedCount!: number;
  @ApiProperty({ description: 'Lượt đã thành đơn' }) redeemedCount!: number;
  @ApiProperty({ description: 'ISO-8601' }) startsAt!: string;
  @ApiProperty({ description: 'ISO-8601' }) endsAt!: string;
  @ApiProperty({ description: 'Công tắc admin — trạng thái duy nhất được LƯU' }) isActive!: boolean;
  @ApiProperty() listed!: boolean;
  @ApiProperty({
    enum: PROMO_CODE_STATE_VALUES,
    description: 'Trạng thái SUY RA từ công tắc + mốc thời gian + bộ đếm (promoCodeState)',
  })
  state!: string;
  @ApiProperty({
    description:
      'Chiến dịch đã phát sinh lượt ⇒ các trường trong `lockedFields` không sửa được nữa (ADR 0046 điều 8)',
  })
  hasUsage!: boolean;
  @ApiProperty({ type: [String] }) lockedFields!: string[];
  @ApiProperty({ description: 'Tổng tiền XePrime đã tài trợ qua mã này (VND string)' })
  sponsoredAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ description: 'ISO-8601' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601' }) updatedAt!: string;
}

/** Thẻ thống kê đầu trang admin — đếm trên TOÀN BỘ chiến dịch, không theo trang đang xem. */
export class PromoCodeStatsDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Thêm mới trong 30 ngày qua — cho chỉ số "so với tháng trước"' })
  createdLast30Days!: number;
  @ApiProperty() active!: number;
  @ApiProperty({ description: 'Hết hạn trong PROMO_ENDING_SOON_DAYS ngày tới' })
  endingSoon!: number;
  @ApiProperty() expired!: number;
}

export class PromoCodePageDto {
  @ApiProperty({ type: [PromoCodeDto] }) data!: PromoCodeDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ type: PromoCodeStatsDto }) stats!: PromoCodeStatsDto;
}

/** Một lượt dùng trong drawer "Lượt sử dụng" của admin. */
export class PromoRedemptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PROMO_REDEMPTION_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true, enum: PROMO_RELEASE_REASON_VALUES })
  releaseReason!: string | null;
  @ApiProperty({ description: 'VND string (ADR 0007)' }) discountAmount!: string;
  @ApiProperty() bookingRequestId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiProperty({ description: 'ĐÃ CHE — admin xem danh sách không cần PII' })
  customerNameMasked!: string;
  @ApiProperty({ description: 'ISO-8601' }) reservedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) redeemedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) releasedAt!: string | null;
}

export class PromoRedemptionPageDto {
  @ApiProperty({ type: [PromoRedemptionDto] }) data!: PromoRedemptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PromoRedemptionListQueryDto {
  @ApiPropertyOptional({ enum: PROMO_REDEMPTION_STATUS_VALUES })
  @IsOptional()
  @IsIn(PROMO_REDEMPTION_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

// ── Đường công khai (khách thuê) ────────────────────────────────────────────

/**
 * Tham số một lượt xem trước — CHÍNH XÁC những gì cần để dựng lại báo giá trên server.
 *
 * Cố ý KHÔNG có SĐT hay tên khách: danh tính đến từ cookie phiên, không từ payload
 * (ADR 0046 điều 5). Nếu nhận SĐT ở đây thì endpoint công khai này thành một cách tra "số nào
 * đã từng thuê xe" — đúng thứ ADR 0046 điều 9 cấm.
 */
export class PreviewPromoCodeDto {
  @ApiProperty({ description: 'Mã khách gõ — server tự chuẩn hoá' })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ description: 'Xe đang xem (ULID)' })
  @IsString()
  @MaxLength(26)
  vehicleId!: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 — bắt buộc với dịch vụ theo ngày' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 — bắt buộc với dịch vụ theo ngày' })
  @IsOptional()
  @IsISO8601()
  returnAt?: string;

  @ApiPropertyOptional({ description: 'Gói thuê dài hạn (tháng lịch)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageMonths?: number;

  @ApiPropertyOptional({ enum: ['inner_city', 'inter_city', 'inter_city_one_way'] })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  routeType?: string;

  @ApiPropertyOptional({ description: 'Khách có giữ lựa chọn bảo hiểm tai nạn người không' })
  @IsOptional()
  @IsBoolean()
  personalAccidentSelected?: boolean;
}

/**
 * Kết quả xem trước MỘT mã.
 *
 * `applicable = false` LUÔN kèm `reason` — giao diện phải nói được vì sao, chứ không hiện một
 * nút bấm được mà không có tác dụng (yêu cầu sản phẩm). Đây cũng là shape dùng cho từng dòng
 * trong danh sách mã khả dụng, nên hai bề mặt không thể mô tả cùng một mã theo hai kiểu.
 */
export class PromoPreviewDto {
  @ApiProperty({ description: 'Mã đã CHUẨN HOÁ' }) code!: string;
  @ApiProperty() applicable!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: PROMO_INELIGIBLE_REASON_VALUES,
    description: 'Mã lý do ổn định — giao diện dịch từ MÃ, không hiện message của server',
  })
  reason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'VND string (ADR 0007)' })
  discountAmount!: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Số giảm đã bị một trần nào đó kẹp xuống — giao diện nói rõ để khách không tự trừ',
  })
  clamped!: boolean | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tổng khách trả SAU khi áp mã (VND string) — số duy nhất giao diện được hiện',
  })
  customerTotalAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền giữ chỗ sau khi áp mã' })
  holdAmount!: string | null;
  /**
   * BẢNG PHÍ đầy đủ đã áp mã — thứ giao diện thay vào chỗ `quote.breakdown.fees`.
   *
   * Hai con số `customerTotalAmount`/`holdAmount` ở trên không đủ: bảng giá còn phải vẽ dòng
   * giảm, tiền trả chủ xe khi nhận, và nhãn thu gọn đổi theo `promoDiscountAmount`. Trả về hai
   * con số rồi để client tự ghép vào bảng cũ chính là lỗi đã thấy 24/09/2026 — dòng mã hiện
   * ra mà tổng vẫn nguyên giá.
   *
   * Báo giá công khai KHÔNG nhận mã (`PricingModule` không biết gì về khuyến mãi, và chiều phụ
   * thuộc đó là cố ý), nên đây là nơi duy nhất sinh ra bảng phí có mã cho một chuyến chưa gửi.
   */
  @ApiPropertyOptional({ type: () => CustomerFeeBreakdownDto, nullable: true })
  fees!: CustomerFeeBreakdownDto | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: PROMO_DISCOUNT_TYPE_VALUES }) discountType!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) discountPercent!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxDiscountAmount!: string | null;
  @ApiProperty({ description: 'VND string (ADR 0007)' }) minOrderAmount!: string;
  @ApiProperty({ description: 'ISO-8601' }) endsAt!: string;
}

export class PromoPreviewListDto {
  @ApiProperty({ type: [PromoPreviewDto] }) data!: PromoPreviewDto[];
}

/** Danh sách mã khả dụng cho một chuyến — cùng tham số xem trước, bỏ `code`. */
export class AvailablePromoQueryDto {
  @ApiProperty({ description: 'Xe đang xem (ULID)' })
  @IsString()
  @MaxLength(26)
  vehicleId!: string;

  @ApiPropertyOptional({ enum: SERVICE_TYPE_VALUES })
  @IsOptional()
  @IsIn(SERVICE_TYPE_VALUES)
  serviceType?: string;

  @ApiPropertyOptional({ description: 'ISO-8601' })
  @IsOptional()
  @IsISO8601()
  pickupAt?: string;

  @ApiPropertyOptional({ description: 'ISO-8601' })
  @IsOptional()
  @IsISO8601()
  returnAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageMonths?: number;

  @ApiPropertyOptional({ enum: ['inner_city', 'inter_city', 'inter_city_one_way'] })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  routeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  personalAccidentSelected?: boolean;
}
