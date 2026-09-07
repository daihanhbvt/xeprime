import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BOOKING_HOLD_OUTCOME_VALUES,
  BOOKING_HOLD_STATUS_VALUES,
  HOLD_REFUND_REASON_VALUES,
  HOLD_REFUND_STATUS_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

export const HOLD_DEFAULT_LIMIT = 20;
export const HOLD_MAX_LIMIT = 100;

/** Một dòng phân bổ của khoản giữ chỗ — tiền này đi đâu khi chốt. */
export class HoldAllocationLineDto {
  @ApiProperty({ example: 'service_fee' }) key!: string;
  @ApiProperty({ example: 'platform' }) beneficiary!: string;
  @ApiProperty({ example: 'customer' }) bearer!: string;
  @ApiProperty({ description: 'VND string' }) amount!: string;
}

/** Khoản hoàn nhìn từ phía KHÁCH — không có số tài khoản đầy đủ, chỉ cờ "đã khai chưa". */
export class CustomerHoldRefundDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: HOLD_REFUND_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: HOLD_REFUND_REASON_VALUES }) reason!: string;
  @ApiProperty({ description: 'VND string' }) amount!: string;
  @ApiProperty({ description: 'Khách đã khai tài khoản nhận hoàn chưa' }) hasAccount!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: '4 số cuối tài khoản đã khai' })
  accountHint!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankReference!: string | null;
}

/** Tài khoản nhận tiền của nền tảng — cùng nguồn với màn mua gói (ADR 0016 điều 5). */
export class HoldPaymentInfoDto {
  @ApiProperty() configured!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) accountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) accountName!: string | null;
}

/**
 * Khoản giữ chỗ nhìn từ phía KHÁCH — gắn vào chi tiết chuyến.
 *
 * Mọi mốc là mốc ĐÃ LƯU ở server (`expiresAt`, `freeCancelUntil`); client so với `Date.now()`
 * chứ không tự tính lại từ giờ nhận xe.
 */
export class CustomerHoldDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Mã đối soát XPH… — NỘI DUNG chuyển khoản' }) code!: string;
  @ApiProperty({ enum: BOOKING_HOLD_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ enum: BOOKING_HOLD_OUTCOME_VALUES, nullable: true, type: String })
  outcome!: string | null;
  @ApiProperty({ description: 'Số phải chuyển (VND string)' }) amount!: string;
  @ApiProperty({ description: 'Đã nhận (VND string)' }) paidAmount!: string;
  @ApiProperty({ description: 'Còn thiếu = amount − paidAmount, kẹp sàn 0' }) remainingAmount!: string;
  @ApiProperty({ description: 'ISO — quá mốc này mà chưa đủ tiền thì chỗ được nhả' }) expiresAt!: string;
  @ApiProperty({ description: 'ISO — huỷ trước mốc này được hoàn toàn bộ' }) freeCancelUntil!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty({ type: [HoldAllocationLineDto] }) allocation!: HoldAllocationLineDto[];
  @ApiPropertyOptional({ type: CustomerHoldRefundDto, nullable: true })
  refund!: CustomerHoldRefundDto | null;
  /**
   * Tài khoản nhận của NỀN TẢNG — đi kèm ngay trong hold để màn chuyến dựng được VietQR mà
   * không phải gọi thêm một endpoint nữa (và `/subscription/payment-info` là bề mặt của gian
   * hàng, khách không có quyền vào).
   *
   * `configured = false` khi nhóm `SEPAY_*` chưa khai: màn hình vẫn hiện MÃ và SỐ TIỀN, chỉ
   * không có QR — có gì hiện nấy, không dựng một QR trỏ vào hư không.
   */
  @ApiProperty({ type: HoldPaymentInfoDto }) paymentInfo!: HoldPaymentInfoDto;
}


/** Tài khoản nhận hoàn — khách khai sau khi huỷ sớm hoặc chuyển thừa. */
export class RefundAccountDto {
  @ApiProperty({ example: 'VCB', description: 'Mã ngân hàng chuẩn VietQR' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/, { message: 'Mã ngân hàng không hợp lệ' })
  bankCode!: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Matches(/^[0-9 ]{6,40}$/, { message: 'Số tài khoản không hợp lệ' })
  bankAccountNumber!: string;

  @ApiProperty({ example: 'NGUYEN VAN A' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  bankAccountName!: string;
}

// ── Phía ADMIN (money operations) ───────────────────────────────────────────

export class PlatformHoldListQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_HOLD_STATUS_VALUES, description: 'Bỏ trống = mọi trạng thái' })
  @IsOptional()
  @IsIn(BOOKING_HOLD_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Chỉ hold ĐÃ TRẢ mà chưa chốt kết cục (chờ tranh chấp)' })
  @IsOptional()
  @IsIn(['true', 'false'])
  unsettled?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã XPH / tên khách / tên gian hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: HOLD_DEFAULT_LIMIT, minimum: 1, maximum: HOLD_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HOLD_MAX_LIMIT)
  limit?: number;
}

