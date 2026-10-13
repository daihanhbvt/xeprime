import { Prisma } from '@xeprime/prisma';
import {
  PAYMENT_ORDER_APPLIED_OUTCOMES,
  PAYMENT_ORDER_APPLY_OUTCOME,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  type PaymentOrderApplyOutcome,
  type PaymentOrderViewState,
} from '@xeprime/types';
import type { PaymentOrderDto } from './dto/payment-gateway.dto';

/** Cột cần để dựng DTO phía người trả — một select dùng chung cho mọi đường đọc. */
export const PAYMENT_ORDER_VIEW_SELECT = {
  id: true,
  provider: true,
  targetType: true,
  targetCode: true,
  subscriptionInvoiceId: true,
  bookingHoldId: true,
  amount: true,
  status: true,
  checkoutUrl: true,
  expiresAt: true,
  providerPaidAt: true,
  appliedAt: true,
  applyOutcome: true,
  reviewStatus: true,
  noTransactionAt: true,
  createdAt: true,
  bookingHold: { select: { bookingRequestId: true } },
} satisfies Prisma.PaymentGatewayOrderSelect;

export type PaymentOrderViewRow = Prisma.PaymentGatewayOrderGetPayload<{
  select: typeof PAYMENT_ORDER_VIEW_SELECT;
}>;

/**
 * Chặng nhìn từ phía người trả — MỘT phép suy cho web, app và mọi đường đọc của server.
 *
 * Nguyên tắc: không bao giờ nói "xong" trước khi tiền ĐÃ VÀO đích (`applied_at` + kết cục có tiền),
 * và không bao giờ để người trả chờ mãi một thứ cần người xử lý — mọi lượt đang ở hàng đợi của admin
 * hiện là `needs_support`.
 */
export function paymentOrderViewState(row: {
  status: string;
  appliedAt: Date | null;
  applyOutcome: string | null;
  reviewStatus: string;
}): PaymentOrderViewState {
  const needsPeople = row.reviewStatus !== PAYMENT_ORDER_REVIEW_STATUS.NONE;
  switch (row.status) {
    case PAYMENT_ORDER_STATUS.SUCCEEDED:
      if (row.appliedAt) {
        if (PAYMENT_ORDER_APPLIED_OUTCOMES.includes(row.applyOutcome as PaymentOrderApplyOutcome)) {
          return PAYMENT_ORDER_VIEW_STATE.COMPLETED;
        }
        // Trả trùng mà KHÔNG vào hàng đợi cổng = khoản giữ chỗ đã tự ghi yêu cầu hoàn cho phần thừa
        // (`reviewReasonFor` ở PaymentGatewayService). Hứa "hỗ trợ sẽ liên hệ" ở đây là hứa suông.
        return row.applyOutcome === PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID && !needsPeople
          ? PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED
          : PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT;
      }
      return needsPeople ? PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT : PAYMENT_ORDER_VIEW_STATE.CONFIRMING;
    case PAYMENT_ORDER_STATUS.PENDING:
      return needsPeople ? PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT : PAYMENT_ORDER_VIEW_STATE.AWAITING;
    default:
      return PAYMENT_ORDER_VIEW_STATE.FAILED;
  }
}

export function toPaymentOrderDto(
  row: PaymentOrderViewRow,
  opts: { sandbox: boolean; now?: Date },
): PaymentOrderDto {
  const now = opts.now ?? new Date();
  const viewState = paymentOrderViewState(row);
  /*
   * Cổng đã xác nhận phiên này KHÔNG có giao dịch (khách bấm Huỷ ở trang cổng): lượt vẫn `pending`
   * theo ADR 0058, nhưng người trả không còn gì để chờ — và liên kết vừa bị huỷ không được mời mở lại.
   */
  const noTransaction = viewState === PAYMENT_ORDER_VIEW_STATE.AWAITING && row.noTransactionAt !== null;
  // Liên kết chỉ còn ý nghĩa khi lượt còn chờ, không ai đang xử lý, và chưa quá hạn dùng lại.
  const reusable =
    viewState === PAYMENT_ORDER_VIEW_STATE.AWAITING &&
    !noTransaction &&
    row.expiresAt.getTime() > now.getTime();
  return {
    id: row.id,
    provider: row.provider,
    targetType: row.targetType,
    targetCode: row.targetCode,
    tripId:
      row.targetType === PAYMENT_ORDER_TARGET.BOOKING_HOLD
        ? (row.bookingHold?.bookingRequestId ?? null)
        : null,
    invoiceId:
      row.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
        ? row.subscriptionInvoiceId
        : null,
    amount: row.amount.toFixed(0),
    status: row.status,
    viewState,
    applyOutcome: row.applyOutcome,
    checkoutUrl: reusable ? row.checkoutUrl : null,
    noTransaction,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.providerPaidAt?.toISOString() ?? null,
    sandbox: opts.sandbox,
    createdAt: row.createdAt.toISOString(),
  };
}
