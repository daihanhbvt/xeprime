import { apiGet, apiPost, type QueryParams } from '@/services/api-client';
import type {
  CreateWithdrawalInput,
  WalletActivityFilters,
  WalletActivityPage,
  WalletScope,
  WalletStatement,
  WalletStatementFilters,
  WalletSummary,
  WithdrawalRequest,
} from './types';

/** Số dòng mỗi trang của bảng tổng hợp — khớp nhịp đọc một màn hình, không phải trần của API. */
export const WALLET_STATEMENT_PAGE_SIZE = 20;

/**
 * Hai bề mặt — ví cá nhân và ví gian hàng — khác nhau đúng ở tiền tố đường dẫn, nên chúng đi qua
 * cùng bộ hàm với một tham số `scope`. Chủ ví luôn suy từ session/membership ở backend.
 */
const base = (scope: WalletScope) => `/${scope}/wallet`;

export const fetchWalletSummary = (scope: WalletScope): Promise<WalletSummary> =>
  apiGet<WalletSummary>(base(scope));

export const fetchWithdrawals = (scope: WalletScope): Promise<WithdrawalRequest[]> =>
  apiGet<WithdrawalRequest[]>(`${base(scope)}/withdrawals`);

export const createWithdrawal = (
  scope: WalletScope,
  body: CreateWithdrawalInput,
): Promise<WithdrawalRequest> => apiPost<WithdrawalRequest>(`${base(scope)}/withdrawals`, body);

export const cancelWithdrawal = (scope: WalletScope, id: string): Promise<void> =>
  apiPost<void>(`${base(scope)}/withdrawals/${id}/cancel`);

/**
 * Bảng tổng hợp giao dịch của gian hàng trong một kỳ.
 *
 * Không nhận `scope`: endpoint chỉ tồn tại ở phía gian hàng, và một hàm nhận tham số chỉ có một
 * giá trị hợp lệ là một lời mời gọi nó sai.
 */
export const fetchWalletStatement = (params: QueryParams): Promise<WalletStatement> =>
  apiGet<WalletStatement>('/shop/wallet/statement', params);

/** Tham số bảng tổng hợp — kỳ và trang đều sống trên URL. */
export const walletStatementParams = (filters: WalletStatementFilters): QueryParams => ({
  period: filters.period,
  page: filters.page,
  limit: WALLET_STATEMENT_PAGE_SIZE,
});

export const WALLET_ACTIVITY_PAGE_SIZE = 20;

/** Biến động số dư của gian hàng trong một kỳ — chỉ khu partner có. */
export const fetchWalletActivity = (params: QueryParams): Promise<WalletActivityPage> =>
  apiGet<WalletActivityPage>('/shop/wallet/activity', params);

export const walletActivityParams = (filters: WalletActivityFilters): QueryParams => ({
  period: filters.period,
  page: filters.page,
  limit: WALLET_ACTIVITY_PAGE_SIZE,
});
