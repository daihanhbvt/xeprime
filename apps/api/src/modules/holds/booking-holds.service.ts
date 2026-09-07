import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  FEE_BEARER,
  FEE_BENEFICIARY,
  FEE_LINE,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PRICE_ROW,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_OPEN,
  holdExpiresAt,
  holdFreeCancelUntil,
  isHoldPastDue,
  maskAccountNumber,
  type AuditActorScope,
  type BookingPriceSnapshot,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { newReferenceCode } from '../../common/reference-code';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BookingsService } from '../bookings/bookings.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { NotificationService } from '../notification/notification.service';
import { HoldSettlementService } from './hold-settlement.service';
import {
  CustomerHoldDto,
  DailyReconciliationDto,
  HOLD_DEFAULT_LIMIT,
  HOLD_MAX_LIMIT,
  PlatformHoldDto,
  PlatformHoldListQueryDto,
  PlatformHoldRefundDto,
  PlatformHoldRefundListQueryDto,
} from './dto/hold.dto';

/** Lịch đã chốt lúc duyệt — snapshot lên hold để lúc tiền về tạo đơn bằng đúng con số này. */
export interface HoldSchedule {
  pickupAt: Date;
  returnAt: Date;
  packageMonths: number | null;
}

export type HoldPaymentOutcome =
  | { outcome: 'hold_not_found' }
  | { outcome: 'hold_closed'; holdId: string; tenantId: string; status: string }
  | { outcome: 'partial'; holdId: string; tenantId: string; paid: string; amount: string }
  | { outcome: 'already_paid'; holdId: string; tenantId: string }
  | { outcome: 'activated'; holdId: string; tenantId: string; bookingId: string };

const CUSTOMER_SELECT = {
  id: true,
  code: true,
  status: true,
  outcome: true,
  amount: true,
  paidAmount: true,
  expiresAt: true,
  freeCancelUntil: true,
  paidAt: true,
  allocationJson: true,
  refund: {
    select: {
      id: true,
      status: true,
      reason: true,
      amount: true,
      bankAccountNumber: true,
      paidAt: true,
      bankReference: true,
    },
  },
} satisfies Prisma.BookingHoldSelect;

const PLATFORM_SELECT = {
  id: true,
  code: true,
  tenantId: true,
  bookingRequestId: true,
  bookingId: true,
  status: true,
  outcome: true,
  amount: true,
  paidAmount: true,
  expiresAt: true,
  freeCancelUntil: true,
  paidAt: true,
  releasedAt: true,
  createdAt: true,
  tenant: { select: { name: true } },
  vehicle: { select: { name: true } },
  bookingRequest: { select: { customerName: true } },
  booking: { select: { code: true } },
  refund: { select: { status: true } },
} satisfies Prisma.BookingHoldSelect;

/**
 * Khoản GIỮ CHỖ của tuyến hoa hồng — writer DUY NHẤT của `booking_holds` (R3, ADR 0028 điều 6–7).
 *
 * Vòng đời, và ai ghi bước nào:
 *
 *   duyệt yêu cầu ──► `createForApprovedRequestWithinTx`  (BookingRequestsService gọi)
 *        │               tạo hold `pending`, CHIẾM LỊCH (occupancy `booking_request`), báo khách
 *        ├─ tiền về ──► `applyBankPaymentWithinTx`         (SepayService / khớp tay gọi)
 *        │               thiếu → `underpaid` giữ mã; đủ → `paid` + TẠO ĐƠN cùng transaction
 *        ├─ khách huỷ ► `cancelForRequestWithinTx`         (CustomerTripsService gọi)
 *        └─ quá hạn ──► worker `booking-hold-expiry`        (SQL trần, cùng luật `isHoldPastDue`)
 *   đơn đổi trạng thái ──► `HoldSettlementService`          (kết cục + hoàn)
 *
 * Ba điều đóng đinh:
 *  1. **Không thu % trên báo giá tạm tính.** Hold chỉ sinh khi `snapshot.fees.holdAmount` khác
 *     null — `computeCustomerFees` đã trả null cho `estimateNote`. Không có đường vòng.
 *  2. **Đơn tạo lúc TIỀN VỀ, không phải lúc duyệt** — và tạo từ snapshot đã đóng băng trên hold,
 *     không tính lại theo policy mới (ADR 0024). Nhả lịch của yêu cầu rồi mới đặt lịch của đơn
 *     trong CÙNG transaction: `EXCLUDE USING gist` không cho hai khoảng của cùng xe chồng nhau.
 *  3. **Idempotent bằng điều kiện trong WHERE**, không bằng check đọc-rồi-ghi — đúng khuôn
 *     `BillingService.applyBankPaymentWithinTx` mà webhook đã kiểm chứng.
 */
