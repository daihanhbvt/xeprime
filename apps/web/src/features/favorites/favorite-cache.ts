import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { FavoriteVehicle } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import type { FavoritesPage } from './api';

/**
 * Cập nhật lạc quan + hoàn tác của "Xe yêu thích" — hàm THUẦN trên `QueryClient`, tách khỏi hook
 * để test được bằng một QueryClient thật (không cần React).
 *
 * ## Ba bảo đảm (BRD §6.8 · §7)
 *
 * 1. **Theo từng xe.** Trạng thái trái tim khoá theo `vehicleId`; mọi phép ghi ở đây chỉ chạm khoá
 *    của ĐÚNG xe đang thao tác. Không có snapshot "cả tập" nào bị khôi phục đè lên thao tác song
 *    song của xe khác.
 * 2. **Hội tụ về lượt bấm cuối.** Các lượt của cùng một xe chạy NỐI TIẾP (mutation `scope` theo
 *    xe) và mỗi lượt gửi TRẠNG THÁI MONG MUỐN (PUT/DELETE idempotent). Giao diện đổi ngay ở mỗi
 *    lượt; chỉ lượt CUỐI CÙNG trong chuỗi mới được quyết định hoàn tác.
 * 3. **Hoàn tác về sự thật đã xác nhận, không về "trạng thái trước lượt này".** Mỗi xe có một
 *    `base` = trạng thái server đã xác nhận gần nhất (lấy lúc chuỗi bắt đầu, cập nhật sau mỗi lượt
 *    thành công). Lượt cuối hỏng ⇒ trở về `base`. "Trước lượt này" có thể là giá trị lạc quan của
 *    một lượt trước cũng đã hỏng — khôi phục nó là để giao diện nói một điều server chưa bao giờ
 *    lưu.
 */

interface RemovedCard {
  queryKey: QueryKey;
  item: FavoriteVehicle;
  pageIndex: number;
  index: number;
}

interface VehicleTrack {
  /** Trạng thái server đã xác nhận gần nhất. */
  base: boolean;
  /** Số lượt của xe này chưa xong. */
  pending: number;
  /** Thẻ đã gỡ lạc quan khỏi các danh sách — để trả về ĐÚNG chỗ cũ nếu phải hoàn tác. */
  removed: RemovedCard[];
}

/** Sổ theo dõi riêng của từng QueryClient (mỗi test/mỗi cây React một sổ). */
const tracksByClient = new WeakMap<QueryClient, Map<string, VehicleTrack>>();

function tracksOf(client: QueryClient): Map<string, VehicleTrack> {
  let tracks = tracksByClient.get(client);
  if (!tracks) {
    tracks = new Map();
    tracksByClient.set(client, tracks);
  }
  return tracks;
}

type FavoritesListData = InfiniteData<FavoritesPage, number>;

export function readFavorite(client: QueryClient, vehicleId: string): boolean | undefined {
  return client.getQueryData<boolean>(queryKeys.favorites.status(vehicleId));
}

export function writeFavorite(client: QueryClient, vehicleId: string, value: boolean): void {
  client.setQueryData<boolean>(queryKeys.favorites.status(vehicleId), value);
}

function shiftTotals(data: FavoritesListData, delta: number): FavoritesPage[] {
  return data.pages.map((page) => ({
    ...page,
    meta: { ...page.meta, total: Math.max(0, page.meta.total + delta) },
  }));
}

/** Gỡ thẻ của xe này khỏi MỌI danh sách yêu thích đang trong cache; trả về vị trí đã gỡ. */
export function removeFromFavoriteLists(client: QueryClient, vehicleId: string): RemovedCard[] {
  const removed: RemovedCard[] = [];
  for (const [queryKey, data] of client.getQueriesData<FavoritesListData>({
    queryKey: queryKeys.favorites.lists,
  })) {
    if (!data) continue;
    let found: RemovedCard | null = null;
    data.pages.forEach((page, pageIndex) => {
      const index = page.items.findIndex((item) => item.id === vehicleId);
      if (index >= 0 && !found) found = { queryKey, item: page.items[index]!, pageIndex, index };
    });
    if (!found) continue;
    const hit: RemovedCard = found;
    removed.push(hit);
    const pages = shiftTotals(data, -1).map((page, pageIndex) =>
      pageIndex === hit.pageIndex
        ? { ...page, items: page.items.filter((item) => item.id !== vehicleId) }
        : page,
    );
    client.setQueryData<FavoritesListData>(queryKey, { ...data, pages });
  }
  return removed;
}

