import { SEARCH_OWNED_KEYS, draftToFilterPatch, type SearchDraft } from '@xeprime/domain';
import { ROUTES } from '@/constants/routes';
import { applyFilterPatch } from '../filter-params';
import type { MarketplaceFilters } from '../types';

/**
 * Luật của thẻ tìm kiếm sống ở `@xeprime/domain` (`search-draft`) — app native dựng đúng thẻ
 * này và phải hỏi backend cùng một câu.
 *
 * Ở lại đây chỉ hai hàm phụ thuộc URL: chỉ web mới có thanh địa chỉ để mang ngữ cảnh đi.
 */
export {
  SEARCH_OWNED_KEYS,
  defaultRentalRange,
  draftFromFilters,
  draftToFilterPatch,
  resolveServiceType,
  serviceUsesRentalRange,
  type RentalMode,
  type SearchDraft,
} from '@xeprime/domain';

/**
 * Chữ ký ngữ cảnh tìm kiếm — chỉ các key thẻ tìm kiếm sở hữu, đã chuẩn hoá và sắp xếp.
 *
 * Dùng để so "URL đang nói gì" với "bản nháp đang nói gì" mà không so từng trường: hai bên đi
 * qua đúng một bộ quy tắc serialize nên `''`/`undefined`/`false` không thể tạo ra khác biệt giả.
 */
export function searchContextSignature(source: Partial<MarketplaceFilters>): string {
  const params = new URLSearchParams();
  applyFilterPatch(
    params,
    Object.fromEntries(
      SEARCH_OWNED_KEYS.map((key) => [key, source[key]]),
    ) as Partial<MarketplaceFilters>,
  );
  params.sort();
  return params.toString();
}

/**
 * Link sang trang kết quả mang trọn ngữ cảnh. Dựng từ một `URLSearchParams` RỖNG: thao tác
 * "Tìm xe" là một truy vấn mới, không kế thừa facet đang bật ở nơi khác.
 */
export function buildSearchHref(draft: SearchDraft): string {
  const params = new URLSearchParams();
  applyFilterPatch(params, draftToFilterPatch(draft));
  const qs = params.toString();
  return qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH;
}
