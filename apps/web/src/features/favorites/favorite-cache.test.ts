import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { VEHICLE_TYPE, type FavoriteVehicle } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { createFavoriteStatusBatcher, type FavoritesPage } from './api';
import {
  beginFavoriteChange,
  hasPendingFavoriteChange,
  readFavorite,
  settleFavoriteChange,
  writeFavorite,
} from './favorite-cache';
import { FAVORITE_INTENT_TTL_MS, parseFavoriteIntent } from './favorite-intent';

/**
 * Lạc quan + hoàn tác của Xe yêu thích (BRD §6.8 · §7) — trên một QueryClient THẬT.
 *
 * Khoá lại ba điều: lỗi của một xe không đụng xe khác; bấm dồn dập chỉ lượt CUỐI quyết hoàn tác và
 * hoàn tác về trạng thái server đã xác nhận; thẻ bị bỏ thích quay về đúng vị trí khi lỗi.
 */

const vehicle = (id: string) => ({ id, name: `Xe ${id}` }) as unknown as FavoriteVehicle;

function seedList(client: QueryClient, ids: string[][]) {
  const key = queryKeys.favorites.list({ vehicleType: VEHICLE_TYPE.CAR });
  const total = ids.flat().length;
  const data: InfiniteData<FavoritesPage, number> = {
    pageParams: ids.map((_, i) => i + 1),
    pages: ids.map((pageIds, i) => ({
      items: pageIds.map(vehicle),
      meta: { page: i + 1, limit: 2, total, hasNext: i < ids.length - 1 },
    })),
  };
  client.setQueryData(key, data);
  return () => client.getQueryData<InfiniteData<FavoritesPage, number>>(key)!;
}

const listIds = (data: InfiniteData<FavoritesPage, number>) =>
  data.pages.map((page) => page.items.map((item) => item.id));

describe('favorite-cache', () => {
  it('lỗi của xe A không đụng xe B đang có thao tác song song', () => {
    const client = new QueryClient();
    writeFavorite(client, 'A', false);
    writeFavorite(client, 'B', false);

    beginFavoriteChange(client, 'A', true);
    beginFavoriteChange(client, 'B', true);
    expect(readFavorite(client, 'A')).toBe(true);
    expect(readFavorite(client, 'B')).toBe(true);

    const a = settleFavoriteChange(client, 'A', { ok: false });
    expect(a).toMatchObject({ isLast: true, rolledBack: true, confirmed: false });
    expect(readFavorite(client, 'A')).toBe(false);
    // B vẫn đang chờ và vẫn hiện như vừa bấm.
    expect(readFavorite(client, 'B')).toBe(true);

    settleFavoriteChange(client, 'B', { ok: true, favorited: true });
    expect(readFavorite(client, 'B')).toBe(true);
  });

  it('bấm dồn dập: chỉ lượt cuối quyết, hoàn tác về sự thật đã xác nhận', () => {
    const client = new QueryClient();
    writeFavorite(client, 'A', false);

    beginFavoriteChange(client, 'A', true); // lượt 1: thích
    beginFavoriteChange(client, 'A', false); // lượt 2: bỏ
    beginFavoriteChange(client, 'A', true); // lượt 3: thích lại
    expect(readFavorite(client, 'A')).toBe(true);

    // Lượt 1 thành công — server giờ là true; chưa phải lượt cuối nên không hoàn tác gì.
    expect(settleFavoriteChange(client, 'A', { ok: true, favorited: true })).toMatchObject({
      isLast: false,
      rolledBack: false,
    });
    // Lượt 2 hỏng — vẫn chưa phải lượt cuối.
    expect(settleFavoriteChange(client, 'A', { ok: false }).isLast).toBe(false);
    expect(readFavorite(client, 'A')).toBe(true);
    // Lượt 3 hỏng — giao diện đang true == server true ⇒ không hoàn tác, không báo lỗi oan.
    expect(settleFavoriteChange(client, 'A', { ok: false })).toMatchObject({
      isLast: true,
      rolledBack: false,
      confirmed: true,
    });
    expect(readFavorite(client, 'A')).toBe(true);
    expect(hasPendingFavoriteChange(client, 'A')).toBe(false);
  });

  it('chuỗi hỏng hết ⇒ về trạng thái ban đầu, không về giá trị lạc quan của lượt trước', () => {
    const client = new QueryClient();
    writeFavorite(client, 'A', false);
    beginFavoriteChange(client, 'A', true);
    beginFavoriteChange(client, 'A', false);
    beginFavoriteChange(client, 'A', true);
    settleFavoriteChange(client, 'A', { ok: false });
    settleFavoriteChange(client, 'A', { ok: false });
    expect(settleFavoriteChange(client, 'A', { ok: false }).rolledBack).toBe(true);
    expect(readFavorite(client, 'A')).toBe(false);
  });

  it('bỏ thích: thẻ rời danh sách ngay; lỗi ⇒ quay về ĐÚNG trang + vị trí, tổng số khôi phục', () => {
    const client = new QueryClient();
    const read = seedList(client, [
      ['A', 'B'],
      ['C', 'D'],
    ]);

    beginFavoriteChange(client, 'C', false, true);
    expect(listIds(read())).toEqual([['A', 'B'], ['D']]);
    expect(read().pages[0]!.meta.total).toBe(3);
    expect(readFavorite(client, 'C')).toBe(false);

    settleFavoriteChange(client, 'C', { ok: false });
    expect(listIds(read())).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(read().pages[0]!.meta.total).toBe(4);
    expect(readFavorite(client, 'C')).toBe(true);
  });

  it('bỏ thích thành công ⇒ thẻ không quay lại', () => {
    const client = new QueryClient();
    const read = seedList(client, [['A', 'B']]);
    beginFavoriteChange(client, 'A', false, true);
    settleFavoriteChange(client, 'A', { ok: true, favorited: false });
    expect(listIds(read())).toEqual([['B']]);
  });
});

