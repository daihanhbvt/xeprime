import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHOD_VALUES, PAYMENT_STATUS_VALUES } from '@xeprime/types';
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Tiền nhập string thập phân ≤ 2 số lẻ (ADR 0007). */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Ghi nhận một lần thu tiền cho đơn (bookkeeping thủ công — XePrime không trung gian thu tiền).
 * Không nhận `status`/`bookingId` từ body: đơn lấy từ URL, payment ghi nhận luôn là succeeded.
 */
export class RecordPaymentDto {
  @ApiProperty({ description: 'Số tiền nhận, string thập phân — ADR 0007', example: '500000' })
  @Matches(MONEY_PATTERN, { message: 'amount phải là số tiền hợp lệ' })
  amount!: string;

  @ApiProperty({ enum: PAYMENT_METHOD_VALUES })
  @IsIn(PAYMENT_METHOD_VALUES)
  method!: string;

  @ApiPropertyOptional({ description: 'Mã tra soát/tham chiếu (CK…)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  referenceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Thời điểm nhận tiền (ISO); mặc định = bây giờ' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Tiền dạng string — ADR 0007' }) amount!: string;
  @ApiProperty({ enum: PAYMENT_METHOD_VALUES }) method!: string;
  @ApiProperty({ enum: PAYMENT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) receiptId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  paidAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}
