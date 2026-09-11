import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  DailyReconciliation,
  HoldFilters,
  MarkRefundPaidInput,
  PlatformHold,
  PlatformHoldRefund,
  RefundFilters,
  RejectRefundInput,
  SettleHoldInput,
  MarkWithdrawalPaidInput,
  PlatformWithdrawalPage,
  WithdrawalFilters,
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
  fetchPage<PlatformHold>('/platform/money/holds', holdFiltersToParams(filters), MONEY_DEFAULT_LIMIT);

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

export const fetchDailyReconciliation = (date: string): Promise<DailyReconciliation> =>
  apiGet<DailyReconciliation>(`/platform/money/reconciliation/daily?date=${date}`);

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

export function fetchWithdrawalQueue(
  params: QueryParams,
): Promise<PlatformWithdrawalPage> {
  return apiGet<PlatformWithdrawalPage>('/platform/money/withdrawals', params);
}

export const approveWithdrawal = (id: string): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/approve`);

export const markWithdrawalPaid = (id: string, body: MarkWithdrawalPaidInput): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/paid`, body);

export const rejectWithdrawal = (id: string, body: { reason: string }): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/reject`, body);

export const reverseWithdrawal = (id: string, body: { reason: string }): Promise<void> =>
  apiPost<void>(`/platform/money/withdrawals/${id}/reverse`, body);
