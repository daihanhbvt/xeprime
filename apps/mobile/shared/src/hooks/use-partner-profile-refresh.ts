import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/queries/query-keys';
import { usePullRefresh } from './use-pull-refresh';

/**
 * Kéo-để-làm-mới cho hai màn hồ sơ của site Partner: Cửa hàng (tuyến gói) và Hồ sơ chủ xe (tuyến
 * hoa hồng). Cả hai nhúng cùng các khối — hồ sơ gian hàng, "Gói & hạn mức", danh sách gói theo cờ
 * quảng bá — nên làm mới phải chạm đủ các nguồn đó, không chỉ query của riêng màn.
 *
 * `/auth/me` nằm trong danh sách vì gói hiện hành, hạn và tuyến hiệu lực đọc từ scope phiên.
 */
export function usePartnerProfileRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const queryClient = useQueryClient();

  return usePullRefresh(
    useCallback(
      () =>
        Promise.all(
          [
            queryKeys.auth.all,
            queryKeys.shop.all,
            queryKeys.subscription.all,
            queryKeys.appConfig.all,
          ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        ),
      [queryClient],
    ),
  );
}
