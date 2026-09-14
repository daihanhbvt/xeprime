import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  type InsurancePolicyStatus,
  type InsuranceProductKind,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const INSURANCE_DEFAULT_LIMIT = 20;
export const INSURANCE_MAX_LIMIT = 100;

export class PlatformInsuranceListQueryDto {
  @ApiPropertyOptional({
    enum: INSURANCE_POLICY_STATUS_VALUES,
    description: 'Bỏ trống = hàng đợi VIỆC CẦN LÀM (đang lỗi)',
  })
  @IsOptional()
  @IsIn(INSURANCE_POLICY_STATUS_VALUES)
  status?: InsurancePolicyStatus;

  @ApiPropertyOptional({ enum: INSURANCE_PRODUCT_KIND_VALUES })
  @IsOptional()
  @IsIn(INSURANCE_PRODUCT_KIND_VALUES)
  productKind?: InsuranceProductKind;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: INSURANCE_MAX_LIMIT, default: INSURANCE_DEFAULT_LIMIT })
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

  @ApiPropertyOptional({ type: String, nullable: true }) certificateNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) certificateUrl!: string | null;
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
    description: 'Bằng chứng khách CHỌN bảo hiểm tai nạn người (ADR 0028 điều 5)',
  })
  consentAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PlatformInsurancePageDto {
  @ApiProperty({ type: [PlatformInsurancePolicyDto] }) data!: PlatformInsurancePolicyDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Thu hồi một hợp đồng — lý do BẮT BUỘC, nó đi vào audit và vào hồ sơ làm việc với đối tác. */
export class VoidInsurancePolicyDto {
  @ApiProperty({ description: 'Vì sao thu hồi — bắt buộc, ghi vào audit' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
