import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_HOLD_OUTCOME,
  INSURANCE_POLICY_STATUS,
  type InsuranceVoidBranch,
  type InsuranceVoidRefundTiming,
  INSURANCE_VOID_BRANCH,
  INSURANCE_VOID_REFUND_TIMING,
} from '@xeprime/types';

/** Trạng thái thu hồi được: đã cấp, hoặc lỗi phát hành. */
const VOIDABLE: readonly string[] = [
  INSURANCE_POLICY_STATUS.ISSUED,
  INSURANCE_POLICY_STATUS.FAILED,
];

export interface InsuranceVoidPlanInput {
  status: string;
  coverageFrom: Date | null;
  issuedAt: Date | null;
  remittanceId: string | null;
  premiumAmount: Prisma.Decimal;
  serviceFeeAmount: Prisma.Decimal;
  hold: { outcome: string | null; customerUserId: string | null } | null;
}

export interface InsuranceVoidPlan {
  branch: InsuranceVoidBranch;
  /** Hợp đồng đã tồn tại bên đối tác ⇒ bắt buộc mã huỷ / biên bản đối chiếu. */
  partnerReferenceRequired: boolean;
  refundTiming: InsuranceVoidRefundTiming;
  /** Số sẽ hoàn vào Ví điểm khách (`phí + phí thu hộ`) — `null` khi nhánh này không hoàn qua ví. */
  refundAmount: Prisma.Decimal | null;
  /** Đã nằm trong bảng kê trả hãng ⇒ không huỷ-hoàn được (ADR 0093 điều 2). */
  blockedByRemittance: boolean;
}

/**
 * Lượt thu hồi một hợp đồng sẽ làm gì — ADR 0093. Hàm THUẦN, một chỗ cho cả endpoint thu hồi lẫn
 * màn chi tiết (hộp thu hồi hiện đúng nhánh và số tiền server sẽ làm). `null` = không thu hồi được.
 *
 *  - Đã có HIỆU LỰC (`issued` và `coverage_from` đã tới, hoặc trống) ⇒ `void_keep_payable`: không hoàn,
 *    phí vẫn vào bảng kê trả hãng.
 *  - Chưa từng có hiệu lực ⇒ `cancel_refund`: hoàn `phí + phí thu hộ` vào Ví điểm khách — ngay khi hold
 *    đã chốt `settled`, sau khi hold chốt nếu còn mở, không hoàn thêm nếu hold đã trả phí về khách
 *    bằng kết cục khác.
 */
export function insuranceVoidPlan(p: InsuranceVoidPlanInput, now: Date): InsuranceVoidPlan | null {
  if (!VOIDABLE.includes(p.status)) return null;
  const existsAtPartner = p.status === INSURANCE_POLICY_STATUS.ISSUED || p.issuedAt != null;
  const effective =
    p.status === INSURANCE_POLICY_STATUS.ISSUED &&
    (p.coverageFrom == null || p.coverageFrom.getTime() <= now.getTime());

  if (effective) {
    return {
      branch: INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE,
      partnerReferenceRequired: true,
      refundTiming: INSURANCE_VOID_REFUND_TIMING.NONE,
      refundAmount: null,
      blockedByRemittance: false,
    };
  }

  const timing = refundTimingOf(p.hold);
  return {
    branch: INSURANCE_VOID_BRANCH.CANCEL_REFUND,
    partnerReferenceRequired: existsAtPartner,
    refundTiming: timing,
    refundAmount:
      timing === INSURANCE_VOID_REFUND_TIMING.NOW ||
      timing === INSURANCE_VOID_REFUND_TIMING.AFTER_SETTLEMENT
        ? new Prisma.Decimal(p.premiumAmount).add(p.serviceFeeAmount)
        : null,
    blockedByRemittance: p.remittanceId != null,
  };
}

function refundTimingOf(hold: InsuranceVoidPlanInput['hold']): InsuranceVoidRefundTiming {
  // Không có hold hoặc không có tài khoản khách: XePrime không thu phí này qua QR / không có ví để hoàn.
  if (!hold || !hold.customerUserId) return INSURANCE_VOID_REFUND_TIMING.NONE;
  if (hold.outcome === BOOKING_HOLD_OUTCOME.SETTLED) return INSURANCE_VOID_REFUND_TIMING.NOW;
  if (hold.outcome == null) return INSURANCE_VOID_REFUND_TIMING.AFTER_SETTLEMENT;
  // `refunded` / `split_late_cancel`… đã trả `IV` về khách qua chính hold.
  return INSURANCE_VOID_REFUND_TIMING.VIA_HOLD;
}
