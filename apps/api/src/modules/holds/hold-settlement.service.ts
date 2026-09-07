import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_STATUS,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_OPEN,
  isOutcomeAllowed,
  isWithinFreeCancel,
  type AuditActorScope,
  type BookingHoldOutcome,
  type BookingHoldPurpose,
  type BookingStatus,
  type HoldRefundReason,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';

/**
 * CHỐT KẾT CỤC của một khoản giữ chỗ và ghi nhận HOÀN — ADR 0028 điều 6 và 8 (R3).
 *
 * Tách khỏi `BookingHoldsService` (tạo hold + nhận tiền) có chủ đích về PHỤ THUỘC: chốt kết cục
 * xảy ra khi ĐƠN đổi trạng thái, tức `BookingsService.transitionWithinTx` phải gọi vào đây —
 * mà `BookingHoldsService` lại gọi `BookingsService.createWithinTx` lúc tiền về. Gộp chung là
 * một vòng phụ thuộc. Module này vì thế chỉ biết Prisma + audit + thông báo.
 *
 * Ba quy tắc, đều là QUY TẮC trong code chứ không phải dữ liệu:
 *
 *  1. Hoàn thành ⇒ `kept` (XePrime giữ phí dịch vụ). Khách không đến ⇒ `forfeited`.
 *  2. Khách huỷ: TRƯỚC `free_cancel_until` (cột đã đóng băng, không tính lại từ giờ nhận) ⇒
 *     `refunded` 100%; SAU mốc ⇒ `forfeited`. Chủ xe/nền tảng huỷ ⇒ `refunded` — khách không
 *     có lỗi. Đây là chính sách huỷ/hoàn công bố ở `/legal/cancellation`; đổi luật là đổi cả hai.
 *  3. Có TRANH CHẤP mở trên đơn ⇒ KHÔNG chốt. Kết cục để trống, admin chốt tay sau khi case
 *     kết luận (`adminSettle`). Hook từ chuyển trạng thái đơn KHÔNG ném — đơn vẫn huỷ/hoàn thành
 *     được, chỉ có tiền là chờ.
 *
 * Mọi bước ghi đều idempotent bằng điều kiện trong WHERE (`outcome IS NULL`): worker chạy lại,
 * admin bấm hai lần, hai chuyển trạng thái nối tiếp — cùng một kết quả.
 */
