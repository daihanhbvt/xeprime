import { headers } from 'next/headers';
import { ZONE, ZONE_MODE, zoneForHost, zoneMode } from '@/zones';
import { isIndexableDeployment } from './seo';

/**
 * Request này có đang xin nội dung SEO của site khách không — `robots.txt` và `sitemap.xml` là
 * file chung của MỘT Next app phục vụ ba host (ADR 0051), nên phải hỏi host.
 *
 * Chỉ host partner/admin được nhận diện CHẮC CHẮN mới bị coi là "không phải site khách". Host
 * không khớp khu nào (cấu hình URL lệch, truy cập bằng IP) rơi về site khách: đoán sai theo hướng
 * đó chỉ lộ một robots.txt thừa, đoán sai theo hướng kia là chặn crawl cả `xeprime.vn`.
 */
export async function servesMarketSeo(): Promise<boolean> {
  if (!isIndexableDeployment()) return false;
  if (zoneMode() !== ZONE_MODE.HOST) return true;
  const zone = zoneForHost((await headers()).get('host'));
  return zone !== ZONE.PARTNER && zone !== ZONE.ADMIN;
}
