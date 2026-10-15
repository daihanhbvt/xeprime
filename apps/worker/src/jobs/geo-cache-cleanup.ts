import { GEO_CACHE_TTL_DAYS } from '@xeprime/domain';
import type { PrismaClient } from '@xeprime/prisma';

export interface GeoCacheCleanupResult {
  geocodes: number;
  routes: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Xoá kết quả tra bản đồ đã quá {@link GEO_CACHE_TTL_DAYS} ngày — ADR 0061.
 *
 * Hai bảng này lớn lên theo mỗi địa chỉ mới, mỗi địa điểm được chọn và mỗi cặp điểm giao xe;
 * `GeoService` đã thôi ĐỌC bản ghi quá hạn, nhưng thôi đọc không phải là xoá. Không dọn thì
 * chúng phình vô hạn mà không màn hình nào để lộ ra điều đó.
 *
 * Xoá theo `fetched_at` (có index sẵn cho đúng việc này). Lần tra kế tiếp của cùng địa chỉ chỉ
 * tốn một request rồi ghi lại — `GeoService` vẫn là chỗ duy nhất ghi NỘI DUNG vào hai bảng.
 *
 * Cũng dọn luôn bản ghi của nhà cung cấp cũ (Geoapify, ADR 0037): tên nhà cung cấp nằm trong khoá
 * băm nên chúng không bao giờ được đọc lại, và sau một vòng TTL chúng tự rời khỏi bảng.
 */
export async function purgeExpiredGeoCache(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<GeoCacheCleanupResult> {
  const cutoff = new Date(now.getTime() - GEO_CACHE_TTL_DAYS * DAY_MS);

  const [geocodes, routes] = await Promise.all([
    prisma.geocodeCache.deleteMany({ where: { fetchedAt: { lt: cutoff } } }),
    prisma.geoRouteCache.deleteMany({ where: { fetchedAt: { lt: cutoff } } }),
  ]);

  return { geocodes: geocodes.count, routes: routes.count };
}
