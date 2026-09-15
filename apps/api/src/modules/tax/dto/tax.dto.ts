import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  SELLER_ENTITY_TYPE_VALUES,
  TAX_WITHHOLDING_STATUS,
  TAX_WITHHOLDING_STATUS_VALUES,
  type SellerEntityType,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const TAX_DEFAULT_LIMIT = 20;
export const TAX_MAX_LIMIT = 200;

/** Kỳ `YYYY-MM` — validate bằng regex, không `@IsDateString`: đây là một KỲ, không phải một ngày. */
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class TaxPeriodQueryDto {
  @ApiProperty({ example: '2026-09', description: 'Kỳ YYYY-MM theo giờ Việt Nam' })
  @Matches(PERIOD_PATTERN, { message: 'Kỳ thuế phải có dạng YYYY-MM' })
  period!: string;
}

export class TaxRowsQueryDto {
  @ApiPropertyOptional({ example: '2026-09', description: 'Bỏ trống = mọi kỳ' })
  @IsOptional()
  @Matches(PERIOD_PATTERN, { message: 'Kỳ thuế phải có dạng YYYY-MM' })
  period?: string;

  @ApiPropertyOptional({ enum: TAX_WITHHOLDING_STATUS_VALUES })
  @IsOptional()
  @IsIn(TAX_WITHHOLDING_STATUS_VALUES)
  status?: TaxWithholdingStatus;

  @ApiPropertyOptional({ description: 'Lọc theo một gian hàng' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: TAX_MAX_LIMIT, default: TAX_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TAX_MAX_LIMIT)
  limit?: number;
}

/** Một dòng nghĩa vụ thuế. `amount` ÂM = bút toán đảo. */
export class TaxRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() bookingCode!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;

  @ApiPropertyOptional({
    enum: [...SELLER_ENTITY_TYPE_VALUES, 'unknown'],
    nullable: true,
    description:
      'Loại chủ thể tại thời điểm phát sinh. `null`/`unknown` = gian hàng chưa khai hồ sơ người ' +
      'bán — tờ khai phải thấy khoảng trống đó, không được gộp vào `individual`.',
  })
  entityType!: SellerEntityType | 'unknown' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;

  @ApiProperty({ description: 'Giá trị thuê chịu thuế `B` — KHÔNG gồm bảo hiểm' })
  taxableBase!: string;
  @ApiProperty({ description: '% đã áp — SNAPSHOT, không phải tỷ lệ hiện hành' }) percent!: number;
  @ApiProperty({ example: 'VAT 5% + TNCN 5%' }) label!: string;
  @ApiProperty({ description: 'Số tiền. ÂM = bút toán đảo.' }) amount!: string;

  @ApiProperty({ enum: TAX_WITHHOLDING_STATUS_VALUES }) status!: TaxWithholdingStatus;
  @ApiProperty({ example: '2026-09' }) periodKey!: string;
  @ApiProperty() accruedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) declaredAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) remittedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Dòng gốc mà dòng này đảo. Khác null ⇒ đây là bút toán đảo.',
  })
  reversalOfId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reversalReason!: string | null;
}

export class TaxRowPageDto {
  @ApiProperty({ type: [TaxRowDto] }) data!: TaxRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class TaxEntityBreakdownDto {
  @ApiProperty({ enum: [...SELLER_ENTITY_TYPE_VALUES, 'unknown'] })
  entityType!: SellerEntityType | 'unknown';
  @ApiProperty() amount!: string;
  @ApiProperty() rows!: number;
}

export class TaxTenantBreakdownDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiPropertyOptional({
    enum: [...SELLER_ENTITY_TYPE_VALUES, 'unknown'],
    nullable: true,
  })
  entityType!: SellerEntityType | 'unknown' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() rows!: number;
}

/**
 * Tờ khai một KỲ.
 *
 * Chia theo LOẠI CHỦ THỂ vì cá nhân / hộ kinh doanh / doanh nghiệp có nghĩa vụ khác nhau và đi
 * vào những tờ khai khác nhau — đây là số liệu người làm thuế cần, không phải một chiều lọc
 * thêm cho vui.
 */
export class TaxPeriodSummaryDto {
  @ApiProperty({ example: '2026-09' }) periodKey!: string;
  @ApiProperty({ description: 'Tổng nghĩa vụ của kỳ — đã trừ các bút toán đảo' })
  totalAmount!: string;
  @ApiProperty({ description: 'Tổng giá trị thuê chịu thuế của kỳ' }) totalTaxableBase!: string;
  @ApiProperty({ description: 'Số dòng (gồm cả dòng đảo)' }) rows!: number;

  @ApiProperty({ description: 'Đã khấu trừ, CHƯA kê khai' }) accruedAmount!: string;
  @ApiProperty({ description: 'Đã kê khai, chưa nộp' }) declaredAmount!: string;
  @ApiProperty({ description: 'Đã nộp' }) remittedAmount!: string;

  @ApiProperty({ type: [TaxEntityBreakdownDto] }) byEntityType!: TaxEntityBreakdownDto[];
  @ApiProperty({ type: [TaxTenantBreakdownDto] }) byTenant!: TaxTenantBreakdownDto[];
}

/** "Thuế đã khấu trừ trong kỳ" nhìn từ CHỦ XE. */
export class TenantTaxSummaryDto {
  @ApiProperty({ example: '2026-09' }) periodKey!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() totalTaxableBase!: string;
  @ApiProperty() rows!: number;
  @ApiProperty({ type: [TaxRowDto] }) items!: TaxRowDto[];
}

/** Đảo một dòng — lý do BẮT BUỘC và đi vào audit. */
export class ReverseTaxDto {
  @ApiProperty({ description: 'Vì sao đảo dòng này — bắt buộc, ghi vào audit và vào sổ' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class TaxPeriodAdvancedDto {
  @ApiProperty({ description: 'Số dòng vừa chuyển trạng thái' }) updated!: number;
  @ApiProperty({ enum: [TAX_WITHHOLDING_STATUS.DECLARED, TAX_WITHHOLDING_STATUS.REMITTED] })
  status!: TaxWithholdingStatus;
}
