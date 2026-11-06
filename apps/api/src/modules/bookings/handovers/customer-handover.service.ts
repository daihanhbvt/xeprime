import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toAppTz } from '@xeprime/domain';
import { createSupportCaseWithinTx, openSupportCaseWhere, type Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS,
  CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS,
  customerCanReportReturn,
  customerPickupConfirmState,
  customerReturnAutoCompleteAt,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_OPEN_REASON,
  SUPPORT_CASE_PRIORITY,
  SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
  SUPPORT_PARTY,
  type BookingStatus,
} from '@xeprime/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { HandoversService } from './handovers.service';

/** Trần số đơn tự hoàn thành mỗi vòng quét — một vòng không được biến thành một job hàng giờ. */
const AUTO_COMPLETE_BATCH = 50;

const timeOf = (at: Date) => toAppTz(at).format('HH:mm');
const pointOf = (at: Date) => toAppTz(at).format('HH:mm DD/MM');

/** Những gì mọi lượt dưới đây đọc về đơn SAU khi đã khoá dòng. */
const LOCKED_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  status: true,
  serviceType: true,
  vehicleId: true,
  pickupAt: true,
  customerReturnedAt: true,
  returnAutoCompleteAt: true,
  deletedAt: true,
  vehicle: { select: { name: true } },
  bookingRequest: { select: { id: true, customerUserId: true } },
  handovers: {
    where: { status: HANDOVER_STATUS.CONFIRMED },
    select: { type: true },
  },
} satisfies Prisma.BookingSelect;

type LockedBooking = Prisma.BookingGetPayload<{ select: typeof LOCKED_SELECT }>;

/**
 * Lời của KHÁCH ở mốc giao/trả xe — ADR 0081. Mục đích duy nhất: không chuyến nào kẹt ở "Chờ giao
 * xe" hay "Đang thuê" chỉ vì gian hàng quên bấm.
 *
 *  - **"Đã nhận xe"** ⇒ biên bản giao xe nguồn `customer`, đơn sang `active` NGAY. Khách không có lý
 *    do khai sai: khai sai chỉ làm chuyến của chính họ bắt đầu sớm.
 *  - **"Đã trả xe"** ⇒ ghi lời báo + hạn `CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS`, KHÔNG đổi trạng thái.
 *    Chủ xe xác nhận biên bản nhận xe như thường, hoặc bấm "Khách chưa trả xe" (mở tranh chấp khẩn,
 *    xoá lời báo). Quá hạn mà vẫn im lặng ⇒ `completeDueReturns` tự lập biên bản nguồn `auto`.
 *
 * Mọi đường ghi biên bản / trạng thái đơn đi qua `HandoversService.confirmOnCustomerWordWithinTx` —
 * cùng chuỗi hệ quả với quầy gian hàng, không có writer thứ hai. Mỗi lượt khoá dòng đơn
 * (`FOR UPDATE`) TRƯỚC khi kiểm điều kiện, trong cùng transaction với lượt ghi.
 *
 * Chỉ tự lái + dài hạn (`customerCanConfirmHandoverFor`): chuyến có tài xế không có lượt khách
 * cầm chìa khoá.
 */
