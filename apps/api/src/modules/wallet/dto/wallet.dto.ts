import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WALLET_ENTRY_KIND_VALUES,
  WALLET_STATUS_VALUES,
  WITHDRAWAL_STATUS_VALUES,
  type WalletEntryKind,
  type WalletStatus,
  type WithdrawalStatus,
} from '@xeprime/types';
import { IsInt, IsNumberString, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Số dư nhìn từ màn hình — ba con số, không phải một.
 *
 * `available` là thứ rút được ngay; `pending` đang bị khoá bởi một yêu cầu rút chưa chi xong;
 * `total` là NGHĨA VỤ của XePrime với chủ ví. Hiện một con số duy nhất sẽ làm người dùng hoặc
 * tưởng mình rút được nhiều hơn thực tế, hoặc tưởng tiền đã biến mất.
 */
export class WalletSummaryDto {
  @ApiProperty({ description: 'Rút được ngay (VND string)' }) available!: string;
  @ApiProperty({ description: 'Đang chờ chuyển — đã khoá, chưa rời ngân hàng' }) pending!: string;
  @ApiProperty({ description: 'Tổng XePrime phải trả = available + pending' }) total!: string;
  @ApiProperty({ enum: WALLET_STATUS_VALUES }) status!: WalletStatus;
  @ApiProperty({ description: 'Số tiền rút tối thiểu mỗi lần' }) minWithdrawAmount!: string;
  @ApiProperty({ description: 'Cam kết tối đa (ngày làm việc) kể từ khi duyệt' })
  maxBusinessDays!: number;
}

/** Một dòng sổ cái. `amount` DƯƠNG là vào ví, ÂM là ra. */
export class WalletEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WALLET_ENTRY_KIND_VALUES }) kind!: WalletEntryKind;
  @ApiProperty({ description: 'Dương = vào ví, âm = ra khỏi ví' }) amount!: string;
  @ApiProperty({ description: 'Số dư khả dụng sau bút toán' }) balanceAfter!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class WalletEntryPageDto {
  @ApiProperty({ type: [WalletEntryDto] }) items!: WalletEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasNext!: boolean;
}

export class WalletEntryQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Yêu cầu rút tiền.
 *
 * `bankAccountId` bắt buộc: đích chuyển phải là một tài khoản ĐÃ LƯU của chính chủ ví, không
 * phải ba ô gõ tự do trong lúc rút. Gõ số tài khoản ngay tại bước chi tiền là chỗ dễ sai nhất,
 * và sai thì tiền đi mất chứ không báo lỗi.
 */
export class CreateWithdrawalDto {
  @ApiProperty({ description: 'Số tiền rút (VND string)', example: '200000' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ description: 'Tài khoản nhận — phải thuộc chính chủ ví' })
  @IsString()
  bankAccountId!: string;
}

/** Yêu cầu rút nhìn từ phía chủ ví. Số tài khoản ĐÃ CHE. */
export class WithdrawalRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã XPW… — dùng khi hỏi hỗ trợ' }) code!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: WITHDRAWAL_STATUS_VALUES }) status!: WithdrawalStatus;
  @ApiProperty() bankCode!: string;
  @ApiProperty({ description: 'Số tài khoản đã che — PII' }) accountNumberMasked!: string;
  @ApiProperty() accountName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn cam kết chuyển' })
  dueBy!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!: string | null;
  @ApiProperty() createdAt!: string;
}
