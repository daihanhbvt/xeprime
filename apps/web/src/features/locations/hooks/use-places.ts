'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { apiRequest } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PlaceDetail, PlaceSuggestion } from '../types';

/**
 * Chưa đủ dài thì KHÔNG hỏi.
 *
 * Cùng lý do với ngưỡng ở ô địa chỉ giao xe: `"12 Ng"` vừa chắc chắn tra sai vừa tốn một request
 * CÓ TÍNH TIỀN tới nhà cung cấp bản đồ. Backend cũng chặn ở 3 ký tự — ngưỡng ở đây là để không
 * bắn ra request bị từ chối, không phải để thay cho nó.
 */
export const PLACE_SEARCH_MIN_LENGTH = 3;

/** Gợi ý chạy theo từng phím gõ, nên debounce dài hơn ô tìm danh mục (danh mục đọc từ DB mình). */
const SEARCH_DEBOUNCE_MS = 400;

interface PlaceSearchResult {
  items: PlaceSuggestion[];
  /** `false` = chưa cấu hình khoá bản đồ hoặc nhà cung cấp lỗi. Giao diện rơi về nhập tay. */
  available: boolean;
}

interface PlaceDetailResult {
  place: PlaceDetail | null;
  available: boolean;
}

/**
 * Gợi ý địa điểm khi người dùng gõ số nhà/tên đường.
 *
 * Đi qua backend (`/places/search`) chứ KHÔNG gọi thẳng Google: khoá bản đồ có tính tiền theo
 * request, và một khoá nhúng trong bundle web là một khoá ai cũng sao chép được (ADR 0018).
 *
 * `biasPoint` kéo kết quả về gần một điểm — truyền ghim hiện tại để `"Nguyễn Huệ"` ra đúng vùng
 * người dùng đang khai báo thay vì ra TP.HCM mọi lúc.
 *
 * Bản đồ hỏng KHÔNG phải lỗi của người đang điền form: query trả `available: false` và ô nhập
 * vẫn hoạt động như một ô chữ bình thường.
 */
export function usePlaceSearch(
  query: string,
  options: { biasPoint?: { lat: number; lng: number } | null; enabled?: boolean } = {},
) {
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const bias = options.biasPoint ?? null;
  const longEnough = debounced.length >= PLACE_SEARCH_MIN_LENGTH;

  return useQuery({
    queryKey: queryKeys.places.search(debounced, bias),
    queryFn: async (): Promise<PlaceSearchResult> => {
      const params = new URLSearchParams({ q: debounced });
      if (bias) {
        params.set('lat', String(bias.lat));
        params.set('lng', String(bias.lng));
      }
      const res = await apiRequest<PlaceSearchResult>(`/places/search?${params.toString()}`);
      return res.data;
    },
    enabled: (options.enabled ?? true) && longEnough,
    // Gợi ý cũ 5 phút vẫn dùng được cho cùng một chuỗi — người dùng hay xoá rồi gõ lại.
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Lấy toạ độ của một gợi ý vừa được CHỌN.
 *
 * Là mutation chứ không phải query vì nó chạy đúng một lần cho một hành động của người dùng —
 * dựng nó thành query có nghĩa là phải giữ một `selectedPlaceId` trong state chỉ để kích hoạt
 * một lượt tải, rồi phải nhớ xoá nó đi.
 */
export function usePlaceDetail() {
  return useMutation({
    mutationFn: async (placeId: string): Promise<PlaceDetailResult> => {
      const res = await apiRequest<PlaceDetailResult>(
        `/places/detail?placeId=${encodeURIComponent(placeId)}`,
      );
      return res.data;
    },
  });
}

/**
 * Toạ độ (người dùng vừa kéo/thả ghim) → địa chỉ chữ, để họ đọc lại "chỗ này là đâu".
 *
 * Toạ độ trả về LUÔN là toạ độ đã gửi lên — cái ghim là thứ người dùng chủ động đặt, còn địa chỉ
 * chữ chỉ là chú thích cho nó.
 */
export function useReverseGeocode() {
  return useMutation({
    mutationFn: async (point: { lat: number; lng: number }): Promise<PlaceDetailResult> => {
      const res = await apiRequest<PlaceDetailResult>(
        `/places/reverse?lat=${point.lat}&lng=${point.lng}`,
      );
      return res.data;
    },
  });
}