@Injectable()
export class BookingHoldsService {
  private readonly logger = new Logger(BookingHoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly occupancy: OccupancyService,
    private readonly settlement: HoldSettlementService,
    /** Chỉ để đọc tài khoản nhận tiền của nền tảng — một nguồn với màn mua gói. */
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Tạo ──────────────────────────────────────────────────────────────────

  async createForApprovedRequestWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      requestId: string;
      vehicleId: string;
      vehicleName: string;
      customerUserId: string | null;
      schedule: HoldSchedule;
      snapshot: BookingPriceSnapshot;
      actorUserId: string;
    },
  ): Promise<{ id: string; code: string; amount: string; expiresAt: Date }> {
    const fees = input.snapshot.fees;
    if (!fees?.holdAmount) {
      // Bảo vệ lập trình: caller phải quyết định nhánh hold/không-hold TRƯỚC khi gọi vào đây.
      throw new Error('createForApprovedRequestWithinTx: snapshot không có holdAmount');
    }

    const now = new Date();
    const windowEnd = holdExpiresAt(now, fees.policy.holdPaymentWindowMinutes);
    /*
     * Hạn chuyển KHÔNG được vượt quá giờ nhận xe: một hold còn "chờ tiền" sau khi xe đáng lẽ đã
     * giao là một chỗ bị khoá vô nghĩa. Kẹp về giờ nhận; nếu giờ nhận đã quá sát (dưới 15 phút)
     * thì không kịp cho khách chuyển — chủ xe phải liên hệ thẳng khách hoặc từ chối.
     */
    const expiresAt = new Date(Math.min(windowEnd.getTime(), input.schedule.pickupAt.getTime()));
    if (expiresAt.getTime() - now.getTime() < 15 * 60_000) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message:
          'Giờ nhận xe quá gần để khách kịp chuyển khoản giữ chỗ — liên hệ khách hoặc từ chối yêu cầu',
        details: { pickupAt: input.schedule.pickupAt.toISOString() },
      });
    }
    const freeCancelUntil = holdFreeCancelUntil(
      input.schedule.pickupAt,
      fees.policy.freeCancelHours,
    );

    const serviceFee = fees.lines.find((l) => l.key === FEE_LINE.SERVICE_FEE);
    const allocation = [
      {
        key: FEE_LINE.SERVICE_FEE,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        // Toàn bộ khoản giữ chỗ là phí dịch vụ (R3). Phần chênh do SÀN (nếu có) vẫn là tiền
        // XePrime — ghi rõ ở đây để đối soát không phải suy.
        amount: fees.holdAmount,
        ...(serviceFee && serviceFee.amount !== fees.holdAmount
          ? { computedFee: serviceFee.amount }
          : {}),
      },
    ];

    const id = newId();
    const code = await this.uniqueCode(tx);
    await tx.bookingHold.create({
      data: {
        id,
        code,
        tenantId: input.tenantId,
        bookingRequestId: input.requestId,
        customerUserId: input.customerUserId,
        vehicleId: input.vehicleId,
        purpose: BOOKING_HOLD_PURPOSE.COMMISSION,
        status: BOOKING_HOLD_STATUS.PENDING,
        amount: new Prisma.Decimal(fees.holdAmount),
        feePolicyId: fees.policy.policyId,
        allocationJson: allocation as unknown as Prisma.InputJsonValue,
        priceSnapshotJson: input.snapshot as unknown as Prisma.InputJsonValue,
        scheduleJson: {
          pickupAt: input.schedule.pickupAt.toISOString(),
          returnAt: input.schedule.returnAt.toISOString(),
          packageMonths: input.schedule.packageMonths,
        } as Prisma.InputJsonValue,
        freeCancelUntil,
        expiresAt,
      },
    });

    // CHIẾM LỊCH ngay từ lúc duyệt — nếu không, hai khách cùng được duyệt một chỗ và nền tảng
    // phải hoàn một người. Constraint DB là người gác; trùng thì ném 409 và cả lượt duyệt hỏng.
    await this.occupancy.reserve(tx, {
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
      sourceId: input.requestId,
      startAt: input.schedule.pickupAt,
      endAt: input.schedule.returnAt,
    });

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: 'booking_hold.create',
        targetType: 'booking_hold',
        targetId: id,
        after: {
          code,
          amount: fees.holdAmount,
          policyVersion: fees.policy.version,
          expiresAt: expiresAt.toISOString(),
          freeCancelUntil: freeCancelUntil.toISOString(),
        },
      },
      tx,
    );

    if (input.customerUserId) {
      await this.notifications.emitToUser(
        input.customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_REQUESTED,
          title: 'Chủ xe đã duyệt — chuyển khoản giữ chỗ để chốt chuyến',
          body: `${input.vehicleName} · giữ chỗ ${Number(fees.holdAmount).toLocaleString('vi-VN')}đ · nội dung ${code}`,
          tenantId: input.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: input.requestId,
        },
        tx,
      );
    }

    return { id, code, amount: fees.holdAmount, expiresAt };
  }

  // ── Tiền về ──────────────────────────────────────────────────────────────

  /**
   * Áp một khoản tiền ngân hàng vào hold theo mã `XPH…` — TRONG cùng transaction với dòng
   * `bank_transactions` (ADR 0022 điều 2). Cùng khuôn với `BillingService.applyBankPaymentWithinTx`.
   *
   * Hold đã QUÁ HẠN (theo mốc, không theo cột status — worker có thể chưa kịp lật) không nhận
   * tiền: trả `hold_closed` để giao dịch nằm lại hàng đợi admin. Kích hoạt một hold đã chết là
   * đặt xe vào một chỗ khách khác có thể đã lấy.
   */
  async applyBankPaymentWithinTx(
    tx: Prisma.TransactionClient,
    args: { code: string; amount: Prisma.Decimal; providerTxId: string },
  ): Promise<HoldPaymentOutcome> {
    const hold = await tx.bookingHold.findUnique({
      where: { code: args.code.toUpperCase() },
      select: {
        id: true,
        tenantId: true,
        status: true,
        amount: true,
        expiresAt: true,
        customerUserId: true,
      },
    });
    if (!hold) return { outcome: 'hold_not_found' };

    const awaiting: string[] = [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID];

    if (
      hold.status === BOOKING_HOLD_STATUS.PAID ||
      hold.status === BOOKING_HOLD_STATUS.RELEASED
    ) {
      // Tiền về lần nữa cho hold đã đủ: ghi làm bằng chứng + ghi yêu cầu hoàn phần thừa
      // (ADR 0022 điều 5 — giữ chỗ không có "kỳ sau").
      await tx.bookingHold.update({
        where: { id: hold.id },
        data: { paidAmount: { increment: args.amount } },
      });
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: hold.tenantId,
        customerUserId: hold.customerUserId,
        amount: args.amount,
        reason: HOLD_REFUND_REASON.OVERPAID,
        note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
      });
      return { outcome: 'already_paid', holdId: hold.id, tenantId: hold.tenantId };
    }
    if (!awaiting.includes(hold.status) || isHoldPastDue(hold.expiresAt)) {
      return { outcome: 'hold_closed', holdId: hold.id, tenantId: hold.tenantId, status: hold.status };
    }

    const credited = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: { in: awaiting } },
      data: { paidAmount: { increment: args.amount } },
    });
    if (credited.count === 0) {
      /*
       * Trạng thái vừa lật GIỮA `findUnique` và `increment` — hai giao dịch đủ tiền chạy song
       * song, hoặc worker vừa expire. `count = 0` nghĩa là tiền CHƯA được cộng vào đâu.
       *
       * Nhánh này từng trả thẳng `hold_closed`, và đó là một lỗ mất tiền: giao dịch vẫn nằm
       * trong `bank_transactions` (webhook đã ghi) nhưng hold không ghi nhận và không có yêu
       * cầu hoàn nào — đúng loại "bút toán mồ côi" mà gate R3 cấm. Hold đã trả đủ thì khoản này
       * là tiền THỪA, phải đi cùng đường với nhánh `PAID` ở trên.
       */
      const current = await tx.bookingHold.findUniqueOrThrow({
        where: { id: hold.id },
        select: { status: true },
      });
      if (
        current.status === BOOKING_HOLD_STATUS.PAID ||
        current.status === BOOKING_HOLD_STATUS.RELEASED
      ) {
        await tx.bookingHold.update({
          where: { id: hold.id },
          data: { paidAmount: { increment: args.amount } },
        });
        await this.settlement.upsertRefundWithinTx(tx, {
          holdId: hold.id,
          tenantId: hold.tenantId,
          customerUserId: hold.customerUserId,
          amount: args.amount,
          reason: HOLD_REFUND_REASON.OVERPAID,
          note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
        });
        return { outcome: 'already_paid', holdId: hold.id, tenantId: hold.tenantId };
      }
      return { outcome: 'hold_closed', holdId: hold.id, tenantId: hold.tenantId, status: current.status };
    }
    const updated = await tx.bookingHold.findUniqueOrThrow({
      where: { id: hold.id },
      select: { paidAmount: true, amount: true },
    });

    if (updated.paidAmount.lt(updated.amount)) {
      await tx.bookingHold.updateMany({
        where: { id: hold.id, status: BOOKING_HOLD_STATUS.PENDING },
        data: { status: BOOKING_HOLD_STATUS.UNDERPAID },
      });
      return {
        outcome: 'partial',
        holdId: hold.id,
        tenantId: hold.tenantId,
        paid: updated.paidAmount.toString(),
        amount: updated.amount.toString(),
      };
    }

    const claimed = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: { in: awaiting } },
      data: { status: BOOKING_HOLD_STATUS.PAID, paidAt: new Date() },
    });
    if (claimed.count === 0) {
      return { outcome: 'already_paid', holdId: hold.id, tenantId: hold.tenantId };
    }

    if (updated.paidAmount.gt(updated.amount)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: hold.tenantId,
        customerUserId: hold.customerUserId,
        amount: updated.paidAmount.sub(updated.amount),
        reason: HOLD_REFUND_REASON.OVERPAID,
        note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
      });
    }

    const bookingId = await this.convertWithinTx(tx, hold.id, args.providerTxId);
    return { outcome: 'activated', holdId: hold.id, tenantId: hold.tenantId, bookingId };
  }

  /**
   * Tiền đủ ⇒ ĐƠN THUÊ. Tạo từ snapshot đã đóng băng trên hold; lịch của yêu cầu nhả ra rồi lịch
   * của đơn đặt vào — cùng transaction, nên không có khoảng nào chỗ bị hở.
   */
  private async convertWithinTx(
    tx: Prisma.TransactionClient,
    holdId: string,
    providerTxId: string,
  ): Promise<string> {
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { id: holdId },
      select: {
        id: true,
        code: true,
        tenantId: true,
        bookingRequestId: true,
        customerUserId: true,
        priceSnapshotJson: true,
        scheduleJson: true,
        paidAmount: true,
        bookingRequest: {
          select: {
            id: true,
            status: true,
            vehicleId: true,
            customerName: true,
            customerPhone: true,
            serviceType: true,
            routeType: true,
            pickupAddress: true,
            destination: true,
            tenantCustomerId: true,
            decidedBy: true,
            vehicle: { select: { name: true } },
          },
        },
      },
    });
    const req = hold.bookingRequest;
    const snapshot = hold.priceSnapshotJson as unknown as BookingPriceSnapshot;
    const schedule = hold.scheduleJson as unknown as {
      pickupAt: string;
      returnAt: string;
      packageMonths: number | null;
    };

    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, req.id);

    // Người "tạo" đơn là người đã DUYỆT — quyết định của họ sinh ra đơn này; khách chỉ chuyển tiền.
    const creator = req.decidedBy ?? hold.customerUserId;
    if (!creator) throw new Error(`Hold ${holdId}: không xác định được người tạo đơn`);

    const booking = await this.bookings.createWithinTx(
      tx,
      hold.tenantId,
      creator,
      {
        vehicleId: req.vehicleId,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        pickupAt: schedule.pickupAt,
        returnAt: schedule.returnAt,
        longTermPackageMonths: schedule.packageMonths ?? undefined,
        serviceType: req.serviceType,
        routeType: req.routeType ?? undefined,
        pickupAddress: req.pickupAddress ?? undefined,
        destination: req.destination ?? undefined,
        baseAmount: rowAmount(snapshot, PRICE_ROW.BASE),
        discountAmount: rowAmountAbs(snapshot, PRICE_ROW.DISCOUNT),
        deliveryFee: rowAmount(snapshot, PRICE_ROW.DELIVERY),
        depositAmount: snapshot.depositAmount,
      },
      'from_request',
      snapshot,
      req.tenantCustomerId,
    );

    const claimed = await tx.bookingRequest.updateMany({
      where: { id: req.id, tenantId: hold.tenantId, status: BOOKING_REQUEST_STATUS.AWAITING_HOLD },
      data: { status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, bookingId: booking.id },
    });
    if (claimed.count === 0) {
      // Yêu cầu đã rời `awaiting_hold` (khách huỷ đúng lúc tiền về) — quay đầu cả transaction:
      // đơn vừa tạo biến mất, tiền vẫn nằm ở bank_transactions cho admin xử lý.
      throw new Error(`Yêu cầu ${req.id} không còn chờ giữ chỗ khi tiền về`);
    }
    await tx.bookingHold.update({ where: { id: holdId }, data: { bookingId: booking.id } });

    await this.audit.record(
      {
        tenantId: hold.tenantId,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_hold.paid',
        targetType: 'booking_hold',
        targetId: holdId,
        after: {
          code: hold.code,
          paidAmount: hold.paidAmount.toString(),
          bookingId: booking.id,
          bookingCode: booking.code,
          providerTxId,
        },
      },
      tx,
    );

    await this.notifications.emitToTenantMembers(
      hold.tenantId,
      {
        type: NOTIFICATION_TYPE.HOLD_PAID,
        title: `Khách đã giữ chỗ — đơn ${booking.code} đã tạo`,
        body: `${req.vehicle.name} · ${req.customerName}`,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: booking.id,
      },
      tx,
    );
    if (hold.customerUserId) {
      await this.notifications.emitToUser(
        hold.customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_PAID,
          title: 'Đã giữ chỗ thành công',
          body: `${req.vehicle.name} · đơn ${booking.code}. Phần tiền thuê còn lại trả trực tiếp chủ xe khi nhận xe.`,
          tenantId: hold.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
    }
    return booking.id;
  }

  // ── Khách huỷ khi đang chờ tiền ──────────────────────────────────────────

  /** Yêu cầu `awaiting_hold` bị huỷ (khách) — hold `cancelled`, nhả lịch. Không có gì để hoàn. */
  async cancelForRequestWithinTx(
    tx: Prisma.TransactionClient,
    input: { requestId: string; tenantId: string; actorUserId: string; actorScope: AuditActorScope },
  ): Promise<void> {
    const claimed = await tx.bookingHold.updateMany({
      where: {
        bookingRequestId: input.requestId,
        tenantId: input.tenantId,
        status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      },
      data: { status: BOOKING_HOLD_STATUS.CANCELLED, releasedAt: new Date() },
    });
    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, input.requestId);
    if (claimed.count === 0) return;

    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: input.requestId },
      select: { id: true, code: true, paidAmount: true, customerUserId: true },
    });
    // Đã chuyển THIẾU rồi huỷ — phần đã chuyển vẫn là tiền của khách, ghi yêu cầu hoàn.
    if (hold.paidAmount.gt(0)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: input.tenantId,
        customerUserId: hold.customerUserId,
        amount: hold.paidAmount,
        reason: HOLD_REFUND_REASON.EARLY_CANCEL,
        note: 'Huỷ khi đang chờ chuyển giữ chỗ (đã chuyển một phần)',
      });
    }
    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorScope,
        action: 'booking_hold.cancel',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: { code: hold.code, paidAmount: hold.paidAmount.toString() },
      },
      tx,
    );
  }

  // ── Đọc: khách ───────────────────────────────────────────────────────────

  async findForTrip(requestId: string, customerUserId: string): Promise<CustomerHoldDto | null> {
    const row = await this.prisma.bookingHold.findFirst({
      where: { bookingRequestId: requestId, customerUserId },
      select: CUSTOMER_SELECT,
    });
    if (!row) return null;
    const remaining = Prisma.Decimal.max(0, row.amount.sub(row.paidAmount));
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      outcome: row.outcome,
      amount: row.amount.toFixed(0),
      paidAmount: row.paidAmount.toFixed(0),
      remainingAmount: remaining.toFixed(0),
      expiresAt: row.expiresAt.toISOString(),
      freeCancelUntil: row.freeCancelUntil.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      allocation: (row.allocationJson as unknown as CustomerHoldDto['allocation']) ?? [],
      paymentInfo: this.billing.paymentInfo(),
      refund: row.refund
        ? {
            id: row.refund.id,
            status: row.refund.status,
            reason: row.refund.reason,
            amount: row.refund.amount.toFixed(0),
            hasAccount: Boolean(row.refund.bankAccountNumber),
            accountHint: maskAccountNumber(row.refund.bankAccountNumber),
            paidAt: row.refund.paidAt?.toISOString() ?? null,
            bankReference: row.refund.bankReference,
          }
        : null,
    };
  }

  // ── Đọc: admin (money operations) ────────────────────────────────────────

  async listForPlatform(
    query: PlatformHoldListQueryDto,
  ): Promise<{ data: PlatformHoldDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, HOLD_DEFAULT_LIMIT, HOLD_MAX_LIMIT);
    const where: Prisma.BookingHoldWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.unsettled === 'true' ? { status: BOOKING_HOLD_STATUS.PAID, outcome: null } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { bookingRequest: { customerName: { contains: query.q, mode: 'insensitive' } } },
              { tenant: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingHold.count({ where }),
      this.prisma.bookingHold.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: PLATFORM_SELECT,
      }),
    ]);
    const disputes = await this.openDisputeBookingIds(
      rows.map((r) => r.bookingId).filter((v): v is string => !!v),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        code: r.code,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        customerName: r.bookingRequest.customerName,
        vehicleName: r.vehicle.name,
        bookingRequestId: r.bookingRequestId,
        bookingId: r.bookingId,
        bookingCode: r.booking?.code ?? null,
        status: r.status,
        outcome: r.outcome,
        amount: r.amount.toFixed(0),
        paidAmount: r.paidAmount.toFixed(0),
        expiresAt: r.expiresAt.toISOString(),
        freeCancelUntil: r.freeCancelUntil.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
        releasedAt: r.releasedAt?.toISOString() ?? null,
        disputeOpen: r.bookingId ? disputes.has(r.bookingId) : false,
        refundStatus: r.refund?.status ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  async listRefundsForPlatform(
    query: PlatformHoldRefundListQueryDto,
  ): Promise<{ data: PlatformHoldRefundDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, HOLD_DEFAULT_LIMIT, HOLD_MAX_LIMIT);
    // Không lọc = VIỆC CẦN LÀM (chờ chuyển), không phải toàn bộ lịch sử.
    const where: Prisma.HoldRefundWhereInput = { status: query.status ?? HOLD_REFUND_STATUS.PENDING };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.holdRefund.count({ where }),
      this.prisma.holdRefund.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          holdId: true,
          amount: true,
          status: true,
          reason: true,
          bankCode: true,
          bankAccountNumber: true,
          bankAccountName: true,
          paidAt: true,
          bankReference: true,
          note: true,
          createdAt: true,
          hold: {
            select: {
              code: true,
              tenant: { select: { name: true } },
              bookingRequest: { select: { customerName: true } },
            },
          },
          payer: { select: { displayName: true } },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        holdId: r.holdId,
        holdCode: r.hold.code,
        tenantName: r.hold.tenant.name,
        customerName: r.hold.bookingRequest.customerName,
        amount: r.amount.toFixed(0),
        status: r.status,
        reason: r.reason,
        bankCode: r.bankCode,
        bankAccountNumber: r.bankAccountNumber,
        bankAccountName: r.bankAccountName,
        paidByName: r.payer?.displayName ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        bankReference: r.bankReference,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Đối chiếu MỘT NGÀY theo giờ Việt Nam. Toàn bộ là phép cộng trên sổ đã có — không denormalize
   * cột nào, tính lúc đọc (đúng doctrine "tránh drift" của tài chính gian hàng).
   *
   * `bankIn` gom theo `bank_time` (giờ ngân hàng), rơi về `created_at` khi SePay không gửi giờ.
   */
  async dailyReconciliation(date: string): Promise<DailyReconciliationDto> {
    const { start, end } = vnDayRange(date);
    const inWindow = Prisma.sql`COALESCE(bank_time, created_at) >= ${start} AND COALESCE(bank_time, created_at) < ${end}`;

    const [bank] = await this.prisma.$queryRaw<
      Array<{
        total: Prisma.Decimal;
        count: bigint;
        subs: Prisma.Decimal;
        holds: Prisma.Decimal;
        unmatched: Prisma.Decimal;
        unmatchedCount: bigint;
        ignored: Prisma.Decimal;
      }>
    >`
      SELECT
        COALESCE(SUM(amount_in), 0) AS total,
        COUNT(*) AS count,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status IN ('matched','manual') AND matched_type = ${BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE}), 0) AS subs,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status IN ('matched','manual') AND matched_type = ${BANK_MATCH_TARGET_TYPE.BOOKING_HOLD}), 0) AS holds,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.UNMATCHED}), 0) AS unmatched,
        COUNT(*) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.UNMATCHED}) AS "unmatchedCount",
        COALESCE(SUM(amount_in) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.IGNORED}), 0) AS ignored
      FROM bank_transactions
      WHERE ${inWindow}
    `;

    const [refundsPaid, refundsPending, unsettled] = await Promise.all([
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PAID, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PENDING },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.bookingHold.aggregate({
        where: { status: BOOKING_HOLD_STATUS.PAID, outcome: null },
        _sum: { paidAmount: true },
        _count: { _all: true },
      }),
    ]);

    const b = bank ?? {
      total: new Prisma.Decimal(0),
      count: 0n,
      subs: new Prisma.Decimal(0),
      holds: new Prisma.Decimal(0),
      unmatched: new Prisma.Decimal(0),
      unmatchedCount: 0n,
      ignored: new Prisma.Decimal(0),
    };
    const variance = new Prisma.Decimal(b.total)
      .sub(b.subs)
      .sub(b.holds)
      .sub(b.unmatched)
      .sub(b.ignored);

    return {
      date,
      bankIn: new Prisma.Decimal(b.total).toFixed(0),
      bankInCount: Number(b.count),
      matchedSubscriptions: new Prisma.Decimal(b.subs).toFixed(0),
      matchedHolds: new Prisma.Decimal(b.holds).toFixed(0),
      unmatched: new Prisma.Decimal(b.unmatched).toFixed(0),
      unmatchedCount: Number(b.unmatchedCount),
      ignored: new Prisma.Decimal(b.ignored).toFixed(0),
      refundsPaid: (refundsPaid._sum.amount ?? new Prisma.Decimal(0)).toFixed(0),
      refundsPaidCount: refundsPaid._count._all,
      refundsPending: (refundsPending._sum.amount ?? new Prisma.Decimal(0)).toFixed(0),
      refundsPendingCount: refundsPending._count._all,
      holdsUnsettled: (unsettled._sum.paidAmount ?? new Prisma.Decimal(0)).toFixed(0),
      holdsUnsettledCount: unsettled._count._all,
      variance: variance.toFixed(0),
    };
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async uniqueCode(tx: Prisma.TransactionClient): Promise<string> {
    // 32^8 tổ hợp — đụng gần như không xảy ra; vòng lặp chỉ là dây an toàn (cùng khuôn hoá đơn gói).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newReferenceCode(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
      const [hold, invoice] = await Promise.all([
        tx.bookingHold.findUnique({ where: { code }, select: { id: true } }),
        // Cùng KHÔNG GIAN TÊN với mã hoá đơn gói (ADR 0022 điều 3) — tiền tố đã khác nhau, nhưng
        // kiểm cả hai để không ai phải nhớ điều đó.
        tx.subscriptionInvoice.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!hold && !invoice) return code;
    }
    throw new Error('Không sinh được mã giữ chỗ duy nhất sau 5 lần');
  }

  private async openDisputeBookingIds(bookingIds: string[]): Promise<Set<string>> {
    if (bookingIds.length === 0) return new Set();
    const rows = await this.prisma.supportCase.findMany({
      where: {
        bookingId: { in: bookingIds },
        category: SUPPORT_CASE_CATEGORY.DISPUTE,
        status: { in: [...SUPPORT_CASE_STATUS_OPEN] },
      },
      select: { bookingId: true },
    });
    return new Set(rows.map((r) => r.bookingId).filter((v): v is string => !!v));
  }
}

function rowAmount(snapshot: BookingPriceSnapshot, key: string): string {
  return snapshot.rows.find((r) => r.key === key)?.amount ?? '0';
}

function rowAmountAbs(snapshot: BookingPriceSnapshot, key: string): string {
  return new Prisma.Decimal(rowAmount(snapshot, key)).abs().toString();
}

/** Ranh giới ngày theo giờ Việt Nam (UTC+7, không DST) → hai mốc UTC. */
function vnDayRange(date: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'date phải có dạng YYYY-MM-DD',
    });
  }
  const start = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'date không hợp lệ',
    });
  }
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
