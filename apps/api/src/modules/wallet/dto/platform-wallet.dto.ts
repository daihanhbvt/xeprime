import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WALLET_ENTRY_KIND_VALUES,
  WALLET_ENTRY_SOURCE_VALUES,
  WALLET_OWNER_TYPE_VALUES,
  WALLET_STATUS_VALUES,
  WITHDRAWAL_STATUS_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PLATFORM_WALLET_ENTRY_DEFAULT_LIMIT = 20;
export const PLATFORM_WALLET_ENTRY_MAX_LIMIT = 100;

/**
 * Ví điểm của một chủ ví nhìn từ ADMIN — CHỈ ĐỌC (đợt rà Admin 16/11/2026). `ledgerTotal` là tổng
 * MỌI bút toán của sổ: sổ khớp khi nó bằng `total` (= khả dụng + đang rút).
 */
export class PlatformWalletSummaryDto {
  @ApiProperty({ enum: WALLET_OWNER_TYPE_VALUES }) ownerType!: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty({ description: 'Đã có ví chưa - chưa từng có khoản nào thì chưa có' })
  exists!: boolean;
  @ApiProperty({ enum: WALLET_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'Khả dụng (`balance`)' }) available!: string;
  @ApiProperty({ description: 'Đang rút (`pending_withdraw_amount`)' }) pending!: string;
  @ApiProperty({ description: 'Tổng nghĩa vụ = khả dụng + đang rút' }) total!: string;
  @ApiProperty({ description: 'Tổng mọi bút toán của sổ' }) ledgerTotal!: string;
  @ApiProperty({ description: '`ledgerTotal` = `total`' }) reconciled!: boolean;
  @ApiProperty() entryCount!: number;
}

/** Lệnh rút gắn với một bút toán rút / đảo rút. Ngân hàng chỉ có khi người xem có quyền tiền. */
export class PlatformWalletEntryWithdrawalDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: WITHDRAWAL_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chỉ khi có `platform.money.manage`',
  })
  bankCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tài khoản ĐÃ CHE - chỉ khi có `platform.money.manage`',
  })
  bankAccountMasked!: string | null;
}

export class PlatformWalletEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WALLET_ENTRY_KIND_VALUES }) kind!: string;
  @ApiProperty({ description: 'Âm = tiền ra' }) amount!: string;
  @ApiProperty() balanceAfter!: string;
  @ApiProperty({ enum: WALLET_ENTRY_SOURCE_VALUES }) sourceType!: string;
  @ApiProperty() sourceRefId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) holdCode!: string | null;
  @ApiPropertyOptional({ type: PlatformWalletEntryWithdrawalDto, nullable: true })
  withdrawal!: PlatformWalletEntryWithdrawalDto | null;
  @ApiProperty({ description: 'Bút toán này là dòng ĐẢO của một dòng khác' }) isReversal!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PlatformWalletEntryPageDto {
  @ApiProperty({ type: [PlatformWalletEntryDto] }) items!: PlatformWalletEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasNext!: boolean;
}

export class PlatformWalletEntryQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PLATFORM_WALLET_ENTRY_MAX_LIMIT,
    default: PLATFORM_WALLET_ENTRY_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PLATFORM_WALLET_ENTRY_MAX_LIMIT)
  limit?: number;
}
