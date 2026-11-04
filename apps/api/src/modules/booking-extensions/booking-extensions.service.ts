import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  addCalendarMonthsVn,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_EXTENSION_STATUS,
  BOOKING_STATUS,
  HOLD_MIN_USABLE_WINDOW_MINUTES,
  holdWindowsFor,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  resolveRefundWalletOwner,
  SERVICE_TYPE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  type BookingStatus,
  type CustomerFeeBreakdown,
} from '@xeprime/types';
import { newReferenceCode } from '../../common/reference-code';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { BillingService } from '../billing/billing.service';
import { NotificationService } from '../notification/notification.service';
import { PricingService } from '../pricing/pricing.service';
import type { QuoteBreakdownDto } from '../pricing/dto/pricing.dto';
import type { EffectivePolicy } from '../pricing/pricing.service';
import { TaxService } from '../tax/tax.service';
import { WalletService } from '../wallet/wallet.service';
import type {
  BookingExtensionDto,
  BookingExtensionQuoteDto,
  CustomerBookingExtensionDto,
} from './dto/booking-extension.dto';

const EXTENSION_SELECT = {
  id: true,
  code: true,
  tenantId: true,
  bookingId: true,
  vehicleId: true,
  customerUserId: true,
  months: true,
  fromAt: true,
  toAt: true,
  status: true,
  rentalAmount: true,
  taxAmount: true,
  depositAmount: true,
  onlineAmount: true,
  payAtPickupAmount: true,
  paidAmount: true,
  feePolicyId: true,
  priceSnapshot: true,
  expiresAt: true,
  paidAt: true,
  activatedAt: true,
  closedAt: true,
  settledAt: true,
  createdAt: true,
} satisfies Prisma.BookingExtensionSelect;

type ExtensionRow = Prisma.BookingExtensionGetPayload<{ select: typeof EXTENSION_SELECT }>;

/** Đơn đủ để định giá + chiếm lịch một phụ lục — đọc SAU khi khoá dòng. */
interface ExtendableBooking {
  id: string;
  tenantId: string;
  vehicleId: string;
  code: string;
  status: string;
  serviceType: string;
  returnAt: Date;
  customerUserId: string | null;
  vehicle: { name: string; vehicleType: string; monthlyPrice: Prisma.Decimal | null };
}

interface ExtensionPricing {
  fromAt: Date;
  toAt: Date;
  breakdown: QuoteBreakdownDto;
  policy: EffectivePolicy | null;
  fees: CustomerFeeBreakdown;
}

export type ExtensionPaymentOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'closed'; extensionId: string; status: string }
  | { outcome: 'partial' | 'activated' | 'already_paid'; extensionId: string };

/**
 * PHỤ LỤC GIA HẠN đơn thuê dài hạn đang chạy — ADR 0077. Writer DUY NHẤT của
 * `booking_extensions`.
 *
 *   chủ xe bấm "Gia hạn" ─► `create`      chiếm lịch tới `to_at`, phát mã XPE…, báo khách
 *        ├─ tiền về đủ ──► `applyBankPaymentWithinTx` (SepayService) → `active`, dời giờ trả
 *        │                  của đơn, ghi nghĩa vụ thuế — CÙNG transaction đối soát
 *        ├─ chủ xe huỷ ──► `cancel`      nhả phần lịch, hoàn phần đã chuyển vào ví khách
 *        └─ quá hạn ─────► worker `booking-extension-expiry` (cùng luật, SQL trần)
 *   đơn kết thúc ─────► `onBookingClosedWithinTx` — đóng phụ lục còn chờ, ghi có ví chủ xe `D − T`
 *
 * Ba điều đóng đinh:
 *  1. **Miễn phí nền tảng** (điều 4): không `S`, không `H`, không bán bảo hiểm — nhưng đi qua ĐÚNG
 *     `PricingService.customerFeesFor` của đơn, nên thuế, phần giữ chỗ 15% và sàn đối soát không
 *     có bản công thức thứ hai.
 *  2. **Lịch là của chính đơn**: phụ lục kéo dài dòng occupancy `booking` của đơn chứ không thêm
 *     dòng mới — một dòng thứ hai đặt sát đuôi đơn sẽ đụng buffer chuẩn bị của chính đơn đó ở
 *     EXCLUDE (ADR 0006). Trùng lịch xe khác ⇒ 23P01 ⇒ 409 `BOOKING_SCHEDULE_CONFLICT`.
 *  3. **Hiệu lực khi tiền về ĐỦ** (tinh thần ADR 0044): không có nút "khách đã chuyển khoản".
 */
