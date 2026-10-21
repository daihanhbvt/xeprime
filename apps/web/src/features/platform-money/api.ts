import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  DailyReconciliation,
  HoldFilters,
  MarkRefundPaidInput,
  PlatformHold,
  PlatformHoldRefund,
  PlatformMoneySummary,
  RefundFilters,
  RejectRefundInput,
  SaveBankBalanceInput,
  SettleHoldInput,
  MarkWithdrawalPaidInput,
  PlatformWithdrawalPage,
  WithdrawalFilters,
  GatewayOrderFilters,
  PlatformPaymentOrder,
  PlatformPaymentOrderDetail,
  PlatformPaymentOrderRequery,
  ResolvePaymentOrderInput,
  ApplyPaymentOrderInput,
} from './types';

export const MONEY_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function holdFiltersToParams(filters: HoldFilters): QueryParams {
  return {
    status: filters.status ?? null,
    // Backend đọc `'true' | 'false'` (query string), không phải boolean.
    unsettled: filters.unsettled ? 'true' : null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MONEY_DEFAULT_LIMIT,
  };
}

export function refundFiltersToParams(filters: RefundFilters): QueryParams {
  return {
    status: filters.status ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MONEY_DEFAULT_LIMIT,
  };
}

export const fetchHolds = (filters: HoldFilters): Promise<Paged<PlatformHold>> =>
  fetchPage<PlatformHold>(
    '/platform/money/holds',
    holdFiltersToParams(filters),
    MONEY_DEFAULT_LIMIT,
  );

export const settleHold = (id: string, body: SettleHoldInput): Promise<void> =>
  apiPost<void>(`/platform/money/holds/${id}/settle`, body);

export const fetchRefunds = (filters: RefundFilters): Promise<Paged<PlatformHoldRefund>> =>
  fetchPage<PlatformHoldRefund>(
    '/platform/money/refunds',
    refundFiltersToParams(filters),
    MONEY_DEFAULT_LIMIT,
  );

export const markRefundPaid = (id: string, body: MarkRefundPaidInput): Promise<void> =>
  apiPost<void>(`/platform/money/refunds/${id}/paid`, body);

export const rejectRefund = (id: string, body: RejectRefundInput): Promise<void> =>
  apiPost<void>(`/platform/money/refunds/${id}/reject`, body);

export const fetchMoneySummary = (): Promise<PlatformMoneySummary> =>
  apiGet<PlatformMoneySummary>('/platform/money/summary');

export const fetchDailyReconciliation = (date: string): Promise<DailyReconciliation> =>
  apiGet<DailyReconciliation>(`/platform/money/reconciliation/daily?date=${date}`);

/** Nhập số dư ngân hàng cuối ngày — trả về bản đối soát ĐÃ TÍNH LẠI, không phải chỉ con số vừa lưu. */
export const saveBankBalance = (body: SaveBankBalanceInput): Promise<DailyReconciliation> =>
  apiPost<DailyReconciliation>('/platform/money/reconciliation/bank-balance', body);

// ── Hàng đợi rút tiền (ADR 0033 — Phase 5) ──────────────────────────────────

export function withdrawalFiltersToParams(filters: WithdrawalFilters): QueryParams {
  return {
    status: filters.status ?? null,
    // Backend đọc `'true' | 'false'` (query string), không phải boolean.
    overdue: filters.overdue ? 'true' : null,
    page: filters.page ?? 1,
    limit: MONEY_DEFAULT_LIMIT,
  };
}

export function fetchWithdrawalQueue(params: QueryParams): Promise<PlatformWithdrawalPage> {
  return apiGet<PlatformWithdrawalPage>('/platform/money/withdrawals', params);
}

export const approveWithdrawal = (id: string): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/approve`);

export const markWithdrawalPaid = (id: string, body: MarkWithdrawalPaidInput): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/paid`, body);

export const rejectWithdrawal = (id: string, body: { reason: string }): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/reject`, body);

export const reverseWithdrawal = (
  id: string,
  body: { reason: string; rowVersion: number },
): Promise<void> => apiPost<void>(`/platform/money/withdrawals/${id}/reverse`, body);

// ── Cổng thanh toán MoMo/VNPAY (ADR 0058) ───────────────────────────────────

export function gatewayOrderFiltersToParams(filters: GatewayOrderFilters): QueryParams {
  return {
    view: filters.view ?? null,
    provider: filters.provider ?? null,
    target: filters.target ?? null,
    status: filters.status ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MONEY_DEFAULT_LIMIT,
  };
}

export const fetchGatewayOrders = (
  filters: GatewayOrderFilters,
): Promise<Paged<PlatformPaymentOrder>> =>
  fetchPage<PlatformPaymentOrder>(
    '/platform/payment-orders',
    gatewayOrderFiltersToParams(filters),
    MONEY_DEFAULT_LIMIT,
  );

export const fetchGatewayOrderDetail = (id: string): Promise<PlatformPaymentOrderDetail> =>
  apiGet<PlatformPaymentOrderDetail>(`/platform/payment-orders/${encodeURIComponent(id)}`);

/** Đóng lượt ở hàng đợi — ghi lại việc đã làm bên ngoài; KHÔNG chạy thao tác tiền nào. */
export const resolveGatewayOrder = (
  id: string,
  body: ResolvePaymentOrderInput,
): Promise<PlatformPaymentOrderDetail> =>
  apiPost<PlatformPaymentOrderDetail>(
    `/platform/payment-orders/${encodeURIComponent(id)}/resolve`,
    body,
  );

/**
 * Người trực GHI NHẬN TAY một khoản cổng đã thu mà máy không tự áp (kết quả tới sau khi lượt đã đóng).
 * Server chạy đúng hàm áp tiền của webhook, kèm ghi chú + audit.
 */
export const applyGatewayOrder = (
  id: string,
  body: ApplyPaymentOrderInput,
): Promise<PlatformPaymentOrderDetail> =>
  apiPost<PlatformPaymentOrderDetail>(
    `/platform/payment-orders/${encodeURIComponent(id)}/apply`,
    body,
  );

/** Hỏi lại cổng ngay (bỏ qua nhịp giới hạn) và thử ghi nhận nếu cổng đã thu. */
export const requeryGatewayOrder = (id: string): Promise<PlatformPaymentOrderRequery> =>
  apiPost<PlatformPaymentOrderRequery>(
    `/platform/payment-orders/${encodeURIComponent(id)}/requery`,
    {},
  );
