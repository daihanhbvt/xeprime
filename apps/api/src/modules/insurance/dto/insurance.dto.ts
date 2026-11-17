import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  INSURANCE_COVERAGE_STATUS_VALUES,
  INSURANCE_ELIGIBILITY_GAP_VALUES,
  INSURANCE_PREMIUM_BASIS_VALUES,
  INSURANCE_SERVICE_FEE_PERCENT_MAX,
  INSURANCE_VALUE_TIER_LIMITS,
  type InsurancePremiumBasis,
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_VOID_BRANCH_VALUES,
  INSURANCE_VOID_REFUND_TIMING_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_PROVIDER_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
  VEHICLE_TYPE_VALUES,
  type InsuranceCoverageStatus,
  type InsuranceEligibilityGap,
  type InsurancePolicyStatus,
  type InsuranceProductKind,
  type InsuranceProvider,
  type InsuranceQueueStatusFilter,
  type VehicleType,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const INSURANCE_DEFAULT_LIMIT = 20;
export const INSURANCE_MAX_LIMIT = 100;

/**
 * Bộ lọc trạng thái: mọi trạng thái + `INSURANCE_QUEUE_STATUS_ANY` (`@xeprime/types`, web dùng
 * chung). Bỏ trống `status` vẫn là hàng đợi VIỆC CẦN LÀM (`failed`).
 */
const QUEUE_STATUS_VALUES = [
  ...INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
] as const;

export class PlatformInsuranceListQueryDto {
  @ApiPropertyOptional({
    enum: QUEUE_STATUS_VALUES,
    description: 'Bỏ trống = hàng đợi VIỆC CẦN LÀM (đang lỗi). `any` = mọi trạng thái.',
  })
  @IsOptional()
  @IsIn(QUEUE_STATUS_VALUES)
  status?: InsuranceQueueStatusFilter;

  @ApiPropertyOptional({ enum: INSURANCE_PRODUCT_KIND_VALUES })
  @IsOptional()
  @IsIn(INSURANCE_PRODUCT_KIND_VALUES)
  productKind?: InsuranceProductKind;

  @ApiPropertyOptional({ description: 'Chỉ hợp đồng của một đơn (id đơn).' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã đơn hoặc số giấy chứng nhận (chứa chuỗi).' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: INSURANCE_MAX_LIMIT,
    default: INSURANCE_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSURANCE_MAX_LIMIT)
  limit?: number;
}

/** Một hợp đồng nhìn từ ADMIN — đủ để quyết định thử lại hay thu hồi. */
export class PlatformInsurancePolicyDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() vehicleName!: string;

  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) productKind!: InsuranceProductKind;
  @ApiProperty({ enum: INSURANCE_POLICY_STATUS_VALUES }) status!: InsurancePolicyStatus;
  @ApiProperty({ description: 'Phí đã thu của khách cho sản phẩm này' }) premiumAmount!: string;
  @ApiProperty() partnerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) partnerProductCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Tên sản phẩm đã bán (snapshot, tiếng Việt) - `null` với hợp đồng tạo trước danh mục',
  })
  productNameVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameEn!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) certificateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateUrl!: string | null;
  @ApiProperty({ description: 'GCN do adapter GIẢ LẬP cấp - không có hiệu lực bảo hiểm' })
  isTest!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageTo!: string | null;

  @ApiProperty({ description: 'Số lần đã gọi đối tác' }) issueAttempts!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) lastErrorCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastErrorMessage!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '`null` ở trạng thái lỗi nghĩa là KHÔNG tự thử lại - cần người xử lý',
  })
  nextAttemptAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) issuedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bằng chứng khách CHỌN sản phẩm này (ADR 0028 điều 5)',
  })
  consentAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PlatformInsurancePageDto {
  @ApiProperty({ type: [PlatformInsurancePolicyDto] }) data!: PlatformInsurancePolicyDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Chi tiết một hợp đồng — thêm bằng chứng hai chiều với đối tác. Payload là JSON nguyên trạng:
 * đây là thứ người trực đưa cho đối tác khi đối chiếu, nên không được "làm đẹp".
 */
/**
 * Lượt thu hồi SẼ làm gì với hợp đồng này (ADR 0093) — server tính bằng `insuranceVoidPlan`, hộp thu hồi
 * hiện đúng nhánh và đúng số tiền. `null` ở hợp đồng không thu hồi được.
 */
export class InsuranceVoidPlanDto {
  @ApiProperty({ enum: INSURANCE_VOID_BRANCH_VALUES }) branch!: string;
  @ApiProperty({ description: 'Hợp đồng đã có bên đối tác ⇒ bắt buộc mã huỷ / biên bản đối chiếu' })
  partnerReferenceRequired!: boolean;
  @ApiProperty({ enum: INSURANCE_VOID_REFUND_TIMING_VALUES }) refundTiming!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Số sẽ hoàn vào Ví điểm khách (phí + phí thu hộ, VND string) - `null` khi không hoàn qua ví',
  })
  refundAmount!: string | null;
  @ApiProperty({ description: 'Đã nằm trong bảng kê trả hãng ⇒ không huỷ-hoàn được' })
  blockedByRemittance!: boolean;
}