@Injectable()
export class BookingExtensionsService {
  private readonly logger = new Logger(BookingExtensionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    /** Writer DUY NHẤT của lịch xe (ADR 0006) — phụ lục chỉ dời đuôi dòng của chính đơn. */
    private readonly occupancy: OccupancyService,
    private readonly pricing: PricingService,
    private readonly tax: TaxService,
    private readonly wallet: WalletService,
    /** Chỉ để đọc tài khoản nhận tiền của nền tảng (VietQR) — một nguồn với khoản giữ chỗ. */
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Đọc ──────────────────────────────────────────────────────────────────

  /** Xem trước một phụ lục — cùng hàm định giá với `create`, cộng một phép soát lịch (UX). */
  async quote(
    tenantId: string,
    bookingId: string,
    months: number,
  ): Promise<BookingExtensionQuoteDto> {
    const booking = await this.loadBooking(this.prisma, tenantId, bookingId, false);
    this.assertExtendable(booking);
    const priced = await this.price(booking, months);
    /*
     * Chỉ là XEM TRƯỚC: lượt tạo vẫn để EXCLUDE quyết (ADR 0006). Bỏ qua buffer của các dòng khác —
     * trả lời "có trống không" cho người đang chọn số tháng, không phải một lời hứa.
     */
    const clash = await this.prisma.vehicleOccupancy.findFirst({
      where: {
        vehicleId: booking.vehicleId,
        NOT: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: booking.id },
        startAt: { lt: priced.toAt },
        endAt: { gt: priced.fromAt },
      },
      orderBy: { startAt: 'asc' },
      select: { startAt: true },
    });
    const { fees, breakdown } = priced;
    const lt = breakdown.longTerm!;
    return {
      months,
      fromAt: priced.fromAt.toISOString(),
      toAt: priced.toAt.toISOString(),
      rentalDays: fees.rentalDays,
      monthlyPrice: lt.baseMonthlyPrice,
      basePackageAmount: lt.basePackageAmount,
      durationDiscountPercent: lt.durationDiscountPercent,
      durationDiscountAmount: lt.durationDiscountAmount,
      rentalAmount: fees.baseAmount,
      taxAmount: fees.taxAmount,
      vatAmount: fees.vatAmount ?? null,
      pitAmount: fees.pitAmount ?? null,
      vatPercent: fees.vatPercent ?? null,
      pitPercent: fees.pitPercent ?? null,
      onlineAmount: fees.onlineAmount,
      payAtPickupAmount: fees.payAtPickupAmount,
      ownerPayableAmount: fees.ownerPayableAmount,
      ownerNetAmount: fees.ownerNetAmount,
      billingMode: fees.billingMode,
      available: clash === null,
      busyFrom: clash
        ? (clash.startAt < priced.fromAt ? priced.fromAt : clash.startAt).toISOString()
        : null,
    };
  }

  /** Mọi phụ lục của một đơn, cũ trước — bề mặt đối tác. */
  async listForBooking(tenantId: string, bookingId: string): Promise<BookingExtensionDto[]> {
    await this.assertBookingVisible(tenantId, bookingId);
    const rows = await this.prisma.bookingExtension.findMany({
      where: { tenantId, bookingId },
      orderBy: { createdAt: 'asc' },
      select: EXTENSION_SELECT,
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Phụ lục của MỘT chuyến của khách. Nhận id đơn hoặc id yêu cầu (thông báo trỏ vào cả hai);
   * quyền sở hữu nằm trong truy vấn — chuyến của người khác trả mảng rỗng, không tiết lộ gì.
   */
  async listForCustomer(
    customerUserId: string,
    tripId: string,
  ): Promise<CustomerBookingExtensionDto[]> {
    const rows = await this.prisma.bookingExtension.findMany({
      where: {
        customerUserId,
        OR: [{ bookingId: tripId }, { booking: { bookingRequest: { id: tripId } } }],
      },
      orderBy: { createdAt: 'asc' },
      select: EXTENSION_SELECT,
    });
    const paymentInfo = this.billing.paymentInfo();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      months: r.months,
      fromAt: r.fromAt.toISOString(),
      toAt: r.toAt.toISOString(),
      status: r.status,
      rentalAmount: r.rentalAmount.toFixed(0),
      onlineAmount: r.onlineAmount.toFixed(0),
      payAtPickupAmount: r.payAtPickupAmount.toFixed(0),
      paidAmount: r.paidAmount.toFixed(0),
      remainingAmount: remainingOf(r).toFixed(0),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      activatedAt: r.activatedAt?.toISOString() ?? null,
      paymentInfo,
    }));
  }

