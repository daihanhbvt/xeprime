import { redirect } from 'next/navigation';

import { ROUTES } from '@/constants/routes';

/**
 * Gốc khối "Đối tác" không phải một trang — người gõ tắt URL (hoặc cắt bớt một link) về danh
 * sách đứng đầu khối thay vì một trang 404.
 */
export default function AdminPartnersIndexPage(): never {
  redirect(ROUTES.MANAGE.ADMIN_PARTNER_SHOPS);
}