export class PlatformHoldDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty() bookingRequestId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCode!: string | null;
  @ApiProperty({ enum: BOOKING_HOLD_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ enum: BOOKING_HOLD_OUTCOME_VALUES, nullable: true, type: String })
  outcome!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() freeCancelUntil!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) releasedAt!: string | null;
  @ApiProperty({ description: 'Đang có tranh chấp mở trên đơn — kết cục bị tạm giữ' })
  disputeOpen!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, enum: HOLD_REFUND_STATUS_VALUES })
  refundStatus!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PlatformHoldPageDto {
  @ApiProperty({ type: [PlatformHoldDto] }) data!: PlatformHoldDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class SettleHoldDto {
  @ApiProperty({ enum: BOOKING_HOLD_OUTCOME_VALUES })
  @IsIn(BOOKING_HOLD_OUTCOME_VALUES)
  outcome!: string;

  @ApiProperty({ description: 'Lý do — bắt buộc, đây là quyết định về tiền của người khác' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

export class PlatformHoldRefundListQueryDto {
  @ApiPropertyOptional({ enum: HOLD_REFUND_STATUS_VALUES, description: 'Bỏ trống = CHỜ CHUYỂN' })
  @IsOptional()
  @IsIn(HOLD_REFUND_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: HOLD_DEFAULT_LIMIT, minimum: 1, maximum: HOLD_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HOLD_MAX_LIMIT)
  limit?: number;
}

/** Khoản hoàn nhìn từ ADMIN — tài khoản nhận đầy đủ chỉ ở đây (quyền `platform.money.manage`). */
export class PlatformHoldRefundDto {
  @ApiProperty() id!: string;
  @ApiProperty() holdId!: string;
  @ApiProperty() holdCode!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: HOLD_REFUND_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: HOLD_REFUND_REASON_VALUES }) reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bankCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidByName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankReference!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PlatformHoldRefundPageDto {
  @ApiProperty({ type: [PlatformHoldRefundDto] }) data!: PlatformHoldRefundDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class MarkRefundPaidDto {
  @ApiProperty({ description: 'Mã giao dịch ngân hàng chiều ra — bằng chứng đã chuyển' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  bankReference!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class RejectRefundDto {
  @ApiProperty({ description: 'Lý do từ chối — bắt buộc' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}

/**
 * Đối chiếu MỘT NGÀY (giờ Việt Nam) — ADR 0028 release gate 6, Gap Analysis §3.B.
 *
 * Ba con số của ngân hàng phải khớp ba con số của sổ; chênh lệch là việc admin phải nhìn.
 */
export class DailyReconciliationDto {
  @ApiProperty({ example: '2026-09-07' }) date!: string;
  @ApiProperty({ description: 'Tổng tiền VÀO ngân hàng trong ngày (bank_transactions.amount_in)' })
  bankIn!: string;
  @ApiProperty() bankInCount!: number;
  @ApiProperty({ description: 'Phần đã khớp hoá đơn gói' }) matchedSubscriptions!: string;
  @ApiProperty({ description: 'Phần đã khớp khoản giữ chỗ' }) matchedHolds!: string;
  @ApiProperty({ description: 'Chưa khớp — hàng đợi admin' }) unmatched!: string;
  @ApiProperty() unmatchedCount!: number;
  @ApiProperty({ description: 'Bị bỏ qua (chuyển nhầm…)' }) ignored!: string;
  @ApiProperty({ description: 'Hoàn ĐÃ CHUYỂN trong ngày (chiều ra, ghi tay)' }) refundsPaid!: string;
  @ApiProperty() refundsPaidCount!: number;
  @ApiProperty({ description: 'Hoàn ĐANG CHỜ tại thời điểm hỏi — nợ phải trả khách' }) refundsPending!: string;
  @ApiProperty() refundsPendingCount!: number;
  @ApiProperty({ description: 'Hold đã trả nhưng chưa chốt kết cục — tiền đang chờ' }) holdsUnsettled!: string;
  @ApiProperty() holdsUnsettledCount!: number;
  @ApiProperty({
    description: 'bankIn − matchedSubscriptions − matchedHolds − unmatched − ignored. Khác 0 là có dòng không thuộc nhóm nào.',
  })
  variance!: string;
}
