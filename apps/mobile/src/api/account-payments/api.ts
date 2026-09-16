import type { components } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một khoản KHÁCH đã trả cho chuyến đã thuê — bảng `payments`, KHÔNG phải ví (ADR 0033). */
export type AccountPayment = Schemas['AccountPaymentDto'];
export type AccountPaymentPage = Schemas['AccountPaymentPageDto'];
/** Phân trang + TỔNG. Tổng đi trong `meta` vì nó tính trên TOÀN BỘ tập, không phải trang đang xem. */
export type AccountPaymentMeta = Schemas['AccountPaymentMetaDto'];
export type AccountPaymentTotals = Schemas['AccountPaymentTotalsDto'];

/** Trang nhỏ: đây là màn ĐỌC trên điện thoại, không phải bảng kế toán. */
export const ACCOUNT_PAYMENT_LIMIT = 20;

export interface AccountPaymentFilters {
  kind?: string | null;
  page?: number;
}

export function accountPaymentParams(filters: AccountPaymentFilters): QueryParams {
  return {
    kind: filters.kind ?? null,
    page: filters.page ?? 1,
    limit: ACCOUNT_PAYMENT_LIMIT,
  };
}

/**
 * Tổng RỖNG khi server không trả `meta`.
 *
 * Màn hiện "0 đ" thay vì nổ giữa lúc render: `meta.totals` được đọc vô điều kiện ở bốn ô thống kê,
 * và một `undefined` ở đó là màn trắng cho một danh sách vẫn tải được bình thường.
 */
const EMPTY_META = (limit: number, rows: number): AccountPaymentMeta => ({
  page: 1,
  limit,
  total: rows,
  hasNext: false,
  totals: { paidTotal: '0', rentalTotal: '0', depositTotal: '0', tripCount: 0 },
});

export const accountPaymentsApi = {
  async list(params: QueryParams): Promise<AccountPaymentPage> {
    const res = (await getApiClient().request<AccountPaymentPage['data']>('/account/payments', {
      query: params,
    })) as { data: AccountPaymentPage['data']; meta?: AccountPaymentMeta };

    return {
      data: res.data,
      meta: res.meta ?? EMPTY_META(ACCOUNT_PAYMENT_LIMIT, res.data.length),
    };
  },
};
