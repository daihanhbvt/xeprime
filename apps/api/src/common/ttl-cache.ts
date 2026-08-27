/**
 * Cache TTL trong tiến trình, có gộp-lượt-gọi (single flight).
 *
 * Vì sao tự viết thay vì `@nestjs/cache-manager`: thứ duy nhất cần ở đây là một `Map` có hạn
 * dùng, còn thứ THỰC SỰ quyết định ở cao điểm thì cache-manager không cho — gộp các lượt miss
 * xảy ra đồng thời trên cùng một khoá thành MỘT lượt tính. Không có nó, khoảnh khắc một khoá
 * nóng hết hạn là mọi request đang bay cùng lúc đều miss và cùng chạy lại y hệt một chuỗi query
 * (cache stampede) — đúng lúc hệ thống đang tải nặng nhất.
 *
 * Phạm vi: chỉ cho dữ liệu CÔNG KHAI, không phụ thuộc người dùng, và chấp nhận cũ trong vài
 * chục giây. Không bao giờ đưa dữ liệu có scope tenant/PII vào đây — cache nằm trong tiến trình
 * nên không có ranh giới nào ngăn một khoá đặt sai lộ dữ liệu sang request khác.
 *
 * Deploy MVP là MỘT tiến trình API trên một VPS (CLAUDE.md mục 3), nên cache trong bộ nhớ là
 * đúng tầng. Khi chạy nhiều instance, mỗi instance giữ bản sao riêng — vẫn đúng, chỉ là tỉ lệ
 * hit thấp hơn; lúc đó thay ruột bằng Redis ở đúng lớp này, chỗ gọi không phải đổi.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCacheOptions {
  /** Thời gian sống của một mục, tính bằng mili giây. */
  ttlMs: number;
  /** Trần số mục; vượt thì loại mục cũ nhất theo thứ tự chèn/chạm gần đây (LRU). */
  maxEntries: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  /**
   * Các lượt tính ĐANG bay, theo khoá. Đây là phần gộp-lượt-gọi: request thứ hai tới trong lúc
   * request thứ nhất còn đang chạy sẽ chờ chung một promise thay vì mở một lượt tính nữa.
   *
   * Khoá chỉ được giải phóng khi promise SETTLE — tức `produce` phải tự có timeout (query Prisma
   * có timeout của connection pool). Một `produce` treo vĩnh viễn sẽ ghim khoá đó lại và mọi
   * request sau cùng chờ nó; đừng đưa vào đây thao tác không có trần thời gian.
   */
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly options: TtlCacheOptions) {}

  /**
   * Trả giá trị đã cache còn hạn, hoặc chạy `produce` đúng MỘT lần cho mỗi khoá tại một thời điểm.
   *
   * `produce` ném lỗi thì lỗi được truyền cho mọi bên đang chờ và KHÔNG có gì được cache — cache
   * một lần lỗi nghĩa là nhân bản sự cố đó ra suốt cả TTL.
   */
  async wrap(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      // Chạm lại để mục đang được dùng trôi về cuối hàng đợi loại bỏ.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value;
    }
    if (hit) this.entries.delete(key);

    const flying = this.inFlight.get(key);
    if (flying) return flying;

    const pending = produce()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, pending);
    return pending;
  }

  private set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Bỏ một khoá (dùng khi nguồn dữ liệu của khoá đó vừa bị ghi). */
  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Bỏ toàn bộ — dùng khi một thay đổi ảnh hưởng diện rộng, không quy được về khoá nào. */
  clear(): void {
    this.entries.clear();
  }

  /** Số mục đang giữ (chỉ để test và quan sát). */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Khoá cache tất định từ một object tham số truy vấn.
 *
 * Hai tính chất, cả hai đều là an toàn chứ không chỉ hiệu năng:
 *
 *  1. Cùng ý nghĩa → CÙNG khoá (không thì cache gần như không bao giờ hit): key được sắp xếp
 *     (thứ tự tham số trên URL không có ý nghĩa), mảng được sắp xếp ("sedan,suv" hay
 *     "suv,sedan" là một), giá trị rỗng/undefined bị loại (vắng mặt và rỗng là một).
 *  2. Khác ý nghĩa → KHÁC khoá, kể cả với input BẨN. Serialize bằng `JSON.stringify` trên mảng
 *     cặp `[key, value]` chứ KHÔNG nối chuỗi thủ công: nối bằng `&`/`=`/`,` mà không escape thì
 *     một chuỗi tự do như `q` giả mạo được cấu trúc khoá (`?q=abc%26seats%3D4` đụng khoá của
 *     `?q=abc&seats=4`) — ai cũng bơm được câu trả lời sai cho mọi người trong suốt TTL.
 *
 * Ràng buộc có chủ đích: `false` bị loại như vắng mặt — đúng cho bộ lọc kiểu "cờ bật" (không
 * tích = không lọc, chính là mọi caller hiện tại). Caller nào phân biệt `false` với vắng mặt
 * (ví dụ một cờ mặc định `true`) thì KHÔNG dùng được hàm này as-is.
 */
export function stableCacheKey(input: Record<string, unknown>): string {
  const pairs: Array<[string, unknown]> = [];
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value == null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      pairs.push([key, [...value].map(String).sort()]);
      continue;
    }
    pairs.push([key, value]);
  }
  return JSON.stringify(pairs);
}
