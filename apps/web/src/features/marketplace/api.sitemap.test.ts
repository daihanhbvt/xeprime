import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSitemapListingIds, fetchSitemapShopSlugs } from './api';

function page(ids: string[], total: number) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id, slug: id })), meta: { total } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sitemap — quét danh sách công khai', () => {
  it('đi hết các trang, sort ổn định, bỏ mục trùng khi thứ tự xê dịch giữa hai trang', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const query = new URL(input, 'http://api').searchParams;
      expect(query.get('limit')).toBe('48');
      expect(query.get('sort')).toBe('newest');
      const n = Number(query.get('page'));
      return n === 1 ? page(['A', 'B'], 100) : n === 2 ? page(['B', 'C'], 100) : page(['D'], 100);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchSitemapListingIds()).toEqual(['A', 'B', 'C', 'D']);
    // 100 mục / 48 mỗi trang = 3 trang.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('một trang hỏng không làm hỏng cả sitemap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const n = Number(new URL(input, 'http://api').searchParams.get('page'));
        if (n === 2) return new Response('', { status: 500 });
        return page([`S${n}`], 120);
      }),
    );
    expect(await fetchSitemapShopSlugs()).toEqual(['S1', 'S3']);
  });

  it('API sập ở trang đầu thì trả rỗng thay vì ném lỗi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await fetchSitemapListingIds()).toEqual([]);
  });
});
