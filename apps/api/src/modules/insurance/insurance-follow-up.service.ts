import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INSURANCE_ESCALATE_AFTER_MINUTES,
  INSURANCE_PARTNER_STATUS,
  INSURANCE_PENDING_CHECKS_MAX,
  INSURANCE_POLICY_STATUS,
  type BookingPriceSnapshot,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  InsuranceAttentionPageDto,
  InsurancePolicyPricingDto,
} from './dto/insurance-follow-up.dto';

/** Hợp đồng còn chờ cấp — phí khách đã trả mà chưa có GCN. */
const AWAITING_ISSUE = [
  INSURANCE_POLICY_STATUS.RESERVED,
  INSURANCE_POLICY_STATUS.ISSUING,
  INSURANCE_POLICY_STATUS.FAILED,
];

/** Số dòng tối đa của khối "Cần xử lý gấp" — danh sách đầy đủ vẫn ở hàng đợi chính. */
const ATTENTION_LIMIT = 50;

/**
 * Theo dõi hợp đồng bảo hiểm sau khi bán — ADR 0091 điều 2 và 7. Chỉ ĐỌC và ghi hai cột theo dõi
 * (`escalated_at`); mọi chuyển trạng thái hợp đồng vẫn là việc của `InsuranceService` / worker.
 *
 *  - báo khẩn: quá `INSURANCE_ESCALATE_AFTER_MINUTES` sau mốc giao xe mà chưa cấp ⇒ đánh dấu MỘT lần;
 *  - "cần xử lý gấp": hợp đồng đã báo khẩn còn chưa cấp, và hợp đồng MIC hết lượt tra mà vẫn chờ ảnh;
 *  - phí thực tế từng chuyến: giá trị xe, bậc, phí đã thu, phí MIC tính, chênh lệch.
 */
@Injectable()
export class InsuranceFollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đánh dấu báo khẩn cho hợp đồng quá hạn cấp. Một câu `UPDATE` có điều kiện: chạy lại bao nhiêu
   * lần cũng chỉ đánh dấu một lần mỗi hợp đồng. Trả số hợp đồng VỪA bị đánh dấu.
   */
  async markEscalations(now: Date = new Date()): Promise<number> {
    const handedOverBefore = new Date(now.getTime() - INSURANCE_ESCALATE_AFTER_MINUTES * 60_000);
    const { count } = await this.prisma.bookingInsurancePolicy.updateMany({
      where: {
        escalatedAt: null,
        status: { in: AWAITING_ISSUE },
        booking: { actualPickupAt: { not: null, lte: handedOverBefore } },
      },
      data: { escalatedAt: now },
    });
    return count;
  }

  /** Hợp đồng cần người xử lý gấp — khối cảnh báo đầu màn Bảo hiểm của admin. */
  async attention(): Promise<InsuranceAttentionPageDto> {
    const where: Prisma.BookingInsurancePolicyWhereInput = {
      OR: [
        { escalatedAt: { not: null }, status: { in: AWAITING_ISSUE } },
        {
          status: INSURANCE_POLICY_STATUS.ISSUED,
          partnerStatus: INSURANCE_PARTNER_STATUS.PENDING_PHOTOS,
          nextAttemptAt: null,
          partnerPendingChecks: { gte: INSURANCE_PENDING_CHECKS_MAX },
        },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.bookingInsurancePolicy.count({ where }),
      this.prisma.bookingInsurancePolicy.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: ATTENTION_LIMIT,
        select: {
          id: true,
          status: true,
          partnerStatus: true,
          lastErrorCode: true,
          escalatedAt: true,
          booking: {
            select: {
              id: true,
              code: true,
              actualPickupAt: true,
              returnAt: true,
              vehicle: { select: { plateNumber: true } },
            },
          },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        policyId: row.id,
        status: row.status,
        partnerStatus: row.partnerStatus,
        lastErrorCode: row.lastErrorCode,
        escalatedAt: row.escalatedAt?.toISOString() ?? null,
        bookingId: row.booking.id,
        bookingCode: row.booking.code,
        plateNumber: row.booking.vehicle.plateNumber,
        handedOverAt: row.booking.actualPickupAt?.toISOString() ?? null,
        returnAt: row.booking.returnAt.toISOString(),
      })),
    };
  }

  /** Phí thực tế của MỘT hợp đồng — ngăn chi tiết của admin (ADR 0091 điều 2). */
  async pricingOf(policyId: string): Promise<InsurancePolicyPricingDto> {
    const row = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id: policyId },
      select: {
        premiumAmount: true,
        partnerPremiumAmount: true,
        insuredValue: true,
        serviceFeeAmount: true,
        refundedAt: true,
        booking: { select: { priceSnapshot: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hợp đồng bảo hiểm',
      });
    }
    const tier =
      (row.booking.priceSnapshot as BookingPriceSnapshot | null)?.fees?.vehicleProtectionTier ??
      null;
    const premium = row.premiumAmount;
    const partner = row.partnerPremiumAmount;
    return {
      premiumAmount: premium.toFixed(0),
      partnerPremiumAmount: partner?.toFixed(0) ?? null,
      // Dương = XePrime thu nhiều hơn MIC tính; âm = XePrime bù phần lệch (ADR 0088 điều 3).
      differenceAmount: partner ? premium.sub(partner).toFixed(0) : null,
      insuredValue: (row.insuredValue?.toFixed(0) ?? tier?.insuredValue) || null,
      tierMaxDays: tier?.maxDays ?? null,
      tierPercent: tier?.percent ?? null,
      serviceFeeAmount: row.serviceFeeAmount.toFixed(0),
      refundedAt: row.refundedAt?.toISOString() ?? null,
    };
  }
}
