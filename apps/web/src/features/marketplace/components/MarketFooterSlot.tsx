'use client';

import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { MarketFooter } from './MarketFooter';

/**
 * Route KHÔNG có chân trang: màn chiếm trọn khung nhìn và tự quản vùng cuộn của nó.
 *
 * Chat là màn đầu tiên như vậy ở khu khách. Một chân trang nằm dưới nó vừa vô nghĩa (không ai
 * cuộn qua một hộp thư để đọc liên kết chính sách) vừa có hại: nó làm tài liệu cao hơn khung
 * nhìn, và khi ô soạn tin đang có con trỏ mà nằm ngoài khung nhìn thì trình duyệt tự cuộn trang
 * để kéo nó vào — đúng cú nhảy xuống tận footer sau mỗi lần gửi tin.
 */
const FOOTERLESS_PATHS: readonly string[] = [ROUTES.CHAT];

/**
 * Quyết định "trang này có chân trang không".
 *
 * Tách thành client component nhỏ thay vì đổi `(public)/layout.tsx` thành client: layout ở đây
 * là Server Component có chủ đích (khu này cần SEO — xem docblock của nó). Component này vẫn
 * render ra HTML ở server như thường, chỉ phần đọc `pathname` là chạy ở client, nên các liên
 * kết trong chân trang không mất khả năng được index.
 */
export function MarketFooterSlot() {
  const pathname = usePathname();
  if (FOOTERLESS_PATHS.includes(pathname)) return null;
  return <MarketFooter />;
}
