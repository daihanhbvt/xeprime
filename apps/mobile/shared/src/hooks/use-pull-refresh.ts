import { useCallback, useMemo, useState } from 'react';
import type { ScreenRefresh } from './use-form-refresh';

/**
 * Kéo-để-làm-mới với vòng quay CHỈ hiện khi người dùng thật sự kéo.
 *
 * Gắn `refreshing` vào `query.isRefetching` là sai trên một query có nhịp poll hay refetch khi
 * quay về tiền cảnh: mỗi lượt đọc nền bật vòng quay lên đầu màn dù không ai chạm vào. Ở đây cờ
 * là state cục bộ — bật trong `onRefresh`, tắt ở `finally` khi lời hứa làm mới xong (thành công
 * hay lỗi đều tắt). Truyền `refresh` đã bọc `useCallback` để `onRefresh` giữ danh tính.
 */
export function usePullRefresh(refresh: () => Promise<unknown>): ScreenRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve()
      .then(refresh)
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refresh]);

  return useMemo(() => ({ refreshing, onRefresh }), [refreshing, onRefresh]);
}
