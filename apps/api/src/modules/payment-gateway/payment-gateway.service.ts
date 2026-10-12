import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  isAwaitingPayment,
  isHoldPastDue,
  isSubscriptionInvoicePayable,
  PARTNER_PAYMENT_RETURN_PATH,
  PAYMENT_GATEWAY_AMOUNT_LIMITS,
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES,
  PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES,
  PAYMENT_GATEWAY_NOT_FOUND_GRACE_MINUTES,
  PAYMENT_GATEWAY_ORDER_TTL_MINUTES,
  PAYMENT_GATEWAY_PROVIDER,
  PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS,
  PAYMENT_ORDER_APPLY_OUTCOME,
  PAYMENT_ORDER_RESULT_SOURCE,
  PAYMENT_ORDER_REVIEW_REASON,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_RETURN_PARAM,
  PAYMENT_NATIVE_TRIP_RETURN_PATH,
  PAYMENT_RETURN_TRIP_PATH,
  type AppLocale,
  type BookingHoldStatus,
  type PaymentGatewayClient,
  type PaymentGatewayProvider,
  type PaymentOrderApplyOutcome,
  type PaymentOrderResultSource,
  type PaymentOrderReviewReason,
  type PaymentOrderTarget,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestRealmService } from '../auth/request-realm.service';
import { BillingService } from '../billing/billing.service';
import { BookingHoldsService, type HoldPaymentOutcome } from '../holds/booking-holds.service';
import type { PaymentGatewayMethodsDto, PaymentOrderDto } from './dto/payment-gateway.dto';
import { PaymentGatewayConfig } from './payment-gateway.config';
import { PAYMENT_ORDER_VIEW_SELECT, toPaymentOrderDto } from './payment-order.view';
import {
  normalizeClientIp,
  PaymentProviderError,
  type PaymentGatewayAdapter,
  type ProviderPaymentResult,
} from './providers/gateway-adapter';
import { MomoAdapter } from './providers/momo.adapter';
import { VNPAY_IPN_RESPONSE, type VnpayIpnResponse } from './providers/vnpay.protocol';
import { VnpayAdapter } from './providers/vnpay.adapter';

const MINUTE_MS = 60_000;
/** Liên kết còn ít hơn chừng này thì không đưa lại cho khách — họ mở ra là đã hết hạn. */
const REUSE_MIN_REMAINING_MS = MINUTE_MS;
/** Cho IPN một nhịp để tới trước khi server tự hỏi cổng — khách thường quay về cùng lúc với IPN. */
const QUERY_MIN_AGE_MS = 10_000;

/** Những gì cần để đối chiếu một lượt với cổng / áp lại một lượt đã thu. */
const SETTLE_SELECT = {
  id: true,
  provider: true,
  status: true,
  appliedAt: true,
  reviewStatus: true,
  reviewReason: true,
  providerOrderRef: true,
  providerCreatedAt: true,
  targetCode: true,
  createdAt: true,
} satisfies Prisma.PaymentGatewayOrderSelect;

type SettleRow = Prisma.PaymentGatewayOrderGetPayload<{ select: typeof SETTLE_SELECT }>;

type InvoicePaymentOutcome = Awaited<
  ReturnType<BillingService['applyBankPaymentWithinTx']>
>['outcome'];

export interface CheckoutRequest {
  provider: PaymentGatewayProvider;
  client: PaymentGatewayClient;
  locale: AppLocale;
  clientIp: string;
  actorUserId: string;
}

/** Đích đã đọc và kiểm dưới khoá — mọi con số ở đây đến từ DB. */
interface PreparedTarget {
  targetType: PaymentOrderTarget;
  subscriptionInvoiceId: string | null;
  bookingHoldId: string | null;
  targetCode: string;
  tenantId: string;
  /** Phần còn thiếu của đích — số tiền DUY NHẤT được gửi sang cổng. */
  amount: Prisma.Decimal;
  orderInfo: string;
  expiresAt: Date;
  returnUrl: (orderId: string) => string;
}

/**
 * Hệ thống đã làm gì với MỘT kết quả của cổng — đủ để IPN chọn đúng câu trả lời và để nhật ký sự
 * kiện ghi lại hệ quả.
 */
export type RecordOutcome =
  | 'order_not_found'
  | 'amount_mismatch'
  | 'pending'
  | 'recorded_failure'
  | 'already_final'
  | 'succeeded'
  | 'already_succeeded'
  | 'flagged'
  | 'duplicate_provider_tx';

/** Kết quả một lượt đối chiếu (`settle`) — người trực và bộ quét cần biết đã có gì đổi không. */
export type SettleResult = 'applied' | 'recorded' | 'no_change' | 'unreachable' | 'skipped';

/** Kết quả "đã đổi trạng thái" — mọi giá trị còn lại là không có gì mới. */
const CHANGING_OUTCOMES: readonly RecordOutcome[] = [
  'succeeded',
  'recorded_failure',
  'amount_mismatch',
  'flagged',
  'duplicate_provider_tx',
];

