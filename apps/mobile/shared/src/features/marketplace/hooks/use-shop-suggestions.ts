import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { searchTokens } from '@xeprime/domain';
import { marketplaceApi, type PublicShopSummary } from '../api';
import { queryKeys } from '@/queries/query-keys';

/** Số gợi ý tối đa — một danh sách dài hơn thế là một trang kết quả thứ hai. */
export const SHOP_SUGGESTION_LIMIT = 5;

/**
 * Chủ xe / gian hàng có TÊN CÔNG KHAI khớp từ khoá — bản native của `use-shop-suggestions` web.
 *
 * Không gọi khi từ khoá không còn từ nào sau khi gấp (chỉ dấu câu / khoảng trắng).
 * `keepPreviousData` giữ danh sách cũ trong lúc gõ tiếp — không chớp tắt theo từng phím.
 */
export function useShopSuggestions(keyword: string, options: { enabled?: boolean } = {}) {
  const q = keyword.trim();
  const enabled = (options.enabled ?? true) && searchTokens(q).length > 0;

  return useQuery({
    queryKey: queryKeys.marketplace.shopSuggestions(q, SHOP_SUGGESTION_LIMIT),
    queryFn: async (): Promise<PublicShopSummary[]> => {
      const { items } = await marketplaceApi.shopSuggestions(q, SHOP_SUGGESTION_LIMIT);
      return items;
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME.STANDARD,
  });
}
