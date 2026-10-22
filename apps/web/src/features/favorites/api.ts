import {
  FAVORITE_LIST_DEFAULT_LIMIT,
  FAVORITE_STATUS_MAX_IDS,
  type FavoriteStatus,
  type FavoriteToggleResult,
  type FavoriteVehicle,
  type PaginationMeta,
  type VehicleType,
} from '@xeprime/types';
import { apiDelete, apiGet, apiPut, fetchPage } from '@/services/api-client';

/**
 * Lời gọi API của "Xe yêu thích" (bản web — ADR 0031; app native có bản riêng ở
 * `apps/mobile/shared/src/api/`, KHÔNG tự đồng bộ với file này).
 */

const BASE = '/account/favorites';

export interface FavoritesPage {
  items: FavoriteVehicle[];
  meta: PaginationMeta;
}

export async function fetchFavoritesPage(
  vehicleType: VehicleType,
  page: number,
  options?: { signal?: AbortSignal; limit?: number },
): Promise<FavoritesPage> {
  const limit = options?.limit ?? FAVORITE_LIST_DEFAULT_LIMIT;
  const { items, meta } = await fetchPage<FavoriteVehicle>(
    BASE,
    { vehicleType, page, limit },
    limit,
    options,
  );
  return { items, meta };
}

/**
 * Tải `count` trang LIÊN TIẾP (cùng `limit`) từ `fromPage` và gộp thành một — để màn hình tải lần
 * đầu một khối, mỗi lần "Xem thêm" nhiều khối, mà vị trí (offset) vẫn khớp phân trang server.
 * `meta` lấy của trang cuối (page = trang cuối đã tải, `hasNext` của nó).
 */
export async function fetchFavoritesPages(
  vehicleType: VehicleType,
  fromPage: number,
  count: number,
  limit: number,
  options?: { signal?: AbortSignal },
): Promise<FavoritesPage> {
  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      fetchFavoritesPage(vehicleType, fromPage + i, { signal: options?.signal, limit }),
    ),
  );
  const last = pages[pages.length - 1]!;
  return { items: pages.flatMap((p) => p.items), meta: last.meta };
}

/** Lưu xe — `PUT` idempotent: gửi TRẠNG THÁI MONG MUỐN, không gửi "đảo". */
export function putFavorite(vehicleId: string): Promise<FavoriteToggleResult> {
  return apiPut<FavoriteToggleResult>(`${BASE}/${encodeURIComponent(vehicleId)}`);
}

/** Bỏ lưu — `DELETE` idempotent. */
export function deleteFavorite(vehicleId: string): Promise<FavoriteToggleResult> {
  return apiDelete<FavoriteToggleResult>(`${BASE}/${encodeURIComponent(vehicleId)}`);
}

export function fetchFavoriteStatus(vehicleIds: readonly string[]): Promise<FavoriteStatus> {
  return apiGet<FavoriteStatus>(`${BASE}/status`, { vehicleIds: vehicleIds.join(',') });
}

// ── Gom lô trạng thái trái tim ────────────────────────────────────────────────────────────────

interface Waiter {
  resolve: (favorited: boolean) => void;
  reject: (error: unknown) => void;
}

/**
 * Bộ gom lô kiểu DataLoader cho "xe này tôi đã thích chưa".
 *
 * Mỗi thẻ xe hỏi theo khoá RIÊNG của nó (`queryKeys.favorites.status(vehicleId)`) — đó là điều
 * giữ cho cập nhật lạc quan / hoàn tác của một xe không bao giờ chạm trạng thái xe khác. Nhưng
 * một trang 48 thẻ không được thành 48 request: mọi lời hỏi phát ra trong cùng một lượt (cùng
 * macrotask) được gom thành MỘT `GET /account/favorites/status?vehicleIds=…`, cắt theo
 * {@link FAVORITE_STATUS_MAX_IDS} — đúng trần server nhận.
 */
export function createFavoriteStatusBatcher(
  fetcher: (ids: readonly string[]) => Promise<FavoriteStatus> = fetchFavoriteStatus,
  schedule: (run: () => void) => void = (run) => setTimeout(run, 0),
) {
  let queue = new Map<string, Waiter[]>();
  let scheduled = false;

  async function flush(batch: Map<string, Waiter[]>) {
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += FAVORITE_STATUS_MAX_IDS) {
      const chunk = ids.slice(i, i + FAVORITE_STATUS_MAX_IDS);
      try {
        const { vehicleIds } = await fetcher(chunk);
        const liked = new Set(vehicleIds);
        for (const id of chunk) for (const w of batch.get(id) ?? []) w.resolve(liked.has(id));
      } catch (error) {
        for (const id of chunk) for (const w of batch.get(id) ?? []) w.reject(error);
      }
    }
  }

  return function load(vehicleId: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const waiters = queue.get(vehicleId) ?? [];
      waiters.push({ resolve, reject });
      queue.set(vehicleId, waiters);
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        const batch = queue;
        queue = new Map();
        scheduled = false;
        void flush(batch);
      });
    });
  };
}

export const loadFavoriteStatus = createFavoriteStatusBatcher();