/** Trả thẻ về đúng trang/vị trí cũ — bỏ qua danh sách đã có lại thẻ đó (vd đã tải lại). */
export function restoreToFavoriteLists(client: QueryClient, removed: readonly RemovedCard[]): void {
  for (const card of removed) {
    const data = client.getQueryData<FavoritesListData>(card.queryKey);
    if (!data) continue;
    if (data.pages.some((page) => page.items.some((item) => item.id === card.item.id))) continue;
    const pageIndex = Math.min(card.pageIndex, data.pages.length - 1);
    if (pageIndex < 0) continue;
    const pages = shiftTotals(data, +1).map((page, i) => {
      if (i !== pageIndex) return page;
      const items = [...page.items];
      items.splice(Math.min(card.index, items.length), 0, card.item);
      return { ...page, items };
    });
    client.setQueryData<FavoritesListData>(card.queryKey, { ...data, pages });
  }
}

/**
 * Bắt đầu MỘT lượt thích/bỏ thích của một xe: đổi giao diện ngay. `current` là trạng thái giao diện
 * đang hiện (dùng làm `base` khi đây là lượt đầu của chuỗi và cache chưa có giá trị).
 */
export function beginFavoriteChange(
  client: QueryClient,
  vehicleId: string,
  desired: boolean,
  current?: boolean,
): void {
  const tracks = tracksOf(client);
  let track = tracks.get(vehicleId);
  if (!track) {
    track = {
      base: readFavorite(client, vehicleId) ?? current ?? !desired,
      pending: 0,
      removed: [],
    };
    tracks.set(vehicleId, track);
  }
  track.pending += 1;
  writeFavorite(client, vehicleId, desired);
  if (!desired) track.removed.push(...removeFromFavoriteLists(client, vehicleId));
}

export interface FavoriteSettleResult {
  /** Đây là lượt cuối của chuỗi (không còn lượt nào của xe này đang chờ). */
  isLast: boolean;
  /** Giao diện vừa bị hoàn tác về trạng thái server đã xác nhận. */
  rolledBack: boolean;
  /** Trạng thái server đã xác nhận sau lượt này. */
  confirmed: boolean;
}

/**
 * Kết thúc MỘT lượt. Thành công ⇒ `base` = trạng thái server vừa trả. Hỏng ⇒ chỉ lượt CUỐI mới
 * hoàn tác (lượt sau còn chờ mang ý định mới hơn của khách; nó sẽ tự quyết).
 */
export function settleFavoriteChange(
  client: QueryClient,
  vehicleId: string,
  outcome: { ok: true; favorited: boolean } | { ok: false },
): FavoriteSettleResult {
  const tracks = tracksOf(client);
  const track = tracks.get(vehicleId);
  if (!track) {
    // Sổ đã bị dọn (đổi phiên giữa chừng) — không biết gì hơn để hoàn tác.
    return { isLast: true, rolledBack: false, confirmed: outcome.ok ? outcome.favorited : false };
  }
  track.pending = Math.max(0, track.pending - 1);
  if (outcome.ok) track.base = outcome.favorited;
  const isLast = track.pending === 0;
  let rolledBack = false;

  if (isLast) {
    if (!outcome.ok && readFavorite(client, vehicleId) !== track.base) {
      writeFavorite(client, vehicleId, track.base);
      if (track.base) restoreToFavoriteLists(client, track.removed);
      rolledBack = true;
    }
    tracks.delete(vehicleId);
  }
  return { isLast, rolledBack, confirmed: track.base };
}

/** Còn lượt nào của xe này đang chờ không — dùng trong test và để tránh làm mới cache sớm. */
export function hasPendingFavoriteChange(client: QueryClient, vehicleId: string): boolean {
  return (tracksOf(client).get(vehicleId)?.pending ?? 0) > 0;
}
