import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BANK_ACCOUNT_CHANGE_REQUEST_STATUS_VALUES,
  WALLET_OWNER_TYPE_VALUES,
} from '@xeprime/types';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Gửi yêu cầu ĐỔI tài khoản nhận tiền (biên bản họp 19/11/2026) — tài khoản MỚI muốn chuyển sang,
 * cùng luật với `SaveBankAccountDto`, kèm lời nhắn. Chưa đổi gì cho tới khi admin xác minh và duyệt.
 */
export class CreateBankAccountChangeRequestDto {
  @ApiProperty({ description: 'Mã ngân hàng theo bảng VietQR', example: 'VCB' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  bankCode!: string;

  @ApiProperty({ description: 'Số tài khoản - chỉ chữ số', example: '0011001234567' })
  @IsString()
  @Matches(/^[0-9\s]{4,40}$/, { message: 'Số tài khoản chỉ gồm chữ số' })
  accountNumber!: string;

  @ApiProperty({ description: 'Tên chủ tài khoản, đúng như đăng ký ở ngân hàng' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  accountName!: string;

  @ApiPropertyOptional({ description: 'Tên gợi nhớ' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ description: 'Vì sao đổi - CSKH đọc khi gọi xác minh' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Yêu cầu đổi nhìn từ phía chủ ví — số tài khoản ĐÃ CHE. */
export class BankAccountChangeRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() bankCode!: string;
  @ApiProperty({ example: '•••• 4567' }) accountNumberMasked!: string;
  @ApiProperty() accountName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) label!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ enum: BANK_ACCOUNT_CHANGE_REQUEST_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

/**
 * Yêu cầu đổi nhìn từ hàng đợi admin — số tài khoản MỚI đầy đủ (đọc cho chủ ví xác nhận qua điện
 * thoại), số điện thoại người yêu cầu để gọi, và tài khoản đang dùng (che) để so.
 */
export class PlatformBankAccountChangeRequestDto extends BankAccountChangeRequestDto {
  @ApiProperty({ description: 'Số tài khoản MỚI đầy đủ' }) accountNumber!: string;
  @ApiProperty({ enum: WALLET_OWNER_TYPE_VALUES }) ownerType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiProperty() requesterName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) requesterPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) requesterEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentBankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentAccountNumberMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentAccountName!: string | null;
}

/** Duyệt — ghi chú tuỳ chọn (đã gọi số nào, xác minh gì). */
export class ApproveBankAccountChangeRequestDto {
  @ApiPropertyOptional({ description: 'Đã gọi số nào, xác minh gì - vào audit' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Từ chối — bắt buộc lý do. */
export class RejectBankAccountChangeRequestDto {
  @ApiProperty({ description: 'Lý do từ chối - vào audit' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}
