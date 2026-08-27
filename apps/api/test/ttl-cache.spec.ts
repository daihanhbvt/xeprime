import { stableCacheKey, TtlCache } from '../src/common/ttl-cache';

/**
 * `TtlCache` đứng trước những truy vấn đắt nhất của marketplace và của RBAC, nên ba tính chất
 * dưới đây không phải chi tiết cài đặt mà là lý do nó tồn tại: gộp lượt gọi đồng thời, không
 * cache lỗi, và có trần bộ nhớ. Không cần database.
 *
 * Chạy: pnpm --filter @xeprime/api test -- test/ttl-cache.spec.ts
 */
describe('TtlCache', () => {
  it('miss lần đầu, hit lần sau — chỉ chạy produce một lần', async () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 10 });
    let calls = 0;
    const produce = async () => {
      calls += 1;
      return 42;
    };

    expect(await cache.wrap('k', produce)).toBe(42);
    expect(await cache.wrap('k', produce)).toBe(42);
    expect(calls).toBe(1);
  });

  it('hết TTL thì tính lại', async () => {
    const cache = new TtlCache<number>({ ttlMs: 5, maxEntries: 10 });
    let calls = 0;
    const produce = async () => ++calls;

    expect(await cache.wrap('k', produce)).toBe(1);
    await new Promise((r) => setTimeout(r, 15));
    expect(await cache.wrap('k', produce)).toBe(2);
  });

  it('gộp lượt gọi: N request đồng thời cùng khoá chỉ chạy produce MỘT lần', async () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 });
    let calls = 0;
    let release: (v: string) => void = () => {};
    const produce = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };

    // 50 request bay cùng lúc — đúng hình dạng của một khoá nóng vừa hết hạn ở giờ cao điểm.
    const flying = Array.from({ length: 50 }, () => cache.wrap('hot', produce));
    release('xong');
    const results = await Promise.all(flying);

    expect(calls).toBe(1);
    expect(results.every((r) => r === 'xong')).toBe(true);
  });

  it('produce ném lỗi: lỗi tới mọi bên đang chờ và KHÔNG có gì được cache', async () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 10 });
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error('db down');
    };

    await expect(cache.wrap('k', failing)).rejects.toThrow('db down');
    expect(cache.size).toBe(0);

    // Lần sau phải thử lại thật, không phục vụ một lỗi đã cache.
    await expect(cache.wrap('k', failing)).rejects.toThrow('db down');
    expect(calls).toBe(2);
  });

  it('vượt trần thì loại khoá lâu không dùng nhất, khoá đang dùng được giữ', async () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    await cache.wrap('a', async () => 'A');
    await cache.wrap('b', async () => 'B');
    await cache.wrap('a', async () => 'A2'); // chạm lại 'a' → 'b' thành cũ nhất
    await cache.wrap('c', async () => 'C'); // vượt trần → loại 'b'

    expect(cache.size).toBe(2);
    expect(await cache.wrap('a', async () => 'khong-duoc-goi')).toBe('A');
    expect(await cache.wrap('b', async () => 'tinh-lai')).toBe('tinh-lai');
  });

  it('delete/clear bỏ đúng thứ cần bỏ', async () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 });
    await cache.wrap('a', async () => 'A');
    await cache.wrap('b', async () => 'B');

    cache.delete('a');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('stableCacheKey', () => {
  it('thứ tự tham số và thứ tự phần tử mảng không tạo ra khoá khác nhau', () => {
    const a = stableCacheKey({ bodyType: ['suv', 'sedan'], provinceCode: '79' });
    const b = stableCacheKey({ provinceCode: '79', bodyType: ['sedan', 'suv'] });
    expect(a).toBe(b);
  });

  it('vắng mặt, rỗng và false là một — không nở thêm khoá cho cùng một câu trả lời', () => {
    expect(stableCacheKey({ q: '', features: [], delivery: false, provinceCode: '79' })).toBe(
      stableCacheKey({ provinceCode: '79' }),
    );
    expect(stableCacheKey({ provinceCode: '79', province: undefined })).toBe(
      stableCacheKey({ provinceCode: '79' }),
    );
  });

  it('giá trị khác nhau thì khoá khác nhau', () => {
    expect(stableCacheKey({ provinceCode: '79' })).not.toBe(stableCacheKey({ provinceCode: '01' }));
    expect(stableCacheKey({ delivery: true })).not.toBe(stableCacheKey({ noCollateral: true }));
  });

  /*
   * Chiều NGƯỢC của tính ổn định: input BẨN không được giả mạo cấu trúc khoá. `q` là chuỗi tự do
   * từ URL công khai — nếu serialize bằng nối chuỗi `&`/`=`/`,` không escape thì
   * `?q=abc%26seats%3D4` ra đúng khoá của `?q=abc&seats=4`, tức ai cũng bơm được câu trả lời
   * sai cho mọi người trong suốt TTL (cache poisoning).
   */
  it('chuỗi tự do không giả mạo được cấu trúc khoá (chống cache poisoning)', () => {
    expect(stableCacheKey({ q: 'abc&seats=4' })).not.toBe(
      stableCacheKey({ q: 'abc', seats: '4' }),
    );
    expect(stableCacheKey({ q: 'abc', seats: 'x&brand=y' })).not.toBe(
      stableCacheKey({ q: 'abc', seats: 'x', brand: 'y' }),
    );
    // Phần tử mảng chứa dấu phẩy không được đụng khoá của hai phần tử tách rời.
    expect(stableCacheKey({ brand: ['a,b'] })).not.toBe(stableCacheKey({ brand: ['a', 'b'] }));
    // Chuỗi trông như JSON cũng không đụng khoá của giá trị thật.
    expect(stableCacheKey({ q: '["x"]' })).not.toBe(stableCacheKey({ q: 'x' }));
  });
});
