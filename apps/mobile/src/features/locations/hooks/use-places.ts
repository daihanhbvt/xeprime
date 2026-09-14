import { useMutation, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { queryKeys } from '@/queries/query-keys';
import { placesApi } from '../api';

/**
 * Chưa đủ dài thì KHÔNG hỏi. `"12 Ng"` vừa chắc chắn tra sai vừa tốn một request CÓ TÍNH TIỀN.
 * Backend cũng chặn ở 3 ký tự — ngưỡng ở đây là để không bắn ra request bị từ chối.
 */
export const PLACE_SEARCH_MIN_LENGTH = 3;

/** Gợi ý chạy theo từng phím gõ, nên trì hoãn lâu hơn ô tìm danh mục (danh mục đọc từ DB mình). */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Gợi ý địa điểm khi người dùng gõ số nhà/tên đường.
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

  return useQuery({
    queryKey: queryKeys.places.search(debounced, bias),
    queryFn: () => placesApi.search(debounced, bias),
    enabled: (options.enabled ?? true) && debounced.length >= PLACE_SEARCH_MIN_LENGTH,
    // Gợi ý cũ 5 phút vẫn dùng được cho cùng một chuỗi — người dùng hay xoá rồi gõ lại.
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Lấy toạ độ của một gợi ý vừa được CHỌN.
 *
 * Là mutation chứ không phải query vì nó chạy đúng một lần cho một hành động của người dùng —
 * dựng thành query nghĩa là phải giữ một `selectedPlaceId` trong state chỉ để kích hoạt một lượt
 * tải, rồi phải nhớ xoá nó đi.
 */
export function usePlaceDetail() {
  return useMutation({ mutationFn: (placeId: string) => placesApi.detail(placeId) });
}

/** Toạ độ → địa chỉ chữ, để người dùng đọc lại "chỗ này là đâu" sau khi chọn một gợi ý. */
export function useReverseGeocode() {
  return useMutation({ mutationFn: (point: { lat: number; lng: number }) => placesApi.reverse(point) });
}
