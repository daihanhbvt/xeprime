import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  SELLER_ENTITY_TYPE_VALUES,
  TAX_CATEGORY_VALUES,
  TAX_WITHHOLDING_STATUS,
  TAX_WITHHOLDING_STATUS_VALUES,
  type SellerEntityType,
  type TaxCategory,
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

  @ApiProperty({
    enum: [...SELLER_ENTITY_TYPE_VALUES, 'unknown'],
    description:
      'Loại chủ thể người bán KHAI trong hồ sơ lúc ghi sổ. `unknown` = gian hàng chưa khai hồ sơ ' +
      'người bán — tờ khai phải thấy khoảng trống đó, không được gộp vào `individual` (dù tiền đã ' +
      'bị khấu trừ theo mức cá nhân — xem `taxSubjectType`).',
  })
  entityType!: SellerEntityType | 'unknown';
  @ApiPropertyOptional({
    enum: SELLER_ENTITY_TYPE_VALUES,
    nullable: true,
    description:
      'Chủ thể ÁP THUẾ đóng băng lúc nhận chuyến (ADR 0068 điều 2): không hồ sơ / doanh nghiệp ' +
      'chưa xác minh ⇒ `individual`. Khác `entityType` là chuyện bình thường. null ở dòng ' +
      'một-mức trước 22/10/2026',
  })
  taxSubjectType!: SellerEntityType | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'MST — snapshot lúc ghi sổ' })
  taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên pháp lý — snapshot' })
  legalName!: string | null;

  @ApiProperty({ description: 'Giá trị thuê chịu thuế `B` — KHÔNG gồm bảo hiểm' })
  taxableBase!: string;
  @ApiProperty({ description: '% tổng đã áp — SNAPSHOT, không phải tỷ lệ hiện hành' })
  percent!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '% GTGT đã áp (ADR 0068). null ở dòng một-mức trước 22/10/2026',
  })
  vatPercent!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: '% TNCN đã áp' })
  pitPercent!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Thuế GTGT. ÂM ở dòng đảo. null ở dòng một-mức trước 22/10/2026',
  })
  vatAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Thuế TNCN. ÂM ở dòng đảo' })
  pitAmount!: string | null;
  @ApiPropertyOptional({
    enum: TAX_CATEGORY_VALUES,
    nullable: true,
    description: 'Nhóm NĐ 117 — service (5% + 2%) | transport (3% + 1,5%)',
  })
  taxCategory!: TaxCategory | null;
  @ApiProperty({ example: 'GTGT 5% + TNCN 2%' }) label!: string;
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
  @ApiProperty({ description: 'Tổng GTGT (dòng một-mức cũ không tách nên không có ở đây)' })
  vatAmount!: string;
  @ApiProperty({ description: 'Tổng TNCN (dòng một-mức cũ không tách nên không có ở đây)' })
  pitAmount!: string;
  @ApiProperty() rows!: number;
}

export class TaxTenantBreakdownDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({
    enum: [...SELLER_ENTITY_TYPE_VALUES, 'unknown'],
    description: 'Loại chủ thể người bán KHAI. `unknown` = chưa khai hồ sơ người bán',
  })
  entityType!: SellerEntityType | 'unknown';
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) legalName!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() vatAmount!: string;
  @ApiProperty() pitAmount!: string;
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
  @ApiProperty({
    description:
      'Tổng GTGT của kỳ (ADR 0068) — dòng một-mức trước 22/10/2026 không tách nên không có ở đây',
  })
  totalVatAmount!: string;
  @ApiProperty({ description: 'Tổng TNCN của kỳ (ADR 0068)' }) totalPitAmount!: string;
  @ApiProperty({
    description:
      'Tổng của các dòng một-mức CHƯA TÁCH GTGT/TNCN (trước 22/10/2026). Kỳ trộn hai loại dòng thì ' +
      '`totalVatAmount + totalPitAmount + totalUnsplitAmount = totalAmount`',
  })
  totalUnsplitAmount!: string;
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
  @ApiProperty({ description: 'Tổng GTGT đã khấu trừ trong kỳ' }) totalVatAmount!: string;
  @ApiProperty({ description: 'Tổng TNCN đã khấu trừ trong kỳ' }) totalPitAmount!: string;
  @ApiProperty({
    description:
      'Tổng của các dòng một-mức CHƯA TÁCH GTGT/TNCN (trước 22/10/2026). Kỳ trộn hai loại dòng thì ' +
      '`totalVatAmount + totalPitAmount + totalUnsplitAmount = totalAmount`',
  })
  totalUnsplitAmount!: string;
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
