import { apiRequest, type QueryParams } from '@/services/api-client';
import type { AccountPaymentMeta, AccountPaymentPage } from './types';

/** Trang nhỏ: đây là màn đọc trên điện thoại, không phải bảng kế toán. */
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

/** Tổng rỗng khi server không trả `meta` — để màn hiện "0 đ" thay vì nổ giữa lúc render. */
const EMPTY_META = (limit: number, rows: number): AccountPaymentMeta => ({
  page: 1,
  limit,
  total: rows,
  hasNext: false,
  totals: { paidTotal: '0', rentalTotal: '0', depositTotal: '0', tripCount: 0 },
});

/**
 * Dùng `apiRequest` chứ KHÔNG `apiGet` — và đây là một lỗi đã xảy ra thật, không phải sở thích.
 *
 * `apiGet<T>` trả `result.data`, tức là nó KHẲNG ĐỊNH với TypeScript rằng phần trong phong bì
 * chính là `T`. Khai `apiGet<AccountPaymentPage>` vì thế biên dịch trót lọt trong khi thực tế
 * nhận về một MẢNG, và màn nổ `data.totals is undefined` lúc chạy. Không test nào bắt được: test
 * api gọi thẳng service (chưa có phong bì), còn typecheck thì đã được chính lời khai đó trấn an.
 *
 * `apiRequest` trả nguyên phong bì `{ data, meta }`, nên `meta.totals` đi qua được và kiểu dữ
 * liệu khớp với thứ HTTP thật sự trả về.
 */
export async function fetchAccountPayments(params: QueryParams): Promise<AccountPaymentPage> {
  const res = await apiRequest<AccountPaymentPage['data']>('/account/payments', {
    query: params,
  });
  return {
    data: res.data,
    meta: (res.meta as AccountPaymentMeta | undefined) ?? EMPTY_META(ACCOUNT_PAYMENT_LIMIT, res.data.length),
  };
}
