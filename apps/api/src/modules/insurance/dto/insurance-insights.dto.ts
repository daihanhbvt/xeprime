import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  INSURANCE_ELIGIBILITY_GAP_VALUES,
  INSURANCE_MODE_VALUES,
  INSURANCE_PREMIUM_FALLBACK_REASON_VALUES,
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES,
  type InsuranceEligibilityGap,
  type InsuranceMode,
  type InsurancePremiumFallbackReason,
  type InsuranceVehicleEligibilityFilter,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { InsuranceProductDto } from './insurance.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Giới hạn trang danh sách xe của màn Bảo hiểm. */
export const INSURANCE_VEHICLE_DEFAULT_LIMIT = 20;
export const INSURANCE_VEHICLE_MAX_LIMIT = 100;

// ── Tổng quan theo tháng ──────────────────────────────────────────────────────────────────────

export class InsuranceOverviewQueryDto {
  @ApiProperty({ example: '2026-11', description: 'Tháng (giờ Việt Nam)' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

/** Hợp đồng ĐÃ CẤP trong tháng và tiền của chúng. */
export class InsuranceOverviewIssuedDto {
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Số hợp đồng GCN thử nghiệm (sandbox) trong số trên' })
  testCount!: number;
  @ApiProperty({ description: 'Phí bảo hiểm đã thu của khách (VND string)' })
  collectedPremium!: string;
  @ApiProperty({
    description: 'Phí phải trả hãng - phí hãng tính lúc cấp, thiếu thì phí khách trả',
  })
  payablePremium!: string;
  @ApiProperty({ description: 'Số hợp đồng hãng không trả phí lúc cấp' })
  partnerPremiumMissingCount!: number;
  @ApiProperty({ description: 'Đã thu - phải trả: dương = XePrime được lợi, âm = XePrime bù' })
  premiumDifference!: string;
  @ApiProperty({ description: 'Phí thu hộ bảo hiểm của nền tảng trên các hợp đồng này' })
  serviceFee!: string;
  @ApiProperty({ description: '% hoa hồng đại lý đang cấu hình trên sản phẩm' })
  agencyCommissionPercent!: string;
  @ApiProperty({ description: 'Hoa hồng đại lý dự kiến = phải trả × %' })
  agencyCommission!: string;
  @ApiProperty({ description: 'Phải trả hãng sau hoa hồng' })
  netPayable!: string;
  @ApiProperty({ description: 'XePrime thu từ bảo hiểm = phí thu hộ + hoa hồng + chênh lệch' })
  platformEarnings!: string;
}

export class InsuranceOverviewFallbackDto {
  @ApiProperty({ enum: INSURANCE_PREMIUM_FALLBACK_REASON_VALUES })
  reason!: InsurancePremiumFallbackReason;
  @ApiProperty() count!: number;
}

/** Nguồn phí của các hợp đồng vật chất xe TẠO trong tháng (ADR 0097). */
export class InsuranceOverviewSourcesDto {
  @ApiProperty({ description: 'Phí lấy từ hãng lúc duyệt' }) partner!: number;
  @ApiProperty({ description: 'Phí theo công thức dự phòng' }) formula!: number;
  @ApiProperty({ description: 'Hợp đồng không ghi nguồn (trước ADR 0097)' }) unrecorded!: number;
  @ApiProperty({ type: () => [InsuranceOverviewFallbackDto] })
  fallbacks!: InsuranceOverviewFallbackDto[];
}

export class InsuranceOverviewRefundsDto {
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Phí + phí thu hộ đã hoàn vào Ví điểm khách trong tháng' })
  amount!: string;
}

/** Việc đang tồn — tính tại thời điểm xem, không theo tháng. */
export class InsuranceOverviewBacklogDto {
  @ApiProperty({ description: 'Hợp đồng đang lỗi cấp' }) failed!: number;
  @ApiProperty({ description: 'Hợp đồng cần xử lý gấp' }) attention!: number;
  @ApiProperty({ description: 'Hợp đồng đã cấp chưa nằm trong bảng kê' }) unremittedCount!: number;
  @ApiProperty({ description: 'Phí phải kê của các hợp đồng trên' }) unremittedPremium!: string;
}

export class InsuranceOverviewDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty({ type: () => InsuranceOverviewIssuedDto }) issued!: InsuranceOverviewIssuedDto;
  @ApiProperty({ type: () => InsuranceOverviewSourcesDto }) sources!: InsuranceOverviewSourcesDto;
  @ApiProperty({ type: () => InsuranceOverviewRefundsDto }) refunds!: InsuranceOverviewRefundsDto;
  @ApiProperty({ type: () => InsuranceOverviewBacklogDto }) backlog!: InsuranceOverviewBacklogDto;
}

// ── Danh sách ô tô và phí theo bậc ────────────────────────────────────────────────────────────

export class InsuranceVehicleListQueryDto {
  @ApiPropertyOptional({ description: 'Biển số, tên xe hoặc tên gian hàng' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES })
  @IsOptional()
  @IsIn(INSURANCE_VEHICLE_ELIGIBILITY_FILTER_VALUES)
  eligibility?: InsuranceVehicleEligibilityFilter;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: INSURANCE_VEHICLE_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INSURANCE_VEHICLE_MAX_LIMIT)
  limit?: number;
}

export class InsuranceTierPremiumDto {
  @ApiProperty() maxDays!: number;
  @ApiProperty({ description: '% giá trị xe (chuỗi thập phân)' }) percent!: string;
  @ApiProperty({ description: 'Phí theo công thức bậc (VND string)' }) premium!: string;
  @ApiProperty({ description: 'Phí thu hộ của nền tảng trên phí này (0 khi tắt)' })
  serviceFee!: string;
}

export class InsuranceVehicleRowDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) insuredValue!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) manufactureYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) seatCount!: number | null;
  @ApiProperty({ enum: INSURANCE_MODE_VALUES, description: 'Chế độ chủ xe chọn (ADR 0091)' })
  insuranceMode!: InsuranceMode;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ enum: INSURANCE_ELIGIBILITY_GAP_VALUES, isArray: true })
  gaps!: InsuranceEligibilityGap[];
  @ApiProperty({
    type: () => [InsuranceTierPremiumDto],
    description: 'Phí theo từng bậc - rỗng khi xe chưa có giá trị xe',
  })
  tiers!: InsuranceTierPremiumDto[];
}

