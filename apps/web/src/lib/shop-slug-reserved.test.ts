import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isReservedShopSlug, RESERVED_SHOP_SLUGS, slugifyShopName } from '@xeprime/types';
import { shopPath } from '@/constants/routes';

/**
 * Trang gian hàng nằm ở GỐC site khách — `xeprime.vn/<slug>` (biên bản họp 19/11/2026). Một route
 * gốc mới (`app/(public)/news`, thư mục `public/news`…) mà quên thêm vào `RESERVED_SHOP_SLUGS` thì
 * gian hàng tên "News" sẽ nhận đúng slug đó và che mất trang, hoặc ngược lại. Test này quét thư mục
 * thật để bắt việc quên đó ngay lúc thêm route.
 */
const APP_DIR = join(__dirname, '..', 'app');
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

const dirs = (path: string) =>
  readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/** Đoạn đường dẫn gốc thật: bỏ route group `(…)`, segment động `[…]` và thư mục riêng `_…`. */
function topLevelSegments(): string[] {
  const segments = new Set<string>();
  for (const name of dirs(APP_DIR)) {
    if (name.startsWith('(') && name.endsWith(')')) {
      for (const child of dirs(join(APP_DIR, name))) segments.add(child);
    } else {
      segments.add(name);
    }
  }
  for (const name of dirs(PUBLIC_DIR)) segments.add(name);
  return [...segments].filter(
    (s) => !s.startsWith('[') && !s.startsWith('_') && !s.startsWith('('),
  );
}

describe('slug gian hàng ở gốc site', () => {
  it('mọi route gốc và thư mục tĩnh đều nằm trong danh sách cấm', () => {
    const segments = topLevelSegments();
    // Phép quét thật sự thấy route — không thì danh sách rỗng cũng "đạt".
    expect(segments).toEqual(expect.arrayContaining(['search', 'trips', 'manage', 'admin', 'api']));
    const missing = segments.filter((segment) => !isReservedShopSlug(segment));
    expect(missing).toEqual([]);
  });

  it('link gian hàng là xeprime.vn/<slug>, không còn /shops', () => {
    expect(shopPath.detail('hanh-hue')).toBe('/hanh-hue');
  });

  it('"Hạnh Huế" ⇒ hanh-hue; tên cấm không phân biệt hoa thường', () => {
    expect(slugifyShopName('Hạnh Huế')).toBe('hanh-hue');
    expect(slugifyShopName('  Đà Nẵng  Car!! ')).toBe('da-nang-car');
    expect(isReservedShopSlug('Search')).toBe(true);
    expect(RESERVED_SHOP_SLUGS.has('hanh-hue')).toBe(false);
  });
});
