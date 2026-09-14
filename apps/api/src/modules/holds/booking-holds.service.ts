import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
  FEE_BEARER,
  FEE_BENEFICIARY,
  FEE_LINE,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  INSURANCE_POLICY_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PRICE_ROW,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_OPEN,
  WITHDRAWAL_STATUS,
  holdExpiresAt,
  holdFreeCancelUntil,
  isHoldPastDue,
  maskAccountNumber,
  type AuditActorScope,
  type BookingPriceSnapshot,
  type FeeLineKey,
  type RentalTermsSnapshot,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { newReferenceCode } from '../../common/reference-code';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BookingsService } from '../bookings/bookings.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { VehicleSettingsService } from '../vehicle-settings/vehicle-settings.service';
import { NotificationService } from '../notification/notification.service';
import { InsuranceReadService } from '../insurance/insurance-read.service';
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
  SaveBankBalanceDto,
} from './dto/hold.dto';
import { formatMoneyVndVi } from '@xeprime/domain';

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
    /** Thời gian chết của xe cộng vào lịch giữ chỗ (08/09/2026 — ADR 0006). */
    private readonly settings: VehicleSettingsService,
    private readonly settlement: HoldSettlementService,
    /** Chỉ để đọc tài khoản nhận tiền của nền tảng — một nguồn với màn mua gói. */
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    /** Phase 7: phần phí bảo hiểm đang giữ hộ, cho vế `custodied` của đối soát ba vế. */
    private readonly insurance: InsuranceReadService,
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
      /**
       * Mốc "đặt xe thành công" — lúc chủ xe duyệt, hoặc lúc hệ thống tự nhận (ADR 0032 điều 2).
       *
       * CẢ HAI cửa sổ (trả tiền 2 giờ, huỷ miễn phí 4 giờ) đếm xuôi từ đây, nên caller phải
       * truyền ĐÚNG mốc đã ghi vào `booking_requests.decided_at` — hai mốc lệch nhau là hai
       * đồng hồ khác nhau cho cùng một chuyến.
       */
      acceptedAt: Date;
      /** `null` khi hệ thống tự động nhận chuyến — audit ghi `actorScope: system`. */
      actorUserId: string | null;
    },
  ): Promise<{ id: string; code: string; amount: string; expiresAt: Date }> {
    const fees = input.snapshot.fees;
    if (!fees?.holdAmount) {
      // Bảo vệ lập trình: caller phải quyết định nhánh hold/không-hold TRƯỚC khi gọi vào đây.
      throw new Error('createForApprovedRequestWithinTx: snapshot không có holdAmount');
    }

    const now = new Date();
    const windowEnd = holdExpiresAt(input.acceptedAt, fees.policy.holdPaymentWindowMinutes);
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
    /*
     * Huỷ miễn phí đếm XUÔI từ `acceptedAt`, kẹp trên bằng giờ nhận xe (ADR 0032 điều 5).
     * Chuyến sát giờ vì thế có cửa sổ ngắn hơn 4 tiếng — UI phải cảnh báo điều đó TRƯỚC khi
     * khách trả tiền, không để họ phát hiện ra sau.
     */
    const freeCancelUntil = holdFreeCancelUntil(
      input.acceptedAt,
      fees.policy.freeCancelHours,
      input.schedule.pickupAt,
    );

    /*
     * BỐN DÒNG TIỀN của khoản giữ chỗ — `D + S + IV + IP` (ADR 0032 điều 2).
     *
     * Một hold nay chứa tiền của NHIỀU người, nên mỗi dòng phải mang tên người hưởng của nó.
     * Phần chênh do SÀN (`holdMinAmount` nâng tổng lên) được cộng vào dòng CỌC, không vào phí
     * dịch vụ: sàn tồn tại để một lần chuyển khoản đáng công đối soát, và phần chênh đó vẫn là
     * tiền thuê của chủ xe chứ không phải doanh thu XePrime (ADR 0033 điều 4).
     */
    const lineAmount = (key: FeeLineKey): string =>
      fees.lines.find((l) => l.key === key)?.amount ?? '0';
    const serviceFeeAmount = lineAmount(FEE_LINE.SERVICE_FEE);
    const vehicleInsuranceAmount = lineAmount(FEE_LINE.VEHICLE_PROTECTION);
    const personalInsuranceAmount = lineAmount(FEE_LINE.TRIP_INSURANCE);
    const depositAmount = String(
      Number(fees.holdAmount) -
        Number(serviceFeeAmount) -
        Number(vehicleInsuranceAmount) -
        Number(personalInsuranceAmount),
    );
    if (Number(depositAmount) < 0) {
      // CHECK ở DB cũng chặn; nói rõ ở đây để lỗi không hiện thành một P2010 khó đọc.
      throw new Error(
        `createForApprovedRequestWithinTx: bốn dòng tiền vượt quá holdAmount (${fees.holdAmount})`,
      );
    }

    const allocation = [
      {
        key: FEE_LINE.DEPOSIT,
        beneficiary: FEE_BENEFICIARY.OWNER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: depositAmount,
      },
      {
        key: FEE_LINE.SERVICE_FEE,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        amount: serviceFeeAmount,
      },
      {
        key: FEE_LINE.VEHICLE_PROTECTION,
        beneficiary: FEE_BENEFICIARY.INSURER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: vehicleInsuranceAmount,
      },
      {
        key: FEE_LINE.TRIP_INSURANCE,
        beneficiary: FEE_BENEFICIARY.INSURER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: personalInsuranceAmount,
      },
    ].filter((line) => Number(line.amount) > 0);

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
        depositAmount: new Prisma.Decimal(depositAmount),
        serviceFeeAmount: new Prisma.Decimal(serviceFeeAmount),
        vehicleInsuranceAmount: new Prisma.Decimal(vehicleInsuranceAmount),
        personalInsuranceAmount: new Prisma.Decimal(personalInsuranceAmount),
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
      bufferMinutes: await this.settings.turnaroundBufferFor(tx, input.vehicleId),
    });

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorUserId ? AUDIT_ACTOR_SCOPE.TENANT : AUDIT_ACTOR_SCOPE.SYSTEM,
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
          body: `${input.vehicleName} · giữ chỗ ${formatMoneyVndVi(fees.holdAmount.toString())} · nội dung ${code}`,
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
            rentalTerms: true,
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
    // Yêu cầu do HỆ THỐNG tự nhận không có ai duyệt: `decided_by` NULL ⇒ đơn cũng không có người tạo.
    const creator = req.decidedBy ?? null;

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
      {
        // Điều kiện thuê đã đóng băng trên yêu cầu — copy nguyên sang đơn (08/09/2026).
        rentalTerms: (req.rentalTerms as unknown as RentalTermsSnapshot | null) ?? null,
        /*
         * Đơn này ra đời VÌ tiền cọc đã về tài khoản XePrime — không có nhánh nào khác dẫn tới
         * đây. `platform` đóng băng tại đây, và công tắc của gian hàng đổi sau đó không viết lại
         * (ADR 0025 ràng buộc 4).
         */
        depositCollectionMode: DEPOSIT_COLLECTION_MODE.PLATFORM,
        /*
         * Hợp đồng bảo hiểm truy ngược về CHÍNH khoản giữ chỗ đã thu phí của nó (Phase 7). Khi
         * quyết toán với đối tác, câu hỏi đầu tiên là "tiền này vào bằng giao dịch nào" — không
         * có cột này thì phải đi vòng qua đơn rồi đoán.
         */
        holdId,
      },
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
   * ĐỐI SOÁT BA VẾ của một ngày (giờ Việt Nam) — ADR 0025 điều 6.
   *
   * ## Phương trình
   *
   * ```text
   *   Số dư ngân hàng cuối ngày D
   *     = Tiền CỦA NỀN TẢNG (lũy kế tới hết D)
   *     + Tiền GIỮ HỘ       (nghĩa vụ tại cuối D)
   *     + Chênh lệch chưa đối soát
   * ```
   *
   * ## Hai cái bẫy, và cách né
   *
   * 1. **Không trộn LƯU LƯỢNG với SỐ DƯ.** Số dư ngân hàng là con số LŨY KẾ từ ngày đầu tiên;
   *    tiền vào/ra trong ngày là lưu lượng. Vì vậy `platform` và `custodied` đều tính lũy kế tới
   *    mốc cuối ngày, còn `inflow`/`outflow` là lưu lượng trong ngày và **không** nằm trong
   *    phương trình — chúng chỉ giải thích vì sao số dư đổi so với hôm qua.
   *
   * 2. **Không cộng đôi khoản đã chuyển từ hold sang ví.** Một hold chốt xong thì tiền của nó
   *    rời `booking_holds` và xuất hiện ở `wallet_entries`. Nên `holdsUnsettled` chỉ đếm hold
   *    **chưa chốt** (`outcome IS NULL`), còn phần đã chốt nằm ở ví hoặc ở `platform`. Đếm cả
   *    hai là nhân đôi toàn bộ nghĩa vụ.
   *
   * ## Vì sao `platform` đọc `settled_platform_amount`
   *
   * Không đọc `service_fee_amount`: ở nhánh huỷ muộn, `resolveHoldAllocation` chia `D + S` đôi,
   * nên phần nền tảng khác `S` (và tuyến GÓI có `S = 0` nhưng vẫn sinh doanh thu). Cột
   * `settled_platform_amount` được đóng băng lúc chốt nên đọc nó là đọc đúng con số đã quyết,
   * không phải diễn giải lại. **Không hàm nào ở đây đọc `purpose`** — CLAUDE.md cấm, vì một hold
   * nay chứa tiền của nhiều người (ADR 0033 điều 4).
   *
   * ## Vì sao ví tính bằng `SUM(wallet_entries)` chứ không đọc `wallets.balance`
   *
   * `balance` là trạng thái HIỆN TẠI, không có lịch sử — hỏi lại ngày hôm qua sẽ ra số của hôm
   * nay. `wallet_entries` là sổ chỉ-ghi-thêm có `created_at`, nên nó dựng lại được nghĩa vụ tại
   * bất kỳ mốc nào. Hai con số phải bằng nhau ở hiện tại; chỗ chúng lệch chính là `walletDrift`.
   */
  async dailyReconciliation(date: string): Promise<DailyReconciliationDto> {
    const { start, end } = vnDayRange(date);
    const inWindow = Prisma.sql`COALESCE(bank_time, created_at) >= ${start} AND COALESCE(bank_time, created_at) < ${end}`;

    const [inflowRow] = await this.prisma.$queryRaw<
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
      WHERE direction = ${BANK_DIRECTION.IN} AND ${inWindow}
    `;

    const [
      platformRow,
      subsRow,
      custodiedHolds,
      walletRow,
      refundsPendingRow,
      unmatchedCumRow,
      withdrawalsPaid,
      refundsPaid,
      driftRow,
      bankBalance,
    ] = await Promise.all([
      /*
       * Doanh thu nền tảng LŨY KẾ tới hết ngày D: hold đã chốt (`released_at < end`) cộng phần
       * đã đóng băng vào `settled_platform_amount`.
       */
      this.prisma.bookingHold.aggregate({
        where: { outcome: { not: null }, releasedAt: { lt: end } },
        _sum: { settledPlatformAmount: true },
      }),
      // Tiền gói đã THU (không phải đã phát hành) — chỉ phần `paid_amount` mới là tiền thật về.
      this.prisma.subscriptionInvoice.aggregate({
        where: { paidAt: { lt: end } },
        _sum: { paidAmount: true },
      }),
      /*
       * Hold CHƯA CHỐT nhưng đã có tiền. Lấy TOÀN BỘ `paid_amount`: trước khi chốt, kể cả phần
       * phí dịch vụ cũng có thể phải hoàn khách (huỷ sớm hoàn 100%), nên chưa đồng nào của hold
       * này là của nền tảng.
       */
      this.prisma.bookingHold.aggregate({
        where: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } },
        _sum: { paidAmount: true },
        _count: { _all: true },
      }),
      /*
       * Nghĩa vụ ví tại cuối ngày D — dựng lại từ SỔ, không đọc `wallets.balance` (xem docblock).
       * `available`/`pending` là số HIỆN TẠI, trả kèm để màn hình nói được phần nào đang bị khoá.
       */
      this.prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>`
        SELECT COALESCE(SUM(amount), 0) AS total
          FROM wallet_entries
         WHERE created_at < ${end}
      `,
      // Khách VÃNG LAI không có ví — đường chuyển khoản tay là vĩnh viễn (ADR 0033 điều 3).
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PENDING, createdAt: { lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Tiền vào chưa khớp LŨY KẾ — vẫn trong tài khoản, vẫn là tiền của một ai đó.
      this.prisma.$queryRaw<Array<{ total: Prisma.Decimal; count: bigint }>>`
        SELECT COALESCE(SUM(amount_in), 0) AS total, COUNT(*) AS count
          FROM bank_transactions
         WHERE direction = ${BANK_DIRECTION.IN}
           AND match_status = ${BANK_MATCH_STATUS.UNMATCHED}
           AND COALESCE(bank_time, created_at) < ${end}
      `,
      // Chiều RA trong NGÀY — lưu lượng, không phải nghĩa vụ.
      this.prisma.withdrawalRequest.aggregate({
        where: { status: WITHDRAWAL_STATUS.PAID, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PAID, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      /*
       * LỆCH SỔ VÍ — ADR 0023 điều 6. So `Σ bút toán` với `balance + pending` của TỪNG ví.
       * Bằng nhau là bất biến: `creditWithinTx` và `recordWithdrawalPaidWithinTx` luôn ghi cả
       * hai vế trong cùng transaction, còn khoá/nhả tiền rút chỉ chuyển giữa hai cột. Lệch nghĩa
       * là có đường ghi thứ hai ngoài `WalletService` — thứ duy nhất phép này tồn tại để bắt.
       */
      this.prisma.$queryRaw<Array<{ wallets: bigint; amount: Prisma.Decimal }>>`
        SELECT COUNT(*) AS wallets, COALESCE(SUM(ABS(diff)), 0) AS amount
          FROM (
                SELECT w.id,
                       COALESCE(e.total, 0) - (w.balance + w.pending_withdraw_amount) AS diff
                  FROM wallets w
                  LEFT JOIN (
                        SELECT wallet_id, SUM(amount) AS total
                          FROM wallet_entries
                         GROUP BY wallet_id
                       ) e ON e.wallet_id = w.id
               ) d
         WHERE diff <> 0
      `,
      this.prisma.platformBankBalance.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } }),
    ]);

    const zero = new Prisma.Decimal(0);
    const inflow = inflowRow ?? {
      total: zero,
      count: 0n,
      subs: zero,
      holds: zero,
      unmatched: zero,
      unmatchedCount: 0n,
      ignored: zero,
    };

    const walletTotal = walletRow[0]?.total ?? zero;
    const walletLive = await this.prisma.wallet.aggregate({
      _sum: { balance: true, pendingWithdrawAmount: true },
    });
    const unmatchedCum = unmatchedCumRow[0] ?? { total: zero, count: 0n };

    const serviceFeeRecognized = platformRow._sum.settledPlatformAmount ?? zero;
    const subscriptionsCollected = subsRow._sum.paidAmount ?? zero;
    const platformTotal = serviceFeeRecognized.add(subscriptionsCollected);

    const holdsUnsettled = custodiedHolds._sum.paidAmount ?? zero;
    const refundsPendingAmount = refundsPendingRow._sum.amount ?? zero;
    /*
     * BẢO HIỂM (Phase 7): phí đã thu của khách cho `IV`/`IP` là tiền GIỮ HỘ ở mọi trạng thái trừ
     * hai trạng thái cuối. Chưa phát hành ⇒ vẫn là tiền của khách; đã phát hành ⇒ thành khoản
     * phải trả hãng bảo hiểm. Cả hai đều là tiền XePrime đang cầm mà không sở hữu — chỉ khác ở
     * chỗ đang nợ AI, và phép đối soát này không hỏi câu đó.
     *
     * ⚠️ KHÔNG trừ phần này ra khỏi `holdsUnsettled`: hold CHƯA chốt được tính trọn `paid_amount`
     * (gồm cả `IV`/`IP`), còn hợp đồng bảo hiểm chỉ tồn tại sau khi ĐƠN đã được tạo — tức là sau
     * khi hold đã `paid` và có `booking_id`. Hai tập hợp rời nhau theo thời gian, nên cộng cả hai
     * KHÔNG phải cộng đôi. Ca duy nhất chồng lấn là hold đã trả nhưng chưa chốt outcome VÀ đơn đã
     * tạo — và ở đó phần `IV`/`IP` nằm trong `paid_amount` của hold lẫn trong `premium_amount`
     * của hợp đồng. Đó chính là lý do dòng dưới trừ lại phần trùng.
     */
    const insuranceGross = await this.insurance.custodiedPremiumAsOf(end);
    const insuranceInOpenHolds = await this.premiumInsideUnsettledHolds(end);
    const insuranceReserved = insuranceGross.sub(insuranceInOpenHolds);
    // Thuế: cổng Phase 8 chưa nối vào đây — giữ 0 và một dòng tường minh thay vì vắng mặt.
    const taxAccrued = zero;
    const custodiedTotal = holdsUnsettled
      .add(walletTotal)
      .add(refundsPendingAmount)
      .add(unmatchedCum.total)
      .add(insuranceReserved)
      .add(taxAccrued);

    /*
     * CHƯA NHẬP số dư ⇒ `null` cho cả hai, không phải 0. Số 0 là một khẳng định ("tài khoản
     * rỗng") và nó sẽ biến mọi nghĩa vụ đang có thành một khoản thất thoát trên màn hình.
     */
    const bankBalanceEod = bankBalance ? bankBalance.balance.toFixed(0) : null;
    const variance = bankBalance
      ? bankBalance.balance.sub(platformTotal).sub(custodiedTotal).toFixed(0)
      : null;

    const inflowVariance = new Prisma.Decimal(inflow.total)
      .sub(inflow.subs)
      .sub(inflow.holds)
      .sub(inflow.unmatched)
      .sub(inflow.ignored);

    const drift = driftRow[0] ?? { wallets: 0n, amount: zero };
    const withdrawalsPaidAmount = withdrawalsPaid._sum.amount ?? zero;
    const refundsPaidAmount = refundsPaid._sum.amount ?? zero;

    return {
      date,
      platform: {
        serviceFeeRecognized: serviceFeeRecognized.toFixed(0),
        subscriptionsCollected: subscriptionsCollected.toFixed(0),
        total: platformTotal.toFixed(0),
      },
      custodied: {
        holdsUnsettled: holdsUnsettled.toFixed(0),
        holdsUnsettledCount: custodiedHolds._count._all,
        walletTotal: walletTotal.toFixed(0),
        walletAvailable: (walletLive._sum.balance ?? zero).toFixed(0),
        walletPending: (walletLive._sum.pendingWithdrawAmount ?? zero).toFixed(0),
        refundsPending: refundsPendingAmount.toFixed(0),
        refundsPendingCount: refundsPendingRow._count._all,
        unmatchedIn: new Prisma.Decimal(unmatchedCum.total).toFixed(0),
        unmatchedInCount: Number(unmatchedCum.count),
        insuranceReserved: insuranceReserved.toFixed(0),
        taxAccrued: taxAccrued.toFixed(0),
        total: custodiedTotal.toFixed(0),
      },
      outflow: {
        withdrawalsPaid: withdrawalsPaidAmount.toFixed(0),
        withdrawalsPaidCount: withdrawalsPaid._count._all,
        refundsPaid: refundsPaidAmount.toFixed(0),
        refundsPaidCount: refundsPaid._count._all,
        total: withdrawalsPaidAmount.add(refundsPaidAmount).toFixed(0),
      },
      inflow: {
        bankIn: new Prisma.Decimal(inflow.total).toFixed(0),
        bankInCount: Number(inflow.count),
        matchedSubscriptions: new Prisma.Decimal(inflow.subs).toFixed(0),
        matchedHolds: new Prisma.Decimal(inflow.holds).toFixed(0),
        unmatched: new Prisma.Decimal(inflow.unmatched).toFixed(0),
        unmatchedCount: Number(inflow.unmatchedCount),
        ignored: new Prisma.Decimal(inflow.ignored).toFixed(0),
        variance: inflowVariance.toFixed(0),
      },
      bankBalanceEod,
      variance,
      walletDrift: {
        wallets: Number(drift.wallets),
        amount: new Prisma.Decimal(drift.amount).toFixed(0),
      },
    };
  }

  /**
   * Phí bảo hiểm nằm TRONG các hold chưa chốt — phần bị đếm hai lần nếu không trừ ra.
   *
   * Một hold `paid` chưa chốt outcome được tính TRỌN `paid_amount` ở vế giữ hộ, và `paid_amount`
   * đã gồm `IV + IP`. Nếu đơn của hold đó đã được tạo thì hợp đồng bảo hiểm cũng tồn tại với
   * đúng số tiền ấy. Cộng cả hai là nhân đôi phần bảo hiểm của những chuyến đang chạy — và nó sẽ
   * hiện ra thành một chênh lệch dương đúng bằng tổng phí bảo hiểm của các chuyến chưa kết thúc.
   */
  private async premiumInsideUnsettledHolds(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.bookingInsurancePolicy.aggregate({
      where: {
        createdAt: { lt: end },
        status: { notIn: [INSURANCE_POLICY_STATUS.CANCELLED, INSURANCE_POLICY_STATUS.VOIDED] },
        hold: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } },
      },
      _sum: { premiumAmount: true },
    });
    return agg._sum.premiumAmount ?? new Prisma.Decimal(0);
  }

  /**
   * Admin ghi số dư ngân hàng cuối ngày — vế trái của phép đối soát.
   *
   * `upsert` theo ngày: nhập lại là SỬA con số của ngày đó, không phải thêm một con số thứ hai.
   * Ghi audit vì đây là một khẳng định của con người mà mọi báo động chênh lệch sau đó dựa vào.
   */
  async saveBankBalance(
    input: SaveBankBalanceDto,
    actorUserId: string,
  ): Promise<DailyReconciliationDto> {
    // Cùng hàm kiểm định dạng với đường đọc — hai cách hiểu "ngày" là hai kết quả đối soát.
    vnDayRange(input.date);
    const date = new Date(`${input.date}T00:00:00Z`);
    const balance = new Prisma.Decimal(input.balance);

    const before = await this.prisma.platformBankBalance.findUnique({ where: { date } });
    await this.prisma.$transaction(async (tx) => {
      await tx.platformBankBalance.upsert({
        where: { date },
        create: {
          date,
          balance,
          enteredBy: actorUserId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        update: {
          balance,
          enteredBy: actorUserId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'platform_bank_balance.save',
          targetType: 'platform_bank_balance',
          targetId: input.date,
          before: before ? { balance: before.balance.toFixed(0) } : null,
          after: { balance: balance.toFixed(0), ...(input.note ? { note: input.note } : {}) },
        },
        tx,
      );
    });

    return this.dailyReconciliation(input.date);
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
