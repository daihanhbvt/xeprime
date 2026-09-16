import type { components } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/**
 * Số dư — BA con số, không phải một.
 *
 * `available` rút được ngay · `pending` đang chờ chuyển · `total` là nghĩa vụ XePrime với chủ ví.
 * Hiện một con số duy nhất sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế, hoặc tưởng
 * tiền đã biến mất trong lúc chờ (ADR 0033 điều 6).
 */
export type WalletSummary = Schemas['WalletSummaryDto'];

/** Một dòng sổ. `amount` dương = vào ví, âm = ra. */
export type WalletEntry = Schemas['WalletEntryDto'];
export type WalletEntryPage = Schemas['WalletEntryPageDto'];

/** Yêu cầu rút nhìn từ chủ ví — số tài khoản đã che. */
export type WithdrawalRequest = Schemas['WithdrawalRequestDto'];
export type CreateWithdrawalInput = Schemas['CreateWithdrawalDto'];

/**
 * Hai bề mặt dùng chung một feature — khác nhau đúng ở TIỀN TỐ đường dẫn, y như web.
 *
 * `account` là ví của CON NGƯỜI (tiền hoàn cọc của khách thuê), `shop` là ví của GIAN HÀNG (tiền
 * chủ xe được trả). Chủ ví luôn suy từ session/membership ở backend — client không gửi id nào.
 */
export const WALLET_SCOPE = {
  ACCOUNT: 'account',
  SHOP: 'shop',
} as const;

export type WalletScope = (typeof WALLET_SCOPE)[keyof typeof WALLET_SCOPE];

const base = (scope: WalletScope) => `/${scope}/wallet`;

/** Cỡ trang sổ ví — cùng cỡ với web để hai bên lật cùng nhịp; màn hình đọc lại hằng này. */
export const WALLET_ENTRIES_PAGE_SIZE = 20;

/** Tham số phân trang sổ. */
export const walletEntriesParams = (page: number): QueryParams => ({
  page,
  limit: WALLET_ENTRIES_PAGE_SIZE,
});

export const walletApi = {
  summary(scope: WalletScope): Promise<WalletSummary> {
    return getApiClient().get<WalletSummary>(base(scope));
  },

  entries(scope: WalletScope, params: QueryParams): Promise<WalletEntryPage> {
    return getApiClient().get<WalletEntryPage>(`${base(scope)}/entries`, params);
  },

  withdrawals(scope: WalletScope): Promise<WithdrawalRequest[]> {
    return getApiClient().get<WithdrawalRequest[]>(`${base(scope)}/withdrawals`);
  },

  createWithdrawal(scope: WalletScope, body: CreateWithdrawalInput): Promise<WithdrawalRequest> {
    return getApiClient().post<WithdrawalRequest>(`${base(scope)}/withdrawals`, body);
  },

  /** Huỷ một lệnh rút CÒN CHỜ — server từ chối nếu admin đã bắt đầu xử lý. */
  cancelWithdrawal(scope: WalletScope, id: string): Promise<void> {
    return getApiClient().post<void>(`${base(scope)}/withdrawals/${id}/cancel`);
  },
};
