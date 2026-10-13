import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { appConfigApi } from '@/api/app-config/api';
import { useRefetchOnForeground } from '@/hooks/use-app-active';
import { queryKeys } from '@/queries/query-keys';

/**
 * Cờ `isPlanPromotionEnabled` của app Partner — có hiện đường mua/gia hạn gói, danh sách gói và nút "Liên hệ
 * tư vấn" hay không.
 *
 * KHÔNG realtime: mỗi lần màn dùng cờ được dựng/focus, và mỗi lần app quay lại tiền cảnh, hỏi lại
 * `GET /app-config/partner` (`staleTime: 0`, `refetchOnMount: 'always'`).
 *
 * MẶC ĐỊNH ẨN: đang tải hoặc lỗi thì `isPlanPromotionEnabled = false`. Hiện nhầm một lối mua gói là đúng thứ
 * chính sách cửa hàng ứng dụng cấm; ẩn nhầm vài giây thì không ai thiệt.
 */
export function usePartnerAppConfig() {
  const query = useQuery({
    queryKey: queryKeys.appConfig.partner,
    queryFn: () => appConfigApi.partner(),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  useFocusEffect(refresh);
  useRefetchOnForeground(refresh);

  return {
    isPlanPromotionEnabled: query.data?.isPlanPromotionEnabled === true,
    isLoading: query.isLoading,
  };
}

/**
 * Cùng cờ, đọc THỤ ĐỘNG — cho component nhỏ dựng ở nhiều nơi (nhãn tuyến trong drawer, sheet) mà
 * không cần lượt hỏi lại theo focus. Dùng chung khoá cache nên lượt hỏi lại của màn chính cập nhật
 * luôn chỗ này. Mặc định ẩn như hook chính.
 */
export function usePlanPromotionEnabledPassive(enabled = true): boolean {
  const query = useQuery({
    queryKey: queryKeys.appConfig.partner,
    queryFn: () => appConfigApi.partner(),
    enabled,
  });
  return query.data?.isPlanPromotionEnabled === true;
}
