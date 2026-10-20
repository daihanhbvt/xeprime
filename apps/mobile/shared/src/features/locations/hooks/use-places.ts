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
  options: {
    biasPoint?: { lat: number; lng: number } | null;
    enabled?: boolean;
    /**
     * Chuỗi KHÔNG cần hỏi (địa chỉ đã xác nhận, dòng vừa bấm) — so với chuỗi ĐÃ debounce, cùng
     * chuỗi làm khoá truy vấn (web `usePlaceSearch`, ADR 0061 §3). So với chữ đang gõ thì phím gõ
     * đầu tiên đã bật một giao dịch tính tiền cho thứ không ai hỏi.
     */
    except?: string;
  } = {},
) {
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const bias = options.biasPoint ?? null;
  const skipped = debounced === options.except?.trim();

  const result = useQuery({
    queryKey: queryKeys.places.search(debounced, bias),
    queryFn: () => placesApi.search(debounced, bias),
    enabled:
      (options.enabled ?? true) && debounced.length >= PLACE_SEARCH_MIN_LENGTH && !skipped,
    // Gợi ý cũ 5 phút vẫn dùng được cho cùng một chuỗi — người dùng hay xoá rồi gõ lại.
    staleTime: 5 * 60_000,
    // Gợi ý hỏng thì hỏi lại cũng không giúp người đang gõ — họ đã gõ tiếp, và một 429 hỏi lại là
    // thêm lượt bị chặn (web `usePlaceSearch`, ADR 0061).
    retry: false,
    placeholderData: (previous) => previous,
  });
  /*
   * Chuỗi ĐÃ debounce đi kèm kết quả: trong ~400ms giữa phím gõ và lượt hỏi, `isFetching` vẫn là
   * `false` và `data` là danh sách của chuỗi TRƯỚC — nơi gọi cần biết danh sách trong tay có đúng
   * là của chữ đang hiện không (dòng "dùng đúng địa chỉ đã nhập" ở `ConfirmedPlaceField`).
   */
  return { ...result, debouncedQuery: debounced };
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
