import { redirect } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

/**
 * Hàng đợi bằng lái đã gỡ (ADR 0070) — mọi lượt nộp do hệ thống tự quyết, bằng lái xem trong hồ sơ
 * khách thuê. Giữ đường cũ để link/bookmark cũ không thành 404.
 */
export default function AdminDriverLicencesPage(): never {
  redirect(ROUTES.ADMIN.CUSTOMERS);
}
