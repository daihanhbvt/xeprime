'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchTokens } from '@xeprime/domain';
import { fetchPage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PublicShopSummary } from '../types';

/** Số gợi ý tối đa — một danh sách thả xuống dài hơn thế là một trang kết quả thứ hai. */
export const SHOP_SUGGESTION_LIMIT = 5;

/**
 * Chủ xe / gian hàng có TÊN CÔNG KHAI khớp từ khoá — gợi ý của ô từ khoá ở `/search`.
 *
 * Cùng luật khớp với lưới kết quả (server: `storefrontKeywordWhere`), nên gợi ý không bao giờ nêu
 * một cái tên mà lưới không coi là khớp. Không gọi khi từ khoá không còn từ nào sau khi gấp
 * (chỉ dấu câu / khoảng trắng). `keepPreviousData` giữ danh sách cũ trong lúc gõ tiếp — danh
 * sách thả xuống không chớp tắt theo từng phím.
 */
export function useShopSuggestions(keyword: string, options: { enabled?: boolean } = {}) {
  const q = keyword.trim();
  const enabled = (options.enabled ?? true) && searchTokens(q).length > 0;
  const params = { q, page: 1, limit: SHOP_SUGGESTION_LIMIT };

  return useQuery({
    queryKey: queryKeys.marketplace.shopSuggestions(q, SHOP_SUGGESTION_LIMIT),
    queryFn: async (): Promise<PublicShopSummary[]> => {
      const { items } = await fetchPage<PublicShopSummary>(
        '/public/shops',
        params,
        SHOP_SUGGESTION_LIMIT,
      );
      return items;
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
