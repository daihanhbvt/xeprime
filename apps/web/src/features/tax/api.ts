import type { TaxExportGroupBy } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { browserApiHref } from '@/lib/api-href';
import { apiGet, apiPost, type QueryParams } from '@/services/api-client';
import type {
  DeclareTaxPeriodInput,
  RemitTaxPeriodInput,
  TaxPeriodAdvanced,
  TaxPeriodSummary,
  TaxRowFilters,
  TaxRowPage,
  TenantTaxSummary,
} from './types';

export const TAX_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function taxRowFiltersToParams(filters: TaxRowFilters): QueryParams {
  return {
    period: filters.period ?? null,
    status: filters.status ?? null,
    tenantId: filters.tenantId ?? null,
    page: filters.page ?? 1,
    limit: TAX_DEFAULT_LIMIT,
  };
}

export const fetchTaxPeriodSummary = (period: string): Promise<TaxPeriodSummary> =>
  apiGet<TaxPeriodSummary>('/platform/money/tax/summary', { period });

export const fetchTaxRows = (params: QueryParams): Promise<TaxRowPage> =>
  apiGet<TaxRowPage>('/platform/money/tax/rows', params);

export const markPeriodDeclared = (
  period: string,
  body: DeclareTaxPeriodInput,
): Promise<TaxPeriodAdvanced> =>
  apiPost<TaxPeriodAdvanced>(`/platform/money/tax/periods/${period}/declared`, body);

export const markPeriodRemitted = (
  period: string,
  body: RemitTaxPeriodInput,
): Promise<TaxPeriodAdvanced> =>
  apiPost<TaxPeriodAdvanced>(`/platform/money/tax/periods/${period}/remitted`, body);

export const reverseTaxRow = (id: string, body: { reason: string }): Promise<void> =>
  apiPost<void>(`/platform/money/tax/rows/${id}/reverse`, body);

/** Thuế của CHÍNH gian hàng — `tenant_id` từ session, không truyền lên. */
export const fetchShopTaxSummary = (period?: string): Promise<TenantTaxSummary> =>
  apiGet<TenantTaxSummary>('/shop/tax/summary', period ? { period } : {});

/**
 * Đường tải CSV của một kỳ.
 *
 * Trả về một URL chứ không fetch rồi tạo blob: endpoint đã đặt `Content-Type: text/csv` và
 * trình duyệt tải thẳng bằng cookie phiên (session là httpOnly cookie — ADR 0002, nên một thẻ
 * `<a>` mang đủ credential). Đọc cả file vào bộ nhớ chỉ để dựng một blob là thêm một bản sao
 * của dữ liệu vài nghìn dòng mà không đổi được gì cho người dùng.
 *
 * Gốc URL đi qua `browserApiHref` — cùng gốc `/api` (cùng origin, cookie host-only của đúng site)
 * với mọi request web. Bản trước tự đọc biến môi trường và rơi về `http://localhost:4000` khi thiếu:
 * ở môi trường không đặt biến đó, nút tải trỏ sang máy của chính người bấm.
 *
 * `groupBy = seller` ⇒ một dòng mỗi người bán thay vì từng dòng theo chuyến.
 */
export const taxExportUrl = (period: string, groupBy?: TaxExportGroupBy): string => {
  const query = new URLSearchParams({ period, ...(groupBy ? { groupBy } : {}) });
  return browserApiHref(`/platform/money/tax/export?${query.toString()}`);
};
