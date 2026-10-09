import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  PAYMENT_ORDER_QUEUE_VIEW,
  PAYMENT_ORDER_REQUERY_OUTCOME,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  type PaginationMeta,
  type PaymentOrderRequeryOutcome,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_ORDER_DEFAULT_LIMIT,
  PAYMENT_ORDER_MAX_LIMIT,
  type PaymentOrderTargetSnapshotDto,
  type PlatformPaymentOrderDetailDto,
  type PlatformPaymentOrderDto,
  type PlatformPaymentOrderListQueryDto,
  type PlatformPaymentOrderRequeryDto,
  type ResolvePaymentOrderDto,
} from './dto/platform-payment-order.dto';
import { PaymentGatewayService, type SettleResult } from './payment-gateway.service';

/** Số dòng nhật ký kết quả hiện ở màn chi tiết — đủ cho mọi lượt thật; lượt bất thường xem ở DB. */
const EVENTS_IN_DETAIL = 50;

const LIST_SELECT = {
  id: true,
  provider: true,
  targetType: true,
  targetCode: true,
  tenantId: true,
  amount: true,
  paidAmount: true,
  status: true,
  applyOutcome: true,
  reviewStatus: true,
  reviewReason: true,
  providerTxId: true,
  providerPayMethod: true,
  providerPaidAt: true,
  resultSource: true,
  resultAt: true,
  appliedAt: true,
  createdAt: true,
  tenant: { select: { name: true } },
  initiator: { select: { displayName: true } },
} satisfies Prisma.PaymentGatewayOrderSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  providerOrderRef: true,
  providerResultCode: true,
  providerMessage: true,
  applyError: true,
  reviewNote: true,
  reviewedAt: true,
  refundReference: true,
  expiresAt: true,
  lastQueriedAt: true,
  resultJson: true,
  reviewer: { select: { displayName: true } },
  subscriptionInvoice: {
    select: { status: true, totalAmount: true, paidAmount: true, expiresAt: true },
  },
  bookingHold: { select: { status: true, amount: true, paidAmount: true, expiresAt: true } },
  events: {
    orderBy: { createdAt: 'desc' },
    take: EVENTS_IN_DETAIL,
    select: {
      id: true,
      source: true,
      outcome: true,
      resultCode: true,
      amount: true,
      providerTxId: true,
      effect: true,
      rawJson: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PaymentGatewayOrderSelect;

type ListRow = Prisma.PaymentGatewayOrderGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.PaymentGatewayOrderGetPayload<{ select: typeof DETAIL_SELECT }>;

/**
 * Hàng đợi CỔNG THANH TOÁN của người trực tài chính — ADR 0058.
 *
 * Service này chỉ ĐỌC. Mọi lệnh ghi lên `payment_gateway_orders` — đóng lượt, ghi nhận tay, hỏi lại
 * cổng — đi qua `PaymentGatewayService`, writer duy nhất của bảng, và mang audit trong cùng
 * transaction với thay đổi.
 */
@Injectable()
export class PlatformPaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gateway: PaymentGatewayService,
  ) {}

  async list(
    query: PlatformPaymentOrderListQueryDto,
  ): Promise<{ data: PlatformPaymentOrderDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PAYMENT_ORDER_DEFAULT_LIMIT, PAYMENT_ORDER_MAX_LIMIT);
    const view = query.view ?? PAYMENT_ORDER_QUEUE_VIEW.REVIEW;
    const where: Prisma.PaymentGatewayOrderWhereInput = {
      ...(view === PAYMENT_ORDER_QUEUE_VIEW.REVIEW
        ? { reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.OPEN }
        : view === PAYMENT_ORDER_QUEUE_VIEW.RESOLVED
          ? { reviewStatus: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED }
          : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.target ? { targetType: query.target } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { targetCode: { contains: query.q, mode: 'insensitive' } },
              { providerOrderRef: { contains: query.q, mode: 'insensitive' } },
              { providerTxId: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.paymentGatewayOrder.count({ where }),
      this.prisma.paymentGatewayOrder.findMany({
        where,
        // Cũ nhất trước ở hàng đợi việc — khoản chờ lâu nhất là khoản khách đang hỏi nhiều nhất.
        orderBy: { createdAt: view === PAYMENT_ORDER_QUEUE_VIEW.REVIEW ? 'asc' : 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);
    return { data: rows.map(toListDto), meta: paginationMeta(paging, total) };
  }

  async getOne(id: string): Promise<PlatformPaymentOrderDetailDto> {
    const row = await this.prisma.paymentGatewayOrder.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return toDetailDto(row);
  }

  /** Đóng lượt ở hàng đợi — ghi lại việc đã làm bên ngoài; không di chuyển tiền. */
  async resolve(
    id: string,
    actorUserId: string,
    dto: ResolvePaymentOrderDto,
  ): Promise<PlatformPaymentOrderDetailDto> {
    await this.gateway.resolveReview(id, actorUserId, {
      note: dto.note,
      refundReference: dto.refundReference?.trim() || null,
    });
    return this.getOne(id);
  }

  /** Người trực tự tay ghi nhận một lượt đã thu vào đích — cùng đường tiền, audit cùng transaction. */
  async apply(id: string, actorUserId: string, note: string): Promise<PlatformPaymentOrderDetailDto> {
    await this.gateway.applyManually(id, actorUserId, note);
    return this.getOne(id);
  }

  /**
   * Hỏi lại cổng NGAY (bỏ qua nhịp giới hạn) và thử áp nếu đã thu — cho lượt kẹt vì IPN không tới,
   * hoặc lượt áp hỏng vì một lỗi tạm thời đã qua. Trả kèm KẾT QUẢ để màn hình nói đúng điều đã xảy ra.
   */
  async requery(id: string, actorUserId: string): Promise<PlatformPaymentOrderRequeryDto> {
    const before = await this.prisma.paymentGatewayOrder.findUnique({
      where: { id },
      select: { status: true, appliedAt: true, tenantId: true, targetCode: true },
    });
    if (!before) throw notFound();
    const settled = await this.gateway.settle(id, { force: true });
    const outcome = requeryOutcome(settled);
    const after = await this.getOne(id);
    await this.audit.record({
      tenantId: before.tenantId,
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: 'payment_gateway_order.requery',
      targetType: AUDIT_TARGET_TYPE.PAYMENT_GATEWAY_ORDER,
      targetId: id,
      before: { status: before.status, applied: before.appliedAt !== null },
      after: {
        outcome,
        status: after.status,
        applied: after.appliedAt !== null,
        applyOutcome: after.applyOutcome,
        targetCode: before.targetCode,
      },
    });
    return { outcome, order: after };
  }
}

function requeryOutcome(settled: SettleResult): PaymentOrderRequeryOutcome {
  switch (settled) {
    case 'applied':
    case 'recorded':
      return PAYMENT_ORDER_REQUERY_OUTCOME.CHANGED;
    case 'unreachable':
      return PAYMENT_ORDER_REQUERY_OUTCOME.UNREACHABLE;
    default:
      return PAYMENT_ORDER_REQUERY_OUTCOME.NO_CHANGE;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy lượt thanh toán',
  });
}

function toListDto(row: ListRow): PlatformPaymentOrderDto {
  return {
    id: row.id,
    provider: row.provider,
    targetType: row.targetType,
    targetCode: row.targetCode,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    amount: row.amount.toFixed(0),
    paidAmount: row.paidAmount?.toFixed(0) ?? null,
    status: row.status,
    applyOutcome: row.applyOutcome,
    reviewStatus: row.reviewStatus,
    reviewReason: row.reviewReason,
    providerTxId: row.providerTxId,
    providerPayMethod: row.providerPayMethod,
    paidAt: row.providerPaidAt?.toISOString() ?? null,
    resultSource: row.resultSource,
    resultAt: row.resultAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    initiatedByName: row.initiator?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetailDto(row: DetailRow): PlatformPaymentOrderDetailDto {
  const target: PaymentOrderTargetSnapshotDto =
    row.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
      ? {
          status: row.subscriptionInvoice?.status ?? null,
          amount: row.subscriptionInvoice?.totalAmount.toFixed(0) ?? null,
          paidAmount: row.subscriptionInvoice?.paidAmount.toFixed(0) ?? null,
          expiresAt: row.subscriptionInvoice?.expiresAt?.toISOString() ?? null,
        }
      : {
          status: row.bookingHold?.status ?? null,
          amount: row.bookingHold?.amount.toFixed(0) ?? null,
          paidAmount: row.bookingHold?.paidAmount.toFixed(0) ?? null,
          expiresAt: row.bookingHold?.expiresAt.toISOString() ?? null,
        };
  return {
    ...toListDto(row),
    providerOrderRef: row.providerOrderRef,
    providerResultCode: row.providerResultCode,
    providerMessage: row.providerMessage,
    applyError: row.applyError,
    reviewNote: row.reviewNote,
    reviewedByName: row.reviewer?.displayName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    refundReference: row.refundReference,
    expiresAt: row.expiresAt.toISOString(),
    lastQueriedAt: row.lastQueriedAt?.toISOString() ?? null,
    target,
    resultJson: row.resultJson ?? null,
    events: row.events.map((event) => ({
      id: event.id,
      source: event.source,
      outcome: event.outcome,
      resultCode: event.resultCode,
      amount: event.amount?.toFixed(0) ?? null,
      providerTxId: event.providerTxId,
      effect: event.effect,
      rawJson: event.rawJson,
      createdAt: event.createdAt.toISOString(),
    })),
    // Cùng điều kiện với `PaymentGatewayService.applyManually` — nút chỉ hiện khi server sẽ nhận.
    canApply:
      row.status === PAYMENT_ORDER_STATUS.SUCCEEDED &&
      row.appliedAt === null &&
      row.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.OPEN,
  };
}
