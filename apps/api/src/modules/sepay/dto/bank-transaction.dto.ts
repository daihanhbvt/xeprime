import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BANK_MATCH_STATUS_VALUES, BANK_MATCH_TARGET_TYPE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as BANK_TX_DEFAULT_LIMIT, MAX_LIMIT as BANK_TX_MAX_LIMIT };

export class BankTransactionListQueryDto {
  @ApiPropertyOptional({
    enum: BANK_MATCH_STATUS_VALUES,
    description: 'Bỏ trống = CHƯA KHỚP — hàng đợi việc cần làm, không phải toàn bộ lịch sử',
  })
  @IsOptional()
  @IsIn(BANK_MATCH_STATUS_VALUES)
  matchStatus?: string;

  @ApiPropertyOptional({ description: 'Tìm theo nội dung chuyển khoản hoặc mã đối soát' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Một dòng trong hàng đợi.
 *
 * KHÔNG có `rawJson`: payload nguyên trạng là bằng chứng, chỉ mở ở màn chi tiết. Một danh sách
 * 20 dòng kèm 20 payload là 20 lần lộ dữ liệu thô cho một màn mà người ta chỉ liếc qua.
 */
export class BankTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ description: 'Mã giao dịch phía nhà cung cấp — khoá chống ghi đôi' })
  providerTxId!: string;
  @ApiProperty({ description: 'Tiền vào, string — ADR 0007' }) amountIn!: string;
  @ApiProperty({ description: 'Nội dung chuyển khoản NGUYÊN VĂN' }) content!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) referenceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  bankTime!: string | null;
  @ApiProperty({ enum: BANK_MATCH_STATUS_VALUES }) matchStatus!: string;
  @ApiPropertyOptional({ enum: BANK_MATCH_TARGET_TYPE_VALUES, nullable: true })
  matchedType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) matchedRefId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) matchNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  matchedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên admin đã khớp tay / bỏ qua — `null` khi máy tự khớp',
  })
  matchedByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã hoá đơn đã khớp (khi `matchedType = subscription_invoice`)',
  })
  matchedInvoiceCode!: string | null;
}

export class BankTransactionPageDto {
  @ApiProperty({ type: [BankTransactionDto] }) data!: BankTransactionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Một hoá đơn GỢI Ý để admin khớp tay — ADR 0022 điều 4.
 *
 * "Gợi ý" đúng nghĩa đen: hệ thống KHÔNG bao giờ tự chọn. Khớp tự động theo số tiền sẽ gán tiền
 * của người này vào hoá đơn của người khác, và ở tuyến giữ chỗ nhiều khoản có số tiền giống hệt
 * nhau. Danh sách này chỉ sắp xếp để mắt người tìm nhanh hơn.
 */
export class BankTransactionSuggestionDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: ['issued', 'partially_paid'] }) status!: string;
  @ApiProperty({ description: 'Tổng hoá đơn, string' }) totalAmount!: string;
  @ApiProperty({ description: 'Đã nhận, string' }) paidAmount!: string;
  @ApiProperty({ description: 'Còn thiếu = tổng − đã nhận, string' }) remainingAmount!: string;
  @ApiProperty({
    description: 'Số tiền giao dịch KHỚP ĐÚNG phần còn thiếu — chỉ là gợi ý sắp xếp, không tự khớp',
  })
  amountMatches!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class BankTransactionDetailDto extends BankTransactionDto {
  @ApiProperty({
    description:
      'Payload webhook nguyên trạng — BẰNG CHỨNG khi tranh cãi. Chỉ ở màn chi tiết, không ở danh sách.',
    type: Object,
  })
  rawJson!: unknown;
  @ApiProperty({
    type: [BankTransactionSuggestionDto],
    description: 'Hoá đơn đang chờ tiền, sắp theo mức khớp số tiền rồi tới mới nhất',
  })
  suggestions!: BankTransactionSuggestionDto[];
}

export class MatchBankTransactionDto {
  @ApiProperty({ description: 'Id hoá đơn gói được chọn để khớp' })
  @IsString()
  @MaxLength(26)
  invoiceId!: string;

  @ApiProperty({
    description: 'Lý do/ghi chú — BẮT BUỘC: mỗi lần khớp tay là một người chịu trách nhiệm',
  })
  @IsString()
  @MaxLength(500)
  note!: string;
}

export class IgnoreBankTransactionDto {
  @ApiProperty({ description: 'Lý do bỏ qua — bắt buộc, để dòng bị loại vẫn truy được' })
  @IsString()
  @MaxLength(500)
  note!: string;
}
