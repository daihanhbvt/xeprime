'use client';

import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { RecommendedListings } from '@xeprime/types';
import {
  rememberedProvinceSnapshot,
  serverRememberedProvinceSnapshot,
  subscribeRememberedProvince,
} from '@/lib/province-memory';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { MarketplaceFilters } from '../types';

/** Trang chủ xem TRƯỚC — tám ô. Trần thật nằm ở backend; đây chỉ là con số mặc định. */
export const RECOMMENDED_LIMIT = 8;

/**
 * Tỉnh dùng để ƯU TIÊN xếp hạng ở trang chủ.
 *
 * Hai nguồn, theo thứ tự: URL (khách vừa chọn một địa điểm, hoặc mở một link có sẵn ngữ cảnh)
 * rồi tới bộ nhớ lượt trước (`localStorage`).
 *
 * Vì sao bộ nhớ được dùng ở ĐÂY trong khi thẻ tìm kiếm cố ý không ghi nó vào URL: ở thẻ tìm
 * kiếm, ghi vào URL là LỌC hộ người dùng một thứ họ chưa bấm — và một bộ lọc không ai bấm thì
 * làm xe biến mất. Ở đây nó chỉ đổi THỨ TỰ: không xe nào bị loại, nên dùng lựa chọn lượt trước
 * là suy đoán vô hại và đúng phần lớn thời gian. Trước thay đổi này, hệ quả của việc bỏ qua bộ
 * nhớ nhìn thấy được trên màn hình: viên địa điểm ghi "Hà Nội" còn danh sách bên dưới mở đầu
 * bằng xe ở An Giang.
 *
 * `useSyncExternalStore` chứ không phải đọc thẳng `localStorage`: server không có kho đó, và
 * đọc trong lúc render sẽ cho HTML server khác lần render đầu ở client (lỗi hydration).
 */
export function useNearProvinceCode(filters: MarketplaceFilters): string | null {
  const remembered = useSyncExternalStore(
    subscribeRememberedProvince,
    rememberedProvinceSnapshot,
    serverRememberedProvinceSnapshot,
  );
  return filters.provinceCode ?? remembered;
}

/**
 * Khối "Xe phù hợp với bạn" — server data qua TanStack Query (ADR 0004).
 *
 * Endpoint RIÊNG (`/public/listings/recommended`), không phải `/public/listings`: ở đây tỉnh là
 * ưu tiên chứ không phải bộ lọc, và backend còn áp trần số xe mỗi gian hàng. Xem docblock
 * `RecommendedListingQueryDto` ở api để biết vì sao hai câu hỏi đó không dùng chung một endpoint.
 */
export function useRecommendedListings(params: {
  vehicleType?: string;
  serviceType?: string;
  nearProvinceCode: string | null;
  pickupAt?: string;
  returnAt?: string;
  limit?: number;
}) {
  const query = {
    vehicleType: params.vehicleType ?? null,
    serviceType: params.serviceType ?? null,
    nearProvinceCode: params.nearProvinceCode,
    pickupAt: params.pickupAt ?? null,
    returnAt: params.returnAt ?? null,
    limit: params.limit ?? RECOMMENDED_LIMIT,
  };

  return useQuery({
    queryKey: queryKeys.marketplace.recommended(query),
    /*
     * `apiRequest` chứ không phải `apiGet`: `apiGet` bóc lấy `data` và vứt mất `meta`, mà
     * `meta` ở đây mới là thứ cho giao diện biết tỉnh nào đã được ưu tiên và kết quả có phải bù
     * từ tỉnh khác không.
     *
     * Phong bì chung khai `meta` kiểu mở (`ApiMeta`) vì nó phục vụ mọi endpoint, nên chỗ thu
     * hẹp về đúng meta của endpoint này là đây — một phép ép kiểu, trên đúng một trường, cạnh
     * lời gọi sinh ra nó.
     */
    queryFn: async (): Promise<RecommendedListings> => {
      const res = await apiRequest<RecommendedListings['data']>('/public/listings/recommended', {
        query,
      });
      return { data: res.data, meta: res.meta as RecommendedListings['meta'] };
    },
  });
}
