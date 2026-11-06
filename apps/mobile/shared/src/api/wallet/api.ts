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

/** Yêu cầu rút nhìn từ chủ ví — số tài khoản đã che. */
export type WithdrawalRequest = Schemas['WithdrawalRequestDto'];
export type CreateWithdrawalInput = Schemas['CreateWithdrawalDto'];

/**
 * Bảng tổng hợp giao dịch theo KỲ của gian hàng — `GET /shop/wallet/statement`.
 *
 * Chỉ có ở `scope === 'shop'`: nó nói về CHUYẾN cho thuê, và một tài khoản khách thuê thuần không
 * có chuyến nào ở phía bán.
 */
export type WalletStatement = Schemas['WalletStatementDto'];
export type WalletStatementTrip = Schemas['WalletStatementTripDto'];
export type WalletStatementTotals = Schemas['WalletStatementTotalsDto'];

/** Một dòng Biến động số dư — bút toán sổ ví HOẶC lệnh rút (`source`), `GET /shop/wallet/activity`. */
export type WalletActivity = Schemas['WalletActivityDto'];
export type WalletActivityPage = Schemas['WalletActivityPageDto'];

/** Kỳ + trang của bảng tổng hợp. Native không có URL nên chúng sống ở state màn. */
export interface WalletStatementFilters {
  /** `YYYY-MM` theo giờ Việt Nam. */
  period: string;
  page: number;
}

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

/** Cỡ trang bảng tổng hợp — cùng cỡ với web. */
export const WALLET_STATEMENT_PAGE_SIZE = 20;

/** Cỡ trang tab Biến động số dư — cùng cỡ với web. */
export const WALLET_ACTIVITY_PAGE_SIZE = 20;

/** Kỳ + trang của tab Biến động số dư — cùng khuôn bộ lọc với bảng tổng hợp. */
export const walletActivityParams = (filters: WalletStatementFilters): QueryParams => ({
  period: filters.period,
  page: filters.page,
  limit: WALLET_ACTIVITY_PAGE_SIZE,
});

/** Tham số bảng tổng hợp — kỳ và trang. */
export const walletStatementParams = (filters: WalletStatementFilters): QueryParams => ({
  period: filters.period,
  page: filters.page,
  limit: WALLET_STATEMENT_PAGE_SIZE,
});

export const walletApi = {
  summary(scope: WalletScope): Promise<WalletSummary> {
    return getApiClient().get<WalletSummary>(base(scope));
  },

  /**
   * Bảng tổng hợp giao dịch của gian hàng trong một kỳ.
   *
   * Không nhận `scope`: endpoint chỉ tồn tại ở phía gian hàng, và một hàm nhận tham số chỉ có một
   * giá trị hợp lệ là một lời mời gọi nó sai.
   */
  statement(params: QueryParams): Promise<WalletStatement> {
    return getApiClient().get<WalletStatement>('/shop/wallet/statement', params);
  },

  /** Biến động số dư của gian hàng trong một kỳ — chỉ phía partner có. */
  activity(params: QueryParams): Promise<WalletActivityPage> {
    return getApiClient().get<WalletActivityPage>('/shop/wallet/activity', params);
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
