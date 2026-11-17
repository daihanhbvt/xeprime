import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { openSupportCaseWhere, type Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_TYPE,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_STATUS,
  TRIP_VERDICT,
  isSupportCaseOpen,
  tripVerdictsFor,
  type AuditActorScope,
  type BookingStatus,
  type SupportCaseStatus,
  type TripVerdict,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { HandoversService } from '../bookings/handovers/handovers.service';
import { HoldSettlementService } from '../holds/hold-settlement.service';
import type { TripVerdictMoneyDto, TripVerdictPreviewDto } from '../support/dto/support.dto';
import { SupportService } from '../support/support.service';

/** Câu mở đầu kết luận của case — hai bên đọc được trên dòng thời gian (server soạn, tiếng Việt). */
const VERDICT_HEADLINE: Readonly<Record<TripVerdict, string>> = {
  [TRIP_VERDICT.HANDED_OVER]: 'XePrime xác minh: xe đã được giao, chuyến bắt đầu.',
  [TRIP_VERDICT.CUSTOMER_NO_SHOW]: 'XePrime xác minh: khách không đến nhận xe.',
  [TRIP_VERDICT.HOST_NOT_DELIVERED]:
    'XePrime xác minh: chủ xe không giao được xe, chuyến bị huỷ và khách được hoàn tiền.',
  [TRIP_VERDICT.RETURNED]: 'XePrime xác minh: xe đã được trả, chuyến hoàn thành.',
  [TRIP_VERDICT.PLATFORM_CANCELLED]:
    'XePrime huỷ chuyến, không tính lỗi cho bên nào. Khách được hoàn tiền giữ chỗ.',
};

/**
 * Kết luận nào chuyển đơn sang trạng thái KẾT THÚC nào — để xem trước tiền đi qua đúng
 * `decideOutcome` của lượt thật (ADR 0095 điều 3). Vắng mặt = kết luận không chốt tiền (xe đã giao:
 * tiền chốt khi chuyến kết thúc). Người chuyển luôn là nền tảng.
 */
const VERDICT_END_STATUS: Readonly<Partial<Record<TripVerdict, BookingStatus>>> = {
  [TRIP_VERDICT.CUSTOMER_NO_SHOW]: BOOKING_STATUS.NO_SHOW,
  [TRIP_VERDICT.HOST_NOT_DELIVERED]: BOOKING_STATUS.CANCELLED,
  [TRIP_VERDICT.PLATFORM_CANCELLED]: BOOKING_STATUS.CANCELLED,
  [TRIP_VERDICT.RETURNED]: BOOKING_STATUS.COMPLETED,
};
const VERDICT_ACTOR: AuditActorScope = AUDIT_ACTOR_SCOPE.PLATFORM;

/**
 * KẾT LUẬN CHUYẾN của nhân sự nền tảng cho case xác minh bàn giao — ADR 0094.
 *
 * Một transaction, theo thứ tự có chủ đích:
 *  1. khoá case → khoá đơn → kiểm kết luận còn hợp lệ với trạng thái đơn LÚC NÀY (`tripVerdictsFor`);
 *  2. kết luận case (`SupportService.resolveWithinTx`) — TRƯỚC khi chuyển đơn, để lượt chốt tiền
 *     tự động của `transitionWithinTx` không bị chính case này hoãn lại;
 *  3. đi ĐÚNG đường mà gian hàng/khách sẽ đi: biên bản bàn giao (nguồn `platform`) hoặc chuyển
 *     trạng thái đơn (`no_show` / `cancelled` với phía chịu trách nhiệm do nền tảng xác minh). Thuế,
 *     bảo hiểm, nhả lịch, quyết toán chạy y như thường — không có đường tiền thứ hai;
 *  4. audit `support_case.trip_verdict`.
 *
 * Tranh chấp (`dispute`) khác còn mở trên cùng đơn KHÔNG bị đụng tới: nó vẫn giữ tiền, và admin
 * chốt tay sau khi phân xử như mọi tranh chấp.
 */
@Injectable()
export class TripVerdictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly support: SupportService,
    private readonly bookings: BookingsService,
    private readonly handovers: HandoversService,
    private readonly holdSettlement: HoldSettlementService,
  ) {}

  /**
   * XEM TRƯỚC tiền của từng kết luận đang dùng được — đọc, không ghi (ADR 0095 điều 3). Cùng
   * `HoldSettlementService.previewOutcome` với lượt chốt thật, nên hộp kết luận hứa đúng con số lượt
   * bấm sẽ ghi. `deferred` = đơn còn case giữ tiền KHÁC (case này sẽ được khép trước lượt chốt).
   */
  async preview(caseId: string, now: Date = new Date()): Promise<TripVerdictPreviewDto> {
    const supportCase = await this.prisma.supportCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        category: true,
        status: true,
        bookingId: true,
        booking: { select: { status: true } },
      },
    });
    if (!supportCase) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy case',
      });
    }
    const bookingId = supportCase.bookingId;
    const verdicts =
      bookingId && isSupportCaseOpen(supportCase.status as SupportCaseStatus)
        ? tripVerdictsFor(supportCase.category, supportCase.booking?.status)
        : [];
    if (!bookingId || verdicts.length === 0) return { items: [] };

    const otherFreezingCase = await this.prisma.supportCase.findFirst({
      where: { bookingId, id: { not: caseId }, ...openSupportCaseWhere() },
      select: { id: true },
    });

    const items: TripVerdictMoneyDto[] = [];
    for (const verdict of verdicts) {
      const to = VERDICT_END_STATUS[verdict];
      const money = to
        ? await this.holdSettlement.previewOutcome(
            bookingId,
            { to, actorScope: VERDICT_ACTOR },
            now,
          )
        : null;
      items.push({
        verdict,
        outcome: money?.outcome ?? null,
        paidAmount: money?.paidAmount ?? '0',
        customerAmount: money?.refundAmount ?? '0',
        insuranceRefundAmount: money?.insuranceRefundAmount ?? '0',
        ownerAmount: money?.ownerAmount ?? '0',
        platformAmount: money?.platformAmount ?? '0',
        insurerAmount: money?.insurerAmount ?? '0',
        taxAmount: money?.taxAmount ?? '0',
        deferred: money != null && otherFreezingCase !== null,
      });
    }
    return { items };
  }

  async apply(
    caseId: string,
    actorUserId: string,
    input: { verdict: TripVerdict; note: string },
    now: Date = new Date(),
  ): Promise<void> {
    const note = input.note.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "public"."support_cases" WHERE "id" = ${caseId} FOR UPDATE`;
      const supportCase = await tx.supportCase.findUnique({
        where: { id: caseId },
        select: { id: true, code: true, category: true, status: true, bookingId: true },
      });
      if (!supportCase) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy case',
        });
      }
      if (!isSupportCaseOpen(supportCase.status as SupportCaseStatus)) {
        throw new ConflictException({
          code: API_ERROR_CODE.SUPPORT_CASE_CLOSED,
          message: 'Case đã đóng - không kết luận chuyến được nữa',
          details: { status: supportCase.status },
        });
      }

      const booking = supportCase.bookingId
        ? await this.lockBooking(tx, supportCase.bookingId)
        : null;
      const verdicts = tripVerdictsFor(supportCase.category, booking?.status);
      if (!booking || !verdicts.includes(input.verdict)) {
        throw new ConflictException({
          code: API_ERROR_CODE.SUPPORT_TRIP_VERDICT_NOT_ALLOWED,
          message: 'Kết luận này không dùng được cho case/đơn ở trạng thái hiện tại',
          details: { verdicts, bookingStatus: booking?.status ?? null },
        });
      }

      await this.support.resolveWithinTx(
        tx,
        caseId,
        actorUserId,
        `${VERDICT_HEADLINE[input.verdict]} ${note}`,
        { guardTripVerdict: false, audit: { verdict: input.verdict } },
      );

      const from = booking.status as BookingStatus;
      switch (input.verdict) {
        case TRIP_VERDICT.HANDED_OVER:
        case TRIP_VERDICT.RETURNED: {
          const pickup = input.verdict === TRIP_VERDICT.HANDED_OVER;
          const scheduled = pickup ? booking.pickupAt : booking.returnAt;
          const done = await this.handovers.confirmOnCustomerWordWithinTx(tx, {
            tenantId: booking.tenantId,
            booking: {
              id: booking.id,
              code: booking.code,
              vehicleId: booking.vehicleId,
              status: from,
            },
            type: pickup ? HANDOVER_TYPE.PICKUP : HANDOVER_TYPE.RETURN,
            customerUserId: actorUserId,
            source: HANDOVER_CONFIRM_SOURCE.PLATFORM,
            // Mốc hẹn trên đơn — nhân sự không có KM/giờ thực tế; không bao giờ ghi một mốc tương lai.
            occurredAt: scheduled.getTime() <= now.getTime() ? scheduled : now,
          });
          if (!done) {
            throw new ConflictException({
              code: API_ERROR_CODE.SUPPORT_TRIP_VERDICT_NOT_ALLOWED,
              message: 'Biên bản bàn giao vừa được xác nhận - tải lại case',
              details: { verdicts: [], bookingStatus: from },
            });
          }
          break;
        }
        case TRIP_VERDICT.CUSTOMER_NO_SHOW:
          await this.bookings.transitionWithinTx(
            tx,
            booking.tenantId,
            booking.id,
            actorUserId,
            from,
            BOOKING_STATUS.NO_SHOW,
            { actorScope: VERDICT_ACTOR, reason: note },
          );
          break;
        case TRIP_VERDICT.PLATFORM_CANCELLED:
          // Không `verifiedParty`: phía chịu trách nhiệm suy từ scope người huỷ ⇒ `platform`, không
          // trừ uy tín chủ xe (ADR 0095 điều 1). Hold hoàn 100% như mọi lượt huỷ không do khách.
          await this.bookings.transitionWithinTx(
            tx,
            booking.tenantId,
            booking.id,
            actorUserId,
            from,
            BOOKING_STATUS.CANCELLED,
            {
              actorScope: VERDICT_ACTOR,
              reason: note,
              reasonCategory: CANCELLATION_REASON_CATEGORY.OTHER,
            },
          );
          break;
        case TRIP_VERDICT.HOST_NOT_DELIVERED:
          await this.bookings.transitionWithinTx(
            tx,
            booking.tenantId,
            booking.id,
            actorUserId,
            from,
            BOOKING_STATUS.CANCELLED,
            {
              actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
              reason: note,
              reasonCategory: CANCELLATION_REASON_CATEGORY.OTHER,
              // Nền tảng đã xác minh: chuyến hỏng vì phía cho thuê — tính vào uy tín chủ xe.
              verifiedParty: CANCELLATION_PARTY.HOST,
            },
          );
          break;
      }

      await this.audit.record(
        {
          tenantId: booking.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: SUPPORT_CASE_AUDIT_ACTION.TRIP_VERDICT,
          targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
          targetId: caseId,
          before: { caseStatus: supportCase.status, bookingStatus: from },
          after: {
            caseStatus: SUPPORT_CASE_STATUS.RESOLVED,
            verdict: input.verdict,
            bookingId: booking.id,
            note,
          },
        },
        tx,
      );
    });
  }

  private async lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
    return tx.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
      select: {
        id: true,
        code: true,
        tenantId: true,
        vehicleId: true,
        status: true,
        pickupAt: true,
        returnAt: true,
      },
    });
  }
}
