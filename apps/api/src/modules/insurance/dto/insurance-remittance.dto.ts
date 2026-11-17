import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  INSURANCE_REMITTANCE_LIMITS,
  INSURANCE_REMITTANCE_STATUS_VALUES,
  type InsuranceRemittanceStatus,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const REMITTANCE_DEFAULT_LIMIT = 20;
export const REMITTANCE_MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class InsuranceRemittanceListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: REMITTANCE_MAX_LIMIT,
    default: REMITTANCE_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REMITTANCE_MAX_LIMIT)
  limit?: number;
}

/** Lập bảng kê NHÁP cho một tháng đã kết thúc. */
export class CreateInsuranceRemittanceDto {
  @ApiProperty({ example: '2026-11', description: 'Tháng kê, YYYY-MM (giờ Việt Nam)' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodMonth phải có dạng YYYY-MM' })
  periodMonth!: string;

  @ApiProperty({
    example: '0',
    description: `Hoa hồng đại lý XePrime được hưởng, % trên tổng phí (0-${INSURANCE_REMITTANCE_LIMITS.commissionPercentMax}, tối đa 2 chữ số lẻ)`,
  })
  @IsString()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: 'commissionPercent không hợp lệ' })
  commissionPercent!: string;

  @ApiPropertyOptional({ maxLength: INSURANCE_REMITTANCE_LIMITS.note.max })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(INSURANCE_REMITTANCE_LIMITS.note.max)
  note?: string;
}

/** Ghi nhận đã chuyển tiền cho hãng. */
export class PayInsuranceRemittanceDto {
  @ApiProperty({ example: '1250000', description: 'Số tiền đã chuyển (VND string)' })
  @IsString()
  @Matches(/^\d{1,12}$/, { message: 'paidAmount phải là số tiền nguyên đồng' })
  paidAmount!: string;

  @ApiProperty({ example: '2026-12-05T09:00:00+07:00' })
  @IsDateString()
  paidAt!: string;

  @ApiProperty({ maxLength: INSURANCE_REMITTANCE_LIMITS.bankReference.max })
  @IsString()
  @Transform(trim)
  @MaxLength(INSURANCE_REMITTANCE_LIMITS.bankReference.max)
  @Matches(/\S/, { message: 'Cần mã giao dịch ngân hàng' })
  bankReference!: string;

  @ApiPropertyOptional({ maxLength: INSURANCE_REMITTANCE_LIMITS.note.max })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(INSURANCE_REMITTANCE_LIMITS.note.max)
  note?: string;
}

export class InsuranceRemittanceDto {
  @ApiProperty() id!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ example: '2026-11' }) periodMonth!: string;
  @ApiProperty({ enum: INSURANCE_REMITTANCE_STATUS_VALUES }) status!: InsuranceRemittanceStatus;
  @ApiProperty() policyCount!: number;
  @ApiProperty({ description: 'Tổng phí các hợp đồng (VND string)' }) grossPremium!: string;
  @ApiProperty() commissionPercent!: string;
  @ApiProperty() commissionAmount!: string;
  @ApiProperty({ description: 'Phải trả hãng = tổng phí - hoa hồng' }) payableAmount!: string;
  @ApiProperty({
    description:
      'Tổng phí hãng tính lúc cấp (đối soát) - lệch với tổng phí là phần XePrime bù/được lợi',
  })
  partnerPremiumTotal!: string;
  @ApiProperty({ description: 'Số hợp đồng GCN thử nghiệm (sandbox) trong bảng kê' })
  testPolicyCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankReference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) finalizedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class InsuranceRemittancePageDto {
  @ApiProperty({ type: [InsuranceRemittanceDto] }) data!: InsuranceRemittanceDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Một dòng hợp đồng trong bảng kê. */
export class InsuranceRemittanceLineDto {
  @ApiProperty() policyId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) contractNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverageTo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) issuedAt!: string | null;
  @ApiProperty({ description: 'Phí khách đã trả' }) premiumAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Phí hãng tính lúc cấp' })
  partnerPremiumAmount!: string | null;
  @ApiProperty() isTest!: boolean;
}

export class InsuranceRemittanceLinePageDto {
  @ApiProperty({ type: [InsuranceRemittanceLineDto] }) data!: InsuranceRemittanceLineDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Tình hình "chưa kê" — để admin biết có nên lập bảng kê cho một tháng không. */
export class InsuranceRemittancePendingDto {
  @ApiProperty({ description: 'Số hợp đồng đã cấp, chưa nằm trong bảng kê nào' })
  policyCount!: number;
  @ApiProperty() grossPremium!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mốc cấp sớm nhất còn chưa kê',
  })
  oldestIssuedAt!: string | null;
}
