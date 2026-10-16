'use client';

import { useQuery } from '@tanstack/react-query';
import { PROVINCE_CODES } from '@xeprime/types';
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

/**
 * MỌI tỉnh đang có xe — cho chỗ cần tra tên / số xe / giá "chỉ từ" của một tỉnh BẤT KỲ (địa điểm
 * nổi bật, xe gợi ý, trang kết quả, bộ chọn địa điểm). Cùng một `limit` ⇒ cùng một khoá cache: cả
 * trang chủ chỉ gọi `/public/destinations` một lần, thay vì mỗi nơi tự đoán một con số.
 */
export function useAllDestinations() {
  return useDestinations(PROVINCE_CODES.length);
}
