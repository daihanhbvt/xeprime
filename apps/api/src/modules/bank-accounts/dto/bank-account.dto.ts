import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BANK_ACCOUNT_STATUS_VALUES,
  WALLET_OWNER_TYPE_VALUES,
  type BankAccountStatus,
  type WalletOwnerType,
} from '@xeprime/types';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Tài khoản khai mới hoặc sửa.
 *
 * KHÔNG có `ownerType`/`ownerUserId`/`ownerTenantId`: chủ luôn suy từ session và membership,
 * không bao giờ từ payload (CLAUDE.md mục 6 — ranh giới tenant scope). Một API nhận chủ từ body
 * là một API cho phép người lạ thêm tài khoản nhận tiền vào hồ sơ của gian hàng khác.
 */
export class SaveBankAccountDto {
  @ApiProperty({ description: 'Mã ngân hàng theo bảng VietQR', example: 'VCB' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  bankCode!: string;

  @ApiProperty({ description: 'Số tài khoản — chỉ chữ số', example: '0011001234567' })
  @IsString()
  @Matches(/^[0-9\s]{4,40}$/, { message: 'Số tài khoản chỉ gồm chữ số' })
  accountNumber!: string;

  @ApiProperty({ description: 'Tên chủ tài khoản, đúng như đăng ký ở ngân hàng' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  accountName!: string;

  @ApiPropertyOptional({ description: 'Tên gợi nhớ do người dùng đặt' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ description: 'Đặt làm tài khoản nhận tiền mặc định' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Tài khoản nhìn từ màn hình — số tài khoản ĐÃ CHE, chỉ đủ để người dùng nhận ra của mình. */
export class BankAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WALLET_OWNER_TYPE_VALUES }) ownerType!: WalletOwnerType;
  @ApiProperty() bankCode!: string;
  @ApiProperty({ description: 'Số tài khoản đã che — PII', example: '••••4567' })
  accountNumberMasked!: string;
  @ApiProperty() accountName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) label!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ enum: BANK_ACCOUNT_STATUS_VALUES }) status!: BankAccountStatus;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Đã đối chiếu với một khoản tiền thật chưa — null là người dùng tự khai',
  })
  verifiedAt!: string | null;
  @ApiProperty() createdAt!: string;
}
