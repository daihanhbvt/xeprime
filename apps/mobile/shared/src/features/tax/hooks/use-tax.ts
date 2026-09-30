import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { taxApi } from '@/api/tax/api';

/**
 * Thuế đã khấu trừ của CHÍNH gian hàng — bản native của `useShopTaxSummary` bên web.
 *
 * Cùng khoá cache với web (`queryKeys.tax.shopSummary`): hai app gọi cùng endpoint mà đặt khoá
 * khác nhau thì một `invalidateQueries` chỉ làm mới được một nửa.
 */
export function useShopTaxSummary(period: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tax.shopSummary(period ?? 'current'),
    queryFn: () => taxApi.shopSummary(period),
    enabled,
  });
}