@Injectable()
export class HoldSettlementService {
  private readonly logger = new Logger(HoldSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Hook từ `BookingsService.transitionWithinTx` — chạy TRONG transaction của lượt chuyển.
   *
   * Không có hold đã trả ⇒ không làm gì (đơn tuyến gói, đơn gian hàng tự lập, đơn cũ). Không
   * bao giờ ném vì lý do tiền: chuyển trạng thái đơn là việc vận hành xe, tiền đi sau.
   */
  async settleForBookingWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      bookingId: string;
      tenantId: string;
      to: BookingStatus;
      actorScope: AuditActorScope;
      actorUserId: string | null;
    },
  ): Promise<void> {
    const hold = await tx.bookingHold.findFirst({
      where: {
        bookingId: input.bookingId,
        tenantId: input.tenantId,
        status: BOOKING_HOLD_STATUS.PAID,
        outcome: null,
      },
      select: {
        id: true,
        purpose: true,
        paidAmount: true,
        freeCancelUntil: true,
        customerUserId: true,
        bookingRequestId: true,
      },
    });
    if (!hold) return;

    const decision = decideOutcome({
      to: input.to,
      actorScope: input.actorScope,
      freeCancelUntil: hold.freeCancelUntil,
    });
    if (!decision) return;

    if (await this.hasOpenDispute(tx, input.bookingId)) {
      // Tiền chờ tranh chấp — ghi audit để hàng đợi admin nhìn thấy, KHÔNG chặn lượt chuyển.
      this.logger.warn(`Hold ${hold.id} giữ kết cục vì có tranh chấp mở trên đơn ${input.bookingId}`);
      await this.audit.record(
        {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorScope: input.actorScope,
          action: 'booking_hold.settlement_deferred',
          targetType: 'booking_hold',
          targetId: hold.id,
          after: { reason: 'open_dispute', wouldBe: decision.outcome },
        },
        tx,
      );
      return;
    }

    await this.applyOutcomeWithinTx(tx, {
      holdId: hold.id,
      tenantId: input.tenantId,
      purpose: hold.purpose as BookingHoldPurpose,
      paidAmount: hold.paidAmount,
      customerUserId: hold.customerUserId,
      outcome: decision.outcome,
      refundReason: decision.refundReason,
      actorScope: input.actorScope,
      actorUserId: input.actorUserId,
      note: null,
    });
  }

  /**
   * Admin chốt tay — cho hold bị tạm giữ vì tranh chấp, hoặc sửa một kết cục bằng quyết định
   * có lý do. Chỉ chốt được khi `outcome IS NULL`; đã chốt thì đây là chuyện của bút toán đảo
   * (R4), không phải sửa lịch sử.
   */
  async adminSettle(
    holdId: string,
    actorUserId: string,
    input: { outcome: BookingHoldOutcome; note: string },
  ): Promise<void> {
    const hold = await this.prisma.bookingHold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        tenantId: true,
        purpose: true,
        status: true,
        outcome: true,
        paidAmount: true,
        customerUserId: true,
      },
    });
    if (!hold) throw notFound('Không tìm thấy khoản giữ chỗ');
    if (hold.status !== BOOKING_HOLD_STATUS.PAID || hold.outcome !== null) {
      throw new ConflictException({
        code: API_ERROR_CODE.HOLD_NOT_PENDING,
        message: 'Khoản giữ chỗ này không ở trạng thái chờ chốt',
        details: { status: hold.status, outcome: hold.outcome },
      });
    }
    if (!isOutcomeAllowed(hold.purpose as BookingHoldPurpose, input.outcome)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Kết cục không hợp với mục đích của khoản giữ chỗ',
      });
    }
    await this.prisma.$transaction((tx) =>
      this.applyOutcomeWithinTx(tx, {
        holdId: hold.id,
        tenantId: hold.tenantId,
        purpose: hold.purpose as BookingHoldPurpose,
        paidAmount: hold.paidAmount,
        customerUserId: hold.customerUserId,
        outcome: input.outcome,
        refundReason:
          input.outcome === BOOKING_HOLD_OUTCOME.REFUNDED ? HOLD_REFUND_REASON.ADMIN_DECISION : null,
        actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
        actorUserId,
        note: input.note,
      }),
    );
  }

  /**
   * Ghi một yêu cầu hoàn — dùng cho cả kết cục `refunded` lẫn CHUYỂN THỪA (ADR 0022 điều 5:
   * khoản giữ chỗ không có "kỳ sau" để ghi có).
   *
   * Unique `hold_id` ở DB: một hold chỉ có MỘT yêu cầu hoàn. Chuyển thừa rồi lại huỷ sớm là ca
   * hiếm — khi đó tăng số tiền của yêu cầu đang `pending` thay vì tạo cái thứ hai.
   */
  async upsertRefundWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      holdId: string;
      tenantId: string;
      customerUserId: string | null;
      amount: Prisma.Decimal;
      reason: HoldRefundReason;
      note: string | null;
    },
  ): Promise<{ id: string; created: boolean }> {
    if (input.amount.lte(0)) {
      throw new Error(`Số tiền hoàn phải dương (hold ${input.holdId})`);
    }
    const existing = await tx.holdRefund.findUnique({
      where: { holdId: input.holdId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== HOLD_REFUND_STATUS.PENDING) {
        // Đã chuyển/từ chối rồi — không tự cộng dồn vào một yêu cầu đã đóng; admin xử lý tay.
        this.logger.warn(`Hold ${input.holdId} đã có yêu cầu hoàn ${existing.status}; bỏ qua cộng dồn`);
        return { id: existing.id, created: false };
      }
      await tx.holdRefund.update({
        where: { id: existing.id },
        data: { amount: { increment: input.amount }, note: input.note ?? undefined },
      });
      return { id: existing.id, created: false };
    }
    const created = await tx.holdRefund.create({
      data: {
        id: newId(),
        holdId: input.holdId,
        tenantId: input.tenantId,
        customerUserId: input.customerUserId,
        amount: input.amount,
        status: HOLD_REFUND_STATUS.PENDING,
        reason: input.reason,
        note: input.note,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  /** Khách khai tài khoản nhận hoàn — điều kiện để admin chuyển được. */
  async provideRefundAccount(
    holdId: string,
    customerUserId: string,
    account: { bankCode: string; bankAccountNumber: string; bankAccountName: string },
  ): Promise<void> {
    const refund = await this.prisma.holdRefund.findFirst({
      where: { holdId, customerUserId },
      select: { id: true, status: true },
    });
    if (!refund) throw notFound('Chuyến này không có khoản hoàn nào');
    if (refund.status !== HOLD_REFUND_STATUS.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.REFUND_ALREADY_HANDLED,
        message: 'Khoản hoàn này đã được xử lý',
      });
    }
    await this.prisma.holdRefund.update({
      where: { id: refund.id },
      data: {
        bankCode: account.bankCode.trim().toUpperCase(),
        bankAccountNumber: account.bankAccountNumber.replace(/\s+/g, ''),
        bankAccountName: account.bankAccountName.trim(),
      },
    });
  }

  /** Admin đã chuyển — ghi mã giao dịch ngân hàng làm bằng chứng và báo khách. */
  async markRefundPaid(
    refundId: string,
    actorUserId: string,
    input: { bankReference: string; note?: string | null },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.holdRefund.findUnique({
        where: { id: refundId },
        select: {
          id: true,
          tenantId: true,
          customerUserId: true,
          amount: true,
          bankAccountNumber: true,
          hold: { select: { id: true, code: true, bookingId: true } },
        },
      });
      if (!refund) throw notFound('Không tìm thấy khoản hoàn');
      if (!refund.bankAccountNumber) {
        throw new ConflictException({
          code: API_ERROR_CODE.REFUND_ACCOUNT_REQUIRED,
          message: 'Khách chưa khai tài khoản nhận hoàn — không có gì để chuyển',
        });
      }
      const now = new Date();
      const claimed = await tx.holdRefund.updateMany({
        where: { id: refundId, status: HOLD_REFUND_STATUS.PENDING },
        data: {
          status: HOLD_REFUND_STATUS.PAID,
          paidBy: actorUserId,
          paidAt: now,
          bankReference: input.bankReference.trim(),
          note: input.note?.trim() || undefined,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.REFUND_ALREADY_HANDLED,
          message: 'Khoản hoàn này vừa được người khác xử lý',
        });
      }
      await this.audit.record(
        {
          tenantId: refund.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'hold_refund.paid',
          targetType: 'hold_refund',
          targetId: refundId,
          after: {
            holdCode: refund.hold.code,
            amount: refund.amount.toString(),
            bankReference: input.bankReference.trim(),
          },
        },
        tx,
      );
      if (refund.customerUserId) {
        await this.notifications.emitToUser(
          refund.customerUserId,
          {
            type: NOTIFICATION_TYPE.HOLD_REFUND_PAID,
            title: 'Đã hoàn khoản giữ chỗ',
            body: `XePrime đã chuyển trả ${refund.amount.toFixed(0)}đ (mã ${refund.hold.code}).`,
            tenantId: refund.tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: refund.hold.bookingId ?? refund.hold.id,
          },
          tx,
        );
      }
    });
  }

  async rejectRefund(refundId: string, actorUserId: string, note: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.holdRefund.findUnique({
        where: { id: refundId },
        select: { id: true, tenantId: true, amount: true },
      });
      if (!refund) throw notFound('Không tìm thấy khoản hoàn');
      const claimed = await tx.holdRefund.updateMany({
        where: { id: refundId, status: HOLD_REFUND_STATUS.PENDING },
        data: { status: HOLD_REFUND_STATUS.REJECTED, note: note.trim() },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.REFUND_ALREADY_HANDLED,
          message: 'Khoản hoàn này đã được xử lý',
        });
      }
      await this.audit.record(
        {
          tenantId: refund.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'hold_refund.rejected',
          targetType: 'hold_refund',
          targetId: refundId,
          after: { amount: refund.amount.toString(), note: note.trim() },
        },
        tx,
      );
    });
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async applyOutcomeWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      holdId: string;
      tenantId: string;
      purpose: BookingHoldPurpose;
      paidAmount: Prisma.Decimal;
      customerUserId: string | null;
      outcome: BookingHoldOutcome;
      refundReason: HoldRefundReason | null;
      actorScope: AuditActorScope;
      actorUserId: string | null;
      note: string | null;
    },
  ): Promise<void> {
    if (!isOutcomeAllowed(input.purpose, input.outcome)) {
      // CHECK ở DB cũng chặn; nói rõ ở đây để lỗi không hiện ra thành một P2xxx khó đọc.
      throw new Error(`Kết cục ${input.outcome} không hợp mục đích ${input.purpose}`);
    }
    const claimed = await tx.bookingHold.updateMany({
      where: { id: input.holdId, status: BOOKING_HOLD_STATUS.PAID, outcome: null },
      data: {
        outcome: input.outcome,
        status: BOOKING_HOLD_STATUS.RELEASED,
        releasedAt: new Date(),
      },
    });
    // Đã có ai chốt xen vào — idempotent, không ghi đè.
    if (claimed.count === 0) return;

    let refundId: string | null = null;
    if (input.outcome === BOOKING_HOLD_OUTCOME.REFUNDED && input.paidAmount.gt(0)) {
      const refund = await this.upsertRefundWithinTx(tx, {
        holdId: input.holdId,
        tenantId: input.tenantId,
        customerUserId: input.customerUserId,
        amount: input.paidAmount,
        reason: input.refundReason ?? HOLD_REFUND_REASON.ADMIN_DECISION,
        note: input.note,
      });
      refundId = refund.id;
    }

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorScope,
        action: 'booking_hold.settle',
        targetType: 'booking_hold',
        targetId: input.holdId,
        after: {
          outcome: input.outcome,
          paidAmount: input.paidAmount.toString(),
          refundId,
          ...(input.note ? { note: input.note } : {}),
        },
      },
      tx,
    );
  }

  private async hasOpenDispute(tx: Prisma.TransactionClient, bookingId: string): Promise<boolean> {
    const open = await tx.supportCase.count({
      where: {
        bookingId,
        category: SUPPORT_CASE_CATEGORY.DISPUTE,
        status: { in: [...SUPPORT_CASE_STATUS_OPEN] },
      },
    });
    return open > 0;
  }
}