export class PlatformInsurancePolicyDetailDto extends PlatformInsurancePolicyDto {
  @ApiPropertyOptional({ type: String, nullable: true }) consentSource!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastAttemptAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) voidedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lý do thu hồi / huỷ (ADR 0093)',
  })
  voidReason!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã huỷ / biên bản đối chiếu bên đối tác (ADR 0093)',
  })
  voidPartnerReference!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lúc phí + phí thu hộ đã hoàn vào Ví điểm khách',
  })
  refundedAt!: string | null;
  @ApiPropertyOptional({ type: InsuranceVoidPlanDto, nullable: true })
  voidPlan!: InsuranceVoidPlanDto | null;
  @ApiProperty() idempotencyKey!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Yêu cầu đã gửi đối tác ở lần thử gần nhất',
  })
  requestPayload!: Record<string, unknown> | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Phản hồi nguyên trạng của đối tác ở lần thử gần nhất',
  })
  responsePayload!: Record<string, unknown> | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Snapshot sản phẩm đóng băng lúc đơn ra đời',
  })
  productSnapshot!: Record<string, unknown> | null;
}

/**
 * Thu hồi một hợp đồng — lý do BẮT BUỘC, nó đi vào audit và vào hồ sơ làm việc với đối tác. Hợp đồng đã
 * có bên đối tác thì bắt buộc thêm mã huỷ / biên bản đối chiếu (ADR 0093).
 */
export class VoidInsurancePolicyDto {
  @ApiProperty({ description: 'Vì sao thu hồi - bắt buộc, ghi vào audit' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Mã huỷ / số biên bản đối chiếu bên đối tác - bắt buộc khi hợp đồng đã cấp ' +
      '(`INSURANCE_VOID_REFERENCE_REQUIRED`)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerReference?: string;
}

/** Kết quả lượt thu hồi — nhánh đã đi và khoản đã hoàn (nếu hoàn ngay). */
export class VoidInsurancePolicyResultDto {
  @ApiProperty({ enum: INSURANCE_VOID_BRANCH_VALUES }) branch!: string;
  @ApiProperty({ enum: INSURANCE_POLICY_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: INSURANCE_VOID_REFUND_TIMING_VALUES }) refundTiming!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số đã hoàn vào Ví điểm khách ngay trong lượt này (VND string)',
  })
  refundedAmount!: string | null;
}

// ── Danh mục sản phẩm ────────────────────────────────────────────────────────

/** Một sản phẩm nhìn từ ADMIN — đủ trường để sửa. */
export class InsuranceProductDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) kind!: InsuranceProductKind;
  @ApiProperty({ enum: INSURANCE_PROVIDER_VALUES }) provider!: InsuranceProvider;
  @ApiProperty() partnerProductCode!: string;
  @ApiProperty() nameVi!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() coverageVi!: string;
  @ApiProperty() coverageEn!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khấu trừ/vụ - ô tô. `null` = không áp dụng',
  })
  deductibleCar!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Khấu trừ/vụ - xe máy' })
  deductibleMotorbike!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bồi thường tối đa - ô tô. `null` = xem ghi chú',
  })
  maxPayoutCar!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Bồi thường tối đa - xe máy' })
  maxPayoutMotorbike!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteEn!: string | null;
  @ApiProperty({ description: 'Mẫu URL tra cứu GCN, `{certCode}` là chỗ thay số chứng nhận' })
  certificateUrlTemplate!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({
    enum: INSURANCE_PREMIUM_BASIS_VALUES,
    description:
      'daily = biểu phí ngày ở chính sách phí; value_tier = % giá trị xe theo bậc (ADR 0088) - Bắt buộc/Tuỳ chọn do chủ xe chọn (ADR 0091)',
  })
  premiumBasis!: InsurancePremiumBasis;
  @ApiPropertyOptional({ type: () => [InsurancePremiumTierDto], nullable: true })
  premiumTiers!: InsurancePremiumTierDto[] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) claimHotline!: string | null;
  @ApiProperty({
    description:
      'Thu phí thu hộ bảo hiểm của nền tảng trên IV (ADR 0091 điều 3 - Proposed, chờ luật sư)',
  })
  serviceFeeEnabled!: boolean;
  @ApiProperty({ description: '% phí thu hộ trên IV, 0..50, hai chữ số lẻ' })
  serviceFeePercent!: number;
}

