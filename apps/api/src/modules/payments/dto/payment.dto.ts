import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_KIND,
  PAYMENT_KIND_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
} from '@xeprime/types';
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

  /**
   * Tiền THUÊ hay tiền CỌC. Mặc định `rental` để mọi client cũ giữ nguyên hành vi.
   *
   * Khác biệt không nằm ở nhãn: cọc là tài sản giữ hộ sẽ trả lại, nên **không** cộng vào
   * `paid_amount` và **không** làm giảm công nợ (xem `PaymentsService`).
   */
  // KHÔNG khai `default:` ở đây: `openapi-typescript` coi mọi trường có `default` là luôn-có-mặt
  // và sinh ra kiểu BẮT BUỘC ở phía web, tức mọi lời gọi cũ vỡ biên dịch. Giá trị mặc định thuộc
  // về service (nơi nó thật sự được áp), mô tả nói rõ điều đó.
  @ApiPropertyOptional({
    enum: PAYMENT_KIND_VALUES,
    description: `Bỏ trống = '${PAYMENT_KIND.RENTAL}' (tiền thuê)`,
  })
  @IsOptional()
  @IsIn(PAYMENT_KIND_VALUES)
  kind?: string;

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
  @ApiProperty({ enum: PAYMENT_KIND_VALUES, description: 'Tiền thuê hay tiền cọc' }) kind!: string;
  @ApiProperty({ enum: PAYMENT_METHOD_VALUES }) method!: string;
  @ApiProperty({ enum: PAYMENT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) receiptId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  paidAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}
