import { Injectable } from '@nestjs/common';
import { openSupportCaseWhere, Prisma } from '@xeprime/prisma';
import {
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  HOLD_REFUND_STATUS,
  INSURANCE_POLICY_STATUS,
  PAYMENT_ORDER_REVIEW_STATUS,
  SUPPORT_CASE_CATEGORY,
  TAX_WITHHOLDING_STATUS,
  WITHDRAWAL_STATUS_HOLDING_FUNDS,
  taxPeriodKeyVn,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayConfig } from '../payment-gateway/payment-gateway.config';
import { PlatformMoneySummaryDto } from './dto/platform-money-summary.dto';
import { holdAwaitingManualSettlementWhere } from './hold-settle-queue';

/**
 * Số đếm hàng đợi của màn Tài chính — CHỈ ĐỌC, không ghi bảng nào.
 *
 * Đọc thẳng sáu bảng thay vì gọi sáu service: mỗi service ghi (`SepayService`, `WalletService`…)
 * là chủ của bảng đó ở chiều GHI; ở đây chỉ có `count`/`aggregate`, và kéo sáu module vào một
 * phép đếm là tạo vòng phụ thuộc cho một màn hình. Điều kiện của từng nhóm phải TRÙNG điều kiện
 * mặc định của danh sách tương ứng — sửa bên này thì sửa bên kia.
 */
@Injectable()
export class PlatformMoneySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayConfig,
  ) {}

  async summary(now: Date = new Date()): Promise<PlatformMoneySummaryDto> {
    const period = taxPeriodKeyVn(now);
    // Hàng đợi CHỐT TAY — cùng định nghĩa với danh sách và chốt chặn `adminSettle`.
    const holdsWhere = holdAwaitingManualSettlementWhere();
    const disputeCase = openSupportCaseWhere([SUPPORT_CASE_CATEGORY.DISPUTE]);
    const handoverCase = openSupportCaseWhere([SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED]);
    const withdrawalsWhere: Prisma.WithdrawalRequestWhereInput = {
      status: { in: [...WITHDRAWAL_STATUS_HOLDING_FUNDS] },
    };

    const [
      bankIn,
      gatewayIn,
      holds,
      disputeCount,
      handoverUnconfirmedCount,
      refunds,
      withdrawals,
      overdueCount,
      insurance,
      tax,
    ] = await Promise.all([
      // = `BankTransactionsService.list` không lọc gì.
      this.prisma.bankTransaction.aggregate({
        where: { direction: BANK_DIRECTION.IN, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        _count: { _all: true },
        _sum: { amountIn: true },
        _min: { bankTime: true, createdAt: true },
      }),
      // = `PlatformPaymentOrdersService.list` không lọc gì (`view=review`) — ADR 0058.
      this.prisma.paymentGatewayOrder.aggregate({
        where: { reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // = `BookingHoldsService.listForPlatform` với `unsettled=true`.
      this.prisma.bookingHold.aggregate({
        where: holdsWhere,
        _count: { _all: true },
        _sum: { paidAmount: true },
      }),
      // Hai số đếm khớp ĐÚNG tag `settleReason` của dòng (`holdSettleReason`): có tranh chấp mở
      // ⇒ `dispute_open`; chỉ có "chưa xác nhận bàn giao" ⇒ `handover_unconfirmed`. Cùng mảnh
      // `where` với lượt chốt kết cục (`openSupportCaseWhere`).
      // `AND` chứ không trải `...holdsWhere`: khoá `booking` của nó mang điều kiện của hàng đợi,
      // trải ra rồi viết đè `booking` là âm thầm bỏ mất điều kiện đó.
      this.prisma.bookingHold.count({
        where: { AND: [holdsWhere, { booking: { supportCases: { some: disputeCase } } }] },
      }),
      this.prisma.bookingHold.count({
        where: {
          AND: [
            holdsWhere,
            { booking: { supportCases: { some: handoverCase } } },
            { booking: { supportCases: { none: disputeCase } } },
          ],
        },
      }),
      // = `listRefundsForPlatform` không lọc gì.
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PENDING },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // = `PlatformWithdrawalService.list` không lọc gì.
      this.prisma.withdrawalRequest.aggregate({
        where: withdrawalsWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.count({
        where: { ...withdrawalsWhere, dueBy: { lt: now } },
      }),
      // = `InsuranceReadService.listForPlatform` không lọc gì.
      this.prisma.bookingInsurancePolicy.aggregate({
        where: { status: INSURANCE_POLICY_STATUS.FAILED },
        _count: { _all: true },
        _sum: { premiumAmount: true },
      }),
      // Mọi kỳ còn dòng CHƯA KÊ KHAI — xem docblock `TaxQueueSummaryDto`.
      this.prisma.taxWithholding.aggregate({
        where: { status: TAX_WITHHOLDING_STATUS.ACCRUED },
        _count: { _all: true },
        _sum: { amount: true },
        _min: { periodKey: true },
      }),
    ]);

    return {
      bankIn: {
        count: bankIn._count._all,
        amount: money(bankIn._sum.amountIn),
        oldestAt: earliest(bankIn._min.bankTime, bankIn._min.createdAt)?.toISOString() ?? null,
      },
      gatewayIn: { count: gatewayIn._count._all, amount: money(gatewayIn._sum.amount) },
      gatewayEnabled: this.gateway.inUse,
      holds: {
        count: holds._count._all,
        amount: money(holds._sum.paidAmount),
        disputeCount,
        handoverUnconfirmedCount,
      },
      refunds: { count: refunds._count._all, amount: money(refunds._sum.amount) },
      withdrawals: {
        count: withdrawals._count._all,
        amount: money(withdrawals._sum.amount),
        overdueCount,
      },
      insurance: { count: insurance._count._all, amount: money(insurance._sum.premiumAmount) },
      tax: {
        period,
        count: tax._count._all,
        amount: money(tax._sum.amount),
        oldestPeriod: tax._min.periodKey ?? null,
      },
    };
  }
}

/**
 * Mốc tiền tới SỚM NHẤT — theo ngân hàng; dòng thiếu mốc đó (payload cũ) chỉ có lúc webhook về.
 * Cùng quy ước với cột "đã chờ" của hàng đợi, để thẻ "cũ nhất 2 ngày" và dòng 2 ngày nói cùng một số.
 */
function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** `_sum` trả `null` khi không có dòng nào — với một hàng đợi rỗng, tổng đúng là 0. */
function money(value: Prisma.Decimal | null): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}