/** Một bậc phí: chuyến tối đa `maxDays` ngày ⇒ phí = `percent`% giá trị xe (đã gồm VAT). */
export class InsurancePremiumTierDto {
  @ApiProperty({ minimum: 1, maximum: INSURANCE_VALUE_TIER_LIMITS.maxDays })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSURANCE_VALUE_TIER_LIMITS.maxDays)
  maxDays!: number;

  @ApiProperty({ example: '0.033', description: '% giá trị xe, tối đa 4 chữ số lẻ' })
  @IsString()
  @Matches(/^\d{1,2}(\.\d{1,4})?$/)
  percent!: string;
}

const MONEY_PATTERN = new RegExp(`^\\d{1,${INSURANCE_PRODUCT_LIMITS.amountMaxDigits}}$`);

/**
 * Sửa một sản phẩm. Mọi trường TUỲ CHỌN (PATCH); với các ô tiền, `null` nghĩa là XOÁ (không áp
 * dụng khấu trừ / bồi thường theo ghi chú), bỏ trường nghĩa là giữ nguyên. Tiền là chuỗi số
 * nguyên đồng (ADR 0007) — bội số 1.000 kiểm ở service (CHECK ở DB là chốt chặn thứ hai).
 *
 * Không có `kind`/`provider`: đổi loại hay hãng của một sản phẩm là một sản phẩm KHÁC.
 */
export class UpdateInsuranceProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(INSURANCE_PRODUCT_LIMITS.partnerProductCode.min)
  @MaxLength(INSURANCE_PRODUCT_LIMITS.partnerProductCode.max)
  partnerProductCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(INSURANCE_PRODUCT_LIMITS.name.min)
  @MaxLength(INSURANCE_PRODUCT_LIMITS.name.max)
  nameVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(INSURANCE_PRODUCT_LIMITS.name.min)
  @MaxLength(INSURANCE_PRODUCT_LIMITS.name.max)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(INSURANCE_PRODUCT_LIMITS.coverage.min)
  @MaxLength(INSURANCE_PRODUCT_LIMITS.coverage.max)
  coverageVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(INSURANCE_PRODUCT_LIMITS.coverage.min)
  @MaxLength(INSURANCE_PRODUCT_LIMITS.coverage.max)
  coverageEn?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  deductibleCar?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  deductibleMotorbike?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  maxPayoutCar?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  maxPayoutMotorbike?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(INSURANCE_PRODUCT_LIMITS.maxPayoutNote.max)
  maxPayoutNoteVi?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(INSURANCE_PRODUCT_LIMITS.maxPayoutNote.max)
  maxPayoutNoteEn?: string | null;

  @ApiPropertyOptional({ description: 'https://…{certCode}…' })
  @IsOptional()
  @IsString()
  @MaxLength(INSURANCE_PRODUCT_LIMITS.certificateUrlTemplate.max)
  @Matches(/^https:\/\/\S*\{certCode\}\S*$/)
  certificateUrlTemplate?: string;

  @ApiPropertyOptional({
    minimum: INSURANCE_PRODUCT_LIMITS.displayOrder.min,
    maximum: INSURANCE_PRODUCT_LIMITS.displayOrder.max,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(INSURANCE_PRODUCT_LIMITS.displayOrder.min)
  @Max(INSURANCE_PRODUCT_LIMITS.displayOrder.max)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: INSURANCE_PREMIUM_BASIS_VALUES })
  @IsOptional()
  @IsIn(INSURANCE_PREMIUM_BASIS_VALUES)
  premiumBasis?: InsurancePremiumBasis;

  @ApiPropertyOptional({ type: () => [InsurancePremiumTierDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(INSURANCE_VALUE_TIER_LIMITS.maxTiers)
  @ValidateNested({ each: true })
  @Type(() => InsurancePremiumTierDto)
  premiumTiers?: InsurancePremiumTierDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(INSURANCE_VALUE_TIER_LIMITS.claimHotline.max)
  claimHotline?: string | null;

  @ApiPropertyOptional({
    description:
      'Bật phí thu hộ bảo hiểm của nền tảng (ADR 0091 điều 3). Chỉ vật chất xe; bật thì % > 0. ' +
      'Chưa có ý kiến luật sư thì KHÔNG bật ở production.',
  })
  @IsOptional()
  @IsBoolean()
  serviceFeeEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: INSURANCE_SERVICE_FEE_PERCENT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(INSURANCE_SERVICE_FEE_PERCENT_MAX)
  serviceFeePercent?: number;
}

/** Danh mục CÔNG KHAI — đúng loại xe khách đang xem, không có trường quản trị. */
export class PublicInsuranceProductsQueryDto {
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: VehicleType;
}

export class PublicInsuranceProductDto {
  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) kind!: InsuranceProductKind;
  @ApiProperty({ enum: INSURANCE_PROVIDER_VALUES }) provider!: InsuranceProvider;
  @ApiProperty() nameVi!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() coverageVi!: string;
  @ApiProperty() coverageEn!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Khấu trừ/vụ cho ĐÚNG loại xe đang xem. `null` = không áp dụng khấu trừ',
  })
  deductibleAmount!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bồi thường tối đa cho loại xe đang xem. `null` = xem `maxPayoutNote*`',
  })
  maxPayoutAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteEn!: string | null;
  @ApiProperty({
    description:
      'Sản phẩm tính theo bậc giá trị xe (ADR 0088) - Bắt buộc hay Tuỳ chọn do chủ xe quyết (ADR 0091), báo giá chào qua vehicleProtectionOffer. Tên giữ cho app cũ',
  })
  mandatory!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) claimHotline!: string | null;
}

