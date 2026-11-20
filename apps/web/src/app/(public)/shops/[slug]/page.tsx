import { permanentRedirect } from 'next/navigation';
import { shopPath } from '@/constants/routes';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Link CŨ của trang gian hàng — `/shops/<slug>` (trước biên bản họp 19/11/2026). Trang thật nằm ở
 * `/<slug>`; chuyển hẳn (308) để link đã chia sẻ và chỉ mục tìm kiếm đi theo. Bộ lọc xe trên URL
 * (`?vehicleType=`, `?page=`…) đi theo cùng. Slug cũ dạng `<tên>-<mã>` được chính trang mới chuyển
 * tiếp sang slug gọn hiện tại.
 */
export default async function LegacyShopPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
      search.append(key, item);
    }
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  permanentRedirect(`${shopPath.detail(slug)}${suffix}`);
}
