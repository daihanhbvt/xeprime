'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PublicDestination } from '../types';

/**
 * Địa điểm công khai — tỉnh/thành ĐANG THỰC SỰ CÓ XE, kèm số xe đếm từ backend (ADR 0004:
 * server data ở TanStack Query).
 *
 * Đây là NGUỒN DUY NHẤT cho mọi bộ chọn địa điểm ở marketplace: hero desktop, dialog mobile,
 * ô sửa tìm kiếm ở `/search`, và "Địa điểm nổi bật". Frontend KHÔNG có danh sách tỉnh riêng —
 * nhờ vậy desktop và mobile không thể lệch nhau, và tỉnh bị admin ẩn (hoặc không còn xe nào)
 * biến mất khỏi mọi chỗ cùng lúc.
 *
 * Giá trị đi vào URL là `provinceCode`; `provinceName` chỉ để hiển thị.
 */
export function useDestinations(limit: number) {
  const params = { limit };
  return useQuery({
    queryKey: queryKeys.marketplace.destinations(params),
    queryFn: async (): Promise<PublicDestination[]> => {
      const res = await apiRequest<PublicDestination[]>('/public/destinations', { query: params });
      return res.data;
    },
    // Số liệu tổng hợp, đổi chậm — không cần refetch liên tục.
    staleTime: 5 * 60_000,
  });
}
