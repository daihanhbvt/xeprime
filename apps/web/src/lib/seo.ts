import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app-name';
import { ZONE, zoneUrl } from '@/zones';

/**
 * Nền SEO của site KHÁCH (`xeprime.vn`) — URL tuyệt đối, môi trường được index, mô tả, Open Graph,
 * JSON-LD. Site partner/admin không có gì cho công cụ tìm kiếm (Caddy + `proxy.ts` gắn noindex).
 *
 * Module thuần (không `next/headers`): phần cần request nằm ở `seo.server.ts`.
 */

/** Gốc dự phòng khi chưa khai `NEXT_PUBLIC_WEB_MARKET_URL` — chỉ xảy ra ở máy dev. */
const DEV_SITE_URL = 'http://localhost:3000';

/** Độ dài mô tả Google hiển thị trên kết quả tìm kiếm; dài hơn là bị cắt giữa chữ. */
export const META_DESCRIPTION_MAX_LENGTH = 160;

/** Đường dẫn của sitemap — file convention `app/sitemap.ts`. */
export const SITEMAP_PATH = '/sitemap.xml';

/** Giá trị `APP_ENV` của máy production (`docs/deployment.md` §2.3). */
const PRODUCTION_APP_ENV = 'production';

/** Origin của site khách — `metadataBase` của mọi URL tương đối trong metadata. */
export function siteUrl(): URL {
  try {
    return new URL(zoneUrl(ZONE.MARKET) ?? DEV_SITE_URL);
  } catch {
    return new URL(DEV_SITE_URL);
  }
}

/** URL tuyệt đối của một đường dẫn (hoặc giữ nguyên một URL đã tuyệt đối, vd ảnh trên R2). */
export function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, siteUrl()).toString();
}

/**
 * Bản triển khai này có được công cụ tìm kiếm index không.
 *
 * Staging (`APP_ENV=staging`) là bản sao nội dung của production trên một tên miền khác — để nó
 * được index là tự tạo nội dung trùng lặp cạnh tranh với chính mình. Thiếu biến thì coi như
 * production: quên khai không được phép âm thầm gỡ cả site thật khỏi Google.
 */
export function isIndexableDeployment(): boolean {
  const env = process.env.APP_ENV?.trim();
  return !env || env === PRODUCTION_APP_ENV;
}

/** Gộp khoảng trắng và cắt ở ranh giới từ, tối đa `META_DESCRIPTION_MAX_LENGTH` ký tự. */
export function metaDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= META_DESCRIPTION_MAX_LENGTH) return flat;
  const cut = flat.slice(0, META_DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

interface OpenGraphInput {
  title: string;
  description?: string;
  /** Đường dẫn canonical của trang — `metadataBase` biến nó thành URL tuyệt đối. */
  path: string;
  images?: ReadonlyArray<string | null | undefined>;
}

/**
 * Open Graph ĐẦY ĐỦ của một trang. Next không trộn sâu `openGraph` của layout với của trang (trang
 * khai là thay cả khối), nên `siteName`/`type` phải đi kèm ở đây chứ không trông vào layout.
 */
export function openGraphFor({
  title,
  description,
  path,
  images = [],
}: OpenGraphInput): NonNullable<Metadata['openGraph']> {
  const urls = [...new Set(images.filter((url): url is string => Boolean(url)))];
  return {
    type: 'website',
    siteName: APP_NAME,
    title,
    description,
    url: path,
    images: urls.map((url) => ({ url })),
  };
}

/**
 * Chuỗi JSON-LD an toàn để đặt trong `<script>`: `<` được thoát để một tên xe/mô tả do người
 * dùng nhập kiểu `</script><script>…` không thể đóng thẻ và chèn mã.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