/**
 * Quy tắc kết cục — hàm thuần, export để test khoá từng nhánh.
 *
 * Trả `null` với trạng thái không kết thúc (reserved/confirmed/active): chưa có gì để chốt.
 */
export function decideOutcome(input: {
  to: BookingStatus;
  actorScope: AuditActorScope;
  freeCancelUntil: Date;
  now?: Date;
}): { outcome: BookingHoldOutcome; refundReason: HoldRefundReason | null } | null {
  switch (input.to) {
    case BOOKING_STATUS.COMPLETED:
      return { outcome: BOOKING_HOLD_OUTCOME.KEPT, refundReason: null };
    case BOOKING_STATUS.NO_SHOW:
      return { outcome: BOOKING_HOLD_OUTCOME.FORFEITED, refundReason: null };
    case BOOKING_STATUS.CANCELLED:
      if (input.actorScope === AUDIT_ACTOR_SCOPE.CUSTOMER) {
        return isWithinFreeCancel(input.freeCancelUntil, input.now)
          ? { outcome: BOOKING_HOLD_OUTCOME.REFUNDED, refundReason: HOLD_REFUND_REASON.EARLY_CANCEL }
          : { outcome: BOOKING_HOLD_OUTCOME.FORFEITED, refundReason: null };
      }
      // Gian hàng, nền tảng hay hệ thống huỷ — khách không có lỗi.
      return { outcome: BOOKING_HOLD_OUTCOME.REFUNDED, refundReason: HOLD_REFUND_REASON.OWNER_CANCEL };
    default:
      return null;
  }
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message });
}