  // ── Ghi ──────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    bookingId: string,
    months: number,
    actorUserId: string,
  ): Promise<BookingExtensionDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const booking = await this.loadBooking(tx, tenantId, bookingId, true);
      this.assertExtendable(booking);

      const pending = await tx.bookingExtension.findFirst({
        where: { bookingId, status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT },
        select: { id: true },
      });
      if (pending) throw pendingConflict(pending.id);

      const priced = await this.price(booking, months, tx);
      const { fees, breakdown, fromAt, toAt } = priced;
      const now = new Date();
      const online = new Prisma.Decimal(fees.onlineAmount);

      /*
       * Kéo dài lịch của CHÍNH ĐƠN tới giờ trả mới (điều 6). Giữ nguyên `startAt` và buffer: phụ
       * lục chỉ dời đuôi. Trùng chuyến khác ⇒ EXCLUDE 23P01 ⇒ 409, cả transaction rơi.
       */
      const occupancy = await tx.vehicleOccupancy.findUnique({
        where: {
          sourceType_sourceId: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: booking.id },
        },
        select: { startAt: true, endAt: true },
      });
      if (!occupancy) {
        // Đơn `active` luôn chiếm lịch; mất dòng nghĩa là dữ liệu đã lệch — không tự vá ở đây.
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Đơn không còn giữ lịch xe — tải lại rồi thử lại',
        });
      }
      await this.occupancy.reschedule(
        tx,
        OCCUPANCY_SOURCE_TYPE.BOOKING,
        booking.id,
        occupancy.startAt,
        toAt,
      );

      /*
       * Hạn thanh toán ĐỘNG như khoản giữ chỗ (`holdWindowsFor`, ADR 0066), mốc "nhận" là giờ bắt
       * đầu phụ lục. Đơn sắp tới (hay đã quá) giờ trả vẫn được đủ một cửa sổ tối thiểu để khách
       * kịp mở app ngân hàng — lịch đã kéo dài nên không có ai khác chờ chỗ đó.
       */
      const windows = holdWindowsFor({
        acceptedAt: now,
        pickupAt: fromAt,
        freeCancelHours: fees.policy.freeCancelHours,
        paymentWindowMinutes: fees.policy.holdPaymentWindowMinutes,
      });
      const minExpiry = now.getTime() + HOLD_MIN_USABLE_WINDOW_MINUTES * 60_000;
      const expiresAt = new Date(Math.max(windows.expiresAt.getTime(), minExpiry));

      // Cùng hàm chụp với đơn (`buildSnapshot`) — thuế, sổ ví và màn đối soát đọc một hình dạng.
      const snapshot = this.pricing.buildSnapshot(breakdown, priced.policy, fees);
      const id = newId();
      const created = await this.insertWithinTx(tx, {
        id,
        tenantId,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        customerUserId: booking.customerUserId,
        months,
        fromAt,
        toAt,
        billingMode: fees.billingMode,
        rentalAmount: new Prisma.Decimal(fees.baseAmount),
        taxAmount: new Prisma.Decimal(fees.taxAmount),
        depositAmount: new Prisma.Decimal(fees.depositAmount),
        onlineAmount: online,
        payAtPickupAmount: new Prisma.Decimal(fees.payAtPickupAmount),
        feePolicyId: fees.policy.policyId ?? null,
        priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        expiresAt,
        createdBy: actorUserId,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'booking_extension.create',
          targetType: 'booking',
          targetId: booking.id,
          after: {
            extensionId: id,
            code: created.code,
            months,
            fromAt: fromAt.toISOString(),
            toAt: toAt.toISOString(),
            rentalAmount: fees.baseAmount,
            onlineAmount: fees.onlineAmount,
            taxAmount: fees.taxAmount,
            billingMode: fees.billingMode,
          },
        },
        tx,
      );

      // Không thu online (gian hàng tắt cọc + không thuế) ⇒ hiệu lực ngay (điều 5).
      if (online.lte(0)) {
        return this.activateWithinTx(tx, created, booking, now, actorUserId);
      }

      if (booking.customerUserId) {
        await this.notifications.emitToUser(
          booking.customerUserId,
          {
            type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
            title: `Gia hạn đơn ${booking.code}: chờ thanh toán`,
            body: `${booking.vehicle.name} · thêm ${months} tháng — chuyển khoản trước ${formatVnTime(expiresAt)} để giữ lịch`,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
            data: { extensionId: id, code: created.code },
            pushExpiresAt: expiresAt,
          },
          tx,
        );
      }
      return created;
    });
    return this.toDto(row);
  }

  /** Chủ xe huỷ phụ lục CÒN CHỜ — nhả phần lịch kéo thêm, hoàn phần khách đã chuyển. */
  async cancel(
    tenantId: string,
    bookingId: string,
    extensionId: string,
    actorUserId: string,
  ): Promise<BookingExtensionDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "booking_extensions"
        WHERE "id" = ${extensionId} AND "tenant_id" = ${tenantId} AND "booking_id" = ${bookingId}
        FOR UPDATE`;
      const current = locked[0];
      if (!current) throw notFound();
      if (current.status !== BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT) {
        throw new ConflictException({
          code: API_ERROR_CODE.BOOKING_EXTENSION_NOT_CANCELLABLE,
          message: 'Phụ lục không còn ở chặng huỷ được',
          details: { status: current.status },
        });
      }
      const closed = await this.closeWithinTx(tx, extensionId, BOOKING_EXTENSION_STATUS.CANCELLED, {
        revertSchedule: true,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'booking_extension.cancel',
          targetType: 'booking',
          targetId: bookingId,
          after: {
            extensionId,
            refundedAmount: closed.paidAmount.toFixed(0),
          },
        },
        tx,
      );
      if (closed.customerUserId) {
        await this.notifications.emitToUser(
          closed.customerUserId,
          {
            type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
            title: 'Gia hạn đã được huỷ',
            body: closed.paidAmount.gt(0)
              ? `Chủ xe huỷ phụ lục gia hạn — ${closed.paidAmount.toFixed(0)}đ đã hoàn vào Ví điểm`
              : 'Chủ xe huỷ phụ lục gia hạn — giờ trả xe giữ nguyên',
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: bookingId,
            data: { extensionId },
          },
          tx,
        );
      }
      return closed;
    });
    return this.toDto(row);
  }

  /**
   * Tiền về cho một mã `XPE…` — gọi bởi `SepayService` TRONG transaction đối soát. Idempotent bằng
   * điều kiện trong WHERE, không bằng đọc-rồi-ghi (cùng khuôn `BookingHoldsService`).
   */
  async applyBankPaymentWithinTx(
    tx: Prisma.TransactionClient,
    args: { code: string; amount: Prisma.Decimal; providerTxId: string },
  ): Promise<ExtensionPaymentOutcome> {
    const found = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "booking_extensions" WHERE "code" = ${args.code.toUpperCase()} FOR UPDATE`;
    const hit = found[0];
    if (!hit) return { outcome: 'not_found' };
    const ext = await tx.bookingExtension.findUniqueOrThrow({
      where: { id: hit.id },
      select: EXTENSION_SELECT,
    });

    if (ext.status === BOOKING_EXTENSION_STATUS.ACTIVE) {
      // Phụ lục đã đủ tiền: khoản này là THỪA. Một phụ lục chỉ có MỘT bút toán hoàn thừa (unique
      // 4 cột của sổ ví) — lần thứ hai trở đi để người trực hoàn tay.
      const refunded = await this.refundOverpayWithinTx(tx, ext, args.amount, args.providerTxId);
      if (!refunded) return { outcome: 'closed', extensionId: ext.id, status: ext.status };
      await tx.bookingExtension.update({
        where: { id: ext.id },
        data: { paidAmount: { increment: args.amount } },
      });
      return { outcome: 'already_paid', extensionId: ext.id };
    }
    if (
      ext.status !== BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT ||
      (ext.expiresAt !== null && ext.expiresAt.getTime() <= Date.now())
    ) {
      // Tiền về MUỘN — phụ lục đã đóng (hoặc quá hạn, worker sắp đóng). Không bao giờ kéo lịch lại:
      // chỗ đó có thể đã thuộc về khách khác. Để giao dịch ở hàng đợi đối soát.
      return {
        outcome: 'closed',
        extensionId: ext.id,
        status:
          ext.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT
            ? BOOKING_EXTENSION_STATUS.EXPIRED
            : ext.status,
      };
    }

    const paid = ext.paidAmount.plus(args.amount);
    if (paid.lt(ext.onlineAmount)) {
      await tx.bookingExtension.update({
        where: { id: ext.id },
        data: { paidAmount: paid },
      });
      return { outcome: 'partial', extensionId: ext.id };
    }

    const now = new Date();
    await tx.bookingExtension.update({
      where: { id: ext.id },
      data: { paidAmount: paid, paidAt: now },
    });
    const booking = await this.loadBooking(tx, ext.tenantId, ext.bookingId, true);
    const activated = await this.activateWithinTx(
      tx,
      { ...ext, paidAmount: paid },
      booking,
      now,
      null,
    );
    const excess = paid.minus(ext.onlineAmount);
    if (excess.gt(0)) {
      await this.refundOverpayWithinTx(tx, activated, excess, args.providerTxId);
    }
    return { outcome: 'activated', extensionId: ext.id };
  }

  /**
   * Đơn vừa rời trạng thái chạy — gọi bởi `BookingsService.transitionWithinTx`, cùng transaction.
   *
   *  - Phụ lục còn chờ tiền ⇒ huỷ, hoàn phần đã chuyển (lịch của đơn đã nhả cùng lượt chuyển).
   *  - Đơn `completed` ⇒ ghi có ví chủ xe `D − T` của từng phụ lục `active` chưa quyết toán. Đơn
   *    kết thúc kiểu khác không mang phụ lục `active` (đơn `active` không huỷ được — ADR 0045).
   */
  async onBookingClosedWithinTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    to: BookingStatus,
  ): Promise<void> {
    const pending = await tx.bookingExtension.findMany({
      where: { bookingId, status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT },
      select: { id: true },
    });
    for (const p of pending) {
      await this.closeWithinTx(tx, p.id, BOOKING_EXTENSION_STATUS.CANCELLED, {
        revertSchedule: false,
      });
    }
    if (to !== BOOKING_STATUS.COMPLETED) return;

    const active = await tx.bookingExtension.findMany({
      where: { bookingId, status: BOOKING_EXTENSION_STATUS.ACTIVE, settledAt: null },
      select: { id: true, tenantId: true, depositAmount: true, taxAmount: true },
    });
    const now = new Date();
    for (const ext of active) {
      const payable = ext.depositAmount.minus(ext.taxAmount);
      if (payable.gt(0)) {
        await this.wallet.creditWithinTx(tx, {
          owner: { type: WALLET_OWNER_TYPE.TENANT, tenantId: ext.tenantId },
          kind: WALLET_ENTRY_KIND.EXTENSION_RELEASE,
          sourceType: WALLET_ENTRY_SOURCE.BOOKING_EXTENSION,
          sourceRefId: ext.id,
          amount: payable,
          bookingId,
          note: 'Phần tiền giữ chỗ của phụ lục gia hạn (đã trừ thuế khấu trừ)',
        });
      }
      await tx.bookingExtension.updateMany({
        where: { id: ext.id, settledAt: null },
        data: { settledAt: now },
      });
    }
  }

  // ── Nội bộ ───────────────────────────────────────────────────────────────

  /**
   * Định giá MỘT phụ lục: gói N tháng ở giá tháng HIỆN HÀNH của xe + ưu đãi cam kết của mốc N
   * (điều 3), rồi bảng phí của đơn với cờ miễn phí nền tảng (điều 4). Tuyến chụp TẠI LÚC gia hạn
   * (điều 8) — `customerFeesFor` tự hỏi tuyến + công tắc cọc hiện hành.
   */
  private async price(
    booking: ExtendableBooking,
    months: number,
    tx?: Prisma.TransactionClient,
  ): Promise<ExtensionPricing> {
    const fromAt = booking.returnAt;
    const toAt = addCalendarMonthsVn(fromAt, months);
    if (!booking.vehicle.monthlyPrice) throw unpriced('no_monthly_price');
    const policy = await this.pricing.effectivePolicy(booking.tenantId, booking.vehicleId, tx);
    const breakdown = this.pricing.buildLongTermPackageQuote({
      monthlyPrice: booking.vehicle.monthlyPrice.toFixed(0),
      packageMonths: months,
      policy,
      delivery: null,
    });
    const fees = await this.pricing.customerFeesFor(
      booking.tenantId,
      {
        vehicleType: booking.vehicle.vehicleType,
        serviceType: SERVICE_TYPE.LONG_TERM,
        breakdown,
        schedule: { pickupAt: fromAt, returnAt: toAt },
      },
      false,
      { platformFeesWaived: true },
    );
    // Chưa có chính sách phí / chưa rõ tuyến: không đoán một bảng phí rồi đóng băng nó.
    if (!fees) throw unpriced('no_fee_policy');
    return { fromAt, toAt, breakdown, fees, policy };
  }

  private async activateWithinTx(
    tx: Prisma.TransactionClient,
    ext: ExtensionRow,
    booking: ExtendableBooking,
    now: Date,
    actorUserId: string | null,
  ): Promise<ExtensionRow> {
    /*
     * Dời giờ trả của đơn — chỉ khi đơn vẫn trả ĐÚNG mốc phụ lục bắt đầu. Lệch nghĩa là ai đó đã sửa
     * lịch đơn giữa chừng; để phụ lục treo sai mốc tệ hơn là dừng cả lượt và để người trực xem.
     */
    const moved = await tx.booking.updateMany({
      where: { id: ext.bookingId, tenantId: ext.tenantId, returnAt: ext.fromAt },
      data: { returnAt: ext.toAt },
    });
    if (moved.count !== 1) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Giờ trả của đơn đã đổi sau khi tạo phụ lục — không áp được phụ lục',
      });
    }
    const activated = await tx.bookingExtension.update({
      where: { id: ext.id },
      data: {
        status: BOOKING_EXTENSION_STATUS.ACTIVE,
        activatedAt: now,
        paidAt: ext.onlineAmount.gt(0) ? (ext.paidAt ?? now) : null,
      },
      select: EXTENSION_SELECT,
    });
    await this.tax.accrueForExtensionWithinTx(tx, {
      bookingExtensionId: ext.id,
      bookingId: ext.bookingId,
      tenantId: ext.tenantId,
      priceSnapshot: ext.priceSnapshot,
      feePolicyId: ext.feePolicyId,
      actorUserId,
      now,
    });
    await this.audit.record(
      {
        tenantId: ext.tenantId,
        actorUserId,
        actorScope: actorUserId ? AUDIT_ACTOR_SCOPE.TENANT : AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_extension.activate',
        targetType: 'booking',
        targetId: ext.bookingId,
        before: { returnAt: ext.fromAt.toISOString() },
        after: {
          extensionId: ext.id,
          returnAt: ext.toAt.toISOString(),
          paidAmount: ext.paidAmount.toFixed(0),
        },
      },
      tx,
    );
    const body = `${booking.vehicle.name} · trả xe mới: ${formatVnTime(ext.toAt)}`;
    await this.notifications.emitToTenantMembers(
      ext.tenantId,
      {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: `Đơn ${booking.code}: đã gia hạn ${ext.months} tháng`,
        body,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: ext.bookingId,
        data: { extensionId: ext.id },
      },
      tx,
      { excludeUserId: actorUserId },
    );
    if (ext.customerUserId) {
      await this.notifications.emitToUser(
        ext.customerUserId,
        {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Đã gia hạn chuyến thêm ${ext.months} tháng`,
          body,
          tenantId: ext.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: ext.bookingId,
          data: { extensionId: ext.id },
        },
        tx,
      );
    }
    return activated;
  }

  /**
   * Đóng một phụ lục còn chờ (huỷ / hết hạn): lật trạng thái có điều kiện, hoàn phần đã chuyển vào
   * ví KHÁCH (ADR 0053 điều 8), và — nếu đơn còn chạy — thu lịch về giờ trả hiện tại của đơn.
   */
  private async closeWithinTx(
    tx: Prisma.TransactionClient,
    extensionId: string,
    status: typeof BOOKING_EXTENSION_STATUS.CANCELLED | typeof BOOKING_EXTENSION_STATUS.EXPIRED,
    opts: { revertSchedule: boolean },
  ): Promise<ExtensionRow> {
    const now = new Date();
    const flipped = await tx.bookingExtension.updateMany({
      where: { id: extensionId, status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT },
      data: { status, closedAt: now },
    });
    const row = await tx.bookingExtension.findUniqueOrThrow({
      where: { id: extensionId },
      select: EXTENSION_SELECT,
    });
    if (flipped.count === 0) return row;

    if (opts.revertSchedule) {
      const [booking, occupancy] = await Promise.all([
        tx.booking.findUniqueOrThrow({ where: { id: row.bookingId }, select: { returnAt: true } }),
        tx.vehicleOccupancy.findUnique({
          where: {
            sourceType_sourceId: {
              sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
              sourceId: row.bookingId,
            },
          },
          select: { startAt: true, endAt: true },
        }),
      ]);
      // Chỉ thu lại đúng phần phụ lục đã kéo — `end_at` khác `to_at` nghĩa là lịch đã do lượt khác quyết.
      if (occupancy && occupancy.endAt.getTime() === row.toAt.getTime()) {
        await this.occupancy.reschedule(
          tx,
          OCCUPANCY_SOURCE_TYPE.BOOKING,
          row.bookingId,
          occupancy.startAt,
          booking.returnAt,
        );
      }
    }
    if (row.paidAmount.gt(0)) {
      await this.refundWithinTx(tx, row, row.paidAmount, WALLET_ENTRY_KIND.EXTENSION_REFUND, null);
    }
    return row;
  }

  private async refundOverpayWithinTx(
    tx: Prisma.TransactionClient,
    ext: ExtensionRow,
    amount: Prisma.Decimal,
    providerTxId: string,
  ): Promise<boolean> {
    return this.refundWithinTx(
      tx,
      ext,
      amount,
      WALLET_ENTRY_KIND.HOLD_OVERPAY,
      `Chuyển thừa (giao dịch ${providerTxId})`,
    );
  }

  /** `false` = không tự hoàn được (không có tài khoản khách, hoặc nguồn đã ghi) — để người trực xử lý. */
  private async refundWithinTx(
    tx: Prisma.TransactionClient,
    ext: ExtensionRow,
    amount: Prisma.Decimal,
    kind: typeof WALLET_ENTRY_KIND.EXTENSION_REFUND | typeof WALLET_ENTRY_KIND.HOLD_OVERPAY,
    note: string | null,
  ): Promise<boolean> {
    if (!ext.customerUserId) {
      this.logger.warn(`Phụ lục ${ext.id}: không có tài khoản khách để hoàn ${amount.toFixed(0)}đ`);
      return false;
    }
    const credited = await this.wallet.creditWithinTx(tx, {
      owner: {
        type: WALLET_OWNER_TYPE.USER,
        userId: resolveRefundWalletOwner(ext.customerUserId).userId,
      },
      kind,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_EXTENSION,
      sourceRefId: ext.id,
      amount,
      bookingId: ext.bookingId,
      note: note ?? 'Hoàn tiền phụ lục gia hạn không hiệu lực',
    });
    return credited !== null;
  }

  /** Chèn kèm mã đối soát; trùng mã (xác suất ~0) thì sinh lại, trùng "một phụ lục chờ" thì 409. */
  private async insertWithinTx(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.BookingExtensionUncheckedCreateInput, 'code' | 'status'>,
  ): Promise<ExtensionRow> {
    const code = newReferenceCode(BANK_MATCH_TARGET_TYPE.BOOKING_EXTENSION);
    try {
      return await tx.bookingExtension.create({
        data: { ...data, code, status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT },
        select: EXTENSION_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Trong transaction, P2002 đã làm hỏng cả lượt — báo đúng nguyên nhân nghiệp vụ, không thử lại.
        throw pendingConflict(null);
      }
      throw err;
    }
  }

  private async loadBooking(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    bookingId: string,
    lock: boolean,
  ): Promise<ExtendableBooking> {
    if (lock) {
      const locked = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "bookings"
        WHERE "id" = ${bookingId} AND "tenant_id" = ${tenantId} AND "deleted_at" IS NULL
        FOR UPDATE`;
      if (locked.length === 0) throw notFound();
    }
    const row = await db.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        vehicleId: true,
        code: true,
        status: true,
        serviceType: true,
        returnAt: true,
        bookingRequest: { select: { customerUserId: true } },
        vehicle: { select: { name: true, vehicleType: true, monthlyPrice: true } },
      },
    });
    if (!row) throw notFound();
    return {
      id: row.id,
      tenantId: row.tenantId,
      vehicleId: row.vehicleId,
      code: row.code,
      status: row.status,
      serviceType: row.serviceType,
      returnAt: row.returnAt,
      customerUserId: row.bookingRequest?.customerUserId ?? null,
      vehicle: row.vehicle,
    };
  }

  /**
   * Chỉ đơn THUÊ DÀI HẠN đang thuê, đặt qua chợ (điều 7). Đơn gian hàng tự lập ngoài chợ không có
   * tài khoản khách để nhận QR hay tiền hoàn — kéo dài đơn đó là việc sửa lịch đơn đã có.
   */
  private assertExtendable(booking: ExtendableBooking): void {
    const reason =
      booking.status !== BOOKING_STATUS.ACTIVE
        ? 'not_active'
        : booking.serviceType !== SERVICE_TYPE.LONG_TERM
          ? 'not_long_term'
          : !booking.customerUserId
            ? 'no_customer_account'
            : null;
    if (reason) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODE.BOOKING_EXTENSION_NOT_ALLOWED,
        message: 'Chỉ gia hạn được đơn thuê dài hạn đang thuê, đặt qua XePrime',
        details: { reason, status: booking.status, serviceType: booking.serviceType },
      });
    }
  }

  private async assertBookingVisible(tenantId: string, bookingId: string): Promise<void> {
    const found = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw notFound();
  }

  private toDto(r: ExtensionRow): BookingExtensionDto {
    return {
      id: r.id,
      code: r.code,
      bookingId: r.bookingId,
      months: r.months,
      fromAt: r.fromAt.toISOString(),
      toAt: r.toAt.toISOString(),
      status: r.status,
      rentalAmount: r.rentalAmount.toFixed(0),
      taxAmount: r.taxAmount.toFixed(0),
      onlineAmount: r.onlineAmount.toFixed(0),
      payAtPickupAmount: r.payAtPickupAmount.toFixed(0),
      paidAmount: r.paidAmount.toFixed(0),
      remainingAmount: remainingOf(r).toFixed(0),
      ownerPayableAmount: Prisma.Decimal.max(0, r.depositAmount.minus(r.taxAmount)).toFixed(0),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      activatedAt: r.activatedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      paymentInfo: this.billing.paymentInfo(),
    };
  }
}

function remainingOf(r: {
  status: string;
  onlineAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}): Prisma.Decimal {
  if (r.status !== BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT) return new Prisma.Decimal(0);
  return Prisma.Decimal.max(0, r.onlineAmount.minus(r.paidAmount));
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy đơn thuê',
  });
}

function unpriced(reason: 'no_monthly_price' | 'no_fee_policy'): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: API_ERROR_CODE.BOOKING_EXTENSION_UNPRICED,
    message:
      reason === 'no_monthly_price'
        ? 'Xe chưa có giá thuê tháng — cấu hình giá dài hạn trước khi gia hạn'
        : 'Chưa có chính sách phí hiệu lực — không định giá được phần gia hạn',
    details: { reason },
  });
}

function pendingConflict(extensionId: string | null): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_EXTENSION_PENDING,
    message: 'Đơn đang có một phụ lục gia hạn chờ khách thanh toán',
    details: { extensionId },
  });
}

/** Giờ Việt Nam cho chữ trong thông báo (thông báo mang sẵn câu chữ — không có client nào định dạng lại). */
function formatVnTime(at: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(at);
}
