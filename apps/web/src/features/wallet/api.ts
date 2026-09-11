import { apiGet, apiPost, type QueryParams } from '@/services/api-client';
import type {
  CreateWithdrawalInput,
  WalletEntryPage,
  WalletScope,
  WalletSummary,
  WithdrawalRequest,
} from './types';

/**
 * Hai bề mặt — ví cá nhân và ví gian hàng — khác nhau đúng ở tiền tố đường dẫn, nên chúng đi qua
 * cùng bộ hàm với một tham số `scope`. Chủ ví luôn suy từ session/membership ở backend.
 */
const base = (scope: WalletScope) => `/${scope}/wallet`;

export const fetchWalletSummary = (scope: WalletScope): Promise<WalletSummary> =>
  apiGet<WalletSummary>(base(scope));

export const fetchWalletEntries = (
  scope: WalletScope,
  params: QueryParams,
): Promise<WalletEntryPage> => apiGet<WalletEntryPage>(`${base(scope)}/entries`, params);

export const fetchWithdrawals = (scope: WalletScope): Promise<WithdrawalRequest[]> =>
  apiGet<WithdrawalRequest[]>(`${base(scope)}/withdrawals`);

export const createWithdrawal = (
  scope: WalletScope,
  body: CreateWithdrawalInput,
): Promise<WithdrawalRequest> =>
  apiPost<WithdrawalRequest>(`${base(scope)}/withdrawals`, body);

export const cancelWithdrawal = (scope: WalletScope, id: string): Promise<void> =>
  apiPost<void>(`${base(scope)}/withdrawals/${id}/cancel`);

/** Tham số phân trang sổ — `page` sống trên URL (ADR 0004). */
export const walletEntriesParams = (page: number): QueryParams => ({ page, limit: 20 });