@Injectable()
export class CustomerHandoverService {
  private readonly logger = new Logger(CustomerHandoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly handovers: HandoversService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  // ── Khách ──────────────────────────────────────────────────────────────────

  /** Khách bấm "Đã nhận xe". `tripId` là mã yêu cầu hoặc mã đơn (trang chuyến dùng cả hai). */
  async confirmPickup(customerUserId: string, tripId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockOwnTrip(tx, customerUserId, tripId);
      // `now` đọc SAU khoá — lượt chờ khoá có thể đã đẩy giờ bấm qua một mốc.
      const now = new Date();
      const state = booking
        ? customerPickupConfirmState({
            status: booking.status,
            serviceType: booking.serviceType,
            pickupAt: booking.pickupAt,
            pickupConfirmed: booking.handovers.some((h) => h.type === HANDOVER_TYPE.PICKUP),
            now,
          })
        : { allowed: false, opensAt: null };
      if (!booking || !state.allowed) {
        throw new ConflictException(
          state.opensAt
            ? {
                code: API_ERROR_CODE.TRIP_PICKUP_CONFIRM_TOO_EARLY,
                message: 'Chưa tới giờ nhận xe',
                details: { opensAt: state.opensAt.toISOString() },
              }
            : {
                code: API_ERROR_CODE.TRIP_PICKUP_CONFIRM_NOT_ALLOWED,
                message: 'Chuyến này không xác nhận nhận xe được',
              },
        );
      }

      const done = await this.handovers.confirmOnCustomerWordWithinTx(tx, {
        tenantId: booking.tenantId,
        booking: {
          id: booking.id,
          code: booking.code,
          vehicleId: booking.vehicleId,
          status: booking.status as BookingStatus,
        },
        type: HANDOVER_TYPE.PICKUP,
        customerUserId,
        source: HANDOVER_CONFIRM_SOURCE.CUSTOMER,
        occurredAt: now,
      });
      if (!done) return;

      await this.notifications.emitToTenantMembers(
        booking.tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Khách đã nhận xe: chuyến ${booking.code}`,
          body:
            `${booking.vehicle.name} · khách xác nhận lúc ${timeOf(now)}, đơn chuyển sang Đang thuê. ` +
            'Bổ sung KM giao ở biên bản nếu cần.',
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
    });
  }

  /** Khách bấm "Đã trả xe" — ghi lời báo + hạn chủ xe xác nhận, KHÔNG đổi trạng thái đơn. */
  async reportReturn(customerUserId: string, tripId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockOwnTrip(tx, customerUserId, tripId);
      const allowed =
        booking !== null &&
        customerCanReportReturn({
          status: booking.status,
          serviceType: booking.serviceType,
          returnConfirmed: booking.handovers.some((h) => h.type === HANDOVER_TYPE.RETURN),
          customerReturnedAt: booking.customerReturnedAt,
        });
      if (!booking || !allowed) {
        throw new ConflictException({
          code: API_ERROR_CODE.TRIP_RETURN_REPORT_NOT_ALLOWED,
          message: 'Chuyến này không báo trả xe được',
        });
      }

      const now = new Date();
      const deadline = customerReturnAutoCompleteAt(now);
      await tx.booking.updateMany({
        where: { id: booking.id, status: BOOKING_STATUS.ACTIVE, customerReturnedAt: null },
        data: { customerReturnedAt: now, returnAutoCompleteAt: deadline },
      });
      await this.audit.record(
        {
          tenantId: booking.tenantId,
          actorUserId: customerUserId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: 'booking.customer_return.report',
          targetType: AUDIT_TARGET_TYPE.BOOKING,
          targetId: booking.id,
          after: {
            customerReturnedAt: now.toISOString(),
            returnAutoCompleteAt: deadline.toISOString(),
          },
        },
        tx,
      );
      await this.notifications.emitToTenantMembers(
        booking.tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Khách báo đã trả xe: chuyến ${booking.code}`,
          body:
            `${booking.vehicle.name} · lúc ${timeOf(now)}. Xác nhận biên bản nhận xe trước ` +
            `${pointOf(deadline)}; quá hạn chuyến tự hoàn thành. Chưa nhận lại xe thì bấm ` +
            '"Khách chưa trả xe" trên đơn.',
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
    });
  }

  // ── Gian hàng ──────────────────────────────────────────────────────────────