/**
 * Điều phối thanh toán qua cổng MoMo · VNPAY — ADR 0058 (Proposed). Writer DUY NHẤT của
 * `payment_gateway_orders` và `payment_gateway_order_events`.
 *
 * Năm điều đóng đinh, xếp theo thứ tự sống còn:
 *
 *  1. **Chỉ kết quả ĐÃ XÁC MINH phía server đổi được tiền.** IPN (chữ ký của cổng) hoặc truy vấn mà
 *     chính server gửi đi. Trình duyệt quay về chỉ mang ID của lượt.
 *  2. **Một đường tiền.** Hiệu ứng lên hoá đơn gói / khoản giữ chỗ đi qua ĐÚNG hai hàm mà webhook
 *     SePay gọi (`applyBankPaymentWithinTx`) — mọi luật đã có (thiếu, thừa, hold quá hạn theo MỐC)
 *     áp nguyên.
 *  3. **Ghi nhận trước, áp sau — hai transaction.** Kết quả của cổng được ghi (dưới khoá dòng, kèm một
 *     dòng nhật ký) và COMMIT trước khi áp; lượt áp hỏng không cuốn mất bằng chứng tiền đã về.
 *     `applied_at` ghi CÙNG transaction với hiệu ứng tiền, nên `NULL` chứng minh chưa có gì được áp.
 *  4. **Người trực thắng máy.** Lượt đã được ĐÓNG ở hàng đợi không bao giờ được máy tự áp tiền nữa —
 *     người trực có thể đã hoàn tay. Kết quả tới sau chỉ mở lại hàng đợi; áp là việc của người, có audit.
 *  5. **Idempotent bằng DB.** Unique `(provider, provider_order_ref)` + `(provider, provider_tx_id)`;
 *     mọi lượt ghi khoá dòng (`FOR UPDATE`) rồi đọc lại.
 *
 * Không có đường tự hoàn tiền qua cổng: chính sách chưa được quyết (ADR 0058 Q3/Q4).
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly adapters: Readonly<Record<PaymentGatewayProvider, PaymentGatewayAdapter>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PaymentGatewayConfig,
    private readonly billing: BillingService,
    private readonly holds: BookingHoldsService,
    private readonly realms: RequestRealmService,
    private readonly audit: AuditService,
    momo: MomoAdapter,
    vnpay: VnpayAdapter,
  ) {
    this.adapters = {
      [PAYMENT_GATEWAY_PROVIDER.MOMO]: momo,
      [PAYMENT_GATEWAY_PROVIDER.VNPAY]: vnpay,
    };
  }

  // ── Phương thức đang mở ─────────────────────────────────────────────────────

  methods(target: PaymentOrderTarget): PaymentGatewayMethodsDto {
    return {
      target,
      sandbox: this.config.sandbox,
      methods: this.config.providersFor(target).map((provider) => {
        const limits = PAYMENT_GATEWAY_AMOUNT_LIMITS[provider];
        return {
          provider,
          minAmount: limits.min === null ? null : String(limits.min),
          maxAmount: limits.max === null ? null : String(limits.max),
        };
      }),
    };
  }

  // ── Mở phiên ─────────────────────────────────────────────────────────────────

  /** Gian hàng trả MỘT hoá đơn gói của chính mình (tenant từ phiên, không từ client). */
  startInvoiceCheckout(
    tenantId: string,
    invoiceId: string,
    request: CheckoutRequest,
  ): Promise<PaymentOrderDto> {
    return this.startCheckout(PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE, request, (tx, now) =>
      this.prepareInvoice(tx, now, tenantId, invoiceId, request.client),
    );
  }

  /** Khách trả tiền giữ chỗ của CHÍNH chuyến mình — quyền sở hữu nằm trong câu truy vấn. */
  startHoldCheckout(
    customerUserId: string,
    tripId: string,
    request: CheckoutRequest,
  ): Promise<PaymentOrderDto> {
    return this.startCheckout(PAYMENT_ORDER_TARGET.BOOKING_HOLD, request, (tx, now) =>
      this.prepareHold(tx, now, customerUserId, tripId, request.client),
    );
  }

  /**
   * Khung chung: kiểm phương thức → (transaction) khoá đích, đọc số tiền, chặn trả lần hai, dùng lại
   * phiên còn hạn hoặc ghi lượt mới → (ngoài transaction) gọi cổng → lưu liên kết.
   *
   * Gọi cổng NGOÀI transaction: một cổng treo 30 giây không được giữ khoá đích 30 giây. Lượt đã được
   * ghi trước khi gọi, nên IPN tới (dù sớm cách mấy) luôn tìm thấy nó.
   */
  private async startCheckout(
    target: PaymentOrderTarget,
    request: CheckoutRequest,
    prepare: (tx: Prisma.TransactionClient, now: Date) => Promise<PreparedTarget>,
  ): Promise<PaymentOrderDto> {
    const adapter = this.availableAdapter(request.provider, target);
    // Giây chẵn: mốc này được định dạng thành `vnp_CreateDate` và phải tái tạo y hệt lúc truy vấn.
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    const { orderId, reused, prepared } = await this.prisma.$transaction(async (tx) => {
      const p = await prepare(tx, now);
      this.assertAmountInRange(request.provider, p.amount);
      const targetWhere = {
        subscriptionInvoiceId: p.subscriptionInvoiceId,
        bookingHoldId: p.bookingHoldId,
      };

      /*
       * Cổng đã thu cho chính đích này mà hệ thống chưa ghi nhận xong (đang áp, hoặc áp hỏng chờ thử
       * lại) ⇒ KHÔNG mở phiên mới: đích sắp đủ tiền, và một phiên nữa là mời khách trả lần hai.
       */
      const inFlight = await tx.paymentGatewayOrder.count({
        where: {
          ...targetWhere,
          status: PAYMENT_ORDER_STATUS.SUCCEEDED,
          appliedAt: null,
          reviewStatus: { not: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED },
        },
      });
      if (inFlight > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.PAYMENT_ORDER_IN_PROGRESS,
          message: 'Một khoản thanh toán qua cổng cho mục này đang được ghi nhận',
        });
      }

      const reusable = await tx.paymentGatewayOrder.findFirst({
        where: {
          ...targetWhere,
          provider: request.provider,
          status: PAYMENT_ORDER_STATUS.PENDING,
          reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.NONE,
          client: request.client,
          amount: p.amount,
          checkoutUrl: { not: null },
          expiresAt: { gt: new Date(now.getTime() + REUSE_MIN_REMAINING_MS) },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (reusable) return { orderId: reusable.id, reused: true, prepared: p };

      const id = newId();
      await tx.paymentGatewayOrder.create({
        data: {
          id,
          provider: request.provider,
          targetType: p.targetType,
          subscriptionInvoiceId: p.subscriptionInvoiceId,
          bookingHoldId: p.bookingHoldId,
          targetCode: p.targetCode,
          tenantId: p.tenantId,
          initiatedBy: request.actorUserId,
          // ULID — chỉ chữ số và chữ in hoa, khớp `orderId` của MoMo và `vnp_TxnRef` của VNPAY.
          providerOrderRef: id,
          amount: p.amount,
          client: request.client,
          providerCreatedAt: now,
          expiresAt: p.expiresAt,
        },
      });
      return { orderId: id, reused: false, prepared: p };
    });

    if (!reused) {
      try {
        const created = await adapter.createPayment({
          orderRef: orderId,
          amount: Number(prepared.amount.toFixed(0)),
          orderInfo: prepared.orderInfo,
          returnUrl: prepared.returnUrl(orderId),
          createdAt: now,
          expiresAt: prepared.expiresAt,
          clientIp: normalizeClientIp(request.clientIp),
          locale: request.locale,
        });
        await this.prisma.paymentGatewayOrder.update({
          where: { id: orderId },
          data: {
            checkoutUrl: created.checkoutUrl,
            ...(created.raw ? { createResponseJson: created.raw as Prisma.InputJsonValue } : {}),
          },
        });
      } catch (error) {
        const reason = error instanceof PaymentProviderError ? error.reason : 'unexpected';
        if (error instanceof PaymentProviderError) {
          this.logger.warn(`${request.provider} ${orderId}: không mở được phiên (${reason})`);
        } else {
          this.logger.error(
            `${request.provider} ${orderId}: lỗi không lường trước khi mở phiên`,
            error instanceof Error ? error.stack : String(error),
          );
        }
        /*
         * Đánh dấu thất bại CHỈ khi lượt chưa có kết quả nào của cổng. Không có liên kết thì khách
         * không trả được — nhưng nếu một IPN thành công vẫn tới (cổng tạo phiên rồi mới timeout),
         * `recordProviderResult` vẫn nhận nó từ trạng thái này: tiền về là tiền về.
         */
        await this.prisma.paymentGatewayOrder.updateMany({
          where: { id: orderId, status: PAYMENT_ORDER_STATUS.PENDING, checkoutUrl: null },
          data: {
            status: PAYMENT_ORDER_STATUS.FAILED,
            providerResultCode: 'create_failed',
            providerMessage: reason.slice(0, 255),
          },
        });
        throw new BadGatewayException({
          code: API_ERROR_CODE.PAYMENT_GATEWAY_PROVIDER_ERROR,
          message: 'Không mở được phiên thanh toán của cổng — chưa có khoản tiền nào bị trừ',
          details: { provider: request.provider },
        });
      }
    }

    return this.loadDto(orderId);
  }

  private async prepareInvoice(
    tx: Prisma.TransactionClient,
    now: Date,
    tenantId: string,
    invoiceId: string,
    client: PaymentGatewayClient,
  ): Promise<PreparedTarget> {
    await this.lockTarget(tx, invoiceId);
    const invoice = await tx.subscriptionInvoice.findFirst({
      // Tenant nằm TRONG câu truy vấn: hoá đơn của gian hàng khác đơn giản là không tồn tại.
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        code: true,
        tenantId: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        expiresAt: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hoá đơn',
      });
    }
    const remaining = invoice.totalAmount.sub(invoice.paidAmount);
    if (!isSubscriptionInvoicePayable(invoice.status) || remaining.lte(0)) {
      throw notPayable(invoice.status);
    }

    // Hạn của phiên kết thúc trước hạn hoá đơn — hoá đơn quá hạn bị lật `void` và không nhận tiền nữa.
    const expiresAt = capExpiry(now, invoice.expiresAt);
    if (expiresAt.getTime() - now.getTime() < MINUTE_MS) throw notPayable(invoice.status);

    return {
      targetType: PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE,
      subscriptionInvoiceId: invoice.id,
      bookingHoldId: null,
      targetCode: invoice.code,
      tenantId: invoice.tenantId,
      amount: remaining,
      // Không dấu, không ký tự đặc biệt — yêu cầu của VNPAY cho `vnp_OrderInfo`.
      orderInfo: `Thanh toan goi XePrime ${invoice.code}`,
      expiresAt,
      // Lưu ý: `/payment-return` cần phiên partner — trình duyệt của app native không có cookie.
      // App Partner trả gói bằng IAP, không mở cổng; nếu sau này mở thì cần trang quay về công khai
      // như `PAYMENT_NATIVE_TRIP_RETURN_PATH` của site khách.
      returnUrl: (orderId) =>
        withNativeFlag(
          `${this.realms.webUrlFor(ACCOUNT_REALM.PARTNER)}${PARTNER_PAYMENT_RETURN_PATH}` +
            `?${PAYMENT_RETURN_PARAM.ORDER}=${orderId}`,
          client,
        ),
    };
  }

  private async prepareHold(
    tx: Prisma.TransactionClient,
    now: Date,
    customerUserId: string,
    tripId: string,
    client: PaymentGatewayClient,
  ): Promise<PreparedTarget> {
    const located = await tx.bookingHold.findFirst({
      // Quyền sở hữu nằm TRONG câu truy vấn; `tripId` nhận cả id yêu cầu lẫn id đơn như mọi
      // endpoint chuyến khác.
      where: { customerUserId, OR: [{ bookingRequestId: tripId }, { bookingId: tripId }] },
      select: { id: true },
    });
    if (!located) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy khoản giữ chỗ của chuyến này',
      });
    }
    await this.lockTarget(tx, located.id);
    // Đọc lại SAU khoá: giữa hai câu, webhook SePay có thể vừa trả đủ hoặc worker vừa nhả chỗ.
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { id: located.id },
      select: {
        id: true,
        code: true,
        tenantId: true,
        status: true,
        amount: true,
        paidAmount: true,
        expiresAt: true,
        bookingRequestId: true,
      },
    });

    const remaining = hold.amount.sub(hold.paidAmount);
    // Theo MỐC, không theo cột status — cùng kỷ luật `applyBankPaymentWithinTx` (ADR 0044 điều 7).
    if (
      !isAwaitingPayment(hold.status as BookingHoldStatus) ||
      isHoldPastDue(hold.expiresAt, now) ||
      remaining.lte(0)
    ) {
      throw notPayable(hold.status);
    }
    if (hold.expiresAt.getTime() - now.getTime() < PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES * MINUTE_MS) {
      throw new ConflictException({
        code: API_ERROR_CODE.PAYMENT_HOLD_WINDOW_TOO_SHORT,
        message: 'Thời hạn giữ chỗ còn quá ngắn để thanh toán qua cổng — vui lòng chuyển khoản',
        details: {
          expiresAt: hold.expiresAt.toISOString(),
          minWindowMinutes: PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES,
        },
      });
    }

    return {
      targetType: PAYMENT_ORDER_TARGET.BOOKING_HOLD,
      subscriptionInvoiceId: null,
      bookingHoldId: hold.id,
      targetCode: hold.code,
      tenantId: hold.tenantId,
      amount: remaining,
      orderInfo: `Tien giu cho XePrime ${hold.code}`,
      // Phiên của cổng kết thúc TRƯỚC hạn giữ chỗ — VNPAY tự từ chối một lượt trả sau khi chỗ đã nhả.
      expiresAt: capExpiry(now, hold.expiresAt),
      // App native: trình duyệt của app không có cookie phiên ⇒ trang chuyến (cần đăng nhập) kẹt.
      // Quay về trang CÔNG KHAI chỉ chuyển tiếp sang deep link của app.
      returnUrl: (orderId) =>
        client === PAYMENT_GATEWAY_CLIENT.NATIVE
          ? `${this.realms.webUrlFor(ACCOUNT_REALM.CUSTOMER)}${PAYMENT_NATIVE_TRIP_RETURN_PATH}` +
            `?${PAYMENT_RETURN_PARAM.NATIVE_TRIP}=${encodeURIComponent(hold.bookingRequestId)}` +
            `&${PAYMENT_RETURN_PARAM.TRIP_ORDER}=${orderId}`
          : `${this.realms.webUrlFor(ACCOUNT_REALM.CUSTOMER)}${PAYMENT_RETURN_TRIP_PATH}/` +
            `${encodeURIComponent(hold.bookingRequestId)}?${PAYMENT_RETURN_PARAM.TRIP_ORDER}=${orderId}`,
    };
  }

  /**
   * Khoá theo ĐÍCH cho tới hết transaction — hai cú bấm song song không mở hai phiên cho cùng một
   * khoản. `pgw:` giữ không gian khoá riêng (cùng cách `bank-account:` ở `BankAccountsService`).
   */
  private async lockTarget(tx: Prisma.TransactionClient, targetId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pgw:${targetId}`}))`;
  }

  /** Khoá DÒNG của một lượt tới hết transaction — mọi lượt ghi lên một lượt đi qua đây. */
  private async lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payment_gateway_orders WHERE id = ${orderId} FOR UPDATE`;
    return locked.length > 0;
  }

  private availableAdapter(
    provider: PaymentGatewayProvider,
    target: PaymentOrderTarget,
  ): PaymentGatewayAdapter {
    if (!this.config.isAvailable(provider, target)) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.PAYMENT_GATEWAY_UNAVAILABLE,
        message: 'Phương thức thanh toán này chưa mở',
        details: { provider, target },
      });
    }
    return this.adapters[provider];
  }

  /** VND nguyên, trong hạn mức cổng công bố — ngoài hạn mức thì cổng từ chối trên trang của nó. */
  private assertAmountInRange(provider: PaymentGatewayProvider, amount: Prisma.Decimal): void {
    const limits = PAYMENT_GATEWAY_AMOUNT_LIMITS[provider];
    const outOfRange =
      !amount.isInteger() ||
      amount.lte(0) ||
      (limits.min !== null && amount.lt(limits.min)) ||
      (limits.max !== null && amount.gt(limits.max)) ||
      !Number.isSafeInteger(Number(amount.toFixed(0)) * 100);
    if (outOfRange) {
      throw new ConflictException({
        code: API_ERROR_CODE.PAYMENT_AMOUNT_OUT_OF_RANGE,
        message: 'Số tiền nằm ngoài hạn mức của cổng thanh toán này',
        details: {
          provider,
          amount: amount.toFixed(0),
          min: limits.min === null ? null : String(limits.min),
          max: limits.max === null ? null : String(limits.max),
        },
      });
    }
  }

  // ── Đọc trạng thái (trang quay về) ──────────────────────────────────────────

  /** Lượt trả tiền giữ chỗ của CHÍNH khách này — chủ sở hữu là chủ của khoản giữ chỗ. */
  async orderForCustomer(customerUserId: string, orderId: string): Promise<PaymentOrderDto> {
    const owned = await this.prisma.paymentGatewayOrder.findFirst({
      where: {
        id: orderId,
        targetType: PAYMENT_ORDER_TARGET.BOOKING_HOLD,
        bookingHold: { customerUserId },
      },
      select: { id: true },
    });
    if (!owned) throw orderNotFound();
    await this.settle(orderId);
    return this.loadDto(orderId);
  }

  /** Lượt trả hoá đơn gói của gian hàng đang trong phạm vi (tenant từ membership). */
  async orderForTenant(tenantId: string, orderId: string): Promise<PaymentOrderDto> {
    const owned = await this.prisma.paymentGatewayOrder.findFirst({
      where: { id: orderId, targetType: PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE, tenantId },
      select: { id: true },
    });
    if (!owned) throw orderNotFound();
    await this.settle(orderId);
    return this.loadDto(orderId);
  }

  /**
   * Đưa một lượt tới gần sự thật nhất có thể: lượt đã thu mà chưa áp thì áp lại; lượt còn chờ thì hỏi
   * cổng (giới hạn nhịp, trừ khi `force`). Dùng bởi trang quay về, bộ quét định kỳ và người trực.
   *
   * Lượt đã ĐÓNG ở hàng đợi thì bỏ qua hoàn toàn — không hỏi cổng, không áp: người trực có thể đã hoàn
   * tay, và một kết quả "đã thu" tới sau cho CÙNG giao dịch đó không được biến thành một lần áp tiền.
   *
   * Không bao giờ ném: lỗi ở đây không làm hỏng lượt đọc của người đang chờ.
   */
  async settle(orderId: string, opts: { force?: boolean } = {}): Promise<SettleResult> {
    try {
      const order = await this.prisma.paymentGatewayOrder.findUnique({
        where: { id: orderId },
        select: SETTLE_SELECT,
      });
      if (!order || order.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.RESOLVED) return 'skipped';
      if (order.status === PAYMENT_ORDER_STATUS.SUCCEEDED && !order.appliedAt) {
        return (await this.applyPending(orderId)) ? 'applied' : 'no_change';
      }
      if (order.status === PAYMENT_ORDER_STATUS.PENDING) {
        return await this.refreshFromProvider(order, opts.force === true);
      }
      return 'skipped';
    } catch (error) {
      this.logger.error(
        `Lượt ${orderId}: đối chiếu với cổng lỗi`,
        error instanceof Error ? error.stack : String(error),
      );
      return 'unreachable';
    }
  }

  /**
   * Hỏi cổng trạng thái của một lượt còn chờ — server gọi đi, phản hồi xác minh ở adapter.
   *
   * Nhịp được CLAIM bằng `updateMany` có điều kiện trên `last_queried_at`: hai tab, bộ quét và người
   * trực cùng hỏi vẫn chỉ ra một request sang cổng mỗi `PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS`.
   */
  private async refreshFromProvider(order: SettleRow, force: boolean): Promise<SettleResult> {
    const now = Date.now();
    if (!force && now - order.createdAt.getTime() < QUERY_MIN_AGE_MS) return 'skipped';
    const provider = order.provider as PaymentGatewayProvider;
    if (!this.config.isConfigured(provider)) return 'unreachable';

    const threshold = new Date(now - PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS * 1000);
    const claimed = await this.prisma.paymentGatewayOrder.updateMany({
      where: {
        id: order.id,
        status: PAYMENT_ORDER_STATUS.PENDING,
        ...(force ? {} : { OR: [{ lastQueriedAt: null }, { lastQueriedAt: { lt: threshold } }] }),
      },
      data: { lastQueriedAt: new Date(now) },
    });
    if (claimed.count === 0) return 'skipped';

    const result = await this.adapters[provider].queryPayment({
      orderRef: order.providerOrderRef,
      createdAt: order.providerCreatedAt,
      orderInfo: `Truy van ${order.targetCode}`,
    });
    if (!result) return 'unreachable';
    const outcome = await this.recordProviderResult(provider, result, PAYMENT_ORDER_RESULT_SOURCE.QUERY);
    return CHANGING_OUTCOMES.includes(outcome) ? 'recorded' : 'no_change';
  }

  // ── Kết quả của cổng (IPN + truy vấn) ──────────────────────────────────────

  /**
   * Ghi MỘT kết quả đã xác minh của cổng — BƯỚC 1 của hai bước, trong transaction riêng có khoá dòng
   * và một dòng nhật ký; bước 2 (áp tiền) chạy ở `applyPending` sau khi bước 1 đã commit.
   */
  async recordProviderResult(
    provider: PaymentGatewayProvider,
    result: ProviderPaymentResult,
    source: PaymentOrderResultSource,
  ): Promise<RecordOutcome> {
    const order = await this.prisma.paymentGatewayOrder.findUnique({
      where: { provider_providerOrderRef: { provider, providerOrderRef: result.orderRef } },
      select: { id: true },
    });
    if (!order) {
      // Đã xác minh chữ ký mà không có đơn: mã của môi trường khác, hoặc một đơn đã bị gỡ. Một khoản
      // "đã thu" như vậy phải có người nhìn — ghi ở mức error để cảnh báo bắt được.
      const log = result.outcome === 'succeeded' ? this.logger.error : this.logger.warn;
      log.call(this.logger, `${provider}: kết quả đã xác minh cho đơn không tồn tại ${result.orderRef}`);
      return 'order_not_found';
    }

    let outcome: RecordOutcome;
    try {
      outcome = await this.prisma.$transaction((tx) =>
        this.recordWithinTx(tx, order.id, result, source),
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      // Cùng một giao dịch của cổng đã nằm trên một lượt KHÁC — không thể có ở luồng đúng. Transaction
      // trên đã quay đầu; ghi bằng chứng và mở hàng đợi trong một transaction mới.
      outcome = await this.prisma.$transaction(async (tx): Promise<RecordOutcome> => {
        await this.lockOrder(tx, order.id);
        const current = await tx.paymentGatewayOrder.findUniqueOrThrow({
          where: { id: order.id },
          select: { reviewStatus: true },
        });
        if (current.reviewStatus !== PAYMENT_ORDER_REVIEW_STATUS.RESOLVED) {
          await tx.paymentGatewayOrder.update({
            where: { id: order.id },
            data: {
              ...evidenceOf(result, source),
              reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN,
              reviewReason: PAYMENT_ORDER_REVIEW_REASON.DUPLICATE_PROVIDER_TX,
            },
          });
        }
        await this.recordEvent(tx, order.id, result, source, 'duplicate_provider_tx');
        return 'duplicate_provider_tx';
      });
      this.logger.error(`${provider} ${order.id}: mã giao dịch của cổng đã ghi ở lượt khác`);
    }

    if (outcome === 'succeeded' || outcome === 'already_succeeded') {
      // Đã thu (lần đầu hay lần gửi lại): thử áp — lượt trước có thể đã hỏng ở bước 2, và
      // `applyPending` không làm gì với lượt đã áp hoặc lượt người trực đang giữ.
      await this.applyPending(order.id);
    }
    return outcome;
  }

  /**
   * Luật chuyển trạng thái, dưới khoá dòng:
   *  - lệch số tiền / cổng nghi ngờ ⇒ KHÔNG áp, mở hàng đợi (không đụng lượt đã đóng);
   *  - thành công thắng mọi thứ chưa thành công (kể cả một lượt mình đã tự đánh `failed`) — nhưng
   *    trên một lượt người trực ĐÃ ĐÓNG thì chỉ ghi bằng chứng và mở lại hàng đợi, không áp;
   *  - thất bại/huỷ/hết hạn chỉ đổi được lượt còn `pending`; không bao giờ hạ cấp một lượt đã thu;
   *  - "không có giao dịch" (VNPAY `91`) chỉ thành hết hạn khi phiên đã quá hạn đủ lâu.
   */
  private async recordWithinTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    result: ProviderPaymentResult,
    source: PaymentOrderResultSource,
  ): Promise<RecordOutcome> {
    await this.lockOrder(tx, orderId);
    const current = await tx.paymentGatewayOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { amount: true, status: true, reviewStatus: true, expiresAt: true },
    });
    const now = new Date();
    const resolved = current.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.RESOLVED;
    const done = async (outcome: RecordOutcome): Promise<RecordOutcome> => {
      // Truy vấn trả "chưa có gì" lặp lại mỗi nhịp và không mang thông tin — không ghi nhật ký.
      if (!(source === PAYMENT_ORDER_RESULT_SOURCE.QUERY && outcome === 'pending')) {
        await this.recordEvent(tx, orderId, result, source, outcome);
      }
      return outcome;
    };

    switch (result.outcome) {
      case 'pending':
        return done('pending');

      case 'not_found': {
        const graceOver =
          now.getTime() >
          current.expiresAt.getTime() + PAYMENT_GATEWAY_NOT_FOUND_GRACE_MINUTES * MINUTE_MS;
        if (current.status !== PAYMENT_ORDER_STATUS.PENDING || !graceOver) return 'pending';
        await tx.paymentGatewayOrder.update({
          where: { id: orderId },
          data: { ...evidenceOf(result, source), status: PAYMENT_ORDER_STATUS.EXPIRED, resultAt: now },
        });
        return done('recorded_failure');
      }

      case 'succeeded':
      case 'flagged': {
        // Thứ tự kiểm theo tài liệu VNPAY: số tiền TRƯỚC trạng thái.
        const amountMatches = result.amount !== null && result.amount.equals(current.amount);
        if (!amountMatches || result.outcome === 'flagged' || !result.providerTxId) {
          const reason = !amountMatches
            ? PAYMENT_ORDER_REVIEW_REASON.AMOUNT_MISMATCH
            : PAYMENT_ORDER_REVIEW_REASON.PROVIDER_FLAGGED;
          if (current.status !== PAYMENT_ORDER_STATUS.SUCCEEDED && !resolved) {
            // Tiền CÓ THỂ đã chuyển — không áp, không đoán; người trực đối chiếu với portal của cổng.
            await tx.paymentGatewayOrder.update({
              where: { id: orderId },
              data: {
                ...evidenceOf(result, source),
                reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN,
                reviewReason: reason,
              },
            });
            this.logger.warn(`Lượt ${orderId}: kết quả cần người xử lý (${reason})`);
          }
          return done(reason === PAYMENT_ORDER_REVIEW_REASON.AMOUNT_MISMATCH ? 'amount_mismatch' : 'flagged');
        }
        if (current.status === PAYMENT_ORDER_STATUS.SUCCEEDED) return done('already_succeeded');

        // Có thể ném P2002 (mã giao dịch của cổng đã nằm ở lượt khác) — cả transaction quay đầu.
        await tx.paymentGatewayOrder.update({
          where: { id: orderId },
          data: {
            ...evidenceOf(result, source),
            status: PAYMENT_ORDER_STATUS.SUCCEEDED,
            providerTxId: result.providerTxId,
            paidAmount: result.amount,
            providerPayMethod: result.payMethod,
            providerPaidAt: result.paidAt ?? now,
            resultAt: now,
            /*
             * Người trực đã ĐÓNG lượt này (thường sau một IPN lệch số tiền — và có thể đã hoàn tay)
             * mà giờ cổng mới báo đã thu đúng số. Một đơn ở cổng là MỘT giao dịch, nên đây gần như
             * chắc chắn là cùng khoản tiền đó: ghi bằng chứng, MỞ LẠI hàng đợi, và KHÔNG tự áp —
             * `applyPending` từ chối lý do này; áp là quyết định của người, có audit.
             */
            ...(resolved
              ? {
                  reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN,
                  reviewReason: PAYMENT_ORDER_REVIEW_REASON.RESULT_AFTER_RESOLUTION,
                }
              : {}),
          },
        });
        return done('succeeded');
      }

      default: {
        if (current.status !== PAYMENT_ORDER_STATUS.PENDING) return done('already_final');
        const next =
          result.outcome === 'cancelled'
            ? PAYMENT_ORDER_STATUS.CANCELLED
            : result.outcome === 'expired'
              ? PAYMENT_ORDER_STATUS.EXPIRED
              : PAYMENT_ORDER_STATUS.FAILED;
        await tx.paymentGatewayOrder.update({
          where: { id: orderId },
          data: { ...evidenceOf(result, source), status: next, resultAt: now },
        });
        return done('recorded_failure');
      }
    }
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    result: ProviderPaymentResult,
    source: PaymentOrderResultSource,
    effect: RecordOutcome,
  ): Promise<void> {
    await tx.paymentGatewayOrderEvent.create({
      data: {
        id: newId(),
        orderId,
        source,
        outcome: result.outcome,
        resultCode: result.resultCode.slice(0, 20),
        amount: result.amount,
        providerTxId: result.providerTxId,
        effect,
        rawJson: result.raw as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * BƯỚC 2 — áp tiền của một lượt đã thu vào đích, TRONG transaction riêng.
   *
   * Khoá dòng (`FOR UPDATE`) rồi đọc lại: lượt thứ hai chờ, rồi thấy `applied_at` đã có và dừng. Cột
   * `applied_at` + `apply_outcome` ghi CÙNG transaction với hiệu ứng tiền (CHECK ở DB đòi hai cột đi
   * cặp) — nên một lượt áp hỏng để lại `applied_at = NULL`, và lượt sau áp lại an toàn.
   *
   * Không áp khi: lượt đã ĐÓNG; hoặc lượt mang lý do `result_after_resolution` mà không phải người
   * trực đang tự tay ghi nhận (`manual`). `manual` ghi audit trong CHÍNH transaction áp tiền.
   */
  async applyPending(
    orderId: string,
    manual?: { actorUserId: string; note: string },
  ): Promise<PaymentOrderApplyOutcome | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await this.lockOrder(tx, orderId))) return null;
        const order = await tx.paymentGatewayOrder.findUniqueOrThrow({
          where: { id: orderId },
          select: {
            id: true,
            provider: true,
            tenantId: true,
            targetType: true,
            targetCode: true,
            status: true,
            paidAmount: true,
            providerTxId: true,
            appliedAt: true,
            reviewStatus: true,
            reviewReason: true,
            reviewNote: true,
            reviewedBy: true,
            reviewedAt: true,
            refundReference: true,
          },
        });
        if (
          order.status !== PAYMENT_ORDER_STATUS.SUCCEEDED ||
          order.appliedAt ||
          order.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.RESOLVED ||
          !order.paidAmount ||
          !order.providerTxId
        ) {
          return null;
        }
        if (!manual && order.reviewReason === PAYMENT_ORDER_REVIEW_REASON.RESULT_AFTER_RESOLUTION) {
          return null;
        }

        // Mã tham chiếu đi vào ghi chú hoàn tiền/audit của hàm áp — mang tên cổng để người đọc biết nguồn.
        const reference = `${order.provider}:${order.providerTxId}`;
        const applied =
          order.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
            ? fromInvoice(
                await this.billing.applyBankPaymentWithinTx(tx, {
                  code: order.targetCode,
                  amount: order.paidAmount,
                  providerTxId: reference,
                }),
              )
            : fromHold(
                await this.holds.applyBankPaymentWithinTx(tx, {
                  code: order.targetCode,
                  amount: order.paidAmount,
                  providerTxId: reference,
                }),
              );
        const outcome = applied.outcome;

        const now = new Date();
        const reviewReason = reviewReasonFor(applied);
        await tx.paymentGatewayOrder.update({
          where: { id: orderId },
          data: {
            appliedAt: now,
            applyOutcome: outcome,
            applyError: null,
            /*
             * Đích đã đóng ⇒ TIỀN VỀ MUỘN (ADR 0044 điều 7): không tạo đơn, không bật gói — vào hàng
             * đợi. Đích đã đủ từ trước ⇒ TIỀN TRẢ TRÙNG: vào hàng đợi cổng, trừ khi khoản giữ chỗ
             * đã ghi yêu cầu hoàn cho chính phần này (xem `reviewReasonFor`). Người trực tự tay ghi nhận
             * xong ⇒ lượt đóng với ghi chú của họ. Áp được tự động ⇒ gỡ cờ `apply_failed` (nếu có);
             * lý do khác giữ nguyên cho người trực.
             */
            ...(reviewReason
              ? { reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN, reviewReason }
              : manual
                ? {
                    reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED,
                    reviewNote: manual.note,
                    reviewedBy: manual.actorUserId,
                    reviewedAt: now,
                    /*
                     * Mã hoàn của lần đóng TRƯỚC không còn đúng với kết luận này ("đã ghi nhận, chưa
                     * hoàn") — để nó cạnh ghi chú mới là đọc thành "vừa ghi nhận vừa hoàn". Lần đóng
                     * trước sống nguyên vẹn ở `before` của audit bên dưới.
                     */
                    refundReference: null,
                  }
                : order.reviewReason === PAYMENT_ORDER_REVIEW_REASON.APPLY_FAILED
                  ? { reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.NONE, reviewReason: null }
                  : {}),
          },
        });
        if (manual) {
          await this.audit.record(
            {
              tenantId: order.tenantId,
              actorUserId: manual.actorUserId,
              actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
              action: 'payment_gateway_order.apply',
              targetType: AUDIT_TARGET_TYPE.PAYMENT_GATEWAY_ORDER,
              targetId: orderId,
              before: {
                reviewStatus: order.reviewStatus,
                reviewReason: order.reviewReason,
                reviewNote: order.reviewNote,
                reviewedBy: order.reviewedBy,
                reviewedAt: order.reviewedAt?.toISOString() ?? null,
                refundReference: order.refundReference,
              },
              after: { applyOutcome: outcome, targetCode: order.targetCode, note: manual.note },
            },
            tx,
          );
        }
        this.logger.log(`${order.provider} ${orderId}: áp tiền → ${outcome}`);
        return outcome;
      });
    } catch (error) {
      this.logger.error(
        `Lượt ${orderId}: áp tiền thất bại — tiền đã ghi nhận, chưa áp`,
        error instanceof Error ? error.stack : String(error),
      );
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await this.prisma.paymentGatewayOrder.updateMany({
        where: { id: orderId, appliedAt: null },
        data: { applyError: message },
      });
      // Chỉ mở hàng đợi với lý do `apply_failed` khi chưa có lý do nào — không xoá lý do người trực
      // đang dựa vào (lệch tiền, kết quả sau khi đóng…).
      await this.prisma.paymentGatewayOrder.updateMany({
        where: { id: orderId, appliedAt: null, reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.NONE },
        data: {
          reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN,
          reviewReason: PAYMENT_ORDER_REVIEW_REASON.APPLY_FAILED,
        },
      });
      if (manual) throw error;
      return null;
    }
  }

  // ── Người trực ───────────────────────────────────────────────────────────────

  /**
   * Người trực tự tay GHI NHẬN một lượt đã thu mà máy không tự áp (vd kết quả tới sau khi đã đóng,
   * hoặc áp hỏng nhiều lần) — cùng đường tiền, có audit trong cùng transaction.
   */
  async applyManually(
    orderId: string,
    actorUserId: string,
    note: string,
  ): Promise<PaymentOrderApplyOutcome> {
    const order = await this.prisma.paymentGatewayOrder.findUnique({
      where: { id: orderId },
      select: { status: true, appliedAt: true, reviewStatus: true },
    });
    if (!order) throw orderNotFound();
    if (
      order.status !== PAYMENT_ORDER_STATUS.SUCCEEDED ||
      order.appliedAt ||
      order.reviewStatus !== PAYMENT_ORDER_REVIEW_STATUS.OPEN
    ) {
      throw alreadyHandled(order.reviewStatus);
    }
    const outcome = await this.applyPending(orderId, { actorUserId, note });
    if (!outcome) throw alreadyHandled(order.reviewStatus);
    return outcome;
  }

  /**
   * ĐÓNG một lượt ở hàng đợi — ghi lại việc đã làm bên ngoài (thường là hoàn tay qua portal của cổng).
   * Không di chuyển tiền. Khoá dòng: hai người trực cùng bấm thì đúng một người thắng.
   */
  async resolveReview(
    orderId: string,
    actorUserId: string,
    input: { note: string; refundReference: string | null },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockOrder(tx, orderId))) throw orderNotFound();
      const before = await tx.paymentGatewayOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: { reviewStatus: true, reviewReason: true, tenantId: true, targetCode: true },
      });
      if (before.reviewStatus !== PAYMENT_ORDER_REVIEW_STATUS.OPEN) {
        throw alreadyHandled(before.reviewStatus);
      }
      await tx.paymentGatewayOrder.update({
        where: { id: orderId },
        data: {
          reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED,
          reviewNote: input.note,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          refundReference: input.refundReference,
        },
      });
      await this.audit.record(
        {
          tenantId: before.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'payment_gateway_order.resolve',
          targetType: AUDIT_TARGET_TYPE.PAYMENT_GATEWAY_ORDER,
          targetId: orderId,
          before: { reviewStatus: before.reviewStatus, reviewReason: before.reviewReason },
          after: {
            reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED,
            targetCode: before.targetCode,
            note: input.note,
            refundReference: input.refundReference,
          },
        },
        tx,
      );
    });
  }

  // ── IPN ──────────────────────────────────────────────────────────────────────

  /**
   * IPN của MoMo. `not_configured` ⇒ controller trả 503 (MoMo gửi lại, tiền không mất); `invalid` ⇒
   * 401, không xác nhận gì; mọi kết cục còn lại là "đã nhận" (204 — tài liệu IPN của MoMo).
   */
  async handleMomoIpn(payload: unknown): Promise<'not_configured' | 'invalid' | RecordOutcome> {
    if (!this.config.isConfigured(PAYMENT_GATEWAY_PROVIDER.MOMO)) return 'not_configured';
    const verified = this.adapters[PAYMENT_GATEWAY_PROVIDER.MOMO].verifyCallback(payload);
    if (!verified.ok) {
      this.logger.warn(`IPN MoMo bị từ chối: ${verified.reason}`);
      return 'invalid';
    }
    const outcome = await this.recordProviderResult(
      PAYMENT_GATEWAY_PROVIDER.MOMO,
      verified.result,
      PAYMENT_ORDER_RESULT_SOURCE.IPN,
    );
    this.logger.log(`IPN MoMo ${verified.result.orderRef}: ${outcome}`);
    return outcome;
  }

  /**
   * IPN của VNPAY — trả ĐÚNG mã phản hồi tài liệu quy định; VNPAY đọc mã đó để quyết có gọi lại.
   * Thứ tự kiểm theo tài liệu: chữ ký → đơn tồn tại → số tiền → trạng thái đã cập nhật chưa.
   */
  async handleVnpayIpn(query: unknown): Promise<VnpayIpnResponse> {
    // Chưa cấu hình ⇒ "lỗi không xác định": VNPAY gọi lại, tiền không mất, chỉ chờ cấu hình (fail closed).
    if (!this.config.isConfigured(PAYMENT_GATEWAY_PROVIDER.VNPAY)) {
      return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;
    }
    const verified = this.adapters[PAYMENT_GATEWAY_PROVIDER.VNPAY].verifyCallback(query);
    if (!verified.ok) {
      this.logger.warn(`IPN VNPAY bị từ chối: ${verified.reason}`);
      return verified.reason === 'malformed'
        ? VNPAY_IPN_RESPONSE.UNKNOWN_ERROR
        : VNPAY_IPN_RESPONSE.INVALID_SIGNATURE;
    }
    try {
      const outcome = await this.recordProviderResult(
        PAYMENT_GATEWAY_PROVIDER.VNPAY,
        verified.result,
        PAYMENT_ORDER_RESULT_SOURCE.IPN,
      );
      this.logger.log(`IPN VNPAY ${verified.result.orderRef}: ${outcome}`);
      switch (outcome) {
        case 'order_not_found':
          return VNPAY_IPN_RESPONSE.ORDER_NOT_FOUND;
        case 'amount_mismatch':
          return VNPAY_IPN_RESPONSE.INVALID_AMOUNT;
        case 'already_final':
        case 'already_succeeded':
          return VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED;
        case 'pending':
          // Chưa phải kết quả cuối — xin VNPAY gửi lại thay vì xác nhận một thứ chưa xong.
          return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;
        default:
          return VNPAY_IPN_RESPONSE.CONFIRMED;
      }
    } catch (error) {
      this.logger.error(
        `IPN VNPAY ${verified.result.orderRef}: lỗi xử lý — VNPAY sẽ gọi lại`,
        error instanceof Error ? error.stack : String(error),
      );
      return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;
    }
  }

  private async loadDto(orderId: string): Promise<PaymentOrderDto> {
    const row = await this.prisma.paymentGatewayOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: PAYMENT_ORDER_VIEW_SELECT,
    });
    return toPaymentOrderDto(row, { sandbox: this.config.sandbox });
  }
}

/** Bằng chứng gần nhất trên dòng lượt — lịch sử đầy đủ nằm ở `payment_gateway_order_events`. */
function evidenceOf(result: ProviderPaymentResult, source: PaymentOrderResultSource) {
  return {
    providerResultCode: result.resultCode.slice(0, 20),
    providerMessage: result.message,
    resultSource: source,
    resultJson: result.raw as Prisma.InputJsonValue,
  };
}

/** Hạn của phiên: TTL, kẹp trước hạn của đích một khoảng đệm (nếu đích có hạn). */
function capExpiry(now: Date, targetExpiresAt: Date | null): Date {
  const ttl = now.getTime() + PAYMENT_GATEWAY_ORDER_TTL_MINUTES * MINUTE_MS;
  if (!targetExpiresAt) return new Date(ttl);
  const cap = targetExpiresAt.getTime() - PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES * MINUTE_MS;
  return new Date(Math.min(ttl, cap));
}

function withNativeFlag(url: string, client: PaymentGatewayClient): string {
  return client === PAYMENT_GATEWAY_CLIENT.NATIVE ? `${url}&${PAYMENT_RETURN_PARAM.NATIVE}=1` : url;
}

function notPayable(status: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.PAYMENT_TARGET_NOT_PAYABLE,
    message: 'Khoản này không còn chờ thanh toán',
    details: { status },
  });
}

function orderNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy lượt thanh toán',
  });
}

function alreadyHandled(reviewStatus: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.PAYMENT_ORDER_ALREADY_HANDLED,
    message: 'Lượt thanh toán này không còn ở hàng đợi cần xử lý',
    details: { reviewStatus },
  });
}

/** Kết quả một lượt áp, đã quy về ngôn ngữ của cổng. */
interface AppliedResult {
  outcome: PaymentOrderApplyOutcome;
  /**
   * Trả trùng mà phần thừa ĐÃ vào hàng đợi hoàn của chính đích (`hold_refunds`). Chỉ khoản giữ
   * chỗ có hàng đợi đó; hoá đơn gói luôn `false`.
   */
  duplicateRefundRecorded: boolean;
}

function fromInvoice(result: { outcome: InvoicePaymentOutcome }): AppliedResult {
  return { outcome: invoiceOutcome(result.outcome), duplicateRefundRecorded: false };
}

function fromHold(result: HoldPaymentOutcome): AppliedResult {
  return {
    outcome: holdOutcome(result.outcome),
    duplicateRefundRecorded: result.outcome === 'already_paid' && result.refundRecorded,
  };
}

/**
 * Kết cục cần người xem — đích đã đóng, không còn, hay đã đủ tiền từ trước (tiền trả trùng).
 *
 * Trả trùng mà phần thừa ĐÃ vào hàng đợi hoàn của khoản giữ chỗ (`hold_refunds`, lý do
 * `overpaid`, ghi trong CHÍNH transaction áp tiền) thì KHÔNG mở hàng đợi cổng: hàng đợi hoàn là chủ
 * duy nhất của khoản đó, hai hàng đợi cho cùng một đồng là mời người trực hoàn hai lần. Mọi trường
 * hợp khác — hoá đơn gói (không có hàng đợi hoàn), hay hold đã có khoản hoàn ĐÓNG từ trước nên phần
 * thừa không được ghi ở đâu — vào hàng đợi cổng `overpaid`: tiền không bao giờ nằm ngoài mọi hàng đợi.
 */
function reviewReasonFor(applied: AppliedResult): PaymentOrderReviewReason | null {
  switch (applied.outcome) {
    case PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED:
      return PAYMENT_ORDER_REVIEW_REASON.TARGET_CLOSED;
    case PAYMENT_ORDER_APPLY_OUTCOME.TARGET_NOT_FOUND:
      return PAYMENT_ORDER_REVIEW_REASON.TARGET_NOT_FOUND;
    case PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID:
      return applied.duplicateRefundRecorded ? null : PAYMENT_ORDER_REVIEW_REASON.OVERPAID;
    default:
      return null;
  }
}

function invoiceOutcome(outcome: InvoicePaymentOutcome): PaymentOrderApplyOutcome {
  switch (outcome) {
    case 'invoice_not_found':
      return PAYMENT_ORDER_APPLY_OUTCOME.TARGET_NOT_FOUND;
    case 'invoice_closed':
      return PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED;
    case 'partial':
      return PAYMENT_ORDER_APPLY_OUTCOME.PARTIAL;
    case 'already_paid':
      return PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID;
    case 'activated':
      return PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED;
  }
}

function holdOutcome(outcome: HoldPaymentOutcome['outcome']): PaymentOrderApplyOutcome {
  switch (outcome) {
    case 'hold_not_found':
      return PAYMENT_ORDER_APPLY_OUTCOME.TARGET_NOT_FOUND;
    case 'hold_closed':
      return PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED;
    case 'partial':
      return PAYMENT_ORDER_APPLY_OUTCOME.PARTIAL;
    case 'already_paid':
      return PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID;
    case 'activated':
      return PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED;
  }
}
