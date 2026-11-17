import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BANK_MATCHED_TYPE_VALUES,
  BANK_MATCH_REASON_VALUES,
  BANK_MATCH_STATUS_VALUES,
  BANK_MATCH_TARGET_TYPE,
  BANK_TX_CODE_FILTER_VALUES,
  type BankMatchReason,
  type BankTxCodeFilter,
} from '@xeprime/types';

/** Hai loại khoản của KHÁCH mà một giao dịch tiền vào có thể thuộc về (ADR 0092). */
export const BANK_TX_RECEIVABLE_TYPES = [
  BANK_MATCH_TARGET_TYPE.BOOKING_HOLD,
  BANK_MATCH_TARGET_TYPE.BOOKING_EXTENSION,
] as const;
export type BankTxReceivableType = (typeof BANK_TX_RECEIVABLE_TYPES)[number];
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as BANK_TX_DEFAULT_LIMIT, MAX_LIMIT as BANK_TX_MAX_LIMIT };

export class BankMatchReasonParamsDto {
  @ApiPropertyOptional({ description: 'Mã đối soát rút được từ nội dung chuyển khoản' })
  code?: string;
  @ApiPropertyOptional({ description: 'Trạng thái của đích lúc tiền về (vd `expired`)' })
  status?: string;
}

export class BankTransactionListQueryDto {
  @ApiPropertyOptional({
    enum: BANK_MATCH_STATUS_VALUES,
    description: 'Bỏ trống = CHƯA KHỚP - hàng đợi việc cần làm, không phải toàn bộ lịch sử',
  })
  @IsOptional()
  @IsIn(BANK_MATCH_STATUS_VALUES)
  matchStatus?: string;

  @ApiPropertyOptional({
    description:
      'Tìm theo nội dung chuyển khoản, mã đối soát XePrime, hoặc mã tham chiếu phía ngân hàng (FT…)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description: 'Số tiền vào CHÍNH XÁC (VND, chuỗi số) - người trực thường tra theo số tiền + giờ',
    example: '420000',
  })
  @IsOptional()
  @Matches(/^[1-9]\d{0,11}$/, { message: 'Số tiền phải là số nguyên dương' })
  amount?: string;

  @ApiPropertyOptional({
    enum: BANK_MATCH_REASON_VALUES,
    description:
      'Lý do hệ thống ghi - ví dụ `hold_closed` (tiền về muộn), `overpaid` (chuyển thừa)',
  })
  @IsOptional()
  @IsIn(BANK_MATCH_REASON_VALUES)
  reason?: BankMatchReason;

  @ApiPropertyOptional({
    enum: BANK_TX_CODE_FILTER_VALUES,
    description:
      'Mã rút được thuộc luồng nào: hoá đơn gói (`XPG`), giữ chỗ (`XPH`), hoặc không rút được mã',
  })
  @IsOptional()
  @IsIn(BANK_TX_CODE_FILTER_VALUES)
  code?: BankTxCodeFilter;

  @ApiPropertyOptional({
    description: 'Từ ngày - `YYYY-MM-DD`, trọn ngày giờ VN. Lọc theo thời điểm ngân hàng',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'from phải theo dạng YYYY-MM-DD' })
  // Đúng dạng chưa đủ: `2026-13-45` khớp mẫu nhưng không là một ngày - để lọt xuống là 500
  // (Invalid Date) thay vì 400.
  @IsISO8601({ strict: true }, { message: 'from không phải một ngày có thật' })
  from?: string;

