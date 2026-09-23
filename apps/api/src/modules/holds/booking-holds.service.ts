import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { newId, Prisma, redeemPromoRedemption } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_DECISION_SOURCE,
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
  SERVICE_TYPE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_OPEN,
  TAX_WITHHOLDING_STATUS_UNPAID,
  WITHDRAWAL_STATUS,
  BOOKING_HOLD_STATUS_AWAITING,
  HOLD_MAX_OPEN_PER_CUSTOMER,
  HOLD_MIN_USABLE_WINDOW_MINUTES,
  bookingRequestRespondBy,
  holdExpiresAt,
  holdFreeCancelUntil,
  isHoldPastDue,
  maskAccountNumber,
  type AuditActorScope,
  type AutoAcceptBlocker,
  type BookingPriceSnapshot,
  type ServiceType,
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
import { TaxReadService } from '../tax/tax-read.service';
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
  /**
   * Tiền đã ĐỦ. `bookingId` có giá trị ở luồng hiện hành (ADR 0044): hold chỉ tồn tại sau khi
   * chuyến đã được nhận, nên đủ tiền là có đơn ngay trong cùng transaction.
   *
   * `null` chỉ xảy ra với dữ liệu LEGACY ADR 0039 — hold sinh trước khi ai duyệt, nên tiền về
   * mà vẫn chưa có người nhận chuyến. Không phải lỗi; nó là chặng `hold_paid`.
   */
  | { outcome: 'activated'; holdId: string; tenantId: string; bookingId: string | null };

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
 *   chuyến ĐƯỢC NHẬN ─► `createForApprovedRequestWithinTx` (BookingRequestsService gọi)
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
    /** Phase 8: phần thuế đã khấu trừ chưa nộp — cùng vế `custodied`. */
    private readonly tax: TaxReadService,
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

    await this.assertHoldQuotaWithinTx(tx, input.customerUserId);

    const now = new Date();
    const windowEnd = holdExpiresAt(input.acceptedAt, fees.policy.holdPaymentWindowMinutes);
    /*
     * Hạn chuyển KHÔNG được vượt quá giờ nhận xe: một hold còn "chờ tiền" sau khi xe đáng lẽ đã
     * giao là một chỗ bị khoá vô nghĩa. Kẹp về giờ nhận; nếu phần còn lại quá ngắn để ai kịp mở
     * app ngân hàng thì không phát QR nữa — chuyến sát giờ phải đi đường thoả thuận trực tiếp,
     * và người vừa bấm duyệt được nói đúng câu đó qua `HOLD_WINDOW_TOO_SHORT`.
     *
     * ⚠️ Ngưỡng đọc từ `HOLD_MIN_USABLE_WINDOW_MINUTES`, KHÔNG gõ tay: `expiresAt − now` tối đa
     * bằng cửa sổ thanh toán, nên một ngưỡng lớn hơn cửa sổ sẽ từ chối MỌI hold ngay lúc tạo —
     * tức là cả sàn ngừng nhận đơn, im lặng. `holds.test.ts` khoá quan hệ giữa hai hằng đó.
     */
    const expiresAt = new Date(Math.min(windowEnd.getTime(), input.schedule.pickupAt.getTime()));
    if (expiresAt.getTime() - now.getTime() < HOLD_MIN_USABLE_WINDOW_MINUTES * 60_000) {
      throw new BadRequestException({
        code: API_ERROR_CODE.HOLD_WINDOW_TOO_SHORT,
        message:
          'Giờ nhận xe quá gần để kịp thu tiền giữ chỗ — liên hệ trực tiếp với khách để thoả thuận',
        details: {
          pickupAt: input.schedule.pickupAt.toISOString(),
          minWindowMinutes: HOLD_MIN_USABLE_WINDOW_MINUTES,
        },
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
    /*
     * TÀI TRỢ mã khuyến mãi (ADR 0046 điều 4) — hiệu giữa QUYỀN LỢI và TIỀN MẶT.
     *
     * `holdAmount` là số khách chuyển (đã trừ tài trợ), còn bốn dòng tiền vẫn phải mang quyền lợi
     * ĐẦY ĐỦ: chủ xe nhận đủ `D`, hãng bảo hiểm nhận đủ `IV + IP`. Nên cọc suy ra từ
     * `grossOnlineAmount` chứ không từ `holdAmount` — trừ tài trợ vào dòng cọc là bắt chủ xe
     * gánh khoản giảm giá của nền tảng.
     *
     * `CHECK booking_holds_money_lines_sum_check` gác đúng bất biến này:
     * `D + S + IV + IP − promo = amount`.
     */
    const promoDiscountAmount = fees.promoDiscountAmount;
    const depositAmount = String(
      Number(fees.grossOnlineAmount) -
        Number(serviceFeeAmount) -
        Number(vehicleInsuranceAmount) -
        Number(personalInsuranceAmount),
    );
    if (Number(depositAmount) < 0) {
      // CHECK ở DB cũng chặn; nói rõ ở đây để lỗi không hiện thành một P2010 khó đọc.
      throw new Error(
        `createForApprovedRequestWithinTx: bốn dòng tiền vượt quá grossOnlineAmount (${fees.grossOnlineAmount})`,
      );
    }
    if (Number(promoDiscountAmount) > Number(depositAmount) + Number(serviceFeeAmount)) {
      // `CHECK booking_holds_promo_within_sponsorable_check` cũng chặn — nói rõ ở đây vì đây là
      // một bất biến NGHIỆP VỤ (không lấn vào tiền giữ hộ bảo hiểm), không phải một lỗi kiểu.
      throw new Error(
        `createForApprovedRequestWithinTx: tài trợ ${promoDiscountAmount} vượt phần tài trợ được (D + S)`,
      );
    }

    const allocation = [
      {
        key: FEE_LINE.DEPOSIT,
        beneficiary: FEE_BENEFICIARY.OWNER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: depositAmount,
      },
      /*
       * Dòng TÀI TRỢ nằm trong `allocation_json` để bảng giải thích đọc được "nền tảng đã bù
       * bao nhiêu" mà không phải trừ hai con số. Nó KHÔNG phải một phụ phí và không có trong
       * `fees.lines` — xem docblock `FEE_LINE.PROMO`.
       */
      {
        key: FEE_LINE.PROMO,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        amount: promoDiscountAmount,
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
        promoDiscountAmount: new Prisma.Decimal(promoDiscountAmount),
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
          ...(Number(promoDiscountAmount) > 0
            ? { promoCode: fees.promo?.code ?? null, promoDiscountAmount }
            : {}),
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
          title: 'Chuyến đã được nhận — thanh toán tiền giữ chỗ để chốt',
          body: `${input.vehicleName} · tiền giữ chỗ ${formatMoneyVndVi(fees.holdAmount.toString())} · nội dung ${code}`,
          tenantId: input.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: input.requestId,
        },
        tx,
      );
    }

    return { id, code, amount: fees.holdAmount, expiresAt };
  }

  /**
   * TRẦN SỐ CHỖ một khách giữ cùng lúc mà chưa trả tiền — `HOLD_MAX_OPEN_PER_CUSTOMER`.
   *
   * Không có trần thì một tài khoản mở được bao nhiêu yêu cầu cũng được, và mỗi lượt gian hàng
   * bấm duyệt khoá thêm một chiếc xe trong hai giờ. Đó không phải giả thuyết: nó là cách rẻ nhất
   * để làm tê liệt một gian hàng nhỏ trong một buổi sáng.
   *
   * ## Vì sao khoá tư vấn, không phải một câu `count` trần
   *
   * `READ COMMITTED` (mặc định của Postgres) cho hai transaction song song cùng đọc "đang có 2",
   * rồi cùng ghi — và trần 3 thành 4. Không có ràng buộc DB nào diễn đạt được "≤ 3 dòng thoả một
   * vị từ", nên thứ duy nhất còn lại là **tuần tự hoá theo KHÁCH**: `pg_advisory_xact_lock` trên
   * hash của `customerUserId`, tự nhả khi transaction kết thúc.
   *
   * Khoá theo KHÁCH chứ không theo bảng: hai khách khác nhau vẫn duyệt song song được, và một
   * khách thì không có lý do gì để duyệt song song với chính mình.
   *
   * ## Vì sao chặn ở đường DUYỆT, không ở đường gửi yêu cầu
   *
   * Gửi yêu cầu không khoá xe của ai (ADR 0044 điều 1) — chặn ở đó là chặn nhầm người. Chỗ tốn
   * kém là lúc một chiếc xe thật bị giữ, và đó chính là đây.
   *
   * Khách VÃNG LAI không có `customerUserId`: bỏ qua. Không phải một lỗ hổng — `submitPublic`
   * luôn quy SĐT về một tài khoản (`resolveOrCreateUserByPhone`) trước khi ghi yêu cầu, nên
   * đường công khai không sinh ra hold nào thiếu cột này. Nhánh `null` chỉ còn cho dữ liệu cũ.
   */
  private async assertHoldQuotaWithinTx(
    tx: Prisma.TransactionClient,
    customerUserId: string | null,
  ): Promise<void> {
    if (!customerUserId) return;

    // `hashtext` trả int4; `pg_advisory_xact_lock(key bigint)` nhận nó. Không gian khoá dùng
    // chung toàn database, nên tiền tố `hold:` giữ nó không đụng advisory lock của worker.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hold:' + customerUserId}))`;

    const openHolds = await tx.bookingHold.count({
      where: {
        customerUserId,
        status: { in: [...BOOKING_HOLD_STATUS_AWAITING] },
        // Hold quá mốc nhưng worker chưa kịp lật vẫn là một chỗ CHẾT — không tính vào trần, nếu
        // không một khách xui sẽ bị chặn bởi chính những chỗ họ đã mất.
        expiresAt: { gt: new Date() },
      },
    });
    if (openHolds >= HOLD_MAX_OPEN_PER_CUSTOMER) {
      throw new ConflictException({
        code: API_ERROR_CODE.HOLD_LIMIT_REACHED,
        message:
          'Khách này đang giữ tối đa số chỗ chưa thanh toán cho phép — chờ họ thanh toán hoặc ' +
          'huỷ bớt trước khi nhận thêm chuyến',
        details: { openHolds, limit: HOLD_MAX_OPEN_PER_CUSTOMER },
      });
    }
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

    const bookingId = await this.settleFullPaymentWithinTx(tx, hold.id, args.providerTxId);
    return { outcome: 'activated', holdId: hold.id, tenantId: hold.tenantId, bookingId };
  }

  /**
   * Tiền ĐỦ ⇒ **ĐƠN THUÊ** — đây là điểm duy nhất trong hệ thống biến một chuyến thành đơn
   * (ADR 0044 điều 2). Không phải một cú bấm trên giao diện, không phải một lượt quét QR.
   *
   * Hold chỉ tồn tại sau khi chuyến ĐÃ được nhận, nên `booking_requests.decided_at` luôn có giá
   * trị ở luồng hiện hành và tiền về là mở đơn ngay, không hỏi lại ai. Bắt gian hàng duyệt lần
   * thứ hai cho một chuyến họ đã đồng ý và khách đã trả tiền là một bước không ai hiểu nổi.
   *
   * **Nhánh LEGACY (`decided_at IS NULL`)** — hold sinh lúc khách bấm đặt, theo ADR 0039. Ở đó
   * chưa ai nhận chuyến, nên tiền về chỉ làm được hai việc chắc chắn đúng: chốt hold `paid` và
   * đẩy yêu cầu sang `hold_paid` (vẫn CHIẾM LỊCH). Đơn ra đời khi có người nhận — xe bật
   * "Đặt ngay" thì hệ thống nhận ngay tại đây, còn lại chờ chủ xe bấm duyệt. Nhánh này phải ở
   * lại cho tới khi không còn yêu cầu nào của thời kỳ đó chờ quyết định.
   *
   * Trả `null` nghĩa là "tiền đã vào, chưa có đơn" — chỉ xảy ra ở nhánh legacy, và là một kết
   * cục HỢP LỆ chứ không phải lỗi.
   */
  private async settleFullPaymentWithinTx(
    tx: Prisma.TransactionClient,
    holdId: string,
    providerTxId: string,
  ): Promise<string | null> {
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { id: holdId },
      select: {
        id: true,
        code: true,
        tenantId: true,
        bookingRequestId: true,
        customerUserId: true,
        paidAmount: true,
        bookingRequest: {
          select: {
            id: true,
            serviceType: true,
            customerName: true,
            /*
             * ĐÃ CÓ AI NHẬN CHUYẾN TRƯỚC KHI TIỀN VỀ CHƯA — thứ phân biệt hai thời kỳ sinh hold,
             * và nó quyết định tiền về thì mở đơn hay còn phải chờ:
             *
             *   - hold sinh lúc CHUYẾN ĐƯỢC NHẬN (ADR 0044, đường hiện hành): `decided_at` luôn
             *     có ⇒ tiền về là mở đơn ngay;
             *   - hold LEGACY sinh lúc KHÁCH GỬI (ADR 0039): cột này cố ý để trống vì chưa ai
             *     quyết định gì ⇒ tiền về mới đi tìm người nhận.
             *
             * Thiếu phép phân biệt này thì mọi đơn của luồng hiện hành bắt gian hàng duyệt HAI
             * lần, lần sau cho một chuyến họ đã đồng ý và khách đã trả tiền.
             */
            decidedAt: true,
            vehicle: { select: { name: true } },
          },
        },
      },
    });

    /*
     * Chiếm quyền trên YÊU CẦU bằng điều kiện trong WHERE, không đọc-rồi-ghi. `count = 0` nghĩa
     * là yêu cầu đã rời `awaiting_hold` giữa chừng (khách huỷ đúng lúc tiền về) — quay đầu cả
     * transaction để tiền nằm lại `bank_transactions` cho admin, thay vì để lại một hold `paid`
     * treo trên một yêu cầu đã huỷ.
     */
    const claimed = await tx.bookingRequest.updateMany({
      where: {
        id: hold.bookingRequestId,
        tenantId: hold.tenantId,
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      },
      data: {
        status: BOOKING_REQUEST_STATUS.HOLD_PAID,
        /*
         * ĐỒNG HỒ CỦA CHỦ XE BẮT ĐẦU LẠI TỪ ĐÂY.
         *
         * `respond_by` cũ được đặt lúc khách bấm gửi, khi chưa ai nợ ai điều gì. Nghĩa vụ trả
         * lời chỉ phát sinh khi tiền đã về — và nếu giữ mốc cũ thì một khách trả tiền ở phút
         * cuối cửa sổ sẽ đẩy chủ xe vào thế quá hạn ngay lập tức, rồi worker hoàn tiền trước cả
         * khi gian hàng kịp nhìn thấy thông báo.
         */
        respondBy: bookingRequestRespondBy(new Date()),
      },
    });
    if (claimed.count === 0) {
      throw new Error(`Yêu cầu ${hold.bookingRequestId} không còn chờ giữ chỗ khi tiền về`);
    }

    await this.audit.record(
      {
        tenantId: hold.tenantId,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_hold.paid',
        targetType: 'booking_hold',
        targetId: holdId,
        after: { code: hold.code, paidAmount: hold.paidAmount.toString(), providerTxId },
      },
      tx,
    );

    /*
     * CHUYẾN ĐÃ ĐƯỢC NHẬN TỪ TRƯỚC (đường hiện hành — ADR 0044) ⇒ tiền về là mở đơn, không hỏi
     * lại ai.
     *
     * Chỉ dữ liệu LEGACY ADR 0039 mới phải đi tìm người nhận ở đây: xe bật "Đặt ngay" thì hệ
     * thống nhận ngay, còn lại nằm ở `hold_paid` chờ chủ xe.
     */
    const bookingId =
      hold.bookingRequest.decidedAt != null
        ? await this.convertPaidHoldWithinTx(tx, hold.bookingRequestId, hold.tenantId, {
            actorUserId: null,
            actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
          })
        : await this.tryAutoApproveWithinTx(tx, hold.bookingRequestId, hold.tenantId);

    if (bookingId === null) {
      await this.notifications.emitToTenantMembers(
        hold.tenantId,
        {
          type: NOTIFICATION_TYPE.HOLD_PAID,
          title: 'Khách đã cọc giữ chỗ — chờ bạn xác nhận',
          body: `${hold.bookingRequest.vehicle.name} · ${hold.bookingRequest.customerName}`,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: hold.bookingRequestId,
        },
        tx,
      );
      if (hold.customerUserId) {
        await this.notifications.emitToUser(
          hold.customerUserId,
          {
            type: NOTIFICATION_TYPE.HOLD_PAID,
            title: 'Đã giữ chỗ thành công',
            body: `${hold.bookingRequest.vehicle.name} · chỗ của bạn đã được giữ, đang chờ chủ xe xác nhận. Nếu chủ xe từ chối, toàn bộ số tiền được hoàn ngay.`,
            tenantId: hold.tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
            targetId: hold.bookingRequestId,
          },
          tx,
        );
      }
    }

    return bookingId;
  }

  /**
   * **CHỈ cho dữ liệu LEGACY ADR 0039.** Xe bật "Đặt ngay" và yêu cầu đủ điều kiện ⇒ hệ thống
   * nhận chuyến ngay khi tiền về.
   *
   * Luồng hiện hành không đi qua đây: việc tự nhận xảy ra lúc khách GỬI yêu cầu, qua cùng đường
   * duyệt tay (`BookingRequestsService.tryAutoAccept` → `commitDecision`), nên khi tiền về thì
   * chuyến đã có người nhận từ trước. Hàm này còn để những hold sinh trước 22/09/2026 — lúc đó
   * tiền đi trước quyết định — vẫn tự mở được đơn thay vì bắt chủ xe bấm thêm một lần.
   *
   * Điều kiện tiền bạc (`holdRequired`, `quoteIsEstimate`) KHÔNG hỏi lại ở đây: tiền đã về rồi,
   * và hai cờ đó chỉ có nghĩa ở thời điểm quyết định CÓ thu hay không. Thứ còn phải hỏi là điều
   * kiện VẬN HÀNH — xe có bật tự nhận không, giờ nhận có nằm trong khung giao xe không, chuyến
   * có đủ thời lượng tối thiểu không.
   *
   * Chuyến CÓ TÀI XẾ tự nhận được ở đây vì tiền đã về và đơn được tạo NGAY trong transaction
   * này, nên gán tài xế an toàn đúng bằng lúc gian hàng bấm duyệt tay —
   * `bookings_driver_schedule_excl` vẫn là trọng tài. Không gán được tài xế rảnh thì về chờ
   * duyệt tay, y như cũ.
   */
  private async tryAutoApproveWithinTx(
    tx: Prisma.TransactionClient,
    requestId: string,
    tenantId: string,
  ): Promise<string | null> {
    const req = await tx.bookingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        vehicleId: true,
        serviceType: true,
        pickupAt: true,
        returnAt: true,
        rentalTerms: true,
      },
    });

    const [setting, windows] = await Promise.all([
      this.settings.serviceSettingFor(tx, req.vehicleId, req.serviceType as ServiceType),
      this.settings.handoverWindowsFor(tx, req.vehicleId),
    ]);
    const terms = req.rentalTerms as unknown as RentalTermsSnapshot | null;
    const blocker = this.settings.evaluateAutoAccept(setting, windows, {
      serviceType: req.serviceType,
      pickupAt: req.pickupAt,
      returnAt: req.returnAt,
      quoteIsEstimate: false,
      holdRequired: false,
      termsAccepted: !setting.requireTermsAcceptance || terms?.termsAcceptedAt != null,
    });
    if (blocker) {
      await this.recordAutoAcceptSkip(tx, tenantId, requestId, blocker);
      return null;
    }

    /*
     * Tài xế chọn ở ĐÂY, trong chính transaction tạo đơn. `pickAssignableDriver` chỉ lọc theo
     * dữ liệu đã đọc được; trọng tài thật là `bookings_driver_schedule_excl` lúc ghi (ADR 0006).
     * Không có ai rảnh ⇒ về chờ duyệt tay, KHÔNG tự từ chối khách.
     */
    let driverId: string | null = null;
    if (req.serviceType === SERVICE_TYPE.WITH_DRIVER) {
      if (!req.pickupAt || !req.returnAt) return null;
      const driver = await this.settings.pickAssignableDriver(tx, tenantId, {
        pickupAt: req.pickupAt,
        returnAt: req.returnAt,
      });
      if (!driver) {
        await this.recordAutoAcceptSkip(tx, tenantId, requestId, AUTO_ACCEPT_BLOCKER.NO_DRIVER);
        return null;
      }
      driverId = driver.id;
    }

    return this.convertPaidHoldWithinTx(
      tx,
      requestId,
      tenantId,
      { actorUserId: null, actorScope: AUDIT_ACTOR_SCOPE.SYSTEM },
      driverId,
    );
  }

  /**
   * Dấu vết "hệ thống đã cân nhắc và bỏ qua" — chủ xe đọc được vì sao chuyến không tự nhận.
   *
   * KHÔNG ghi khi lý do là `disabled`: phần lớn gian hàng không bật "Đặt ngay", và một dòng audit
   * cho mỗi lượt đặt của họ chỉ làm nhật ký dài ra mà không nói thêm điều gì. Cùng cách cư xử
   * với đường tự nhận lúc gửi, nơi ứng viên không bật thì còn chẳng được cân nhắc.
   */
  private async recordAutoAcceptSkip(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestId: string,
    blocker: AutoAcceptBlocker,
  ): Promise<void> {
    if (blocker === AUTO_ACCEPT_BLOCKER.DISABLED) return;
    await this.audit.record(
      {
        tenantId,
        actorUserId: null,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_request.auto_accept_skipped',
        targetType: 'booking_request',
        targetId: requestId,
        after: { blocker },
      },
      tx,
    );
  }

  /**
   * Yêu cầu ĐÃ TRẢ TIỀN được NHẬN ⇒ ĐƠN THUÊ. Tạo từ snapshot đã đóng băng trên hold; lịch của
   * yêu cầu nhả ra rồi lịch của đơn đặt vào — cùng transaction, nên không có khoảng nào chỗ bị hở.
   *
   * Hai lối vào, cùng một thân: hệ thống tự nhận ngay khi tiền về, hoặc chủ xe bấm duyệt sau đó.
   */
  async convertPaidHoldWithinTx(
    tx: Prisma.TransactionClient,
    requestId: string,
    tenantId: string,
    actor: { actorUserId: string | null; actorScope: AuditActorScope },
    /** Tài xế hệ thống vừa chọn cho chuyến CÓ TÀI XẾ — duyệt tay gán sau ở màn đơn. */
    driverId: string | null = null,
  ): Promise<string> {
    const hold = await tx.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: requestId, tenantId, status: BOOKING_HOLD_STATUS.PAID },
      select: { id: true },
    });
    return this.convertWithinTx(tx, hold.id, actor, driverId);
  }

  private async convertWithinTx(
    tx: Prisma.TransactionClient,
    holdId: string,
    actor: { actorUserId: string | null; actorScope: AuditActorScope },
    driverId: string | null = null,
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
        driverId,
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

    /*
     * Chiếm từ `hold_paid` — trạng thái của một yêu cầu đã trả tiền và đang chờ người nhận.
     * `count = 0` nghĩa là ai đó vừa xử lý xong yêu cầu này (chủ xe bấm duyệt đúng lúc hệ thống
     * tự nhận, hoặc khách huỷ): quay đầu cả transaction, đơn vừa tạo biến mất.
     */
    const systemAccepted = actor.actorScope === AUDIT_ACTOR_SCOPE.SYSTEM;
    const claimed = await tx.bookingRequest.updateMany({
      where: { id: req.id, tenantId: hold.tenantId, status: BOOKING_REQUEST_STATUS.HOLD_PAID },
      data: {
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: booking.id,
        /*
         * HỆ THỐNG tự nhận thì ghi dấu quyết định NGAY TẠI ĐÂY — đường duyệt tay đã ghi
         * `decided_*` trước khi gọi vào (xem `acceptPaidRequest`), nên ghi đè ở đây sẽ xoá mất
         * tên người đã bấm. Một đơn không biết ai nhận nó là một đơn không truy trách nhiệm được.
         */
        ...(systemAccepted
          ? {
              decidedBy: null,
              decidedAt: new Date(),
              decisionSource: BOOKING_REQUEST_DECISION_SOURCE.SYSTEM,
            }
          : {}),
      },
    });
    if (claimed.count === 0) {
      throw new Error(`Yêu cầu ${req.id} không còn ở trạng thái đã cọc chờ duyệt`);
    }
    await tx.bookingHold.update({ where: { id: holdId }, data: { bookingId: booking.id } });

    /*
     * MÃ KHUYẾN MÃI — CHỐT lượt tại đây (ADR 0046 điều 6).
     *
     * Đây là điểm DUY NHẤT của nhánh có thu tiền giữ chỗ mà một ĐƠN ra đời (ADR 0044 điều 2),
     * nên nó cũng là điểm duy nhất một lượt mã chuyển từ GIỮ sang ĐÃ DÙNG. Chốt bằng con số đã
     * đóng băng trong snapshot giá của hold, không bằng số tạm lúc khách áp mã.
     *
     * Số 0 vẫn gọi: `redeemPromoRedemption` tự bỏ qua khi yêu cầu không có lượt nào.
     */
    await redeemPromoRedemption(tx, {
      bookingRequestId: req.id,
      bookingId: booking.id,
      discountAmount: snapshot.fees?.promoDiscountAmount ?? '0',
    });

    await this.audit.record(
      {
        tenantId: hold.tenantId,
        actorUserId: actor.actorUserId,
        actorScope: actor.actorScope,
        action: 'booking_request.accept_paid',
        targetType: 'booking_hold',
        targetId: holdId,
        after: {
          code: hold.code,
          paidAmount: hold.paidAmount.toString(),
          bookingId: booking.id,
          bookingCode: booking.code,
        },
      },
      tx,
    );

    /*
     * Hai câu khác nhau cho hai người khác nhau đã quyết định. Gian hàng cần biết ngay là chuyến
     * này họ KHÔNG phải làm gì (hệ thống nhận hộ) hay là ghi nhận cú bấm của chính họ — gộp một
     * câu thì người trực không phân biệt được đơn nào đã có người xử lý.
     */
    await this.notifications.emitToTenantMembers(
      hold.tenantId,
      systemAccepted
        ? {
            type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED,
            title: `Đã tự động nhận chuyến: ${req.customerName}`,
            body: `${req.vehicle.name} · khách đã cọc, đơn ${booking.code} đã tạo`,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          }
        : {
            type: NOTIFICATION_TYPE.HOLD_PAID,
            title: `Đã nhận chuyến: đơn ${booking.code}`,
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

  /**
   * Yêu cầu ĐÃ TRẢ TIỀN bị TỪ CHỐI hoặc hết hạn phản hồi ⇒ hoàn đủ, nhả chỗ (ADR 0039 điều 5).
   *
   * Khách không làm gì sai ở đây: họ đã trả tiền và đã chờ. Nên hoàn **toàn bộ** `D + S + IV +
   * IP`, không chia đôi, không giữ lại phí dịch vụ — `split_late_cancel` là kết cục của việc
   * khách đổi ý muộn, không phải của việc gian hàng không nhận chuyến.
   *
   * Khách có tài khoản thì `upsertRefundWithinTx` ghi có VÍ ĐIỂM ngay trong chính transaction
   * này; khách vãng lai thì thành phiếu chờ admin chuyển tay (ADR 0033 điều 5). Không có đường
   * nào khác — đây cũng là đường mà mọi khoản hoàn khác đi qua.
   */
  async releasePaidHoldWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      requestId: string;
      tenantId: string;
      reason: 'owner_reject' | 'respond_timeout';
      actorUserId: string | null;
      actorScope: AuditActorScope;
    },
  ): Promise<void> {
    /*
     * Chiếm bằng điều kiện trong WHERE: chỉ hold `paid` CHƯA có kết cục mới được chốt ở đây.
     * `count = 0` nghĩa là ai đó đã chốt rồi (worker và chủ xe bấm cùng lúc) — không ghi đè,
     * không hoàn lần thứ hai.
     */
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: input.requestId },
      select: {
        id: true,
        code: true,
        amount: true,
        paidAmount: true,
        customerUserId: true,
        vehicle: { select: { name: true } },
      },
    });
    const claimed = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: BOOKING_HOLD_STATUS.PAID, outcome: null },
      data: {
        status: BOOKING_HOLD_STATUS.RELEASED,
        outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
        releasedAt: new Date(),
        /*
         * Phân bổ ba vế phải khớp bốn dòng tiền — `booking_holds_settled_allocation_check` canh
         * ở DB, không phải một quy ước trong code. Hoàn 100% nghĩa là toàn bộ về phía KHÁCH và
         * không đồng nào cho chủ xe, nền tảng, hãng bảo hiểm hay thuế.
         */
        settledCustomerAmount: hold.amount,
        settledOwnerAmount: new Prisma.Decimal(0),
        settledPlatformAmount: new Prisma.Decimal(0),
        settledInsurerAmount: new Prisma.Decimal(0),
        settledTaxAmount: new Prisma.Decimal(0),
      },
    });
    // Nhả lịch dù có chốt được hold hay không: chỗ đã mất lý do tồn tại kể từ khi yêu cầu đóng.
    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, input.requestId);
    if (claimed.count === 0) return;

    if (hold.paidAmount.gt(0)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: input.tenantId,
        customerUserId: hold.customerUserId,
        amount: hold.paidAmount,
        reason: HOLD_REFUND_REASON.OWNER_CANCEL,
        note:
          input.reason === 'owner_reject'
            ? 'Gian hàng từ chối sau khi khách đã giữ chỗ'
            : 'Gian hàng không phản hồi trong hạn sau khi khách đã giữ chỗ',
      });
    }

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorScope,
        action: 'booking_hold.release_unaccepted',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: { code: hold.code, refunded: hold.paidAmount.toString(), reason: input.reason },
      },
      tx,
    );

    if (hold.customerUserId) {
      await this.notifications.emitToUser(
        hold.customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_REFUNDED,
          title: 'Chuyến không thành — đã hoàn tiền giữ chỗ',
          body: `${hold.vehicle.name} · hoàn ${formatMoneyVndVi(hold.paidAmount.toFixed(0))}`,
          tenantId: input.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: input.requestId,
        },
        tx,
      );
    }
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

  /**
   * KHÁCH huỷ khi đã trả đủ nhưng gian hàng CHƯA NHẬN chuyến ⇒ hoàn 100% (ADR 0039 điều 5).
   *
   * Hoàn đủ, không chia đôi, và không hỏi `free_cancel_until` — lý do là nghiệp vụ chứ không
   * phải số học: `split_late_cancel` tồn tại để bù cho gian hàng khi họ ĐÃ NHẬN chuyến, đã giữ
   * xe cho khách và mất cơ hội cho khách khác. Ở chặng này họ chưa nhận gì cả; giữ lại tiền của
   * khách cho một cam kết chưa từng được đưa ra là lấy tiền không có căn cứ.
   *
   * (Trên thực tế chặng này cũng luôn nằm trong cửa sổ huỷ miễn phí — nó kéo dài nhiều nhất là
   * `HOLD_TOTAL_WINDOW_MINUTES` + hạn phản hồi của gian hàng, ngắn hơn hẳn 4 giờ. Nhưng luật ở
   * đây KHÔNG dựa vào phép cộng đó: đổi một trong hai con số không được phép lặng lẽ biến một
   * khoản hoàn đủ thành một khoản chia đôi.)
   */
  async cancelPaidHoldForCustomerWithinTx(
    tx: Prisma.TransactionClient,
    input: { requestId: string; tenantId: string; actorUserId: string },
  ): Promise<void> {
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: input.requestId },
      select: { id: true, code: true, amount: true, paidAmount: true, customerUserId: true },
    });
    const claimed = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: BOOKING_HOLD_STATUS.PAID, outcome: null },
      data: {
        status: BOOKING_HOLD_STATUS.RELEASED,
        outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
        releasedAt: new Date(),
        /*
         * Phân bổ ba vế phải khớp bốn dòng tiền — `booking_holds_settled_allocation_check` canh
         * ở DB, không phải một quy ước trong code. Hoàn 100% nghĩa là toàn bộ về phía KHÁCH và
         * không đồng nào cho chủ xe, nền tảng, hãng bảo hiểm hay thuế.
         */
        settledCustomerAmount: hold.amount,
        settledOwnerAmount: new Prisma.Decimal(0),
        settledPlatformAmount: new Prisma.Decimal(0),
        settledInsurerAmount: new Prisma.Decimal(0),
        settledTaxAmount: new Prisma.Decimal(0),
      },
    });
    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, input.requestId);
    if (claimed.count === 0) return;
    if (hold.paidAmount.gt(0)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: input.tenantId,
        customerUserId: hold.customerUserId,
        amount: hold.paidAmount,
        reason: HOLD_REFUND_REASON.EARLY_CANCEL,
        note: 'Khách huỷ khi gian hàng chưa nhận chuyến',
      });
    }
    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        action: 'booking_hold.cancel_paid',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: { code: hold.code, refunded: hold.paidAmount.toString() },
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
    /*
     * THUẾ (Phase 8): phần đã khấu trừ khỏi chủ xe nhưng CHƯA nộp cơ quan thuế —
     * `accrued` + `declared`. Tiền đó đang nằm trong tài khoản XePrime và thuộc về cơ quan thuế,
     * nên nó là nghĩa vụ giữ hộ đúng nghĩa.
     *
     * ⚠️ KHÔNG trừ khỏi `holdsUnsettled`: thuế chỉ phát sinh khi chuyến ĐÃ BẮT ĐẦU, mà hold chưa
     * chốt thì chuyến chưa kết thúc — hai tập hợp giao nhau ở những chuyến đang chạy. Ở đó phần
     * `T` nằm cả trong `paid_amount` của hold lẫn trong sổ thuế, nên dòng dưới trừ lại phần trùng
     * y như cách làm với bảo hiểm.
     */
    const taxGross = await this.tax.unpaidAsOf(end);
    const taxInOpenHolds = await this.taxInsideUnsettledHolds(end);
    const taxAccrued = taxGross.sub(taxInOpenHolds);
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
   * Thuế nằm TRONG các hold chưa chốt — phần bị đếm hai lần nếu không trừ ra (cùng lý do với
   * `premiumInsideUnsettledHolds`).
   *
   * Giao nhau xảy ra ở chuyến ĐANG CHẠY: thuế đã phát sinh (`to = ACTIVE`) nhưng hold chưa chốt
   * kết cục (chuyến chưa kết thúc). Ở đó `T` nằm cả trong `paid_amount` của hold lẫn trong sổ
   * thuế, và cộng cả hai làm chênh lệch dương đúng bằng tổng thuế của các chuyến đang chạy.
   */
  private async taxInsideUnsettledHolds(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.taxWithholding.aggregate({
      where: {
        accruedAt: { lt: end },
        status: { in: [...TAX_WITHHOLDING_STATUS_UNPAID] },
        booking: { hold: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } } },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
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
