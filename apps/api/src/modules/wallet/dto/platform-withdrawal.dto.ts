import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WALLET_OWNER_TYPE_VALUES,
  WITHDRAWAL_STATUS_VALUES,
  type WalletOwnerType,
  type WithdrawalStatus,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Một lệnh rút nhìn từ phía ADMIN — số tài khoản ĐẦY ĐỦ.
 *
 * Khác bề mặt của chủ ví (số đã che): người ngồi đây phải gõ số đó vào app ngân hàng, nên che nó
 * là biến một việc tay thành một việc tay có thêm bước đoán.
 */
export class PlatformWithdrawalDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã XPW… — ghi vào nội dung chuyển khoản' }) code!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: WITHDRAWAL_STATUS_VALUES }) status!: WithdrawalStatus;

  @ApiProperty({ enum: WALLET_OWNER_TYPE_VALUES }) ownerType!: WalletOwnerType;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tên chủ ví — người hoặc gian hàng' })
  ownerName!: string | null;

  @ApiProperty() bankCode!: string;
  @ApiProperty({ description: 'SỐ ĐẦY ĐỦ — admin phải gõ vào app ngân hàng' })
  bankAccountNumber!: string;
  @ApiProperty() bankAccountName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn cam kết chuyển' })
  dueBy!: string | null;
  @ApiProperty({ description: 'Đã quá hạn cam kết chưa' }) overdue!: boolean;
  @ApiProperty({ description: 'Tuổi của yêu cầu, tính bằng giờ' }) ageHours!: number;

  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankReference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!: string | null;
  @ApiProperty() rowVersion!: number;
  @ApiProperty() createdAt!: string;
}

export class PlatformWithdrawalPageDto {
  @ApiProperty({ type: [PlatformWithdrawalDto] }) items!: PlatformWithdrawalDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasNext!: boolean;
  @ApiProperty({ description: 'Số lệnh đang quá hạn cam kết — chỉ số vận hành, hiện ở đầu màn' })
  overdueCount!: number;
}

export class PlatformWithdrawalQueryDto {
  @ApiPropertyOptional({
    enum: WITHDRAWAL_STATUS_VALUES,
    description: 'Bỏ trống = VIỆC CẦN LÀM (pending + approved)',
  })
  @IsOptional()
  @IsIn(WITHDRAWAL_STATUS_VALUES)
  status?: WithdrawalStatus;

  @ApiPropertyOptional({ description: 'Chỉ lệnh đã quá hạn cam kết' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;

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

export class MarkWithdrawalPaidDto {
  @ApiProperty({ description: 'Mã giao dịch ngân hàng — BẰNG CHỨNG đã chuyển' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  bankReference!: string;

  @ApiProperty({ description: 'Bản ghi đang cầm — chặn hai admin cùng bấm' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rowVersion!: number;
}

export class RejectWithdrawalDto {
  @ApiProperty({ description: 'Lý do — chủ ví đọc được câu này' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReverseWithdrawalDto {
  @ApiProperty({ description: 'Vì sao tiền quay lại (chuyển hụt, sai số tài khoản…)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