  @ApiPropertyOptional({ description: 'Đến hết ngày - cùng quy ước với `from`' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'to phải theo dạng YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'to không phải một ngày có thật' })
  to?: string;

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
  @ApiProperty({ description: 'Mã giao dịch phía nhà cung cấp - khoá chống ghi đôi' })
  providerTxId!: string;
  @ApiProperty({ description: 'Tiền vào, string - ADR 0007' }) amountIn!: string;
  @ApiProperty({ description: 'Nội dung chuyển khoản NGUYÊN VĂN' }) content!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) referenceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  bankTime!: string | null;
  @ApiProperty({ enum: BANK_MATCH_STATUS_VALUES }) matchStatus!: string;
  @ApiPropertyOptional({ enum: BANK_MATCHED_TYPE_VALUES, nullable: true })
  matchedType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) matchedRefId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Ghi chú của NGƯỜI (khớp tay / bỏ qua). Dòng cũ có thể còn câu chữ máy ghi trước đây',
  })
  matchNote!: string | null;
  @ApiPropertyOptional({
    enum: BANK_MATCH_REASON_VALUES,
    nullable: true,
    type: String,
    description: 'MÃ lý do hệ thống ghi - giao diện dịch ra nhãn (ADR 0012)',
  })
  matchReasonCode!: string | null;
  @ApiPropertyOptional({
    type: () => BankMatchReasonParamsDto,
    nullable: true,
    description: 'Tham số của lý do: mã đối soát và trạng thái của đích lúc tiền về',
  })
  matchReasonParams!: BankMatchReasonParamsDto | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã khoản giữ chỗ (XPH) / phụ lục (XPE) đã khớp hoặc đã ghi có ví thay',
  })
  matchedTargetCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  matchedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên admin đã khớp tay / bỏ qua - `null` khi máy tự khớp',
  })
  matchedByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Mã hoá đơn / phiếu gộp đã khớp (khi `matchedType` là `subscription_invoice` hoặc `subscription_checkout`)',
  })
  matchedInvoiceCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã giao dịch chuyển TRẢ người gửi - chỉ ở dòng `ignored` đã trả lại tiền',
  })
  refundReference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  refundedAt!: string | null;
}

export class BankTransactionPageDto {
  @ApiProperty({ type: [BankTransactionDto] }) data!: BankTransactionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/**
 * Một hoá đơn GỢI Ý để admin khớp tay - ADR 0022 điều 4.
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
    description: 'Số tiền giao dịch KHỚP ĐÚNG phần còn thiếu - chỉ là gợi ý sắp xếp, không tự khớp',
  })
  amountMatches!: boolean;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class BankTransactionDetailDto extends BankTransactionDto {
  @ApiProperty({
    description:
      'Payload webhook nguyên trạng - BẰNG CHỨNG khi tranh cãi. Chỉ ở màn chi tiết, không ở danh sách.',
    type: Object,
  })
  rawJson!: unknown;
  /*
   * Ba trường bóc sẵn từ payload để người trực khỏi đọc JSON thô. SePay KHÔNG gửi tên hay số
   * tài khoản người chuyển - đây là phía NHẬN, và nó trả lời câu "tiền về tài khoản nào".
   */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ngân hàng nhận theo nhà cung cấp (SePay `gateway`)',
  })
  bankGateway!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Số tài khoản NHẬN của nền tảng (SePay `accountNumber`)',
  })
  bankAccountNumber!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã tham chiếu phía ngân hàng (SePay `referenceCode`) - khác mã đối soát XePrime',
  })
  bankReferenceNumber!: string | null;
  @ApiProperty({
    type: [BankTransactionSuggestionDto],
    description: 'Hoá đơn đang chờ tiền, sắp theo mức khớp số tiền rồi tới mới nhất',
  })
  suggestions!: BankTransactionSuggestionDto[];
  @ApiProperty({
    type: () => [BankTxReceivableSuggestionDto],
    description:
      'Khoản giữ chỗ / phụ lục CÒN NHẬN TIỀN (chưa quá hạn), khoản khớp đúng số tiền lên trước - chỉ gợi ý (ADR 0022 điều 4)',
  })
  receivableSuggestions!: BankTxReceivableSuggestionDto[];
  @ApiPropertyOptional({
    type: () => BankTxLateCreditDto,
    nullable: true,
    description:
      'Mã trong nội dung trỏ tới một khoản giữ chỗ / phụ lục ĐÃ ĐÓNG ⇒ đích của "Ghi có Ví điểm khách" (ADR 0092)',
  })
  lateCredit!: BankTxLateCreditDto | null;
}