// ── Giấy chứng nhận (khách + gian hàng) ──────────────────────────────────────

/**
 * Một GCN đã cấp — CHỈ ĐỌC, cho khách (chi tiết chuyến) và gian hàng (chi tiết đơn). Không có
 * phí, không có lỗi, không có payload: đó là chuyện giữa nền tảng và đối tác.
 */
export class InsuranceCertificateDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) productKind!: InsuranceProductKind;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameEn!: string | null;
  @ApiProperty() partnerName!: string;
  @ApiProperty() certificateNumber!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageTo!: string | null;
  @ApiProperty({ description: 'GCN THỬ NGHIỆM (adapter giả lập) - không có hiệu lực bảo hiểm' })
  isTest!: boolean;
  @ApiProperty() issuedAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số hợp đồng của hãng in trên GCN (MIC so_hd) - ADR 0088',
  })
  contractNumber!: string | null;
  @ApiProperty({
    description:
      'Tải được GCN PDF qua endpoint .../insurance-certificates/:policyId/pdf (hợp đồng hãng thật)',
  })
  pdfAvailable!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hotline báo sự cố / bồi thường của hãng',
  })
  claimHotline!: string | null;
}

/**
 * Tình trạng bảo hiểm của MỘT sản phẩm khách đã trả tiền — chi tiết chuyến (khách) và chi tiết
 * đơn (gian hàng). Khác `InsuranceCertificateDto` ở chỗ nó có mặt cả khi GCN CHƯA có (chờ phát
 * hành, đang phát hành, lỗi) hoặc KHÔNG BAO GIỜ có (đã hoàn, đã thu hồi): khách đã trả `IV`/`IP`
 * phải thấy tiền đó đang ở đâu, không phải một khoảng trống.
 *
 * Không có mã lỗi, số lần thử hay payload đối tác — đó là chuyện giữa nền tảng và đối tác.
 */
export class InsuranceCoverageDto {
  @ApiProperty({ enum: INSURANCE_PRODUCT_KIND_VALUES }) kind!: InsuranceProductKind;
  @ApiProperty({ enum: INSURANCE_COVERAGE_STATUS_VALUES }) status!: InsuranceCoverageStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameEn!: string | null;
  @ApiProperty({ description: 'Phí khách đã trả cho sản phẩm này (VND string)' })
  premiumAmount!: string;
  @ApiPropertyOptional({
    type: InsuranceCertificateDto,
    nullable: true,
    description: 'GCN - chỉ có khi `status = issued`',
  })
  certificate!: InsuranceCertificateDto | null;
}

/** Tình trạng bảo hiểm vật chất xe của một xe — ADR 0088 điều 2. */
export class VehicleInsuranceStatusDto {
  @ApiProperty({ description: 'Nền tảng đang bán bảo hiểm vật chất xe theo bậc giá trị xe' })
  applies!: boolean;
  @ApiProperty({
    description:
      'Xe đủ điều kiện - chuyến tự lái được chào bán kèm (Bắt buộc/Tuỳ chọn theo chủ xe)',
  })
  eligible!: boolean;
  @ApiProperty({ enum: INSURANCE_ELIGIBILITY_GAP_VALUES, isArray: true })
  gaps!: InsuranceEligibilityGap[];
}
