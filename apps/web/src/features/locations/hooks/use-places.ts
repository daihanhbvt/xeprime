'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { browserApiHref } from '@/lib/api-href';
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
 * Đi qua backend (`/places/search`) chứ KHÔNG gọi thẳng nhà cung cấp bản đồ: khoá có tính tiền
 * theo request, và một khoá nhúng trong bundle web là một khoá ai cũng sao chép được (ADR 0061).
 *
 * `biasPoint` kéo kết quả về gần một điểm — truyền toạ độ đang có (hoặc tâm tỉnh) để
 * `"Nguyễn Huệ"` ra đúng vùng người dùng đang khai báo thay vì ra TP.HCM mọi lúc.
 *
 * `except` là chuỗi KHÔNG cần hỏi (địa chỉ đã xác nhận) — so với chuỗi ĐÃ debounce, cùng chuỗi
 * làm khoá truy vấn. So ở nơi gọi bằng chữ đang gõ thì phím gõ đầu tiên đã bật truy vấn trong khi
 * khoá vẫn là chính địa chỉ đó: một giao dịch tính tiền cho thứ không ai hỏi.
 *
 * Bản đồ hỏng KHÔNG phải lỗi của người đang điền form: query trả `available: false` và ô nhập
 * vẫn hoạt động như một ô chữ bình thường.
 */
export function usePlaceSearch(
  query: string,
  options: {
    biasPoint?: { lat: number; lng: number } | null;
    enabled?: boolean;
    except?: string;
  } = {},
) {
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const bias = options.biasPoint ?? null;
  const longEnough = debounced.length >= PLACE_SEARCH_MIN_LENGTH;
  const skipped = debounced === options.except?.trim();

  const result = useQuery({
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
    enabled: (options.enabled ?? true) && longEnough && !skipped,
    // Gợi ý cũ 5 phút vẫn dùng được cho cùng một chuỗi — người dùng hay xoá rồi gõ lại.
    staleTime: 5 * 60_000,
    // Gợi ý hỏng thì hỏi lại cũng không giúp người đang gõ — họ đã gõ tiếp, và một 429 hỏi lại là
    // thêm lượt bị chặn. Ô địa chỉ mời "dùng đúng địa chỉ đã nhập" ngay.
    retry: false,
    placeholderData: (previous) => previous,
  });
  /*
   * Chuỗi ĐÃ debounce đi kèm kết quả: trong ~400ms giữa phím gõ và lượt hỏi, `isFetching` vẫn là
   * `false` và `data` là danh sách của chuỗi TRƯỚC — nơi gọi cần biết danh sách trong tay có đúng
   * là của chữ đang hiện không (xem dòng "dùng đúng địa chỉ đã nhập" ở `ConfirmedPlaceField`).
   */
  return { ...result, debouncedQuery: debounced };
}

/**
 * URL ảnh bản đồ tĩnh của một địa điểm VỪA CHỌN (ADR 0061 điều 1). API chỉ vẽ cho mã đã qua
 * `/places/detail`; mã là danh tính của điểm nên không cần tham số phiên bản.
 */
export function placeMapSrc(placeId: string): string {
  return browserApiHref(`/places/map?placeId=${encodeURIComponent(placeId)}`);
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
