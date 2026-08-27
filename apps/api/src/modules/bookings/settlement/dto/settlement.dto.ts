import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEPOSIT_STATUS_VALUES,
  REFUND_METHOD_VALUES,
  SURCHARGE_CATEGORY_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Tiền vào ra dưới dạng chuỗi thập phân — ADR 0007, không bao giờ `number`. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

// ── Phát sinh ───────────────────────────────────────────────────────────────

export class BookingSurchargeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES }) category!: string;
  @ApiProperty({ description: 'Tiền dạng chuỗi — ADR 0007' }) amount!: string;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({ description: 'ISO' }) createdAt!: string;
  @ApiProperty({ description: 'ISO' }) updatedAt!: string;
}

export class SaveSurchargeDto {
  @ApiProperty({ enum: SURCHARGE_CATEGORY_VALUES, description: 'KHÔNG có danh mục nhiên liệu' })
  @IsIn(SURCHARGE_CATEGORY_VALUES)
  category!: string;

  @ApiProperty({ description: 'VND, không âm (chuỗi — ADR 0007)' })
  @Matches(MONEY_PATTERN, { message: 'Số tiền không hợp lệ (số VND không âm)' })
  amount!: string;

  @ApiProperty({ description: 'Lý do — bắt buộc, đây là khoản trừ vào tiền của khách' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

/** Gỡ một khoản đã ghi nhầm. Huỷ MỀM kèm lý do — không xoá dấu vết. */
export class VoidSurchargeDto {
  @ApiProperty({ description: 'Lý do gỡ — bắt buộc' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

// ── Gợi ý quá giờ ───────────────────────────────────────────────────────────

/**
 * Đề xuất phí quá giờ do SERVER tính từ chính sách hiệu lực + giờ trả thực tế.
 *
 * Chỉ là GỢI Ý: chủ xe sửa hoặc bỏ qua. Trình duyệt không bao giờ tự tính con số này — hai nơi
 * cùng tính một công thức tiền là cách chắc chắn nhất để chúng lệch nhau.
 */
export class OvertimeSuggestionDto {
  @ApiProperty({ description: 'Có đủ dữ liệu (chính sách + giờ trả thực tế) để đề xuất không' })
  available!: boolean;
  @ApiProperty({ description: 'Số phút trễ so với lịch (đã trừ thời gian miễn phí)' })
  lateMinutes!: number;
  @ApiProperty({ description: 'Số giờ tính phí sau khi làm tròn' }) chargedHours!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) feePerHour!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tiền đề xuất' })
  amount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Diễn giải công thức' })
  formula!: string | null;
}

// ── Hoàn cọc ────────────────────────────────────────────────────────────────

export class DepositRefundDto {
  @ApiProperty({ description: 'Tiền dạng chuỗi' }) refundAmount!: string;
  @ApiProperty({ enum: REFUND_METHOD_VALUES }) refundMethod!: string;
  @ApiProperty({ description: 'ISO' }) refundedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recordedByName!: string | null;
  @ApiProperty({ description: 'Optimistic concurrency — nộp lại khi điều chỉnh' })
  rowVersion!: number;
}

/**
 * Toàn cảnh quyết toán của MỘT đơn — một request đủ dựng thẻ cọc trên màn chi tiết.
 *
 * Mọi con số ở đây do server tính. `depositReceived` KHÔNG phải `bookings.deposit_amount`
 * (số cấu hình) mà là tổng khoản `payments.kind = 'deposit'` đã thu — không có bằng chứng đã
 * thu tiền thì không có việc hoàn tiền.
 */
export class BookingSettlementDto {
  @ApiProperty() bookingId!: string;
  @ApiProperty({ description: 'Cọc theo cấu hình đơn — CHƯA chắc đã thu' })
  depositRequired!: string;
  @ApiProperty({ description: 'Cọc ĐÃ THU (từ payments kind=deposit)' }) depositReceived!: string;
  @ApiProperty({ type: [BookingSurchargeDto] }) surcharges!: BookingSurchargeDto[];
  @ApiProperty({ description: 'Tổng phát sinh còn hiệu lực' }) surchargeTotal!: string;
  @ApiProperty({ description: 'max(cọc đã thu − tổng phát sinh, 0)' }) proposedRefund!: string;
  @ApiProperty({ description: 'max(tổng phát sinh − cọc đã thu, 0)' }) additionalDue!: string;
  @ApiProperty({ enum: DEPOSIT_STATUS_VALUES, description: '@xeprime/types → DepositStatus' })
  depositStatus!: string;
  @ApiPropertyOptional({ type: DepositRefundDto, nullable: true }) refund!: DepositRefundDto | null;
  @ApiProperty({ type: OvertimeSuggestionDto }) overtime!: OvertimeSuggestionDto;
}

export class RecordDepositRefundDto {
  @ApiProperty({ description: 'Số tiền thực hoàn (chuỗi — ADR 0007)' })
  @Matches(MONEY_PATTERN, { message: 'Số tiền không hợp lệ (số VND không âm)' })
  refundAmount!: string;

  @ApiProperty({ enum: REFUND_METHOD_VALUES })
  @IsIn(REFUND_METHOD_VALUES)
  refundMethod!: string;

  @ApiPropertyOptional({ description: 'ISO — mặc định hiện tại. Không được ở tương lai.' })
  @IsOptional()
  @IsDateString()
  refundedAt?: string;

  @ApiPropertyOptional({ description: 'Mã giao dịch/tham chiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Điều chỉnh một bản ghi hoàn cọc ĐÃ có — quyền cao hơn, lý do bắt buộc, audit before/after.
 * Nằm trong menu `⋯`, không phải một bước của mọi chuyến.
 */
export class CorrectDepositRefundDto extends RecordDepositRefundDto {
  @ApiProperty({ description: 'Lý do điều chỉnh — bắt buộc, vào audit' })
  @IsString()
  @MaxLength(1000)
  correctionReason!: string;

  @ApiProperty({ description: 'Bắt buộc — chống sửa đè' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}
