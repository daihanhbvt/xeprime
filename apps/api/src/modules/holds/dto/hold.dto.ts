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
/** Vế TIỀN CỦA NỀN TẢNG — lũy kế tới hết ngày hỏi. Số này XePrime được phép tiêu. */
export class ReconciliationPlatformDto {
  @ApiProperty({
    description:
      'Phần XePrime giữ lại từ các hold ĐÃ CHỐT — đọc cột `settled_platform_amount` đã đóng ' +
      'băng. KHÔNG bằng tổng `service_fee_amount`: huỷ muộn chia đôi `D + S`.',
  })
  serviceFeeRecognized!: string;
  @ApiProperty({ description: 'Tiền gói đã thu (subscription_invoices.paid_amount)' })
  subscriptionsCollected!: string;
  @ApiProperty({ description: 'Tổng hai dòng trên' }) total!: string;
}

/**
 * Vế TIỀN GIỮ HỘ — nghĩa vụ phải trả người khác tại cuối ngày hỏi.
 *
 * Đây là con số ADR 0025 điều 6 gọi là *"không tách được nghĩa là không biết mình đang tiêu tiền
 * của ai"*. Mọi dòng ở đây là tiền XePrime đang giữ nhưng KHÔNG sở hữu.
 */
export class ReconciliationCustodiedDto {
  @ApiProperty({
    description:
      'TOÀN BỘ số đã nhận của hold chưa chốt kết cục. Không tách riêng phần `D+IV+IP`: trước ' +
      'khi chốt thì cả `S` cũng có thể phải hoàn khách (huỷ sớm), nên chưa đồng nào là của nền tảng.',
  })
  holdsUnsettled!: string;
  @ApiProperty() holdsUnsettledCount!: number;
  @ApiProperty({ description: 'Tổng nghĩa vụ ví tại cuối ngày = Σ wallet_entries tới mốc đó' })
  walletTotal!: string;
  @ApiProperty({ description: 'Phần khả dụng của ví (hiện tại)' }) walletAvailable!: string;
  @ApiProperty({ description: 'Phần đang bị khoá bởi lệnh rút chờ xử lý (hiện tại)' })
  walletPending!: string;
  @ApiProperty({
    description: 'Hoàn cho khách VÃNG LAI còn chờ chuyển tay — nghĩa vụ chưa vào ví được',
  })
  refundsPending!: string;
  @ApiProperty() refundsPendingCount!: number;
  @ApiProperty({
    description:
      'Tiền vào CHƯA KHỚP được đích — vẫn nằm trong tài khoản và vẫn là tiền của một ai đó. ' +
      'Xếp vào giữ hộ chứ không vào chênh lệch: nó có chủ, chỉ là chưa biết ai.',
  })
  unmatchedIn!: string;
  @ApiProperty() unmatchedInCount!: number;
  @ApiProperty({
    description: 'Phí bảo hiểm đã thu chưa quyết toán với hãng. 0 khi cổng bảo hiểm chưa mở (Phase 7).',
  })
  insuranceReserved!: string;
  @ApiProperty({
    description: 'Thuế đã khấu trừ chưa nộp. 0 khi cổng thuế chưa mở (Phase 8).',
  })
  taxAccrued!: string;
  @ApiProperty({ description: 'Tổng nghĩa vụ' }) total!: string;
}

/** Chiều RA đã thực hiện TRONG NGÀY — không phải nghĩa vụ, chỉ là dòng tiền đã đi. */
export class ReconciliationOutflowDto {
  @ApiProperty({ description: 'Lệnh rút đã đánh dấu đã chuyển trong ngày' })
  withdrawalsPaid!: string;
  @ApiProperty() withdrawalsPaidCount!: number;
  @ApiProperty({ description: 'Khoản hoàn đã chuyển tay trong ngày' }) refundsPaid!: string;
  @ApiProperty() refundsPaidCount!: number;
  @ApiProperty({ description: 'Tổng đã chi trong ngày' }) total!: string;
}