/** Một khoản của KHÁCH còn nhận tiền — gợi ý để khớp tay (ADR 0092). */
export class BankTxReceivableSuggestionDto {
  @ApiProperty({ enum: BANK_TX_RECEIVABLE_TYPES }) targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty({ description: 'Mã XPH / XPE' }) code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ description: 'Phải chuyển, string' }) amount!: string;
  @ApiProperty({ description: 'Đã nhận, string' }) paidAmount!: string;
  @ApiProperty({ description: 'Còn thiếu, string' }) remainingAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Hạn chuyển, ISO-8601 UTC' })
  expiresAt!: string | null;
  @ApiProperty({ description: 'Số tiền giao dịch khớp đúng phần còn thiếu - chỉ để sắp xếp' })
  amountMatches!: boolean;
}

/** Khoản ĐÃ ĐÓNG mà tiền mới về — đích của lượt ghi có Ví điểm khách (ADR 0092). */
export class BankTxLateCreditDto {
  @ApiProperty({ enum: BANK_TX_RECEIVABLE_TYPES }) targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty({ description: 'Mã XPH / XPE' }) code!: string;
  @ApiProperty({ description: 'Trạng thái của khoản lúc này (vd `expired`)' }) status!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({
    description: 'Có tài khoản khách để ghi có không - không có thì chỉ còn chuyển trả tay',
  })
  hasCustomerAccount!: boolean;
}

/** Khớp tay vào một khoản giữ chỗ / phụ lục còn nhận tiền. */
export class MatchReceivableDto {
  @ApiProperty({ enum: BANK_TX_RECEIVABLE_TYPES })
  @IsIn(BANK_TX_RECEIVABLE_TYPES)
  targetType!: BankTxReceivableType;

  @ApiProperty() @IsString() @MaxLength(26) targetId!: string;

  @ApiProperty({
    description: 'Lý do/ghi chú - BẮT BUỘC: mỗi lần khớp tay là một người chịu trách nhiệm',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}

/** Ghi có Ví điểm khách cho tiền về muộn của một khoản đã đóng. */
export class CreditCustomerDto {
  @ApiProperty({ enum: BANK_TX_RECEIVABLE_TYPES })
  @IsIn(BANK_TX_RECEIVABLE_TYPES)
  targetType!: BankTxReceivableType;

  @ApiProperty() @IsString() @MaxLength(26) targetId!: string;

  @ApiProperty({ description: 'Ghi chú - BẮT BUỘC, vào audit và vào giao dịch' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}

export class MatchBankTransactionDto {
  @ApiProperty({ description: 'Id hoá đơn gói được chọn để khớp' })
  @IsString()
  @MaxLength(26)
  invoiceId!: string;

  @ApiProperty({
    description: 'Lý do/ghi chú - BẮT BUỘC: mỗi lần khớp tay là một người chịu trách nhiệm',
  })
  @IsString()
  @MaxLength(500)
  note!: string;
}

export class IgnoreBankTransactionDto {
  @ApiProperty({ description: 'Lý do bỏ qua - bắt buộc, để dòng bị loại vẫn truy được' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({
    description:
      'Mã giao dịch ngân hàng của lần chuyển TRẢ người gửi. Có mã ⇒ dòng được ghi là đã trả lại; ' +
      'không có mã thì không ghi "đã trả" - một lần chuyển không có bằng chứng chỉ là lời khai',
  })
  // Cắt khoảng trắng TRƯỚC khi kiểm độ dài: `"   "` không được lọt qua `MinLength(3)` rồi bị service
  // cắt thành rỗng - admin tưởng đã ghi "đã trả lại" mà dòng không có bằng chứng nào.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  refundReference?: string;
}
