import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  BOOKING_HOLD_STATUS,
  HOLD_REFUND_STATUS,
  INSURANCE_POLICY_STATUS,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_OPEN,
  TAX_WITHHOLDING_STATUS,
  WITHDRAWAL_STATUS_HOLDING_FUNDS,
  taxPeriodKeyVn,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformMoneySummaryDto } from './dto/platform-money-summary.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async summary(now: Date = new Date()): Promise<PlatformMoneySummaryDto> {
    const period = taxPeriodKeyVn(now);
    const holdsWhere: Prisma.BookingHoldWhereInput = {
      status: BOOKING_HOLD_STATUS.PAID,
      outcome: null,
    };
    const withdrawalsWhere: Prisma.WithdrawalRequestWhereInput = {
      status: { in: [...WITHDRAWAL_STATUS_HOLDING_FUNDS] },
    };

    const [bankIn, holds, disputeCount, refunds, withdrawals, overdueCount, insurance, tax] =
      await Promise.all([
        // = `BankTransactionsService.list` không lọc gì.
        this.prisma.bankTransaction.aggregate({
          where: { direction: BANK_DIRECTION.IN, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
          _count: { _all: true },
          _sum: { amountIn: true },
          _min: { bankTime: true, createdAt: true },
        }),
        // = `BookingHoldsService.listForPlatform` với `unsettled=true`.
        this.prisma.bookingHold.aggregate({
          where: holdsWhere,
          _count: { _all: true },
          _sum: { paidAmount: true },
        }),
        // Cùng định nghĩa "tranh chấp mở" với `openDisputeBookingIds` (cờ `disputeOpen` của dòng).
        this.prisma.bookingHold.count({
          where: {
            ...holdsWhere,
            booking: {
              supportCases: {
                some: {
                  category: SUPPORT_CASE_CATEGORY.DISPUTE,
                  status: { in: [...SUPPORT_CASE_STATUS_OPEN] },
                },
              },
            },
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
      holds: {
        count: holds._count._all,
        amount: money(holds._sum.paidAmount),
        disputeCount,
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