/** Tiền VÀO trong ngày, theo đích đã khớp — giữ nguyên bốn con số của bản một vế. */
export class ReconciliationInflowDto {
  @ApiProperty({ description: 'Tổng tiền VÀO ngân hàng trong ngày' }) bankIn!: string;
  @ApiProperty() bankInCount!: number;
  @ApiProperty({ description: 'Phần đã khớp hoá đơn gói' }) matchedSubscriptions!: string;
  @ApiProperty({ description: 'Phần đã khớp khoản giữ chỗ' }) matchedHolds!: string;
  @ApiProperty({ description: 'Chưa khớp — hàng đợi admin' }) unmatched!: string;
  @ApiProperty() unmatchedCount!: number;
  @ApiProperty({ description: 'Bị bỏ qua (chuyển nhầm…)' }) ignored!: string;
  @ApiProperty({
    description: 'bankIn − (gói + giữ chỗ + chưa khớp + bỏ qua). Khác 0 là có dòng lạc nhóm.',
  })
  variance!: string;
}

/**
 * LỆCH SỔ VÍ — phép kiểm ADR 0023 điều 6 đòi.
 *
 * `wallets.balance` được lưu sẵn để có một câu `updateMany` nguyên tử lúc rút; cái giá là nó có
 * thể trôi khỏi sổ cái nếu có ai ghi ngoài `WalletService`. Bút toán ví cộng lại phải đúng bằng
 * `balance + pending_withdraw_amount` — lệch một đồng là có đường ghi thứ hai.
 */
export class WalletDriftDto {
  @ApiProperty({ description: 'Số ví có Σ bút toán ≠ balance + pending' }) wallets!: number;
  @ApiProperty({ description: 'Tổng trị tuyệt đối phần lệch' }) amount!: string;
}

export class DailyReconciliationDto {
  @ApiProperty({ example: '2026-09-14' }) date!: string;

  @ApiProperty({ type: ReconciliationPlatformDto }) platform!: ReconciliationPlatformDto;
  @ApiProperty({ type: ReconciliationCustodiedDto }) custodied!: ReconciliationCustodiedDto;
  @ApiProperty({ type: ReconciliationOutflowDto }) outflow!: ReconciliationOutflowDto;
  @ApiProperty({ type: ReconciliationInflowDto }) inflow!: ReconciliationInflowDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Số dư ngân hàng cuối ngày, NHẬP TAY (SePay không gửi số dư). `null` = chưa nhập — giao ' +
      'diện phải nói rõ, KHÔNG hiển thị 0.',
  })
  bankBalanceEod!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'bankBalanceEod − (platform.total + custodied.total). `null` khi chưa nhập số dư — ' +
      'chênh lệch CHƯA TÍNH ĐƯỢC, không phải bằng 0.',
  })
  variance!: string | null;

  @ApiProperty({ type: WalletDriftDto }) walletDrift!: WalletDriftDto;
}

/**
 * Admin nhập số dư ngân hàng cuối ngày.
 *
 * Tiền là CHUỖI trên dây (ADR 0007) và được validate bằng regex chứ không `@IsNumber`: một số
 * thực JavaScript không giữ nổi VND lớn mà không mất chính xác, và đây là vế trái của phép đối
 * soát — sai một đồng ở đây là báo động giả mỗi ngày.
 */
export class SaveBankBalanceDto {
  @ApiProperty({ example: '2026-09-14', description: 'Ngày theo giờ Việt Nam (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày phải theo dạng YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: '125000000', description: 'Số dư cuối ngày, VND nguyên, không âm' })
  @Matches(/^\d{1,12}$/, { message: 'Số dư phải là số nguyên không âm' })
  balance!: string;

  @ApiPropertyOptional({ description: 'Ghi chú — vì sao con số này, đọc ở đâu' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