export class InsuranceVehiclePageDto {
  @ApiProperty({ type: () => [InsuranceVehicleRowDto] }) data!: InsuranceVehicleRowDto[];
  @ApiProperty({ type: () => PaginationMetaDto }) meta!: PaginationMetaDto;
}

// ── Đối chiếu biểu phí với hãng ───────────────────────────────────────────────────────────────

export class InsurancePremiumCheckDto {
  @ApiPropertyOptional({
    description: 'Đối chiếu theo một xe - đọc giá trị, năm SX, số chỗ của xe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Giá trị xe (đồng) - khi không chọn xe' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  insuredValue?: string;

  @ApiPropertyOptional({ minimum: 1980, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(2100)
  manufactureYear?: number;

  @ApiPropertyOptional({ minimum: 2, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(60)
  seatCount?: number;
}

export class InsurancePremiumCheckRowDto {
  @ApiProperty() maxDays!: number;
  @ApiProperty() percent!: string;
  @ApiProperty({ description: 'Thời lượng chuyến mẫu đã hỏi hãng (giờ)' }) sampleHours!: number;
  @ApiProperty({ description: 'Phí theo công thức bậc' }) formulaPremium!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Phí hãng báo' })
  partnerPremium!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Hãng - công thức: dương = hãng tính cao hơn bảng',
  })
  difference!: string | null;
  @ApiPropertyOptional({
    enum: INSURANCE_PREMIUM_FALLBACK_REASON_VALUES,
    nullable: true,
    description: 'Lý do không có / không nhận số hãng',
  })
  problem!: InsurancePremiumFallbackReason | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã + câu báo của hãng' })
  partnerMessage!: string | null;
  @ApiProperty() elapsedMs!: number;
}

export class InsurancePremiumCheckResultDto {
  @ApiProperty() insuredValue!: string;
  @ApiProperty() manufactureYear!: number;
  @ApiProperty() seatCount!: number;
  @ApiProperty({ description: 'Tên đối tác đang chạy' }) partnerName!: string;
  @ApiProperty({ type: () => [InsurancePremiumCheckRowDto] }) rows!: InsurancePremiumCheckRowDto[];
}

// ── Đồng bộ biểu phí với hãng (ADR 0106) ──────────────────────────────────────────────────────

/** `not_supported` = môi trường này không đồng bộ được (chưa cắm adapter thật, hoặc chưa có sản phẩm). */
export const INSURANCE_PREMIUM_SYNC_OUTCOME_VALUES = ['synced', 'failed', 'not_supported'] as const;
export type InsurancePremiumSyncOutcome = (typeof INSURANCE_PREMIUM_SYNC_OUTCOME_VALUES)[number];

export class InsurancePremiumSyncResultDto {
  @ApiProperty({ enum: INSURANCE_PREMIUM_SYNC_OUTCOME_VALUES })
  status!: InsurancePremiumSyncOutcome;
  @ApiProperty({ description: 'Số lượt đã hỏi hãng' }) askedCount!: number;
  /**
   * Vì sao lượt này hỏng. KHÔNG đặt tên `error`: `ResponseInterceptor` (và bộ dựng OpenAPI) coi object
   * có `error` là đã bọc sẵn, response sẽ mất lớp `{ data }`.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Vì sao lượt này hỏng' })
  failureReason!: string | null;
  @ApiPropertyOptional({
    type: () => InsuranceProductDto,
    nullable: true,
    description: 'Sản phẩm sau lượt đồng bộ (null khi không đồng bộ được)',
  })
  product!: InsuranceProductDto | null;
}
