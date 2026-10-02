import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  marketplaceApi,
  recommendedParams,
  type RecommendedListingParams,
} from '@/api/marketplace/api';

/** Trang chủ xem TRƯỚC — tám ô. Trần thật nằm ở backend; đây chỉ là con số mặc định. */
export const RECOMMENDED_LIMIT = 8;

/**
 * Khối "Xe phù hợp với bạn" ở trang chủ (ADR 0043).
 *
 * Backend xếp theo hai tầng: BẬC ĐỊA LÝ trước (đúng tỉnh → cùng vùng → còn lại), rồi `rank_score`
 * — điểm gộp từ chất lượng Bayes, số chuyến đã chạy, độ đầy hồ sơ và độ mới. Mỗi gian hàng tối đa
 * hai xe, để một gian hàng đông xe không chiếm cả khối.
 *
 * Tỉnh ở đây là ƯU TIÊN chứ không phải bộ lọc: khách ở tỉnh chưa có xe vẫn thấy một khối đầy, chỉ
 * là xe tỉnh khác. Khi điều đó xảy ra, `meta.mixedProvinces` bật và giao diện phải NÓI RA.
 */
export function useRecommendedListings(params: RecommendedListingParams) {
  return useQuery({
    queryKey: queryKeys.marketplace.recommended(recommendedParams(params)),
    queryFn: () => marketplaceApi.recommended(params),
  });
}