describe('createFavoriteStatusBatcher', () => {
  it('gom mọi lời hỏi cùng lượt thành MỘT request, trả đúng từng xe', async () => {
    const fetcher = vi.fn(async (ids: readonly string[]) => ({
      vehicleIds: ids.filter((id) => id !== 'B'),
    }));
    let run: () => void = () => {};
    const load = createFavoriteStatusBatcher(fetcher, (fn) => {
      run = fn;
    });

    const results = Promise.all([load('A'), load('B'), load('C'), load('A')]);
    run();
    await expect(results).resolves.toEqual([true, false, true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toEqual(['A', 'B', 'C']);
  });

  it('lỗi mạng ⇒ mọi lời hỏi trong lô đều bị từ chối (không âm thầm thành "chưa thích")', async () => {
    const load = createFavoriteStatusBatcher(
      async () => {
        throw new TypeError('offline');
      },
      (fn) => fn(),
    );
    await expect(load('A')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('parseFavoriteIntent', () => {
  it('nhận ý định hợp lệ, bỏ ý định quá hạn hoặc hỏng', () => {
    const now = 1_000_000_000;
    const ok = JSON.stringify({ vehicleId: 'V1', favorite: true, savedAt: now - 1000 });
    expect(parseFavoriteIntent(ok, now)).toEqual({
      vehicleId: 'V1',
      favorite: true,
      savedAt: now - 1000,
    });
    const stale = JSON.stringify({
      vehicleId: 'V1',
      favorite: true,
      savedAt: now - FAVORITE_INTENT_TTL_MS - 1,
    });
    expect(parseFavoriteIntent(stale, now)).toBeNull();
    expect(parseFavoriteIntent('{oops', now)).toBeNull();
    expect(parseFavoriteIntent(JSON.stringify({ vehicleId: 'V1' }), now)).toBeNull();
  });
});