  /**
   * Gian hàng báo "Khách chưa trả xe" — phản đối lời báo trả xe đang chờ. Xoá lời báo (chuyến không
   * tự hoàn thành nữa) và mở MỘT tranh chấp khẩn cho CSKH xác minh; tranh chấp mở vốn đã giữ quyết
   * toán (`SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES`). Báo khách.
   */
  async rejectReturnReport(tenantId: string, bookingId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, bookingId);
      if (!booking || booking.tenantId !== tenantId || booking.deletedAt) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy đơn thuê',
        });
      }
      if (
        booking.status !== BOOKING_STATUS.ACTIVE ||
        booking.customerReturnedAt === null ||
        booking.handovers.some((h) => h.type === HANDOVER_TYPE.RETURN)
      ) {
        throw new ConflictException({
          code: API_ERROR_CODE.BOOKING_RETURN_REPORT_NOT_PENDING,
          message: 'Không còn lời báo trả xe nào đang chờ',
        });
      }
      const reportedAt = booking.customerReturnedAt;

      await tx.booking.update({
        where: { id: booking.id },
        data: { customerReturnedAt: null, returnAutoCompleteAt: null },
      });
      const created = await createSupportCaseWithinTx(tx, {
        tenantId,
        bookingId: booking.id,
        bookingRequestId: booking.bookingRequest?.id ?? null,
        openedByUserId: userId,
        openedByScope: SUPPORT_PARTY.TENANT,
        category: SUPPORT_CASE_CATEGORY.DISPUTE,
        priority: SUPPORT_CASE_PRIORITY.URGENT,
        subject: `Khách báo đã trả xe nhưng gian hàng chưa nhận lại — chuyến ${booking.code}`,
        description:
          `Khách báo đã trả xe lúc ${pointOf(reportedAt)}; gian hàng báo chưa nhận lại được xe. ` +
          'Liên hệ cả hai bên để xác minh. Tiền của chuyến được tạm giữ cho tới khi case đóng.',
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: SUPPORT_CASE_AUDIT_ACTION.OPEN,
          targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
          targetId: created.id,
          after: {
            code: created.code,
            category: SUPPORT_CASE_CATEGORY.DISPUTE,
            bookingId: booking.id,
            reason: SUPPORT_CASE_OPEN_REASON.RETURN_DISPUTED,
          },
        },
        tx,
      );
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'booking.customer_return.reject',
          targetType: AUDIT_TARGET_TYPE.BOOKING,
          targetId: booking.id,
          before: {
            customerReturnedAt: reportedAt.toISOString(),
            returnAutoCompleteAt: booking.returnAutoCompleteAt?.toISOString() ?? null,
          },
          after: { customerReturnedAt: null, supportCaseId: created.id },
        },
        tx,
      );

      const customerUserId = booking.bookingRequest?.customerUserId;
      if (customerUserId) {
        await this.notifications.emitToUser(
          customerUserId,
          {
            type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
            title: `Chủ xe chưa xác nhận nhận lại xe ${booking.vehicle.name}`,
            body:
              'XePrime sẽ liên hệ để xác minh. Nếu bạn đã trả xe, hãy giữ lại hình ảnh và tin nhắn ' +
              'làm bằng chứng.',
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          },
          tx,
        );
      }
    });
  }

  // ── Hệ thống ───────────────────────────────────────────────────────────────

  /**
   * Tự hoàn thành những chuyến khách đã báo trả xe mà chủ xe im lặng quá hạn — gọi từ
   * `CustomerReturnSweeper`. Bỏ qua chuyến đang có hồ sơ giữ quyết toán (tranh chấp,
   * `handover_unconfirmed`): việc đó chờ CSKH, không chờ đồng hồ. Trả số chuyến đã hoàn thành.
   *
   * Chạy nhiều tiến trình API cùng lúc vẫn an toàn: mỗi đơn khoá dòng rồi kiểm lại, và claim biên bản
   * (`status IN (draft, ready)`) chỉ một bên khớp.
   */
  async completeDueReturns(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: {
        status: BOOKING_STATUS.ACTIVE,
        deletedAt: null,
        returnAutoCompleteAt: { lte: now },
        handovers: { none: { type: HANDOVER_TYPE.RETURN, status: HANDOVER_STATUS.CONFIRMED } },
        supportCases: { none: openSupportCaseWhere(SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES) },
      },
      orderBy: { returnAutoCompleteAt: 'asc' },
      take: AUTO_COMPLETE_BATCH,
      select: { id: true },
    });

    let completed = 0;
    for (const { id } of due) {
      try {
        if (await this.completeOne(id, now)) completed += 1;
      } catch (err) {
        // Một đơn hỏng không chặn cả lô — transaction rollback, vòng sau thử lại.
        this.logger.error(`Tự hoàn thành chuyến ${id} lỗi`, err as Error);
      }
    }
    return completed;
  }

  private completeOne(bookingId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, bookingId);
      const customerUserId = booking?.bookingRequest?.customerUserId;
      if (
        !booking ||
        booking.deletedAt ||
        booking.status !== BOOKING_STATUS.ACTIVE ||
        !booking.customerReturnedAt ||
        !booking.returnAutoCompleteAt ||
        booking.returnAutoCompleteAt.getTime() > now.getTime() ||
        !customerUserId
      ) {
        return false;
      }
      const frozen = await tx.supportCase.findFirst({
        where: {
          bookingId: booking.id,
          ...openSupportCaseWhere(SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES),
        },
        select: { id: true },
      });
      if (frozen) return false;

      const reportedAt = booking.customerReturnedAt;
      const done = await this.handovers.confirmOnCustomerWordWithinTx(tx, {
        tenantId: booking.tenantId,
        booking: {
          id: booking.id,
          code: booking.code,
          vehicleId: booking.vehicleId,
          status: booking.status as BookingStatus,
        },
        type: HANDOVER_TYPE.RETURN,
        customerUserId,
        source: HANDOVER_CONFIRM_SOURCE.AUTO,
        // Mốc trả THỰC TẾ là lúc khách báo — không phải lúc đồng hồ hết hạn.
        occurredAt: reportedAt,
      });
      if (!done) return false;

      await this.notifications.emitToTenantMembers(
        booking.tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Chuyến ${booking.code} đã tự hoàn thành`,
          body:
            `${booking.vehicle.name} · khách báo trả xe lúc ${pointOf(reportedAt)} và gian hàng ` +
            `chưa xác nhận trong ${CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS} giờ. Bổ sung KM trả ở mục ` +
            '"Thiếu KM trả" nếu cần.',
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
      await this.notifications.emitToUser(
        customerUserId,
        {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Chuyến ${booking.vehicle.name} đã hoàn thành`,
          body: 'Chuyến được ghi nhận hoàn thành theo lời báo trả xe của bạn. Cảm ơn bạn!',
          tenantId: booking.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
      return true;
    });
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────────

  /**
   * Chuyến của CHÍNH khách (quyền sở hữu trong truy vấn) → khoá dòng đơn → đọc lại. `null` khi yêu cầu
   * chưa thành đơn; chuyến của người khác là 404 như mọi đường của trang chuyến.
   */
  private async lockOwnTrip(
    tx: Prisma.TransactionClient,
    customerUserId: string,
    tripId: string,
  ): Promise<LockedBooking | null> {
    const request = await tx.bookingRequest.findFirst({
      where: { customerUserId, OR: [{ id: tripId }, { bookingId: tripId }] },
      select: { bookingId: true },
    });
    if (!request) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy chuyến đi này',
      });
    }
    if (!request.bookingId) return null;
    const booking = await this.lockBooking(tx, request.bookingId);
    return booking && !booking.deletedAt ? booking : null;
  }

  private async lockBooking(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ): Promise<LockedBooking | null> {
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
    return tx.booking.findUnique({ where: { id: bookingId }, select: LOCKED_SELECT });
  }
}
