import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  INSURANCE_COVERAGE_STATUS_VALUES,
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_PROVIDER_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
  VEHICLE_TYPE_VALUES,
  type InsuranceCoverageStatus,
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
      'Tên sản phẩm đã bán (snapshot, tiếng Việt) — `null` với hợp đồng tạo trước danh mục',
  })
  productNameVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) productNameEn!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) certificateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateUrl!: string | null;
  @ApiProperty({ description: 'GCN do adapter GIẢ LẬP cấp — không có hiệu lực bảo hiểm' })
  isTest!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageTo!: string | null;

  @ApiProperty({ description: 'Số lần đã gọi đối tác' }) issueAttempts!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) lastErrorCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastErrorMessage!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '`null` ở trạng thái lỗi nghĩa là KHÔNG tự thử lại — cần người xử lý',
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
export class PlatformInsurancePolicyDetailDto extends PlatformInsurancePolicyDto {
  @ApiPropertyOptional({ type: String, nullable: true }) consentSource!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastAttemptAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) voidedAt!: string | null;
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

/** Thu hồi một hợp đồng — lý do BẮT BUỘC, nó đi vào audit và vào hồ sơ làm việc với đối tác. */
export class VoidInsurancePolicyDto {
  @ApiProperty({ description: 'Vì sao thu hồi — bắt buộc, ghi vào audit' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
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
    description: 'Khấu trừ/vụ — ô tô. `null` = không áp dụng',
  })
  deductibleCar!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Khấu trừ/vụ — xe máy' })
  deductibleMotorbike!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bồi thường tối đa — ô tô. `null` = xem ghi chú',
  })
  maxPayoutCar!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Bồi thường tối đa — xe máy' })
  maxPayoutMotorbike!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteVi!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPayoutNoteEn!: string | null;
  @ApiProperty({ description: 'Mẫu URL tra cứu GCN, `{certCode}` là chỗ thay số chứng nhận' })
  certificateUrlTemplate!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: string;
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
  @ApiProperty({ description: 'GCN THỬ NGHIỆM (adapter giả lập) — không có hiệu lực bảo hiểm' })
  isTest!: boolean;
  @ApiProperty() issuedAt!: string;
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
    description: 'GCN — chỉ có khi `status = issued`',
  })
  certificate!: InsuranceCertificateDto | null;
}
